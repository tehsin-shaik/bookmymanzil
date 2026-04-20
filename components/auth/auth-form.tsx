"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";

type AuthState = { error: string | null };
type AuthAction = (state: AuthState, formData: FormData) => Promise<AuthState>;

type FieldOption = {
  value: string;
  label: string;
};

type FieldConfig = {
  name: string;
  label: string;
  type?: "text" | "email" | "password" | "tel";
  placeholder?: string;
  autoComplete?: string;
  required?: boolean;
  options?: FieldOption[];
  textarea?: boolean;
  rows?: number;
  description?: string;
};

type AuthFormProps = {
  action: AuthAction;
  title: string;
  description: string;
  submitLabel: string;
  fields: FieldConfig[];
  footerText: string;
  footerHref: string;
  footerLinkLabel: string;
  tone?: "dark" | "light";
};

const initialState: AuthState = { error: null };

export function AuthForm({
  action,
  title,
  description,
  submitLabel,
  fields,
  footerText,
  footerHref,
  footerLinkLabel,
  tone = "dark",
}: AuthFormProps) {
  const [state, formAction] = useActionState(action, initialState);
  const isDark = tone === "dark";

  return (
    <form action={formAction} className="space-y-5">
      <div>
        <h2
          className={`text-2xl font-semibold tracking-tight ${isDark ? "text-white" : "text-slate-900"}`}
        >
          {title}
        </h2>
        <p className={`mt-2 text-sm ${isDark ? "text-slate-300" : "text-slate-600"}`}>
          {description}
        </p>
      </div>

      {state.error ? (
        <div
          className={`rounded-xl border px-4 py-3 text-sm ${isDark ? "border-rose-400/40 bg-rose-950/30 text-rose-200" : "border-rose-200 bg-rose-50 text-rose-700"}`}
        >
          {state.error}
        </div>
      ) : (
        <div
          className={`rounded-xl border px-4 py-3 text-sm ${isDark ? "border-cyan-400/20 bg-cyan-950/20 text-cyan-100" : "border-cyan-200 bg-cyan-50 text-cyan-700"}`}
        >
          Please use your registered email and a strong password.
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {fields.map((field) => (
          <label key={field.name} className={field.textarea ? "sm:col-span-2" : ""}>
            <span
              className={`mb-1.5 block text-sm font-medium ${isDark ? "text-slate-100" : "text-slate-800"}`}
            >
              {field.label}
            </span>
            {field.options ? (
              <select
                name={field.name}
                required={field.required}
                className={`h-11 w-full rounded-xl px-3 text-sm outline-none transition focus:ring-2 ${isDark ? "border border-white/15 bg-slate-950/80 text-white shadow-inner shadow-black/20 focus:border-cyan-300/70 focus:ring-cyan-400/30" : "border border-slate-200 bg-white text-slate-900 shadow-sm focus:border-cyan-400 focus:ring-cyan-200"}`}
                defaultValue=""
              >
                <option value="" disabled>
                  Select {field.label.toLowerCase()}
                </option>
                {field.options.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            ) : field.textarea ? (
              <textarea
                name={field.name}
                placeholder={field.placeholder}
                required={field.required}
                rows={field.rows || 3}
                className={`w-full rounded-xl px-3 py-2.5 text-sm outline-none transition ${isDark ? "border border-white/15 bg-slate-950/80 text-white shadow-inner shadow-black/20 placeholder:text-slate-500 focus:border-cyan-300/70 focus:ring-2 focus:ring-cyan-400/30" : "border border-slate-200 bg-white text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-cyan-400 focus:ring-2 focus:ring-cyan-200"}`}
              />
            ) : (
              <input
                type={field.type || "text"}
                name={field.name}
                placeholder={field.placeholder}
                autoComplete={field.autoComplete}
                required={field.required}
                className={`h-11 w-full rounded-xl px-3 text-sm outline-none transition ${isDark ? "border border-white/15 bg-slate-950/80 text-white shadow-inner shadow-black/20 placeholder:text-slate-500 focus:border-cyan-300/70 focus:ring-2 focus:ring-cyan-400/30" : "border border-slate-200 bg-white text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-cyan-400 focus:ring-2 focus:ring-cyan-200"}`}
              />
            )}
            {field.description ? (
              <span className={`mt-1 block text-xs ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                {field.description}
              </span>
            ) : null}
          </label>
        ))}
      </div>

      <SubmitButton label={submitLabel} tone={tone} />

      <p className={`text-sm ${isDark ? "text-slate-300" : "text-slate-600"}`}>
        {footerText}{" "}
        <Link
          href={footerHref}
          className={`font-medium ${isDark ? "text-cyan-300 hover:text-cyan-200" : "text-cyan-700 hover:text-cyan-600"}`}
        >
          {footerLinkLabel}
        </Link>
      </p>
    </form>
  );
}

function SubmitButton({ label, tone }: { label: string; tone: "dark" | "light" }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className={`inline-flex h-11 w-full items-center justify-center rounded-xl px-4 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-70 ${tone === "dark" ? "bg-gradient-to-r from-cyan-500 via-blue-600 to-indigo-600 shadow-lg shadow-blue-700/30 hover:brightness-110" : "bg-gradient-to-r from-slate-900 via-blue-900 to-indigo-900 shadow-lg shadow-slate-800/30 hover:brightness-110"}`}
    >
      {pending ? "Please wait..." : label}
    </button>
  );
}
