import "server-only";

import { redirect } from "next/navigation";
import { loadAppUserRecord, loadStaffProfileRecord } from "@/lib/auth/profile-access";
import {
  getStaffHomePath,
  isAdminRole,
  isHotelScopedStaffRole,
  isManagerRole,
  isReceptionRole,
  isServiceStaffRole,
  isStaffRole,
  type StaffRole,
} from "@/lib/auth/staff-roles";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type StaffSessionState = {
  email: string;
  firstName: string;
  fullName: string;
  hasOperationalHotelScope: boolean;
  hotelId: string | null;
  hotelName: string | null;
  id: string;
  jobTitle: string;
  role: StaffRole;
};

function logStaffSessionEvent(
  level: "info" | "error",
  event: string,
  details: Record<string, unknown>
) {
  const logger = level === "error" ? console.error : console.info;
  logger(`[staff-session] ${event}`, details);
}

type StaffSessionResolution =
  | {
      authenticated: false;
      error: null;
      session: null;
    }
  | {
      authenticated: true;
      error: null;
      session: null;
    }
  | {
      authenticated: true;
      error: string;
      session: null;
    }
  | {
      authenticated: true;
      error: null;
      session: StaffSessionState;
    };

export async function requireStaffSession(allowedRoles?: StaffRole[]) {
  const resolution = await loadStaffSessionResolution();

  if (!resolution.authenticated) {
    redirect("/login");
  }

  if (resolution.error || !resolution.session) {
    redirect(`/login?error=${encodeURIComponent(resolution.error || STAFF_ACCOUNT_SCOPE_MESSAGE)}`);
  }

  const session = resolution.session;

  if (allowedRoles && !allowedRoles.includes(session.role)) {
    redirect(getStaffHomePath(session.role));
  }

  return session;
}

export async function getStaffSessionState(): Promise<StaffSessionState | null> {
  const resolution = await loadStaffSessionResolution();
  return resolution.authenticated && !resolution.error ? resolution.session : null;
}

export const STAFF_ACCOUNT_SCOPE_MESSAGE =
  "Your staff account setup is incomplete. Please contact an administrator before using hotel operations.";

export function getStaffOperationalScopeIssue(session: StaffSessionState) {
  if (!isHotelScopedStaffRole(session.role)) {
    return null;
  }

  return session.hotelId ? null : STAFF_ACCOUNT_SCOPE_MESSAGE;
}

export function getStaffOperationalHotelScope(session: StaffSessionState) {
  if (!isHotelScopedStaffRole(session.role)) {
    return null;
  }

  return session.hotelId;
}

