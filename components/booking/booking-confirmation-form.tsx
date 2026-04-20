"use client";

import Link from "next/link";
import { Cormorant_Garamond } from "next/font/google";
import { useActionState, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  submitReservation,
} from "@/app/booking/actions";
import {
  initialBookingActionState,
  type BookingActionState,
} from "@/app/booking/action-state";

const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

type BookingConfirmationFormProps = {
  bookingContext: Record<string, string>;
  guestDetails: {
    email: string;
    fullName: string;
    phoneNumber: string;
  } | null;
  hotelName: string;
  isAuthenticatedGuest: boolean;
  liveAvailabilityIssue: string | null;
  returnToLoginHref: string;
  returnToRegisterHref: string;
  roomTypeName: string;
  summary: {
    adults: number;
    checkIn: string;
    checkOut: string;
    children: number;
    nights: number;
    pricePerNight: number;
    selectedRooms: number;
    totalPrice: number;
    totalGuests: number;
  };
};

export function BookingConfirmationForm({
  bookingContext,
  guestDetails,
  hotelName,
  isAuthenticatedGuest,
  liveAvailabilityIssue,
  returnToLoginHref,
  returnToRegisterHref,
  roomTypeName,
  summary,
}: BookingConfirmationFormProps) {
  const [state, formAction, pending] = useActionState<BookingActionState, FormData>(
    submitReservation,
    initialBookingActionState
  );
  const [isOpen, setIsOpen] = useState(false);
  const canAttemptBooking = isAuthenticatedGuest && !liveAvailabilityIssue;
  const formId = "booking-confirmation-form";

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !pending) {
        setIsOpen(false);
      }
    }

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, pending]);

  return (
    <>
      <form id={formId} action={formAction} className="mt-8 space-y-4">
        {/* This block keeps the canonical booking context attached to the final submit action. */}
        {Object.entries(bookingContext).map(([key, value]) => (
          <input key={key} type="hidden" name={key} value={value} />
        ))}

        {state.error ? (
          <p className="rounded-[20px] border border-rose-200 bg-rose-50 px-4 py-3 text-sm leading-6 text-rose-700">
            {state.error}
          </p>
        ) : null}

        {!isAuthenticatedGuest ? (
          <div className="rounded-[24px] border border-stone-200/80 bg-white/90 px-5 py-5">
            <p className="text-sm font-semibold text-stone-900">Guest sign-in is required before booking.</p>
            <p className="mt-2 text-sm leading-7 text-stone-600">
              Log in or create a guest account to confirm this reservation. Your booking details will stay attached so
              you can continue from the same step after authentication.
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              <Link
                href={returnToLoginHref}
                className="inline-flex h-11 items-center justify-center rounded-full bg-stone-900 px-5 text-sm font-semibold text-white transition hover:bg-stone-800"
              >
                Log in as guest
              </Link>
              <Link
                href={returnToRegisterHref}
                className="inline-flex h-11 items-center justify-center rounded-full border border-stone-300 bg-white px-5 text-sm font-semibold text-stone-700 transition hover:border-stone-400 hover:text-stone-950"
              >
                Register as guest
              </Link>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setIsOpen(true)}
            disabled={!canAttemptBooking}
            className="inline-flex h-12 w-full items-center justify-center rounded-full bg-stone-900 px-5 text-sm font-semibold text-white transition hover:bg-stone-800 disabled:cursor-not-allowed disabled:bg-stone-300 disabled:text-stone-600"
          >
            Book Now
          </button>
        )}
      </form>

      {isOpen ? (
        <BookingConfirmDialog
          error={state.error}
          formId={formId}
          guestDetails={guestDetails}
          hotelName={hotelName}
          onClose={() => setIsOpen(false)}
          pending={pending}
          roomTypeName={roomTypeName}
          summary={summary}
        />
      ) : null}
    </>
  );
}

