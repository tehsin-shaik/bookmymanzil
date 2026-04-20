"use server";

import "server-only";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { updateReservationLifecycleAsStaff } from "@/lib/staff/operations";

export async function submitReceptionCheckIn(formData: FormData) {
  const reservationCode = String(formData.get("reservationCode") || "").trim();
  const confirmationCode = String(formData.get("confirmationCode") || "").trim();
  const result = await updateReservationLifecycleAsStaff({
    confirmationCode,
    reservationCode,
    targetStatus: "checked_in",
  });

  if (!result.success) {
    redirect(`/staff/reception/${encodeURIComponent(reservationCode)}?error=${encodeURIComponent(result.error || "Check-in failed.")}`);
  }

  revalidatePath("/staff/reception");
  revalidatePath(`/staff/reception/${encodeURIComponent(reservationCode)}`);
  revalidatePath("/guest");
  revalidatePath("/guest/bookings");
  revalidatePath(`/guest/bookings/${encodeURIComponent(reservationCode)}`);
  redirect(`/staff/reception/${encodeURIComponent(reservationCode)}?success=${encodeURIComponent("checked-in")}`);
}

export async function submitReceptionCheckOut(formData: FormData) {
  const reservationCode = String(formData.get("reservationCode") || "").trim();
  const confirmationCode = String(formData.get("confirmationCode") || "").trim();
  const result = await updateReservationLifecycleAsStaff({
    confirmationCode,
    reservationCode,
    targetStatus: "checked_out",
  });

  if (!result.success) {
    redirect(`/staff/reception/${encodeURIComponent(reservationCode)}?error=${encodeURIComponent(result.error || "Check-out failed.")}`);
  }

  revalidatePath("/staff/reception");
  revalidatePath(`/staff/reception/${encodeURIComponent(reservationCode)}`);
  revalidatePath("/guest");
  revalidatePath("/guest/bookings");
  revalidatePath(`/guest/bookings/${encodeURIComponent(reservationCode)}`);
  redirect(`/staff/reception/${encodeURIComponent(reservationCode)}?success=${encodeURIComponent("checked-out")}`);
}
