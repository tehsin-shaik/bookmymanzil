import "server-only";

import {
  getStaffOperationalHotelScope,
  getStaffOperationalScopeIssue,
  requireStaffSession,
  type StaffSessionState,
} from "@/lib/auth/staff-session";
import { createAdminClient } from "@/lib/supabase/admin";

type ReservationGroupRecord = Record<string, unknown>;
type ReservationRecord = Record<string, unknown>;
type UserRecord = Record<string, unknown>;
type HotelRecord = Record<string, unknown>;
type RoomRecord = Record<string, unknown>;
type RoomTypeRecord = Record<string, unknown>;
type NormalizedReservationGroupRecord = ReturnType<typeof normalizeReservationGroupRecord>;
type NormalizedReservationRecord = ReturnType<typeof normalizeReservationRecord>;
const RECEPTION_OPERATION_ROLES = ["reception_staff", "hotel_manager", "admin"] as const;

type StaffOperationalStatus = "confirmed" | "checked_in" | "checked_out" | "cancelled";

export type StaffReservationSummary = {
  checkIn: string;
  checkOut: string;
  guestName: string;
  guestEmail: string;
  hotelName: string;
  reservationCode: string;
  roomCount: number;
  status: StaffOperationalStatus;
  totalPrice: number;
};

export type StaffReservationDetail = {
  checkIn: string;
  checkOut: string;
  checkedInAt: string | null;
  checkedOutAt: string | null;
  city: string;
  guestEmail: string;
  guestName: string;
  guestPhoneNumber: string;
  hotelId: string;
  hotelName: string;
  nights: number;
  reservationCode: string;
  reservationIds: number[];
  roomCount: number;
  roomIds: string[];
  roomNumbers: string[];
  roomTypeName: string;
  status: StaffOperationalStatus;
  totalGuests: number;
  totalPrice: number;
};

export type ManagerOverview = {
  bookingCount: number;
  guestCount: number;
  recentBookings: StaffReservationSummary[];
  roomStatusBreakdown: Array<{ count: number; label: string }>;
};

export async function searchReservationsForStaff(searchTerm: string) {
  const staffSession = await requireStaffSession([...RECEPTION_OPERATION_ROLES]);
  const scopeIssue = getStaffOperationalScopeIssue(staffSession);

  if (scopeIssue) {
    return {
      error: scopeIssue,
      searchTerm,
      staffSession,
      results: [],
    };
  }

  const reservationGroups = await loadScopedReservationGroups(staffSession);
  const records = await hydrateStaffReservationRecords(staffSession, reservationGroups);
  const normalizedQuery = searchTerm.trim().toLowerCase();

  const filteredRecords = normalizedQuery
    ? records.filter((record) => {
        const haystack = [
          record.reservationCode,
          record.guestName,
          record.guestEmail,
          record.hotelName,
        ]
          .join(" ")
          .toLowerCase();
        return haystack.includes(normalizedQuery);
      })
    : records;

  return {
    error: null,
    searchTerm,
    staffSession,
    results: filteredRecords
      .sort((left, right) => right.checkIn.localeCompare(left.checkIn))
      .map((record) => ({
        checkIn: record.checkIn,
        checkOut: record.checkOut,
        guestEmail: record.guestEmail,
        guestName: record.guestName,
        hotelName: record.hotelName,
        reservationCode: record.reservationCode,
        roomCount: record.roomCount,
        status: record.status,
        totalPrice: record.totalPrice,
      })),
  };
}

export async function getStaffReservationDetail(reservationCode: string) {
  const staffSession = await requireStaffSession([...RECEPTION_OPERATION_ROLES]);
  const normalizedCode = reservationCode.trim().toUpperCase();
  const scopeIssue = getStaffOperationalScopeIssue(staffSession);

  if (scopeIssue) {
    return {
      data: null,
      error: scopeIssue,
      staffSession,
    };
  }

  if (!normalizedCode) {
    return {
      data: null,
      error: "Reservation code is missing.",
      staffSession,
    };
  }

  const reservationGroups = await loadScopedReservationGroups(staffSession, normalizedCode);
  const records = await hydrateStaffReservationRecords(staffSession, reservationGroups);
  const record = records.find((reservation) => reservation.reservationCode === normalizedCode) || null;

  return {
    data: record,
    error: record ? null : "We couldn't find a reservation matching that code for your staff access scope.",
    staffSession,
  };
}

