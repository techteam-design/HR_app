import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";

// Lightweight, optimistic check only: is there a session cookie at all?
// No database calls here. Real checks (valid session, active employee, role)
// happen on the server in requireEmployee / requireApiEmployee.
export function proxy(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl;
  const hasSessionCookie = getSessionCookie(request) !== null;

  if (pathname === "/login") {
    // ?session=expired means the server rejected the cookie; stay on /login
    // so a stale cookie cannot cause a redirect loop.
    if (hasSessionCookie && !searchParams.has("session")) {
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }
    return NextResponse.next();
  }

  if (!hasSessionCookie) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Not signed in" }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Everything except public paths:
     * - api/auth (Better Auth endpoints)
     * - api/cron (authenticated by CRON_SECRET, not a session)
     * - _next/static, _next/image (build assets)
     * - favicon.ico, manifest.webmanifest, icons/ (PWA and browser assets)
     * - any file with an extension (other files in public/)
     */
    "/((?!api/auth|api/cron|_next/static|_next/image|favicon.ico|manifest.webmanifest|icons/|.*\\.[a-zA-Z0-9]+$).*)",
  ],
};
