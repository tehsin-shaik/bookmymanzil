"use server";

import { redirect } from "next/navigation";
import { ensureGuestAccountForUser } from "@/lib/auth/guest-account";
import { loadAppUserRecord } from "@/lib/auth/profile-access";
import { getStaffHomePath, isStaffRole } from "@/lib/auth/staff-roles";
import { createClient } from "@/lib/supabase/server";

type AuthState = {
  error: string | null;
};

type LoginArea = "guest" | "staff" | "any";

function getString(formData: FormData, key: string) {
  return String(formData.get(key) || "").trim();
}

function getSafeReturnTo(formData: FormData) {
  const value = getString(formData, "return_to");

  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("://")) {
    return null;
  }

  return value;
}

function logAuthEvent(
  level: "info" | "error",
  event: string,
  details: Record<string, unknown>
) {
  const logger = level === "error" ? console.error : console.info;
  logger(`[auth] ${event}`, details);
}

export async function signUpGuest(_: AuthState, formData: FormData): Promise<AuthState> {
  try {
    const supabase = await createClient();
    const safeReturnTo = getSafeReturnTo(formData);

    const firstName = getString(formData, "first_name");
    const lastName = getString(formData, "last_name");
    const email = getString(formData, "email").toLowerCase();
    const password = String(formData.get("password") || "");
    const phoneNumber = getString(formData, "phone_number");
    const passportNumber = getString(formData, "passport_number");
    const preferredContactMethod = getString(formData, "preferred_contact_method");
    const preferences = getString(formData, "preferences");

    if (!firstName || !lastName || !email || !password) {
      return { error: "Please fill in all required fields." };
    }

    logAuthEvent("info", "guest-signup-submitted", {
      email,
      returnTo: safeReturnTo || "/guest",
    });

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          first_name: firstName,
          last_name: lastName,
          passport_number: passportNumber || null,
          phone_number: phoneNumber || null,
          preferred_contact_method: preferredContactMethod || null,
          preferences: preferences || null,
          role: "guest",
        },
      },
    });

    if (error || !data.user) {
      logAuthEvent("error", "guest-auth-signup-failed", {
        email,
        message: error?.message || "No user was returned from Supabase Auth signup.",
      });
      return { error: error?.message || "Signup failed. Please try again." };
    }

    const repairResult = await ensureGuestAccountForUser(data.user);

    if (repairResult.error && data.session) {
      return {
        error: repairResult.error,
      };
    }

    if (!data.session) {
      logAuthEvent("info", "guest-signup-awaiting-email-confirmation", {
        email,
        repairAttempted: repairResult.isGuest || Boolean(repairResult.error),
        repairError: repairResult.error,
        returnTo: safeReturnTo || "/guest",
      });

      return {
        error:
          "Your account has been created, but this Supabase project is still requiring email confirmation before guest access. Please confirm your email, then log in to continue.",
      };
    }

    const redirectPath = safeReturnTo || "/guest";
    logAuthEvent("info", "guest-signup-succeeded", {
      email,
      redirectTo: redirectPath,
      repaired: repairResult.isGuest ? repairResult.repaired : false,
      userId: data.user.id,
    });
    redirect(redirectPath);
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "digest" in error &&
      typeof (error as { digest?: unknown }).digest === "string" &&
      (error as { digest: string }).digest.startsWith("NEXT_REDIRECT")
    ) {
      throw error;
    }

    logAuthEvent("error", "guest-signup-unexpected-failure", {
      message: error instanceof Error ? error.message : String(error),
    });

    return {
      error: "We couldn't complete your registration right now. Please try again.",
    };
  }
}

export async function signUpStaff(_: AuthState, formData: FormData): Promise<AuthState> {
  void formData;
  return {
    error: "Public staff account creation is disabled. Please contact an administrator for staff access.",
  };
}

export async function logInGuest(_: AuthState, formData: FormData): Promise<AuthState> {
  return logInWithExpectedRole("guest", formData);
}

export async function logInStaff(_: AuthState, formData: FormData): Promise<AuthState> {
  return logInWithExpectedRole("staff", formData);
}

export async function logInUser(_: AuthState, formData: FormData): Promise<AuthState> {
  return logInWithExpectedRole("any", formData);
}

async function logInWithExpectedRole(expectedArea: LoginArea, formData: FormData): Promise<AuthState> {
  const supabase = await createClient();
  const safeReturnTo = getSafeReturnTo(formData);

  const email = getString(formData, "email").toLowerCase();
  const password = String(formData.get("password") || "");
  if (!email || !password) {
    return { error: "Email and password are required." };
  }

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error || !data.user) {
    return { error: error?.message || "Login failed. Please try again." };
  }

  const { data: appUser, error: appUserError } = await loadAppUserRecord(
    data.user.id,
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
    logAuthEvent("error", "app-user-lookup-failed-after-login", {
      expectedArea,
      message: appUserError.message,
      userEmail: data.user.email || email,
      userId: data.user.id,
    });
    await supabase.auth.signOut();
    return {
      error: "We couldn't verify your account profile just now. Please try again.",
    };
  }

  let resolvedAppUser = appUser;

  if (expectedArea !== "staff" && (!resolvedAppUser || resolvedAppUser.role === "guest")) {
    const repairResult = await ensureGuestAccountForUser(data.user);

    if (repairResult.error) {
      await supabase.auth.signOut();
      return {
        error: repairResult.error,
      };
    }

    if (!resolvedAppUser || repairResult.repaired) {
      const { data: refreshedAppUser, error: refreshedAppUserError } = await loadAppUserRecord(
        data.user.id,
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

      if (refreshedAppUserError || !refreshedAppUser) {
        logAuthEvent("error", "app-user-refresh-failed-after-guest-repair", {
          message: refreshedAppUserError?.message || "No app user row returned after guest repair.",
          userEmail: data.user.email || email,
          userId: data.user.id,
        });
        await supabase.auth.signOut();
        return {
          error:
            "Your authentication succeeded, but we couldn't finish restoring your guest profile. Please contact support.",
        };
      }

      resolvedAppUser = refreshedAppUser;
    }
  }

  if (!resolvedAppUser) {
    logAuthEvent("error", "staff-login-missing-app-user", {
      expectedArea,
      userEmail: data.user.email || email,
      userId: data.user.id,
    });
    await supabase.auth.signOut();
    return {
      error:
        "Your account exists in authentication, but no matching user profile was found. Please contact support.",
    };
  }

  if (resolvedAppUser.role === "guest") {
    if (expectedArea === "staff") {
      await supabase.auth.signOut();
      return { error: "This portal is for staff accounts only." };
    }
    redirect(safeReturnTo || "/guest");
  }

  if (!isStaffRole(resolvedAppUser.role)) {
    logAuthEvent("error", "staff-login-unsupported-role", {
      role: resolvedAppUser.role,
      userEmail: data.user.email || email,
      userId: data.user.id,
    });
    await supabase.auth.signOut();
    return {
      error: `Unsupported account role "${resolvedAppUser.role}". Please contact support.`,
    };
  }

  logAuthEvent("info", "staff-login-succeeded", {
    redirectTo: getStaffHomePath(resolvedAppUser.role),
    role: resolvedAppUser.role,
    userEmail: data.user.email || email,
    userId: data.user.id,
  });

  if (expectedArea === "guest") {
    await supabase.auth.signOut();
    return { error: "This portal is for guest accounts only." };
  }

  redirect(getStaffHomePath(resolvedAppUser.role));
}

export async function logOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}
