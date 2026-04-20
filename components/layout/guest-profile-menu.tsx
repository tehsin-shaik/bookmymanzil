"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { logOut } from "@/app/auth/actions";

type GuestProfileMenuProps = {
  firstName: string;
  fullName: string;
  initials: string;
};

export function GuestProfileMenu({ firstName, fullName, initials }: GuestProfileMenuProps) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  return (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="inline-flex items-center gap-3 rounded-full border border-white/70 bg-white/90 px-3 py-2 text-left shadow-[0_10px_30px_rgba(15,23,42,0.08)] transition hover:border-stone-300 hover:bg-white"
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-stone-900 text-sm font-semibold text-white">
          {initials}
        </span>
        <span className="hidden min-w-0 sm:block">
          <span className="block text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">Guest</span>
          <span className="block max-w-[120px] truncate text-sm font-semibold text-stone-900">
            {firstName}
          </span>
        </span>
        <svg viewBox="0 0 20 20" className="hidden h-4 w-4 text-stone-500 sm:block" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="m5 8 5 5 5-5" />
        </svg>
      </button>

      {open ? (
        <div
          className="absolute right-0 top-[calc(100%+0.75rem)] z-50 w-[240px] overflow-hidden rounded-[24px] border border-white/70 bg-[rgba(255,252,247,0.98)] p-2 shadow-[0_24px_64px_rgba(15,23,42,0.18)] ring-1 ring-stone-200/70"
          role="menu"
        >
          <div className="rounded-[18px] bg-stone-50/80 px-4 py-3">
            <p className="text-sm font-semibold text-stone-900">{fullName}</p>
            <p className="mt-1 text-xs font-medium uppercase tracking-[0.14em] text-amber-700">
              Signed in as guest
            </p>
          </div>

          <div className="mt-2 space-y-1">
            <MenuLink href="/guest/profile" label="My Profile" onNavigate={() => setOpen(false)} />
            <MenuLink href="/guest/bookings" label="My Bookings" onNavigate={() => setOpen(false)} />
          </div>

          <div className="mt-2 border-t border-stone-200/80 pt-2">
            <form action={logOut}>
              <button
                type="submit"
                className="flex w-full items-center justify-between rounded-[16px] px-4 py-3 text-sm font-semibold text-stone-700 transition hover:bg-stone-100 hover:text-stone-950"
              >
                <span>Log Out</span>
                <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path d="M8 5H4.75A1.75 1.75 0 0 0 3 6.75v6.5C3 14.216 3.784 15 4.75 15H8" />
                  <path d="m11 6 4 4-4 4" />
                  <path d="M7 10h8" />
                </svg>
              </button>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function MenuLink({
  href,
  label,
  onNavigate,
}: {
  href: string;
  label: string;
  onNavigate: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      className="flex items-center justify-between rounded-[16px] px-4 py-3 text-sm font-semibold text-stone-700 transition hover:bg-stone-100 hover:text-stone-950"
      role="menuitem"
    >
      <span>{label}</span>
      <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="m8 5 5 5-5 5" />
      </svg>
    </Link>
  );
}
