import { QuestionCandidateBank } from "@/lib/question-candidate-bank";
import {
  completeQuestionBankWithFinalFallbacks,
  type FinalGenerationCompletionWarning,
} from "@/lib/final-generation-completion";
import {
  hasSourceBackedFallbackConcepts,
  sourceBackedCapacityError,
  sourceBackedCapacityMessage,
  type SourceBackedCapacityDiagnostics,
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
  blueprint: Blueprint;
  config: PaperConfig;
  candidateQuestions: GeneratedQuestion[];
  generatedQuestions: GeneratedQuestion[];
  warnings: SourceBackedProviderRecoveryWarning[];
  readyQuestionCount: number;
  targetQuestionCount: number;
  completedQuestionCount: number;
  missingQuestionCount: number;
};

export type SourceBackedProviderRecoveryWarning = FinalGenerationCompletionWarning;

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

  const completion = completeQuestionBankWithFinalFallbacks({
    bank: new QuestionCandidateBank(existingQuestions, blueprint, config),
    blueprint,
    config,
    concepts,
    scope,
    startIndex,
  });
  const {
    bank,
    blueprint: activeBlueprint,
    config: activeConfig,
    warnings,
    readyQuestionCount,
    missingQuestionCount,
    completedQuestionCount,
    sourceCapacity,
  } = completion;

  if (missingQuestionCount > 0) {
    throw sourceBackedProviderRecoveryError(
      scope,
      readyQuestionCount,
      activeBlueprint.totalQuestions,
      concepts,
      missingQuestionCount,
      sourceCapacity,
    );
  }

  const candidateQuestions = bank.allCandidates();

  return {
    bank,
    blueprint: activeBlueprint,
    config: activeConfig,
    candidateQuestions,
    generatedQuestions: candidateQuestions.slice(existingQuestions.length),
    warnings,
    readyQuestionCount,
    targetQuestionCount: activeBlueprint.totalQuestions,
    completedQuestionCount,
    missingQuestionCount,
  };
}

export function sourceBackedProviderRecoveryWarning(
  details: SourceBackedProviderRecoveryWarning[] = [],
) {
  const detailSummary = details.length
    ? ` ${details.map((warning) => warning.reason).join(" ")}`
    : "";
  return {
    type: "provider-recovery",
    reason:
      `source_backed_provider_outage: AI providers were unavailable during generation, so remaining questions were completed from selected source text and chapter/topic-near coverage.${detailSummary}`,
  };
}

function sourceBackedProviderRecoveryError(
  scope: string,
  readyQuestionCount: number,
  targetQuestionCount: number,
  concepts: ConceptData[],
  missingQuestionCount = targetQuestionCount - readyQuestionCount,
  diagnostics?: SourceBackedCapacityDiagnostics,
) {
  const sourceConceptCount = sourceBackedConceptCount(concepts);
  const missing = Math.max(0, missingQuestionCount);
  if (diagnostics) {
    return sourceBackedCapacityError(
      scope,
      {
        ...diagnostics,
        sourceConceptCount,
        requiredMissingCount: missing,
      },
    );
  }

  return new Error(
    `SOURCE_TEXT_NOT_ENOUGH: Selected source text cannot produce enough 100% distinct questions for ${scope}. Generated ${readyQuestionCount}/${targetQuestionCount} valid questions. Missing ${missing}. Source concepts: ${sourceConceptCount}. ${sourceBackedCapacityMessage({
      requiredMissingCount: missing,
      rawAtomCapacity: 0,
      effectiveCapacity: 0,
      effectiveMissingCount: missing,
      availableStrictCapacity: 0,
      sourceConceptCount,
      atomCount: 0,
      consumedAtomTypeKeys: 0,
      duplicatePressure: {
        duplicateRejections: 0,
        duplicateGroups: 0,
        sourceBackedCandidates: 0,
      },
      byType: {},
      blockerReasons: ["no selected TXT/PDF source atoms are available"],
      enough: false,
    })}`,
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
