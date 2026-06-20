import { NextRequest } from "next/server";
import {
  jsonSuccess,
  jsonError,
  parseJsonWithSchema,
  rateLimit,
  requireAuthenticatedUser,
} from "@/lib/api-security";
import { verifyGuestPaperSnapshot } from "@/lib/guest-paper-snapshot";
import { persistGeneratedPaper } from "@/lib/paper-store";
import { savePaperRequestSchema } from "@/lib/schemas";
import type { StoredPaper } from "@/types";

export async function POST(request: NextRequest) {
  const auth = await requireAuthenticatedUser(request);
  if (auth.response) return auth.response;

  const limited = rateLimit(request, `paper-save:${auth.user.id}`, 20, 60_000, {
    action: "paper save requests",
  });
  if (limited) return limited;

  const parsed = await parseJsonWithSchema(request, savePaperRequestSchema, {
    maxBytes: 2_000_000,
  });
  if (parsed.response) return parsed.response;

  const body = parsed.data;
  const paperId = body.paperId;

  // Resolve the paper from the signed guest snapshot.
  const snapshot = await verifyGuestPaperSnapshot(
    body.paperSnapshot,
    body.paperSnapshotToken ?? body.guestPaperToken,
    auth.user.id,
    paperId,
  );

  if (!snapshot) {
    return jsonError(
      "Paper could not be verified. Reload the preview and try saving again.",
      400,
    );
  }

  if (snapshot.status !== "READY") {
    return jsonError("Only completed papers can be saved.", 409);
  }

  const storedPaper: StoredPaper = {
    ...snapshot,
    id: paperId,
    status: "READY",
  };

  try {
    const persisted = await persistGeneratedPaper(
      storedPaper,
      auth.user.id,
      snapshot.generationJobId ?? null,
      snapshot.idempotencyKey ?? null,
    );

    if (!persisted) {
      return jsonError("Paper has no questions and cannot be saved.", 400);
    }

    return jsonSuccess({
      saved: true,
      persistedPaperId: persisted.paperId,
      reused: persisted.reused,
    });
  } catch (error) {
    return jsonError(
      error instanceof Error
        ? `Could not save paper: ${error.message}`
        : "Could not save paper. Please retry.",
      502,
    );
  }
}
