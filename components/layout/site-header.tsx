import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";
import logo from "@/assets/images/bookmymanzil - final logo.png";
import type { GuestSessionState } from "@/lib/auth/guest-session";
import { getGuestSessionState } from "@/lib/auth/guest-session";
import { LandingLoginButton, LandingLoginButtonFallback } from "@/components/auth/LoginModal";
import { LandingRegisterButton, LandingRegisterButtonFallback } from "@/components/auth/RegisterModal";
import { GuestProfileMenu } from "@/components/layout/guest-profile-menu";

type HeaderLink = {
  href: string;
  label: string;
};

type SiteHeaderProps = {
  links: HeaderLink[];
  session?: GuestSessionState | null;
};

export async function SiteHeader({ links, session }: SiteHeaderProps) {
  const guestSession = session ?? (await getGuestSessionState());

  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-[#f7f1e8]/86 backdrop-blur-xl">
      <div className="mx-auto flex h-22 w-full max-w-[1280px] items-center justify-between px-6">
        <Link href="/" className="flex items-center gap-3 rounded-2xl px-2 py-1.5 transition hover:bg-white/50">
          <Image src={logo} alt="BookMyManzil logo" className="h-13 w-auto drop-shadow-sm" priority />
          <div className="leading-tight">
            <p className="text-base font-semibold tracking-tight text-stone-900">BookMyManzil</p>
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-amber-700">Premium stays</p>
          </div>
        </Link>

        <nav className="hidden items-center gap-8 text-sm font-semibold text-stone-700 lg:flex">
          {links.map((link) => (
            <Link key={`${link.href}-${link.label}`} href={link.href} className="transition hover:text-stone-950">
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          {guestSession?.isGuest ? (
            <GuestProfileMenu
              firstName={guestSession.firstName}
              fullName={guestSession.fullName}
              initials={guestSession.initials}
            />
          ) : (
            <>
              <Suspense fallback={<LandingRegisterButtonFallback />}>
                <LandingRegisterButton />
              </Suspense>
              <Suspense fallback={<LandingLoginButtonFallback />}>
                <LandingLoginButton />
              </Suspense>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
