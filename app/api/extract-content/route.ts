import { NextRequest } from "next/server";
import {
  jsonSuccess,
  jsonError,
  parseJsonWithSchema,
  rateLimit,
  requireAdminUser,
  requireAuthenticatedUser,
} from "@/lib/api-security";
import { assertDemoModeAllowed } from "@/lib/demo-mode";
import {
  cleanExtractedText,
  extractTextFromPdf,
} from "@/lib/extractor";
import { extractChapterPdf } from "@/lib/pdf-extraction-service";
import {
  assertPdfBufferSize,
  assertPdfMagic,
  maxPdfBytes,
  pdfSizeErrorMessage,
} from "@/lib/pdf-security";
import { extractionRequestSchema } from "@/lib/schemas";

export async function POST(request: NextRequest) {
  const auth = await requireAuthenticatedUser(request);
  if (auth.response) return auth.response;

  const limited = rateLimit(request, `extract:${auth.user.id}`, 10, 60_000, {
    action: "PDF extraction requests",
  });
  if (limited) return limited;

  const adminError = requireAdminUser(auth.user);
  if (adminError) return adminError;

  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("multipart/form-data")) {
    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return jsonError("PDF file is required. Choose a chapter PDF before extracting.", 400);
    }

    if (file.size > maxPdfBytes) {
      return jsonError(pdfSizeErrorMessage(), 400);
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    try {
      assertPdfBufferSize(buffer);
      assertPdfMagic(buffer);
    } catch (error) {
      return jsonError(
        error instanceof Error ? error.message : "Invalid PDF upload.",
        400,
      );
    }

    const extracted = await extractTextFromPdf(buffer);
    return jsonSuccess({
      ...extracted,
      text: cleanExtractedText(extracted.text),
    });
  }

  const parsed = await parseJsonWithSchema(request, extractionRequestSchema);
  if (parsed.response) return parsed.response;
  const body = parsed.data;

  if (!body.objectPath && !body.pdfUrl && !body.demoMode) {
    return jsonError(
      "Supabase objectPath or validated Supabase pdfUrl is required.",
      400,
    );
  }

  if (body.demoMode) {
    try {
      assertDemoModeAllowed(true);
    } catch (error) {
      return jsonError(
        error instanceof Error ? error.message : "Demo mode is unavailable.",
        403,
      );
    }
  }

  try {
    const result = await extractChapterPdf(body);
    return jsonSuccess(result);
  } catch (error) {
    if (error instanceof Error && error.name === "NotFoundError") {
      return jsonError(error.message, 404);
    }

    return jsonError(
      error instanceof Error ? error.message : "Extraction failed.",
      502,
    );
  }
}
