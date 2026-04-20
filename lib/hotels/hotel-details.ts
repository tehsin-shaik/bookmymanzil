import "server-only";

import { getDateAwareRoomAvailabilityState } from "@/lib/booking/availability";
import { buildHotelSlug } from "@/lib/hotels/hotel-slug";
import { parseSearchQuery, type SearchQuery } from "@/lib/search/search-query";
import {
  canonicalizeRoomTypeLabel,
  getRequestedRoomTypeLabel,
  normalizeRoomTypeLabel,
} from "@/lib/search/room-type-utils";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type HotelDetailsQueryState = {
  isValid: boolean;
  issues: string[];
  query: SearchQuery;
};

export type HotelDetailsRecord = {
  id: string;
  slug: string;
  name: string;
  city: string;
  address: string;
  description: string;
  imageUrl: string | null;
  checkInTime: string;
  checkOutTime: string;
};

export type HotelRoomOption = {
  key: string;
  label: string;
  roomTypeId: string | null;
  roomTypeName: string;
  imageUrl: string | null;
  description: string;
  availableRoomCount: number;
  pricePerNight: number;
  totalStayPrice: number;
  occupancyText: string | null;
  canBook: boolean;
  validationMessage: string | null;
};

type HotelRecord = Record<string, unknown>;
type RoomTypeRecord = Record<string, unknown>;
type RoomRecord = Record<string, unknown>;
type HotelRoomTypeRecord = Record<string, unknown>;
type ReservationRecord = Record<string, unknown>;
type RoomBlockRecord = Record<string, unknown>;

type NormalizedHotel = ReturnType<typeof normalizeHotel>;
type NormalizedRoom = ReturnType<typeof normalizeRoom>;
type NormalizedRoomType = ReturnType<typeof normalizeRoomType>;
type NormalizedHotelRoomType = ReturnType<typeof normalizeHotelRoomType>;

export async function getHotelDetailsPageData({
  rawSearchParams,
  slug,
}: {
  rawSearchParams: Promise<Record<string, string | string[] | undefined>>;
  slug: string;
}): Promise<{
  dataIssue: string | null;
  hotel: HotelDetailsRecord | null;
  queryState: HotelDetailsQueryState;
  roomOptions: HotelRoomOption[];
}> {
  const queryState = parseSearchQuery(await rawSearchParams);
  const supabase = await createClient();
  const adminSupabase = createAdminClient();
  const { data: hotelsData, error: hotelsError } = await supabase.from("hotels").select("*");

  if (hotelsError) {
    return {
      dataIssue: "We couldn't load this hotel right now. Please try again in a moment.",
      hotel: null,
      queryState,
      roomOptions: [],
    };
  }

  const hotels = ((hotelsData ?? []) as HotelRecord[]).map(normalizeHotel);
  const hotel = hotels.find((item) => item.slug === slug);

  if (!hotel) {
    return {
      dataIssue: null,
      hotel: null,
      queryState,
      roomOptions: [],
    };
  }

  const [
    { data: roomTypesData, error: roomTypesError },
    hotelRoomTypesResult,
    { data: roomsData, error: roomsError },
    { data: reservationsData, error: reservationsError },
    { data: roomBlocksData, error: roomBlocksError },
  ] = await Promise.all([
    supabase.from("room_types").select("*"),
    (adminSupabase ?? supabase).from("hotel_room_types").select("*").eq("hotel_id", hotel.id),
    supabase.from("rooms").select("*").eq("hotel_id", hotel.id),
    (adminSupabase ?? supabase).from("reservations").select("*"),
    (adminSupabase ?? supabase).from("room_blocks").select("*"),
  ]);
  const { data: hotelRoomTypesData, error: hotelRoomTypesError } = hotelRoomTypesResult;

  if (roomTypesError || hotelRoomTypesError || roomsError || reservationsError || roomBlocksError) {
    return {
      dataIssue: "We couldn't load the available room options right now. Please try again in a moment.",
      hotel: toHotelDetailsRecord(hotel),
      queryState,
      roomOptions: [],
    };
  }

  // This keeps the hotel page stable even if someone lands here without a full search context.
  const effectiveQuery = queryState.isValid
    ? queryState.query
    : {
        ...queryState.query,
        nights: Math.max(queryState.query.nights, 1),
      };

  const roomTypes = ((roomTypesData ?? []) as RoomTypeRecord[])
    .map(normalizeRoomType)
    .filter((roomType) => !roomType.hotelId || roomType.hotelId === hotel.id);
  const roomTypesById = new Map(roomTypes.filter((roomType) => roomType.id).map((roomType) => [roomType.id, roomType]));
  const hotelRoomTypes = ((hotelRoomTypesData ?? []) as HotelRoomTypeRecord[])
    .map((record) => normalizeHotelRoomType(record, roomTypesById.get(asOptionalString(record.room_type_id) || "") ?? null))
    .filter((roomType) => roomType.hotelId === hotel.id);
  const rooms = ((roomsData ?? []) as RoomRecord[]).map(normalizeRoom).filter((room) => room.hotelId === hotel.id);

  logHotelRoomTypeFetchDebug({
    adminClientEnabled: Boolean(adminSupabase),
    hotel,
    hotelRoomTypes,
    rawHotelRoomTypes: (hotelRoomTypesData ?? []) as HotelRoomTypeRecord[],
    rooms,
  });
  const dateAwareAvailability = queryState.isValid
    ? getDateAwareRoomAvailabilityState({
        checkInDate: effectiveQuery.checkIn,
        checkOutDate: effectiveQuery.checkOut,
        reservations: (reservationsData ?? []) as ReservationRecord[],
        roomBlocks: (roomBlocksData ?? []) as RoomBlockRecord[],
        rooms: (roomsData ?? []) as RoomRecord[],
      })
    : null;

  // These room cards are date-aware: the visible available counts and Book Now state
  // come from the same overlap-aware availability model used by the search flow.
  const roomOptions = buildHotelRoomOptions({
    availableRoomIds: dateAwareAvailability?.availableRoomIds ?? null,
    hotel,
    hotelRoomTypes,
    isSearchContextValid: queryState.isValid,
    query: effectiveQuery,
    roomTypes,
    rooms,
  });

  return {
    dataIssue: null,
    hotel: toHotelDetailsRecord(hotel),
    queryState,
    roomOptions,
  };
}

