import "server-only";

import { loadAuthenticatedGuestAccount } from "@/lib/auth/guest-account";
import { calculateNightsBetweenDates, parseIsoDateString, startOfDay } from "@/lib/search/date-utils";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

type ReservationRecord = Record<string, unknown>;
type ReservationGroupRecord = Record<string, unknown>;
type HotelRecord = Record<string, unknown>;
type RoomTypeRecord = Record<string, unknown>;
type HotelRoomTypeRecord = Record<string, unknown>;

type CanonicalReservationStatus = "confirmed";
type CanonicalReservationGroupStatus = "confirmed" | "partially_cancelled" | "cancelled";
type OperationalBookingStatus = "confirmed" | "checked_in" | "checked_out";

export type ReservationCreateInput = {
  adults: number;
  checkIn: string;
  checkOut: string;
  children: number;
  hotelId: string;
  hotelSlug: string;
  nights: number;
  quotedPricePerNight: number;
  quotedTotalPrice: number;
  roomTypeId: string;
  roomTypeName: string;
  selectedRooms: number;
};

export type ReservationCreateResult =
  | {
      error: string;
      success: false;
    }
  | {
      reservationCode: string;
      success: true;
    };

export type ReservationConfirmationData = {
  checkIn: string;
  checkOut: string;
  children: number;
  hotelName: string;
  nights: number;
  pricePerNight: number;
  reservationCode: string;
  reservationStatus: string;
  roomCount: number;
  roomTypeName: string;
  totalPrice: number;
  totalGuests: number;
};

export type GuestBookingSummary = {
  bookingStatus: string;
  checkIn: string;
  checkOut: string;
  createdAt: string;
  hotelName: string;
  reservationCode: string;
  roomCount: number;
  roomTypeName: string;
  totalPrice: number;
};

export type GuestBookingDetail = {
  bookingStatus: OperationalBookingStatus;
  canCheckIn: boolean;
  canCheckOut: boolean;
  checkIn: string;
  checkInMessage: string | null;
  checkedInAt: string | null;
  checkedOutAt: string | null;
  checkOut: string;
  children: number;
  hotelName: string;
  nights: number;
  pricePerNight: number;
  reservationCode: string;
  roomCount: number;
  roomTypeName: string;
  totalGuests: number;
  totalPrice: number;
};

export type GuestOwnedBookingOperationalRecord = {
  bookingStatus: OperationalBookingStatus;
  reservationGroup: NonNullable<ReturnType<typeof normalizeStoredReservationGroup>>;
  reservations: Array<ReturnType<typeof normalizeStoredReservation>>;
};

const CANONICAL_RESERVATION_STATUS: CanonicalReservationStatus = "confirmed";
const CANONICAL_RESERVATION_GROUP_STATUS: CanonicalReservationGroupStatus = "confirmed";

// This verifies the booking belongs to a signed-in guest before any reservation write is attempted.
export async function getAuthenticatedGuestContext() {
  const guestAccountResolution = await loadAuthenticatedGuestAccount();

  if (!guestAccountResolution.authenticated) {
    return {
      error: "Please log in as a guest before confirming this booking.",
      guestUserId: null,
      isGuest: false,
    };
  }

  if (guestAccountResolution.error) {
    await signOutBrokenGuestSession();
    return {
      error: guestAccountResolution.error,
      guestUserId: null,
      isGuest: false,
    };
  }

  if (!guestAccountResolution.isGuest || !guestAccountResolution.guestAccount) {
    return {
      error: "Bookings can only be confirmed from a guest account.",
      guestUserId: null,
      isGuest: false,
    };
  }

  return {
    error: null,
    guestUserId: guestAccountResolution.guestAccount.id,
    isGuest: true,
  };
}

// This creates the reservation after rechecking live availability and recalculating pricing on the server.
export async function createReservationFromBooking(
  input: ReservationCreateInput
): Promise<ReservationCreateResult> {
  // This is the booking write wrapper in app code. It validates the guest context,
  // recalculates booking details, and then delegates the final room allocation/write to the atomic DB function.
  const guestContext = await getAuthenticatedGuestContext();

  if (!guestContext.isGuest || !guestContext.guestUserId) {
    return {
      error: guestContext.error || "Please log in as a guest before confirming this booking.",
      success: false,
    };
  }

  const parsedInput = parseReservationCreateInput(input);

  if (!parsedInput.success) {
    return {
      error: parsedInput.error,
      success: false,
    };
  }

  const bookingDetails = await getBookingDetailsForReservation({
    hotelId: parsedInput.data.hotelId,
    roomTypeId: parsedInput.data.roomTypeId,
    roomTypeNameFallback: parsedInput.data.roomTypeName,
  });

  if (bookingDetails.error) {
    return {
      error: bookingDetails.error,
      success: false,
    };
  }

  const capacitySnapshot = await getRoomTypeCapacitySnapshot({
    adults: parsedInput.data.adults,
    children: parsedInput.data.children,
    hotelId: parsedInput.data.hotelId,
    roomTypeId: parsedInput.data.roomTypeId,
    roomTypeName: parsedInput.data.roomTypeName,
    selectedRooms: parsedInput.data.selectedRooms,
  });

  logBookingCapacityDebug(capacitySnapshot);

  const pricePerNight = bookingDetails.pricePerNight;
  const writeClient = createAdminClient() ?? (await createClient());
  const atomicCreateResult = await createGuestReservationAtomic(writeClient, {
    adults: parsedInput.data.adults,
    checkIn: parsedInput.data.checkIn,
    checkOut: parsedInput.data.checkOut,
    children: parsedInput.data.children,
    hotelId: parsedInput.data.hotelId,
    nights: parsedInput.data.nights,
    pricePerNight,
    roomTypeId: parsedInput.data.roomTypeId,
    selectedRooms: parsedInput.data.selectedRooms,
    userId: guestContext.guestUserId,
  });

  if (!atomicCreateResult.success) {
    return {
      error: atomicCreateResult.error,
      success: false,
    };
  }

  return {
    reservationCode: atomicCreateResult.reservationCode,
    success: true,
  };
}

