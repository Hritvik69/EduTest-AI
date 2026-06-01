import { NextRequest, NextResponse } from "next/server";

function redirectToGuestDashboard(request: NextRequest) {
  return NextResponse.redirect(new URL("/dashboard", request.url));
}

export const GET = redirectToGuestDashboard;
export const POST = redirectToGuestDashboard;
