import "server-only";

import { getGuestOwnedBookingOperationalRecord, type GuestOwnedBookingOperationalRecord } from "@/lib/booking/reservations";
import {
  getStaffOperationalHotelScope,
  getStaffOperationalScopeIssue,
  requireStaffSession,
  type StaffSessionState,
} from "@/lib/auth/staff-session";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

type ServiceCategoryRecord = Record<string, unknown>;
type ServiceRequestRecord = Record<string, unknown>;
type ReservationRecord = Record<string, unknown>;
type RoomRecord = Record<string, unknown>;
type HotelRecord = Record<string, unknown>;
type UserRecord = Record<string, unknown>;
type RoomTypeRecord = Record<string, unknown>;

type ServiceRequestStatus = "pending" | "in_progress" | "on_hold" | "completed" | "cancelled";
type ServiceRequestPriority = "low" | "medium" | "high";

export type ServiceCategoryOption = {
  id: string;
  name: string;
};

export type GuestServiceRequestItem = {
  categoryName: string;
  createdAt: string;
  description: string;
  id: number;
  preferredTime: string | null;
  priority: ServiceRequestPriority;
  roomNumber: string;
  status: ServiceRequestStatus;
  updatedAt: string;
};

export type GuestStayServiceRequestState = {
  bookingStatus: string;
  canSubmit: boolean;
  categories: ServiceCategoryOption[];
  disabledReason: string | null;
  requests: GuestServiceRequestItem[];
  reservationCode: string;
};

export type StaffServiceRequestItem = {
  categoryName: string;
  createdAt: string;
  description: string;
  guestName: string;
  guestPhoneNumber: string;
  hotelCity: string;
  hotelName: string;
  id: number;
  preferredTime: string | null;
  priority: ServiceRequestPriority;
  reservationCode: string;
  roomNumber: string;
  roomTypeName: string;
  status: ServiceRequestStatus;
};

export type StaffServiceWorklistState = {
  categories: ServiceCategoryOption[];
  requests: StaffServiceRequestItem[];
  staffSession: StaffSessionState;
  statusFilter: string;
  categoryFilter: string;
};

const ALLOWED_STAFF_SERVICE_ROLES = ["reception_staff", "service_staff", "hotel_manager", "admin"] as const;

export async function getGuestStayServiceRequestState(
  reservationCode: string
): Promise<{ data: GuestStayServiceRequestState | null; error: string | null }> {
  const bookingResult = await getGuestOwnedBookingOperationalRecord(reservationCode);

  if (bookingResult.error || !bookingResult.data) {
    return {
      data: null,
      error: bookingResult.error || "We couldn't load service requests for this stay.",
    };
  }

  const queryClient = createAdminClient() ?? (await createClient());
  const categories = await loadServiceCategories(queryClient);
  const requests = await loadGuestServiceRequests(queryClient, bookingResult.data.reservations);
  const canSubmit = bookingResult.data.bookingStatus === "checked_in";
  const disabledReason = canSubmit
    ? categories.length === 0
      ? "Service categories have not been configured yet, so requests cannot be submitted right now."
      : null
    : "Service requests become available after the stay has been checked in.";

  return {
    data: {
      bookingStatus: bookingResult.data.bookingStatus,
      canSubmit: canSubmit && categories.length > 0,
      categories,
      disabledReason,
      requests,
      reservationCode: bookingResult.data.reservationGroup.reservationCode,
    },
    error: null,
  };
}

export async function createGuestServiceRequest(input: {
  categoryId: string;
  description: string;
  preferredTime: string;
  reservationCode: string;
}): Promise<{ error: string | null; success: boolean }> {
  const bookingResult = await getGuestOwnedBookingOperationalRecord(input.reservationCode);

  if (bookingResult.error || !bookingResult.data) {
    return {
      error: bookingResult.error || "We couldn't find that checked-in booking.",
      success: false,
    };
  }

  if (bookingResult.data.bookingStatus !== "checked_in") {
    return {
      error: "Service requests can only be submitted during an active checked-in stay.",
      success: false,
    };
  }

  const categoryId = parsePositiveInteger(input.categoryId);
  const description = input.description.trim();
  const preferredTime = normalizePreferredTime(input.preferredTime);

  if (!categoryId) {
    return {
      error: "Please choose a service category.",
      success: false,
    };
  }

  if (!description) {
    return {
      error: "Please add a short description for the request.",
      success: false,
    };
  }

  if (input.preferredTime.trim() && !preferredTime) {
    return {
      error: "The preferred time is invalid. Please choose a valid date and time.",
      success: false,
    };
  }

  if (preferredTime && isPreferredTimeInPast(preferredTime)) {
    return {
      error: "Please choose a preferred time that has not already passed.",
      success: false,
    };
  }

  const queryClient = createAdminClient() ?? (await createClient());
  const categories = await loadServiceCategories(queryClient);

  if (!categories.some((category) => parsePositiveInteger(category.id) === categoryId)) {
    return {
      error: "The selected service category is no longer available.",
      success: false,
    };
  }

  const targetReservation = selectTargetReservationForServiceRequest(bookingResult.data.reservations);

  if (!targetReservation) {
    return {
      error: "We couldn't identify a room assignment for this stay.",
      success: false,
    };
  }

  const { error: insertError } = await queryClient.from("service_requests").insert({
    category_id: categoryId,
    created_by_user_id: bookingResult.data.reservationGroup.userId,
    description,
    preferred_time: preferredTime,
    priority: "medium",
    reservation_id: targetReservation.id,
    room_id: parsePositiveInteger(targetReservation.roomId),
    status: "pending",
  });

  if (insertError) {
    return {
      error: `We couldn't submit your service request right now: ${insertError.message}`,
      success: false,
    };
  }

  return {
    error: null,
    success: true,
  };
}