// This loads the booking header from reservation_groups, then the linked room rows from reservations.
export async function getReservationConfirmationData(
  reservationCode: string
): Promise<{ data: ReservationConfirmationData | null; error: string | null }> {
  const guestContext = await getAuthenticatedGuestContext();

  if (!guestContext.isGuest || !guestContext.guestUserId) {
    return {
      data: null,
      error: guestContext.error || "Please log in as a guest to view this reservation.",
    };
  }

  const normalizedCode = reservationCode.trim().toUpperCase();

  if (!normalizedCode) {
    return {
      data: null,
      error: "Reservation code is missing.",
    };
  }

  const queryClient = createAdminClient() ?? (await createClient());
  const bookingRecord = await loadGuestBookingRecordByCode({
    guestUserId: guestContext.guestUserId,
    normalizedCode,
    queryClient,
  });

  if (bookingRecord.error) {
    return {
      data: null,
      error: bookingRecord.error,
    };
  }

  if (!bookingRecord.data) {
    return {
      data: null,
      error: "We couldn't find a reservation matching that confirmation code.",
    };
  }

  const { reservationGroup, reservations } = bookingRecord.data;
  const firstReservation = reservations[0];
  const bookingStatus = deriveOperationalBookingStatus(reservations);
  const [hotelName, roomTypeName] = await Promise.all([
    resolveHotelName(reservationGroup.hotelId),
    resolveRoomTypeName(reservationGroup.hotelId, firstReservation.roomTypeId, firstReservation.roomTypeName),
  ]);

  return {
    data: {
      checkIn: reservationGroup.checkIn,
      checkOut: reservationGroup.checkOut,
      children: reservationGroup.children,
      hotelName,
      nights: reservationGroup.nights,
      pricePerNight: reservationGroup.pricePerNight,
      reservationCode: normalizedCode,
      reservationStatus: bookingStatus,
      roomCount: reservationGroup.selectedRooms,
      roomTypeName,
      totalGuests: reservationGroup.adults + reservationGroup.children,
      totalPrice: reservationGroup.totalPrice,
    },
    error: null,
  };
}

export async function getGuestBookingDetail(
  reservationCode: string
): Promise<{ data: GuestBookingDetail | null; error: string | null }> {
  const ownedBookingResult = await getGuestOwnedBookingOperationalRecord(reservationCode);

  if (ownedBookingResult.error || !ownedBookingResult.data) {
    return {
      data: null,
      error: ownedBookingResult.error || "We couldn't find a booking matching that reservation code.",
    };
  }

  const { bookingStatus, reservationGroup, reservations } = ownedBookingResult.data;
  const firstReservation = reservations[0];
  const eligibility = evaluateBookingLifecycleEligibility(reservationGroup, bookingStatus);
  const [hotelName, roomTypeName] = await Promise.all([
    resolveHotelName(reservationGroup.hotelId),
    resolveRoomTypeName(reservationGroup.hotelId, firstReservation.roomTypeId, firstReservation.roomTypeName),
  ]);

  return {
    data: {
      bookingStatus,
      canCheckIn: eligibility.canCheckIn,
      canCheckOut: eligibility.canCheckOut,
      checkIn: reservationGroup.checkIn,
      checkInMessage: eligibility.message,
      checkedInAt: firstReservation.checkedInAt,
      checkedOutAt: firstReservation.checkedOutAt,
      checkOut: reservationGroup.checkOut,
      children: reservationGroup.children,
      hotelName,
      nights: reservationGroup.nights,
      pricePerNight: reservationGroup.pricePerNight,
      reservationCode: reservationGroup.reservationCode,
      roomCount: reservationGroup.selectedRooms,
      roomTypeName,
      totalGuests: reservationGroup.adults + reservationGroup.children,
      totalPrice: reservationGroup.totalPrice,
    },
    error: null,
  };
}

export async function getGuestOwnedBookingOperationalRecord(
  reservationCode: string
): Promise<{ data: GuestOwnedBookingOperationalRecord | null; error: string | null }> {
  const guestContext = await getAuthenticatedGuestContext();

  if (!guestContext.isGuest || !guestContext.guestUserId) {
    return {
      data: null,
      error: guestContext.error || "Please log in as a guest to manage this booking.",
    };
  }

  const normalizedCode = reservationCode.trim().toUpperCase();

  if (!normalizedCode) {
    return {
      data: null,
      error: "Reservation code is missing.",
    };
  }

  const queryClient = createAdminClient() ?? (await createClient());
  const bookingRecord = await loadGuestBookingRecordByCode({
    guestUserId: guestContext.guestUserId,
    normalizedCode,
    queryClient,
  });

  if (bookingRecord.error) {
    return {
      data: null,
      error: bookingRecord.error,
    };
  }

  if (!bookingRecord.data) {
    return {
      data: null,
      error: "We couldn't find a booking matching that reservation code.",
    };
  }

  return {
    data: {
      bookingStatus: deriveOperationalBookingStatus(bookingRecord.data.reservations),
      reservationGroup: bookingRecord.data.reservationGroup,
      reservations: bookingRecord.data.reservations,
    },
    error: null,
  };
}

