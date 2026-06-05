import {
  jsonSuccess,
  jsonError,
  parseIdParam,
  requireAuthenticatedUser,
} from "@/lib/api-security";
import { getAttemptForUser } from "@/lib/paper-store";
import { NextRequest } from "next/server";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAuthenticatedUser(request);
  if (auth.response) return auth.response;

  const { id } = await params;
  const attemptId = /^session-result-\d{10,17}-[a-z0-9]{2,8}$/i.test(id)
    ? id
    : parseIdParam(id);
  if (!attemptId) return jsonError("Invalid attempt id.", 400);

  const attempt = await getAttemptForUser(attemptId, auth.user.id);
  if (!attempt) return jsonError("Attempt not found.", 404);

  return jsonSuccess(attempt);
}
