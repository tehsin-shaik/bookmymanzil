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
  id: number;
  name: string;
  roomTypes: string[];
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

type AssistantKnowledge = Awaited<ReturnType<typeof loadAssistantKnowledge>>;

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

  const ruleBasedReply = buildRuleBasedAssistantReply({
    guestName: input.guestName,
    knowledge,
    message: input.message,
  });

  if (ruleBasedReply) {
    return ruleBasedReply;
  }

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
  const scopedHotels = detectedHotel
    ? [detectedHotel]
    : detectedCity
      ? hotels.filter((hotel) => normalizeText(hotel.city) === normalizeText(detectedCity)).slice(0, 12)
      : hotels.slice(0, 12);

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
    hotels: scopedHotels,
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

  const hotels = (((hotelRows ?? []) as HotelRecord[]) ?? [])
    .map((record) => normalizeHotelSummary(record))
    .filter((hotel) => hotel.name);

  return attachHotelRoomTypes(queryClient, hotels);
}

async function attachHotelRoomTypes(queryClient: unknown, hotels: AssistantHotelSummary[]) {
  const hotelIds = hotels.map((hotel) => hotel.id).filter((hotelId) => hotelId > 0);

  if (!hotelIds.length) {
    return hotels;
  }

  const client = queryClient as {
    from: (table: string) => {
      select: (columns: string) => {
        in: (column: string, values: number[]) => PromiseLike<{ data: unknown[] | null }>;
      };
    };
  };

  const { data: hotelRoomTypeRows } = await client.from("hotel_room_types").select("*").in("hotel_id", hotelIds);
  const roomTypeIds = Array.from(
    new Set(
      (((hotelRoomTypeRows ?? []) as Record<string, unknown>[]) ?? [])
        .map((record) => asNumber(record.room_type_id))
        .filter((roomTypeId) => roomTypeId > 0)
    )
  );

  if (!roomTypeIds.length) {
    return hotels;
  }

  const { data: roomTypeRows } = await client.from("room_types").select("*").in("id", roomTypeIds);
  const roomTypeNamesById = new Map(
    (((roomTypeRows ?? []) as RoomRecord[]) ?? []).map((record) => [asNumber(record.id), asString(record.name)])
  );
  const roomTypesByHotelId = new Map<number, string[]>();

  for (const record of (((hotelRoomTypeRows ?? []) as Record<string, unknown>[]) ?? [])) {
    const hotelId = asNumber(record.hotel_id);
    const roomTypeName = roomTypeNamesById.get(asNumber(record.room_type_id));

    if (!hotelId || !roomTypeName) {
      continue;
    }

    const existingRoomTypes = roomTypesByHotelId.get(hotelId) ?? [];

    if (!existingRoomTypes.includes(roomTypeName)) {
      existingRoomTypes.push(roomTypeName);
      roomTypesByHotelId.set(hotelId, existingRoomTypes);
    }
  }

  return hotels.map((hotel) => ({
    ...hotel,
    roomTypes: roomTypesByHotelId.get(hotel.id) ?? [],
  }));
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

function buildRuleBasedAssistantReply(input: {
  guestName: string;
  knowledge: AssistantKnowledge;
  message: string;
}) {
  const normalizedMessage = normalizeText(input.message);

  return (
    buildHotelListReply(input.knowledge, normalizedMessage) ||
    buildHotelInfoReply(input.knowledge, normalizedMessage) ||
    buildAvailabilityReply(input.knowledge, normalizedMessage) ||
    buildBookingGuidanceReply(input.knowledge, normalizedMessage) ||
    buildReservationCodeReply(input.knowledge, normalizedMessage) ||
    buildServiceRequestReply(input.knowledge, normalizedMessage) ||
    buildStayHelpReply(input.guestName, input.knowledge, normalizedMessage) ||
    null
  );
}

function buildHotelListReply(knowledge: AssistantKnowledge, normalizedMessage: string) {
  const looksLikeHotelListQuestion =
    /\b(what hotels|which hotels|hotels do you have|show hotels|available hotels)\b/.test(normalizedMessage) ||
    (normalizedMessage.includes("tell me about hotels") && Boolean(knowledge.matchedCity));

  if (!looksLikeHotelListQuestion) {
    return null;
  }

  if (!knowledge.matchedCity) {
    const cityList = Array.from(new Set(knowledge.hotels.map((hotel) => hotel.city).filter(Boolean)));
    return cityList.length
      ? `I can help with BookMyManzil hotels across ${joinHumanList(cityList)}. Tell me the city you want, and I can list the hotels there.`
      : "I can help with BookMyManzil hotels, but I need a city or hotel name to narrow things down.";
  }

  const hotelNames = knowledge.hotels.map((hotel) => hotel.name).filter(Boolean);

  if (!hotelNames.length) {
    return `I couldn't find any BookMyManzil hotels in ${knowledge.matchedCity} right now.`;
  }

  return `In ${knowledge.matchedCity}, BookMyManzil currently shows ${joinHumanList(hotelNames)}. If you'd like, I can also help with room types or live availability for one of them.`;
}

function buildHotelInfoReply(knowledge: AssistantKnowledge, normalizedMessage: string) {
  const hotel = knowledge.hotels[0];

  if (!hotel || !knowledge.matchedHotelName) {
    if (/\b(room types|rooms do you offer|what rooms|types of rooms)\b/.test(normalizedMessage)) {
      const roomTypes = Array.from(
        new Set(knowledge.hotels.flatMap((candidateHotel) => candidateHotel.roomTypes).filter(Boolean))
      );

      return roomTypes.length
        ? `BookMyManzil currently offers room types such as ${joinHumanList(roomTypes)}. If you name a hotel or city, I can narrow that down further.`
        : "I can help with room types. If you tell me the hotel or city you want, I can check the options available there.";
    }

    if (/\b(check[ -]?in time|check[ -]?out time)\b/.test(normalizedMessage)) {
      return "I can help with check-in and check-out times. Just tell me which BookMyManzil hotel you want to check.";
    }

    return null;
  }

  if (/\b(check[ -]?in|check in)\b/.test(normalizedMessage) && hotel.checkInTime) {
    return `Check-in at ${hotel.name} starts at ${hotel.checkInTime}.${hotel.checkOutTime ? ` Check-out is at ${hotel.checkOutTime}.` : ""}`;
  }

  if (/\b(check[ -]?out|check out)\b/.test(normalizedMessage) && hotel.checkOutTime) {
    return `Check-out at ${hotel.name} is at ${hotel.checkOutTime}.${hotel.checkInTime ? ` Check-in starts at ${hotel.checkInTime}.` : ""}`;
  }

  if (/\b(room types|rooms do you offer|what rooms|types of rooms)\b/.test(normalizedMessage)) {
    if (!hotel.roomTypes.length) {
      return `I don't have a room-type list for ${hotel.name} right now, but I can still help check live availability for your dates.`;
    }

    return `${hotel.name} currently offers ${joinHumanList(hotel.roomTypes)}. I can also help check which of those are available for your dates.`;
  }

  if (/\b(address|where is|located|location)\b/.test(normalizedMessage) && hotel.address) {
    return `${hotel.name} is in ${hotel.city}. Address: ${hotel.address}.`;
  }

  if (/\b(contact|phone|email|number)\b/.test(normalizedMessage) && (hotel.contactNumber || hotel.contactEmail)) {
    const contactParts = [
      hotel.contactNumber ? `phone ${hotel.contactNumber}` : "",
      hotel.contactEmail ? `email ${hotel.contactEmail}` : "",
    ].filter(Boolean);
    return contactParts.length ? `You can reach ${hotel.name} via ${joinHumanList(contactParts)}.` : null;
  }

  if (/\b(tell me about|hotel info|about)\b/.test(normalizedMessage)) {
    const detailParts = [
      hotel.description || `${hotel.name} is one of our BookMyManzil stays in ${hotel.city}.`,
      hotel.checkInTime ? `Check-in starts at ${hotel.checkInTime}.` : "",
      hotel.checkOutTime ? `Check-out is at ${hotel.checkOutTime}.` : "",
      hotel.roomTypes.length ? `Room types include ${joinHumanList(hotel.roomTypes)}.` : "",
    ].filter(Boolean);
    return detailParts.join(" ");
  }

  return null;
}

function buildAvailabilityReply(knowledge: AssistantKnowledge, normalizedMessage: string) {
  const availability = knowledge.availability;

  if (!availability || !looksLikeAvailabilityQuestion(normalizedMessage)) {
    return null;
  }

  if (availability.issue) {
    if (!availability.location || !availability.checkIn) {
      return "I can check availability for you. Please share the city and stay date, for example: Abu Dhabi on 2026-04-20.";
    }

    return `I can help check availability in ${availability.location}, but I still need a complete stay window. Please share both dates, or use a single date like 2026-04-20 for a one-night stay.`;
  }

  if (availability.resultCount === 0 || !availability.summaries.length) {
    const roomTypeText = availability.roomType !== "All" ? `${availability.roomType} room ` : "";
    return `I couldn't find ${roomTypeText}availability in ${availability.location} for ${availability.checkIn} to ${availability.checkOut}. If you'd like, I can help you try different dates or a different room type.`;
  }

  const resultLines = availability.summaries.slice(0, 3).map((summary) => {
    const selectedSummary = summary.selectedRoomTypeSummary || summary.roomSummaries[0];
    const label = selectedSummary?.label || "Available rooms";
    const availableCount = selectedSummary?.availableRoomCount ?? 0;
    const totalStayPrice = selectedSummary?.totalStayPrice ?? summary.lowestTotalStayPrice;
    return `${summary.hotelName}: ${label}, ${availableCount} available, from AED ${formatPrice(totalStayPrice)} total stay`;
  });

  return `For ${availability.checkIn} to ${availability.checkOut}, I found availability in ${availability.location}: ${resultLines.join(" ")} You can continue from search into the hotel page to book the stay that suits you best.`;
}

function buildBookingGuidanceReply(knowledge: AssistantKnowledge, normalizedMessage: string) {
  if (/\b(how do i book|how to book|make a booking|book a room|book a stay)\b/.test(normalizedMessage)) {
    return `To make a booking, start on ${knowledge.appGuidance.searchPage}, choose your city, dates, guests, and room type, then open a hotel and continue to the booking step to confirm your stay.`;
  }

  if (/\b(where can i see my bookings|where are my bookings|see my bookings|my bookings)\b/.test(normalizedMessage)) {
    return `You can view your stays in ${knowledge.appGuidance.bookingsPage}. From there, open any booking to see the reservation code, stay details, and service requests.`;
  }

  return null;
}

function buildReservationCodeReply(knowledge: AssistantKnowledge, normalizedMessage: string) {
  if (!/\b(reservation code|booking code|confirmation code)\b/.test(normalizedMessage)) {
    return null;
  }

  if (knowledge.currentBookingDetail?.reservationCode) {
    return `Your reservation code for this stay is ${knowledge.currentBookingDetail.reservationCode}. ${knowledge.appGuidance.reservationCodeUsage}`;
  }

  const bookingCodes = knowledge.guestBookings
    .map((booking) => booking.reservationCode)
    .filter(Boolean)
    .slice(0, 3);

  if (bookingCodes.length === 1) {
    return `Your reservation code is ${bookingCodes[0]}. ${knowledge.appGuidance.reservationCodeUsage}`;
  }

  if (bookingCodes.length > 1) {
    return `Here are your most recent reservation codes: ${bookingCodes.join(", ")}. ${knowledge.appGuidance.reservationCodeUsage}`;
  }

  return `Your reservation code appears after booking confirmation and is also available from ${knowledge.appGuidance.bookingsPage} when you open a stay.`;
}

function buildServiceRequestReply(knowledge: AssistantKnowledge, normalizedMessage: string) {
  const looksLikeStatusQuestion =
    /\b(status of my request|status of my service request|my request status|my service request|service request status)\b/.test(
      normalizedMessage
    );

  if (looksLikeStatusQuestion) {
    const currentStayRequests = knowledge.currentStayServiceState?.requests ?? [];
    const requestPool = currentStayRequests.length ? currentStayRequests : knowledge.guestServiceRequests;

    if (!requestPool.length) {
      return "I couldn't find any service requests on your account right now. Once you are checked in, you can submit one from the Service Requests section on your booking detail page.";
    }

    const requestSummaries = requestPool.slice(0, 3).map((request) => {
      const roomText = request.roomNumber ? ` for room ${request.roomNumber}` : "";
      return `${request.categoryName}: ${humanizeStatus(request.status)}${roomText}`;
    });

    return `Here is the latest status I can see: ${requestSummaries.join(". ")}.`;
  }

  const looksLikeHowToRequest =
    /\b(housekeeping|room service|maintenance|service request)\b/.test(normalizedMessage) &&
    /\b(how do i|how can i|can i request|where do i|where can i|request housekeeping|request room service|request maintenance)\b/.test(
      normalizedMessage
    );

  if (looksLikeHowToRequest) {
    const categoryNames = knowledge.serviceCategories.map((category) => category.name).filter(Boolean);
    const categoryText = categoryNames.length ? ` You can choose from ${joinHumanList(categoryNames)}.` : "";
    return `${knowledge.appGuidance.serviceRequestGuidance}${categoryText}`;
  }

  return null;
}

function buildStayHelpReply(guestName: string, knowledge: AssistantKnowledge, normalizedMessage: string) {
  if (!/\b(help me with my stay|help with my stay|help me with my booking|what can you help with)\b/.test(normalizedMessage)) {
    return null;
  }

  const currentStay = knowledge.currentBookingDetail;
  const staySummary = currentStay
    ? `Your current booking is ${currentStay.hotelName} from ${currentStay.checkIn} to ${currentStay.checkOut}.`
    : "";

  return `I can help with hotel information, live availability, booking guidance, reservation codes, and service-request guidance, ${guestName}.${staySummary ? ` ${staySummary}` : ""} You can ask about your bookings, check-in times, room types, or the status of your service requests.`;
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
    id: asNumber(record.id),
    name: asString(record.name || record.hotel_name || record.title),
    roomTypes: [],
    slug: buildHotelSlug({
      fallbackId: asOptionalString(record.id),
      name: asString(record.name || record.hotel_name || record.title),
      slug: asOptionalString(record.slug),
    }),
  };
}

