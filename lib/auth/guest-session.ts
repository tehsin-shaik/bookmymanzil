import "server-only";

import { redirect } from "next/navigation";
import { loadAuthenticatedGuestAccount } from "@/lib/auth/guest-account";
import { createClient } from "@/lib/supabase/server";

export type GuestSessionState = {
  email: string;
  firstName: string;
  fullName: string;
  hasGuestProfile: boolean;
  id: string;
  initials: string;
  isGuest: boolean;
  phoneNumber: string;
};

export async function getGuestSessionState(): Promise<GuestSessionState | null> {
  // This is the central guest session loader. It now repairs missing guest account rows before
  // any guest-aware UI treats the session as complete.
  const guestAccountResolution = await loadAuthenticatedGuestAccount();

  if (!guestAccountResolution.authenticated) {
    return null;
  }

  if (guestAccountResolution.error) {
    await signOutBrokenGuestSession();
    return null;
  }

  if (!guestAccountResolution.isGuest || !guestAccountResolution.guestAccount) {
    return null;
  }

  const firstName = guestAccountResolution.guestAccount.firstName || "Guest";
  const fullName = guestAccountResolution.guestAccount.fullName || firstName || "Guest";
  const lastName = fullName.replace(new RegExp(`^${escapeRegExp(firstName)}\\s*`), "").trim();

  return {
    email: guestAccountResolution.guestAccount.email,
    firstName: firstName || "Guest",
    fullName,
    hasGuestProfile: true,
    id: guestAccountResolution.guestAccount.id,
    initials: buildInitials(firstName, lastName, guestAccountResolution.guestAccount.email),
    isGuest: true,
    phoneNumber: guestAccountResolution.guestAccount.phoneNumber,
  };
}

export async function requireGuestSession() {
  const guestAccountResolution = await loadAuthenticatedGuestAccount();

  if (!guestAccountResolution.authenticated) {
    redirect("/login");
  }

  if (guestAccountResolution.error) {
    await signOutBrokenGuestSession();
    redirect(`/login?error=${encodeURIComponent(guestAccountResolution.error)}`);
  }

  if (!guestAccountResolution.isGuest || !guestAccountResolution.guestAccount) {
    redirect("/login?error=This%20portal%20is%20for%20guest%20accounts%20only.");
  }

  const guestAccount = guestAccountResolution.guestAccount;
  const firstName = guestAccount.firstName || "Guest";
  const fullName = guestAccount.fullName || firstName || "Guest";
  const lastName = fullName.replace(new RegExp(`^${escapeRegExp(firstName)}\\s*`), "").trim();

  return {
    email: guestAccount.email,
    firstName,
    fullName,
    hasGuestProfile: true,
    id: guestAccount.id,
    initials: buildInitials(firstName, lastName, guestAccount.email),
    isGuest: true,
    phoneNumber: guestAccount.phoneNumber,
  };
}

function deriveFirstNameFromEmail(email: string | undefined) {
  const emailPrefix = email?.split("@")[0]?.replace(/[._-]+/g, " ").trim() || "";

  if (!emailPrefix) {
    return "Guest";
  }

  return emailPrefix
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")
    .split(" ")[0];
}

function buildInitials(firstName: string, lastName: string, email: string | undefined) {
  const first = firstName.charAt(0);
  const second = lastName.charAt(0) || deriveFirstNameFromEmail(email).charAt(0);
  return `${first}${second}`.trim().toUpperCase() || "GU";
}

async function signOutBrokenGuestSession() {
  const supabase = await createClient();
  await supabase.auth.signOut();
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
