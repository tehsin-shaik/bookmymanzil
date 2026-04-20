import Link from "next/link";
import { StaffShell } from "@/components/staff/staff-shell";
import { getManagerOverview } from "@/lib/staff/operations";

export default async function ManagerDashboardPage() {
  const { data, staffSession } = await getManagerOverview();
  const scopeLabel = staffSession.hotelName || "your assigned hotel";
  const isAdmin = staffSession.role === "admin";

  return (
    <StaffShell
      description={
        isAdmin
          ? "See bookings, users, hotels, and room operations across every property."
          : `See the current booking volume, guest count, and room status mix for ${scopeLabel}.`
      }
      session={staffSession}
      title={isAdmin ? "Admin overview" : "Manager overview"}
    >
      <section className="grid gap-4 md:grid-cols-3">
        <MetricCard label="Hotel Bookings" value={String(data.bookingCount)} />
        <MetricCard label="Hotel Guests" value={String(data.guestCount)} />
        <MetricCard label="Room Status Types" value={String(data.roomStatusBreakdown.length)} />
      </section>

      <section className="rounded-[30px] border border-white/75 bg-[rgba(255,252,247,0.88)] p-6 shadow-[0_18px_48px_rgba(96,72,47,0.08)]">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-amber-700">Bookings</p>
        <h2 className="mt-3 text-2xl font-semibold tracking-tight text-stone-900">Latest booking activity</h2>

        <div className="mt-6 space-y-4">
          {data.recentBookings.map((booking) => (
            <article
              key={booking.reservationCode}
              className="rounded-[24px] border border-stone-200/80 bg-white/92 p-5 shadow-[0_12px_32px_rgba(15,23,42,0.06)]"
            >
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-700">
                    Reservation {booking.reservationCode}
                  </p>
                  <h3 className="mt-3 text-xl font-semibold tracking-tight text-stone-900">{booking.guestName}</h3>
                  <p className="mt-2 text-sm leading-7 text-stone-600">
                    {booking.hotelName} • {booking.checkIn} to {booking.checkOut}
                  </p>
                </div>
                <div className="rounded-[22px] bg-stone-50/90 px-4 py-3 text-sm shadow-inner shadow-stone-200/60">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-stone-500">Status</p>
                  <p className="mt-2 font-semibold text-stone-900">{formatStatus(booking.status)}</p>
                </div>
              </div>

              <div className="mt-5 flex flex-wrap gap-3">
                <span className="rounded-full bg-stone-100 px-4 py-2 text-sm text-stone-700">
                  {booking.roomCount} {booking.roomCount === 1 ? "room" : "rooms"}
                </span>
                <span className="rounded-full bg-stone-100 px-4 py-2 text-sm text-stone-700">
                  AED {formatCurrency(booking.totalPrice)}
                </span>
                <Link
                  href={`/staff/reception/${encodeURIComponent(booking.reservationCode)}`}
                  className="inline-flex items-center rounded-full bg-stone-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-stone-800"
                >
                  Open reservation
                </Link>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="rounded-[30px] border border-white/75 bg-[rgba(255,252,247,0.88)] p-6 shadow-[0_18px_48px_rgba(96,72,47,0.08)]">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-amber-700">Rooms</p>
        <h2 className="mt-3 text-2xl font-semibold tracking-tight text-stone-900">Room status overview</h2>

        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {data.roomStatusBreakdown.map((roomStatus) => (
            <MetricCard key={roomStatus.label} label={roomStatus.label} value={String(roomStatus.count)} />
          ))}
        </div>
      </section>
    </StaffShell>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <article className="rounded-[24px] border border-white/75 bg-[rgba(255,252,247,0.88)] p-5 shadow-[0_18px_48px_rgba(96,72,47,0.08)]">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-stone-500">{label}</p>
      <p className="mt-3 text-3xl font-semibold tracking-tight text-stone-900">{value}</p>
    </article>
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
