import { NextRequest } from "next/server";
import {
  jsonSuccess,
  jsonError,
  parseJsonWithSchema,
  rateLimit,
  requireAuthenticatedUser,
} from "@/lib/api-security";
import {
  getPaper,
  getPaperOwnerId,
  saveProgressForUser,
} from "@/lib/paper-store";
import { saveProgressSchema } from "@/lib/schemas";

export async function POST(request: NextRequest) {
  const auth = await requireAuthenticatedUser(request);
  if (auth.response) return auth.response;

  const limited = rateLimit(request, `progress:${auth.user.id}`, 60, 60_000, {
    action: "progress save requests",
  });
  if (limited) return limited;

  const parsed = await parseJsonWithSchema(request, saveProgressSchema);
  if (parsed.response) return parsed.response;

  const { paperId, answers, clientSavedAt, savedAt } = parsed.data;
  const ownerId = await getPaperOwnerId(paperId);
  if (!ownerId) {
    return jsonError(
      "Paper not found. It may have been removed or created in another browser session.",
      404,
    );
  }

  const isOwner = ownerId === auth.user.id;
  if (!isOwner) {
    return jsonError(
      "Paper access denied. This paper belongs to another user or guest session.",
      403,
    );
  }

  const paper = await getPaper(paperId, auth.user.id);
  if (!paper) {
    return jsonError(
      "Paper not found. It may have been removed or created in another browser session.",
      404,
    );
  }
  if (paper.status !== "READY") {
    return jsonError(
      "Paper is not ready for attempts. Wait for generation to finish before starting the test.",
      409,
    );
  }

  const saved = await saveProgressForUser(
    auth.user.id,
    paperId,
    answers,
    clientSavedAt ?? savedAt,
  );

  return jsonSuccess({
    saved: true,
    attemptId: saved.attemptId,
    savedAt: saved.savedAt,
  });
}
