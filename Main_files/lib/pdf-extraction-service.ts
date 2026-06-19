import sql from "@/lib/db";
import {
  cleanExtractedText,
  extractConceptsWithGemini,
  extractTextFromPdf,
  generateDemoContent,
  storeExtractedTopics,
} from "@/lib/extractor";
import {
  downloadSupabasePdfByPath,
  fetchSupabasePdfByUrl,
  limitExtractedText,
} from "@/lib/pdf-security";

interface ExtractChapterPdfInput {
  chapterId: number;
  chapterName: string;
  subject: string;
  classNum: number;
  objectPath?: string;
  pdfUrl?: string;
  demoMode?: boolean;
}

export async function extractChapterPdf(input: ExtractChapterPdfInput) {
  if (!sql && !input.demoMode) {
    throw new Error("Database is required for PDF extraction.");
  }

  if (sql) {
    const rows = await sql`
      SELECT c.id
      FROM chapters c
      JOIN subjects s ON s.id = c.subject_id
      WHERE c.id = ${input.chapterId}
      AND s.class_num = ${input.classNum}
      AND lower(s.name) = lower(${input.subject})
      LIMIT 1
    `;
    if (!rows[0]) {
      const notFound = new Error(
        "Chapter not found for the requested class and subject.",
      );
      notFound.name = "NotFoundError";
      throw notFound;
    }
  }

  try {
    const topics = input.demoMode
      ? await generateDemoContent(input.chapterName, input.subject, input.classNum)
      : await extractTopicsFromPdf(input);
    const concepts = await storeExtractedTopics(
      input.chapterId,
      topics,
      input.demoMode ? "demo" : "pdf",
    );

    if (sql) {
      await sql`
        UPDATE chapters
        SET status = 'READY', error_metadata = NULL
        WHERE id = ${input.chapterId}
      `;
    }

    return {
      success: true,
      isDemoMode: Boolean(input.demoMode),
      topicsCount: topics.length,
      conceptsCount: concepts.length,
    };
  } catch (error) {
    if (sql) {
      await sql`
        UPDATE chapters
        SET status = 'FAILED',
            error_metadata = ${JSON.stringify({
              message: error instanceof Error ? error.message : "Extraction failed.",
            })}
        WHERE id = ${input.chapterId}
      `;
    }
    throw error;
  }
}

async function extractTopicsFromPdf(input: ExtractChapterPdfInput) {
  const buffer = input.objectPath
    ? await downloadSupabasePdfByPath(input.objectPath)
    : input.pdfUrl
      ? await fetchSupabasePdfByUrl(input.pdfUrl)
      : null;

  if (!buffer) {
    throw new Error("A Supabase object path or validated Supabase URL is required.");
  }

  const raw = await extractTextFromPdf(buffer);
  const cleanedText = limitExtractedText(cleanExtractedText(raw.text));

  if (!cleanedText || cleanedText.length < 250) {
    throw new Error("PDF text extraction produced too little content.");
  }

  return extractConceptsWithGemini(
    cleanedText,
    input.chapterName,
    input.subject,
    input.classNum,
  );
}
