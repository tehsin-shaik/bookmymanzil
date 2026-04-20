import "server-only";

import { getDateAwareRoomAvailabilityState } from "@/lib/booking/availability";
import { buildHotelSlug } from "@/lib/hotels/hotel-slug";
import {
  canonicalizeRoomTypeLabel,
  getRequestedRoomTypeLabel,
  matchesRequestedRoomType as matchesRequestedRoomTypeLabel,
  normalizeRoomTypeLabel,
} from "@/lib/search/room-type-utils";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { parseSearchQuery, type SearchQuery } from "@/lib/search/search-query";

export type SearchQueryState = {
  isValid: boolean;
  issues: string[];
  query: SearchQuery;
};

export type SearchResultRoomSummary = {
  availableRoomCount: number;
  label: string;
  pricePerNight: number;
  totalStayPrice: number;
};

export type SearchResultItem = {
  id: string;
  slug: string;
  imageUrl: string | null;
  city: string;
  hotelName: string;
  description: string;
  lowestPricePerNight: number;
  lowestTotalStayPrice: number;
  roomSummaries: SearchResultRoomSummary[];
  selectedRoomTypeSummary: SearchResultRoomSummary | null;
};

type HotelRecord = Record<string, unknown>;
type RoomTypeRecord = Record<string, unknown>;
type RoomRecord = Record<string, unknown>;
type ReservationRecord = Record<string, unknown>;
type RoomBlockRecord = Record<string, unknown>;

type NormalizedHotel = ReturnType<typeof normalizeHotel>;
type NormalizedRoomType = ReturnType<typeof normalizeRoomType>;
type NormalizedRoom = ReturnType<typeof normalizeRoom>;

export async function getSearchResults(
  rawParams: Promise<Record<string, string | string[] | undefined>>
): Promise<{
  queryState: SearchQueryState;
  results: SearchResultItem[];
  dataIssue: string | null;
}> {
  // This is the main room-search entry point. It combines date filters, room-type filters,
  // and the overlap-aware availability snapshot before the search page renders hotel cards.
  const params = await rawParams;
  const queryState = parseSearchQuery(params);

  if (!queryState.isValid) {
    return {
      queryState,
      results: [],
      dataIssue: null,
    };
  }

  const supabase = await createClient();
  const privilegedSupabase = createAdminClient() ?? supabase;

  const [
    { data: hotelsData, error: hotelsError },
    { data: roomTypesData, error: roomTypesError },
    { data: roomsData, error: roomsError },
    { data: reservationsData, error: reservationsError },
    { data: roomBlocksData, error: roomBlocksError },
  ] = await Promise.all([
    supabase.from("hotels").select("*"),
    supabase.from("room_types").select("*"),
    supabase.from("rooms").select("*"),
    privilegedSupabase.from("reservations").select("*"),
    privilegedSupabase.from("room_blocks").select("*"),
  ]);

  if (hotelsError || roomTypesError || roomsError || reservationsError || roomBlocksError) {
    return {
      queryState,
      results: [],
      dataIssue: "We couldn't load stay availability just now. Please try again in a moment.",
    };
  }

  const dateAwareAvailability = getDateAwareRoomAvailabilityState({
    checkInDate: queryState.query.checkIn,
    checkOutDate: queryState.query.checkOut,
    reservations: (reservationsData ?? []) as ReservationRecord[],
    roomBlocks: (roomBlocksData ?? []) as RoomBlockRecord[],
    rooms: (roomsData ?? []) as RoomRecord[],
  });

  const results = buildSearchResults({
    availableRoomIds: dateAwareAvailability.availableRoomIds,
    hotels: (hotelsData ?? []) as HotelRecord[],
    query: queryState.query,
    roomTypes: (roomTypesData ?? []) as RoomTypeRecord[],
    rooms: (roomsData ?? []) as RoomRecord[],
  });

  return {
    queryState,
    results,
    dataIssue: null,
  };
}

