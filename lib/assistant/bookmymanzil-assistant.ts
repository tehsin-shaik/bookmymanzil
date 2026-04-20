import "server-only";

import { getGuestBookingDetail, getGuestBookingSummaries } from "@/lib/booking/reservations";
import { getSearchResults } from "@/lib/search/search-results";
import { canonicalizeRoomTypeLabel } from "@/lib/search/room-type-utils";
import { formatDateAsIso, startOfDay } from "@/lib/search/date-utils";
import { getGuestStayServiceRequestState } from "@/lib/service-requests";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { createOpenAITextResponse } from "@/lib/openai";
import { buildHotelSlug } from "@/lib/hotels/hotel-slug";

type HotelRecord = Record<string, unknown>;
type ReservationRecord = Record<string, unknown>;
type ServiceCategoryRecord = Record<string, unknown>;
type ServiceRequestRecord = Record<string, unknown>;
type RoomRecord = Record<string, unknown>;

type AssistantConversationTurn = {
  content: string;
  role: "assistant" | "user";
};

type AssistantAvailabilitySnapshot = {
  checkIn: string;
  checkOut: string;
  hotelName: string | null;
  issue: string | null;
  location: string;
  resultCount: number;
  roomType: string;
  summaries: Array<{
    city: string;
    hotelName: string;
    lowestPricePerNight: number;
    lowestTotalStayPrice: number;
    roomSummaries: Array<{
      availableRoomCount: number;
      label: string;
      totalStayPrice: number;
    }>;
    selectedRoomTypeSummary:
      | {
          availableRoomCount: number;
          label: string;
          totalStayPrice: number;
        }
      | null;
    url: string;
  }>;
};

type AssistantHotelSummary = {
  address: string;
  checkInTime: string;
  checkOutTime: string;
  city: string;
  contactEmail: string;
  contactNumber: string;
  description: string;
  name: string;
  slug: string;
};

type AssistantServiceRequestSummary = {
  categoryName: string;
  createdAt: string;
  description: string;
  preferredTime: string | null;
  reservationCode: string;
  roomNumber: string;
  status: string;
};

export async function buildBookMyManzilAssistantReply(input: {
  currentReservationCode?: string;
  guestName: string;
  guestUserId: string;
  history: AssistantConversationTurn[];
  language: string;
  message: string;
}) {
  const knowledge = await loadAssistantKnowledge({
    currentReservationCode: input.currentReservationCode,
    guestUserId: input.guestUserId,
    message: input.message,
  });

  const reply = await createOpenAITextResponse({
    maxOutputTokens: 550,
    messages: [
      {
        content: buildAssistantSystemPrompt({
          guestName: input.guestName,
          knowledge,
          language: input.language,
        }),
        role: "system",
      },
      ...input.history.map((turn) => ({
        content: turn.content,
        role: turn.role,
      })),
      {
        content: input.message,
        role: "user",
      },
    ],
  });

  return reply;
}

async function loadAssistantKnowledge(input: {
  currentReservationCode?: string;
  guestUserId: string;
  message: string;
}) {
  const queryClient = createAdminClient() ?? (await createClient());
  const hotels = await loadHotelSummaries(queryClient);
  const categories = await loadServiceCategories(queryClient);
  const detectedHotel = matchHotelFromMessage(input.message, hotels);
  const detectedCity = matchCityFromMessage(input.message, hotels);
  const detectedReservationCode = extractReservationCode(input.message) || normalizeReservationCode(input.currentReservationCode);
  const availability = await loadAvailabilitySnapshot({
    city: detectedHotel?.city || detectedCity,
    hotelName: detectedHotel?.name || null,
    message: input.message,
  });
  const guestBookingSummaries = await getGuestBookingSummaries();
  const guestServiceRequests = await loadGuestServiceRequestSummaries({
    guestUserId: input.guestUserId,
    queryClient,
  });
  const currentBookingDetail = detectedReservationCode
    ? await getGuestBookingDetail(detectedReservationCode)
    : { data: null, error: null };
  const currentStayServiceState = detectedReservationCode
    ? await getGuestStayServiceRequestState(detectedReservationCode)
    : { data: null, error: null };

  return {
    appGuidance: {
      bookingsPage: "/guest/bookings",
      reservationCodeUsage:
        "Reservation codes are shown after booking confirmation and are used to confirm guest check-in and check-out actions.",
      searchPage: "/search",
      serviceRequestGuidance:
        "Guests can submit service requests from a checked-in booking detail page under the Service Requests section.",
    },
    availability,
    currentBookingDetail: currentBookingDetail.data,
    currentBookingError: currentBookingDetail.error,
    currentStayServiceState: currentStayServiceState.data,
    currentStayServiceStateError: currentStayServiceState.error,
    guestBookings: guestBookingSummaries.data.slice(0, 6),
    guestBookingsError: guestBookingSummaries.error,
    guestServiceRequests: guestServiceRequests.slice(0, 8),
    hotels: detectedHotel ? [detectedHotel] : hotels.slice(0, 10),
    matchedCity: detectedHotel?.city || detectedCity || "",
    matchedHotelName: detectedHotel?.name || "",
    serviceCategories: categories,
    today: formatDateAsIso(new Date()),
  };
}

