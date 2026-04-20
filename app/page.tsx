import Image from "next/image";
import { Cormorant_Garamond } from "next/font/google";
import Link from "next/link";
import logo from "@/assets/images/bookmymanzil - final logo.png";
import heroImage from "@/assets/images/bookmymanzil - hero image.png";
import sofitelImage from "@/assets/images/sofitel-dubai-the-obelisk.jpg";
import andazImage from "@/assets/images/andaz-capital-gate.jpg";
import hiltonImage from "@/assets/images/hilton-abu-dhabi.jpg";
import rosewoodImage from "@/assets/images/rosewood.jpg";
import aboutImage from "@/assets/images/emirates-palace.jpg";
import { SearchPanel } from "@/components/booking/search-panel";
import { SiteHeader } from "@/components/layout/site-header";

const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

const trendingHotels = [
  {
    name: "Sofitel Dubai The Obelisk",
    location: "Dubai, UAE",
    price: "From AED 1,065/night",
    rating: "4.8",
    tag: "Luxury City Stay",
    image: sofitelImage,
  },
  {
    name: "Andaz Capital Gate",
    location: "Abu Dhabi, UAE",
    price: "From AED 1,281/night",
    rating: "4.7",
    tag: "Skyline Landmark",
    image: andazImage,
  },
  {
    name: "Hilton Abu Dhabi",
    location: "Abu Dhabi, UAE",
    price: "From AED 1,025/night",
    rating: "4.6",
    tag: "Family Friendly",
    image: hiltonImage,
  },
  {
    name: "Rosewood Abu Dhabi",
    location: "Abu Dhabi, UAE",
    price: "From AED 1,465/night",
    rating: "4.9",
    tag: "Waterfront Luxury",
    image: rosewoodImage,
  },
];

const whyFeatures = [
  {
    title: "Transparent Rates",
    description: "Elegant stays with clear pricing from first search to final confirmation.",
    icon: "rates",
  },
  {
    title: "Instant Confirmation",
    description: "Move from inspiration to itinerary in moments, with immediate booking clarity.",
    icon: "confirmation",
  },
  {
    title: "Seamless Guest Journey",
    description: "Check-in, in-stay requests, and departures all feel calm, smooth, and considered.",
    icon: "journey",
  },
];