function matchHotelFromMessage(message: string, hotels: AssistantHotelSummary[]) {
  const normalizedMessage = normalizeText(message);
  const exactMatch = hotels.find((hotel) => normalizedMessage.includes(normalizeText(hotel.name)));

  if (exactMatch) {
    return exactMatch;
  }

  let bestMatch: AssistantHotelSummary | null = null;
  let bestScore = 0;

  for (const hotel of hotels) {
    const score = getHotelMessageMatchScore(normalizedMessage, hotel);

    if (score > bestScore) {
      bestMatch = hotel;
      bestScore = score;
    }
  }

  return bestScore >= 2 ? bestMatch : null;
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
  const explicitIsoRangeMatch = message.match(
    /\b(\d{4}-\d{2}-\d{2})\b\s*(?:to|through|until|\-|–|—)\s*\b(\d{4}-\d{2}-\d{2})\b/i
  );
  const isoMatches = Array.from(message.matchAll(/\b\d{4}-\d{2}-\d{2}\b/g)).map((match) => match[0]);
  const writtenDateMatches = Array.from(
    message.matchAll(
      /\b(?:january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2}(?:,\s*|\s+)\d{4}\b/gi
    )
  ).map((match) => match[0]);

  if (explicitIsoRangeMatch) {
    return {
      checkIn: explicitIsoRangeMatch[1],
      checkOut: explicitIsoRangeMatch[2],
    };
  }

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

  if (writtenDateMatches.length >= 2) {
    const parsedDates = writtenDateMatches
      .map((value) => new Date(value))
      .filter((value) => !Number.isNaN(value.getTime()));

    if (parsedDates.length >= 2) {
      return {
        checkIn: formatDateAsIso(startOfDay(parsedDates[0])),
        checkOut: formatDateAsIso(startOfDay(parsedDates[1])),
      };
    }
  }

  if (writtenDateMatches.length === 1) {
    const parsedDate = new Date(writtenDateMatches[0]);

    if (!Number.isNaN(parsedDate.getTime())) {
      return {
        checkIn: formatDateAsIso(startOfDay(parsedDate)),
        checkOut: formatDateAsIso(addDays(startOfDay(parsedDate), 1)),
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

function getHotelMessageMatchScore(normalizedMessage: string, hotel: AssistantHotelSummary) {
  const cityTokens = normalizeText(hotel.city)
    .split(" ")
    .filter((token) => token.length > 2);
  const tokens = normalizeText(hotel.name)
    .split(" ")
    .filter(
      (token) =>
        token.length > 2 &&
        !["hotel", "resort", "the"].includes(token) &&
        !cityTokens.includes(token)
    );

  if (!tokens.length) {
    return 0;
  }

  return tokens.reduce((score, token) => score + (normalizedMessage.includes(token) ? 1 : 0), 0);
}

function joinHumanList(items: string[]) {
  if (items.length === 0) {
    return "";
  }

  if (items.length === 1) {
    return items[0];
  }

  if (items.length === 2) {
    return `${items[0]} and ${items[1]}`;
  }

  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

function humanizeStatus(status: string) {
  return status.replace(/_/g, " ");
}

function formatPrice(value: number) {
  return new Intl.NumberFormat("en-AE", {
    maximumFractionDigits: 0,
  }).format(value);
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
