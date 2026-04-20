import "server-only";

import { parseIsoDateString, startOfDay } from "@/lib/search/date-utils";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

type RoomRecord = Record<string, unknown>;
type ReservationRecord = Record<string, unknown>;
type RoomBlockRecord = Record<string, unknown>;

export type AvailabilityCheckInput = {
  hotelId: string;
  roomTypeId: string;
  checkInDate: string;
  checkOutDate: string;
  selectedRooms: number;
};

export type AvailableRoomInventory = {
  hotelId: string;
  id: string;
  pricePerNight: number;
  roomTypeId: string;
};

export type AvailabilityCheckResult = {
  actualAvailableRoomCount: number;
  blockedRoomCount: number;
  bookedRoomCount: number;
  bookable: boolean;
  issue: string | null;
  requestedRoomCount: number;
};

export type DateAwareRoomAvailabilityState = {
  availableRoomIds: Set<string>;
  blockedRoomIds: Set<string>;
  bookedRoomIds: Set<string>;
  issue: string | null;
};

export async function checkRoomTypeAvailability({
  checkInDate,
  checkOutDate,
  hotelId,
  roomTypeId,
  selectedRooms,
}: AvailabilityCheckInput): Promise<AvailabilityCheckResult> {
  const availabilitySnapshot = await getAvailableRoomInventoryForStay({
    checkInDate,
    checkOutDate,
    hotelId,
    roomTypeId,
    selectedRooms,
  });

  return {
    actualAvailableRoomCount: availabilitySnapshot.actualAvailableRoomCount,
    blockedRoomCount: availabilitySnapshot.blockedRoomCount,
    bookedRoomCount: availabilitySnapshot.bookedRoomCount,
    bookable: availabilitySnapshot.actualAvailableRoomCount >= availabilitySnapshot.requestedRoomCount,
    issue:
      availabilitySnapshot.issue ||
      (availabilitySnapshot.actualAvailableRoomCount >= availabilitySnapshot.requestedRoomCount
        ? null
        : `Only ${availabilitySnapshot.actualAvailableRoomCount} ${availabilitySnapshot.actualAvailableRoomCount === 1 ? "room is" : "rooms are"} actually available for your selected dates.`),
    requestedRoomCount: availabilitySnapshot.requestedRoomCount,
  };
}