// This loads booking-level guest history from reservation_groups so guest pages can show one card per booking.
export async function getGuestBookingSummaries(): Promise<{
  data: GuestBookingSummary[];
  error: string | null;
}> {
  const guestContext = await getAuthenticatedGuestContext();

  if (!guestContext.isGuest || !guestContext.guestUserId) {
    return {
      data: [],
      error: guestContext.error || "Please log in as a guest to view your bookings.",
    };
  }

  const queryClient = createAdminClient() ?? (await createClient());
  const { data: reservationGroupRows, error: reservationGroupError } = await queryClient
    .from("reservation_groups")
    .select("*")
    .eq("user_id", guestContext.guestUserId)
    .order("created_at", { ascending: false });

  if (reservationGroupError) {
    return {
      data: [],
      error: "We couldn't load your bookings right now.",
    };
  }

  const reservationGroups = (((reservationGroupRows ?? []) as ReservationGroupRecord[]) ?? [])
    .map((record) => normalizeStoredReservationGroup(record))
    .filter((record): record is NonNullable<typeof record> => Boolean(record));

  const reservationRowsResult = reservationGroups.length
    ? await queryClient
        .from("reservations")
        .select("*")
        .in(
          "reservation_group_id",
          reservationGroups.map((group) => group.id)
        )
        .eq("user_id", guestContext.guestUserId)
    : await queryClient.from("reservations").select("*").eq("user_id", guestContext.guestUserId);

  const { data: reservationRows, error: reservationError } = reservationRowsResult;

  if (reservationError) {
    return {
      data: [],
      error: "We couldn't load your room allocations right now.",
    };
  }
  const normalizedReservationRows = ((reservationRows ?? []) as ReservationRecord[]).map(normalizeStoredReservation);

  if (reservationGroups.length === 0 && normalizedReservationRows.length === 0) {
    return {
      data: [],
      error: null,
    };
  }

  const createdAtByGroupId = new Map<number, string>(
    (((reservationGroupRows ?? []) as ReservationGroupRecord[]) ?? []).map((record) => [
      asNumber(record.id),
      asString(record.created_at || ""),
    ])
  );

  const bookingGroupsToRender =
    reservationGroups.length > 0
      ? reservationGroups
      : buildReservationGroupFallbacksFromChildren(guestContext.guestUserId, normalizedReservationRows);

  const bookingSummaries = await Promise.all(
    bookingGroupsToRender.map(async (reservationGroup) => {
      const groupedReservations = normalizedReservationRows.filter((reservation) =>
        reservationGroup.id > 0
          ? reservation.reservationGroupId === reservationGroup.id
          : reservation.reservationCode === reservationGroup.reservationCode
      );
      const firstReservation = groupedReservations[0];
      const [hotelName, roomTypeName] = await Promise.all([
        resolveHotelName(reservationGroup.hotelId),
        resolveRoomTypeName(
          reservationGroup.hotelId,
          firstReservation?.roomTypeId || "",
          firstReservation?.roomTypeName || "Selected room type"
        ),
      ]);
      const bookingStatus = deriveOperationalBookingStatus(groupedReservations);

      return {
        bookingStatus,
        checkIn: reservationGroup.checkIn,
        checkOut: reservationGroup.checkOut,
        createdAt: reservationGroup.id > 0 ? createdAtByGroupId.get(reservationGroup.id) || "" : "",
        hotelName,
        reservationCode: reservationGroup.reservationCode,
        roomCount: reservationGroup.selectedRooms,
        roomTypeName,
        totalPrice: reservationGroup.totalPrice,
      };
    })
  );

  return {
    data: bookingSummaries,
    error: null,
  };
}

