import { QuestionCandidateBank } from "@/lib/question-candidate-bank";
import {
  analyzeSourceBackedCompletionCapacity,
  completeQuestionBankWithSourceBackedFallback,
  completeQuestionBankWithSyllabusNearFallback,
  retargetSourceBackedCompletionForGuaranteedFinalRepair,
  sourceBackedCompletionMarker,
  type SourceBackedCapacityDiagnostics,
} from "@/lib/source-backed-fallback";
import type {
  Blueprint,
  ConceptData,
  PaperConfig,
} from "@/types";

export type FinalGenerationCompletionWarning = {
  type: string;
  reason: string;
};

export type FinalGenerationCompletionResult = {
  bank: QuestionCandidateBank;
  blueprint: Blueprint;
  config: PaperConfig;
  warnings: FinalGenerationCompletionWarning[];
  readyQuestionCount: number;
  targetQuestionCount: number;
  completedQuestionCount: number;
  missingQuestionCount: number;
  sourceBackedCompletedQuestions: number;
  syllabusNearCompletedQuestions: number;
  sourceCapacity: SourceBackedCapacityDiagnostics;
};

export function completeQuestionBankWithFinalFallbacks({
  bank,
  blueprint,
  config,
  concepts,
  scope = "final question completion",
  startIndex,
  deadlineAt,
  minRemainingMs = 5_000,
  requireSyllabusComposition = false,
}: {
  bank: QuestionCandidateBank;
  blueprint: Blueprint;
  config: PaperConfig;
  concepts: ConceptData[];
  scope?: string;
  startIndex?: number;
  deadlineAt?: number;
  minRemainingMs?: number;
  requireSyllabusComposition?: boolean;
}): FinalGenerationCompletionResult {
  let activeBank = bank;
  let activeBlueprint = blueprint;
  let activeConfig = config;
  const readyBefore = activeBank.readyCount();
  const warnings: FinalGenerationCompletionWarning[] = [];
  let sourceBackedCompletedQuestions = 0;
  let syllabusNearCompletedQuestions = 0;
  let sourceCapacityConfig = activeConfig;
  let sourceCapacity = analyzeSourceBackedCompletionCapacity({
    bank: activeBank,
    concepts,
    config: sourceCapacityConfig,
  });

  const tryStrictSourceCompletion = () => {
    sourceCapacityConfig = activeConfig;
    sourceCapacity = analyzeSourceBackedCompletionCapacity({
      bank: activeBank,
      concepts,
      config: sourceCapacityConfig,
    });
    if (!sourceCapacity.enough || activeBank.missingCount() <= 0) {
      return;
    }

    const beforeStrict = activeBank.readyCount();
    completeQuestionBankWithSourceBackedFallback({
      bank: activeBank,
      concepts,
      config: activeConfig,
      startIndex: startIndex ?? activeBank.allCandidates().length + 101,
      deadlineAt,
      minRemainingMs,
      throwOnInsufficientCapacity: false,
      capacityScope: scope,
    });
    const added = Math.max(0, activeBank.readyCount() - beforeStrict);
    if (added > 0) {
      sourceBackedCompletedQuestions += added;
      warnings.push({
        type: "source-backed-completion",
        reason: `${sourceBackedCompletionMarker}: completed ${added} final source-backed replacement question${added === 1 ? "" : "s"} from selected source text.`,
      });
    }
    sourceCapacity = analyzeSourceBackedCompletionCapacity({
      bank: activeBank,
      concepts,
      config: sourceCapacityConfig,
    });
  };

  const tryAbsurdHardFinalFill = () => {
    if (activeConfig.difficulty !== "ABSURD" || activeBank.missingCount() <= 0) {
      return;
    }

    const hardConfig: PaperConfig = {
      ...activeConfig,
      difficulty: "HARD",
    };
    const readyBeforeHardFill = activeBank.readyCount();
    let hardSourceAdded = 0;
    let hardSyllabusAdded = 0;

    const hardSourceCapacity = analyzeSourceBackedCompletionCapacity({
      bank: activeBank,
      concepts,
      config: hardConfig,
      startIndex: startIndex ?? activeBank.allCandidates().length + 801,
    });

    if (hardSourceCapacity.enough) {
      const beforeHardSource = activeBank.readyCount();
      completeQuestionBankWithSourceBackedFallback({
        bank: activeBank,
        concepts,
        config: hardConfig,
        startIndex: startIndex ?? activeBank.allCandidates().length + 801,
        deadlineAt,
        minRemainingMs,
        throwOnInsufficientCapacity: false,
        capacityScope: `${scope} absurd hard final fill`,
      });
      hardSourceAdded = Math.max(0, activeBank.readyCount() - beforeHardSource);
    }

    if (activeBank.missingCount() > 0) {
      sourceCapacityConfig = hardConfig;
      sourceCapacity = analyzeSourceBackedCompletionCapacity({
        bank: activeBank,
        concepts,
        config: sourceCapacityConfig,
        startIndex: startIndex ?? activeBank.allCandidates().length + 1601,
      });
      if (sourceCapacity.enough) {
        if (hardSourceAdded > 0) {
          sourceBackedCompletedQuestions += hardSourceAdded;
          warnings.push({
            type: "absurd-hard-final-fill",
            reason: `Completed ${hardSourceAdded} final Absurd replacement question${hardSourceAdded === 1 ? "" : "s"} at HARD difficulty because the remaining selected-source slots could not produce teacher-quality Absurd candidates.`,
          });
        }
        return;
      }
    }

    if (activeBank.missingCount() > 0) {
      const beforeHardSyllabus = activeBank.readyCount();
      completeQuestionBankWithSyllabusNearFallback({
        bank: activeBank,
        config: hardConfig,
        concepts,
        startIndex: startIndex ?? activeBank.allCandidates().length + 1201,
      });
      hardSyllabusAdded = Math.max(
        0,
        activeBank.readyCount() - beforeHardSyllabus,
      );
    }

    const added = Math.max(0, activeBank.readyCount() - readyBeforeHardFill);
    if (added > 0) {
      sourceBackedCompletedQuestions += hardSourceAdded;
      syllabusNearCompletedQuestions += hardSyllabusAdded;
      warnings.push({
        type: "absurd-hard-final-fill",
        reason: `Completed ${added} final Absurd replacement question${added === 1 ? "" : "s"} at HARD difficulty because the remaining selected-source slots could not produce teacher-quality Absurd candidates.`,
      });
    }

    sourceCapacityConfig = activeBank.missingCount() > 0 ? hardConfig : activeConfig;
    sourceCapacity = analyzeSourceBackedCompletionCapacity({
      bank: activeBank,
      concepts,
      config: sourceCapacityConfig,
    });
  };

  const trySourceBackedLastMileFill = () => {
    if (activeBank.missingCount() <= 0) return;

    sourceCapacity = analyzeSourceBackedCompletionCapacity({
      bank: activeBank,
      concepts,
      config: sourceCapacityConfig,
      startIndex: startIndex ?? activeBank.allCandidates().length + 1601,
    });
    if (!sourceCapacity.enough) return;

    const beforeLastMile = activeBank.readyCount();
    completeQuestionBankWithSourceBackedFallback({
      bank: activeBank,
      concepts,
      config: sourceCapacityConfig,
      startIndex: startIndex ?? activeBank.allCandidates().length + 1601,
      throwOnInsufficientCapacity: false,
      capacityScope: `${scope} source-backed last-mile fill`,
      minRemainingMs: 0,
    });
    const added = Math.max(0, activeBank.readyCount() - beforeLastMile);
    if (added > 0) {
      sourceBackedCompletedQuestions += added;
      warnings.push({
        type: "source-backed-last-mile-fill",
        reason: `${sourceBackedCompletionMarker}: completed ${added} final local source-backed replacement question${added === 1 ? "" : "s"} after the AI repair time reserve was too low for another network attempt.`,
      });
    }

    sourceCapacity = analyzeSourceBackedCompletionCapacity({
      bank: activeBank,
      concepts,
      config: sourceCapacityConfig,
    });
  };

  tryStrictSourceCompletion();

  if (activeBank.missingCount() > 0) {
    const retarget = retargetSourceBackedCompletionForGuaranteedFinalRepair({
      bank: activeBank,
      concepts,
      blueprint: activeBlueprint,
      config: activeConfig,
      sourceCapacity,
    });
    if (retarget) {
      activeBank = retarget.bank;
      activeBlueprint = retarget.blueprint;
      activeConfig = retarget.config;
      warnings.push({
        type: "source-backed-guaranteed-completion",
        reason: retarget.warning,
      });
      sourceCapacity = analyzeSourceBackedCompletionCapacity({
        bank: activeBank,
        concepts,
        config: activeConfig,
      });
      tryStrictSourceCompletion();
    }
  }

  if (
    activeBank.missingCount() > 0 &&
    (!requireSyllabusComposition || Boolean(activeConfig.questionComposition?.length))
  ) {
    const beforeSyllabusNear = activeBank.readyCount();
    const completion = completeQuestionBankWithSyllabusNearFallback({
      bank: activeBank,
      config: activeConfig,
      concepts,
      startIndex: startIndex ?? activeBank.allCandidates().length + 401,
    });
    const added = Math.max(0, activeBank.readyCount() - beforeSyllabusNear);
    if (added > 0) {
      syllabusNearCompletedQuestions += added;
      warnings.push(
        ...completion.warnings.map((warning) => ({
          type: warning.type,
          reason: warning.reason,
        })),
      );
    }
  }

  if (activeBank.missingCount() > 0) {
    tryStrictSourceCompletion();
    tryAbsurdHardFinalFill();
    trySourceBackedLastMileFill();
  } else {
    sourceCapacityConfig = activeConfig;
    sourceCapacity = analyzeSourceBackedCompletionCapacity({
      bank: activeBank,
      concepts,
      config: sourceCapacityConfig,
    });
  }

  const readyQuestionCount = activeBank.readyCount();

  return {
    bank: activeBank,
    blueprint: activeBlueprint,
    config: activeConfig,
    warnings,
    readyQuestionCount,
    targetQuestionCount: activeBlueprint.totalQuestions,
    completedQuestionCount: Math.max(0, readyQuestionCount - readyBefore),
    missingQuestionCount: activeBank.missingCount(),
    sourceBackedCompletedQuestions,
    syllabusNearCompletedQuestions,
    sourceCapacity,
  };
}