export async function getStaffServiceWorklist(filters: {
  category: string;
  status: string;
}): Promise<{ data: StaffServiceWorklistState; error: string | null }> {
  const staffSession = await requireStaffSession([...ALLOWED_STAFF_SERVICE_ROLES]);
  const scopeIssue = getStaffOperationalScopeIssue(staffSession);

  if (scopeIssue) {
    return {
      data: {
        categories: [],
        categoryFilter: "",
        requests: [],
        staffSession,
        statusFilter: "",
      },
      error: scopeIssue,
    };
  }

  const scopedHotelId = getStaffOperationalHotelScope(staffSession);
  const queryClient = await getStaffServiceQueryClient();
  const normalizedFilters = normalizeStaffServiceFilters(filters);
  const categories = await loadServiceCategories(queryClient);
  const { data: requestRows } = await queryClient
    .from("service_requests")
    .select("*")
    .order("created_at", { ascending: false });

  const requests = ((requestRows ?? []) as ServiceRequestRecord[]).map(normalizeServiceRequestRecord);

  if (requests.length === 0) {
    return {
      data: {
        categories,
        categoryFilter: normalizedFilters.categoryFilter,
        requests: [],
        staffSession,
        statusFilter: normalizedFilters.statusFilter,
      },
      error: null,
    };
  }

  const reservationIds = Array.from(new Set(requests.map((request) => request.reservationId).filter((value) => value > 0)));
  const { data: reservationRows } = await queryClient.from("reservations").select("*").in("id", reservationIds);
  const reservations = ((reservationRows ?? []) as ReservationRecord[]).map(normalizeStaffReservationRecord);
  const filteredReservations = scopedHotelId
    ? reservations.filter((reservation) => reservation.hotelId === scopedHotelId)
    : reservations;
  const scopedReservationIds = new Set(filteredReservations.map((reservation) => reservation.id));
  const scopedRequests = requests.filter((request) => scopedReservationIds.has(request.reservationId));
  const scopedRoomIds = Array.from(new Set(scopedRequests.map((request) => request.roomId).filter((value) => value > 0)));
  const scopedCategoryIds = Array.from(new Set(scopedRequests.map((request) => request.categoryId).filter((value) => value > 0)));
  const guestUserIds = Array.from(new Set(filteredReservations.map((reservation) => reservation.userId).filter(Boolean)));
  const hotelIds = Array.from(new Set(filteredReservations.map((reservation) => reservation.hotelId).filter(Boolean)));
  const roomTypeIds = Array.from(new Set(filteredReservations.map((reservation) => reservation.roomTypeId).filter(Boolean)));
  const { data: roomRows } = scopedRoomIds.length ? await queryClient.from("rooms").select("*").in("id", scopedRoomIds) : { data: [] };
  const { data: hotelRows } = hotelIds.length ? await queryClient.from("hotels").select("*").in("id", hotelIds) : { data: [] };
  const { data: userRows } = guestUserIds.length ? await queryClient.from("users").select("*").in("id", guestUserIds) : { data: [] };
  const { data: categoryRows } = scopedCategoryIds.length
    ? await queryClient.from("service_categories").select("*").in("id", scopedCategoryIds)
    : { data: [] };
  const { data: roomTypeRows } = roomTypeIds.length
    ? await queryClient.from("room_types").select("*").in("id", roomTypeIds)
    : { data: [] };

  const reservationsById = new Map(filteredReservations.map((reservation) => [reservation.id, reservation]));
  const roomsById = new Map(((roomRows ?? []) as RoomRecord[]).map((room) => [asNumber(room.id), normalizeRoomRecord(room)]));
  const hotelsById = new Map(((hotelRows ?? []) as HotelRecord[]).map((hotel) => {
    const normalizedHotel = normalizeHotelRecord(hotel);
    return [normalizedHotel.id, normalizedHotel] as const;
  }));
  const categoriesById = new Map(((categoryRows ?? []) as ServiceCategoryRecord[]).map((category) => [asNumber(category.id), normalizeServiceCategoryRecord(category)]));
  const usersById = new Map(((userRows ?? []) as UserRecord[]).map((user) => [asString(user.id), normalizeUserRecord(user)]));
  const roomTypesById = new Map(((roomTypeRows ?? []) as RoomTypeRecord[]).map((roomType) => [asString(roomType.id), asString(roomType.name || "Selected room type")]));

  const worklist = scopedRequests
    .map((request) => {
      const reservation = reservationsById.get(request.reservationId);

      if (!reservation) {
        return null;
      }

      const hotel = hotelsById.get(reservation.hotelId);
      const guest = usersById.get(reservation.userId);
      const room = roomsById.get(request.roomId);

      return {
        categoryId: request.categoryId,
        categoryName: categoriesById.get(request.categoryId)?.name || "Service Request",
        createdAt: request.createdAt,
        description: request.description,
        guestName: guest?.fullName || "Guest",
        guestPhoneNumber: guest?.phoneNumber || "",
        hotelCity: hotel?.city || "",
        hotelName: hotel?.name || "Selected hotel",
        id: request.id,
        preferredTime: request.preferredTime,
        priority: request.priority,
        reservationCode: reservation.reservationCode,
        roomNumber: room?.roomNumber || "Pending",
        roomTypeName: roomTypesById.get(reservation.roomTypeId) || "Selected room type",
        status: request.status,
      };
    })
    .filter((request): request is StaffServiceRequestItem & { categoryId: number } => Boolean(request))
    .filter((request) => matchesStaffServiceFilters(request, normalizedFilters))
    .map((request) => stripStaffServiceFilterMetadata(request));

  return {
    data: {
      categories,
      categoryFilter: normalizedFilters.categoryFilter,
      requests: worklist,
      staffSession,
      statusFilter: normalizedFilters.statusFilter,
    },
    error: null,
  };
}

