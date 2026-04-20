import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="mt-16 rounded-3xl bg-slate-950 px-6 py-10 text-slate-300 sm:px-8">
      <div className="grid gap-8 md:grid-cols-4">
        <div>
          <p className="text-lg font-semibold text-white">BookMyManzil</p>
          <p className="mt-2 text-sm text-slate-400">
            Premium booking and guest journey platform for modern hotels.
          </p>
        </div>
        <div>
          <p className="text-sm font-medium text-white">Platform</p>
          <ul className="mt-3 space-y-2 text-sm text-slate-400">
            <li>
              <Link href="/">Landing</Link>
            </li>
            <li>
              <a href="#booking">Search and booking</a>
            </li>
            <li>
              <a href="#login-dialog">Guest login</a>
            </li>
          </ul>
        </div>
        <div>
          <p className="text-sm font-medium text-white">Portals</p>
          <ul className="mt-3 space-y-2 text-sm text-slate-400">
            <li>
              <Link href="/guest">Guest area</Link>
            </li>
            <li>
              <a href="/login">Staff login</a>
            </li>
          </ul>
        </div>
        <div>
          <p className="text-sm font-medium text-white">Help</p>
          <ul className="mt-3 space-y-2 text-sm text-slate-400">
            <li>Support</li>
            <li>Terms</li>
            <li>Privacy</li>
          </ul>
        </div>
      </div>
    </footer>
  );
}
