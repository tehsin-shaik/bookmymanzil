import Link from "next/link";
import { Cormorant_Garamond } from "next/font/google";
import { getGuestBookingDetail } from "@/lib/booking/reservations";
import { getGuestStayServiceRequestState } from "@/lib/service-requests";
import { submitGuestCheckIn, submitGuestCheckOut, submitGuestServiceRequest } from "@/app/guest/bookings/[reservationCode]/actions";
import { BookingLifecycleActions } from "@/components/guest/booking-lifecycle-actions";
import { ServiceRequestPanel } from "@/components/guest/service-request-panel";

const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

type GuestBookingDetailsPageProps = {
  params: Promise<{ reservationCode: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function GuestBookingDetailsPage({
  params,
  searchParams,
}: GuestBookingDetailsPageProps) {
  const { reservationCode } = await params;
  const resolvedSearchParams = await searchParams;
  const success = readParam(resolvedSearchParams.success);
  const actionError = readParam(resolvedSearchParams.error);
  const serviceSuccess = readParam(resolvedSearchParams.serviceSuccess);
  const serviceError = readParam(resolvedSearchParams.serviceError);
  const [{ data: booking, error }, { data: serviceState }] = await Promise.all([
    getGuestBookingDetail(reservationCode),
    getGuestStayServiceRequestState(reservationCode),
  ]);

  return (
    <main className="px-4 py-10 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl rounded-[34px] border border-white/75 bg-[rgba(255,252,247,0.88)] p-8 shadow-[0_20px_52px_rgba(96,72,47,0.08)] md:p-10">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-amber-700">Booking Details</p>
            <h1 className={`${cormorant.className} mt-4 text-5xl tracking-[-0.03em] text-stone-900 md:text-6xl`}>
              Manage your stay
            </h1>
          </div>
          <Link
            href="/guest/bookings"
            className="inline-flex items-center rounded-full border border-stone-300 bg-white px-5 py-3 text-sm font-semibold text-stone-700 transition hover:border-stone-400 hover:text-stone-950"
          >
            Back to My Bookings
          </Link>
        </div>

        {success ? (
          <div className="mt-8 rounded-[24px] border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm leading-7 text-emerald-800">
            {success === "checked-in"
              ? "Check-in complete. Your booking is now marked as checked in."
              : "Check-out complete. Your booking is now marked as checked out."}
          </div>
        ) : null}

        {actionError ? (
          <div className="mt-8 rounded-[24px] border border-rose-200 bg-rose-50 px-5 py-4 text-sm leading-7 text-rose-700">
            {actionError}
          </div>
        ) : null}

        {error || !booking ? (
          <section className="mt-10 rounded-[28px] border border-stone-200/80 bg-white/90 p-6 shadow-[0_12px_32px_rgba(15,23,42,0.06)]">
            <h2 className="text-2xl font-semibold tracking-tight text-stone-900">Booking details are unavailable</h2>
            <p className="mt-3 text-sm leading-7 text-stone-600">
              {error || "We couldn't load this booking right now."}
            </p>
          </section>
        ) : (
          <>
            <section className="mt-10 rounded-[28px] border border-stone-200/80 bg-white/90 p-6 shadow-[0_12px_32px_rgba(15,23,42,0.06)]">
              <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
                <div className="max-w-3xl">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-amber-700">
                    Reservation {booking.reservationCode}
                  </p>
                  <h2 className={`${cormorant.className} mt-3 text-3xl tracking-[-0.03em] text-stone-900`}>
                    {booking.hotelName}
                  </h2>
                  <p className="mt-2 text-sm leading-7 text-stone-600">{booking.roomTypeName}</p>
                </div>

                <div className="rounded-[22px] bg-stone-50/90 px-4 py-3 text-sm shadow-inner shadow-stone-200/60">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-stone-500">Status</p>
                  <p className="mt-2 font-semibold text-stone-900">{formatStatus(booking.bookingStatus)}</p>
                </div>
              </div>

              <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <InfoCard label="Check-in Date" value={booking.checkIn} />
                <InfoCard label="Check-out Date" value={booking.checkOut} />
                <InfoCard
                  label="Guests"
                  value={`${booking.totalGuests} ${booking.totalGuests === 1 ? "guest" : "guests"}`}
                />
                <InfoCard
                  label="Rooms"
                  value={`${booking.roomCount} ${booking.roomCount === 1 ? "room" : "rooms"}`}
                />
                <InfoCard
                  label="Stay Length"
                  value={`${booking.nights} ${booking.nights === 1 ? "night" : "nights"}`}
                />
                <InfoCard label="Nightly Rate" value={`AED ${formatCurrency(booking.pricePerNight)}`} />
                <InfoCard label="Total Price" value={`AED ${formatCurrency(booking.totalPrice)}`} />
                <InfoCard label="Children" value={String(booking.children)} />
              </div>

              <div className="mt-6 rounded-[22px] border border-stone-200/80 bg-stone-50/80 px-5 py-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-stone-500">Digital Stay Actions</p>
                <p className="mt-2 text-sm leading-7 text-stone-600">{booking.checkInMessage}</p>
                {booking.checkedInAt ? (
                  <p className="mt-3 text-sm text-stone-600">Checked in at: {formatTimestamp(booking.checkedInAt)}</p>
                ) : null}
                {booking.checkedOutAt ? (
                  <p className="mt-2 text-sm text-stone-600">Checked out at: {formatTimestamp(booking.checkedOutAt)}</p>
                ) : null}
              </div>

              <BookingLifecycleActions
                canCheckIn={booking.canCheckIn}
                canCheckOut={booking.canCheckOut}
                reservationCode={booking.reservationCode}
                submitGuestCheckIn={submitGuestCheckIn}
                submitGuestCheckOut={submitGuestCheckOut}
              />
            </section>

            {serviceState ? (
              <ServiceRequestPanel
                actionError={serviceError}
                serviceState={serviceState}
                submitGuestServiceRequest={submitGuestServiceRequest}
                success={serviceSuccess}
              />
            ) : null}
          </>
        )}
      </div>
    </main>
  );
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[22px] border border-stone-200/80 bg-stone-50/80 px-4 py-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-stone-500">{label}</p>
      <p className="mt-2 text-sm font-semibold leading-6 text-stone-900">{value}</p>
    </div>
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