async function loadAvailabilitySnapshot(input: {
  city: string;
  hotelName: string | null;
  message: string;
}): Promise<AssistantAvailabilitySnapshot | null> {
  if (!looksLikeAvailabilityQuestion(input.message)) {
    return null;
  }

  const stay = extractStayWindow(input.message);

  if (!input.city || !stay) {
    return {
      checkIn: stay?.checkIn || "",
      checkOut: stay?.checkOut || "",
      hotelName: input.hotelName,
      issue: "The guest has asked about availability, but the city or stay dates are incomplete.",
      location: input.city,
      resultCount: 0,
      roomType: extractRoomTypeOption(input.message),
      summaries: [],
    };
  }

  const roomType = extractRoomTypeOption(input.message);
  const { dataIssue, queryState, results } = await getSearchResults(
    Promise.resolve({
      adults: "2",
      checkIn: stay.checkIn,
      checkOut: stay.checkOut,
      children: "0",
      location: input.city,
      roomType,
      rooms: "1",
    })
  );

  const scopedResults = input.hotelName
    ? results.filter((result) => normalizeText(result.hotelName) === normalizeText(input.hotelName || ""))
    : results;

  return {
    checkIn: stay.checkIn,
    checkOut: stay.checkOut,
    hotelName: input.hotelName,
    issue: dataIssue || (queryState.isValid ? null : queryState.issues.join(" ")),
    location: input.city,
    resultCount: scopedResults.length,
    roomType,
    summaries: scopedResults.slice(0, 5).map((result) => ({
      city: result.city,
      hotelName: result.hotelName,
      lowestPricePerNight: result.lowestPricePerNight,
      lowestTotalStayPrice: result.lowestTotalStayPrice,
      roomSummaries: result.roomSummaries.map((summary) => ({
        availableRoomCount: summary.availableRoomCount,
        label: summary.label,
        totalStayPrice: summary.totalStayPrice,
      })),
      selectedRoomTypeSummary: result.selectedRoomTypeSummary
        ? {
            availableRoomCount: result.selectedRoomTypeSummary.availableRoomCount,
            label: result.selectedRoomTypeSummary.label,
            totalStayPrice: result.selectedRoomTypeSummary.totalStayPrice,
          }
        : null,
      url: `/hotels/${result.slug}`,
    })),
  };
}

async function loadHotelSummaries(queryClient: unknown) {
  const { data: hotelRows } = await (queryClient as {
    from: (table: string) => {
      select: (columns: string) => PromiseLike<{ data: unknown[] | null }>;
    };
  })
    .from("hotels")
    .select("*");

  return (((hotelRows ?? []) as HotelRecord[]) ?? [])
    .map((record) => normalizeHotelSummary(record))
    .filter((hotel) => hotel.name);
}

async function loadServiceCategories(queryClient: unknown) {
  const { data: categoryRows } = await (queryClient as {
    from: (table: string) => {
      select: (columns: string) => {
        order: (column: string, options: { ascending: boolean }) => PromiseLike<{ data: unknown[] | null }>;
      };
    };
  })
    .from("service_categories")
    .select("*")
    .order("name", { ascending: true });

  return (((categoryRows ?? []) as ServiceCategoryRecord[]) ?? []).map((record) => ({
    id: asNumber(record.id),
    name: asString(record.name || "Service Request"),
  }));
}