async function getBookingDetailsForReservation({
  hotelId,
  roomTypeId,
  roomTypeNameFallback,
}: {
  hotelId: string;
  roomTypeId: string;
  roomTypeNameFallback: string;
}) {
  const queryClient = createAdminClient() ?? (await createClient());
  const [hotelResult, roomTypeResult, hotelRoomTypeResult, roomInventoryResult] = await Promise.all([
    queryClient.from("hotels").select("*").eq("id", hotelId).maybeSingle(),
    queryClient.from("room_types").select("*").eq("id", roomTypeId).maybeSingle(),
    queryClient.from("hotel_room_types").select("*").eq("hotel_id", hotelId).eq("room_type_id", roomTypeId).limit(1),
    queryClient.from("rooms").select("*").eq("hotel_id", hotelId).eq("room_type_id", roomTypeId),
  ]);

  if (hotelResult.error || roomTypeResult.error || hotelRoomTypeResult.error || roomInventoryResult.error) {
    return {
      error: "We couldn't load the current room pricing details for this booking.",
      hotelName: "",
      pricePerNight: 0,
      roomTypeName: roomTypeNameFallback,
    };
  }

  const hotel = normalizeHotelRecord((hotelResult.data ?? null) as HotelRecord | null);
  const roomType = normalizeRoomTypeRecord((roomTypeResult.data ?? null) as RoomTypeRecord | null);
  const hotelRoomType = normalizeHotelRoomTypeRecord(
    (((hotelRoomTypeResult.data ?? []) as HotelRoomTypeRecord[])[0] ?? null) as HotelRoomTypeRecord | null
  );
  const roomInventory = (((roomInventoryResult.data ?? []) as ReservationRecord[]) ?? []).map(normalizeInventoryRoomRecord);
  const roomInventoryPrices = roomInventory.map((room) => room.pricePerNight).filter((value) => value > 0);
  const pricePerNight =
    roomInventoryPrices.length > 0
      ? Math.min(...roomInventoryPrices)
      : hotelRoomType.pricePerNight || roomType.pricePerNight || hotel.startingPrice;

  if (pricePerNight <= 0 || !hotel.name) {
    return {
      error: "We couldn't verify a current booking rate for this room type.",
      hotelName: "",
      pricePerNight: 0,
      roomTypeName: roomTypeNameFallback,
    };
  }

  return {
    error: null,
    hotelName: hotel.name,
    pricePerNight,
    roomTypeName: hotelRoomType.label || roomType.label || roomTypeNameFallback,
  };
}

async function getRoomTypeCapacitySnapshot({
  adults,
  children,
  hotelId,
  roomTypeId,
  roomTypeName,
  selectedRooms,
}: {
  adults: number;
  children: number;
  hotelId: string;
  roomTypeId: string;
  roomTypeName: string;
  selectedRooms: number;
}) {
  const queryClient = createAdminClient() ?? (await createClient());
  const [{ data: roomTypeData }] = await Promise.all([
    queryClient.from("room_types").select("*").eq("id", roomTypeId).maybeSingle(),
  ]);

  const roomType = normalizeRoomTypeRecord((roomTypeData ?? null) as RoomTypeRecord | null);
  const effectiveMaxCapacity = roomType.maxCapacity;
  const totalGuests = adults + children;

  return {
    effectiveMaxCapacity,
    hotelId,
    maxGuestsForSelection: effectiveMaxCapacity * selectedRooms,
    roomTypeId,
    roomTypeLabel: roomType.label || roomTypeName,
    roomTypeMaxCapacity: roomType.maxCapacity,
    selectedRooms,
    totalGuests,
  };
}

async function createGuestReservationAtomic(
  queryClient: unknown,
  input: {
    adults: number;
    checkIn: string;
    checkOut: string;
    children: number;
    hotelId: string;
    nights: number;
    pricePerNight: number;
    roomTypeId: string;
    selectedRooms: number;
    userId: string;
  }
): Promise<
  | {
      reservationCode: string;
      reservationGroupId: number;
      reservationIds: number[];
      success: true;
    }
  | {
      error: string;
      success: false;
    }
> {
  // Double-booking protection ultimately lives here by calling the DB-side RPC.
  // App code no longer selects rooms and inserts reservations in separate unsafe steps.
  const rpcClient = queryClient as {
    rpc: (
      fn: string,
      args: Record<string, unknown>
    ) => PromiseLike<{ data: Record<string, unknown> | null; error: { message: string } | null }>;
  };
  const hotelId = parseNumericIdentifier(input.hotelId);
  const roomTypeId = parseNumericIdentifier(input.roomTypeId);

  if (!hotelId || !roomTypeId) {
    return {
      error: "The booking identifiers are invalid. Please reselect your hotel and room before continuing.",
      success: false,
    };
  }

  const { data, error } = await rpcClient.rpc("create_guest_reservation_atomic", {
    p_adults: input.adults,
    p_check_in_date: input.checkIn,
    p_check_out_date: input.checkOut,
    p_children: input.children,
    p_hotel_id: hotelId,
    p_nights: input.nights,
    p_price_per_night: input.pricePerNight,
    p_room_type_id: roomTypeId,
    p_selected_rooms: input.selectedRooms,
    p_user_id: input.userId,
  });

  if (error) {
    return {
      error: buildAtomicReservationRpcError(error.message),
      success: false,
    };
  }

  const result = normalizeAtomicReservationRpcResult(data);

  if (!result) {
    return {
      error:
        "We couldn't confirm your reservation because the atomic booking service returned an invalid response. Please try again.",
      success: false,
    };
  }

  if (!result.bookable) {
    return {
      error:
        result.reason ||
        `Only ${result.actualAvailableRoomCount} ${result.actualAvailableRoomCount === 1 ? "room is" : "rooms are"} available for your selected dates.`,
      success: false,
    };
  }

  if (!result.reservationCode || result.reservationGroupId < 1 || result.reservationIds.length === 0) {
    return {
      error:
        "We couldn't confirm your reservation because the final atomic booking response was incomplete. Please try again.",
      success: false,
    };
  }

  return {
    reservationCode: result.reservationCode,
    reservationGroupId: result.reservationGroupId,
    reservationIds: result.reservationIds,
    success: true,
  };
}

