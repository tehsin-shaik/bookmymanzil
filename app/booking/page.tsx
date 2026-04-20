import Link from "next/link";
import { Cormorant_Garamond } from "next/font/google";
import { BookingConfirmationForm } from "@/components/booking/booking-confirmation-form";
import { getGuestSessionState } from "@/lib/auth/guest-session";
import { checkRoomTypeAvailability } from "@/lib/booking/availability";
import { getAuthenticatedGuestContext } from "@/lib/booking/reservations";
import { parseSearchQuery } from "@/lib/search/search-query";

const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

type BookingPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function BookingPage({ searchParams }: BookingPageProps) {
  const params = await searchParams;
  const queryState = parseSearchQuery(params);
  const hotelId = readParam(params.hotel_id);
  const hotelSlug = readParam(params.hotel_slug) || readParam(params.hotelSlug);
  const hotelName = readParam(params.hotel_name) || readParam(params.hotelName);
  const roomTypeId = readParam(params.room_type_id);
  const roomTypeName = readParam(params.room_type_name) || readParam(params.selectedRoomType);
  const selectedRooms = readIntParam(params.selected_rooms, queryState.query.rooms, 1);
  const pricePerNight = readNumberParam(params.price_per_night);
  const totalPrice = readNumberParam(params.total_price);
  const hotelDetailsParams = buildParamsString(params);
  const guestSession = await getGuestSessionState();
  const guestContext = await getAuthenticatedGuestContext();
  const liveAvailability =
    hotelId && roomTypeId && queryState.query.checkIn && queryState.query.checkOut
      ? await checkRoomTypeAvailability({
          checkInDate: queryState.query.checkIn,
          checkOutDate: queryState.query.checkOut,
          hotelId,
          roomTypeId,
          selectedRooms,
        })
      : null;
  const currentBookingHref = `/booking?${hotelDetailsParams}`;
  const loginHref = `/?${buildAuthRedirectParams("login", currentBookingHref)}`;
  const registerHref = `/?${buildAuthRedirectParams("register", currentBookingHref)}`;
  const bookingContext = {
    adults: String(queryState.query.adults),
    checkIn: queryState.query.checkIn,
    checkOut: queryState.query.checkOut,
    children: String(queryState.query.children),
    hotel_id: hotelId,
    hotel_slug: hotelSlug,
    hotel_name: hotelName,
    nights: String(Math.max(queryState.query.nights, 1)),
    price_per_night: String(pricePerNight),
    room_type_id: roomTypeId,
    room_type_name: roomTypeName,
    selected_rooms: String(selectedRooms),
    total_price: String(totalPrice),
  };

  if (process.env.NODE_ENV !== "production") {
    console.log("[booking-page] room-type-handoff", {
      adults: queryState.query.adults,
      children: queryState.query.children,
      hotelId,
      hotelSlug,
      roomTypeId,
      roomTypeName,
      selectedRooms,
      totalGuests: queryState.query.adults + queryState.query.children,
    });
  }

  return (
    <main className="min-h-screen bg-[#f7f1e8] px-6 py-10 text-stone-900 md:py-12">
      <div className="mx-auto max-w-4xl">
        {/* This is the booking summary step before the reservation is actually created. */}
        <section className="rounded-[36px] border border-white/70 bg-[rgba(255,252,247,0.88)] p-8 shadow-[0_18px_48px_rgba(96,72,47,0.08)] md:p-10">
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-amber-700">Booking Flow</p>
          <h1 className={`${cormorant.className} mt-5 text-5xl tracking-[-0.03em] text-stone-900`}>
            Review your stay before we confirm it
          </h1>
          <p className="mt-4 max-w-3xl text-sm leading-7 text-stone-600">
            Take one final look at your stay details before you confirm. We&apos;ll quickly recheck availability so
            everything is ready for a smooth booking.
          </p>

          <div className="mt-8 grid gap-4 md:grid-cols-2">
            <InfoCard label="Hotel" value={hotelName || hotelSlug || "Selected hotel"} />
            <InfoCard label="Room Type" value={roomTypeName || queryState.query.roomType} />
            <InfoCard
              label="Stay"
              value={
                queryState.isValid
                  ? `${queryState.query.checkIn} to ${queryState.query.checkOut} · ${queryState.query.nights} ${queryState.query.nights === 1 ? "night" : "nights"}`
                  : "Search dates were not fully provided."
              }
            />
            <InfoCard
              label="Guests"
              value={`${queryState.query.adults} adults${queryState.query.children ? `, ${queryState.query.children} children` : ""} · ${selectedRooms} ${selectedRooms === 1 ? "room" : "rooms"}`}
            />
            <InfoCard
              label="Nightly Rate"
              value={
                pricePerNight > 0 ? `AED ${formatCurrency(pricePerNight)} per night` : "Room pricing will be confirmed on the server."
              }
            />
            <InfoCard
              label="Stay Total"
              value={totalPrice > 0 ? `AED ${formatCurrency(totalPrice)}` : "Stay total will be recalculated when you confirm."}
            />
            <InfoCard
              label="Verified Availability"
              value={
                liveAvailability
                  ? `${liveAvailability.actualAvailableRoomCount} ${liveAvailability.actualAvailableRoomCount === 1 ? "room" : "rooms"} available`
                  : "Live availability will be checked here before reservation creation."
              }
            />
            <InfoCard
              label="Booking Context"
              value={`Hotel ID ${hotelId || "pending"} · Room Type ID ${roomTypeId || "pending"}`}
            />
          </div>

          {guestSession?.isGuest ? (
            <section className="mt-8 rounded-[28px] border border-stone-200/80 bg-white/90 p-6 shadow-[0_12px_32px_rgba(15,23,42,0.06)]">
              {/* This block shows the guest identity that will be attached to the reservation before final confirmation. */}
              <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-700">Guest Details</p>
                  <h2 className={`${cormorant.className} mt-3 text-3xl tracking-[-0.03em] text-stone-900`}>
                    Your booking will be confirmed with your guest details
                  </h2>
                </div>
                {!guestSession.phoneNumber ? (
                  <Link
                    href="/guest/profile"
                    className="inline-flex items-center rounded-full border border-stone-300 bg-white px-4 py-2 text-sm font-semibold text-stone-700 transition hover:border-stone-400 hover:text-stone-950"
                  >
                    Review profile
                  </Link>
                ) : null}
              </div>

              <div className="mt-6 grid gap-4 md:grid-cols-3">
                <InfoCard label="Booked By" value={guestSession.fullName} />
                <InfoCard label="Email" value={guestSession.email || "Not available"} />
                <InfoCard
                  label="Phone Number"
                  value={guestSession.phoneNumber || "Missing from your guest profile"}
                />
              </div>

              {!guestSession.phoneNumber ? (
                <p className="mt-4 rounded-[20px] border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
                  Your phone number is currently missing. Booking can still continue, but you may want to add it from
                  your profile for smoother hotel communication.
                </p>
              ) : null}

              {guestSession.isGuest && !guestSession.hasGuestProfile ? (
                <p className="mt-4 rounded-[20px] border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
                  Your guest account looks incomplete because the guest profile row is missing. Booking will stay
                  blocked until the guest profile is repaired.
                </p>
              ) : null}
            </section>
          ) : null}

          {liveAvailability?.issue ? (
            <p className="mt-6 rounded-[20px] border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
              {liveAvailability.issue}
            </p>
          ) : null}

          {!queryState.isValid ? (
            <p className="mt-4 rounded-[20px] border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
              Your stay details are incomplete. Please return to search and choose a valid destination, date range, and
              room details before continuing.
            </p>
          ) : null}

          {/* This block handles the final booking action, including guest auth prompts and the confirmation modal. */}
          <BookingConfirmationForm
            bookingContext={bookingContext}
            guestDetails={
              guestSession?.isGuest
                ? {
                    email: guestSession.email || "Not available",
                    fullName: guestSession.fullName,
                    phoneNumber: guestSession.phoneNumber || "Missing from guest profile",
                  }
                : null
            }
            hotelName={hotelName || hotelSlug || "Selected hotel"}
            isAuthenticatedGuest={guestContext.isGuest}
            liveAvailabilityIssue={queryState.isValid ? liveAvailability?.issue || null : "Stay details are incomplete."}
            returnToLoginHref={loginHref}
            returnToRegisterHref={registerHref}
            roomTypeName={roomTypeName || queryState.query.roomType}
            summary={{
              adults: queryState.query.adults,
              checkIn: queryState.query.checkIn,
              checkOut: queryState.query.checkOut,
              children: queryState.query.children,
              nights: Math.max(queryState.query.nights, 1),
              pricePerNight,
              selectedRooms,
              totalGuests: queryState.query.adults + queryState.query.children,
              totalPrice,
            }}
          />

          {!guestContext.isGuest && guestContext.error ? (
            <p className="mt-4 text-sm leading-7 text-stone-600">{guestContext.error}</p>
          ) : null}

          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href={hotelSlug ? `/hotels/${hotelSlug}?${hotelDetailsParams}` : "/search"}
              className="inline-flex items-center rounded-full border border-stone-300 bg-white px-5 py-3 text-sm font-semibold text-stone-700 transition hover:border-stone-400 hover:text-stone-950"
            >
              Back to room details
            </Link>
            <Link
              href="/search"
              className="inline-flex items-center rounded-full bg-stone-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-stone-800"
            >
              Back to search results
            </Link>
          </div>
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

function buildParamsString(params: Record<string, string | string[] | undefined>) {
  const nextParams = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    const normalized = readParam(value);

    if (normalized) {
      nextParams.set(key, normalized);
    }
  }

  return nextParams.toString();
}

function buildAuthRedirectParams(mode: "login" | "register", returnTo: string) {
  const params = new URLSearchParams();
  params.set(mode, "1");
  params.set("returnTo", returnTo);
  return params.toString();
}

function readIntParam(value: string | string[] | undefined, fallback: number, minimum: number) {
  const normalized = readParam(value);
  const parsed = Number.parseInt(normalized, 10);

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.max(minimum, parsed);
}

function readNumberParam(value: string | string[] | undefined) {
  const normalized = readParam(value);
  const parsed = Number.parseFloat(normalized);

  return Number.isFinite(parsed) ? parsed : 0;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-AE", {
    maximumFractionDigits: 0,
  }).format(value);
}