export async function updateReservationLifecycleAsStaff({
  confirmationCode,
  reservationCode,
  targetStatus,
}: {
  confirmationCode: string;
  reservationCode: string;
  targetStatus: "checked_in" | "checked_out";
}): Promise<{ error: string | null; success: boolean }> {
  const staffSession = await requireStaffSession([...RECEPTION_OPERATION_ROLES]);
  const scopeIssue = getStaffOperationalScopeIssue(staffSession);

  if (scopeIssue) {
    return {
      error: scopeIssue,
      success: false,
    };
  }

  const normalizedCode = reservationCode.trim().toUpperCase();
  const normalizedConfirmationCode = confirmationCode.trim().toUpperCase();

  if (!normalizedCode) {
    return {
      error: "Reservation code is missing.",
      success: false,
    };
  }

  if (!normalizedConfirmationCode) {
    return {
      error: "Enter the reservation code to confirm this action.",
      success: false,
    };
  }

  if (normalizedConfirmationCode !== normalizedCode) {
    return {
      error: "The entered reservation code does not match this booking.",
      success: false,
    };
  }

  const detailResult = await getStaffReservationDetail(normalizedCode);

  if (detailResult.error || !detailResult.data) {
    return {
      error: detailResult.error || "We couldn't load that reservation.",
      success: false,
    };
  }

  const record = detailResult.data;

  if (targetStatus === "checked_in" && record.status !== "confirmed") {
    return {
      error: "Only confirmed reservations can be checked in.",
      success: false,
    };
  }

  if (targetStatus === "checked_out" && record.status !== "checked_in") {
    return {
      error: "Only checked-in reservations can be checked out.",
      success: false,
    };
  }

  const queryClient = await getStaffOperationalQueryClient();
  const nextTimestamp = new Date().toISOString();
  const reservationUpdate =
    targetStatus === "checked_in"
      ? {
          checked_in_at: nextTimestamp,
          reservation_status: "checked_in",
        }
      : {
          checked_out_at: nextTimestamp,
          reservation_status: "checked_out",
        };
  const roomStatus = targetStatus === "checked_in" ? "occupied" : "available";
  const reservationIds = record.reservationIds.filter((reservationId) => reservationId > 0);

  if (reservationIds.length === 0) {
    return {
      error: "We couldn't identify the room reservations tied to this booking.",
      success: false,
    };
  }

  const writableReservationClient = queryClient as unknown as {
    from: (table: string) => {
      update: (payload: unknown) => {
        in: (column: string, values: unknown[]) => PromiseLike<{ error: { message: string } | null }>;
      };
    };
  };
  const { error: reservationUpdateError } = await writableReservationClient
    .from("reservations")
    .update(reservationUpdate)
    .in("id", reservationIds);

  if (reservationUpdateError) {
    return {
      error: targetStatus === "checked_in" ? "We couldn't complete staff check-in right now." : "We couldn't complete staff check-out right now.",
      success: false,
    };
  }

  if (record.roomIds.length > 0) {
    const roomIds = record.roomIds.filter(Boolean);

    if (roomIds.length > 0) {
      const writableRoomClient = queryClient as unknown as {
        from: (table: string) => {
          update: (payload: unknown) => {
            in: (column: string, values: unknown[]) => PromiseLike<{ error: { message: string } | null }>;
          };
        };
      };
      const { error: roomStatusError } = await writableRoomClient
        .from("rooms")
        .update({ status: roomStatus })
        .in("id", roomIds);

      if (roomStatusError) {
        return {
          error: "The reservation was updated, but the room status could not be synchronized.",
          success: false,
        };
      }
    }
  }

  const refreshedDetailResult = await getStaffReservationDetail(normalizedCode);

  if (refreshedDetailResult.error || !refreshedDetailResult.data) {
    return {
      error:
        targetStatus === "checked_in"
          ? "The reservation was updated, but we couldn't confirm the checked-in state afterward."
          : "The reservation was updated, but we couldn't confirm the checked-out state afterward.",
      success: false,
    };
  }

  if (refreshedDetailResult.data.status !== targetStatus) {
    return {
      error:
        targetStatus === "checked_in"
          ? "The reservation status could not be fully updated to checked in."
          : "The reservation status could not be fully updated to checked out.",
      success: false,
    };
  }

  return {
    error: null,
    success: true,
  };
}