export async function getAvailableRoomInventoryForStay({
  checkInDate,
  checkOutDate,
  hotelId,
  roomTypeId,
  selectedRooms,
}: AvailabilityCheckInput): Promise<{
  actualAvailableRoomCount: number;
  availableRooms: AvailableRoomInventory[];
  blockedRoomCount: number;
  bookedRoomCount: number;
  issue: string | null;
  requestedRoomCount: number;
}> {
  // This powers booking-time availability checks for one hotel + one room type.
  // It applies the same date-overlap rule against reservations and room blocks before booking.
  const normalizedHotelId = hotelId.trim();
  const normalizedRoomTypeId = roomTypeId.trim();
  const normalizedSelectedRooms = Math.max(selectedRooms, 1);
  const parsedCheckIn = parseIsoDateString(checkInDate);
  const parsedCheckOut = parseIsoDateString(checkOutDate);

  if (!normalizedHotelId || !normalizedRoomTypeId) {
    return {
      actualAvailableRoomCount: 0,
      availableRooms: [],
      blockedRoomCount: 0,
      bookedRoomCount: 0,
      issue: "Booking context is incomplete. Please reselect your room before continuing.",
      requestedRoomCount: normalizedSelectedRooms,
    };
  }

  if (!parsedCheckIn || !parsedCheckOut || parsedCheckIn.date.getTime() >= parsedCheckOut.date.getTime()) {
    return {
      actualAvailableRoomCount: 0,
      availableRooms: [],
      blockedRoomCount: 0,
      bookedRoomCount: 0,
      issue: "Your stay dates are invalid. Please go back and choose a valid check-in and check-out.",
      requestedRoomCount: normalizedSelectedRooms,
    };
  }

  const supabase = createAdminClient() ?? (await createClient());

  // This fetches the hotel inventory plus the raw block/reservation records used for overlap checks.
  const [
    { data: roomsData, error: roomsError },
    { data: reservationsData, error: reservationsError },
    { data: roomBlocksData, error: roomBlocksError },
  ] = await Promise.all([
    supabase.from("rooms").select("*").eq("hotel_id", normalizedHotelId).eq("room_type_id", normalizedRoomTypeId),
    supabase.from("reservations").select("*"),
    supabase.from("room_blocks").select("*"),
  ]);

  if (roomsError || reservationsError || roomBlocksError) {
    return {
      actualAvailableRoomCount: 0,
      availableRooms: [],
      blockedRoomCount: 0,
      bookedRoomCount: 0,
      issue: "We couldn't verify live availability right now. Please try again in a moment.",
      requestedRoomCount: normalizedSelectedRooms,
    };
  }

  const rooms = ((roomsData ?? []) as RoomRecord[])
    .map(normalizeRoomInventory)
    .filter((room) => room.id && room.hotelId === normalizedHotelId && room.roomTypeId === normalizedRoomTypeId);
  const availabilityState = getDateAwareRoomAvailabilityState({
    checkInDate,
    checkOutDate,
    reservations: (reservationsData ?? []) as ReservationRecord[],
    roomBlocks: (roomBlocksData ?? []) as RoomBlockRecord[],
    rooms: (roomsData ?? []) as RoomRecord[],
  });
  const inventoryRooms = rooms.filter((room) => room.isInventoryAvailable);

  if (inventoryRooms.length === 0) {
    return {
      actualAvailableRoomCount: 0,
      availableRooms: [],
      blockedRoomCount: 0,
      bookedRoomCount: 0,
      issue: "No active room inventory is available for this room type right now.",
      requestedRoomCount: normalizedSelectedRooms,
    };
  }

  const availableRooms: AvailableRoomInventory[] = [];

  for (const room of inventoryRooms) {
    if (availabilityState.availableRoomIds.has(room.id)) {
      availableRooms.push({
        hotelId: room.hotelId,
        id: room.id,
        pricePerNight: room.pricePerNight,
        roomTypeId: room.roomTypeId,
      });
    }
  }

  const actualAvailableRoomCount = availableRooms.length;

  return {
    actualAvailableRoomCount,
    availableRooms,
    blockedRoomCount: countMatchingIds(availabilityState.blockedRoomIds, inventoryRooms),
    bookedRoomCount: countMatchingIds(availabilityState.bookedRoomIds, inventoryRooms),
    issue: availabilityState.issue,
    requestedRoomCount: normalizedSelectedRooms,
  };
}

// This centralizes the overlap-aware room availability model so search, hotel details, and booking reads stay aligned.
export function getDateAwareRoomAvailabilityState({
  checkInDate,
  checkOutDate,
  reservations,
  roomBlocks,
  rooms,
}: {
  checkInDate: string;
  checkOutDate: string;
  reservations: ReservationRecord[];
  roomBlocks: RoomBlockRecord[];
  rooms: RoomRecord[];
}): DateAwareRoomAvailabilityState {
  // This is the shared read-side availability engine used by search and hotel details.
  // A room is unavailable when an existing reservation/block overlaps the requested stay.
  const parsedCheckIn = parseIsoDateString(checkInDate);
  const parsedCheckOut = parseIsoDateString(checkOutDate);

  if (!parsedCheckIn || !parsedCheckOut || parsedCheckIn.date.getTime() >= parsedCheckOut.date.getTime()) {
    return {
      availableRoomIds: new Set<string>(),
      blockedRoomIds: new Set<string>(),
      bookedRoomIds: new Set<string>(),
      issue: "Your stay dates are invalid. Please choose a valid date range.",
    };
  }

  const normalizedRooms = rooms.map(normalizeRoomInventory).filter((room) => room.id && room.isInventoryAvailable);
  const roomIds = new Set(normalizedRooms.map((room) => room.id));
  const conflictingReservationRoomIds = new Set(
    reservations
      .map(normalizeReservation)
      .filter(
        (reservation) =>
          reservation.roomId &&
          roomIds.has(reservation.roomId) &&
          reservation.blocksInventory &&
          overlapsRequestedStay({
            existingCheckIn: reservation.checkInDate,
            existingCheckOut: reservation.checkOutDate,
            requestedCheckIn: parsedCheckIn.date,
            requestedCheckOut: parsedCheckOut.date,
          })
      )
      .map((reservation) => reservation.roomId)
  );
  const conflictingRoomBlockIds = new Set(
    roomBlocks
      .map(normalizeRoomBlock)
      .filter(
        (roomBlock) =>
          roomBlock.roomId &&
          roomIds.has(roomBlock.roomId) &&
          roomBlock.blocksInventory &&
          overlapsRequestedStay({
            existingCheckIn: roomBlock.startDate,
            existingCheckOut: roomBlock.endDate,
            requestedCheckIn: parsedCheckIn.date,
            requestedCheckOut: parsedCheckOut.date,
          })
      )
      .map((roomBlock) => roomBlock.roomId)
  );
  const availableRoomIds = new Set(
    normalizedRooms
      .filter(
        (room) => !conflictingReservationRoomIds.has(room.id) && !conflictingRoomBlockIds.has(room.id)
      )
      .map((room) => room.id)
  );

  return {
    availableRoomIds,
    blockedRoomIds: conflictingRoomBlockIds,
    bookedRoomIds: conflictingReservationRoomIds,
    issue: null,
  };
}

