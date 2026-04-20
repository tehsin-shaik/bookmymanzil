import Link from "next/link";
import { Cormorant_Garamond } from "next/font/google";
import { getGuestBookingSummaries } from "@/lib/booking/reservations";

const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

export default async function GuestBookingsPage() {
  const { data: bookings, error } = await getGuestBookingSummaries();

  return (
    <main className="px-4 py-10 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl rounded-[34px] border border-white/75 bg-[rgba(255,252,247,0.88)] p-8 shadow-[0_20px_52px_rgba(96,72,47,0.08)] md:p-10">
        <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-amber-700">My Bookings</p>
        <h1 className={`${cormorant.className} mt-4 text-5xl tracking-[-0.03em] text-stone-900 md:text-6xl`}>
          Your stays
        </h1>
        <p className="mt-4 max-w-3xl text-sm leading-7 text-stone-600 md:text-base">
          See your upcoming and completed stays in one calm, organized place, with each booking easy to revisit whenever
          you need it.
        </p>

        {error ? (
          <div className="mt-8 rounded-[24px] border border-rose-200 bg-rose-50 px-5 py-4 text-sm leading-7 text-rose-700">
            {error}
          </div>
        ) : null}

        {bookings.length === 0 ? (
          <div className="mt-10 rounded-[28px] border border-stone-200/80 bg-white/90 p-6 shadow-[0_12px_32px_rgba(15,23,42,0.06)]">
            <p className="text-sm font-semibold text-stone-900">You do not have any bookings yet.</p>
            <p className="mt-3 text-sm leading-7 text-stone-600">
              Once you confirm a hotel stay, it will appear here with its reservation code and booking summary.
            </p>
            <Link
              href="/"
              className="mt-5 inline-flex items-center rounded-full bg-stone-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-stone-800"
            >
              Start a booking
            </Link>
          </div>
        ) : (
          <div className="mt-10 space-y-5">
            {bookings.map((booking) => (
              <article
                key={booking.reservationCode}
                className="rounded-[28px] border border-stone-200/80 bg-white/92 p-6 shadow-[0_12px_32px_rgba(15,23,42,0.06)]"
              >
                {/* This block presents one booking-level reservation group from reservation_groups. */}
                <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
                  <div className="max-w-3xl">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-amber-700">
                      Reservation {booking.reservationCode}
                    </p>
                    <h2 className="mt-3 text-2xl font-semibold tracking-tight text-stone-900">{booking.hotelName}</h2>
                    <p className="mt-2 text-sm leading-7 text-stone-600">{booking.roomTypeName}</p>
                  </div>

                  <div className="rounded-[22px] bg-stone-50/90 px-4 py-3 text-sm shadow-inner shadow-stone-200/60">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-stone-500">Status</p>
                    <p className="mt-2 font-semibold text-stone-900">{formatStatus(booking.bookingStatus)}</p>
                  </div>
                </div>

                <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <InfoCard label="Stay" value={`${booking.checkIn} to ${booking.checkOut}`} />
                  <InfoCard
                    label="Rooms"
                    value={`${booking.roomCount} ${booking.roomCount === 1 ? "room" : "rooms"}`}
                  />
                  <InfoCard label="Total Price" value={`AED ${formatCurrency(booking.totalPrice)}`} />
                  <InfoCard label="Booked On" value={formatCreatedAt(booking.createdAt)} />
                </div>

                <div className="mt-6">
                  <Link
                    href={`/guest/bookings/${encodeURIComponent(booking.reservationCode)}`}
                    className="inline-flex items-center rounded-full bg-stone-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-stone-800"
                  >
                    Manage booking
                  </Link>
                </div>
              </article>
            ))}
          </div>
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

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-AE", {
    maximumFractionDigits: 0,
  }).format(value);
}

function formatCreatedAt(value: string) {
  if (!value) {
    return "Recently created";
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return "Recently created";
  }

  return new Intl.DateTimeFormat("en-AE", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(parsed);
}

function formatStatus(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (character) => character.toUpperCase());
}
