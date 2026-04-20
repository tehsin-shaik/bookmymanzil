import Link from "next/link";
import { Cormorant_Garamond } from "next/font/google";
import { getGuestBookingSummaries } from "@/lib/booking/reservations";

const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

export default async function GuestDashboardPage() {
  const { data: bookings, error } = await getGuestBookingSummaries();
  const hasBookings = bookings.length > 0;

  return (
    <main className="px-4 py-10 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <section className="rounded-[34px] border border-white/75 bg-[rgba(255,252,247,0.88)] p-8 shadow-[0_20px_52px_rgba(96,72,47,0.08)] md:p-10">
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-amber-700">Guest Dashboard</p>
          <h1 className={`${cormorant.className} mt-4 text-5xl tracking-[-0.03em] text-stone-900 md:text-6xl`}>
            Welcome to your Guest Home Base!
          </h1>
          <p className="mt-4 max-w-3xl text-sm leading-7 text-stone-600 md:text-base">
            Everything you need for a smooth stay is gathered here, from your profile details to upcoming reservations
            and the next booking you may want to plan.
          </p>

          {error ? (
            <div className="mt-8 rounded-[24px] border border-rose-200 bg-rose-50 px-5 py-4 text-sm leading-7 text-rose-700">
              {error}
            </div>
          ) : null}

          <div className="mt-10 grid gap-5 lg:grid-cols-[1.35fr_1fr]">
            <div className="rounded-[28px] border border-stone-200/80 bg-white/90 p-6 shadow-[0_12px_32px_rgba(15,23,42,0.06)]">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">
                {hasBookings ? "Your Bookings" : "Next Steps"}
              </p>

              {hasBookings ? (
                <div className="mt-5 space-y-4">
                  {bookings.slice(0, 3).map((booking) => (
                    <article
                      key={booking.reservationCode}
                      className="rounded-[24px] border border-stone-200/80 bg-stone-50/80 p-5"
                    >
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-700">
                        Reservation {booking.reservationCode}
                      </p>
                      <h2 className="mt-3 text-xl font-semibold tracking-tight text-stone-900">{booking.hotelName}</h2>
                      <p className="mt-2 text-sm leading-7 text-stone-600">
                        {booking.roomTypeName} • {booking.checkIn} to {booking.checkOut}
                      </p>
                      <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-stone-600">
                        <span>
                          {booking.roomCount} {booking.roomCount === 1 ? "room" : "rooms"}
                        </span>
                        <span>AED {formatCurrency(booking.totalPrice)}</span>
                        <span>{formatStatus(booking.bookingStatus)}</span>
                      </div>
                      <Link
                        href={`/guest/bookings/${encodeURIComponent(booking.reservationCode)}`}
                        className="mt-4 inline-flex items-center rounded-full bg-stone-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-stone-800"
                      >
                        View details
                      </Link>
                    </article>
                  ))}

                  <div className="flex flex-wrap gap-3">
                    <Link
                      href="/guest/bookings"
                      className="inline-flex items-center rounded-full bg-stone-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-stone-800"
                    >
                      View My Bookings
                    </Link>
                    <Link
                      href="/guest/profile"
                      className="inline-flex items-center rounded-full border border-stone-300 bg-white px-5 py-3 text-sm font-semibold text-stone-700 transition hover:border-stone-400 hover:text-stone-950"
                    >
                      My Profile
                    </Link>
                  </div>
                </div>
              ) : (
                <div className="mt-5 grid gap-4 sm:grid-cols-2">
                  <DashboardLink
                    href="/guest/profile"
                    eyebrow="Account"
                    title="My Profile"
                    description="Review the guest details tied to your stays and keep your account information current."
                  />
                  <DashboardLink
                    href="/"
                    eyebrow="Reservations"
                    title="Start a Booking"
                    description="Return to the homepage and start exploring your next stay whenever you&apos;re ready."
                  />
                </div>
              )}
            </div>

            <div className="rounded-[28px] border border-stone-200/80 bg-stone-950 p-6 text-stone-100 shadow-[0_12px_32px_rgba(15,23,42,0.12)]">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-amber-200">
                {hasBookings ? "Continue Browsing" : "Start Planning"}
              </p>
              <h2 className="mt-4 text-2xl font-semibold tracking-tight">
                Pick up your next stay whenever you&apos;re ready.
              </h2>
              <p className="mt-3 text-sm leading-7 text-stone-300">
                Explore hotels, revisit your favorite stays, and continue booking whenever it suits you with everything
                already set up for a seamless return.
              </p>
              <Link
                href="/"
                className="mt-6 inline-flex items-center rounded-full bg-white px-5 py-3 text-sm font-semibold text-stone-900 transition hover:bg-stone-100"
              >
                {hasBookings ? "Return to Homepage" : "Start a Booking"}
              </Link>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-AE", {
    maximumFractionDigits: 0,
  }).format(value);
}

function formatStatus(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

function DashboardLink({
  href,
  eyebrow,
  title,
  description,
}: {
  href: string;
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <Link
      href={href}
      className="rounded-[24px] border border-stone-200/80 bg-stone-50/80 p-5 transition hover:border-stone-300 hover:bg-white"
    >
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-700">{eyebrow}</p>
      <h2 className="mt-3 text-xl font-semibold tracking-tight text-stone-900">{title}</h2>
      <p className="mt-3 text-sm leading-7 text-stone-600">{description}</p>
    </Link>
  );
}
