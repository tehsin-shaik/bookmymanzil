import Link from "next/link";
import { ReactNode } from "react";

type AuthShellProps = {
  eyebrow: string;
  title: string;
  subtitle: string;
  backHref: string;
  backLabel: string;
  children: ReactNode;
};

export function AuthShell({
  eyebrow,
  title,
  subtitle,
  backHref,
  backLabel,
  children,
}: AuthShellProps) {
  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-100 via-white to-cyan-50 px-4 py-10 text-slate-900 sm:px-6 lg:px-8">
      <div className="mx-auto grid w-full max-w-6xl gap-8 lg:grid-cols-[1.05fr_1fr]">
        <section className="rounded-3xl border border-white/70 bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 p-8 text-white shadow-2xl shadow-slate-900/20">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-200">
            {eyebrow}
          </p>
          <h1 className="mt-4 text-4xl font-semibold tracking-tight">{title}</h1>
          <p className="mt-4 max-w-lg text-sm leading-6 text-slate-200">{subtitle}</p>

          <div className="mt-8 rounded-2xl border border-white/15 bg-white/10 p-4 text-sm text-slate-200 backdrop-blur">
            <p className="font-medium text-white">BookMyManzil secure access</p>
            <p className="mt-2">
              Your credentials are handled by Supabase Auth and server actions for
              secure, role-aware authentication.
            </p>
          </div>

          <Link
            href={backHref}
            className="mt-8 inline-flex items-center rounded-xl border border-white/25 bg-white/10 px-4 py-2 text-sm font-medium text-slate-100 transition hover:border-cyan-200 hover:text-cyan-100"
          >
            {backLabel}
          </Link>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white/95 p-6 shadow-xl shadow-slate-900/10 sm:p-8">
          {children}
        </section>
      </div>
    </main>
  );
}
