import { NextRequest } from "next/server";
import { jsonSuccess, requireAuthenticatedUser } from "@/lib/api-security";
import { analyticsSummaryForUser } from "@/lib/paper-store";

export async function GET(request: NextRequest) {
  const auth = await requireAuthenticatedUser(request);
  if (auth.response) return auth.response;

  const summary = await analyticsSummaryForUser(auth.user.id);
  return jsonSuccess(summary);
}