export default async function Home() {
  return (
    <div className="min-h-screen bg-[#f7f1e8] font-[family:var(--font-geist-sans)] text-stone-900">
      <SiteHeader
        links={[
          { href: "#about-us", label: "About Us" },
          { href: "#trending-hotels", label: "Hotels" },
          { href: "/guest", label: "Guest Area" },
        ]}
      />

      <main>
        <section className="relative isolate overflow-hidden">
          <div className="absolute inset-0">
            <Image
              src={heroImage}
              alt="BookMyManzil luxury villa retreat"
              fill
              sizes="100vw"
              className="object-cover"
              priority
            />
            <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(16,18,23,0.72)_0%,rgba(21,24,31,0.52)_42%,rgba(33,26,19,0.26)_100%)]" />
            <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(31,24,17,0.18)_0%,rgba(31,24,17,0.08)_46%,rgba(31,24,17,0.48)_100%)]" />
          </div>

          <div className="relative mx-auto max-w-[1280px] px-6 pb-38 pt-22 md:pb-44 md:pt-28">
            <div className="mx-auto max-w-3xl text-center">
            <p className="relative -left-2 text-[11px] font-semibold uppercase tracking-[0.28em] text-amber-200">
            Curated Luxury Across The Emirates
              </p>
              <h1
                className={`${cormorant.className} mt-5 text-6xl leading-[0.95] tracking-[-0.03em] text-white md:text-7xl lg:text-[5.5rem]`}
              >
                Find a stay that feels beautifully yours.
              </h1>
              <p className="mx-auto mt-6 max-w-2xl text-lg leading-8 text-stone-100/92 md:text-xl">
                Book resort escapes, city hideaways, and family-friendly retreats with BookMyManzil — a softer, more
                thoughtful booking experience from arrival to departure.
              </p>
            </div>
          </div>
        </section>

        <div id="search-panel" className="relative z-10 -mt-20 px-6 md:-mt-24">
          <div className="mx-auto max-w-[1160px]">
            <SearchPanel />
          </div>
        </div>

        <section className="mx-auto mt-24 max-w-[1280px] px-6 md:mt-28">
          <div className="mx-auto max-w-3xl text-center">
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-amber-700">Why BookMyManzil</p>
            <h2 className={`${cormorant.className} mt-4 text-5xl tracking-[-0.03em] text-stone-900`}>
              Booking should feel as refined as the stay itself.
            </h2>
          </div>

          <div className="mt-12 grid gap-5 md:grid-cols-3">
            {whyFeatures.map((feature) => (
              <article
                key={feature.title}
                className="rounded-[30px] border border-white/70 bg-[rgba(255,252,247,0.82)] p-7 shadow-[0_18px_48px_rgba(96,72,47,0.08)]"
              >
                <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-stone-900 text-white">
                  <FeatureIcon type={feature.icon} />
                </div>
                <h3 className="mt-5 text-xl font-semibold tracking-tight text-stone-900">{feature.title}</h3>
                <p className="mt-3 text-sm leading-7 text-stone-600">{feature.description}</p>
              </article>
            ))}
          </div>
        </section>

        <section id="trending-hotels" className="mx-auto mt-24 max-w-[1280px] px-6 md:mt-28">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div className="max-w-2xl">
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-amber-700">Trending Hotels</p>
              <h2 className={`${cormorant.className} mt-4 text-5xl tracking-[-0.03em] text-stone-900`}>
                Stays guests are saving first.
              </h2>
            </div>
          </div>

          <div className="mt-10 grid gap-6 md:grid-cols-2 xl:grid-cols-4">
            {trendingHotels.map((hotel) => (
              <article
                key={hotel.name}
                className="group overflow-hidden rounded-[30px] border border-white/70 bg-[rgba(255,252,247,0.82)] shadow-[0_18px_48px_rgba(96,72,47,0.08)] transition duration-300 hover:-translate-y-1 hover:shadow-[0_24px_56px_rgba(96,72,47,0.14)]"
              >
                <div className="relative h-64 overflow-hidden">
                  <Image
                    src={hotel.image}
                    alt={hotel.name}
                    fill
                    sizes="(min-width: 1280px) 25vw, (min-width: 768px) 50vw, 100vw"
                    className="object-cover transition duration-500 group-hover:scale-[1.04]"
                  />
                  <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(15,23,42,0.06)_0%,rgba(15,23,42,0.0)_35%,rgba(15,23,42,0.48)_100%)]" />
                  <div className="absolute left-4 top-4 rounded-full bg-white/90 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-stone-700">
                    {hotel.tag}
                  </div>
                </div>

                <div className="p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-xl font-semibold leading-tight text-stone-900">{hotel.name}</h3>
                      <p className="mt-1 text-sm text-stone-500">{hotel.location}</p>
                    </div>
                    <div className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800">
                      {hotel.rating}/5
                    </div>
                  </div>
                  <p className="mt-4 text-sm font-semibold tracking-wide text-amber-800">{hotel.price}</p>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section id="about-us" className="mx-auto mt-24 max-w-[1280px] px-6 pb-24 md:mt-28 md:pb-28">
          <div className="grid items-center gap-8 rounded-[34px] border border-white/70 bg-[rgba(255,252,247,0.82)] p-6 shadow-[0_18px_48px_rgba(96,72,47,0.08)] lg:grid-cols-[1.05fr_1fr] lg:p-8">
            <div className="max-w-xl">
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-amber-700">About Us</p>
              <h2 className={`${cormorant.className} mt-4 text-5xl tracking-[-0.03em] text-stone-900`}>
                Hospitality-first booking, shaped around the guest journey.
              </h2>
              <p className="mt-5 text-base leading-8 text-stone-600">
                BookMyManzil brings hotel discovery, reservations, and guest experience into one polished destination.
                From selecting the right stay to managing check-in, check-out, and in-stay support, every interaction is
                designed to feel calm, elevated, and easy to trust. Built for both guests and hotel teams, the platform
                connects booking, operations, and service into one seamless experience that feels thoughtful from start
                to finish.
              </p>
            </div>

            <div className="relative h-[360px] overflow-hidden rounded-[28px] shadow-[0_18px_48px_rgba(96,72,47,0.12)]">
              <Image
                src={aboutImage}
                alt="Hospitality experience at BookMyManzil"
                fill
                sizes="(min-width: 1024px) 40vw, 100vw"
                className="object-cover"
              />
              <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(15,23,42,0.02)_0%,rgba(15,23,42,0.24)_100%)]" />
            </div>
          </div>
        </section>
      </main>

      <footer className="bg-stone-950 text-stone-300">
        <div className="mx-auto grid max-w-[1280px] gap-12 px-6 py-14 md:grid-cols-[1.15fr_1fr_1fr_1fr]">
          <div>
            <Image src={logo} alt="BookMyManzil brand mark" className="h-14 w-auto brightness-110" />
            <p className="mt-4 max-w-sm text-sm leading-7 text-stone-400">
              A refined home for premium hotel discovery, reservations, and guest journeys across the Emirates.
            </p>
          </div>

          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-white">Explore</p>
            <ul className="mt-4 space-y-3 text-sm text-stone-400">
              <li>
                <Link href="#about-us" className="transition hover:text-white">
                  About Us
                </Link>
              </li>
              <li>
                <Link href="#trending-hotels" className="transition hover:text-white">
                  Hotels
                </Link>
              </li>
              <li>
                <Link href="/guest" className="transition hover:text-white">
                  Guest Area
                </Link>
              </li>
              <li>
                <Link href="/guest" className="transition hover:text-white">
                  AI Assistant
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-white">Resources</p>
            <ul className="mt-4 space-y-3 text-sm text-stone-400">
              <li>
                <Link href="#search-panel" className="transition hover:text-white">
                  Room Types
                </Link>
              </li>
              <li>
                <a href="/login" className="transition hover:text-white">
                  For Staff
                </a>
              </li>
            </ul>
          </div>

          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-white">Get In Touch</p>
            <ul className="mt-4 space-y-3 text-sm text-stone-400">
              <li>
                <Link href="mailto:support@bookmymanzil.com" className="transition hover:text-white">
                  support@bookmymanzil.com
                </Link>
              </li>
              <li>
                <Link href="tel:+9714XXXXXXX" className="transition hover:text-white">
                  +971 4 XXX XXXX
                </Link>
              </li>
            </ul>
          </div>
        </div>
        <div className="border-t border-white/10 py-4 text-center text-sm text-stone-500">
          Copyright 2026 BookMyManzil. All rights reserved.
        </div>
      </footer>
    </div>
  );
}

function FeatureIcon({ type }: { type: string }) {
  if (type === "rates") {
    return (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.7">
        <path d="M4 7h16" />
        <path d="M4 12h10" />
        <path d="M4 17h7" />
        <circle cx="18" cy="17" r="2.5" />
      </svg>
    );
  }

  if (type === "confirmation") {
    return (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.7">
        <path d="M13 3 5 14h6l-1 7 9-12h-6l0-6Z" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.7">
      <path d="M5 11.5 12 4l7 7.5" />
      <path d="M7 10.5v8h10v-8" />
      <path d="M10 13.5h4" />
    </svg>
  );
}
