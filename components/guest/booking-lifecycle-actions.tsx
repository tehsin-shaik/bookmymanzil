"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

type BookingLifecycleActionsProps = {
  canCheckIn: boolean;
  canCheckOut: boolean;
  reservationCode: string;
  submitGuestCheckIn: (formData: FormData) => void | Promise<void>;
  submitGuestCheckOut: (formData: FormData) => void | Promise<void>;
};

type DialogMode = "check-in" | "check-out" | null;

export function BookingLifecycleActions({
  canCheckIn,
  canCheckOut,
  reservationCode,
  submitGuestCheckIn,
  submitGuestCheckOut,
}: BookingLifecycleActionsProps) {
  const [dialogMode, setDialogMode] = useState<DialogMode>(null);

  return (
    <>
      <div className="mt-8 flex flex-wrap gap-3">
        {canCheckIn ? (
          <button
            type="button"
            onClick={() => setDialogMode("check-in")}
            className="inline-flex items-center rounded-full bg-stone-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-stone-800"
          >
            Check In
          </button>
        ) : null}

        {canCheckOut ? (
          <button
            type="button"
            onClick={() => setDialogMode("check-out")}
            className="inline-flex items-center rounded-full bg-stone-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-stone-800"
          >
            Check Out
          </button>
        ) : null}

        {!canCheckIn && !canCheckOut ? (
          <span className="inline-flex items-center rounded-full border border-stone-300 bg-white px-5 py-3 text-sm font-semibold text-stone-600">
            No action required
          </span>
        ) : null}
      </div>

      {dialogMode ? (
        <ReservationCodeDialog
          mode={dialogMode}
          onClose={() => setDialogMode(null)}
          reservationCode={reservationCode}
          submitAction={dialogMode === "check-in" ? submitGuestCheckIn : submitGuestCheckOut}
        />
      ) : null}
    </>
  );
}

function ReservationCodeDialog({
  mode,
  onClose,
  reservationCode,
  submitAction,
}: {
  mode: "check-in" | "check-out";
  onClose: () => void;
  reservationCode: string;
  submitAction: (formData: FormData) => void | Promise<void>;
}) {
  const [confirmationCode, setConfirmationCode] = useState("");

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  if (typeof document === "undefined") {
    return null;
  }

  const title = mode === "check-in" ? "Are you sure you want to check in?" : "Are you sure you want to check out?";
  const helperText =
    mode === "check-in"
      ? "Enter your reservation code to confirm digital check-in."
      : "Enter your reservation code to confirm digital check-out.";
  const submitLabel = mode === "check-in" ? "Confirm Check In" : "Confirm Check Out";

  return createPortal(
    <div
      className="fixed inset-0 z-[110] overflow-y-auto bg-slate-950/55 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="reservation-code-confirmation-title"
    >
      <div className="flex min-h-dvh items-center justify-center px-4 py-8 sm:px-6">
        <div className="relative w-full max-w-[520px] overflow-hidden rounded-[30px] border border-white/65 bg-white/96 shadow-[0_28px_90px_rgba(15,23,42,0.28)] ring-1 ring-slate-200/60">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-amber-50 via-white to-transparent" />

          <button
            type="button"
            onClick={onClose}
            className="absolute right-5 top-5 z-10 inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200/80 bg-white/90 text-slate-500 shadow-sm transition hover:border-slate-300 hover:text-slate-900"
            aria-label="Close reservation code confirmation dialog"
          >
            <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M5 5l10 10" />
              <path d="M15 5 5 15" />
            </svg>
          </button>

          <div className="relative px-7 pb-7 pt-10 sm:px-8 sm:pb-8 sm:pt-11">
            {/* This dialog adds an explicit reservation-code confirmation step before the stay lifecycle action runs. */}
            <div className="mx-auto max-w-md text-center">
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-amber-700">
                Reservation Confirmation
              </p>
              <h2
                id="reservation-code-confirmation-title"
                className="mt-3 text-[30px] font-semibold tracking-[-0.02em] text-slate-950"
              >
                {title}
              </h2>
              <p className="mt-3 text-sm leading-6 text-slate-600">{helperText}</p>
            </div>

            <form action={submitAction} className="mt-8 space-y-4">
              <input type="hidden" name="reservationCode" value={reservationCode} />
              <div className="rounded-[22px] border border-stone-200/80 bg-stone-50/85 px-4 py-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-stone-500">Reservation Code</p>
                <p className="mt-2 text-sm font-semibold leading-6 text-stone-900">{reservationCode}</p>
              </div>

              <label className="block rounded-[22px] border border-stone-200/80 bg-stone-50/85 px-4 py-4">
                <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-stone-500">
                  Enter Reservation Code
                </span>
                <input
                  type="text"
                  name="confirmationCode"
                  value={confirmationCode}
                  onChange={(event) => setConfirmationCode(event.target.value.toUpperCase())}
                  autoComplete="off"
                  spellCheck={false}
                  className="mt-3 w-full rounded-2xl border border-stone-300 bg-white px-4 py-3 text-sm font-semibold uppercase tracking-[0.12em] text-stone-900 outline-none transition focus:border-stone-500"
                  placeholder="Type your reservation code"
                  required
                />
              </label>

              <div className="mt-7 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="inline-flex h-12 flex-1 items-center justify-center rounded-full border border-stone-300 bg-white px-5 text-sm font-semibold text-stone-700 transition hover:border-stone-400 hover:text-stone-950"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="inline-flex h-12 flex-1 items-center justify-center rounded-full bg-stone-900 px-5 text-sm font-semibold text-white transition hover:bg-stone-800"
                >
                  {submitLabel}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