function buildHotelRoomOptions({
  availableRoomIds,
  hotel,
  hotelRoomTypes,
  isSearchContextValid,
  query,
  roomTypes,
  rooms,
}: {
  availableRoomIds: Set<string> | null;
  hotel: NormalizedHotel;
  hotelRoomTypes: NormalizedHotelRoomType[];
  isSearchContextValid: boolean;
  query: SearchQuery;
  roomTypes: NormalizedRoomType[];
  rooms: NormalizedRoom[];
}) {
  const groups = new Map<
    string,
    {
      availableRoomCount: number;
      description: string;
      imageUrl: string | null;
      label: string;
      maxCapacity: number;
      pricePerNight: number;
      roomTypeId: string | null;
      roomTypeName: string;
    }
  >();
  const requestedRoomTypeLabel = getRequestedRoomTypeLabel(query.roomType);
  const selectedRooms = Math.max(query.rooms, 1);
  const totalGuests = query.adults + query.children;

  for (const room of rooms) {
    const matchingRoomType = findMatchingRoomType(roomTypes, room.roomTypeId, room.roomTypeName);
    const matchingHotelRoomType = findMatchingHotelRoomType(hotelRoomTypes, room.roomTypeId, room.roomTypeName);
    const resolvedRoomType = matchingRoomType || findMatchingRoomType(roomTypes, matchingHotelRoomType?.roomTypeId || null, "");
    const label =
      resolvedRoomType?.canonicalLabel ||
      matchingHotelRoomType?.canonicalLabel ||
      room.canonicalRoomTypeLabel ||
      room.roomTypeName ||
      "Room";

    if (requestedRoomTypeLabel && normalizeRoomTypeLabel(label) !== normalizeRoomTypeLabel(requestedRoomTypeLabel)) {
      continue;
    }

    const roomTypeId = resolvedRoomType?.id || matchingHotelRoomType?.roomTypeId || room.roomTypeId || null;
    const key = roomTypeId ? `room-type:${roomTypeId}` : normalizeRoomTypeLabel(label);
    const pricePerNight = resolvePricePerNight({
      hotel,
      hotelRoomType: matchingHotelRoomType,
      room,
      roomType: resolvedRoomType,
    });
    const maxCapacity = Math.max(
      matchingHotelRoomType?.maxCapacity || 0,
      resolvedRoomType?.maxCapacity || 0,
      room.maxCapacity
    );
    const description =
      matchingHotelRoomType?.description ||
      resolvedRoomType?.description ||
      `A comfortable ${label.toLowerCase()} curated for your selected stay.`;
    const imageUrl = matchingHotelRoomType?.imageUrl || matchingRoomType?.imageUrl || null;
    const roomTypeName = resolvedRoomType?.label || matchingHotelRoomType?.label || label;

    logRoomCardBindingDebug({
      finalImageUrl: imageUrl,
      hotel,
      matchingHotelRoomType,
      resolvedRoomTypeId: roomTypeId,
      resolvedRoomTypeName: roomTypeName,
      room,
    });

    const existingGroup = groups.get(key);
    const isDateAvailable = availableRoomIds ? availableRoomIds.has(room.id) : room.isAvailable;

    if (existingGroup) {
      existingGroup.availableRoomCount += isDateAvailable ? 1 : 0;
      existingGroup.maxCapacity = Math.max(existingGroup.maxCapacity, maxCapacity);
      existingGroup.pricePerNight = Math.min(existingGroup.pricePerNight, pricePerNight);

      if (!existingGroup.roomTypeId && roomTypeId) {
        existingGroup.roomTypeId = roomTypeId;
      }

      if (!existingGroup.description && description) {
        existingGroup.description = description;
      }

      if (!existingGroup.imageUrl && imageUrl) {
        existingGroup.imageUrl = imageUrl;
      }

      if (!existingGroup.roomTypeName && roomTypeName) {
        existingGroup.roomTypeName = roomTypeName;
      }

      continue;
    }

    groups.set(key, {
      availableRoomCount: isDateAvailable ? 1 : 0,
      description,
      imageUrl,
      label,
      maxCapacity,
      pricePerNight,
      roomTypeId,
      roomTypeName,
    });
  }

  return Array.from(groups.entries())
    .map(([key, group]) => {
      const capacityValidation = evaluateCapacityValidation({
        isSearchContextValid,
        maxCapacityPerRoom: group.maxCapacity,
        selectedRooms,
        totalGuests,
      });
      const inventoryValidation = evaluateInventoryValidation({
        availableRoomCount: group.availableRoomCount,
        selectedRooms,
      });
      const validationMessage = capacityValidation.message || inventoryValidation.message;

      return {
        availableRoomCount: group.availableRoomCount,
        canBook: !validationMessage,
        description: group.description,
        imageUrl: group.imageUrl,
        key,
        label: group.label,
        occupancyText: formatOccupancy(group.maxCapacity),
        pricePerNight: group.pricePerNight,
        roomTypeId: group.roomTypeId,
        roomTypeName: group.roomTypeName,
        totalStayPrice: group.pricePerNight * query.nights,
        validationMessage,
      };
    })
    .map((roomOption) => {
      logRoomBookingOptionDebug({
        hotel,
        requestedAdults: query.adults,
        requestedChildren: query.children,
        requestedRooms: selectedRooms,
        roomOption,
      });

      return roomOption;
    })
    .sort((left, right) => left.pricePerNight - right.pricePerNight);
}

