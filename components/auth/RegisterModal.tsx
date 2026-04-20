"use client";

import { signUpGuest } from "@/app/auth/actions";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { forwardRef, useActionState, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useFormStatus } from "react-dom";

type AuthState = {
  error: string | null;
};

const initialState: AuthState = { error: null };

export function LandingRegisterButton() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [manualOpen, setManualOpen] = useState(false);
  const shouldAutoOpen = searchParams.get("register") === "1";
  const isOpen = manualOpen || shouldAutoOpen;

  function closeModal() {
    setManualOpen(false);

    if (!shouldAutoOpen) {
      return;
    }

    const params = new URLSearchParams(searchParams.toString());
    params.delete("register");
    const nextUrl = params.size > 0 ? `${pathname}?${params.toString()}` : pathname;
    router.replace(nextUrl, { scroll: false });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setManualOpen(true)}
        className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400"
      >
        Register
      </button>

      {isOpen ? <RegisterModal onClose={closeModal} /> : null}
    </>
  );
}

export function LandingRegisterButtonFallback() {
  return (
    <button
      type="button"
      disabled
      className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700"
    >
      Register
    </button>
  );
}

function RegisterModal({ onClose }: { onClose: () => void }) {
  const [state, formAction] = useActionState(signUpGuest, initialState);
  const firstInputRef = useRef<HTMLInputElement | null>(null);
  const searchParams = useSearchParams();
  const returnTo = searchParams.get("returnTo") || "";
  const queryError = searchParams.get("error") || "";
  const loginHref = returnTo ? `/?login=1&returnTo=${encodeURIComponent(returnTo)}` : "/?login=1";
  const visibleError = state.error || queryError;

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    firstInputRef.current?.focus();

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
      className="fixed inset-0 z-[100] overflow-y-auto bg-slate-950/60 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="landing-register-title"
    >
      <div className="flex min-h-dvh items-center justify-center px-4 py-8 sm:px-6">
        <div className="relative w-full max-w-[760px] overflow-hidden rounded-[32px] border border-white/65 bg-white/96 shadow-[0_30px_100px_rgba(15,23,42,0.3)] ring-1 ring-slate-200/60">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-blue-50 via-white to-transparent" />

          <button
            type="button"
            onClick={onClose}
            className="absolute right-5 top-5 z-10 inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200/80 bg-white/90 text-slate-500 shadow-sm transition hover:border-slate-300 hover:text-slate-900"
            aria-label="Close registration dialog"
          >
            <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M5 5l10 10" />
              <path d="M15 5 5 15" />
            </svg>
          </button>

          <form action={formAction} className="relative px-7 pb-7 pt-10 sm:px-9 sm:pb-9 sm:pt-11">
            {returnTo ? <input type="hidden" name="return_to" value={returnTo} /> : null}
            <div className="mx-auto max-w-2xl text-center">
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-blue-700">
                Guest Registration
              </p>
              <h2
                id="landing-register-title"
                className="mt-3 text-[30px] font-semibold tracking-[-0.02em] text-slate-950"
              >
                Create your BookMyManzil account
              </h2>
              <p className="mt-3 text-sm leading-6 text-slate-600">
                Set up your guest profile to book stays, manage reservations, and personalize your experience.
              </p>
            </div>

            <div className="mt-8 space-y-6">
              {visibleError ? (
                <div className="rounded-2xl border border-rose-200/90 bg-rose-50 px-4 py-3 text-sm leading-6 text-rose-700 shadow-sm">
                  {visibleError}
                </div>
              ) : null}

              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  ref={firstInputRef}
                  name="first_name"
                  label="First name"
                  autoComplete="given-name"
                  placeholder="Ayesha"
                  required
                />
                <Field
                  name="last_name"
                  label="Last name"
                  autoComplete="family-name"
                  placeholder="Rahman"
                  required
                />
                <Field
                  name="email"
                  label="Email"
                  type="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  required
                />
                <Field
                  name="password"
                  label="Password"
                  type="password"
                  autoComplete="new-password"
                  placeholder="Create a strong password"
                  required
                />
                <Field
                  name="phone_number"
                  label="Phone number"
                  type="tel"
                  autoComplete="tel"
                  placeholder="+971 50 123 4567"
                />
                <Field
                  name="passport_number"
                  label="Passport number"
                  placeholder="Optional"
                />
                <SelectField
                  name="preferred_contact_method"
                  label="Preferred contact method"
                  options={[
                    { value: "email", label: "Email" },
                    { value: "phone", label: "Phone" },
                    { value: "whatsapp", label: "WhatsApp" },
                  ]}
                />
                <TextAreaField
                  name="preferences"
                  label="Preferences"
                  placeholder="Optional: room preferences, dietary notes, accessibility needs, etc."
                  className="sm:col-span-2"
                />
              </div>

              <div className="space-y-4">
                <SubmitButton />

                <p className="text-center text-sm text-slate-600">
                  Already have an account?{" "}
                  <Link href={loginHref} className="font-semibold text-blue-700 transition hover:text-blue-800">
                    Log in
                  </Link>
                </p>
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>,
    document.body
  );
}

const inputClasses =
  "h-13 w-full rounded-2xl border border-slate-200/90 bg-white px-4 text-sm text-slate-900 shadow-[0_6px_18px_rgba(15,23,42,0.05)] outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-100";

type FieldProps = {
  name: string;
  label: string;
  type?: "text" | "email" | "password" | "tel";
  autoComplete?: string;
  placeholder?: string;
  required?: boolean;
};

const Field = forwardRef<HTMLInputElement, FieldProps>(function Field(
  { name, label, type = "text", autoComplete, placeholder, required },
  ref
) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-medium text-slate-800">{label}</span>
      <input
        ref={ref}
        type={type}
        name={name}
        autoComplete={autoComplete}
        required={required}
        placeholder={placeholder}
        className={inputClasses}
      />
    </label>
  );
});

type SelectFieldProps = {
  name: string;
  label: string;
  options: Array<{ value: string; label: string }>;
};

function SelectField({ name, label, options }: SelectFieldProps) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-medium text-slate-800">{label}</span>
      <select name={name} defaultValue="" className={inputClasses}>
        <option value="">Optional</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

type TextAreaFieldProps = {
  name: string;
  label: string;
  placeholder?: string;
  className?: string;
};

function TextAreaField({ name, label, placeholder, className }: TextAreaFieldProps) {
  return (
    <label className={className}>
      <span className="mb-2 block text-sm font-medium text-slate-800">{label}</span>
      <textarea
        name={name}
        rows={4}
        placeholder={placeholder}
        className="w-full rounded-2xl border border-slate-200/90 bg-white px-4 py-3 text-sm text-slate-900 shadow-[0_6px_18px_rgba(15,23,42,0.05)] outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
      />
    </label>
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
      {pending ? "Creating your account..." : "Register"}
    </button>
  );
}
