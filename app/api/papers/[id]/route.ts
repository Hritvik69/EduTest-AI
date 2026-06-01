import {
  jsonSuccess,
  jsonError,
  parseIdParam,
  requireAuthenticatedUser,
} from "@/lib/api-security";
import { getPaper, getPaperOwnerId } from "@/lib/paper-store";
import { NextRequest } from "next/server";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAuthenticatedUser(request);
  if (auth.response) return auth.response;

  const { id } = await params;
  const paperId = parseIdParam(id);
  if (!paperId) return jsonError("Invalid paper id.", 400);

  const ownerId = await getPaperOwnerId(paperId);
  if (!ownerId) {
    return jsonError(
      "Paper not found. It may have been removed or created in another browser session.",
      404,
    );
  }
  if (ownerId !== auth.user.id) {
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

  return jsonSuccess(paper);
}
