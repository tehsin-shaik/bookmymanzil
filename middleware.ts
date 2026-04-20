import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import {
  getStaffHomePath,
  isManagerRole,
  isReceptionRole,
  isServiceRole,
  isStaffRole,
} from "@/lib/auth/staff-roles";

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            request.cookies.set({ name, value, ...options });
          });
          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          });
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set({ name, value, ...options });
          });
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;
  const isGuestProtected = pathname.startsWith("/guest");
  const isStaffProtected = pathname.startsWith("/staff");
  const isReceptionRoute = pathname.startsWith("/staff/reception");
  const isManagerRoute = pathname.startsWith("/staff/manager");
  const isServiceRoute = pathname.startsWith("/staff/service");
  const isGuestAuthPage = pathname === "/login" || pathname === "/signup";
  const isStaffAuthPage = pathname === "/staff/login" || pathname === "/staff/signup";

  if (!user && (isGuestProtected || isStaffProtected)) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (user && (isGuestProtected || isStaffProtected || isGuestAuthPage || isStaffAuthPage)) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
    const profileClient =
      url && serviceRoleKey
        ? createSupabaseClient(url, serviceRoleKey, {
            auth: {
              autoRefreshToken: false,
              persistSession: false,
            },
          })
        : supabase;
    const { data: appUser, error: appUserError } = await profileClient
      .from("users")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    if (appUserError) {
      console.error("[middleware] app-user-lookup-failed", {
        message: appUserError.message,
        pathname,
        userId: user.id,
      });
      return NextResponse.redirect(new URL("/login?error=Profile%20verification%20failed", request.url));
    }

    if (!appUser) {
      return NextResponse.redirect(new URL("/login?error=Profile missing", request.url));
    }

    const isGuest = appUser.role === "guest";
    const isStaff = isStaffRole(appUser.role);

    if (isGuestProtected && !isGuest) {
      return NextResponse.redirect(new URL(getStaffHomePath(appUser.role), request.url));
    }

    if (isStaffProtected && !isStaff) {
      return NextResponse.redirect(new URL("/guest", request.url));
    }

    if (isReceptionRoute && !isReceptionRole(appUser.role) && !isManagerRole(appUser.role)) {
      return NextResponse.redirect(new URL(getStaffHomePath(appUser.role), request.url));
    }

    if (isManagerRoute && !isManagerRole(appUser.role)) {
      return NextResponse.redirect(new URL(getStaffHomePath(appUser.role), request.url));
    }

    if (isServiceRoute && !isServiceRole(appUser.role)) {
      return NextResponse.redirect(new URL(getStaffHomePath(appUser.role), request.url));
    }

    if (isGuestAuthPage) {
      return NextResponse.redirect(new URL(isGuest ? "/guest" : getStaffHomePath(appUser.role), request.url));
    }

    if (isStaffAuthPage) {
      return NextResponse.redirect(new URL(isStaff ? getStaffHomePath(appUser.role) : "/guest", request.url));
    }
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
