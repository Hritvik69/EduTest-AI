import { NextRequest } from "next/server";
import {
  jsonSuccess,
  jsonError,
  rateLimit,
  requireAdminUser,
  requireAuthenticatedUser,
} from "@/lib/api-security";
import sql from "@/lib/db";
import { assertDemoModeAllowed } from "@/lib/demo-mode";
import { extractChapterPdf } from "@/lib/pdf-extraction-service";
import {
  assertPdfBufferSize,
  assertPdfMagic,
  maxPdfBytes,
  pdfSizeErrorMessage,
} from "@/lib/pdf-security";
import { uploadFieldsSchema } from "@/lib/schemas";
import { supabase } from "@/lib/supabase";

export async function POST(request: NextRequest) {
  const auth = await requireAuthenticatedUser(request);
  if (auth.response) return auth.response;
  const adminError = requireAdminUser(auth.user);
  if (adminError) return adminError;

  const limited = rateLimit(request, `upload:${auth.user.id}`, 10, 60_000, {
    action: "chapter PDF upload requests",
  });
  if (limited) return limited;

  const formData = await request.formData();
  const file = formData.get("file");
  const parsed = uploadFieldsSchema.safeParse({
    chapterId: formData.get("chapterId"),
    classNum: formData.get("classNum"),
    chapterName: formData.get("chapterName"),
    subject: formData.get("subject"),
    demoMode: formData.get("demoMode") ?? undefined,
  });

  if (!parsed.success) {
    return jsonError("Invalid upload fields.", 400, parsed.error.flatten());
  }

  const { chapterId, classNum, chapterName, subject, demoMode } = parsed.data;

  if (!(file instanceof File)) {
    return jsonError("PDF file is required.", 400);
  }

  if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
    return jsonError("Only PDF files are allowed.", 400);
  }

  if (file.size > maxPdfBytes) {
    return jsonError(pdfSizeErrorMessage(), 400);
  }

  if (demoMode) {
    try {
      assertDemoModeAllowed(true);
    } catch (error) {
      return jsonError(
        error instanceof Error ? error.message : "Demo mode is unavailable.",
        403,
      );
    }
  }

  if (sql) {
    const rows = await sql`
      SELECT c.id
      FROM chapters c
      JOIN subjects s ON s.id = c.subject_id
      WHERE c.id = ${chapterId}
      AND s.class_num = ${classNum}
      AND lower(s.name) = lower(${subject})
      LIMIT 1
    `;
    if (!rows[0]) {
      return jsonError(
        "Chapter not found for the requested class and subject.",
        404,
      );
    }
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

  const path = `chapters/${chapterId}/${Date.now()}-${sanitizeFilename(file.name)}`;
  let pdfUrl: string | null = null;
  let objectPath: string | null = null;

  if (supabase) {
    const { error } = await supabase.storage.from("chapter-pdfs").upload(path, buffer, {
      contentType: "application/pdf",
      upsert: false,
    });

    if (error) {
      return jsonError(error.message, 500);
    }

    const publicUrl = supabase.storage.from("chapter-pdfs").getPublicUrl(path);
    pdfUrl = publicUrl.data.publicUrl;
    objectPath = path;
  } else if (demoMode) {
    pdfUrl = `demo://chapter-pdfs/${path}`;
  }

  if (!pdfUrl) {
    return jsonError("Supabase storage is not configured.", 503);
  }

  if (sql) {
    const rows = await sql`
      UPDATE chapters
      SET pdf_url = ${pdfUrl}, status = 'PDF_UPLOADED', error_metadata = NULL
      WHERE id = ${chapterId}
      AND EXISTS (
        SELECT 1
        FROM subjects s
        WHERE s.id = chapters.subject_id
        AND s.class_num = ${classNum}
        AND lower(s.name) = lower(${subject})
      )
      RETURNING id
    `;

    if (!rows[0]) {
      return jsonError("Chapter not found.", 404);
    }
  }

  const extraction = await extractChapterPdf({
    chapterId,
    chapterName,
    subject,
    classNum,
    objectPath: objectPath ?? undefined,
    demoMode: Boolean(demoMode),
  });

  return jsonSuccess({
    success: true,
    chapterId,
    pdfUrl,
    objectPath,
    extraction,
    isDemoMode: Boolean(demoMode),
  });
}

function sanitizeFilename(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "-");
}
