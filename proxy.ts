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
  if (process.env.EDUTEST_AUTH_MODE === "nextauth") return response;

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

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)",
  ],
};
