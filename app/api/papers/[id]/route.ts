import {
  jsonSuccess,
  jsonError,
  parseIdParam,
  requireAuthenticatedUser,
} from "@/lib/api-security";
import { signGuestPaperSnapshot } from "@/lib/guest-paper-snapshot";
import { deletePaperForUser, getPaper, getPaperOwnerId } from "@/lib/paper-store";
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
  const guestPaperToken = auth.user.isGuest
    ? await signGuestPaperSnapshot(paper, auth.user.id)
    : undefined;

  return jsonSuccess({ ...paper, isOwner, guestPaperToken });
}

export async function DELETE(
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
      "Paper not found. It may have already been deleted.",
      404,
    );
  }
  if (ownerId !== auth.user.id) {
    return jsonError(
      "Paper access denied. This paper belongs to another user or guest session.",
      403,
    );
  }

  const deleted = await deletePaperForUser(paperId, auth.user.id);
  if (!deleted) {
    return jsonError(
      "Paper could not be deleted. Refresh the dashboard and try again.",
      404,
    );
  }

  return jsonSuccess({ deleted: true });
}
