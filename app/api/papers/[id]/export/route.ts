import { NextRequest, NextResponse } from "next/server";
import {
  jsonError,
  parseIdParam,
  requireAuthenticatedUser,
} from "@/lib/api-security";
import { friendlyExportError } from "@/lib/error-classification";
import { getPaper, getPaperOwnerId } from "@/lib/paper-store";
import {
  createPaperPdfBuffer,
  downloadPaperFileName,
  paperExportTextSize,
} from "@/lib/paper-pdf-export";

export const runtime = "nodejs";
const maxExportQuestions = 120;
const maxExportTextChars = 120_000;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const format = request.nextUrl.searchParams.get("format") ?? "pdf";
  const includeAnswers = request.nextUrl.searchParams.get("includeAnswers") === "true";
  const auth = await requireAuthenticatedUser(request);
  if (auth.response) return auth.response;

  if (format !== "pdf" && format !== "json") {
    return jsonError("Unsupported export format. Use format=pdf or format=json.", 400);
  }

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
  const paper = await getPaper(paperId, isOwner ? auth.user.id : undefined);
  if (!paper) {
    return jsonError(
      "Paper not found. It may have been removed or created in another browser session.",
      404,
    );
  }
  if (paper.status !== "READY") {
    return jsonError(
      "Paper is not ready for export. Wait for generation to finish, or regenerate it if generation failed.",
      409,
      { status: paper.status, errorMetadata: paper.errorMetadata ?? null },
    );
  }
  if (!paper.questions.length) {
    return jsonError(
      "Paper has no saved questions to export. Generate a fresh paper.",
      409,
    );
  }
  if (paper.questions.length > maxExportQuestions) {
    return jsonError("Paper is too large to export.", 413);
  }
  if (paperExportTextSize(paper) > maxExportTextChars) {
    return jsonError("Paper content is too large to export.", 413);
  }

  if (format === "json") {
    return NextResponse.json(paper, {
      headers: {
        "Content-Disposition": `attachment; filename="paper_${paper.id}.json"`,
        "Cache-Control": "no-store",
      },
    });
  }

  let pdf: Buffer;
  try {
    pdf = await createPaperPdfBuffer(paper, includeAnswers);
  } catch (error) {
    console.error("[paper-export] failed", {
      paperId,
      message: error instanceof Error ? error.message : String(error),
    });
    return jsonError(friendlyExportError(error), 500, { format: "pdf" });
  }

  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${downloadPaperFileName(paper)}"`,
      "Cache-Control": "no-store",
    },
  });
}
