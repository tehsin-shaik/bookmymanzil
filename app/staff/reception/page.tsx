import Link from "next/link";
import { Cormorant_Garamond } from "next/font/google";
import { StaffShell } from "@/components/staff/staff-shell";
import { searchReservationsForStaff } from "@/lib/staff/operations";

const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

type ReceptionDashboardPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function ReceptionDashboardPage({ searchParams }: ReceptionDashboardPageProps) {
  const params = await searchParams;
  const query = readParam(params.q);
  const { error, results, staffSession } = await searchReservationsForStaff(query);

  return (
    <StaffShell
      description="Search reservations by reservation code, guest name, or hotel name, then open a booking to verify it and complete front-desk lifecycle steps."
      session={staffSession}
      title="Reception desk"
    >
      <section className="rounded-[30px] border border-white/75 bg-[rgba(255,252,247,0.88)] p-6 shadow-[0_18px_48px_rgba(96,72,47,0.08)]">
        <form className="flex flex-col gap-3 md:flex-row">
          <input
            type="text"
            name="q"
            defaultValue={query}
            placeholder="Search by reservation code, guest name, or hotel"
            className="h-12 flex-1 rounded-full border border-stone-300 bg-white px-5 text-sm text-stone-900 outline-none transition focus:border-stone-500"
          />
          <button className="inline-flex h-12 items-center justify-center rounded-full bg-stone-900 px-6 text-sm font-semibold text-white transition hover:bg-stone-800">
            Search reservations
          </button>
        </form>
      </section>

      {error ? (
        <section className="rounded-[24px] border border-amber-200 bg-amber-50 px-5 py-4 text-sm leading-7 text-amber-900">
          {error}
        </section>
      ) : null}

      <section className="rounded-[30px] border border-white/75 bg-[rgba(255,252,247,0.88)] p-6 shadow-[0_18px_48px_rgba(96,72,47,0.08)]">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-amber-700">Reception Results</p>
            <h2 className={`${cormorant.className} mt-3 text-3xl tracking-[-0.03em] text-stone-900 md:text-4xl`}>
              Reservation verification queue
            </h2>
          </div>
          <p className="text-sm text-stone-600">{results.length} matching {results.length === 1 ? "booking" : "bookings"}</p>
        </div>

        {results.length === 0 ? (
          <div className="mt-8 rounded-[24px] border border-stone-200/80 bg-white/90 p-5 text-sm leading-7 text-stone-600">
            No reservations matched this search yet. Try a reservation code, guest name, or hotel.
          </div>
        ) : (
          <div className="mt-8 space-y-4">
            {results.map((reservation) => (
              <article
                key={reservation.reservationCode}
                className="rounded-[24px] border border-stone-200/80 bg-white/92 p-5 shadow-[0_12px_32px_rgba(15,23,42,0.06)]"
              >
                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                  <div className="max-w-3xl">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-700">
                      Reservation {reservation.reservationCode}
                    </p>
                    <h3 className={`${cormorant.className} mt-3 text-2xl tracking-[-0.03em] text-stone-900`}>
                      {reservation.guestName}
                    </h3>
                    <p className="mt-2 text-sm leading-7 text-stone-600">
                      {reservation.hotelName} • {reservation.checkIn} to {reservation.checkOut}
                    </p>
                  </div>

                  <div className="rounded-[22px] bg-stone-50/90 px-4 py-3 text-sm shadow-inner shadow-stone-200/60">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-stone-500">Status</p>
                    <p className="mt-2 font-semibold text-stone-900">{formatStatus(reservation.status)}</p>
                  </div>
                </div>

                <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <InfoCard label="Guest Email" value={reservation.guestEmail || "Not available"} />
                  <InfoCard
                    label="Rooms"
                    value={`${reservation.roomCount} ${reservation.roomCount === 1 ? "room" : "rooms"}`}
                  />
                  <InfoCard label="Total Price" value={`AED ${formatCurrency(reservation.totalPrice)}`} />
                  <InfoCard label="Stay" value={`${reservation.checkIn} to ${reservation.checkOut}`} />
                </div>

                <div className="mt-5">
                  <Link
                    href={`/staff/reception/${encodeURIComponent(reservation.reservationCode)}`}
                    className="inline-flex items-center rounded-full bg-stone-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-stone-800"
                  >
                    Verify reservation
                  </Link>
                </div>
              </article>
            ))}
          </div>
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

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[22px] border border-stone-200/80 bg-stone-50/80 px-4 py-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-stone-500">{label}</p>
      <p className="mt-2 text-sm font-semibold leading-6 text-stone-900">{value}</p>
    </div>
  );
}