async function loadStaffSessionResolution(): Promise<StaffSessionResolution> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    logStaffSessionEvent("info", "no-auth-user", {});
    return {
      authenticated: false,
      error: null,
      session: null,
    };
  }

  const { data: appUser, error: appUserError } = await loadAppUserRecord(
    user.id,
    supabase as unknown as {
      from: (table: string) => {
        select: (columns: string) => {
          eq: (column: string, value: unknown) => {
            maybeSingle: () => PromiseLike<{
              data: Record<string, unknown> | null;
              error: { message: string } | null;
            }>;
          };
        };
      };
    }
  );

  if (appUserError) {
    logStaffSessionEvent("error", "app-user-lookup-failed", {
      message: appUserError.message,
      userId: user.id,
      userEmail: user.email || "",
    });
    return {
      authenticated: true,
      error: "We couldn't verify your staff account right now. Please try again.",
      session: null,
    };
  }

  const resolvedRole = asString(appUser?.role);

  if (!appUser || !isStaffRole(resolvedRole)) {
    logStaffSessionEvent("info", "non-staff-or-missing-app-user", {
      hasAppUser: Boolean(appUser),
      role: resolvedRole || null,
      userId: user.id,
      userEmail: user.email || "",
    });
    return {
      authenticated: true,
      error: null,
      session: null,
    };
  }

  const { data: staffProfile, error: staffProfileError } = await loadStaffProfileRecord(
    user.id,
    supabase as unknown as {
      from: (table: string) => {
        select: (columns: string) => {
          eq: (column: string, value: unknown) => {
            maybeSingle: () => PromiseLike<{
              data: Record<string, unknown> | null;
              error: { message: string } | null;
            }>;
          };
        };
      };
    }
  );

  if (staffProfileError) {
    logStaffSessionEvent("error", "staff-profile-lookup-failed", {
      message: staffProfileError.message,
      role: resolvedRole,
      userId: user.id,
      userEmail: user.email || "",
    });
    return {
      authenticated: true,
      error: "We couldn't verify your staff profile right now. Please try again.",
      session: null,
    };
  }

  const hotelId = asOptionalString(staffProfile?.hotel_id);
  const hasOperationalHotelScope = !isHotelScopedStaffRole(resolvedRole) || Boolean(hotelId);
  const hotelName = hotelId ? await loadStaffHotelName(supabase, hotelId) : null;

  if (!hasOperationalHotelScope) {
    logStaffSessionEvent("info", "missing-hotel-scope", {
      hasStaffProfile: Boolean(staffProfile),
      hotelId: staffProfile?.hotel_id ?? null,
      role: resolvedRole,
      userId: user.id,
      userEmail: user.email || "",
    });
  }

  const firstName = asString(appUser.first_name) || "Staff";
  const lastName = asString(appUser.last_name);
  const fullName = [firstName, lastName].filter(Boolean).join(" ").trim() || firstName;

  logStaffSessionEvent("info", "staff-session-ready", {
    hotelId,
    role: resolvedRole,
    userId: user.id,
    userEmail: user.email || "",
  });

  return {
    authenticated: true,
    error: null,
    session: {
      email: asString(appUser.email || user.email),
      firstName,
      fullName,
      hasOperationalHotelScope,
      hotelId,
      hotelName,
      id: user.id,
      jobTitle: asString(staffProfile?.job_title) || defaultJobTitle(resolvedRole as StaffRole),
      role: resolvedRole as StaffRole,
    },
  };
}

export function getStaffSectionTitle(role: StaffRole) {
  if (isAdminRole(role)) {
    return "Admin";
  }

  if (isManagerRole(role)) {
    return "Manager";
  }

  if (isServiceStaffRole(role)) {
    return "Service";
  }

  if (isReceptionRole(role)) {
    return "Reception";
  }

  return "Staff";
}

function defaultJobTitle(role: StaffRole) {
  switch (role) {
    case "admin":
      return "Administrator";
    case "hotel_manager":
      return "Hotel Manager";
    case "reception_staff":
      return "Reception Staff";
    case "service_staff":
      return "Service Staff";
    default:
      return "Staff";
  }
}

function asString(value: unknown) {
  return typeof value === "string" ? value : value == null ? "" : String(value);
}

function asOptionalString(value: unknown) {
  const normalized = asString(value).trim();
  return normalized ? normalized : null;
}

async function loadStaffHotelName(
  supabase: Awaited<ReturnType<typeof createClient>>,
  hotelId: string
) {
  const readableClient =
    (createAdminClient() as {
      from: (table: string) => {
        select: (columns: string) => {
          eq: (column: string, value: unknown) => PromiseLike<{
            data: Record<string, unknown> | null;
            error: { message: string } | null;
          }> & {
            maybeSingle: () => PromiseLike<{
              data: Record<string, unknown> | null;
              error: { message: string } | null;
            }>;
          };
        };
      };
    } | null) ?? supabase;
  const { data: hotel, error } = await readableClient.from("hotels").select("name").eq("id", hotelId).maybeSingle();

  if (error) {
    logStaffSessionEvent("error", "staff-hotel-lookup-failed", {
      hotelId,
      message: error.message,
    });
    return null;
  }

  return asOptionalString(hotel?.name);
}
