import { QuestionCandidateBank } from "@/lib/question-candidate-bank";
import {
  completeQuestionBankWithSourceBackedFallback,
  hasSourceBackedFallbackConcepts,
} from "@/lib/source-backed-fallback";
import type {
  Blueprint,
  ConceptData,
  GeneratedQuestion,
  PaperConfig,
} from "@/types";

export const sourceBackedProviderRecoveryMode =
  "source_backed_provider_outage" as const;

export type SourceBackedProviderRecoveryMode =
  typeof sourceBackedProviderRecoveryMode;

export type SourceBackedProviderRecoveryResult = {
  bank: QuestionCandidateBank;
  candidateQuestions: GeneratedQuestion[];
  generatedQuestions: GeneratedQuestion[];
  readyQuestionCount: number;
  targetQuestionCount: number;
  completedQuestionCount: number;
  missingQuestionCount: number;
};

export function buildSourceBackedProviderRecoveryBank({
  blueprint,
  concepts,
  config,
  existingQuestions = [],
  scope = "provider recovery",
  startIndex,
}: {
  blueprint: Blueprint;
  concepts: ConceptData[];
  config: PaperConfig;
  existingQuestions?: GeneratedQuestion[];
  scope?: string;
  startIndex?: number;
}): SourceBackedProviderRecoveryResult {
  if (!hasSourceBackedFallbackConcepts(concepts)) {
    throw sourceBackedProviderRecoveryError(scope, 0, blueprint.totalQuestions, concepts);
  }

  const bank = new QuestionCandidateBank(existingQuestions, blueprint, config);
  const readyBefore = bank.readyCount();
  const generatedQuestions = completeQuestionBankWithSourceBackedFallback({
    bank,
    concepts,
    config,
    startIndex: startIndex ?? bank.allCandidates().length + 101,
  });
  const readyQuestionCount = bank.readyCount();
  const missingQuestionCount = bank.missingCount();

  if (missingQuestionCount > 0) {
    throw sourceBackedProviderRecoveryError(
      scope,
      readyQuestionCount,
      blueprint.totalQuestions,
      concepts,
      missingQuestionCount,
    );
  }

  return {
    bank,
    candidateQuestions: bank.allCandidates(),
    generatedQuestions,
    readyQuestionCount,
    targetQuestionCount: blueprint.totalQuestions,
    completedQuestionCount: Math.max(0, readyQuestionCount - readyBefore),
    missingQuestionCount,
  };
}

export function sourceBackedProviderRecoveryWarning() {
  return {
    type: "provider-recovery",
    reason:
      "source_backed_provider_outage: AI providers were unavailable during generation, so remaining questions were completed from selected source text.",
  };
}

function sourceBackedProviderRecoveryError(
  scope: string,
  readyQuestionCount: number,
  targetQuestionCount: number,
  concepts: ConceptData[],
  missingQuestionCount = targetQuestionCount - readyQuestionCount,
) {
  const sourceConceptCount = sourceBackedConceptCount(concepts);
  const missing = Math.max(0, missingQuestionCount);
  return new Error(
    `SOURCE_TEXT_NOT_ENOUGH: Selected source text cannot produce enough 100% distinct questions for ${scope}. Generated ${readyQuestionCount}/${targetQuestionCount} valid questions. Missing ${missing}. Source concepts: ${sourceConceptCount}. Select more chapters/topics, upload stronger source text, or lower the question count.`,
  );
}

function sourceBackedConceptCount(concepts: ConceptData[]) {
  return concepts.filter((concept) => {
    const textLength = concept.text?.replace(/\s+/g, " ").trim().length ?? 0;
    return (
      (concept.source === "ncert_txt" || concept.source === "pdf") &&
      textLength >= 80
    );
  }).length;
}
