import { NextRequest, NextResponse } from "next/server";
import {
  jsonError,
  parseJsonWithSchema,
  rateLimit,
  requireAuthenticatedUser,
} from "@/lib/api-security";
import { friendlyExportError } from "@/lib/error-classification";
import { verifyGuestPaperSnapshot } from "@/lib/guest-paper-snapshot";
import {
  createPaperPdfBuffer,
  downloadPaperFileName,
  paperExportTextSize,
} from "@/lib/paper-pdf-export";
import { sessionPaperExportRequestSchema } from "@/lib/schemas";
import type { StoredPaper } from "@/types";

export const runtime = "nodejs";

const maxExportQuestions = 120;
const maxExportTextChars = 120_000;

export async function POST(request: NextRequest) {
  const auth = await requireAuthenticatedUser(request);
  if (auth.response) return auth.response;

  const limited = rateLimit(request, `session-export:${auth.user.id}`, 30, 60_000, {
    action: "session paper export requests",
  });
  if (limited) return limited;

  const parsed = await parseJsonWithSchema(request, sessionPaperExportRequestSchema, {
    maxBytes: 350_000,
  });
  if (parsed.response) return parsed.response;

  const body = parsed.data;
  const paperSnapshot = body.paperSnapshot;
  const token = body.paperSnapshotToken ?? body.guestPaperToken;
  const includeAnswers = Boolean(body.includeAnswers);
  const format = body.format === "json" ? "json" : "pdf";
  const expectedPaperId = snapshotId(paperSnapshot);
  if (!expectedPaperId) return jsonError("Invalid paper snapshot.", 400);

  const paper = await verifyGuestPaperSnapshot(
    paperSnapshot,
    typeof token === "string" ? token : undefined,
    auth.user.id,
    expectedPaperId,
  );
  if (!paper) {
    return jsonError(
      "Session paper export requires a valid signed paper snapshot.",
      403,
    );
  }

  if (paper.questions.length > maxExportQuestions) {
    return jsonError("Paper is too large to export.", 413);
  }
  if (paperExportTextSize(paper) > maxExportTextChars) {
    return jsonError("Paper content is too large to export.", 413);
  }

  if (format === "json") {
    const jsonPaper = includeAnswers ? paper : withoutAnswerKeys(paper);
    return NextResponse.json(jsonPaper, {
      headers: {
        "Content-Disposition": `attachment; filename="paper_${safeId(
          paper.id,
        )}.json"`,
        "Cache-Control": "no-store",
      },
    });
  }

  let pdf: Buffer;
  try {
    pdf = await createPaperPdfBuffer(paper, includeAnswers);
  } catch (error) {
    console.error("[session-paper-export] failed", {
      paperId: paper.id,
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

function snapshotId(snapshot: unknown) {
  if (!snapshot || typeof snapshot !== "object") return null;
  const id = (snapshot as Partial<StoredPaper>).id;
  if (typeof id === "number" && Number.isInteger(id) && id > 0) return id;
  if (
    typeof id === "string" &&
    /^session-\d{10,17}-[a-z0-9]{8,32}$/i.test(id)
  ) {
    return id;
  }
  return null;
}

function withoutAnswerKeys(paper: StoredPaper): StoredPaper {
  return {
    ...paper,
    questions: paper.questions.map((question) => ({
      ...question,
      correctAnswer: "",
      explanation: "",
      options: question.options?.map((option) => ({
        ...option,
        isCorrect: false,
      })),
      subQuestions: question.subQuestions?.map((subQuestion) => ({
        ...subQuestion,
        correctAnswer: "",
      })),
    })),
  };
}

function safeId(id: StoredPaper["id"]) {
  return String(id).replace(/[^a-z0-9_-]/gi, "_");
}
