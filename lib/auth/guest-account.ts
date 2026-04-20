import "server-only";

import type { User } from "@supabase/supabase-js";
import { loadAppUserRecord, loadGuestProfileRecord } from "@/lib/auth/profile-access";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

type WritableSupabaseClient = {
  from: (table: string) => {
    insert: (payload: unknown) => PromiseLike<{ error: { message: string } | null }>;
    select: (columns: string) => {
      eq: (column: string, value: unknown) => {
        maybeSingle: () => PromiseLike<{ data: Record<string, unknown> | null; error: { message: string } | null }>;
      };
    };
  };
};

export type GuestAccountRecord = {
  email: string;
  firstName: string;
  fullName: string;
  id: string;
  phoneNumber: string;
};

export type GuestAccountResolution =
  | {
      authenticated: true;
      error: null;
      guestAccount: GuestAccountRecord;
      isGuest: true;
      repaired: boolean;
      role: "guest";
    }
  | {
      authenticated: boolean;
      error: null;
      guestAccount: null;
      isGuest: false;
      repaired: false;
      role: string | null;
    }
  | {
      authenticated: true;
      error: string;
      guestAccount: null;
      isGuest: false;
      repaired: false;
      role: string | null;
    };

export async function ensureGuestAccountForUser(
  user: User,
  fallbackClient?: WritableSupabaseClient
): Promise<GuestAccountResolution> {
  const supabase = fallbackClient ?? (await createWritableSupabaseClient());
  const { data: existingAppUser, error: existingAppUserError } = await loadAppUserRecord(
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

  if (existingAppUserError) {
    logGuestAccountEvent("error", "guest-app-user-select-failed", {
      email: user.email?.toLowerCase() || "",
      message: existingAppUserError.message,
      userId: user.id,
    });
    return {
      authenticated: true,
      error: "We couldn't verify your guest account just now. Please log in again and try once more.",
      guestAccount: null,
      isGuest: false,
      repaired: false,
      role: null,
    };
  }

  if (existingAppUser && readString(existingAppUser.role) !== "guest") {
    return {
      authenticated: true,
      error: null,
      guestAccount: null,
      isGuest: false,
      repaired: false,
      role: readString(existingAppUser.role) || null,
    };
  }

  const { firstName, lastName } = deriveGuestNameParts(user);
  const phoneNumber = getMetadataString(user, "phone_number");
  let resolvedAppUser = existingAppUser;

  if (!existingAppUser) {
    const { error: createUserError } = await createAppUserRecord({
      email: user.email?.toLowerCase() || "",
      firstName,
      id: user.id,
      lastName,
      phoneNumber,
      role: "guest",
      supabase,
    });

    if (createUserError) {
      logGuestAccountEvent("error", "guest-app-user-insert-failed", {
        email: user.email?.toLowerCase() || "",
        message: createUserError.message,
        userId: user.id,
      });
      return {
        authenticated: true,
        error: `We couldn't finish setting up your guest account: ${createUserError.message}`,
        guestAccount: null,
        isGuest: false,
        repaired: false,
        role: null,
      };
    }

    resolvedAppUser = {
      first_name: firstName,
      id: user.id,
      last_name: lastName,
      phone_number: phoneNumber,
      role: "guest",
    };
  }

  const { data: existingGuestProfile, error: existingGuestProfileError } = await loadGuestProfileRecord(
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

  if (existingGuestProfileError) {
    logGuestAccountEvent("error", "guest-profile-select-failed", {
      email: user.email?.toLowerCase() || "",
      message: existingGuestProfileError.message,
      userId: user.id,
    });
    return {
      authenticated: true,
      error: "We couldn't verify your guest profile just now. Please log in again and try once more.",
      guestAccount: null,
      isGuest: false,
      repaired: false,
      role: "guest",
    };
  }

  if (!existingGuestProfile) {
    const { error: createGuestProfileError } = await supabase.from("guest_profiles").insert({
      user_id: user.id,
      passport_number: getMetadataString(user, "passport_number") || null,
      loyalty_points: 0,
      preferred_contact_method: getMetadataString(user, "preferred_contact_method") || null,
      preferences: getMetadataString(user, "preferences") || null,
    });

    if (createGuestProfileError) {
      logGuestAccountEvent("error", "guest-profile-insert-failed", {
        email: user.email?.toLowerCase() || "",
        message: createGuestProfileError.message,
        userId: user.id,
      });
      return {
        authenticated: true,
        error: `We couldn't finish setting up your guest profile: ${createGuestProfileError.message}`,
        guestAccount: null,
        isGuest: false,
        repaired: false,
        role: "guest",
      };
    }
  }

  return {
    authenticated: true,
    error: null,
    guestAccount: {
      email: user.email?.toLowerCase() || "",
      firstName: readString(resolvedAppUser?.first_name) || firstName || "Guest",
      fullName:
        [readString(resolvedAppUser?.first_name) || firstName, readString(resolvedAppUser?.last_name) || lastName]
          .filter(Boolean)
          .join(" ")
          .trim() || "Guest User",
      id: user.id,
      phoneNumber: readString(resolvedAppUser?.phone_number) || phoneNumber,
    },
    isGuest: true,
    repaired: !existingAppUser || !existingGuestProfile,
    role: "guest",
  };
}

export async function loadAuthenticatedGuestAccount() {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return {
      authenticated: false,
      error: null,
      guestAccount: null,
      isGuest: false,
      repaired: false,
      role: null,
    } as const;
  }

  return ensureGuestAccountForUser(user, supabase as unknown as WritableSupabaseClient);
}

async function createWritableSupabaseClient() {
  return (createAdminClient() as WritableSupabaseClient | null) ?? ((await createClient()) as unknown as WritableSupabaseClient);
}

async function createAppUserRecord(params: {
  email: string;
  firstName: string;
  id: string;
  lastName: string;
  phoneNumber: string;
  role: string;
  supabase: WritableSupabaseClient;
}) {
  return params.supabase.from("users").insert({
    id: params.id,
    first_name: params.firstName,
    last_name: params.lastName,
    email: params.email,
    phone_number: params.phoneNumber || null,
    status: "active",
    role: params.role,
  });
}

function deriveGuestNameParts(user: User) {
  const firstName = getMetadataString(user, "first_name");
  const lastName = getMetadataString(user, "last_name");

  if (firstName || lastName) {
    return {
      firstName: firstName || "Guest",
      lastName: lastName || "User",
    };
  }

  const emailName = user.email?.split("@")[0]?.replace(/[._-]+/g, " ").trim() || "";
  const normalizedName = emailName
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

  if (!normalizedName) {
    return {
      firstName: "Guest",
      lastName: "User",
    };
  }

  const [derivedFirstName, ...remainingNameParts] = normalizedName.split(" ");
  return {
    firstName: derivedFirstName || "Guest",
    lastName: remainingNameParts.join(" ") || "User",
  };
}

function getMetadataString(user: User, key: string) {
  const value = user.user_metadata?.[key];
  return typeof value === "string" ? value.trim() : "";
}

function readString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function logGuestAccountEvent(
  level: "info" | "error",
  event: string,
  details: Record<string, unknown>
) {
  const logger = level === "error" ? console.error : console.info;
  logger(`[guest-account] ${event}`, details);
}