export async function getManagerOverview() {
  const staffSession = await requireStaffSession(["hotel_manager", "admin"]);
  const reservationGroups = await loadScopedReservationGroups(staffSession);
  const records = await hydrateStaffReservationRecords(staffSession, reservationGroups);
  const queryClient = await getStaffOperationalQueryClient();
  const scopedHotelId = getStaffOperationalHotelScope(staffSession);
  const roomsQuery = scopedHotelId
    ? queryClient.from("rooms").select("*").eq("hotel_id", scopedHotelId)
    : queryClient.from("rooms").select("*");
  const { data: roomsData } = await roomsQuery;
  const roomStatusCounts = new Map<string, number>();

  for (const room of ((roomsData ?? []) as RoomRecord[])) {
    const status = asString(room.status || "available").toLowerCase() || "available";
    roomStatusCounts.set(status, (roomStatusCounts.get(status) || 0) + 1);
  }

  return {
    data: {
      bookingCount: records.length,
      guestCount: new Set(records.map((record) => record.guestEmail || record.guestName)).size,
      recentBookings: records
        .sort((left, right) => right.checkIn.localeCompare(left.checkIn))
        .slice(0, 8)
        .map((record) => ({
          checkIn: record.checkIn,
          checkOut: record.checkOut,
          guestEmail: record.guestEmail,
          guestName: record.guestName,
          hotelName: record.hotelName,
          reservationCode: record.reservationCode,
          roomCount: record.roomCount,
          status: record.status,
          totalPrice: record.totalPrice,
        })),
      roomStatusBreakdown: Array.from(roomStatusCounts.entries()).map(([label, count]) => ({
        count,
        label: formatStatus(label),
      })),
    } satisfies ManagerOverview,
    staffSession,
  };
}

async function loadScopedReservationGroups(staffSession: StaffSessionState, reservationCode?: string) {
  const scopeIssue = getStaffOperationalScopeIssue(staffSession);

  if (scopeIssue) {
    return [];
  }

  const queryClient = await getStaffOperationalQueryClient();
  const scopedHotelId = getStaffOperationalHotelScope(staffSession);
  let reservationGroupsQuery = queryClient.from("reservation_groups").select("*");
  let reservationsQuery = queryClient.from("reservations").select("*");

  if (scopedHotelId) {
    reservationGroupsQuery = reservationGroupsQuery.eq("hotel_id", scopedHotelId);
    reservationsQuery = reservationsQuery.eq("hotel_id", scopedHotelId);
  }

  if (reservationCode) {
    reservationGroupsQuery = reservationGroupsQuery.eq("reservation_code", reservationCode);
    reservationsQuery = reservationsQuery.eq("reservation_code", reservationCode);
  }

  const [{ data: reservationGroupsData }, { data: reservationsData }] = await Promise.all([
    reservationGroupsQuery,
    reservationsQuery,
  ]);
  const reservationGroups = ((reservationGroupsData ?? []) as ReservationGroupRecord[]).map(normalizeReservationGroupRecord);
  const reservations = ((reservationsData ?? []) as ReservationRecord[]).map(normalizeReservationRecord);
  const groupsByCode = new Map(reservationGroups.map((group) => [group.reservationCode, group]));

  for (const [reservationCodeKey, groupedReservations] of groupReservationsByCode(reservations).entries()) {
    if (groupsByCode.has(reservationCodeKey)) {
      continue;
    }

    const fallbackGroup = buildReservationGroupFallbackFromChildren(groupedReservations);

    if (fallbackGroup) {
      groupsByCode.set(reservationCodeKey, fallbackGroup);
    }
  }

  return Array.from(groupsByCode.values());
}