function normalizeRoomInventory(record: RoomRecord) {
  const status = asString(record.status || "available").toLowerCase();

  return {
    hotelId: asString(record.hotel_id),
    id: asString(record.id),
    isInventoryAvailable: !["booked", "occupied", "maintenance", "inactive", "out_of_service", "blocked"].includes(
      status
    ),
    pricePerNight: asNumber(record.price_per_night || record.base_price || record.nightly_rate || record.price || 0),
    roomTypeId: asString(record.room_type_id),
  };
}

function countMatchingIds(ids: Set<string>, rooms: Array<{ id: string }>) {
  let count = 0;

  for (const room of rooms) {
    if (ids.has(room.id)) {
      count += 1;
    }
  }

  return count;
}

function normalizeReservation(record: ReservationRecord) {
  const status = asString(record.reservation_status || "confirmed").toLowerCase();

  return {
    blocksInventory: !["cancelled", "canceled", "checked_out", "completed", "released", "no_show"].includes(status),
    checkInDate: normalizeStoredDate(record.check_in_date),
    checkOutDate: normalizeStoredDate(record.check_out_date),
    roomId: asString(record.room_id),
  };
}

function normalizeRoomBlock(record: RoomBlockRecord) {
  const status = asString(record.status || "active").toLowerCase();

  return {
    blocksInventory: !["cancelled", "canceled", "released", "inactive", "completed"].includes(status),
    endDate: normalizeStoredDate(record.end_datetime),
    roomId: asString(record.room_id),
    startDate: normalizeStoredDate(record.start_datetime),
  };
}

function overlapsRequestedStay({
  existingCheckIn,
  existingCheckOut,
  requestedCheckIn,
  requestedCheckOut,
}: {
  existingCheckIn: Date | null;
  existingCheckOut: Date | null;
  requestedCheckIn: Date;
  requestedCheckOut: Date;
}) {
  if (!existingCheckIn || !existingCheckOut) {
    return false;
  }

  return existingCheckIn.getTime() < requestedCheckOut.getTime() && existingCheckOut.getTime() > requestedCheckIn.getTime();
}

function normalizeStoredDate(value: unknown) {
  if (typeof value === "string") {
    const trimmedValue = value.trim();

    if (!trimmedValue) {
      return null;
    }

    const dateOnlyCandidate = parseIsoDateString(trimmedValue.slice(0, 10));

    if (dateOnlyCandidate) {
      return dateOnlyCandidate.date;
    }

    const parsedDate = new Date(trimmedValue);

    if (!Number.isNaN(parsedDate.getTime())) {
      return startOfDay(parsedDate);
    }
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return startOfDay(value);
  }

  return null;
}

function asString(value: unknown) {
  return typeof value === "string" ? value : value == null ? "" : String(value);
}

function asNumber(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}
