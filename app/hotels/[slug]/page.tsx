import Link from "next/link";
import { notFound } from "next/navigation";
import { Cormorant_Garamond } from "next/font/google";
import Image from "next/image";
import type { ReactNode } from "react";
import fallbackStayImage from "@/assets/images/rosewood.jpg";
import { getHotelDetailsPageData } from "@/lib/hotels/hotel-details";
import { buildSearchParams } from "@/lib/search/search-query";

const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

type HotelDetailsPageProps = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function HotelDetailsPage({ params, searchParams }: HotelDetailsPageProps) {
  const { slug } = await params;
  const { dataIssue, hotel, queryState, roomOptions } = await getHotelDetailsPageData({
    rawSearchParams: searchParams,
    slug,
  });

  if (!hotel) {
    if (dataIssue) {
      return (
        <main className="min-h-screen bg-[#f7f1e8] px-6 py-10 text-stone-900 md:py-12">
          <div className="mx-auto max-w-4xl">
            <InfoState title="Hotel details are temporarily unavailable" description={dataIssue} />
          </div>
        </main>
      );
    }

    notFound();
  }

  const searchHref = queryState.isValid ? `/search?${buildSearchParams(queryState.query, queryState.query.roomType)}` : "/";
  const bookingBaseParams = queryState.isValid
    ? buildSearchParams(queryState.query, queryState.query.roomType)
    : buildSearchParams({ ...queryState.query, nights: Math.max(queryState.query.nights, 1) }, queryState.query.roomType);

  return (
    <main className="min-h-screen bg-[#f7f1e8] px-6 py-10 text-stone-900 md:py-12">
      <div className="mx-auto max-w-[1320px] space-y-8">
        {/* This is the top hero and stay summary for the hotel details page. */}
        <section className="overflow-hidden rounded-[36px] border border-white/70 bg-[rgba(255,252,247,0.84)] shadow-[0_18px_48px_rgba(96,72,47,0.08)]">
          <div className="relative min-h-[360px] bg-stone-200 md:min-h-[460px]">
            {hotel.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={hotel.imageUrl} alt={hotel.name} className="absolute inset-0 h-full w-full object-cover" />
            ) : (
              <Image
                src={fallbackStayImage}
                alt={hotel.name}
                fill
                sizes="100vw"
                className="object-cover"
              />
            )}
            <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(17,24,39,0.14)_0%,rgba(17,24,39,0.24)_30%,rgba(17,24,39,0.72)_100%)]" />

            <div className="relative flex min-h-[360px] flex-col justify-between p-6 text-white md:min-h-[460px] md:p-8">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <Link
                  href={searchHref}
                  className="inline-flex items-center rounded-full border border-white/35 bg-white/10 px-4 py-2 text-sm font-semibold text-white backdrop-blur-sm transition hover:bg-white/15"
                >
                  Back to results
                </Link>

                <div className="flex flex-wrap gap-2 text-sm">
                  <OverlayPill>{hotel.city}</OverlayPill>
                  <OverlayPill>Check-in {hotel.checkInTime}</OverlayPill>
                  <OverlayPill>Check-out {hotel.checkOutTime}</OverlayPill>
                </div>
              </div>

              <div className="max-w-4xl">
                <p className="text-[11px] font-semibold uppercase tracking-[0.26em] text-amber-200">Hotel Details</p>
                <h1 className={`${cormorant.className} mt-5 text-5xl tracking-[-0.03em] md:text-7xl`}>
                  {hotel.name}
                </h1>
                <p className="mt-4 max-w-3xl text-sm leading-7 text-white/82 md:text-base">{hotel.description}</p>
              </div>
            </div>
          </div>

          <div className="grid gap-4 border-t border-white/70 bg-[rgba(255,252,247,0.9)] px-6 py-6 md:grid-cols-2 xl:grid-cols-4 xl:px-8">
            <InfoCard label="Address" value={hotel.address} />
            <InfoCard
              label="Selected Stay"
              value={
                queryState.isValid
                  ? `${queryState.query.checkIn} to ${queryState.query.checkOut}`
                  : "Pick dates on the search page to confirm your stay."
              }
            />
            <InfoCard
              label="Guests & Rooms"
              value={
                queryState.isValid
                  ? `${queryState.query.adults} adults${queryState.query.children ? `, ${queryState.query.children} children` : ""} · ${queryState.query.rooms} ${queryState.query.rooms === 1 ? "room" : "rooms"}`
                  : "Guest details will follow your search selection."
              }
            />
            <InfoCard
              label="Room Preference"
              value={queryState.query.roomType === "All" ? "Showing all available room types" : queryState.query.roomType}
            />
          </div>
        </section>

        {/* This is the room list area for the selected hotel and stay. */}
        <section className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
          <aside className="space-y-5">
            <div className="rounded-[30px] border border-white/70 bg-[rgba(255,252,247,0.84)] p-6 shadow-[0_18px_48px_rgba(96,72,47,0.08)]">
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-stone-500">Stay Snapshot</p>
              <div className="mt-5 space-y-4">
                <SidebarRow label="Destination" value={hotel.city} />
                <SidebarRow label="Check-in" value={queryState.query.checkIn || hotel.checkInTime} />
                <SidebarRow label="Check-out" value={queryState.query.checkOut || hotel.checkOutTime} />
                <SidebarRow
                  label="Length"
                  value={`${Math.max(queryState.query.nights, 1)} ${Math.max(queryState.query.nights, 1) === 1 ? "night" : "nights"}`}
                />
                <SidebarRow
                  label="Room Type"
                  value={queryState.query.roomType === "All" ? "All available room types" : queryState.query.roomType}
                />
              </div>
            </div>

            <div className="rounded-[30px] border border-dashed border-stone-300 bg-stone-50/80 p-6">
              <p className="text-sm font-semibold text-stone-900">You&apos;re almost there</p>
              <p className="mt-2 text-sm leading-7 text-stone-600">
                When you continue, we&apos;ll carry your selected dates and guest details into the booking step so
                everything stays ready for a smooth checkout.
              </p>
            </div>
          </aside>

          <div className="space-y-5">
            {!queryState.isValid ? (
              <InfoState
                title="Stay details are incomplete"
                description="Choose dates and guests from the homepage search to see totals tailored to your stay. You can still browse this hotel's room options below."
              />
            ) : null}

            {dataIssue ? <InfoState title="Room details are temporarily unavailable" description={dataIssue} /> : null}

            {!dataIssue && roomOptions.length === 0 ? (
              <InfoState
                title="No matching room options were found"
                description="Try returning to the results page and switching the room type to All, or adjust your travel details."
              />
            ) : null}

            {roomOptions.map((roomOption) => {
              const bookingParams = new URLSearchParams(bookingBaseParams);
              bookingParams.set("hotel_id", hotel.id);
              bookingParams.set("hotel_slug", hotel.slug);
              bookingParams.set("hotel_name", hotel.name);
              bookingParams.set("room_type_name", roomOption.roomTypeName);
              bookingParams.set("selected_rooms", String(queryState.query.rooms));
              bookingParams.set("price_per_night", String(roomOption.pricePerNight));
              bookingParams.set("total_price", String(roomOption.totalStayPrice));

              if (roomOption.roomTypeId) {
                bookingParams.set("room_type_id", roomOption.roomTypeId);
              }

              return (
                <article
                  key={roomOption.key}
                  className="overflow-hidden rounded-[32px] border border-white/70 bg-[rgba(255,252,247,0.84)] shadow-[0_18px_48px_rgba(96,72,47,0.08)]"
                >
                  <div className="grid gap-0 xl:grid-cols-[320px_minmax(0,1fr)]">
                    <div className="relative min-h-[260px] bg-stone-200">
                      {roomOption.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={roomOption.imageUrl}
                          alt={roomOption.label}
                          className="absolute inset-0 h-full w-full object-cover"
                        />
                      ) : (
                        <Image
                          src={fallbackStayImage}
                          alt={roomOption.label}
                          fill
                          sizes="(min-width: 1280px) 320px, 100vw"
                          className="object-cover"
                        />
                      )}
                      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(15,23,42,0.04)_0%,rgba(15,23,42,0.0)_36%,rgba(15,23,42,0.3)_100%)]" />
                    </div>

                    <div className="flex flex-col justify-between p-6 md:p-7">
                      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                        <div className="max-w-2xl">
                          <div className="flex flex-wrap gap-2">
                            <ResultChip>{roomOption.label}</ResultChip>
                            <ResultChip>
                              {roomOption.availableRoomCount} {roomOption.availableRoomCount === 1 ? "room" : "rooms"} available
                            </ResultChip>
                            {roomOption.occupancyText ? <ResultChip>{roomOption.occupancyText}</ResultChip> : null}
                          </div>

                          <h2 className="mt-4 text-3xl font-semibold tracking-tight text-stone-900">{roomOption.label}</h2>
                          <p className="mt-4 max-w-2xl text-sm leading-7 text-stone-600">{roomOption.description}</p>
                        </div>

                        <div className="rounded-[24px] bg-stone-50/90 px-5 py-4 text-left shadow-inner shadow-stone-200/60 lg:min-w-[220px]">
                          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">Stay Pricing</p>
                          <p className="mt-3 text-sm text-stone-600">
                            AED {formatCurrency(roomOption.pricePerNight)} per night
                          </p>
                          <p className="mt-2 text-3xl font-semibold tracking-tight text-stone-900">
                            AED {formatCurrency(roomOption.totalStayPrice)}
                          </p>
                          <p className="mt-1 text-xs text-stone-500">
                            Total for {Math.max(queryState.query.nights, 1)} {Math.max(queryState.query.nights, 1) === 1 ? "night" : "nights"}
                          </p>
                          {roomOption.validationMessage ? (
                            <p className="mt-4 rounded-[18px] border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
                              {roomOption.validationMessage}
                            </p>
                          ) : (
                            <p className="mt-4 text-sm leading-6 text-stone-600">
                              This room selection fits your current stay details and is ready for the next booking step.
                            </p>
                          )}
                          {roomOption.canBook ? (
                            <Link
                              href={`/booking?${bookingParams.toString()}`}
                              className="mt-5 inline-flex h-12 w-full items-center justify-center rounded-full bg-stone-900 px-5 text-sm font-semibold text-white transition hover:bg-stone-800"
                            >
                              Book Now
                            </Link>
                          ) : (
                            <button
                              type="button"
                              disabled
                              className="mt-5 inline-flex h-12 w-full cursor-not-allowed items-center justify-center rounded-full bg-stone-300 px-5 text-sm font-semibold text-stone-600"
                            >
                              Book Now
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      </div>
    </main>
  );
}

function OverlayPill({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-full border border-white/25 bg-white/10 px-3 py-1.5 font-medium text-white backdrop-blur-sm">
      {children}
    </span>
  );
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[22px] border border-stone-200/80 bg-white/85 px-4 py-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-stone-500">{label}</p>
      <p className="mt-2 text-sm font-semibold leading-6 text-stone-900">{value}</p>
    </div>
  );
}

function ResultChip({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-amber-800">
      {children}
    </span>
  );
}

function SidebarRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[22px] border border-stone-200/80 bg-white/85 px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-stone-500">{label}</p>
      <p className="mt-2 text-sm font-semibold leading-6 text-stone-900">{value}</p>
    </div>
  );
}

function InfoState({ title, description }: { title: string; description: string }) {
  return (
    <section className="rounded-[32px] border border-white/70 bg-[rgba(255,252,247,0.84)] p-8 text-left shadow-[0_18px_48px_rgba(96,72,47,0.08)]">
      <h2 className="text-2xl font-semibold tracking-tight text-stone-900">{title}</h2>
      <p className="mt-3 max-w-2xl text-sm leading-7 text-stone-600">{description}</p>
    </section>
  );
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-AE", {
    maximumFractionDigits: 0,
  }).format(value);
}