function normalizeHotel(record: HotelRecord) {
  const id = asString(record.id);
  const name = asString(record.name || record.hotel_name || record.title);

  return {
    address: asString(
      record.address ||
        record.street_address ||
        record.full_address ||
        record.location_details ||
        "Address details will be confirmed during booking."
    ),
    checkInTime: asString(
      record.check_in_time || record.checkin_time || record.check_in || record.standard_check_in || "3:00 PM"
    ),
    checkOutTime: asString(
      record.check_out_time || record.checkout_time || record.check_out || record.standard_check_out || "12:00 PM"
    ),
    city: asString(record.city || record.location || record.destination || "UAE"),
    description: asString(
      record.description ||
        record.short_description ||
        record.summary ||
        "A refined hospitality address designed for elevated stays."
    ),
    id,
    imageUrl: normalizeImageUrl(
      record.hero_image_url || record.image_url || record.image || record.hero_image || record.cover_image
    ),
    name,
    slug: buildHotelSlug({
      fallbackId: id,
      name,
      slug: asOptionalString(record.slug || record.hotel_slug),
    }),
    startingPrice: asNumber(record.starting_price || record.price_from || record.base_price || 0),
  };
}

function normalizeRoom(record: RoomRecord) {
  const status = asString(record.status || record.availability_status || "available").toLowerCase();
  const rawRoomTypeName = asString(record.room_type || record.type || record.category || record.name);

  return {
    canonicalRoomTypeLabel: canonicalizeRoomTypeLabel(rawRoomTypeName),
    hotelId: asString(record.hotel_id),
    id: asString(record.id),
    isAvailable: !["booked", "occupied", "maintenance", "inactive"].includes(status),
    maxCapacity: asNumber(record.max_capacity || record.max_occupancy || record.occupancy || record.capacity || record.max_guests || 0),
    pricePerNight: asNumber(record.price_per_night || record.base_price || record.nightly_rate || record.price || 0),
    roomTypeId: asOptionalString(record.room_type_id),
    roomTypeName: rawRoomTypeName,
  };
}

