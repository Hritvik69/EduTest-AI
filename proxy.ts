import { NextRequest, NextResponse } from "next/server";
import {
  createGuestSessionId,
  createSignedGuestSessionCookieValue,
  guestSessionCookieName,
  readSignedGuestSessionCookieValue,
  signedGuestSessionMaxAge,
} from "@/lib/guest-session";

export async function proxy(request: NextRequest) {
  const response = NextResponse.next();

  try {
    const existing = request.cookies.get(guestSessionCookieName)?.value;
    if (await readSignedGuestSessionCookieValue(existing)) return response;

    response.cookies.set({
      name: guestSessionCookieName,
      value: await createSignedGuestSessionCookieValue(createGuestSessionId()),
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

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|api/ai/provider-health|api/deployment-health).*)",
  ],
};