function parseReservationCreateInput(input: ReservationCreateInput) {
  const hotelId = input.hotelId.trim();
  const hotelSlug = input.hotelSlug.trim();
  const roomTypeId = input.roomTypeId.trim();
  const roomTypeName = input.roomTypeName.trim();
  const selectedRooms = Math.max(input.selectedRooms, 1);
  const adults = Math.max(input.adults, 1);
  const children = Math.max(input.children, 0);
  const parsedCheckIn = parseIsoDateString(input.checkIn);
  const parsedCheckOut = parseIsoDateString(input.checkOut);

  if (!hotelId || !hotelSlug || !roomTypeId || !roomTypeName) {
    return {
      error: "The booking details are incomplete. Please reselect your hotel and room option.",
      success: false as const,
    };
  }

  if (!parsedCheckIn || !parsedCheckOut) {
    return {
      error: "Your stay dates are invalid. Please go back and choose a valid stay.",
      success: false as const,
    };
  }

  const nights = calculateNightsBetweenDates(parsedCheckIn.date, parsedCheckOut.date);

  if (nights < 1) {
    return {
      error: "Your selected stay must be at least 1 night.",
      success: false as const,
    };
  }

  return {
    data: {
      adults,
      checkIn: parsedCheckIn.iso,
      checkOut: parsedCheckOut.iso,
      children,
      hotelId,
      hotelSlug,
      nights,
      roomTypeId,
      roomTypeName,
      selectedRooms,
    },
    success: true as const,
  };
}

async function resolveHotelName(hotelId: string) {
  const queryClient = createAdminClient() ?? (await createClient());
  const { data } = await queryClient.from("hotels").select("*").eq("id", hotelId).maybeSingle();
  return normalizeHotelRecord((data ?? null) as HotelRecord | null).name || "Selected hotel";
}

async function resolveRoomTypeName(hotelId: string, roomTypeId: string, fallbackName: string) {
  const queryClient = createAdminClient() ?? (await createClient());
  const [hotelRoomTypeResult, roomTypeResult] = await Promise.all([
    queryClient.from("hotel_room_types").select("*").eq("hotel_id", hotelId).eq("room_type_id", roomTypeId).limit(1),
    queryClient.from("room_types").select("*").eq("id", roomTypeId).maybeSingle(),
  ]);

  const hotelRoomType = normalizeHotelRoomTypeRecord(
    (((hotelRoomTypeResult.data ?? []) as HotelRoomTypeRecord[])[0] ?? null) as HotelRoomTypeRecord | null
  );
  const roomType = normalizeRoomTypeRecord((roomTypeResult.data ?? null) as RoomTypeRecord | null);

  return hotelRoomType.label || roomType.label || fallbackName || "Selected room type";
}

export async function updateGuestBookingLifecycleStatus({
  confirmationCode,
  reservationCode,
  targetStatus,
}: {
  confirmationCode: string;
  reservationCode: string;
  targetStatus: "checked_in" | "checked_out";
}): Promise<{ error: string | null; success: boolean }> {
  const guestContext = await getAuthenticatedGuestContext();

  if (!guestContext.isGuest || !guestContext.guestUserId) {
    return {
      error: guestContext.error || "Please log in as a guest to manage this booking.",
      success: false,
    };
  }

  const normalizedCode = reservationCode.trim().toUpperCase();

  if (!normalizedCode) {
    return {
      error: "Reservation code is missing.",
      success: false,
    };
  }

  const normalizedConfirmationCode = confirmationCode.trim().toUpperCase();

  if (!normalizedConfirmationCode) {
    return {
      error: "Enter your reservation code to confirm this action.",
      success: false,
    };
  }

  if (normalizedConfirmationCode !== normalizedCode) {
    return {
      error: "The entered reservation code does not match this booking.",
      success: false,
    };
  }

  const queryClient = createAdminClient() ?? (await createClient());
  const bookingRecord = await loadGuestBookingRecordByCode({
    guestUserId: guestContext.guestUserId,
    normalizedCode,
    queryClient,
  });

  if (bookingRecord.error) {
    return {
      error: bookingRecord.error,
      success: false,
    };
  }

  if (!bookingRecord.data) {
    return {
      error: "We couldn't find a booking matching that reservation code.",
      success: false,
    };
  }

  const { reservationGroup, reservations } = bookingRecord.data;
  const currentBookingStatus = deriveOperationalBookingStatus(reservations);
  const eligibility = evaluateBookingLifecycleEligibility(reservationGroup, currentBookingStatus);

  if (targetStatus === "checked_in") {
    if (!eligibility.canCheckIn) {
      return {
        error: eligibility.message || "This booking is not eligible for digital check-in yet.",
        success: false,
      };
    }
  }

  if (targetStatus === "checked_out" && !eligibility.canCheckOut) {
    return {
      error: "Only checked-in bookings can be checked out.",
      success: false,
    };
  }

  const nextTimestamp = new Date().toISOString();
  const updatePayload =
    targetStatus === "checked_in"
      ? {
          checked_in_at: nextTimestamp,
          reservation_status: "checked_in",
        }
      : {
          checked_out_at: nextTimestamp,
          reservation_status: "checked_out",
        };

  const reservationIds = reservations.map((reservation) => reservation.id).filter((reservationId) => reservationId > 0);

  if (reservationIds.length === 0) {
    return {
      error: "We couldn't identify the room reservations tied to this booking.",
      success: false,
    };
  }

  const { error: updateError } = await queryClient
    .from("reservations")
    .update(updatePayload)
    .in("id", reservationIds)
    .eq("user_id", guestContext.guestUserId);

  if (updateError) {
    return {
      error: targetStatus === "checked_in" ? "We couldn't complete digital check-in right now." : "We couldn't complete digital check-out right now.",
      success: false,
    };
  }

  const refreshedBookingRecord = await loadGuestBookingRecordByCode({
    guestUserId: guestContext.guestUserId,
    normalizedCode,
    queryClient,
  });

  if (refreshedBookingRecord.error || !refreshedBookingRecord.data) {
    return {
      error:
        targetStatus === "checked_in"
          ? "Your booking status could not be fully updated to checked in."
          : "Your booking status could not be fully updated to checked out.",
      success: false,
    };
  }

  const refreshedStatus = deriveOperationalBookingStatus(refreshedBookingRecord.data.reservations);

  if (refreshedStatus !== targetStatus) {
    return {
      error:
        targetStatus === "checked_in"
          ? "Your booking status could not be fully updated to checked in."
          : "Your booking status could not be fully updated to checked out.",
      success: false,
    };
  }

  return {
    error: null,
    success: true,
  };
}

