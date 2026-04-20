"use server";

import "server-only";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { updateServiceRequestStatusAsStaff } from "@/lib/service-requests";

export async function updateStaffServiceRequestStatus(formData: FormData) {
  // This is the server-action bridge from the staff worklist UI into the shared
  // service-request state machine, then back out through the same guest/staff pages.
  const requestId = String(formData.get("requestId") || "").trim();
  const targetStatus = String(formData.get("targetStatus") || "").trim();
  const result = await updateServiceRequestStatusAsStaff({
    requestId,
    targetStatus,
  });

  if (!result.success) {
    redirect(`/staff/service?error=${encodeURIComponent(result.error || "The service request could not be updated.")}`);
  }

  revalidatePath("/staff/service");
  revalidatePath("/guest");
  revalidatePath("/guest/bookings");
  if (result.reservationCode) {
    revalidatePath(`/guest/bookings/${encodeURIComponent(result.reservationCode)}`);
  }
  redirect(`/staff/service?success=${encodeURIComponent("updated")}`);
}
