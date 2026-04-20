"use server";

import "server-only";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { updateGuestBookingLifecycleStatus } from "@/lib/booking/reservations";
import { createGuestServiceRequest } from "@/lib/service-requests";

// This action runs the guest-owned digital check-in transition for a booking details page.
export async function submitGuestCheckIn(formData: FormData) {
  const reservationCode = String(formData.get("reservationCode") || "").trim();
  const confirmationCode = String(formData.get("confirmationCode") || "").trim();
  const result = await updateGuestBookingLifecycleStatus({
    confirmationCode,
    reservationCode,
    targetStatus: "checked_in",
  });

  if (!result.success) {
    redirect(buildBookingDetailsRedirect(reservationCode, result.error || "Digital check-in could not be completed."));
  }

  revalidatePath("/guest");
  revalidatePath("/guest/bookings");
  revalidatePath(`/guest/bookings/${encodeURIComponent(reservationCode)}`);
  redirect(`/guest/bookings/${encodeURIComponent(reservationCode)}?success=${encodeURIComponent("checked-in")}`);
}

// This action runs the guest-owned digital check-out transition for a booking details page.
export async function submitGuestCheckOut(formData: FormData) {
  const reservationCode = String(formData.get("reservationCode") || "").trim();
  const confirmationCode = String(formData.get("confirmationCode") || "").trim();
  const result = await updateGuestBookingLifecycleStatus({
    confirmationCode,
    reservationCode,
    targetStatus: "checked_out",
  });

  if (!result.success) {
    redirect(buildBookingDetailsRedirect(reservationCode, result.error || "Digital check-out could not be completed."));
  }

  revalidatePath("/guest");
  revalidatePath("/guest/bookings");
  revalidatePath(`/guest/bookings/${encodeURIComponent(reservationCode)}`);
  redirect(`/guest/bookings/${encodeURIComponent(reservationCode)}?success=${encodeURIComponent("checked-out")}`);
}

function buildBookingDetailsRedirect(reservationCode: string, error: string) {
  return `/guest/bookings/${encodeURIComponent(reservationCode)}?error=${encodeURIComponent(error)}`;
}

// This action submits a checked-in guest service request for the current stay.
export async function submitGuestServiceRequest(formData: FormData) {
  const reservationCode = String(formData.get("reservationCode") || "").trim();
  const result = await createGuestServiceRequest({
    categoryId: String(formData.get("categoryId") || "").trim(),
    description: String(formData.get("description") || "").trim(),
    preferredTime: String(formData.get("preferredTime") || "").trim(),
    reservationCode,
  });

  if (!result.success) {
    redirect(
      `/guest/bookings/${encodeURIComponent(reservationCode)}?serviceError=${encodeURIComponent(
        result.error || "Your service request could not be submitted."
      )}`
    );
  }

  revalidatePath("/guest");
  revalidatePath("/guest/bookings");
  revalidatePath(`/guest/bookings/${encodeURIComponent(reservationCode)}`);
  redirect(`/guest/bookings/${encodeURIComponent(reservationCode)}?serviceSuccess=${encodeURIComponent("submitted")}`);
}
