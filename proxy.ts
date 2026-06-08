import { NextRequest, NextResponse } from "next/server";
import {
  createGuestSessionId,
  guestSessionCookieName,
  hasValidGuestSessionIdShape,
  signedGuestSessionMaxAge,
} from "@/lib/guest-session";

export function proxy(request: NextRequest) {
  const response = NextResponse.next();

  try {
    const existing = request.cookies.get(guestSessionCookieName)?.value;
    const sessionId = guestSessionIdFromCookieShape(existing);
    if (sessionId) return response;

    response.cookies.set({
      name: guestSessionCookieName,
      value: createGuestSessionId(),
      httpOnly: true,
      sameSite: "lax",
      secure: request.nextUrl.protocol === "https:",
      path: "/",
      maxAge: signedGuestSessionMaxAge,
    });
  } catch (error) {
    console.error("[proxy] guest session cookie setup failed", {
      message: error instanceof Error ? error.message : String(error),
    });
  }

  return response;
}

function guestSessionIdFromCookieShape(value: string | undefined) {
  if (!value) return null;
  if (hasValidGuestSessionIdShape(value)) return value;

  const [sessionId, signature, extra] = value.split(".");
  if (extra !== undefined || !signature || !hasValidGuestSessionIdShape(sessionId)) {
    return null;
  }

  return sessionId;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|api/ai/provider-health|api/deployment-health).*)",
  ],
};