async function loadGuestServiceRequestSummaries(input: {
  guestUserId: string;
  queryClient: unknown;
}) {
  const reservationClient = input.queryClient as {
    from: (table: string) => {
      select: (columns: string) => {
        eq: (column: string, value: unknown) => PromiseLike<{ data: unknown[] | null }>;
        in: (column: string, values: number[]) => PromiseLike<{ data: unknown[] | null }>;
      };
    };
  };
  const { data: reservationRows } = await reservationClient.from("reservations").select("*").eq("user_id", input.guestUserId);
  const reservations = (((reservationRows ?? []) as ReservationRecord[]) ?? []).map((record) => ({
    id: asNumber(record.id),
    reservationCode: asString(record.reservation_code),
    roomId: asNumber(record.room_id),
  }));
  const reservationIds = reservations.map((reservation) => reservation.id).filter((reservationId) => reservationId > 0);

  if (reservationIds.length === 0) {
    return [];
  }

  const { data: requestRows } = await reservationClient
    .from("service_requests")
    .select("*")
    .in("reservation_id", reservationIds);
  const requests = (((requestRows ?? []) as ServiceRequestRecord[]) ?? [])
    .map((record) => ({
      categoryId: asNumber(record.category_id),
      createdAt: asString(record.created_at),
      description: asString(record.description),
      preferredTime: asOptionalString(record.preferred_time),
      reservationId: asNumber(record.reservation_id),
      roomId: asNumber(record.room_id),
      status: asString(record.status || "pending"),
    }))
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  const roomIds = Array.from(new Set(requests.map((request) => request.roomId).filter((roomId) => roomId > 0)));
  const categoryIds = Array.from(new Set(requests.map((request) => request.categoryId).filter((categoryId) => categoryId > 0)));
  const [{ data: roomRows }, { data: categoryRows }] = await Promise.all([
    roomIds.length ? reservationClient.from("rooms").select("*").in("id", roomIds) : Promise.resolve({ data: [] as unknown[] }),
    categoryIds.length
      ? reservationClient.from("service_categories").select("*").in("id", categoryIds)
      : Promise.resolve({ data: [] as unknown[] }),
  ]);
  const roomsById = new Map((((roomRows ?? []) as RoomRecord[]) ?? []).map((record) => [asNumber(record.id), asString(record.room_number)]));
  const categoriesById = new Map(
    ((((categoryRows ?? []) as ServiceCategoryRecord[]) ?? []).map((record) => [asNumber(record.id), asString(record.name)]))
  );
  const reservationsById = new Map(reservations.map((reservation) => [reservation.id, reservation]));

  return requests.map((request) => ({
    categoryName: categoriesById.get(request.categoryId) || "Service Request",
    createdAt: request.createdAt,
    description: request.description,
    preferredTime: request.preferredTime,
    reservationCode: reservationsById.get(request.reservationId)?.reservationCode || "",
    roomNumber: roomsById.get(request.roomId) || "Pending",
    status: request.status,
  })) satisfies AssistantServiceRequestSummary[];
}

function buildAssistantSystemPrompt(input: {
  guestName: string;
  knowledge: Awaited<ReturnType<typeof loadAssistantKnowledge>>;
  language: string;
}) {
  return [
    `You are the BookMyManzil virtual assistant for authenticated guests.`,
    `Reply in ${input.language || "English"}.`,
    `Today is ${input.knowledge.today}.`,
    `You may only help with BookMyManzil hotel-related topics: hotel information, room availability, booking guidance, reservation guidance, service-request guidance, FAQs, and hotel recommendations.`,
    `Never claim you can create, cancel, or modify bookings, check-ins, check-outs, or service requests in this chat. You may only guide the guest to the right place in the app.`,
    `Use only the BookMyManzil context below. If something is missing from the context, say you don't have that information in BookMyManzil right now.`,
    `Never reveal data about other guests. You may only discuss the authenticated guest's own booking and service-request context provided below.`,
    `When the guest asks about availability, base the answer on the supplied availability snapshot and mention the exact dates if they were inferred.`,
    `When the guest asks about reservation codes, explain that the reservation code shown after booking is used for guest check-in and check-out confirmation.`,
    `If the guest asks something outside BookMyManzil scope, politely say you can only help with BookMyManzil hotel-related matters.`,
    `Keep answers concise, practical, and easy to scan.`,
    `The authenticated guest name is ${input.guestName}.`,
    `BookMyManzil context:\n${JSON.stringify(input.knowledge, null, 2)}`,
  ].join("\n\n");
}

function normalizeHotelSummary(record: HotelRecord): AssistantHotelSummary {
  return {
    address: asString(record.address),
    checkInTime: asOptionalTimeString(record.check_in_time),
    checkOutTime: asOptionalTimeString(record.check_out_time),
    city: asString(record.city || "UAE"),
    contactEmail: asString(record.contact_email),
    contactNumber: asString(record.contact_number),
    description: asString(record.description),
    name: asString(record.name || record.hotel_name || record.title),
    slug: buildHotelSlug({
      fallbackId: asOptionalString(record.id),
      name: asString(record.name || record.hotel_name || record.title),
      slug: asOptionalString(record.slug),
    }),
  };
}