async function hydrateStaffReservationRecords(
  staffSession: StaffSessionState,
  reservationGroups: NormalizedReservationGroupRecord[]
) {
  if (reservationGroups.length === 0) {
    return [];
  }

  const queryClient = await getStaffOperationalQueryClient();
  const reservationGroupIds = reservationGroups.map((group) => group.id);
  const userIds = Array.from(new Set(reservationGroups.map((group) => group.userId).filter(Boolean)));
  const hotelIds = Array.from(new Set(reservationGroups.map((group) => group.hotelId).filter(Boolean)));
  const { data: reservationsData } = await queryClient
    .from("reservations")
    .select("*")
    .in("reservation_group_id", reservationGroupIds);
  const { data: usersData } = userIds.length
    ? await queryClient.from("users").select("*").in("id", userIds)
    : { data: [] };
  const { data: hotelsData } = hotelIds.length
    ? await queryClient.from("hotels").select("*").in("id", hotelIds)
    : { data: [] };
  const reservations = ((reservationsData ?? []) as ReservationRecord[]).map(normalizeReservationRecord);
  const roomIds = Array.from(new Set(reservations.map((reservation) => reservation.roomId).filter(Boolean)));
  const roomTypeIds = Array.from(new Set(reservations.map((reservation) => reservation.roomTypeId).filter(Boolean)));
  const { data: roomsData } = roomIds.length ? await queryClient.from("rooms").select("*").in("id", roomIds) : { data: [] };
  const { data: roomTypesData } = roomTypeIds.length
    ? await queryClient.from("room_types").select("*").in("id", roomTypeIds)
    : { data: [] };

  const usersById = new Map(((usersData ?? []) as UserRecord[]).map((user) => [asString(user.id), normalizeUserRecord(user)]));
  const hotelsById = new Map(((hotelsData ?? []) as HotelRecord[]).map((hotel) => {
    const normalizedHotel = normalizeHotelRecord(hotel);
    return [normalizedHotel.id, normalizedHotel] as const;
  }));
  const roomsById = new Map(((roomsData ?? []) as RoomRecord[]).map((room) => [asString(room.id), normalizeRoomRecord(room)]));
  const roomTypesById = new Map(
    ((roomTypesData ?? []) as RoomTypeRecord[]).map((roomType) => [asString(roomType.id), asString(roomType.name || "Selected room type")])
  );

  return reservationGroups.map((group) => {
    const childReservations = reservations.filter((reservation) =>
      group.id > 0
        ? reservation.reservationGroupId === group.id
        : reservation.reservationCode === group.reservationCode
    );
    const firstReservation = childReservations[0];
    const guest = usersById.get(group.userId) || {
      email: "",
      fullName: "Guest",
      phoneNumber: "",
    };
    const hotel = hotelsById.get(group.hotelId);
    const roomNumbers = childReservations
      .map((reservation) => roomsById.get(reservation.roomId)?.roomNumber || "")
      .filter(Boolean);

    return {
      checkIn: group.checkIn,
      checkOut: group.checkOut,
      checkedInAt: firstReservation?.checkedInAt || null,
      checkedOutAt: firstReservation?.checkedOutAt || null,
      city: hotel?.city || "",
      guestEmail: guest.email,
      guestName: guest.fullName,
      guestPhoneNumber: guest.phoneNumber,
      hotelId: group.hotelId,
      hotelName: hotel?.name || "Selected hotel",
      nights: group.nights,
      reservationCode: group.reservationCode,
      reservationIds: childReservations.map((reservation) => reservation.id).filter((reservationId) => reservationId > 0),
      roomCount: childReservations.length || group.selectedRooms,
      roomIds: childReservations.map((reservation) => reservation.roomId).filter(Boolean),
      roomNumbers,
      roomTypeName: roomTypesById.get(firstReservation?.roomTypeId || "") || "Selected room type",
      status: deriveReservationStatus(childReservations),
      totalGuests: group.adults + group.children,
      totalPrice: group.totalPrice,
    } satisfies StaffReservationDetail;
  });
}