function normalizeStoredReservation(record: ReservationRecord) {
  const checkIn = asString(record.check_in_date);
  const checkOut = asString(record.check_out_date);
  const parsedCheckIn = parseIsoDateString(checkIn.slice(0, 10));
  const parsedCheckOut = parseIsoDateString(checkOut.slice(0, 10));
  const nights = asNumber(record.nights) || calculateNightsBetweenDates(parsedCheckIn?.date ?? null, parsedCheckOut?.date ?? null);

  return {
    id: asNumber(record.id),
    adults: asNumber(record.adults || 1),
    checkIn: parsedCheckIn?.iso || checkIn.slice(0, 10),
    checkOut: parsedCheckOut?.iso || checkOut.slice(0, 10),
    checkedInAt: asOptionalString(record.checked_in_at),
    checkedOutAt: asOptionalString(record.checked_out_at),
    children: asNumber(record.children || 0),
    hotelId: asString(record.hotel_id),
    nights,
    pricePerNight: asNumber(record.price_per_night),
    reservationCode: asString(record.reservation_code),
    reservationGroupId: asNumber(record.reservation_group_id),
    reservationStatus: asString(record.reservation_status || CANONICAL_RESERVATION_STATUS),
    roomId: asString(record.room_id),
    roomTypeId: asString(record.room_type_id),
    roomTypeName: "",
    totalPrice: asNumber(record.total_price),
  };
}

async function loadGuestBookingRecordByCode({
  guestUserId,
  normalizedCode,
  queryClient,
}: {
  guestUserId: string;
  normalizedCode: string;
  queryClient: unknown;
}) {
  const { data: reservationGroupRow, error: reservationGroupError } = await (queryClient as {
    from: (table: string) => {
      select: (columns: string) => {
        eq: (column: string, value: unknown) => {
          eq: (
            nextColumn: string,
            nextValue: unknown
          ) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>;
        };
      };
    };
  })
    .from("reservation_groups")
    .select("*")
    .eq("reservation_code", normalizedCode)
    .eq("user_id", guestUserId);

  if (reservationGroupError) {
    return {
      data: null,
      error: buildReservationGroupsMigrationError(reservationGroupError.message),
    };
  }

  let reservationGroup = normalizeStoredReservationGroup(
    (((reservationGroupRow ?? []) as ReservationGroupRecord[])[0] ?? null) as ReservationGroupRecord | null
  );

  const reservationRowsByCodeResult = await (queryClient as {
    from: (table: string) => {
      select: (columns: string) => {
        eq: (column: string, value: unknown) => {
          eq: (
            nextColumn: string,
            nextValue: unknown
          ) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>;
        };
      };
    };
  })
    .from("reservations")
    .select("*")
    .eq("reservation_code", normalizedCode)
    .eq("user_id", guestUserId);

  if (reservationRowsByCodeResult.error) {
    return {
      data: null,
      error: "We couldn't load this booking right now.",
    };
  }

  let reservations = ((reservationRowsByCodeResult.data ?? []) as ReservationRecord[]).map(normalizeStoredReservation);

  if (!reservationGroup && reservations.length > 0) {
    const linkedReservationGroupId = reservations.find((reservation) => reservation.reservationGroupId > 0)?.reservationGroupId || 0;

    if (linkedReservationGroupId > 0) {
      const { data: reservationGroupByIdRows, error: reservationGroupByIdError } = await (queryClient as {
        from: (table: string) => {
          select: (columns: string) => {
            eq: (column: string, value: unknown) => {
              eq: (
                nextColumn: string,
                nextValue: unknown
              ) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>;
            };
          };
        };
      })
        .from("reservation_groups")
        .select("*")
        .eq("id", linkedReservationGroupId)
        .eq("user_id", guestUserId);

      if (!reservationGroupByIdError) {
        reservationGroup = normalizeStoredReservationGroup(
          (((reservationGroupByIdRows ?? []) as ReservationGroupRecord[])[0] ?? null) as ReservationGroupRecord | null
        );
      }
    }
  }

  if (reservationGroup && reservations.length === 0) {
    const { data: reservationRowsByGroupId, error: reservationError } = await (queryClient as {
      from: (table: string) => {
        select: (columns: string) => {
          eq: (column: string, value: unknown) => {
            eq: (
              nextColumn: string,
              nextValue: unknown
            ) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>;
          };
        };
      };
    })
      .from("reservations")
      .select("*")
      .eq("reservation_group_id", reservationGroup.id)
      .eq("user_id", guestUserId);

    if (reservationError) {
      return {
        data: null,
        error: "We couldn't load the room allocations for this booking.",
      };
    }

    reservations = ((reservationRowsByGroupId ?? []) as ReservationRecord[]).map(normalizeStoredReservation);
  }

  if (!reservationGroup && reservations.length > 0) {
    reservationGroup = buildReservationGroupFallback(normalizedCode, guestUserId, reservations);
  }

  if (!reservationGroup || reservations.length === 0) {
    return {
      data: null,
      error: null,
    };
  }

  return {
    data: {
      reservationGroup,
      reservations,
    },
    error: null,
  };
}

