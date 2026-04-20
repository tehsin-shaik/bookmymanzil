import Link from "next/link";
import { Cormorant_Garamond } from "next/font/google";
import Image from "next/image";
import type { ReactNode } from "react";
import fallbackStayImage from "@/assets/images/rosewood.jpg";
import {
  buildSearchParams,
  ROOM_TYPE_OPTIONS,
} from "@/lib/search/search-query";
import { getSearchResults } from "@/lib/search/search-results";

const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

type SearchPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const { dataIssue, queryState, results } = await getSearchResults(searchParams);
  const { query } = queryState;

  const pageTitle = query.location ? `Stays in ${query.location}` : "Search stays";
  const staySummary = `${query.nights || 0} ${query.nights === 1 ? "night" : "nights"} · ${query.adults} ${
    query.adults === 1 ? "adult" : "adults"
  }${query.children ? ` · ${query.children} ${query.children === 1 ? "child" : "children"}` : ""} · ${query.rooms} ${
    query.rooms === 1 ? "room" : "rooms"
  }`;

  return (
    <main className="min-h-screen bg-[#f7f1e8] px-6 py-10 text-stone-900 md:py-12">
      <div className="mx-auto max-w-[1320px]">
        {/* This is the top summary area for the search page. */}
        <section className="rounded-[34px] border border-white/70 bg-[rgba(255,252,247,0.84)] px-6 py-7 shadow-[0_18px_48px_rgba(96,72,47,0.08)] md:px-8">
          <Link
            href="/"
            className="inline-flex items-center rounded-full border border-stone-300 bg-white/85 px-4 py-2 text-sm font-semibold text-stone-700 transition hover:border-stone-400 hover:text-stone-950"
          >
            Back to search
          </Link>

          <div className="mt-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-amber-700">Search Results</p>
              <h1 className={`${cormorant.className} mt-4 text-5xl tracking-[-0.03em] text-stone-900`}>
                {pageTitle}
              </h1>
              <div className="mt-3 flex flex-wrap gap-2 text-sm text-stone-600">
                <SummaryPill>{staySummary}</SummaryPill>
                <SummaryPill>Room type: {query.roomType}</SummaryPill>
              </div>
            </div>

            <p className="max-w-md text-sm leading-7 text-stone-600">
              Explore available stays matched to your selected city, travel dates, and preferred room category.
            </p>
          </div>
        </section>

        {!queryState.isValid ? (
          <InvalidSearchState issues={queryState.issues} />
        ) : (
          <section className="mt-8 grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
            {/* This is the left sidebar with the chosen filters. */}
            <aside className="space-y-5">
              <div className="rounded-[30px] border border-white/70 bg-[rgba(255,252,247,0.84)] p-6 shadow-[0_18px_48px_rgba(96,72,47,0.08)]">
                <p className="text-sm font-semibold uppercase tracking-[0.16em] text-stone-500">Your Search</p>

                <div className="mt-5 space-y-4">
                  <SidebarRow label="Destination" value={query.location || "UAE"} />
                  <SidebarRow label="Dates" value={`${query.checkIn} to ${query.checkOut}`} />
                  <SidebarRow label="Stay length" value={`${query.nights} ${query.nights === 1 ? "night" : "nights"}`} />
                  <SidebarRow
                    label="Guests"
                    value={`${query.adults} ${query.adults === 1 ? "adult" : "adults"}${query.children ? `, ${query.children} ${query.children === 1 ? "child" : "children"}` : ""}`}
                  />
                  <SidebarRow label="Rooms" value={`${query.rooms} ${query.rooms === 1 ? "room" : "rooms"}`} />
                </div>
              </div>

              <div className="rounded-[30px] border border-white/70 bg-[rgba(255,252,247,0.84)] p-6 shadow-[0_18px_48px_rgba(96,72,47,0.08)]">
                <p className="text-sm font-semibold uppercase tracking-[0.16em] text-stone-500">Room Type</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {ROOM_TYPE_OPTIONS.map((option) => (
                    <Link
                      key={option}
                      href={`/search?${buildSearchParams(query, option)}`}
                      className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                        query.roomType === option
                          ? "bg-stone-900 text-white shadow-[0_10px_24px_rgba(28,25,23,0.18)]"
                          : "border border-stone-200 bg-white text-stone-600 hover:border-stone-300 hover:text-stone-900"
                      }`}
                    >
                      {option}
                    </Link>
                  ))}
                </div>
              </div>

              <div className="rounded-[30px] border border-dashed border-stone-300 bg-stone-50/80 p-6">
                <p className="text-sm font-semibold text-stone-900">More filters coming next</p>
                <p className="mt-2 text-sm leading-7 text-stone-600">
                  Amenities, price bands, guest ratings, and real reservation overlap checks can slot into this sidebar
                  next without changing the current search flow.
                </p>
              </div>
            </aside>

            {/* This is the main results list for hotels and room matches. */}
            <div className="space-y-5">
              {dataIssue ? (
                <InfoState
                  title="Availability is temporarily unavailable"
                  description={dataIssue}
                />
              ) : null}

              {!dataIssue && results.length === 0 ? (
                <InfoState
                  title="No stays matched this search"
                  description="Try broadening the destination, switching the room type to All, or adjusting your travel dates."
                />
              ) : null}

              {results.map((result) => (
                <article
                  key={result.id}
                  className="overflow-hidden rounded-[32px] border border-white/70 bg-[rgba(255,252,247,0.84)] shadow-[0_18px_48px_rgba(96,72,47,0.08)]"
                >
                  <div className="grid gap-0 xl:grid-cols-[320px_minmax(0,1fr)]">
                    <div className="relative min-h-[260px] bg-stone-200">
                      {result.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={result.imageUrl}
                          alt={result.hotelName}
                          className="absolute inset-0 h-full w-full object-cover"
                        />
                      ) : (
                        <Image
                          src={fallbackStayImage}
                          alt={result.hotelName}
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
                          <div className="flex flex-wrap items-center gap-2 text-sm text-stone-500">
                            <span>{result.city}</span>
                            <span className="h-1 w-1 rounded-full bg-stone-300" />
                            <span>Curated stay</span>
                          </div>
                          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-stone-900">{result.hotelName}</h2>
                          <p className="mt-4 max-w-2xl text-sm leading-7 text-stone-600">{result.description}</p>

                          {query.roomType === "All" ? (
                            <div className="mt-5 space-y-3">
                              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">
                                Room availability
                              </p>
                              <div className="flex flex-wrap gap-2">
                                {result.roomSummaries.map((summary) => (
                                  <ResultChip key={`${result.id}-${summary.label}`}>
                                    {summary.availableRoomCount} {summary.label}
                                    {summary.availableRoomCount === 1 ? "" : "s"} available
                                  </ResultChip>
                                ))}
                              </div>
                            </div>
                          ) : result.selectedRoomTypeSummary ? (
                            <div className="mt-5 flex flex-wrap gap-2">
                              <ResultChip>{result.selectedRoomTypeSummary.label}</ResultChip>
                              <ResultChip>
                                {result.selectedRoomTypeSummary.availableRoomCount} rooms available
                              </ResultChip>
                            </div>
                          ) : null}
                        </div>

                        <div className="rounded-[24px] bg-stone-50/90 px-5 py-4 text-left shadow-inner shadow-stone-200/60 lg:min-w-[220px]">
                          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">Stay Pricing</p>
                          <p className="mt-3 text-sm text-stone-600">
                            {query.roomType === "All" ? "From" : ""}
                            {query.roomType === "All" ? " " : ""}
                            AED{" "}
                            {formatCurrency(
                              query.roomType === "All"
                                ? result.lowestPricePerNight
                                : result.selectedRoomTypeSummary?.pricePerNight || result.lowestPricePerNight
                            )}{" "}
                            per night
                          </p>
                          <p className="mt-2 text-3xl font-semibold tracking-tight text-stone-900">
                            AED{" "}
                            {formatCurrency(
                              query.roomType === "All"
                                ? result.lowestTotalStayPrice
                                : result.selectedRoomTypeSummary?.totalStayPrice || result.lowestTotalStayPrice
                            )}
                          </p>
                          <p className="mt-1 text-xs text-stone-500">
                            {query.roomType === "All" ? "From total for" : "Total for"} {query.nights}{" "}
                            {query.nights === 1 ? "night" : "nights"}
                          </p>
                          <Link
                            href={`/hotels/${result.slug}?${buildSearchParams(query, query.roomType)}`}
                            className="mt-5 inline-flex h-12 w-full items-center justify-center rounded-full bg-stone-900 px-5 text-sm font-semibold text-white transition hover:bg-stone-800"
                          >
                            View Rooms
                          </Link>
                        </div>
                      </div>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}

function SummaryPill({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-full border border-stone-200 bg-white/80 px-3 py-1.5 font-medium text-stone-700">
      {children}
    </span>
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
      <p className="mt-2 text-sm font-semibold text-stone-900">{value}</p>
    </div>
  );
}

function InvalidSearchState({ issues }: { issues: string[] }) {
  return (
    <section className="mt-8 rounded-[34px] border border-white/70 bg-[rgba(255,252,247,0.84)] p-8 shadow-[0_18px_48px_rgba(96,72,47,0.08)]">
      <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-amber-700">Search Details Needed</p>
      <h2 className="mt-4 text-3xl font-semibold tracking-tight text-stone-900">We need a few more details to show results.</h2>
      <ul className="mt-5 space-y-3 text-sm leading-7 text-stone-600">
        {issues.map((issue) => (
          <li key={issue} className="rounded-[20px] border border-stone-200/80 bg-white/85 px-4 py-3">
            {issue}
          </li>
        ))}
      </ul>
    </section>
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