function normalizeReservationGroupRecord(record: ReservationGroupRecord) {
  return {
    adults: asNumber(record.adults),
    checkIn: asString(record.check_in_date),
    checkOut: asString(record.check_out_date),
    children: asNumber(record.children),
    hotelId: asString(record.hotel_id),
    id: asNumber(record.id),
    nights: asNumber(record.nights),
    reservationCode: asString(record.reservation_code),
    selectedRooms: asNumber(record.selected_rooms),
    totalPrice: asNumber(record.total_price),
    userId: asString(record.user_id),
  };
}

function normalizeReservationRecord(record: ReservationRecord) {
  return {
    adults: asNumber(record.adults),
    checkIn: asString(record.check_in_date),
    checkOut: asString(record.check_out_date),
    children: asNumber(record.children),
    id: asNumber(record.id),
    checkedInAt: asOptionalString(record.checked_in_at),
    checkedOutAt: asOptionalString(record.checked_out_at),
    hotelId: asString(record.hotel_id),
    nights: asNumber(record.nights),
    reservationGroupId: asNumber(record.reservation_group_id),
    reservationCode: asString(record.reservation_code),
    reservationStatus: asString(record.reservation_status || "confirmed"),
    roomId: asString(record.room_id),
    roomTypeId: asString(record.room_type_id),
    totalPrice: asNumber(record.total_price),
    userId: asString(record.user_id),
  };
}

function normalizeUserRecord(record: UserRecord) {
  const firstName = asString(record.first_name);
  const lastName = asString(record.last_name);
  return {
    email: asString(record.email),
    fullName: [firstName, lastName].filter(Boolean).join(" ").trim() || firstName || "Guest",
    phoneNumber: asString(record.phone_number),
  };
}

function normalizeRoomRecord(record: RoomRecord) {
  return {
    roomNumber: asString(record.room_number),
    status: asString(record.status || "available"),
  };
}

function normalizeHotelRecord(record: HotelRecord) {
  return {
    city: asString(record.city),
    id: asString(record.id),
    name: asString(record.name || "Selected hotel"),
  };
}

async function getStaffOperationalQueryClient() {
  const adminClient = createAdminClient();

  if (!adminClient) {
    throw new Error(
      "Staff operations require the Supabase service role key so reservation and service-request data can be accessed safely."
    );
  }

  return adminClient;
}

function groupReservationsByCode(reservations: NormalizedReservationRecord[]) {
  const reservationsByCode = new Map<string, NormalizedReservationRecord[]>();

  for (const reservation of reservations) {
    if (!reservation.reservationCode) {
      continue;
    }

    const existingReservations = reservationsByCode.get(reservation.reservationCode) || [];
    existingReservations.push(reservation);
    reservationsByCode.set(reservation.reservationCode, existingReservations);
  }

  return reservationsByCode;
}

function buildReservationGroupFallbackFromChildren(reservations: NormalizedReservationRecord[]) {
  const firstReservation = reservations[0];

  if (!firstReservation) {
    return null;
  }

  return {
    adults: firstReservation.adults,
    checkIn: firstReservation.checkIn,
    checkOut: firstReservation.checkOut,
    children: firstReservation.children,
    hotelId: firstReservation.hotelId,
    id: 0,
    nights: firstReservation.nights,
    reservationCode: firstReservation.reservationCode,
    selectedRooms: reservations.length,
    totalPrice: reservations.reduce((sum, reservation) => sum + reservation.totalPrice, 0),
    userId: firstReservation.userId,
  };
}

function deriveReservationStatus(reservations: NormalizedReservationRecord[]): StaffOperationalStatus {
  const statuses = reservations.map((reservation) => reservation.reservationStatus.toLowerCase());

  if (statuses.length > 0 && statuses.every((status) => status === "checked_out")) {
    return "checked_out";
  }

  if (statuses.some((status) => status === "checked_in")) {
    return "checked_in";
  }

  if (statuses.every((status) => status === "cancelled")) {
    return "cancelled";
  }

  return "confirmed";
}

function formatStatus(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (character) => character.toUpperCase());
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
