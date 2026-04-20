"use client";

import { logInUser } from "@/app/auth/actions";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useActionState, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useFormStatus } from "react-dom";

type AuthState = {
  error: string | null;
};

const initialState: AuthState = { error: null };

export function LandingLoginButton() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [manualOpen, setManualOpen] = useState(false);
  const shouldAutoOpen = searchParams.get("login") === "1";
  const isOpen = manualOpen || shouldAutoOpen;

  function closeModal() {
    setManualOpen(false);

    if (!shouldAutoOpen) {
      return;
    }

    const params = new URLSearchParams(searchParams.toString());
    params.delete("login");
    const nextUrl = params.size > 0 ? `${pathname}?${params.toString()}` : pathname;
    router.replace(nextUrl, { scroll: false });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setManualOpen(true)}
        className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-800"
      >
        Log In
      </button>

      {isOpen ? <LoginModal onClose={closeModal} /> : null}
    </>
  );
}

export function LandingLoginButtonFallback() {
  return (
    <button
      type="button"
      disabled
      className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white opacity-100"
    >
      Log In
    </button>
  );
}

function LoginModal({ onClose }: { onClose: () => void }) {
  const [state, formAction] = useActionState(logInUser, initialState);
  const emailInputRef = useRef<HTMLInputElement | null>(null);
  const searchParams = useSearchParams();
  const returnTo = searchParams.get("returnTo") || "";
  const queryError = searchParams.get("error") || "";
  const registerHref = returnTo ? `/?register=1&returnTo=${encodeURIComponent(returnTo)}` : "/?register=1";
  const visibleError = state.error || queryError;

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    emailInputRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  if (typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[100] overflow-y-auto bg-slate-950/55 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="landing-login-title"
    >
      <div className="flex min-h-dvh items-center justify-center px-4 py-8 sm:px-6">
        <div className="relative w-full max-w-[420px] overflow-hidden rounded-[30px] border border-white/65 bg-white/96 shadow-[0_28px_90px_rgba(15,23,42,0.28)] ring-1 ring-slate-200/60">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-blue-50 via-white to-transparent" />

          <button
            type="button"
            onClick={onClose}
            className="absolute right-5 top-5 z-10 inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200/80 bg-white/90 text-slate-500 shadow-sm transition hover:border-slate-300 hover:text-slate-900"
            aria-label="Close login dialog"
          >
            <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M5 5l10 10" />
              <path d="M15 5 5 15" />
            </svg>
          </button>

          <form action={formAction} className="relative px-7 pb-7 pt-10 sm:px-8 sm:pb-8 sm:pt-11">
            {returnTo ? <input type="hidden" name="return_to" value={returnTo} /> : null}
            <div className="mx-auto max-w-sm text-center">
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-blue-700">
                Secure Login
              </p>
              <h2
                id="landing-login-title"
                className="mt-3 text-[30px] font-semibold tracking-[-0.02em] text-slate-950"
              >
                Log in to BookMyManzil
              </h2>
              <p className="mt-3 text-sm leading-6 text-slate-600">
                Use the email linked to your guest or staff account to continue.
              </p>
            </div>

            <div className="mt-8 space-y-5">
              {visibleError ? (
                <div className="rounded-2xl border border-rose-200/90 bg-rose-50 px-4 py-3 text-sm leading-6 text-rose-700 shadow-sm">
                  {visibleError}
                </div>
              ) : null}

              <label className="block">
                <span className="mb-2 block text-sm font-medium text-slate-800">Email</span>
                <input
                  ref={emailInputRef}
                  type="email"
                  name="email"
                  autoComplete="email"
                  required
                  placeholder="you@example.com"
                  className="h-13 w-full rounded-2xl border border-slate-200/90 bg-white px-4 text-sm text-slate-900 shadow-[0_6px_18px_rgba(15,23,42,0.05)] outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-medium text-slate-800">Password</span>
                <input
                  type="password"
                  name="password"
                  autoComplete="current-password"
                  required
                  placeholder="Enter your password"
                  className="h-13 w-full rounded-2xl border border-slate-200/90 bg-white px-4 text-sm text-slate-900 shadow-[0_6px_18px_rgba(15,23,42,0.05)] outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                />
              </label>

              <div className="pt-1">
                <SubmitButton />
              </div>

              <p className="text-center text-sm text-slate-600">
                Don&apos;t have an account?{" "}
                <Link href={registerHref} className="font-semibold text-blue-700 transition hover:text-blue-800">
                  Register
                </Link>
              </p>
            </div>
          </form>
        </div>
      </div>
    </div>,
    document.body
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex h-12 w-full items-center justify-center rounded-2xl bg-blue-700 px-4 text-sm font-semibold text-white shadow-lg shadow-blue-900/15 transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:bg-blue-500"
    >
      {pending ? "Signing you in..." : "Log In"}
    </button>
  );
}
