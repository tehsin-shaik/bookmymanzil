import Link from "next/link";
import { Cormorant_Garamond } from "next/font/google";
import { StaffShell } from "@/components/staff/staff-shell";
import { StaffLifecycleActions } from "@/components/staff/staff-lifecycle-actions";
import { getStaffReservationDetail } from "@/lib/staff/operations";
import { submitReceptionCheckIn, submitReceptionCheckOut } from "@/app/staff/reception/[reservationCode]/actions";

const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

type ReceptionReservationDetailsPageProps = {
  params: Promise<{ reservationCode: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function ReceptionReservationDetailsPage({
  params,
  searchParams,
}: ReceptionReservationDetailsPageProps) {
  const { reservationCode } = await params;
  const resolvedSearchParams = await searchParams;
  const success = readParam(resolvedSearchParams.success);
  const actionError = readParam(resolvedSearchParams.error);
  const { data: reservation, error, staffSession } = await getStaffReservationDetail(reservationCode);

  return (
    <StaffShell
      description="Verify the reservation details below before completing front-desk check-in or check-out."
      session={staffSession}
      title="Reservation verification"
    >
      <section className="rounded-[30px] border border-white/75 bg-[rgba(255,252,247,0.88)] p-6 shadow-[0_18px_48px_rgba(96,72,47,0.08)]">
        <div className="flex flex-wrap gap-3">
          <Link
            href="/staff/reception"
            className="inline-flex items-center rounded-full border border-stone-300 bg-white px-5 py-3 text-sm font-semibold text-stone-700 transition hover:border-stone-400 hover:text-stone-950"
          >
            Back to reception desk
          </Link>
        </div>

        {success ? (
          <div className="mt-8 rounded-[24px] border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm leading-7 text-emerald-800">
            {success === "checked-in"
              ? "Staff check-in complete. Reservation status and room status have been updated."
              : "Staff check-out complete. Reservation status and room status have been updated."}
          </div>
        ) : null}

        {actionError ? (
          <div className="mt-8 rounded-[24px] border border-rose-200 bg-rose-50 px-5 py-4 text-sm leading-7 text-rose-700">
            {actionError}
          </div>
        ) : null}

        {error || !reservation ? (
          <div className="mt-8 rounded-[24px] border border-stone-200/80 bg-white/90 px-5 py-5 text-sm leading-7 text-stone-600">
            {error || "We couldn't load this reservation right now."}
          </div>
        ) : (
          <>
            <div className="mt-8 flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
              <div className="max-w-3xl">
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-amber-700">
                  Reservation {reservation.reservationCode}
                </p>
                <h2 className={`${cormorant.className} mt-3 text-3xl tracking-[-0.03em] text-stone-900 md:text-4xl`}>
                  {reservation.guestName}
                </h2>
                <p className="mt-2 text-sm leading-7 text-stone-600">
                  {reservation.hotelName}
                  {reservation.city ? ` • ${reservation.city}` : ""}
                </p>
              </div>

              <div className="rounded-[22px] bg-stone-50/90 px-4 py-3 text-sm shadow-inner shadow-stone-200/60">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-stone-500">Reservation Status</p>
                <p className="mt-2 font-semibold text-stone-900">{formatStatus(reservation.status)}</p>
              </div>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <InfoCard label="Guest Email" value={reservation.guestEmail || "Not available"} />
              <InfoCard label="Guest Phone" value={reservation.guestPhoneNumber || "Not available"} />
              <InfoCard label="City" value={reservation.city || "Not available"} />
              <InfoCard label="Room Type" value={reservation.roomTypeName} />
              <InfoCard
                label="Room Number(s)"
                value={reservation.roomNumbers.length > 0 ? reservation.roomNumbers.join(", ") : "Pending"}
              />
              <InfoCard label="Check-in Date" value={reservation.checkIn} />
              <InfoCard label="Check-out Date" value={reservation.checkOut} />
              <InfoCard label="Nights" value={`${reservation.nights} ${reservation.nights === 1 ? "night" : "nights"}`} />
              <InfoCard
                label="Guest Count"
                value={`${reservation.totalGuests} ${reservation.totalGuests === 1 ? "guest" : "guests"}`}
              />
              <InfoCard label="Total Price" value={`AED ${formatCurrency(reservation.totalPrice)}`} />
            </div>

            {reservation.checkedInAt ? (
              <p className="mt-6 text-sm text-stone-600">Checked in at: {formatTimestamp(reservation.checkedInAt)}</p>
            ) : null}

            {reservation.checkedOutAt ? (
              <p className="mt-2 text-sm text-stone-600">Checked out at: {formatTimestamp(reservation.checkedOutAt)}</p>
            ) : null}

            <StaffLifecycleActions
              canCheckIn={reservation.status === "confirmed"}
              canCheckOut={reservation.status === "checked_in"}
              reservationCode={reservation.reservationCode}
              submitReceptionCheckIn={submitReceptionCheckIn}
              submitReceptionCheckOut={submitReceptionCheckOut}
            />
          </>
        )}
      </section>
    </StaffShell>
  );
}

function readParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] || "" : value || "";
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-AE", {
    maximumFractionDigits: 0,
  }).format(value);
}

function formatStatus(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

function formatTimestamp(value: string) {
  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-AE", {
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    month: "short",
    year: "numeric",
  }).format(parsed);
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[22px] border border-stone-200/80 bg-stone-50/80 px-4 py-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-stone-500">{label}</p>
      <p className="mt-2 text-sm font-semibold leading-6 text-stone-900">{value}</p>
    </div>
  );
}