function deriveOperationalBookingStatus(
  reservations: Array<ReturnType<typeof normalizeStoredReservation>>
): OperationalBookingStatus {
  const statuses = reservations.map((reservation) => reservation.reservationStatus.toLowerCase());

  if (statuses.length > 0 && statuses.every((status) => status === "checked_out")) {
    return "checked_out";
  }

  if (statuses.some((status) => status === "checked_in")) {
    return "checked_in";
  }

  return "confirmed";
}

function evaluateBookingLifecycleEligibility(
  reservationGroup: NonNullable<ReturnType<typeof normalizeStoredReservationGroup>>,
  bookingStatus: OperationalBookingStatus
) {
  const today = startOfDay(new Date());
  const parsedCheckIn = parseIsoDateString(reservationGroup.checkIn);
  const parsedCheckOut = parseIsoDateString(reservationGroup.checkOut);

  if (bookingStatus === "checked_in") {
    return {
      canCheckIn: false,
      canCheckOut: true,
      message: "This stay is currently checked in and can now be checked out when you're ready.",
    };
  }

  if (bookingStatus === "checked_out") {
    return {
      canCheckIn: false,
      canCheckOut: false,
      message: "This stay has already been checked out.",
    };
  }

  if (!parsedCheckIn || !parsedCheckOut) {
    return {
      canCheckIn: false,
      canCheckOut: false,
      message: "We couldn't verify the stay dates for this booking.",
    };
  }

  if (today.getTime() < parsedCheckIn.date.getTime()) {
    return {
      canCheckIn: false,
      canCheckOut: false,
      message: `Digital check-in becomes available on ${reservationGroup.checkIn}.`,
    };
  }

  if (today.getTime() >= parsedCheckOut.date.getTime()) {
    return {
      canCheckIn: false,
      canCheckOut: false,
      message: "This booking is past its check-out date and can no longer be checked in digitally.",
    };
  }

  return {
    canCheckIn: true,
    canCheckOut: false,
    message: "This confirmed booking is eligible for digital check-in.",
  };
}

function normalizeStoredReservationGroup(record: ReservationGroupRecord | null) {
  if (!record) {
    return null;
  }

  const id = asNumber(record.id);
  const checkIn = asString(record.check_in_date);
  const checkOut = asString(record.check_out_date);
  const parsedCheckIn = parseIsoDateString(checkIn.slice(0, 10));
  const parsedCheckOut = parseIsoDateString(checkOut.slice(0, 10));
  const nights =
    asNumber(record.nights) || calculateNightsBetweenDates(parsedCheckIn?.date ?? null, parsedCheckOut?.date ?? null);

  if (id < 1) {
    return null;
  }

  return {
    adults: asNumber(record.adults || 1),
    bookingStatus: asString(record.booking_status || CANONICAL_RESERVATION_GROUP_STATUS),
    checkIn: parsedCheckIn?.iso || checkIn.slice(0, 10),
    checkOut: parsedCheckOut?.iso || checkOut.slice(0, 10),
    children: asNumber(record.children || 0),
    hotelId: asString(record.hotel_id),
    id,
    nights,
    pricePerNight: asNumber(record.price_per_night),
    reservationCode: asString(record.reservation_code),
    selectedRooms: asNumber(record.selected_rooms || 1),
    totalPrice: asNumber(record.total_price),
    userId: asString(record.user_id),
  };
}

function buildReservationGroupFallback(
  reservationCode: string,
  guestUserId: string,
  reservations: ReturnType<typeof normalizeStoredReservation>[]
) {
  const firstReservation = reservations[0];

  if (!firstReservation) {
    return null;
  }

  return {
    adults: firstReservation.adults,
    bookingStatus: firstReservation.reservationStatus,
    checkIn: firstReservation.checkIn,
    checkOut: firstReservation.checkOut,
    children: firstReservation.children,
    hotelId: firstReservation.hotelId,
    id: 0,
    nights: firstReservation.nights,
    pricePerNight: firstReservation.pricePerNight,
    reservationCode,
    selectedRooms: reservations.length,
    totalPrice: reservations.reduce((sum, reservation) => sum + reservation.totalPrice, 0),
    userId: guestUserId,
  };
}

