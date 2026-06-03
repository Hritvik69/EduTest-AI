import {
  generateSourceBackedFallbackQuestions,
  hasSourceBackedFallbackConcepts,
} from "@/lib/source-backed-fallback";
import type {
  BlueprintSection,
  ConceptData,
  GeneratedQuestion,
  PaperConfig,
} from "@/types";

export const emergencyTxtRepairFillMarker = "NCERT_TXT_EMERGENCY_FILL";

export function generateEmergencyTxtRepairFill({
  missingSections,
  concepts,
  config,
  existingQuestions,
  limit = 2,
}: {
  missingSections: BlueprintSection[];
  concepts: ConceptData[];
  config: PaperConfig;
  existingQuestions: GeneratedQuestion[];
  limit?: number;
}) {
  const missingCount = missingSections.reduce(
    (sum, section) => sum + section.count,
    0,
  );

  if (missingCount <= 0 || missingCount > limit) {
    return [] satisfies GeneratedQuestion[];
  }

  const ncertTxtConcepts = concepts.filter(
    (concept) =>
      concept.source === "ncert_txt" &&
      concept.text.replace(/\s+/g, " ").trim().length >= 80,
  );
  if (!hasSourceBackedFallbackConcepts(ncertTxtConcepts)) {
    return [] satisfies GeneratedQuestion[];
  }

  const candidates = generateSourceBackedFallbackQuestions(
    missingSections,
    ncertTxtConcepts,
    config,
    {
      existingQuestions,
      startIndex: existingQuestions.length + 101,
    },
  );

  return candidates.slice(0, limit).map((question, index) => ({
    ...question,
    source: "ncert_txt" as const,
    noveltyAngle: `${emergencyTxtRepairFillMarker}:${question.type}:${index + 1}`,
    sourceChunkFocus:
      question.sourceChunkFocus ??
      question.topic ??
      "selected NCERT_Books TXT excerpt",
    answerPath:
      question.answerPath ??
      `Final emergency replacement grounded in selected NCERT_Books TXT for ${question.type}.`,
  }));
}