export async function updateServiceRequestStatusAsStaff(input: {
  requestId: string;
  targetStatus: string;
}): Promise<{ error: string | null; reservationCode: string | null; success: boolean }> {
  const staffSession = await requireStaffSession([...ALLOWED_STAFF_SERVICE_ROLES]);
  const scopeIssue = getStaffOperationalScopeIssue(staffSession);

  if (scopeIssue) {
    return {
      error: scopeIssue,
      reservationCode: null,
      success: false,
    };
  }

  const scopedHotelId = getStaffOperationalHotelScope(staffSession);
  const requestId = parsePositiveInteger(input.requestId);
  const targetStatus = normalizeServiceRequestStatus(input.targetStatus);

  if (!requestId) {
    return {
      error: "The service request id is invalid.",
      reservationCode: null,
      success: false,
    };
  }

  if (!targetStatus) {
    return {
      error: "The target service request status is invalid.",
      reservationCode: null,
      success: false,
    };
  }

  const queryClient = await getStaffServiceQueryClient();
  const { data: requestRow, error: requestError } = await queryClient
    .from("service_requests")
    .select("*")
    .eq("id", requestId)
    .maybeSingle();

  if (requestError || !requestRow) {
    return {
      error: "We couldn't find that service request.",
      reservationCode: null,
      success: false,
    };
  }

  const request = normalizeServiceRequestRecord(requestRow as ServiceRequestRecord);
  const { data: reservationRow } = await queryClient
    .from("reservations")
    .select("*")
    .eq("id", request.reservationId)
    .maybeSingle();
  const reservation = reservationRow ? normalizeStaffReservationRecord(reservationRow as ReservationRecord) : null;

  if (!reservation) {
    return {
      error: "The booking linked to this service request could not be loaded.",
      reservationCode: null,
      success: false,
    };
  }

  if (scopedHotelId && reservation.hotelId !== scopedHotelId) {
    return {
      error: "This service request is outside your hotel scope.",
      reservationCode: reservation.reservationCode,
      success: false,
    };
  }

  if (!isAllowedServiceStatusTransition(request.status, targetStatus)) {
    return {
      error: `A request in ${formatStatus(request.status)} cannot be moved directly to ${formatStatus(targetStatus)}.`,
      reservationCode: reservation.reservationCode,
      success: false,
    };
  }

  const writableServiceRequestClient = queryClient as unknown as {
    from: (table: string) => {
      update: (payload: unknown) => {
        eq: (column: string, value: unknown) => PromiseLike<{ error: { message: string } | null }>;
      };
    };
  };
  const { error: updateError } = await writableServiceRequestClient
    .from("service_requests")
    .update({
      status: targetStatus,
      updated_at: new Date().toISOString(),
    })
    .eq("id", requestId);

  if (updateError) {
    return {
      error: `We couldn't update the service request right now: ${updateError.message}`,
      reservationCode: reservation.reservationCode,
      success: false,
    };
  }

  return {
    error: null,
    reservationCode: reservation.reservationCode,
    success: true,
  };
}

