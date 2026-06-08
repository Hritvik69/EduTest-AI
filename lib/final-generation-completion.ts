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
  BlueprintSection,
  ConceptData,
  PaperConfig,
  QuestionType,
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

  const tryQualityStableFinalFill = () => {
    if (activeBank.missingCount() <= 0) return;
    if (requireSyllabusComposition && !activeConfig.questionComposition?.length) {
      return;
    }

    const retarget = retargetFinalFragileSlotsForQualityStableFill({
      bank: activeBank,
      blueprint: activeBlueprint,
      config: activeConfig,
    });
    if (!retarget) return;

    const retargetedBank = activeBank.retarget(
      retarget.blueprint,
      retarget.config,
    );
    const beforeRetargetedFill = retargetedBank.readyCount();
    const completion = completeQuestionBankWithSyllabusNearFallback({
      bank: retargetedBank,
      config: retarget.config,
      concepts,
      startIndex: startIndex ?? retargetedBank.allCandidates().length + 2401,
    });
    const added = Math.max(0, retargetedBank.readyCount() - beforeRetargetedFill);
    if (added <= 0 || retargetedBank.missingCount() >= activeBank.missingCount()) {
      return;
    }

    activeBank = retargetedBank;
    activeBlueprint = retarget.blueprint;
    activeConfig = retarget.config;
    sourceCapacityConfig = activeConfig;
    syllabusNearCompletedQuestions += added;
    warnings.push({
      type: "quality-stable-final-fill",
      reason: `Completed ${added} final replacement question${added === 1 ? "" : "s"} by converting ${retarget.summary} after exact fragile-format fallback candidates were still rejected by strict teacher-quality validation.`,
    });
    warnings.push(
      ...completion.warnings.map((warning) => ({
        type: warning.type,
        reason: warning.reason,
      })),
    );

    sourceCapacity = analyzeSourceBackedCompletionCapacity({
      bank: activeBank,
      concepts,
      config: sourceCapacityConfig,
    });
  };

  const trySyllabusNearCompletion = (indexOffset: number) => {
    if (activeBank.missingCount() <= 0) return;
    if (requireSyllabusComposition && !activeConfig.questionComposition?.length) {
      return;
    }

    const beforeSyllabusNear = activeBank.readyCount();
    const completion = completeQuestionBankWithSyllabusNearFallback({
      bank: activeBank,
      config: activeConfig,
      concepts,
      startIndex: startIndex ?? activeBank.allCandidates().length + indexOffset,
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
  };

  const tryRetargetedSourceCompletion = () => {
    if (activeBank.missingCount() <= 0) return;

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
  };

  tryStrictSourceCompletion();
  tryRetargetedSourceCompletion();
  trySyllabusNearCompletion(401);

  if (activeBank.missingCount() > 0) {
    for (let pass = 0; pass < 3 && activeBank.missingCount() > 0; pass += 1) {
      const missingBeforePass = activeBank.missingCount();
      tryStrictSourceCompletion();
      tryRetargetedSourceCompletion();
      trySyllabusNearCompletion(1801 + pass * 300);
      tryAbsurdHardFinalFill();
      trySourceBackedLastMileFill();
      tryQualityStableFinalFill();

      if (activeBank.missingCount() >= missingBeforePass) {
        break;
      }
    }
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

type QualityStableConversion = {
  from: QuestionType;
  to: QuestionType;
  count: number;
};

function retargetFinalFragileSlotsForQualityStableFill({
  bank,
  blueprint,
  config,
}: {
  bank: QuestionCandidateBank;
  blueprint: Blueprint;
  config: PaperConfig;
}) {
  const conversions = qualityStableConversions(bank, blueprint, config);
  if (!conversions.length) return null;

  const nextBlueprint = blueprintWithQualityStableConversions(
    blueprint,
    bank,
    conversions,
  );
  const nextConfig = configWithQualityStableBlueprint(config, nextBlueprint);
  const nextBank = bank.retarget(nextBlueprint, nextConfig);
  if (nextBank.readyCount() < bank.readyCount()) return null;

  return {
    blueprint: nextBlueprint,
    config: nextConfig,
    summary: conversions
      .map(
        (conversion) =>
          `${conversion.count} ${conversion.from} slot${conversion.count === 1 ? "" : "s"} to ${conversion.to}`,
      )
      .join(" and "),
  };
}

function qualityStableConversions(
  bank: QuestionCandidateBank,
  blueprint: Blueprint,
  config: PaperConfig,
) {
  const plannedTargetMarks = new Map<QuestionType, number>();
  blueprint.sections.forEach((section) => {
    plannedTargetMarks.set(section.questionType, section.marksPerQuestion);
  });

  return bank
    .missingSections()
    .map((section) => {
      const replacement = qualityStableReplacementFor(
        section,
        blueprint,
        config,
        plannedTargetMarks,
      );
      if (!replacement) return null;
      plannedTargetMarks.set(replacement, section.marksPerQuestion);
      return {
        from: section.questionType,
        to: replacement,
        count: section.count,
      };
    })
    .filter((item): item is QualityStableConversion => Boolean(item));
}

function qualityStableReplacementFor(
  section: BlueprintSection,
  blueprint: Blueprint,
  config: PaperConfig,
  plannedTargetMarks: Map<QuestionType, number>,
) {
  return qualityStableReplacementOptions(section.questionType, config).find((type) =>
    replacementCanKeepMarks(type, section, blueprint, plannedTargetMarks),
  );
}

function replacementCanKeepMarks(
  type: QuestionType,
  section: BlueprintSection,
  blueprint: Blueprint,
  plannedTargetMarks: Map<QuestionType, number>,
) {
  if (type === section.questionType) return false;
  const existing = blueprint.sections.find(
    (candidate) => candidate.questionType === type,
  );
  if (existing && existing.marksPerQuestion !== section.marksPerQuestion) {
    return false;
  }
  const plannedMarks = plannedTargetMarks.get(type);
  return plannedMarks === undefined || plannedMarks === section.marksPerQuestion;
}

function qualityStableReplacementOptions(
  type: QuestionType,
  config: PaperConfig,
): QuestionType[] {
  switch (type) {
    case "ASSERTION_REASON":
    case "TRUE_FALSE":
      return ["MCQ", "SHORT", "COMPETENCY", "HOTS"];
    case "MATCH_FOLLOWING":
      return ["SHORT", "MCQ", "COMPETENCY", "HOTS"];
    case "VERY_SHORT":
      return ["SHORT", "COMPETENCY", "HOTS", "MCQ"];
    case "SHORT":
      return hasQuantitativeSelectedSubject(config)
        ? ["NUMERICAL", "COMPETENCY", "HOTS", "MCQ"]
        : ["COMPETENCY", "HOTS", "MCQ"];
    case "MCQ":
      return ["COMPETENCY", "SHORT", "HOTS"];
    default:
      return ["COMPETENCY", "HOTS", "SHORT", "MCQ"];
  }
}

function hasQuantitativeSelectedSubject(config: PaperConfig) {
  const labels = [
    config.subject,
    ...(config.subjects ?? []),
    ...(config.subjectSelections ?? []).map((selection) => selection.subject),
    ...(config.questionComposition ?? []).map((item) => item.subject),
  ]
    .join(" ")
    .toLowerCase();

  return /\b(?:math|mathematics|physics|chemistry|science|computer|economics|accountancy|statistics)\b/.test(
    labels,
  );
}

function blueprintWithQualityStableConversions(
  blueprint: Blueprint,
  bank: QuestionCandidateBank,
  conversions: QualityStableConversion[],
): Blueprint {
  const conversionBySource = conversions.reduce<
    Partial<Record<QuestionType, QualityStableConversion>>
  >((items, conversion) => {
    items[conversion.from] = conversion;
    return items;
  }, {});
  const nextSections: BlueprintSection[] = [];

  blueprint.sections.forEach((section) => {
    const conversion = conversionBySource[section.questionType];
    const convertedCount = conversion?.count ?? 0;
    const remainingCount = Math.max(0, section.count - convertedCount);
    if (remainingCount > 0) {
      mergeBlueprintSection(nextSections, {
        ...section,
        count: remainingCount,
        totalMarks: remainingCount * section.marksPerQuestion,
      });
    }
  });

  conversions.forEach((conversion) => {
    const sourceSection = bank
      .missingSections()
      .find((section) => section.questionType === conversion.from);
    if (!sourceSection) return;

    mergeBlueprintSection(nextSections, {
      ...sourceSection,
      name: `Section ${conversion.to}`,
      questionType: conversion.to,
      count: conversion.count,
      totalMarks: conversion.count * sourceSection.marksPerQuestion,
    });
  });

  return {
    ...blueprint,
    sections: nextSections,
    totalQuestions: nextSections.reduce((sum, section) => sum + section.count, 0),
    totalMarks: nextSections.reduce((sum, section) => sum + section.totalMarks, 0),
  };
}

function mergeBlueprintSection(
  sections: BlueprintSection[],
  section: BlueprintSection,
) {
  const existing = sections.find(
    (item) => item.questionType === section.questionType,
  );
  if (!existing) {
    sections.push(section);
    return;
  }

  existing.count += section.count;
  existing.totalMarks += section.totalMarks;
}

function configWithQualityStableBlueprint(
  config: PaperConfig,
  blueprint: Blueprint,
): PaperConfig {
  const typeDistribution = blueprint.sections.reduce<
    Partial<Record<QuestionType, number>>
  >((items, section) => {
    items[section.questionType] = section.count;
    return items;
  }, {});

  return {
    ...config,
    questionTypes: blueprint.sections.map((section) => section.questionType),
    typeDistribution,
    totalQuestions: blueprint.totalQuestions,
    totalMarks: blueprint.totalMarks,
  };
}
