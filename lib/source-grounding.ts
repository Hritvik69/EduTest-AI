import type { ConceptData, PaperConfig } from "@/types";
import { analyzeConceptSourceQuality } from "@/lib/retriever";

export class SourceGroundingError extends Error {
  code = "SOURCE_NOT_TEXT_BACKED";

  constructor(message: string) {
    super(`SOURCE_NOT_TEXT_BACKED: ${message}`);
    this.name = "SourceGroundingError";
  }
}

const textualSubjectPattern = /\b(english|hindi|literature)\b/i;

const outlineOnlyPatterns = [
  /includes the NCERT\/CBSE topic/i,
  /reading comprehension and inference/i,
  /vocabulary and grammar in context/i,
  /theme, character, tone, and literary devices/i,
  /core concepts and definitions/i,
  /textbook examples and exercises/i,
  /problem solving and application/i,
  /is an important concept from the uploaded PDF/i,
];

export function assertSourceGroundingForGeneration(
  config: PaperConfig,
  concepts: ConceptData[],
) {
  if (process.env.EDUTEST_BYPASS_GROUNDING === "true") {
    return;
  }

  if (!concepts.length) {
    throw new SourceGroundingError(
      "No usable source concepts were found. Select a chapter with content or upload a readable PDF.",
    );
  }

  if (config.sourceMode === "pdf_upload") {
    assertPdfGrounding(config, concepts);
    return;
  }

  const sourceQuality = analyzeConceptSourceQuality(concepts);
  const textualSubject = isTextualSubject(config, concepts);
  if (
    sourceQuality.quality === "outline_only" ||
    (textualSubject &&
      (sourceQuality.quality === "weak" || isOutlineOnlySource(concepts)))
  ) {
    throw new SourceGroundingError(
      textualSubject
        ? "This English literature chapter has only outline topics, not the real chapter/story text. Upload the chapter PDF in PDF-EDU-TEST mode or import real extracted NCERT text before generating; the app will not invent story incidents from topic labels."
        : "The selected chapter has only outline topics, not enough real NCERT chapter text. Import extracted NCERT text or upload the chapter PDF before generating; the app will not invent questions from weak topic labels.",
    );
  }
}

function assertPdfGrounding(config: PaperConfig, concepts: ConceptData[]) {
  const pdfConcepts = concepts.filter((concept) => concept.source === "pdf");
  if (!pdfConcepts.length) {
    throw new SourceGroundingError(
      "PDF mode was selected, but no extracted PDF concepts were loaded. Re-upload the PDF and wait until it is fully understood.",
    );
  }

  const stats = sourceStats(pdfConcepts);
  const sourceWordCount = Number(config.pdfSource?.wordCount ?? 0);
  const tooLittleReadableContent =
    stats.meaningfulChars < 450 || stats.sentenceLikeConcepts < 2;
  const knownTinyPdf = Number.isFinite(sourceWordCount) && sourceWordCount > 0 && sourceWordCount < 120;

  if (tooLittleReadableContent || knownTinyPdf) {
    throw new SourceGroundingError(
      "The uploaded PDF did not produce enough real readable text for grounded questions. Use a clearer text-based PDF, add a narrower focus prompt, or re-upload; the app will not generate from headings or weak extracted topics only.",
    );
  }
}

function isTextualSubject(config: PaperConfig, concepts: ConceptData[]) {
  const values = [
    config.subject,
    ...(config.subjects ?? []),
    ...concepts.map((concept) => concept.subject ?? ""),
  ];
  return values.some((value) => textualSubjectPattern.test(value));
}

function isOutlineOnlySource(concepts: ConceptData[]) {
  const stats = sourceStats(concepts);
  if (stats.outlineRatio >= 0.7) return true;
  return stats.meaningfulChars < 650 && stats.sentenceLikeConcepts < 3;
}

function sourceStats(concepts: ConceptData[]) {
  const uniqueTexts = Array.from(
    new Set(concepts.map((concept) => normalizeText(concept.text)).filter(Boolean)),
  );
  const outlineCount = uniqueTexts.filter(isOutlineText).length;
  const meaningfulTexts = uniqueTexts.filter((text) => !isOutlineText(text));
  const meaningfulChars = meaningfulTexts.join(" ").length;
  const sentenceLikeConcepts = meaningfulTexts.filter(hasSentenceEvidence).length;

  return {
    outlineRatio: uniqueTexts.length ? outlineCount / uniqueTexts.length : 1,
    meaningfulChars,
    sentenceLikeConcepts,
  };
}

function isOutlineText(text: string) {
  const wordCount = text.split(/\s+/).filter(Boolean).length;
  return wordCount < 8 || outlineOnlyPatterns.some((pattern) => pattern.test(text));
}

function hasSentenceEvidence(text: string) {
  return text.length >= 80 && /[.!?।]/.test(text);
}

function normalizeText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}