export function getAllowedStaffStatusTransitions(status: ServiceRequestStatus) {
  switch (status) {
    case "pending":
      return ["in_progress", "cancelled"] as ServiceRequestStatus[];
    case "in_progress":
      return ["completed", "on_hold"] as ServiceRequestStatus[];
    case "on_hold":
      return ["in_progress", "completed"] as ServiceRequestStatus[];
    default:
      return [] as ServiceRequestStatus[];
  }
}

async function loadServiceCategories(queryClient: unknown) {
  const typedQueryClient = queryClient as {
    from: (table: string) => {
      select: (columns: string) => {
        order: (column: string, options: { ascending: boolean }) => PromiseLike<{ data: unknown[] | null }>;
      };
    };
  };
  const { data: categoryRows } = await typedQueryClient
    .from("service_categories")
    .select("*")
    .order("name", { ascending: true });
  return ((categoryRows ?? []) as ServiceCategoryRecord[]).map((category) => normalizeServiceCategoryRecord(category));
}

async function loadGuestServiceRequests(
  queryClient: unknown,
  reservations: GuestOwnedBookingOperationalRecord["reservations"]
) {
  const typedQueryClient = queryClient as {
    from: (table: string) => {
      select: (columns: string) => {
        in: (
          column: string,
          values: number[]
        ) => PromiseLike<{ data: unknown[] | null }> & {
          order: (orderColumn: string, options: { ascending: boolean }) => PromiseLike<{ data: unknown[] | null }>;
        };
      };
    };
  };
  const reservationIds = reservations.map((reservation) => reservation.id).filter((value) => value > 0);

  if (reservationIds.length === 0) {
    return [];
  }

  const requestRowsResult = await typedQueryClient
    .from("service_requests")
    .select("*")
    .in("reservation_id", reservationIds)
    .order("created_at", { ascending: false });
  const requests = (((requestRowsResult?.data ?? []) as ServiceRequestRecord[]) ?? []).map(normalizeServiceRequestRecord);
  const categoryIds = Array.from(new Set(requests.map((request) => request.categoryId).filter((value) => value > 0)));
  const roomIds = Array.from(new Set(requests.map((request) => request.roomId).filter((value) => value > 0)));
  const categoryRowsResult = categoryIds.length
    ? await typedQueryClient.from("service_categories").select("*").in("id", categoryIds)
    : { data: [] as unknown[] };
  const roomRowsResult = roomIds.length
    ? await typedQueryClient.from("rooms").select("*").in("id", roomIds)
    : { data: [] as unknown[] };
  const categoriesById = new Map(
    (((categoryRowsResult.data ?? []) as ServiceCategoryRecord[]) ?? []).map((category) => [
      asNumber(category.id),
      normalizeServiceCategoryRecord(category),
    ])
  );
  const roomsById = new Map(
    (((roomRowsResult.data ?? []) as RoomRecord[]) ?? []).map((room) => [asNumber(room.id), normalizeRoomRecord(room)])
  );

  return requests.map((request) => ({
    categoryName: categoriesById.get(request.categoryId)?.name || "Service Request",
    createdAt: request.createdAt,
    description: request.description,
    id: request.id,
    preferredTime: request.preferredTime,
    priority: request.priority,
    roomNumber: roomsById.get(request.roomId)?.roomNumber || "Pending",
    status: request.status,
    updatedAt: request.updatedAt,
  }));
}

function selectTargetReservationForServiceRequest(reservations: GuestOwnedBookingOperationalRecord["reservations"]) {
  const checkedInReservations = reservations.filter((reservation) => reservation.reservationStatus.toLowerCase() === "checked_in");
  const candidateReservations = checkedInReservations.length > 0 ? checkedInReservations : reservations;

  return candidateReservations
    .filter((reservation) => reservation.id > 0 && parsePositiveInteger(reservation.roomId) > 0)
    .sort((left, right) => parsePositiveInteger(left.roomId) - parsePositiveInteger(right.roomId))[0];
}

