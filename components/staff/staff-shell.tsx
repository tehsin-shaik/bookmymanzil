import Link from "next/link";
import { Cormorant_Garamond } from "next/font/google";
import type { ReactNode } from "react";
import { logOut } from "@/app/auth/actions";
import { getStaffSectionTitle, type StaffSessionState } from "@/lib/auth/staff-session";
import { isHotelScopedStaffRole, isManagerRole, isReceptionRole, isServiceRole } from "@/lib/auth/staff-roles";

const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

export function StaffShell({
  children,
  description,
  session,
  title,
}: {
  children: ReactNode;
  description: string;
  session: StaffSessionState;
  title: string;
}) {
  return (
    <main className="min-h-screen bg-[#f7f1e8] px-4 py-10 text-stone-900 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <section className="rounded-[34px] border border-white/75 bg-[rgba(255,252,247,0.88)] p-8 shadow-[0_20px_52px_rgba(96,72,47,0.08)] md:p-10">
          <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
            <div className="max-w-3xl">
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-amber-700">
                {getStaffSectionTitle(session.role)} Operations
              </p>
              <h1 className={`${cormorant.className} mt-4 text-5xl tracking-[-0.03em] text-stone-900 md:text-6xl`}>
                {title}
              </h1>
              <p className="mt-4 text-sm leading-7 text-stone-600 md:text-base">{description}</p>
            </div>

            <div className="rounded-[24px] border border-stone-200/80 bg-white/90 px-5 py-4 shadow-[0_12px_32px_rgba(15,23,42,0.06)]">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-stone-500">Signed in as</p>
              <p className="mt-2 text-sm font-semibold text-stone-900">{session.fullName}</p>
              <p className="mt-1 text-sm text-stone-600">{session.jobTitle}</p>
              <p className="mt-1 text-xs uppercase tracking-[0.12em] text-amber-700">
                {(session.role === "admin" ? "All Hotels" : null) ||
                  session.hotelName ||
                  (isHotelScopedStaffRole(session.role) ? "Hotel Assignment Pending" : "All Hotels Access")}
              </p>
            </div>
          </div>

          <div className="mt-8 flex flex-wrap gap-3">
            {isReceptionRole(session.role) || isManagerRole(session.role) ? (
              <Link
                href="/staff/reception"
                className="inline-flex items-center rounded-full border border-stone-300 bg-white px-5 py-3 text-sm font-semibold text-stone-700 transition hover:border-stone-400 hover:text-stone-950"
              >
                Reception Desk
              </Link>
            ) : null}
            {isServiceRole(session.role) ? (
              <Link
                href="/staff/service"
                className="inline-flex items-center rounded-full border border-stone-300 bg-white px-5 py-3 text-sm font-semibold text-stone-700 transition hover:border-stone-400 hover:text-stone-950"
              >
                Service Worklist
              </Link>
            ) : null}
            {isManagerRole(session.role) ? (
              <Link
                href="/staff/manager"
                className="inline-flex items-center rounded-full border border-stone-300 bg-white px-5 py-3 text-sm font-semibold text-stone-700 transition hover:border-stone-400 hover:text-stone-950"
              >
                Manager Overview
              </Link>
            ) : null}
            <form action={logOut}>
              <button className="inline-flex items-center rounded-full bg-stone-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-stone-800">
                Log out
              </button>
            </form>
          </div>
        </section>

        {children}
      </div>
    </main>
  );
}