function buildSearchResults({
  availableRoomIds,
  hotels,
  query,
  roomTypes,
  rooms,
}: {
  availableRoomIds: Set<string>;
  hotels: HotelRecord[];
  query: SearchQuery;
  roomTypes: RoomTypeRecord[];
  rooms: RoomRecord[];
}) {
  const normalizedHotels = hotels.map(normalizeHotel).filter((hotel) => hotel.id && hotel.name);
  const normalizedRoomTypes = roomTypes
    .map(normalizeRoomType)
    .filter((roomType) => (roomType.id || roomType.label) && roomType.label);
  const normalizedRooms = rooms.map(normalizeRoom).filter((room) => room.id && room.hotelId);

  const filteredHotels = normalizedHotels.filter((hotel) => {
    if (query.location === "UAE") {
      return true;
    }

    return matchesLocation(hotel.city, query.location);
  });

  // This creates one result card per hotel and attaches room summaries to that hotel.
  return filteredHotels
    .map((hotel) => {
      const hotelRooms = normalizedRooms.filter((room) => room.hotelId === hotel.id);
      const hotelRoomTypes = normalizedRoomTypes.filter((roomType) => !roomType.hotelId || roomType.hotelId === hotel.id);
      const roomSummaries = buildHotelRoomSummaries({
        availableRoomIds,
        hotel,
        query,
        rooms: hotelRooms,
        roomTypes: hotelRoomTypes,
      });

      const availableRoomSummaries = roomSummaries.filter((summary) => summary.availableRoomCount > 0);

      if (roomSummaries.length === 0 || availableRoomSummaries.length === 0) {
        return null;
      }

      const selectedRoomTypeSummary =
        query.roomType === "All"
          ? null
          : roomSummaries.find((summary) => matchesRequestedRoomTypeLabel(summary.label, query.roomType)) || null;

      if (query.roomType !== "All" && (!selectedRoomTypeSummary || selectedRoomTypeSummary.availableRoomCount < 1)) {
        return null;
      }

      const visibleSummaries =
        query.roomType === "All" ? availableRoomSummaries : [selectedRoomTypeSummary].filter(Boolean);
      const lowestPricePerNight = Math.min(...visibleSummaries.map((summary) => summary!.pricePerNight));
      const lowestTotalStayPrice = Math.min(...visibleSummaries.map((summary) => summary!.totalStayPrice));

      return {
        city: hotel.city,
        description: hotel.description,
        hotelName: hotel.name,
        id: hotel.id,
        imageUrl: hotel.imageUrl,
        lowestPricePerNight,
        lowestTotalStayPrice,
        roomSummaries,
        selectedRoomTypeSummary,
        slug: hotel.slug,
      } satisfies SearchResultItem;
    })
    .filter((item): item is SearchResultItem => Boolean(item))
    .sort((left, right) => left.lowestPricePerNight - right.lowestPricePerNight);
}

function buildHotelRoomSummaries({
  availableRoomIds,
  hotel,
  query,
  roomTypes,
  rooms,
}: {
  availableRoomIds: Set<string>;
  hotel: NormalizedHotel;
  query: SearchQuery;
  roomTypes: NormalizedRoomType[];
  rooms: NormalizedRoom[];
}) {
  // Search-by-type happens here: each hotel's room inventory is grouped into room-type summaries,
  // then filtered down to the requested room type when the guest is not in "All" mode.
  const groups = new Map<string, SearchResultRoomSummary>();
  const requestedRoomTypeLabel = getRequestedRoomTypeLabel(query.roomType);

  for (const room of rooms) {
    const matchingRoomType = findMatchingRoomType(roomTypes, room.roomTypeId, room.roomTypeName);
    const label = matchingRoomType?.canonicalLabel || room.canonicalRoomTypeLabel || room.roomTypeName || "Room";
    const key = normalizeRoomTypeLabel(label);

    if (requestedRoomTypeLabel && normalizeRoomTypeLabel(label) !== normalizeRoomTypeLabel(requestedRoomTypeLabel)) {
      continue;
    }

    const pricePerNight = resolvePricePerNight(room, matchingRoomType, hotel);
    const existingSummary = groups.get(key);
    const isDateAvailable = availableRoomIds.has(room.id);

    if (existingSummary) {
      existingSummary.availableRoomCount += isDateAvailable ? 1 : 0;
      existingSummary.pricePerNight = Math.min(existingSummary.pricePerNight, pricePerNight);
      existingSummary.totalStayPrice = existingSummary.pricePerNight * query.nights;
      continue;
    }

    groups.set(key, {
      availableRoomCount: isDateAvailable ? 1 : 0,
      label,
      pricePerNight,
      totalStayPrice: pricePerNight * query.nights,
    });
  }

  return Array.from(groups.values())
    .sort((left, right) => left.pricePerNight - right.pricePerNight);
}

