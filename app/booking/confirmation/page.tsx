import Link from "next/link";
import { Cormorant_Garamond } from "next/font/google";
import { getReservationConfirmationData } from "@/lib/booking/reservations";

const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

type BookingConfirmationPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function BookingConfirmationPage({
  searchParams,
}: BookingConfirmationPageProps) {
  const params = await searchParams;
  const reservationCode = readParam(params.code);
  const { data, error } = await getReservationConfirmationData(reservationCode);

  return (
    <main className="min-h-screen bg-[#f7f1e8] px-6 py-10 text-stone-900 md:py-12">
      <div className="mx-auto max-w-4xl">
        <section className="rounded-[36px] border border-white/70 bg-[rgba(255,252,247,0.88)] p-8 shadow-[0_18px_48px_rgba(96,72,47,0.08)] md:p-10">
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-amber-700">
            Booking Confirmation
          </p>
          <h1 className={`${cormorant.className} mt-5 text-5xl tracking-[-0.03em] text-stone-900`}>
            {data ? "Booking Successful" : "Reservation details are unavailable"}
          </h1>
          <p className="mt-4 max-w-3xl text-sm leading-7 text-stone-600">
            {data
              ? "Your stay is confirmed, and everything is ready for you to revisit whenever you need your booking details."
              : error || "We couldn't load the final reservation details right now."}
          </p>

          {data ? (
            <>
              {/* This block shows the stored reservation snapshot that was created on the server. */}
              <div className="mt-8 grid gap-4 md:grid-cols-2">
                <InfoCard label="Reservation Code" value={data.reservationCode} />
                <InfoCard label="Status" value={data.reservationStatus} />
                <InfoCard label="Hotel" value={data.hotelName} />
                <InfoCard label="Room Type" value={data.roomTypeName} />
                <InfoCard
                  label="Stay"
                  value={`${data.checkIn} to ${data.checkOut} · ${data.nights} ${data.nights === 1 ? "night" : "nights"}`}
                />
                <InfoCard
                  label="Guests"
                  value={`${data.totalGuests} ${data.totalGuests === 1 ? "guest" : "guests"} · ${data.roomCount} ${data.roomCount === 1 ? "room" : "rooms"}`}
                />
                <InfoCard
                  label="Nightly Rate"
                  value={`AED ${formatCurrency(data.pricePerNight)} per room per night`}
                />
                <InfoCard label="Total Price" value={`AED ${formatCurrency(data.totalPrice)}`} />
              </div>

              <p className="mt-6 rounded-[22px] border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm leading-6 text-emerald-900">
                Keep your reservation code handy. It will be used during hotel check-in and later guest stay support.
              </p>

              <div className="mt-8 flex flex-wrap gap-3">
                <Link
                  href="/guest/bookings"
                  className="inline-flex items-center rounded-full bg-stone-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-stone-800"
                >
                  View My Bookings
                </Link>
                <Link
                  href="/search"
                  className="inline-flex items-center rounded-full border border-stone-300 bg-white px-5 py-3 text-sm font-semibold text-stone-700 transition hover:border-stone-400 hover:text-stone-950"
                >
                  Book another stay
                </Link>
              </div>
            </>
          ) : (
            <div className="mt-8">
              <Link
                href="/search"
                className="inline-flex items-center rounded-full bg-stone-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-stone-800"
              >
                Back to search
              </Link>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[24px] border border-stone-200/80 bg-white/85 px-5 py-4">
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