function buildReservationGroupFallbacksFromChildren(
  guestUserId: string,
  reservations: ReturnType<typeof normalizeStoredReservation>[]
) {
  const reservationsByCode = new Map<string, ReturnType<typeof normalizeStoredReservation>[]>();

  for (const reservation of reservations) {
    if (!reservation.reservationCode) {
      continue;
    }

    const existingReservations = reservationsByCode.get(reservation.reservationCode) || [];
    existingReservations.push(reservation);
    reservationsByCode.set(reservation.reservationCode, existingReservations);
  }

  return Array.from(reservationsByCode.entries())
    .map(([reservationCode, groupedReservations]) =>
      buildReservationGroupFallback(reservationCode, guestUserId, groupedReservations)
    )
    .filter((reservationGroup): reservationGroup is NonNullable<typeof reservationGroup> => Boolean(reservationGroup))
    .sort((left, right) => right.checkIn.localeCompare(left.checkIn));
}

function normalizeHotelRecord(record: HotelRecord | null) {
  return {
    name: asString(record?.name || record?.hotel_name || record?.title || ""),
    startingPrice: asNumber(record?.starting_price || record?.price_from || record?.base_price || 0),
  };
}

function normalizeRoomTypeRecord(record: RoomTypeRecord | null) {
  return {
    label: asString(record?.name || record?.room_type || record?.room_type_name || record?.label || record?.type || ""),
    maxCapacity: asNumber(record?.max_capacity || record?.max_occupancy || record?.occupancy || record?.capacity || record?.max_guests || 0),
    pricePerNight: asNumber(record?.price_per_night || record?.base_price || record?.nightly_rate || record?.price || 0),
  };
}

function normalizeHotelRoomTypeRecord(record: HotelRoomTypeRecord | null) {
  return {
    label: asString(record?.name || record?.room_type || record?.room_type_name || record?.label || record?.type || ""),
    maxCapacity: asNumber(record?.max_capacity || record?.max_occupancy || record?.occupancy || record?.capacity || record?.max_guests || 0),
    pricePerNight: asNumber(record?.price_per_night || record?.base_price || record?.nightly_rate || record?.price || 0),
  };
}

function normalizeInventoryRoomRecord(record: ReservationRecord) {
  return {
    pricePerNight: asNumber(record.price_per_night || record.base_price || record.nightly_rate || record.price || 0),
  };
}

function buildReservationGroupsMigrationError(message: string) {
  if (message.toLowerCase().includes("reservation_groups")) {
    return "The grouped-booking database migration is missing. Please apply the reservation_groups migration and try again.";
  }

  return `We couldn't save the grouped booking header: ${message}`;
}

function buildReservationChildrenMigrationError(message: string) {
  const normalizedMessage = message.toLowerCase();

  if (normalizedMessage.includes("reservation_group_id")) {
    return "The grouped-booking database migration is incomplete. Please add reservation_group_id to reservations and try again.";
  }

  return `We couldn't save your reservation using the canonical reservation schema: ${message}`;
}

function buildAtomicReservationRpcError(message: string) {
  const normalizedMessage = message.toLowerCase();

  if (normalizedMessage.includes("create_guest_reservation_atomic")) {
    return "The atomic reservation database function is missing. Please apply the atomic reservation SQL migration and try again.";
  }

  if (normalizedMessage.includes("reservation_group_id")) {
    return buildReservationChildrenMigrationError(message);
  }

  if (normalizedMessage.includes("reservation_groups")) {
    return buildReservationGroupsMigrationError(message);
  }

  if (normalizedMessage.includes("guest_profile_id")) {
    return "Your guest profile could not be linked to the reservation. Please log in again and try once more.";
  }

  if (normalizedMessage.includes("reservations_reservation_code_key") || normalizedMessage.includes("duplicate key value")) {
    return "The grouped booking reservation_code migration is still missing. Please drop the old unique reservation_code constraint on reservations and try again.";
  }

  return `We couldn't confirm your reservation atomically: ${message}`;
}

function normalizeAtomicReservationRpcResult(record: Record<string, unknown> | null) {
  if (!record) {
    return null;
  }

  return {
    actualAvailableRoomCount: asNumber(record.actual_available_room_count),
    bookable: Boolean(record.bookable),
    reason: asString(record.reason),
    reservationCode: asString(record.reservation_code),
    reservationGroupId: asNumber(record.reservation_group_id),
    reservationIds: asNumberArray(record.reservation_ids),
    requestedRoomCount: asNumber(record.requested_room_count),
  };
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

function asNumberArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => asNumber(entry))
    .filter((entry) => entry > 0);
}

function parseNumericIdentifier(value: string) {
  const normalized = value.trim();

  if (!normalized) {
    return 0;
  }

  const parsed = Number(normalized);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

async function signOutBrokenGuestSession() {
  const supabase = await createClient();
  await supabase.auth.signOut();
}

function logBookingCapacityDebug(snapshot: {
  effectiveMaxCapacity: number;
  hotelId: string;
  maxGuestsForSelection: number;
  roomTypeId: string;
  roomTypeLabel: string;
  roomTypeMaxCapacity: number;
  selectedRooms: number;
  totalGuests: number;
}) {
  if (process.env.NODE_ENV === "production") {
    return;
  }

  console.log("[booking-capacity] pre-rpc", snapshot);
}