function findMatchingRoomType(
  roomTypes: NormalizedRoomType[],
  roomTypeId: string | null,
  roomTypeName: string
) {
  return roomTypes.find((roomType) => {
    if (roomTypeId && roomType.id && roomType.id === roomTypeId) {
      return true;
    }

    return roomType.canonicalKey === normalizeRoomTypeLabel(canonicalizeRoomTypeLabel(roomTypeName) || roomTypeName);
  });
}

function resolvePricePerNight(
  room: NormalizedRoom,
  roomType: NormalizedRoomType | undefined,
  hotel: NormalizedHotel
) {
  if (room.pricePerNight > 0) {
    return room.pricePerNight;
  }

  if (roomType?.pricePerNight) {
    return roomType.pricePerNight;
  }

  return hotel.startingPrice;
}

function normalizeHotel(record: HotelRecord) {
  return {
    city: asString(record.city || record.location || record.destination || "UAE"),
    description: asString(
      record.description ||
        record.short_description ||
        record.summary ||
        "A refined hospitality address designed for elevated stays."
    ),
    id: asString(record.id),
    imageUrl: normalizeImageUrl(
      record.hero_image_url || record.image_url || record.image || record.hero_image || record.cover_image
    ),
    name: asString(record.name || record.hotel_name || record.title),
    slug: buildHotelSlug({
      fallbackId: asOptionalString(record.id),
      name: asString(record.name || record.hotel_name || record.title),
      slug: asOptionalString(record.slug || record.hotel_slug),
    }),
    startingPrice: asNumber(record.starting_price || record.price_from || record.base_price || 0),
  };
}

function normalizeRoomType(record: RoomTypeRecord) {
  const rawLabel = asString(record.name || record.room_type || record.label || record.type);
  const canonicalLabel = canonicalizeRoomTypeLabel(rawLabel) || rawLabel;

  return {
    canonicalKey: normalizeRoomTypeLabel(canonicalLabel),
    canonicalLabel,
    hotelId: asOptionalString(record.hotel_id),
    id: asOptionalString(record.id),
    label: canonicalLabel,
    pricePerNight: asNumber(
      record.price_per_night || record.base_price || record.nightly_rate || record.price || 0
    ),
  };
}

function normalizeRoom(record: RoomRecord) {
  const status = asString(record.status || record.availability_status || "available").toLowerCase();
  const rawRoomTypeName = asString(record.room_type || record.type || record.category || record.name);
  const canonicalRoomTypeLabel = canonicalizeRoomTypeLabel(rawRoomTypeName);

  return {
    canonicalRoomTypeLabel,
    hotelId: asString(record.hotel_id),
    id: asString(record.id),
    isAvailable: !["booked", "occupied", "maintenance", "inactive"].includes(status),
    pricePerNight: asNumber(record.price_per_night || record.base_price || record.nightly_rate || record.price || 0),
    roomTypeId: asOptionalString(record.room_type_id),
    roomTypeName: rawRoomTypeName,
  };
}

function asString(value: unknown) {
  return typeof value === "string" ? value : value == null ? "" : String(value);
}

function asOptionalString(value: unknown) {
  const normalized = asString(value).trim();
  return normalized ? normalized : null;
}

function normalizeImageUrl(value: unknown) {
  const normalized = asOptionalString(value);

  if (!normalized) {
    return null;
  }

  if (normalized.startsWith("http://") || normalized.startsWith("https://")) {
    return normalized;
  }

  return null;
}

function asNumber(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function matchesLocation(city: string, location: string) {
  const normalizedCity = city.toLowerCase().trim();
  const normalizedLocation = location.toLowerCase().trim();

  return (
    normalizedCity === normalizedLocation ||
    normalizedCity.includes(normalizedLocation) ||
    normalizedLocation.includes(normalizedCity)
  );
}