function normalizeRoomType(record: RoomTypeRecord) {
  const rawLabel = asString(record.name || record.room_type || record.room_type_name || record.label || record.type);
  const canonicalLabel = canonicalizeRoomTypeLabel(rawLabel) || rawLabel;

  return {
    canonicalKey: normalizeRoomTypeLabel(canonicalLabel),
    canonicalLabel,
    description: asString(record.description || record.short_description || record.summary || ""),
    hotelId: asOptionalString(record.hotel_id),
    id: asOptionalString(record.id),
    imageUrl: normalizeImageUrl(
      record.image_url || record.room_image_url || record.hero_image_url || record.image || record.cover_image
    ),
    label: canonicalLabel,
    maxCapacity: asNumber(record.max_capacity || record.max_occupancy || record.occupancy || record.capacity || record.max_guests || 0),
    pricePerNight: asNumber(
      record.price_per_night || record.base_price || record.nightly_rate || record.price || 0
    ),
  };
}

function normalizeHotelRoomType(record: HotelRoomTypeRecord, matchingRoomType: NormalizedRoomType | null) {
  const rawLabel = asString(record.name || record.room_type || record.room_type_name || record.label || record.type);
  const fallbackLabel = matchingRoomType?.label || "";
  const canonicalLabel = canonicalizeRoomTypeLabel(rawLabel) || rawLabel || fallbackLabel;

  return {
    canonicalKey: normalizeRoomTypeLabel(canonicalLabel),
    canonicalLabel,
    description: asString(record.description || record.short_description || record.summary || ""),
    hotelId: asString(record.hotel_id),
    id: asOptionalString(record.id),
    imageUrl: normalizeImageUrl(
      record.image_url || record.room_image_url || record.hero_image_url || record.image || record.cover_image
    ),
    label: canonicalLabel || fallbackLabel,
    maxCapacity: asNumber(record.max_capacity || record.max_occupancy || record.occupancy || record.capacity || record.max_guests || 0),
    pricePerNight: asNumber(
      record.price_per_night || record.base_price || record.nightly_rate || record.price || 0
    ),
    roomTypeId: asOptionalString(record.room_type_id),
  };
}

function logHotelRoomTypeFetchDebug({
  adminClientEnabled,
  hotel,
  hotelRoomTypes,
  rawHotelRoomTypes,
  rooms,
}: {
  adminClientEnabled: boolean;
  hotel: NormalizedHotel;
  hotelRoomTypes: NormalizedHotelRoomType[];
  rawHotelRoomTypes: HotelRoomTypeRecord[];
  rooms: NormalizedRoom[];
}) {
  if (process.env.NODE_ENV === "production") {
    return;
  }

  console.log("[hotel-room-types] fetch", {
    adminClientEnabled,
    hotelId: hotel.id,
    hotelSlug: hotel.slug,
    rawHotelRoomTypesCount: rawHotelRoomTypes.length,
    normalizedHotelRoomTypesCount: hotelRoomTypes.length,
    roomInventoryCount: rooms.length,
    sampleHotelRoomType: rawHotelRoomTypes[0] ?? null,
  });

  if (!adminClientEnabled && rawHotelRoomTypes.length === 0 && rooms.length > 0) {
    console.warn(
      "[hotel-room-types] No rows were returned for hotel_room_types with the publishable key. If rows exist in Supabase, RLS is likely blocking reads for this table."
    );
  }
}

function logRoomCardBindingDebug({
  finalImageUrl,
  hotel,
  matchingHotelRoomType,
  resolvedRoomTypeId,
  resolvedRoomTypeName,
  room,
}: {
  finalImageUrl: string | null;
  hotel: NormalizedHotel;
  matchingHotelRoomType: NormalizedHotelRoomType | undefined;
  resolvedRoomTypeId: string | null;
  resolvedRoomTypeName: string;
  room: NormalizedRoom;
}) {
  if (process.env.NODE_ENV === "production") {
    return;
  }

  console.log("[hotel-room-types] room-card-binding", {
    finalImageUrl,
    hotelId: hotel.id,
    hotelSlug: hotel.slug,
    hotelRoomTypeDescription: matchingHotelRoomType?.description ?? null,
    hotelRoomTypeId: matchingHotelRoomType?.id ?? null,
    hotelRoomTypeImageUrl: matchingHotelRoomType?.imageUrl ?? null,
    hotelRoomTypeRoomTypeId: matchingHotelRoomType?.roomTypeId ?? null,
    resolvedRoomTypeId,
    resolvedRoomTypeName,
    roomTypeId: room.roomTypeId,
    roomTypeName: room.roomTypeName,
  });
}

