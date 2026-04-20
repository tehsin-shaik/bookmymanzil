import { Cormorant_Garamond } from "next/font/google";
import { requireGuestSession } from "@/lib/auth/guest-session";

const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

export default async function GuestProfilePage() {
  const guestSession = await requireGuestSession();

  return (
    <main className="px-4 py-10 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl rounded-[34px] border border-white/75 bg-[rgba(255,252,247,0.88)] p-8 shadow-[0_20px_52px_rgba(96,72,47,0.08)] md:p-10">
        <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-amber-700">My Profile</p>
        <h1 className={`${cormorant.className} mt-4 text-5xl tracking-[-0.03em] text-stone-900 md:text-6xl`}>
          Your guest account details
        </h1>
        <p className="mt-4 max-w-3xl text-sm leading-7 text-stone-600 md:text-base">
          Keep your personal details in one place so every stay feels smooth, personal, and easy to manage.
        </p>

        <div className="mt-10 grid gap-4 md:grid-cols-2">
          <InfoCard label="Name" value={guestSession.fullName} />
          <InfoCard label="Email" value={guestSession.email || "Not available"} />
          <InfoCard label="Phone Number" value={guestSession.phoneNumber || "Missing from your guest profile"} />
          <InfoCard label="Account Type" value="Guest" />
        </div>
      </div>
    </main>
  );
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[24px] border border-stone-200/80 bg-white/90 px-5 py-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-stone-500">{label}</p>
      <p className="mt-2 text-sm font-semibold leading-6 text-stone-900">{value}</p>
    </div>
  );
}
