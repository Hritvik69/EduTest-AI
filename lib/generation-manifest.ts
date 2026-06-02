import type {
  AIProvider,
  AITask,
  Blueprint,
  ConceptData,
  GeneratedQuestion,
  GenerationManifest,
  PaperConfig,
} from "@/types";
import { analyzeConceptSourceQuality } from "@/lib/retriever";

export function buildGenerationManifest({
  config,
  blueprint,
  concepts,
  finalQuestions,
  skippedQuestions,
  replacedQuestions,
  validationWarnings,
  generationJobId,
  idempotencyKey,
  taskProviderOrder,
  usageSummary,
}: {
  config: PaperConfig;
  blueprint: Blueprint;
  concepts: ConceptData[];
  finalQuestions: GeneratedQuestion[];
  skippedQuestions: number;
  replacedQuestions: number;
  validationWarnings: unknown[];
  generationJobId?: string;
  idempotencyKey?: string;
  taskProviderOrder: Partial<Record<AITask, AIProvider[]>>;
  usageSummary?: GenerationManifest["ai"]["usageSummary"];
}): GenerationManifest {
  const conceptSource = dominantConceptSource(config, concepts);
  const sourceQuality = analyzeConceptSourceQuality(concepts);
  const warningTexts = normalizedValidationWarnings(validationWarnings);
  const sourceWarnings = sourceWarningTexts(config, conceptSource);

  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    generationJobId,
    idempotencyKey,
    source: {
      mode: config.sourceMode ?? "curriculum",
      classNum: config.classNum,
      subject: config.subject,
      subjects: config.subjects,
      chapterIds: config.chapterIds,
      topicIds: config.topicIds,
      pdfSourceId: config.pdfSourceId,
      pdfTitle: config.pdfSource?.title,
      pdfFileName: config.pdfSource?.fileName,
      pdfFocusPrompt: config.pdfSource?.focusPrompt,
      pdfContentHash: config.pdfSource?.contentHash,
      conceptSource,
      conceptCount: concepts.length,
      topicNames: unique(
        concepts.map((concept) => concept.topicName).filter(Boolean),
      ).slice(0, 16),
      sourceQuality: sourceQuality.quality,
      sourceTextChunks: sourceQuality.sourceTextChunks,
      extractionMethod: config.pdfSource?.extractionMethod,
    },
    ai: {
      selectedProvider: config.aiProvider ?? "AUTO",
      taskProviderOrder,
      usageSummary,
    },
    validation: {
      targetQuestions: blueprint.totalQuestions,
      finalQuestions: finalQuestions.length,
      targetMarks: blueprint.totalMarks,
      finalMarks: finalQuestions.reduce((sum, question) => sum + question.marks, 0),
      skippedQuestions,
      replacedQuestions,
      warnings: warningTexts,
    },
    warnings: unique([...sourceWarnings, ...warningTexts]).slice(0, 12),
  };
}

export function generationManifestFromMetadata(
  metadata: Record<string, unknown> | null | undefined,
) {
  const manifest = metadata?.generationManifest;
  return isGenerationManifest(manifest) ? manifest : undefined;
}

function dominantConceptSource(config: PaperConfig, concepts: ConceptData[]) {
  if (concepts.some((concept) => concept.source === "demo")) return "demo";
  if (concepts.some((concept) => concept.source === "pdf")) return "pdf";
  if (concepts.some((concept) => concept.source === "curriculum")) {
    return "curriculum";
  }
  return "unknown";
}

function sourceWarningTexts(
  config: PaperConfig,
  conceptSource: GenerationManifest["source"]["conceptSource"],
) {
  const warnings: string[] = [];
  const extractionMethod = config.pdfSource?.extractionMethod;

  if (conceptSource === "demo" || conceptSource === "unknown") {
    warnings.push("Paper used fallback content because no strong source was available.");
  }
  if (config.sourceMode === "pdf_upload" && conceptSource !== "pdf") {
    warnings.push("PDF mode was selected, but no extracted PDF concepts were used.");
  }
  if (extractionMethod === "LOCAL_FALLBACK" || extractionMethod === "CACHED_LOCAL_FALLBACK") {
    warnings.push("PDF concepts came from local fallback extraction, not a full AI extraction.");
  }
  if (extractionMethod === "CACHED_AI" || extractionMethod === "CACHED_LOCAL_FALLBACK") {
    warnings.push("PDF concepts came from cache.");
  }

  return warnings;
}

function normalizedValidationWarnings(values: unknown[]) {
  return values
    .map((value) => {
      if (!value || typeof value !== "object") return "";
      const record = value as Record<string, unknown>;
      const type = typeof record.type === "string" ? record.type : "question";
      const position = Number(record.position);
      const reason = typeof record.reason === "string" ? record.reason : "invalid";
      return Number.isFinite(position)
        ? `${type} at position ${position}: ${reason}`
        : `${type}: ${reason}`;
    })
    .filter(Boolean);
}

function isGenerationManifest(value: unknown): value is GenerationManifest {
  return (
    Boolean(value) &&
    typeof value === "object" &&
    (value as { version?: unknown }).version === 1 &&
    Boolean((value as { source?: unknown }).source) &&
    Boolean((value as { validation?: unknown }).validation)
  );
}

function unique(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}