function logRoomBookingOptionDebug({
  hotel,
  requestedAdults,
  requestedChildren,
  requestedRooms,
  roomOption,
}: {
  hotel: NormalizedHotel;
  requestedAdults: number;
  requestedChildren: number;
  requestedRooms: number;
  roomOption: HotelRoomOption;
}) {
  if (process.env.NODE_ENV === "production") {
    return;
  }

  console.log("[hotel-room-options] booking-handoff", {
    availableRoomCount: roomOption.availableRoomCount,
    hotelId: hotel.id,
    hotelSlug: hotel.slug,
    maxGuestsForSelection: extractMaxGuestsForSelection(roomOption.occupancyText, requestedRooms),
    requestedRooms,
    roomTypeId: roomOption.roomTypeId,
    roomTypeName: roomOption.roomTypeName,
    totalGuests: requestedAdults + requestedChildren,
    validationMessage: roomOption.validationMessage,
  });
}

function toHotelDetailsRecord(hotel: NormalizedHotel): HotelDetailsRecord {
  return {
    address: hotel.address,
    checkInTime: hotel.checkInTime,
    checkOutTime: hotel.checkOutTime,
    city: hotel.city,
    description: hotel.description,
    id: hotel.id,
    imageUrl: hotel.imageUrl,
    name: hotel.name,
    slug: hotel.slug,
  };
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

function findMatchingHotelRoomType(
  hotelRoomTypes: NormalizedHotelRoomType[],
  roomTypeId: string | null,
  roomTypeName: string
) {
  return hotelRoomTypes.find((roomType) => {
    if (roomTypeId && roomType.roomTypeId && roomType.roomTypeId === roomTypeId) {
      return true;
    }

    return roomType.canonicalKey === normalizeRoomTypeLabel(canonicalizeRoomTypeLabel(roomTypeName) || roomTypeName);
  });
}

function resolvePricePerNight({
  hotel,
  hotelRoomType,
  room,
  roomType,
}: {
  hotel: NormalizedHotel;
  hotelRoomType: NormalizedHotelRoomType | undefined;
  room: NormalizedRoom;
  roomType: NormalizedRoomType | undefined;
}) {
  if (room.pricePerNight > 0) {
    return room.pricePerNight;
  }

  if (hotelRoomType?.pricePerNight) {
    return hotelRoomType.pricePerNight;
  }

  if (roomType?.pricePerNight) {
    return roomType.pricePerNight;
  }

  return hotel.startingPrice;
}

function evaluateCapacityValidation({
  isSearchContextValid,
  maxCapacityPerRoom,
  selectedRooms,
  totalGuests,
}: {
  isSearchContextValid: boolean;
  maxCapacityPerRoom: number;
  selectedRooms: number;
  totalGuests: number;
}) {
  if (!isSearchContextValid) {
    return {
      isValid: false,
      message: "Select dates and guest details from search to continue booking.",
    };
  }

  const maxGuestsForSelection = selectedRooms * Math.max(maxCapacityPerRoom, 0);

  if (maxGuestsForSelection <= 0 || totalGuests > maxGuestsForSelection) {
    return {
      isValid: false,
      message: "Too many guests for this room selection. Choose more rooms or a larger room type.",
    };
  }

  return {
    isValid: true,
    message: null,
  };
}

function evaluateInventoryValidation({
  availableRoomCount,
  selectedRooms,
}: {
  availableRoomCount: number;
  selectedRooms: number;
}) {
  if (availableRoomCount < selectedRooms) {
    return {
      isValid: false,
      message: `Only ${availableRoomCount} ${availableRoomCount === 1 ? "room is" : "rooms are"} available for your selected dates.`,
    };
  }

  return {
    isValid: true,
    message: null,
  };
}

function formatOccupancy(value: number) {
  if (value <= 0) {
    return null;
  }

  return value === 1 ? "Up to 1 guest per room" : `Up to ${value} guests per room`;
}

function asString(value: unknown) {
  return typeof value === "string" ? value : value == null ? "" : String(value);
}

function asOptionalString(value: unknown) {
  const normalized = asString(value).trim();
  return normalized ? normalized : null;
}

function asNumber(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
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

function extractMaxGuestsForSelection(occupancyText: string | null, requestedRooms: number) {
  if (!occupancyText) {
    return null;
  }

  const match = occupancyText.match(/Up to (\d+) guests? per room/i);

  if (!match) {
    return null;
  }

  const maxPerRoom = Number.parseInt(match[1] || "", 10);
  return Number.isFinite(maxPerRoom) ? maxPerRoom * requestedRooms : null;
}
