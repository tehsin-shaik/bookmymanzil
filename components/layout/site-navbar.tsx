"use client";

import Link from "next/link";
import { useState } from "react";

export function SiteNavbar() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="sticky top-4 z-40">
      <div className="rounded-2xl border border-white/70 bg-white/90 px-4 py-3 shadow-lg shadow-slate-900/10 backdrop-blur">
        <div className="flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-cyan-500 via-blue-600 to-indigo-700 text-sm font-bold text-white shadow-sm shadow-blue-600/40">
              BM
            </div>
            <div>
              <p className="text-lg font-semibold tracking-tight text-slate-900">BookMyManzil</p>
              <p className="text-[11px] text-slate-500">Modern hotel booking</p>
            </div>
          </Link>

          <nav className="hidden items-center gap-8 text-sm font-medium text-slate-600 md:flex">
            <a href="#" className="text-slate-900">
              Home
            </a>
            <a href="#discover" className="transition hover:text-slate-900">
              Discover
            </a>
            <a href="#booking" className="transition hover:text-slate-900">
              Booking
            </a>
          </nav>

          <div className="hidden items-center gap-2 md:flex">
            <Link
              href="/signup"
              className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-400"
            >
              Sign up
            </Link>
            <a
              href="#login-dialog"
              className="rounded-xl bg-gradient-to-r from-slate-900 to-blue-900 px-3 py-2 text-sm font-medium text-white shadow-sm transition hover:brightness-110"
            >
              Login
            </a>
          </div>

          <button
            onClick={() => setMenuOpen((value) => !value)}
            className="rounded-lg border border-slate-300 px-2 py-1 text-sm text-slate-600 md:hidden"
            aria-expanded={menuOpen}
            aria-label="Toggle menu"
          >
            Menu
          </button>
        </div>

        {menuOpen ? (
          <div className="mt-3 space-y-2 border-t border-slate-200 pt-3 md:hidden">
            <a href="#" className="block rounded-lg px-2 py-1 text-sm text-slate-700">
              Home
            </a>
            <a href="#discover" className="block rounded-lg px-2 py-1 text-sm text-slate-700">
              Discover
            </a>
            <a href="#booking" className="block rounded-lg px-2 py-1 text-sm text-slate-700">
              Booking
            </a>
            <a href="#login-dialog" className="block rounded-lg px-2 py-1 text-sm text-slate-700">
              Login
            </a>
          </div>
        ) : null}
      </div>
    </header>
  );
}