function matchHotelFromMessage(message: string, hotels: AssistantHotelSummary[]) {
  const normalizedMessage = normalizeText(message);
  return hotels.find((hotel) => normalizedMessage.includes(normalizeText(hotel.name))) || null;
}

function matchCityFromMessage(message: string, hotels: AssistantHotelSummary[]) {
  const normalizedMessage = normalizeText(message);
  const cities = Array.from(new Set(hotels.map((hotel) => hotel.city).filter(Boolean)));
  return cities.find((city) => normalizedMessage.includes(normalizeText(city))) || "";
}

function extractReservationCode(message: string) {
  const match = message.match(/\bBMM-\d{8}-[A-Z0-9]+\b/i);
  return normalizeReservationCode(match?.[0]);
}

function normalizeReservationCode(value: string | undefined) {
  const normalized = asString(value).trim().toUpperCase();
  return normalized || "";
}

function looksLikeAvailabilityQuestion(message: string) {
  return /\b(available|availability|vacancy|vacancies|room available|rooms available|do you have)\b/i.test(message);
}

function extractRoomTypeOption(message: string) {
  const canonicalRoomType = canonicalizeRoomTypeLabel(message);

  if (!canonicalRoomType) {
    return "All";
  }

  if (normalizeText(canonicalRoomType).includes("deluxe")) {
    return "Deluxe";
  }

  if (normalizeText(canonicalRoomType).includes("family")) {
    return "Family";
  }

  if (normalizeText(canonicalRoomType).includes("executive")) {
    return "Executive";
  }

  if (normalizeText(canonicalRoomType).includes("standard")) {
    return "Standard";
  }

  return "All";
}

function extractStayWindow(message: string) {
  const normalizedMessage = message.toLowerCase();
  const isoMatches = Array.from(message.matchAll(/\b\d{4}-\d{2}-\d{2}\b/g)).map((match) => match[0]);

  if (isoMatches.length >= 2) {
    return {
      checkIn: isoMatches[0],
      checkOut: isoMatches[1],
    };
  }

  if (isoMatches.length === 1) {
    const parsedDate = new Date(`${isoMatches[0]}T00:00:00`);

    if (!Number.isNaN(parsedDate.getTime())) {
      return {
        checkIn: isoMatches[0],
        checkOut: formatDateAsIso(addDays(parsedDate, 1)),
      };
    }
  }

  const today = startOfDay(new Date());

  if (normalizedMessage.includes("next weekend")) {
    const saturday = getNextWeekendStart(today);
    return {
      checkIn: formatDateAsIso(saturday),
      checkOut: formatDateAsIso(addDays(saturday, 2)),
    };
  }

  if (normalizedMessage.includes("this weekend")) {
    const saturday = getCurrentOrUpcomingWeekendStart(today);
    return {
      checkIn: formatDateAsIso(saturday),
      checkOut: formatDateAsIso(addDays(saturday, 2)),
    };
  }

  if (/\btoday\b/i.test(normalizedMessage)) {
    return {
      checkIn: formatDateAsIso(today),
      checkOut: formatDateAsIso(addDays(today, 1)),
    };
  }

  if (/\btomorrow\b/i.test(normalizedMessage)) {
    const tomorrow = addDays(today, 1);
    return {
      checkIn: formatDateAsIso(tomorrow),
      checkOut: formatDateAsIso(addDays(tomorrow, 1)),
    };
  }

  return null;
}

function getNextWeekendStart(referenceDate: Date) {
  const normalizedReference = startOfDay(referenceDate);
  const saturdayOffset = (6 - normalizedReference.getDay() + 7) % 7;
  const upcomingSaturday = addDays(normalizedReference, saturdayOffset);
  return saturdayOffset === 0 ? addDays(upcomingSaturday, 7) : upcomingSaturday;
}

function getCurrentOrUpcomingWeekendStart(referenceDate: Date) {
  const normalizedReference = startOfDay(referenceDate);
  const saturdayOffset = (6 - normalizedReference.getDay() + 7) % 7;
  return addDays(normalizedReference, saturdayOffset);
}

function addDays(date: Date, days: number) {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + days);
  return nextDate;
}

function normalizeText(value: string) {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function asString(value: unknown) {
  return typeof value === "string" ? value : value == null ? "" : String(value);
}

function asOptionalString(value: unknown) {
  const normalized = asString(value).trim();
  return normalized || null;
}

function asOptionalTimeString(value: unknown) {
  const normalized = asString(value).trim();

  if (!normalized) {
    return "";
  }

  return normalized.slice(0, 5);
}

function asNumber(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}
