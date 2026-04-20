export const STAFF_ROLES = ["reception_staff", "service_staff", "hotel_manager", "admin"] as const;

export type StaffRole = (typeof STAFF_ROLES)[number];

export function isStaffRole(role: string): role is StaffRole {
  return STAFF_ROLES.includes(role as StaffRole);
}

export function isReceptionRole(role: string) {
  return role === "reception_staff";
}

export function isServiceStaffRole(role: string) {
  return role === "service_staff";
}

export function isHotelScopedStaffRole(role: string) {
  return isReceptionRole(role) || isServiceStaffRole(role) || role === "hotel_manager";
}

export function isManagerRole(role: string) {
  return role === "hotel_manager" || role === "admin";
}

export function isServiceRole(role: string) {
  return isReceptionRole(role) || isServiceStaffRole(role) || isManagerRole(role);
}

export function getStaffHomePath(role: string) {
  if (isManagerRole(role)) {
    return "/staff/manager";
  }

  if (isServiceStaffRole(role)) {
    return "/staff/service";
  }

  if (isReceptionRole(role)) {
    return "/staff/reception";
  }

  return "/login";
}
