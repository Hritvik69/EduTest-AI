import { QuestionCandidateBank } from "@/lib/question-candidate-bank";
import {
  analyzeSourceBackedCompletionCapacity,
  completeQuestionBankWithSourceBackedFallback,
  completeQuestionBankWithSyllabusNearFallback,
  hasSourceBackedFallbackConcepts,
  retargetSourceBackedCompletionForGuaranteedFinalRepair,
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

export type SourceBackedProviderRecoveryWarning = {
  type: string;
  reason: string;
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

  let activeBlueprint = blueprint;
  let activeConfig = config;
  let bank = new QuestionCandidateBank(existingQuestions, activeBlueprint, activeConfig);
  const readyBefore = bank.readyCount();
  const warnings: SourceBackedProviderRecoveryWarning[] = [];
  const tryStrictSourceCompletion = () => {
    const strictCapacity = analyzeSourceBackedCompletionCapacity({
      bank,
      concepts,
      config: activeConfig,
    });
    if (!strictCapacity.enough || bank.missingCount() <= 0) return strictCapacity;

    completeQuestionBankWithSourceBackedFallback({
      bank,
      concepts,
      config: activeConfig,
      startIndex: startIndex ?? bank.allCandidates().length + 101,
      throwOnInsufficientCapacity: false,
      capacityScope: scope,
    });

    return analyzeSourceBackedCompletionCapacity({
      bank,
      concepts,
      config: activeConfig,
    });
  };
  let capacity = analyzeSourceBackedCompletionCapacity({
    bank,
    concepts,
    config: activeConfig,
  });

  if (!capacity.enough) {
    const retarget = retargetSourceBackedCompletionForGuaranteedFinalRepair({
      bank,
      concepts,
      blueprint: activeBlueprint,
      config: activeConfig,
      sourceCapacity: capacity,
    });
    if (retarget) {
      bank = retarget.bank;
      activeBlueprint = retarget.blueprint;
      activeConfig = retarget.config;
      warnings.push({
        type: "source-backed-guaranteed-completion",
        reason: retarget.warning,
      });
      capacity = analyzeSourceBackedCompletionCapacity({
        bank,
        concepts,
        config: activeConfig,
      });
    }
  }

  if (bank.missingCount() > 0 && capacity.enough) {
    capacity = tryStrictSourceCompletion();
  }

  if (bank.missingCount() > 0) {
    const beforeSyllabusNear = bank.readyCount();
    const completion = completeQuestionBankWithSyllabusNearFallback({
      bank,
      config: activeConfig,
      concepts,
      startIndex: startIndex ?? bank.allCandidates().length + 401,
    });
    const added = Math.max(0, bank.readyCount() - beforeSyllabusNear);
    if (added > 0) {
      warnings.push(
        ...completion.warnings.map((warning) => ({
          type: warning.type,
          reason: warning.reason,
        })),
      );
    }
  }

  if (bank.missingCount() > 0) {
    capacity = tryStrictSourceCompletion();
  }

  const readyQuestionCount = bank.readyCount();
  const missingQuestionCount = bank.missingCount();

  if (missingQuestionCount > 0) {
    const finalCapacity = analyzeSourceBackedCompletionCapacity({
      bank,
      concepts,
      config: activeConfig,
    });
    throw sourceBackedProviderRecoveryError(
      scope,
      readyQuestionCount,
      activeBlueprint.totalQuestions,
      concepts,
      missingQuestionCount,
      finalCapacity,
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
    completedQuestionCount: Math.max(0, readyQuestionCount - readyBefore),
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
      `source_backed_provider_outage: AI providers were unavailable during generation, so remaining questions were completed from selected source text.${detailSummary}`,
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