function BookingConfirmDialog({
  error,
  formId,
  guestDetails,
  hotelName,
  onClose,
  pending,
  roomTypeName,
  summary,
}: {
  error: string | null;
  formId: string;
  guestDetails: {
    email: string;
    fullName: string;
    phoneNumber: string;
  } | null;
  hotelName: string;
  onClose: () => void;
  pending: boolean;
  roomTypeName: string;
  summary: {
    adults: number;
    checkIn: string;
    checkOut: string;
    children: number;
    nights: number;
    pricePerNight: number;
    selectedRooms: number;
    totalPrice: number;
    totalGuests: number;
  };
}) {
  if (typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[110] overflow-y-auto bg-slate-950/55 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !pending) {
          onClose();
        }
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="booking-confirmation-title"
    >
      <div className="flex min-h-dvh items-center justify-center px-4 py-8 sm:px-6">
        <div className="relative w-full max-w-[520px] overflow-hidden rounded-[30px] border border-white/65 bg-white/96 shadow-[0_28px_90px_rgba(15,23,42,0.28)] ring-1 ring-slate-200/60">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-amber-50 via-white to-transparent" />

          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="absolute right-5 top-5 z-10 inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200/80 bg-white/90 text-slate-500 shadow-sm transition hover:border-slate-300 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-60"
            aria-label="Close booking confirmation dialog"
          >
            <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M5 5l10 10" />
              <path d="M15 5 5 15" />
            </svg>
          </button>

          <div className="relative px-7 pb-7 pt-10 sm:px-8 sm:pb-8 sm:pt-11">
            {/* This block shows the final booking summary before the real reservation action runs. */}
            <div className="mx-auto max-w-md text-center">
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-amber-700">
                Final Confirmation
              </p>
              <h2
                id="booking-confirmation-title"
                className={`${cormorant.className} mt-3 text-[34px] tracking-[-0.03em] text-slate-950`}
              >
                Confirm your booking
              </h2>
              <p className="mt-3 text-sm leading-6 text-slate-600">
                Review your stay details below, then confirm when everything feels right. We&apos;ll do one final
                availability check before securing your reservation.
              </p>
            </div>

            <div className="mt-8 grid gap-3 sm:grid-cols-2">
              {error ? (
                <p className="sm:col-span-2 rounded-[20px] border border-rose-200 bg-rose-50 px-4 py-3 text-sm leading-6 text-rose-700">
                  {error}
                </p>
              ) : null}
              {guestDetails ? (
                <>
                  <SummaryRow label="Booked By" value={guestDetails.fullName} />
                  <SummaryRow label="Email" value={guestDetails.email} />
                  <SummaryRow label="Phone Number" value={guestDetails.phoneNumber} />
                </>
              ) : null}
              <SummaryRow label="Hotel" value={hotelName} />
              <SummaryRow label="Room Type" value={roomTypeName} />
              <SummaryRow label="Check-in" value={summary.checkIn} />
              <SummaryRow label="Check-out" value={summary.checkOut} />
              <SummaryRow
                label="Length"
                value={`${summary.nights} ${summary.nights === 1 ? "night" : "nights"}`}
              />
              <SummaryRow
                label="Guests"
                value={`${summary.totalGuests} ${summary.totalGuests === 1 ? "guest" : "guests"}`}
              />
              <SummaryRow
                label="Rooms"
                value={`${summary.selectedRooms} ${summary.selectedRooms === 1 ? "room" : "rooms"}`}
              />
              <SummaryRow
                label="Guest Mix"
                value={`${summary.adults} adults${summary.children ? `, ${summary.children} children` : ""}`}
              />
              <SummaryRow label="Price Per Night" value={`AED ${formatCurrency(summary.pricePerNight)}`} />
              <SummaryRow label="Total Price" value={`AED ${formatCurrency(summary.totalPrice)}`} />
            </div>

            <div className="mt-7 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={onClose}
                disabled={pending}
                className="inline-flex h-12 flex-1 items-center justify-center rounded-full border border-stone-300 bg-white px-5 text-sm font-semibold text-stone-700 transition hover:border-stone-400 hover:text-stone-950 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Cancel
              </button>
              <ConfirmBookingButton formId={formId} pending={pending} />
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[20px] border border-stone-200/80 bg-stone-50/85 px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-stone-500">{label}</p>
      <p className="mt-2 text-sm font-semibold leading-6 text-stone-900">{value}</p>
    </div>
  );
}

function ConfirmBookingButton({ formId, pending }: { formId: string; pending: boolean }) {
  return (
    <button
      form={formId}
      type="submit"
      disabled={pending}
      className="inline-flex h-12 flex-1 items-center justify-center rounded-full bg-stone-900 px-5 text-sm font-semibold text-white transition hover:bg-stone-800 disabled:cursor-not-allowed disabled:bg-stone-400"
    >
      {pending ? "Confirming booking..." : "Confirm Booking"}
    </button>
  );
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-AE", {
    maximumFractionDigits: 0,
  }).format(value);
}
