"use server";

import "server-only";

import { redirect } from "next/navigation";
import type { BookingActionState } from "@/app/booking/action-state";
import { createReservationFromBooking } from "@/lib/booking/reservations";

// This action performs the final authenticated reservation creation after the guest confirms the summary modal.
export async function submitReservation(
  _: BookingActionState,
  formData: FormData
): Promise<BookingActionState> {
  // This is the final booking submit entry point from the confirmation dialog.
  // It hands the normalized booking payload to the server-side reservation writer.
  const adults = parsePositiveInt(formData.get("adults"), 1, 1);
  const children = parsePositiveInt(formData.get("children"), 0, 0);
  const selectedRooms = parsePositiveInt(formData.get("selected_rooms"), 1, 1);
  const nights = parsePositiveInt(formData.get("nights"), 1, 1);
  const hotelId = getString(formData, "hotel_id");
  const roomTypeId = getString(formData, "room_type_id");
  const roomTypeName = getString(formData, "room_type_name");

  if (process.env.NODE_ENV !== "production") {
    console.log("[booking-action] submit-reservation", {
      adults,
      children,
      hotelId,
      maxGuestsForSelection: null,
      roomTypeId,
      roomTypeName,
      selectedRooms,
      totalGuests: adults + children,
    });
  }

  const result = await createReservationFromBooking({
    adults,
    checkIn: getString(formData, "checkIn"),
    checkOut: getString(formData, "checkOut"),
    children,
    hotelId,
    hotelSlug: getString(formData, "hotel_slug"),
    nights,
    quotedPricePerNight: parseNumber(formData.get("price_per_night")),
    quotedTotalPrice: parseNumber(formData.get("total_price")),
    roomTypeId,
    roomTypeName,
    selectedRooms,
  });

  if (!result.success) {
    return {
      error: result.error,
    };
  }

  redirect(`/booking/confirmation?code=${encodeURIComponent(result.reservationCode)}`);
}

function getString(formData: FormData, key: string) {
  return String(formData.get(key) || "").trim();
}

function parsePositiveInt(value: FormDataEntryValue | null, fallback: number, minimum: number) {
  const parsed = Number.parseInt(String(value || ""), 10);

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.max(minimum, parsed);
}

function parseNumber(value: FormDataEntryValue | null) {
  const parsed = Number.parseFloat(String(value || ""));
  return Number.isFinite(parsed) ? parsed : 0;
}