function normalizeServiceCategoryRecord(record: ServiceCategoryRecord): ServiceCategoryOption {
  return {
    id: asString(record.id),
    name: asString(record.name || "Service Request"),
  };
}

function normalizeServiceRequestRecord(record: ServiceRequestRecord) {
  return {
    categoryId: asNumber(record.category_id),
    createdAt: asString(record.created_at),
    description: asString(record.description),
    id: asNumber(record.id),
    preferredTime: asOptionalString(record.preferred_time),
    priority: normalizeServiceRequestPriority(record.priority),
    reservationId: asNumber(record.reservation_id),
    roomId: asNumber(record.room_id),
    status: normalizeServiceRequestStatus(record.status) || "pending",
    updatedAt: asString(record.updated_at),
  };
}

function normalizeStaffReservationRecord(record: ReservationRecord) {
  return {
    hotelId: asString(record.hotel_id),
    id: asNumber(record.id),
    reservationCode: asString(record.reservation_code),
    roomTypeId: asString(record.room_type_id),
    userId: asString(record.user_id),
  };
}

function normalizeRoomRecord(record: RoomRecord) {
  return {
    roomNumber: asString(record.room_number),
  };
}

function normalizeHotelRecord(record: HotelRecord) {
  return {
    city: asString(record.city),
    id: asString(record.id),
    name: asString(record.name || "Selected hotel"),
  };
}

function normalizeUserRecord(record: UserRecord) {
  const firstName = asString(record.first_name);
  const lastName = asString(record.last_name);
  return {
    fullName: [firstName, lastName].filter(Boolean).join(" ").trim() || firstName || "Guest",
    phoneNumber: asString(record.phone_number),
  };
}

async function getStaffServiceQueryClient() {
  const adminClient = createAdminClient();

  if (adminClient) {
    return adminClient;
  }

  throw new Error(
    "Staff service-request operations require the Supabase service role key so operational worklists can be loaded safely."
  );
}

function normalizePreferredTime(value: string) {
  const normalized = value.trim();

  if (!normalized) {
    return null;
  }

  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function isPreferredTimeInPast(value: string) {
  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return false;
  }

  return parsed.getTime() < Date.now();
}

function normalizeServiceRequestStatus(value: unknown): ServiceRequestStatus | null {
  const normalized = asString(value).toLowerCase();

  if (["pending", "in_progress", "on_hold", "completed", "cancelled"].includes(normalized)) {
    return normalized as ServiceRequestStatus;
  }

  return null;
}

function normalizeServiceRequestPriority(value: unknown): ServiceRequestPriority {
  const normalized = asString(value).toLowerCase();

  if (normalized === "low" || normalized === "high") {
    return normalized;
  }

  return "medium";
}

function normalizeStaffServiceFilters(filters: {
  category: string;
  status: string;
}) {
  const statusFilter = normalizeServiceRequestStatus(filters.status) || "";
  const categoryFilter = parsePositiveInteger(filters.category);

  return {
    categoryFilter: categoryFilter > 0 ? String(categoryFilter) : "",
    categoryId: categoryFilter,
    statusFilter,
  };
}

function matchesStaffServiceFilters(
  request: {
    categoryId: number;
    status: ServiceRequestStatus;
  },
  filters: {
    categoryId: number;
    statusFilter: string;
  }
) {
  if (filters.statusFilter && request.status !== filters.statusFilter) {
    return false;
  }

  if (filters.categoryId > 0 && request.categoryId !== filters.categoryId) {
    return false;
  }

  return true;
}

function stripStaffServiceFilterMetadata(
  request: StaffServiceRequestItem & { categoryId: number }
): StaffServiceRequestItem {
  return {
    categoryName: request.categoryName,
    createdAt: request.createdAt,
    description: request.description,
    guestName: request.guestName,
    guestPhoneNumber: request.guestPhoneNumber,
    hotelCity: request.hotelCity,
    hotelName: request.hotelName,
    id: request.id,
    preferredTime: request.preferredTime,
    priority: request.priority,
    reservationCode: request.reservationCode,
    roomNumber: request.roomNumber,
    roomTypeName: request.roomTypeName,
    status: request.status,
  };
}

function isAllowedServiceStatusTransition(currentStatus: ServiceRequestStatus, nextStatus: ServiceRequestStatus) {
  return getAllowedStaffStatusTransitions(currentStatus).includes(nextStatus);
}

function formatStatus(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

function parsePositiveInteger(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(String(value || "").trim());
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
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
