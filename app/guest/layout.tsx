import { SiteHeader } from "@/components/layout/site-header";
import { GuestAssistantPanel } from "@/components/assistant/guest-assistant-panel";
import { requireGuestSession } from "@/lib/auth/guest-session";

export default async function GuestLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const guestSession = await requireGuestSession();

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#f7f1e8] via-[#fbf7f1] to-white text-stone-900">
      <SiteHeader
        session={guestSession}
        links={[
          { href: "/", label: "Home" },
          { href: "/guest/profile", label: "My Profile" },
          { href: "/guest/bookings", label: "My Bookings" },
        ]}
      />
      {children}
      <GuestAssistantPanel guestName={guestSession.firstName} />
    </div>
  );
}
