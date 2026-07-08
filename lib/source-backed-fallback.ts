import {
  isDuplicateQuestion,
  numericDistinctnessProof,
  sourceBackedUniquenessKey,
  sourceBackedUniquenessKeyFor,
} from "@/lib/question-duplicates";
import { QuestionCandidateBank } from "@/lib/question-candidate-bank";
import { deterministicMcqOptionShuffle } from "@/lib/mcq-option-shuffle";
import { allowedDifficultiesForFormat } from "@/lib/difficulty-protocol";
import { hasTeacherLogicQualityIssue } from "@/lib/question-quality";
import { hasStudentVisibleQualityIssue } from "@/lib/question-validation";
import { buildShuffledMatchAnswer } from "@/lib/match-display";
import type {
  BloomLevel,
  BlueprintSection,
  Blueprint,
  ConceptData,
  Difficulty,
  GeneratedQuestion,
  MCQOption,
  PaperConfig,
  QuestionCompositionItem,
  QuestionType,
  SubQuestion,
} from "@/types";

type FallbackOptions = {
  existingQuestions?: GeneratedQuestion[];
  startIndex?: number;
};

export type SourceBackedCapacityTypeDiagnostics = {
  required: number;
  available: number;
  rawAvailable: number;
  effectiveAvailable: number;
  consumed: number;
  missing: number;
  skipped: SourceBackedSkipCounts;
  blockerReasons: string[];
};

export type SourceBackedCapacityDiagnostics = {
  requiredMissingCount: number;
  rawAtomCapacity: number;
  effectiveCapacity: number;
  effectiveMissingCount: number;
  availableStrictCapacity: number;
  sourceConceptCount: number;
  atomCount: number;
  consumedAtomTypeKeys: number;
  duplicatePressure: {
    duplicateRejections: number;
    duplicateGroups: number;
    sourceBackedCandidates: number;
  };
  byType: Partial<Record<QuestionType, SourceBackedCapacityTypeDiagnostics>>;
  blockerReasons: string[];
  enough: boolean;
};

export type SourceBackedSkipCounts = {
  duplicate: number;
  repeatedSourceKey: number;
  validation: number;
};

export type SourceBackedGuaranteedConversion = {
  from: QuestionType;
  to: QuestionType;
  count: number;
};

export type TypePreservationReason =
  | "source-too-thin"
  | "concept-shape-mismatch"
  | "no-quality-atomic-units"
  | "fragile-format-exhausted";

export type TypePreservationWarning = {
  type: "type-preservation";
  from: QuestionType;
  to: QuestionType;
  count: number;
  reason: TypePreservationReason;
  reasonText: string;
};

export function typePreservationWarningText(
  from: QuestionType,
  to: QuestionType,
  count: number,
  reason: TypePreservationReason,
): string {
  const reasonText = typePreservationReasonText(reason);
  return `Auto-picked ${count} ${from} → ${to} replacement${count === 1 ? "" : "s"} (${reasonText}).`;
}

function typePreservationReasonText(reason: TypePreservationReason): string {
  switch (reason) {
    case "source-too-thin":
      return "selected source text has too few concept atoms for the requested type";
    case "concept-shape-mismatch":
      return "source concept shape did not support the requested type";
    case "no-quality-atomic-units":
      return "AI could not produce a quality version in the requested type";
    case "fragile-format-exhausted":
      return "fragile-format candidates exhausted and rejected by quality validation";
  }
}

export type SourceBackedGuaranteedCompletionRetarget = {
  bank: QuestionCandidateBank;
  blueprint: Blueprint;
  config: PaperConfig;
  conversions: SourceBackedGuaranteedConversion[];
  warning: string;
  typePreservationWarnings: TypePreservationWarning[];
};

export type SyllabusNearFallbackWarning = {
  type: "syllabus-near-fallback";
  reason: string;
  subject: string;
  chapterName?: string;
  topicName?: string;
  count: number;
};

type StrictCompletionOptions = {
  throwOnInsufficientCapacity?: boolean;
  capacityScope?: string;
  requireSyllabusComposition?: boolean;
  /**
   * When true, the strict quality gate rejects any candidate that fails
   * {@link hasStudentVisibleQualityIssue} (forbidden student-visible patterns).
   * Used by the provider-outage recovery path so we never degrade quality
   * to "weak fallback" questions just because every AI provider failed.
   */
  strictQualityFilter?: boolean;
};

export const sourceBackedCompletionMarker = "SOURCE_BACKED_COMPLETION";

export function completeQuestionBankWithSourceBackedFallback({
  bank,
  concepts,
  config,
  startIndex,
  maxCandidatesPerMissing = 96,
  deadlineAt,
  minRemainingMs = 5_000,
  throwOnInsufficientCapacity = false,
  capacityScope = "selected source completion",
  requireSyllabusComposition = false,
  strictQualityFilter = false,
}: {
  bank: QuestionCandidateBank;
  concepts: ConceptData[];
  config: PaperConfig;
  startIndex?: number;
  maxCandidatesPerMissing?: number;
  deadlineAt?: number;
  minRemainingMs?: number;
} & StrictCompletionOptions) {
  const missingBefore = bank.missingCount();
  if (missingBefore <= 0) return [] satisfies GeneratedQuestion[];

  const conceptPool = normalizeConceptPool(concepts, config);
  if (!conceptPool.length) return [] satisfies GeneratedQuestion[];

  const capacity = analyzeSourceBackedCompletionCapacity({
    bank,
    concepts,
    config,
    startIndex,
    maxCandidatesPerMissing,
    requireSyllabusComposition,
    strictQualityFilter,
  });
  if (!capacity.enough) {
    if (throwOnInsufficientCapacity) {
      throw sourceBackedCapacityError(capacityScope, capacity);
    }
    return [] satisfies GeneratedQuestion[];
  }

  return fillQuestionBankWithSourceBackedCandidates({
    bank,
    conceptPool,
    config,
    startIndex,
    maxCandidatesPerMissing,
    deadlineAt,
    minRemainingMs,
    requireSyllabusComposition,
    strictQualityFilter,
  }).accepted;
}

export function analyzeSourceBackedCompletionCapacity({
  bank,
  concepts,
  config,
  startIndex,
  maxCandidatesPerMissing = 96,
  requireSyllabusComposition = false,
  strictQualityFilter = false,
}: {
  bank: QuestionCandidateBank;
  concepts: ConceptData[];
  config: PaperConfig;
  startIndex?: number;
  maxCandidatesPerMissing?: number;
  requireSyllabusComposition?: boolean;
  strictQualityFilter?: boolean;
}): SourceBackedCapacityDiagnostics {
  const conceptPool = normalizeConceptPool(concepts, config);
  const sourceConceptCount = sourceBackedConcepts(concepts).length;
  const candidateKeys = bank
    .allCandidates()
    .map(sourceBackedUniquenessKey)
    .filter((key): key is string => Boolean(key));
  const consumedKeys = new Set(candidateKeys);
  const requiredByType = new Map<QuestionType, number>();
  const missingSections = bank.missingSections();

  missingSections.forEach((section) => {
    requiredByType.set(
      section.questionType,
      (requiredByType.get(section.questionType) ?? 0) + section.count,
    );
  });

  const byType: SourceBackedCapacityDiagnostics["byType"] = {};
  let rawAtomCapacity = 0;

  requiredByType.forEach((required, type) => {
    const availableKeys = new Set<string>();
    conceptPool.forEach((concept) => {
      const key = sourceBackedAtomTypeKey(type, concept);
      if (key && !consumedKeys.has(key)) availableKeys.add(key);
    });
    const consumedForType = new Set(
      candidateKeys.filter((key) =>
        key.startsWith(`${String(type).toLowerCase()}:`),
      ),
    ).size;
    const rawAvailable = availableKeys.size;

    byType[type] = {
      required,
      available: 0,
      rawAvailable,
      effectiveAvailable: 0,
      consumed: consumedForType,
      missing: required,
      skipped: emptySourceBackedSkipCounts(),
      blockerReasons: [],
    };
    rawAtomCapacity += Math.min(required, rawAvailable);
  });

  const simulationBank = bank.clone();
  const simulation = fillQuestionBankWithSourceBackedCandidates({
    bank: simulationBank,
    conceptPool,
    config,
    startIndex,
    maxCandidatesPerMissing,
    requireSyllabusComposition,
    strictQualityFilter,
  });
  const acceptedByType = questionCountsByType(simulation.accepted);
  const simulatedMissingByType = new Map(
    simulationBank.missingSections().map((section) => [
      section.questionType,
      section.count,
    ]),
  );
  let effectiveCapacity = 0;

  requiredByType.forEach((required, type) => {
    const accepted = Math.min(required, acceptedByType.get(type) ?? 0);
    const missing = simulatedMissingByType.get(type) ?? 0;
    const current = byType[type];
    if (!current) return;
    current.available = accepted;
    current.effectiveAvailable = accepted;
    current.missing = missing;
    current.skipped = simulation.skippedByType[type] ?? emptySourceBackedSkipCounts();
    current.blockerReasons = sourceBackedCapacityTypeBlockers(type, current);
    effectiveCapacity += accepted;
  });

  const validation = bank.result();
  const requiredMissingCount = missingSections.reduce(
    (sum, section) => sum + section.count,
    0,
  );
  const effectiveMissingCount = Math.max(0, requiredMissingCount - effectiveCapacity);
  const blockerReasons = sourceBackedCapacityBlockers({
    requiredByType,
    byType,
    rawAtomCapacity,
    effectiveCapacity,
    simulation,
  });

  return {
    requiredMissingCount,
    rawAtomCapacity,
    effectiveCapacity,
    effectiveMissingCount,
    availableStrictCapacity: effectiveCapacity,
    sourceConceptCount,
    atomCount: conceptPool.length,
    consumedAtomTypeKeys: consumedKeys.size,
    duplicatePressure: {
      duplicateRejections: validation.rejectionReasons.DUPLICATE ?? 0,
      duplicateGroups: validation.duplicateGroups.length,
      sourceBackedCandidates: candidateKeys.length,
    },
    byType,
    blockerReasons,
    enough: requiredMissingCount <= effectiveCapacity,
  };
}

export function sourceBackedCapacityError(
  scope: string,
  diagnostics: SourceBackedCapacityDiagnostics,
) {
  const details = sourceBackedCapacityMessage(diagnostics);
  const error = new Error(
    `SOURCE_TEXT_NOT_ENOUGH: Selected source text cannot produce enough 100% distinct questions for ${scope}. ${details}`,
  );
  (
    error as Error & {
      code?: string;
      sourceCapacity?: SourceBackedCapacityDiagnostics;
    }
  ).code = "SOURCE_TEXT_NOT_ENOUGH";
  (
    error as Error & {
      code?: string;
      sourceCapacity?: SourceBackedCapacityDiagnostics;
    }
  ).sourceCapacity = diagnostics;
  return error;
}

export function sourceBackedCapacityMessage(
  diagnostics: SourceBackedCapacityDiagnostics,
) {
  const typeSummary = Object.entries(diagnostics.byType)
    .map(([type, item]) =>
      item
        ? `${type}: ${item.effectiveAvailable}/${item.required} effective (${item.rawAvailable} raw)`
        : "",
    )
    .filter(Boolean)
    .join(", ");
  const blockerSummary = diagnostics.blockerReasons.length
    ? ` Blockers: ${diagnostics.blockerReasons.join("; ")}.`
    : "";

  return `Required ${diagnostics.requiredMissingCount}; effective source capacity ${diagnostics.effectiveCapacity}; raw atom capacity ${diagnostics.rawAtomCapacity}; source concepts ${diagnostics.sourceConceptCount}; source atoms ${diagnostics.atomCount}; consumed atom/type keys ${diagnostics.consumedAtomTypeKeys}${typeSummary ? `; by type ${typeSummary}` : ""}.${blockerSummary} Select more chapters/topics, upload more source text, or lower the question count.`;
}

export function retargetSourceBackedCompletionForGuaranteedFinalRepair({
  bank,
  concepts,
  blueprint,
  config,
  sourceCapacity,
}: {
  bank: QuestionCandidateBank;
  concepts: ConceptData[];
  blueprint: Blueprint;
  config: PaperConfig;
  sourceCapacity: SourceBackedCapacityDiagnostics;
}): SourceBackedGuaranteedCompletionRetarget | null {
  const conversions = guaranteedCompletionConversions(
    bank,
    sourceCapacity,
    config,
    blueprint,
  );
  if (!conversions.length) return null;

  const nextBlueprint = blueprintWithGuaranteedCompletionConversions(
    blueprint,
    bank,
    conversions,
  );
  const nextConfig = configForGuaranteedCompletionConversions(config, nextBlueprint);
  const nextBank = bank.retarget(nextBlueprint, nextConfig);
  const nextCapacity = analyzeSourceBackedCompletionCapacity({
    bank: nextBank,
    concepts,
    config: nextConfig,
  });

  if (!nextCapacity.enough) return null;

  return {
    bank: nextBank,
    blueprint: nextBlueprint,
    config: nextConfig,
    conversions,
    warning: guaranteedCompletionWarning(conversions),
    typePreservationWarnings: conversions.map((conversion) => ({
      type: "type-preservation" as const,
      from: conversion.from,
      to: conversion.to,
      count: conversion.count,
      reason: "source-too-thin" as TypePreservationReason,
      reasonText: typePreservationWarningText(
        conversion.from,
        conversion.to,
        conversion.count,
        "source-too-thin",
      ),
    })),
  };
}

function guaranteedCompletionConversions(
  bank: QuestionCandidateBank,
  sourceCapacity: SourceBackedCapacityDiagnostics,
  config: PaperConfig,
  blueprint: Blueprint,
) {
  return bank
    .missingSections()
    .map((section) => {
      const replacement = guaranteedCompletionReplacementFor(
        section.questionType,
        config,
      );
      if (!replacement) return null;

      const item = sourceCapacity.byType[section.questionType];
      if (!item) return null;
      if (item.rawAvailable < section.count) return null;
      if (item.effectiveAvailable >= section.count) return null;

      const targetSection = blueprint.sections.find(
        (candidate) => candidate.questionType === replacement,
      );
      if (
        targetSection &&
        targetSection.marksPerQuestion !== section.marksPerQuestion
      ) {
        return null;
      }

      return {
        from: section.questionType,
        to: replacement,
        count: section.count,
      };
    })
    .filter((item): item is SourceBackedGuaranteedConversion => Boolean(item));
}

function guaranteedCompletionReplacementFor(
  type: QuestionType,
  config: PaperConfig,
): QuestionType | null {
  if (type === "ASSERTION_REASON") return "MCQ";
  if (type === "TRUE_FALSE") return "MCQ";
  if (type === "MATCH_FOLLOWING") return "SHORT";
  if (type === "SHORT" && hasQuantitativeSubject(config)) return "NUMERICAL";
  return null;
}

function hasQuantitativeSubject(config: PaperConfig) {
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

function blueprintWithGuaranteedCompletionConversions(
  blueprint: Blueprint,
  bank: QuestionCandidateBank,
  conversions: SourceBackedGuaranteedConversion[],
): Blueprint {
  const conversionBySource = conversions.reduce<
    Partial<Record<QuestionType, SourceBackedGuaranteedConversion>>
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
    const existingTarget = blueprint.sections.find(
      (section) => section.questionType === conversion.to,
    );
    const template = existingTarget ?? sourceSection;
    if (!template) return;

    mergeBlueprintSection(nextSections, {
      ...template,
      name: existingTarget?.name ?? `Section ${conversion.to}`,
      questionType: conversion.to,
      count: conversion.count,
      totalMarks: conversion.count * template.marksPerQuestion,
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
  const existing = sections.find((item) => item.questionType === section.questionType);
  if (!existing) {
    sections.push(section);
    return;
  }

  existing.count += section.count;
  existing.totalMarks += section.totalMarks;
}

function configForGuaranteedCompletionConversions(
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

function guaranteedCompletionWarning(
  conversions: SourceBackedGuaranteedConversion[],
) {
  const summary = conversions
    .map(
      (conversion) =>
        `${conversion.count} ${conversion.from} replacement${conversion.count === 1 ? "" : "s"} to ${conversion.to}`,
    )
    .join(" and ");

  return `Converted ${summary} to complete strict source-backed repair.`;
}

function wouldExceedSyllabusComposition(
  candidate: GeneratedQuestion,
  comparisonQuestions: GeneratedQuestion[],
  composition: QuestionCompositionItem[]
): boolean {
  const matchingItems = composition.filter((item) => {
    if (item.subject && candidate.subject) {
      if (item.subject.trim().toLowerCase() !== candidate.subject.trim().toLowerCase()) {
        return false;
      }
    }
    if (item.chapterId !== undefined && item.chapterId !== null) {
      if (candidate.chapterId !== item.chapterId) {
        return false;
      }
    }
    if (item.topicId !== undefined && item.topicId !== null) {
      if (candidate.topicId !== item.topicId) {
        return false;
      }
    }
    return true;
  });

  if (matchingItems.length === 0) {
    return false;
  }

  for (const item of matchingItems) {
    const currentCount = comparisonQuestions.filter((q) => {
      if (item.subject && q.subject) {
        if (item.subject.trim().toLowerCase() !== q.subject.trim().toLowerCase()) {
          return false;
        }
      }
      if (item.chapterId !== undefined && item.chapterId !== null) {
        if (q.chapterId !== item.chapterId) {
          return false;
        }
      }
      if (item.topicId !== undefined && item.topicId !== null) {
        if (q.topicId !== item.topicId) {
          return false;
        }
      }
      return true;
    }).length;

    if (currentCount + 1 > item.questionCount) {
      return true;
    }
  }

  return false;
}

function fillQuestionBankWithSourceBackedCandidates({
  bank,
  conceptPool,
  config,
  startIndex,
  maxCandidatesPerMissing = 96,
  deadlineAt,
  minRemainingMs = 5_000,
  requireSyllabusComposition = false,
  strictQualityFilter = false,
}: {
  bank: QuestionCandidateBank;
  conceptPool: NormalizedConcept[];
  config: PaperConfig;
  startIndex?: number;
  maxCandidatesPerMissing?: number;
  deadlineAt?: number;
  minRemainingMs?: number;
  requireSyllabusComposition?: boolean;
  strictQualityFilter?: boolean;
}) {
  const missingBefore = bank.missingCount();
  const accepted: GeneratedQuestion[] = [];
  const skipped = emptySourceBackedSkipCounts();
  const skippedByType: Partial<Record<QuestionType, SourceBackedSkipCounts>> = {};

  if (missingBefore <= 0 || !conceptPool.length) {
    return { accepted, skipped, skippedByType, attempts: 0 };
  }

  const candidateSpace = sourceBackedCandidateSpaceSize(conceptPool);
  const initialMissingByType = questionCountsBySectionType(bank.missingSections());
  const maxAttemptsByType = new Map<QuestionType, number>();
  initialMissingByType.forEach((required, type) => {
    maxAttemptsByType.set(
      type,
      Math.min(
        candidateSpace,
        Math.max(
          required,
          conceptPool.length,
          required * Math.max(1, Math.floor(maxCandidatesPerMissing)),
        ),
      ),
    );
  });
  const attemptsByType = new Map<QuestionType, number>();
  const cursorsByType = new Map<QuestionType, number>();
  const comparisonQuestions = bank.allCandidates();
  const usedSourceKeys = new Set(
    comparisonQuestions
      .map(sourceBackedUniquenessKey)
      .filter((key): key is string => Boolean(key)),
  );
  let attempts = 0;
  let sectionCursor = 0;

  while (
    bank.missingCount() > 0 &&
    !sourceBackedDeadlineReached(deadlineAt, minRemainingMs)
  ) {
    const eligibleSections = bank
      .missingSections()
      .filter((section) => {
        const usedAttempts = attemptsByType.get(section.questionType) ?? 0;
        const maxAttemptsForType =
          maxAttemptsByType.get(section.questionType) ?? candidateSpace;
        return usedAttempts < maxAttemptsForType;
      });
    if (!eligibleSections.length) break;

    const section = eligibleSections[
      sectionCursor % Math.max(1, eligibleSections.length)
    ];
    sectionCursor += 1;
    if (!section) break;

    const type = section.questionType;
    const cursor =
      cursorsByType.get(type) ??
      sourceBackedCursorStartForType(type, startIndex, candidateSpace);
    const candidate = sourceBackedQuestionForCursor(
      section,
      config,
      conceptPool,
      cursor,
    );
    cursorsByType.set(type, cursor + 1);
    attemptsByType.set(type, (attemptsByType.get(type) ?? 0) + 1);

    attempts += 1;
    const sourceKey = sourceBackedUniquenessKey(candidate);
    if (sourceKey && usedSourceKeys.has(sourceKey)) {
      recordSourceBackedSkip(skipped, skippedByType, type, "repeatedSourceKey");
      continue;
    }

    if (comparisonQuestions.some((item) => isDuplicateQuestion(item, candidate))) {
      recordSourceBackedSkip(skipped, skippedByType, type, "duplicate");
      continue;
    }

    if (
      requireSyllabusComposition &&
      config.questionComposition?.length &&
      wouldExceedSyllabusComposition(candidate, comparisonQuestions, config.questionComposition)
    ) {
      recordSourceBackedSkip(skipped, skippedByType, type, "validation");
      continue;
    }

    if (strictQualityFilter) {
      if (hasTeacherLogicQualityIssue(candidate)) {
        recordSourceBackedSkip(skipped, skippedByType, type, "validation");
        continue;
      }
      if (hasStudentVisibleQualityIssue(candidate)) {
        recordSourceBackedSkip(skipped, skippedByType, type, "validation");
        continue;
      }
    }

    if (bank.tryAdd(candidate)) {
      comparisonQuestions.push(candidate);
      if (sourceKey) usedSourceKeys.add(sourceKey);
      accepted.push(candidate);
      continue;
    }

    recordSourceBackedSkip(skipped, skippedByType, type, "validation");
  }

  return { accepted, skipped, skippedByType, attempts };
}

function sourceBackedCapacityBlockers({
  requiredByType,
  byType,
  rawAtomCapacity,
  effectiveCapacity,
  simulation,
}: {
  requiredByType: Map<QuestionType, number>;
  byType: SourceBackedCapacityDiagnostics["byType"];
  rawAtomCapacity: number;
  effectiveCapacity: number;
  simulation: ReturnType<typeof fillQuestionBankWithSourceBackedCandidates>;
}) {
  const blockers: string[] = [];

  requiredByType.forEach((required, type) => {
    const item = byType[type];
    if (!item || item.effectiveAvailable >= required) return;
    blockers.push(...item.blockerReasons);
  });

  if (rawAtomCapacity >= requiredTotal(requiredByType) && effectiveCapacity < rawAtomCapacity) {
    blockers.push("some generated source-backed templates were rejected as duplicate or invalid");
  }
  if (simulation.skipped.duplicate) {
    blockers.push(`${simulation.skipped.duplicate} duplicate candidate${simulation.skipped.duplicate === 1 ? "" : "s"} skipped`);
  }
  if (simulation.skipped.validation) {
    blockers.push(`${simulation.skipped.validation} candidate${simulation.skipped.validation === 1 ? "" : "s"} failed validation`);
  }

  return Array.from(new Set(blockers)).slice(0, 5);
}

function sourceBackedCapacityTypeBlockers(
  type: QuestionType,
  item: SourceBackedCapacityTypeDiagnostics,
) {
  if (item.effectiveAvailable >= item.required) return [];

  const blockers: string[] = [];
  if (item.rawAvailable < item.required) {
    blockers.push(`${type} has only ${item.rawAvailable}/${item.required} unused source atoms`);
    return blockers;
  }

  blockers.push(
    `${type} has raw source atoms but only ${item.effectiveAvailable}/${item.required} passed strict duplicate/format validation`,
  );
  if (item.skipped.repeatedSourceKey) {
    blockers.push(`${type} skipped ${item.skipped.repeatedSourceKey} reused source atom/type key${item.skipped.repeatedSourceKey === 1 ? "" : "s"}`);
  }
  if (item.skipped.duplicate) {
    blockers.push(`${type} skipped ${item.skipped.duplicate} duplicate candidate${item.skipped.duplicate === 1 ? "" : "s"}`);
  }
  if (item.skipped.validation) {
    blockers.push(`${type} skipped ${item.skipped.validation} format-invalid candidate${item.skipped.validation === 1 ? "" : "s"}`);
  }

  return blockers;
}

function requiredTotal(requiredByType: Map<QuestionType, number>) {
  let total = 0;
  requiredByType.forEach((count) => {
    total += count;
  });
  return total;
}

function questionCountsByType(questions: GeneratedQuestion[]) {
  return questions.reduce((counts, question) => {
    counts.set(question.type, (counts.get(question.type) ?? 0) + 1);
    return counts;
  }, new Map<QuestionType, number>());
}

function questionCountsBySectionType(sections: BlueprintSection[]) {
  return sections.reduce((counts, section) => {
    counts.set(
      section.questionType,
      (counts.get(section.questionType) ?? 0) + section.count,
    );
    return counts;
  }, new Map<QuestionType, number>());
}

function emptySourceBackedSkipCounts(): SourceBackedSkipCounts {
  return {
    duplicate: 0,
    repeatedSourceKey: 0,
    validation: 0,
  };
}

function recordSourceBackedSkip(
  total: SourceBackedSkipCounts,
  byType: Partial<Record<QuestionType, SourceBackedSkipCounts>>,
  type: QuestionType,
  reason: keyof SourceBackedSkipCounts,
) {
  total[reason] += 1;
  const typeSkipped = byType[type] ?? emptySourceBackedSkipCounts();
  typeSkipped[reason] += 1;
  byType[type] = typeSkipped;
}

export function generateSourceBackedFallbackQuestions(
  sections: BlueprintSection[],
  concepts: ConceptData[],
  config: PaperConfig,
  options: FallbackOptions = {},
) {
  const existing = [...(options.existingQuestions ?? [])];
  const conceptPool = normalizeConceptPool(concepts, config);
  if (!conceptPool.length) return [];
  const usedSourceKeys = new Set(
    existing
      .map(sourceBackedUniquenessKey)
      .filter((key): key is string => Boolean(key)),
  );

  let globalIndex = options.startIndex ?? existing.length + 1;
  const generated: GeneratedQuestion[] = [];

  for (const section of sections) {
    let acceptedInSection = 0;
    let attempts = 0;
    const maxAttempts = Math.min(
      sourceBackedCandidateSpaceSize(conceptPool),
      Math.max(section.count, section.count * 96),
    );

    while (
      acceptedInSection < section.count &&
      attempts < maxAttempts
    ) {
      const question = sourceBackedQuestionForSequence(
        section,
        config,
        conceptPool,
        globalIndex,
      );

      attempts += 1;
      globalIndex += 1;
      const sourceKey = sourceBackedUniquenessKey(question);
      if (sourceKey && usedSourceKeys.has(sourceKey)) {
        // Numerical questions on the same (concept, type) but with genuinely
        // different numeric inputs and final answers are distinct problems,
        // even though their source-backed uniqueness key collides. Letting
        // them through lets a single concept fill all NUMERICAL slots in a
        // paper (the hardDuplicateReason / isDuplicateQuestion paths below
        // still catch truly identical numeric stems via the dedicated
        // `numericDistinctnessProof` guard).
        const sameKeyPeer = [...existing, ...generated].find(
          (item) => sourceBackedUniquenessKey(item) === sourceKey,
        );
        const allowSoftSimilarNumerical =
          !!sameKeyPeer &&
          numericDistinctnessProof(sameKeyPeer, question).allowSoftSimilarity;
        if (!allowSoftSimilarNumerical) {
          continue;
        }
      }

      if (
        [...existing, ...generated].some((item) =>
          isDuplicateQuestion(item, question),
        )
      ) {
        continue;
      }
      if (hasTeacherLogicQualityIssue(question)) {
        continue;
      }

      generated.push(question);
      if (sourceKey) usedSourceKeys.add(sourceKey);
      acceptedInSection += 1;
    }
  }

  return generated;
}

export function hasWeakOrNoisySourceForSyllabusFallback(
  concepts: ConceptData[],
  item?: QuestionCompositionItem,
) {
  const focused = item ? conceptsForSyllabusItem(concepts, item) : concepts;
  const sourceConcepts = sourceBackedConcepts(focused);
  if (!sourceConcepts.length) return true;

  const meaningfulText = uniqueNormalized(
    sourceConcepts.map((concept) => concept.text),
  ).join(" ");
  const noisyCount = sourceConcepts.filter((concept) =>
    hasNoisySourceArtifact(concept.text),
  ).length;
  const totalChars = meaningfulText.length;
  const sentenceCount = meaningfulText
    .split(/(?<=[.!?])\s+/)
    .filter((sentence) => sentence.trim().length >= 50).length;

  return (
    totalChars < 650 ||
    sentenceCount < 3 ||
    noisyCount >= Math.max(1, Math.ceil(sourceConcepts.length * 0.2))
  );
}

export function generateSyllabusNearFallbackQuestions(
  sections: BlueprintSection[],
  item: QuestionCompositionItem,
  config: PaperConfig,
  options: {
    existingQuestions?: GeneratedQuestion[];
    concepts?: ConceptData[];
    startIndex?: number;
    strictQualityFilter?: boolean;
  } = {},
) {
  const existing = [...(options.existingQuestions ?? [])];
  const generated: GeneratedQuestion[] = [];
  let index = options.startIndex ?? existing.length + 1;

  for (const section of sections) {
    let acceptedInSection = 0;
    let attempts = 0;
    const maxAttempts = options.strictQualityFilter
      ? Math.max(section.count * 24, 64)
      : Math.max(section.count * 8, 16);

    while (acceptedInSection < section.count && attempts < maxAttempts) {
      const question = createSyllabusNearQuestion({
        section,
        item,
        config,
        concepts: options.concepts ?? [],
        index,
      });
      attempts += 1;
      index += 1;

      if ([...existing, ...generated].some((other) => isDuplicateQuestion(other, question))) {
        continue;
      }
      if (hasTeacherLogicQualityIssue(question)) {
        continue;
      }
      if (options.strictQualityFilter && hasStudentVisibleQualityIssue(question)) {
        continue;
      }

      generated.push(question);
      acceptedInSection += 1;
    }
  }

  return generated;
}

export function completeQuestionBankWithSyllabusNearFallback({
  bank,
  config,
  concepts,
  startIndex,
  strictQualityFilter = false,
}: {
  bank: QuestionCandidateBank;
  config: PaperConfig;
  concepts: ConceptData[];
  startIndex?: number;
  strictQualityFilter?: boolean;
}) {
  const composition = normalizedFallbackComposition(config, concepts);
  if (!composition.length || bank.missingCount() <= 0) {
    return {
      accepted: 0,
      warnings: [] satisfies SyllabusNearFallbackWarning[],
    };
  }

  const acceptedByItem = composition.map((item) => ({
    item,
    accepted: questionsMatchingSyllabusItem(bank.result().questions, item),
    added: 0,
  }));
  let cursor = startIndex ?? bank.allCandidates().length + 401;

  const maxCandidateWindowsPerMissingSlot = 48;
  for (const missingSection of expandMissingSections(bank.missingSections())) {
    const target = nextSyllabusDeficit(acceptedByItem) ?? acceptedByItem[0];
    if (!target) break;

    let accepted = false;
    for (
      let candidateWindow = 0;
      candidateWindow < maxCandidateWindowsPerMissingSlot && !accepted;
      candidateWindow += 1
    ) {
      const candidates = generateSyllabusNearFallbackQuestions(
        [missingSection],
        target.item,
        config,
        {
          concepts: conceptsForSyllabusItem(concepts, target.item),
          existingQuestions: bank.allCandidates(),
          startIndex: cursor,
          strictQualityFilter,
        },
      );
      cursor += Math.max(1, candidates.length + 1);
      accepted = candidates.some((candidate) => bank.tryAdd(candidate));
    }

    if (accepted) {
      target.accepted += 1;
      target.added += 1;
    }
  }

  const warnings = acceptedByItem
    .filter((entry) => entry.added > 0)
    .map((entry) => syllabusNearFallbackWarning(entry.item, entry.added));

  return {
    accepted: acceptedByItem.reduce((sum, entry) => sum + entry.added, 0),
    warnings,
  };
}

function createSyllabusNearQuestion({
  section,
  item,
  config,
  concepts,
  index,
}: {
  section: BlueprintSection;
  item: QuestionCompositionItem;
  config: PaperConfig;
  concepts: ConceptData[];
  index: number;
}): GeneratedQuestion {
  const concept = syllabusNearConceptFor(item, config, concepts, index);
  const common = syllabusNearCommonQuestionFields(section, item, config, concept, index);
  const options = syllabusNearOptions(concept, index);
  const mcqSeed = `syllabus-near:${item.subject}:${item.chapterId ?? ""}:${item.topicId ?? ""}:${section.questionType}:${concept.term}:${index}`;
  const shuffledMcq = deterministicMcqOptionShuffle(options, mcqSeed, index);

  switch (section.questionType) {
    case "MCQ":
      return {
        ...common,
        text: syllabusNearMcqStem(concept, index),
        options: shuffledMcq.options,
        correctAnswer: shuffledMcq.correctAnswer,
        explanation: concept.explanation,
      };
    case "ASSERTION_REASON":
      return {
        ...common,
        ...syllabusNearAssertionReasonQuestion(concept, index),
      };
    case "TRUE_FALSE":
      return syllabusNearTrueFalseQuestion(common, concept, index);
    case "ONE_WORD":
      return {
        ...common,
        text: `Which term means ${concept.oneWordPrompt}?`,
        correctAnswer: concept.term,
        explanation: concept.explanation,
      };
    case "FILL_BLANK":
      return {
        ...common,
        text: `${concept.fillBlankPrompt} is called ________.`,
        correctAnswer: concept.term,
        explanation: concept.explanation,
      };
    case "VERY_SHORT":
      return {
        ...common,
        text: `State one important point about ${concept.focus}.`,
        correctAnswer: concept.correct,
        keyPoints: [concept.correct],
        explanation: concept.explanation,
      };
    case "MATCH_FOLLOWING": {
      const pairs = syllabusNearMatchPairs(item, config, concepts, index);
      return {
        ...common,
        text: `Match the ${concept.matchTitle} terms with their meanings.`,
        matchPairs: pairs,
        correctAnswer: buildShuffledMatchAnswer(
          pairs,
          `syllabus-near:${concept.term}:${index}`,
        ),
        explanation: "Each term should be matched with its correct classroom meaning.",
      };
    }
    case "SHORT":
      return {
        ...common,
        ...syllabusNearShortQuestion(concept, index),
      };
    case "NUMERICAL":
      return syllabusNearNumericalQuestion(common, concept);
    case "SOURCE_BASED":
      return syllabusNearSourceBasedQuestion(common, concept);
    case "CASE_BASED":
      return syllabusNearCaseBasedQuestion(common, concept, shuffledMcq.options);
    case "PARAGRAPH":
      return {
        ...common,
        scenario: concept.scenario,
        text: `Based on the paragraph, explain ${concept.focus}.`,
        correctAnswer: concept.correct,
        keyPoints: [concept.correct, concept.example],
        explanation: concept.explanation,
      };
    case "HOTS":
      return {
        ...common,
        text: `What problem can occur if ${concept.focus} is ignored? Justify your answer.`,
        correctAnswer: concept.hotsAnswer,
        keyPoints: [concept.hotsAnswer, concept.example],
        explanation: concept.explanation,
      };
    case "COMPETENCY":
      return {
        ...common,
        text: `Use a classroom example to show ${concept.focus}.`,
        correctAnswer: `${concept.example} ${concept.correct}`,
        keyPoints: [concept.example, concept.correct],
        explanation: concept.explanation,
      };
    case "DIAGRAM":
      return {
        ...common,
        text: `Draw a labelled concept map for ${concept.term}.`,
        diagramDescription: `Place ${concept.term} in the centre and connect it with meaning, example, importance, and common mistake.`,
        correctAnswer: `The concept map should include ${concept.term}, its meaning, one example, and why it matters.`,
        keyPoints: [concept.term, concept.correct, concept.example],
        explanation: "A complete concept map uses clear labels and correct links.",
      };
    case "PRACTICAL":
      return {
        ...common,
        text: `Design a short classroom activity to practise ${concept.focus}.`,
        correctAnswer: `Activity: ${concept.example} Students should identify the concept and explain why it is effective.`,
        keyPoints: ["Aim", "Activity steps", concept.correct, "Conclusion"],
        explanation: concept.explanation,
      };
    case "LONG":
      return {
        ...common,
        text: `Write a detailed answer explaining ${concept.focus}.`,
        correctAnswer: `Introduce ${concept.term}. Explain: ${concept.correct} Add example: ${concept.example} Conclude with why it matters.`,
        keyPoints: [`Define ${concept.term}.`, concept.correct, concept.example, "Conclude clearly."],
        explanation: "A complete answer defines, explains, supports with an example, and concludes.",
      };
    case "NCERT_FORMAT":
      return {
        ...common,
        text: `Give an NCERT-style answer on ${concept.focus}.`,
        correctAnswer: concept.correct,
        keyPoints: [concept.correct, concept.example],
        explanation: concept.explanation,
      };
  }
}

function syllabusNearCommonQuestionFields(
  section: BlueprintSection,
  item: QuestionCompositionItem,
  config: PaperConfig,
  concept: SyllabusNearConcept,
  index: number,
): GeneratedQuestion {
  const difficulty = deterministicFallbackDifficultyForFormat(
    section.questionType,
    config.difficulty,
  );

  return {
    id: index,
    text: concept.focus,
    type: section.questionType,
    marks: section.marksPerQuestion,
    difficulty,
    bloomLevel: bloomFor(section.questionType, difficulty),
    competencyLevel: section.questionType === "MCQ" || section.questionType === "TRUE_FALSE" ? 2 : 3,
    reasoningSteps: reasoningStepsFor(difficulty),
    difficultyConfidence: 0.76,
    cognitiveComplexity: {
      conceptIntegration: complexityFor(difficulty),
      abstractionLevel: complexityFor(difficulty),
      inferenceLevel: Math.max(1, complexityFor(difficulty) - 1),
      ambiguityLevel: 1,
      cognitiveLoad: complexityFor(difficulty),
    },
    topic: item.topicName ?? concept.term,
    chapterId: item.chapterId,
    topicId: item.topicId,
    subject: item.subject || config.subject,
    classNum: config.classNum,
    source: "curriculum",
    noveltyAngle: `SYLLABUS_NEAR_FALLBACK:${section.questionType}:${index}:${slugPart(concept.term)}`,
    correctAnswer: concept.correct,
    explanation: concept.explanation,
  };
}

function syllabusNearSourceBasedQuestion(
  common: GeneratedQuestion,
  concept: SyllabusNearConcept,
): GeneratedQuestion {
  const subQuestions: SubQuestion[] = [
    shortSubQuestion("Identify the main concept in the passage.", concept.term, 1),
    shortSubQuestion("State why the concept is useful.", concept.correct, 1),
    shortSubQuestion("Give one example from the passage.", concept.example, 1),
    shortSubQuestion("Mention one mistake to avoid.", concept.misconception, 1),
  ];

  return {
    ...common,
    scenario: concept.scenario,
    text: `Read the passage about ${concept.term} and answer the questions.`,
    subQuestions,
    correctAnswer: subQuestions
      .map((question, index) => `(${index + 1}) ${question.correctAnswer}`)
      .join("; "),
  };
}

function syllabusNearCaseBasedQuestion(
  common: GeneratedQuestion,
  concept: SyllabusNearConcept,
  options: MCQOption[],
): GeneratedQuestion {
  const correctAnswer = correctOptionId(options);
  const subQuestions: SubQuestion[] = [
    {
      text: `Which option best explains the situation related to ${concept.term}?`,
      type: "MCQ",
      options,
      correctAnswer,
      marks: 2,
    },
    {
      text: "Give the reason for your answer.",
      type: "SHORT",
      correctAnswer: concept.correct,
      marks: 2,
    },
  ];

  return {
    ...common,
    scenario: concept.scenario,
    text: `Read the case about ${concept.term} and answer the questions.`,
    subQuestions,
    correctAnswer: `(1) ${correctAnswer}; (2) ${concept.correct}`,
  };
}

function correctOptionId(options: MCQOption[]) {
  return options.find((option) => option.isCorrect)?.id ?? "A";
}

function syllabusNearMcqStem(concept: SyllabusNearConcept, index: number) {
  const stems = [
    `Which option correctly describes ${concept.term}?`,
    `Which statement correctly applies ${concept.focus}?`,
    `Which example best matches ${concept.term}?`,
    `Which choice gives the most accurate subject-specific explanation of ${concept.term}?`,
  ];
  return stems[Math.abs(index) % stems.length];
}

function syllabusNearTrueFalseQuestion(
  common: GeneratedQuestion,
  concept: SyllabusNearConcept,
  index: number,
): GeneratedQuestion {
  const answer = positiveModulo(index, 2) === 0 ? "True" : "False";
  const statement =
    answer === "True"
      ? trueStatementVariant(concept.trueStatement, concept.term, index)
      : concept.falseStatement;

  return {
    ...common,
    text: `True or False: ${statement}`,
    correctAnswer: answer,
    explanation:
      answer === "True"
        ? concept.explanation
        : `This is false because ${lowerFirst(concept.correct)}`,
  };
}

function syllabusNearShortQuestion(
  concept: SyllabusNearConcept,
  index: number,
): Partial<GeneratedQuestion> {
  const stems = [
    `Explain why ${concept.focus} is important.`,
    `How does ${concept.term} help in a real situation?`,
    `Give two points that show the value of ${concept.term}.`,
    `Use an example to explain ${concept.focus}.`,
    `Compare ${concept.term} with a common misunderstanding about it.`,
  ];
  const keyPoints = [
    concept.correct,
    concept.example,
    `Avoid this misconception: ${concept.misconception}`,
  ];

  return {
    text: stems[positiveModulo(index, stems.length)] ?? stems[0],
    correctAnswer: `${concept.correct} ${concept.example} A complete answer should also avoid the misconception that ${lowerFirst(stripFinalPunctuation(concept.misconception))}.`,
    keyPoints,
    explanation: concept.explanation,
  };
}

function syllabusNearNumericalQuestion(
  common: GeneratedQuestion,
  concept: SyllabusNearConcept,
): GeneratedQuestion {
  const termText = `${concept.term} ${concept.focus}`.toLowerCase();
  if (/light|reflection|refraction|mirror|lens|ray|image/.test(termText)) {
    const angle = 20 + ((concept.firstCount + concept.secondCount) % 6) * 5;
    return {
      ...common,
      text: `A light ray strikes a plane mirror with an angle of incidence of ${angle}°. What is the angle of reflection?`,
      correctAnswer: `${angle}°`,
      keyPoints: [
        "By the law of reflection, angle of incidence equals angle of reflection.",
        `Angle of reflection = ${angle}°.`,
      ],
      explanation: "The law of reflection gives equal incident and reflected angles.",
    };
  }

  if (/chemical|reaction|equation|atom|molecule|oxidation|reduction/.test(termText)) {
    const reactantAtoms = 2 + (concept.firstCount % 4);
    const productAtoms = reactantAtoms + 2 + (concept.secondCount % 3);
    const difference = productAtoms - reactantAtoms;
    return {
      ...common,
      text: `In a draft chemical equation, the reactant side has ${reactantAtoms} oxygen atoms and the product side has ${productAtoms} oxygen atoms. How many oxygen atoms must be balanced?`,
      correctAnswer: `${difference} oxygen atoms`,
      keyPoints: [
        `Compare oxygen atoms on both sides: ${productAtoms} - ${reactantAtoms} = ${difference}.`,
        `The equation must be balanced for ${difference} oxygen atoms.`,
      ],
      explanation: "A balanced equation has the same number of each atom on both sides.",
    };
  }

  if (/mixture|solution|solute|solvent|concentration|separation|filtration|evaporation|distillation/.test(termText)) {
    const solute = 4 + (concept.firstCount % 5);
    const solvent = 20 + (concept.secondCount % 6) * 5;
    const total = solute + solvent;
    return {
      ...common,
      text: `A solution is prepared using ${solute} g of solute and ${solvent} g of solvent. What is the total mass of the solution?`,
      correctAnswer: `${total} g`,
      keyPoints: [
        `Total mass = mass of solute + mass of solvent.`,
        `${solute} g + ${solvent} g = ${total} g.`,
      ],
      explanation: "For a simple mixture, add the solute and solvent masses.",
    };
  }

  // Catch-all: real arithmetic with proper units. NEVER emit the
  // "chapter activity lists X key details / evidence points" fake — that
  // pattern is a textbook-section placeholder, not a real calculation.
  return syllabusNearArithmeticNumericalQuestion(concept, common);
}

function syllabusNearArithmeticNumericalQuestion(
  concept: SyllabusNearConcept,
  common: GeneratedQuestion,
): GeneratedQuestion {
  const a = concept.firstCount;
  const b = concept.secondCount;
  const template = (a + b * 3) % 4;
  const baseBody = (text: string, answer: string, keyPoints: string[]) => ({
    ...common,
    text,
    correctAnswer: answer,
    keyPoints,
    explanation: "Apply the standard formula and the correct order of operations.",
  });

  if (template === 0) {
    const result = a * b + (a - b);
    return baseBody(
      `Calculate the value of ${a} × ${b} + (${a} − ${b}).`,
      `${result}`,
      [
        `First compute ${a} × ${b} = ${a * b}.`,
        `Then compute (${a} − ${b}) = ${a - b}.`,
        `Add them: ${a * b} + ${a - b} = ${result}.`,
        `Final answer: ${result}.`,
      ],
    );
  }
  if (template === 1) {
    const pct = 10 + (a % 5) * 10;
    const whole = 200 + (b % 8) * 50;
    const result = +((pct / 100) * whole).toFixed(2);
    return baseBody(
      `Calculate ${pct}% of ${whole}.`,
      `${result}`,
      [
        `${pct}% of ${whole} = (${pct} / 100) × ${whole}.`,
        `= ${result}.`,
        `Final answer: ${result}.`,
      ],
    );
  }
  if (template === 2) {
    const km = 2 + (a % 6);
    const m = km * 1000;
    return baseBody(
      `Convert ${km} km into metres.`,
      `${m} m`,
      [
        `1 km = 1000 m.`,
        `${km} km = ${km} × 1000 = ${m} m.`,
        `Final answer: ${m} m.`,
      ],
    );
  }
  const c = (a + b) % 10 + 5;
  const mean = +((a + b + c) / 3).toFixed(2);
  return baseBody(
    `Find the mean of the numbers ${a}, ${b}, and ${c}.`,
    `${mean}`,
    [
      `Mean = (sum of all observations) / (number of observations).`,
      `Mean = (${a} + ${b} + ${c}) / 3 = ${a + b + c} / 3 = ${mean}.`,
      `Final answer: ${mean}.`,
    ],
  );
}

function trueStatementVariant(statement: string, term: string, index: number) {
  const cleanStatement = sentenceCase(stripFinalPunctuation(statement));
  const variants = [
    `${cleanStatement}.`,
    `${sentenceCase(term)} is useful when it is applied with clear understanding.`,
    `${cleanStatement} This makes the concept useful in a real situation.`,
  ];
  return variants[positiveModulo(index, variants.length)] ?? variants[0];
}

type SyllabusNearConcept = {
  term: string;
  focus: string;
  correct: string;
  misconception: string;
  example: string;
  explanation: string;
  falseStatement: string;
  assertion: string;
  reason: string;
  trueStatement: string;
  oneWordPrompt: string;
  fillBlankPrompt: string;
  matchTitle: string;
  scenario: string;
  hotsAnswer: string;
  firstCount: number;
  secondCount: number;
};

function syllabusNearConceptFor(
  item: QuestionCompositionItem,
  config: PaperConfig,
  concepts: ConceptData[],
  index: number,
): SyllabusNearConcept {
  const seeds = syllabusNearConcepts(item, config, concepts);
  return seeds[Math.abs(index) % seeds.length];
}

function syllabusNearConcepts(
  item: QuestionCompositionItem,
  config: PaperConfig,
  concepts: ConceptData[],
): SyllabusNearConcept[] {
  const label = cleanSyllabusLabel(
    item.topicName ?? item.chapterName ?? item.subject ?? config.subject,
  );
  const subject = item.subject || config.subject;
  const combined = `${subject} ${item.chapterName ?? ""} ${item.topicName ?? ""} ${concepts
    .map((concept) => `${concept.topicName} ${concept.text}`)
    .join(" ")}`;

  if (/communication|communicat|employability/i.test(combined)) {
    return communicationSkillConcepts();
  }

  if (/light|reflection|refraction|mirror|lens|ray|image/i.test(combined)) {
    return lightReflectionRefractionConcepts();
  }

  if (/motion|speed|velocity|acceleration|displacement|distance|friction|force/i.test(combined)) {
    return motionAndFrictionConcepts();
  }

  if (/chemical\s+reactions?|chemical\s+equations?|reaction|equation|oxidation|reduction|displacement/i.test(combined)) {
    return chemicalReactionsConcepts();
  }

  if (/mixtures?|solutions?|solute|solvent|separation|filtration|evaporation|distillation|suspension|colloid/i.test(combined)) {
    return mixturesAndSeparationConcepts();
  }

  return genericSyllabusConcepts(label, subject);
}

function communicationSkillConcepts(): SyllabusNearConcept[] {
  return [
    syllabusConcept({
      term: "Communication",
      focus: "the process of sharing information, ideas, or feelings between people",
      correct: "Communication is a two-way process in which a sender shares a message and the receiver understands it.",
      misconception: "Communication is not only speaking; it also includes listening and feedback.",
      example: "A student explains a timetable change and checks whether classmates understood it.",
      falseStatement: "Communication is complete as soon as the sender speaks, even if the receiver does not understand the message.",
    }),
    syllabusConcept({
      term: "Sender",
      focus: "the role of the sender in a communication process",
      correct: "The sender starts communication by creating and sending a clear message.",
      misconception: "A sender should not assume the receiver understood without checking feedback.",
      example: "A teacher announces homework instructions clearly before the class ends.",
      falseStatement: "The sender's role begins only after the receiver has already understood the message.",
    }),
    syllabusConcept({
      term: "Receiver",
      focus: "the role of the receiver in understanding a message",
      correct: "The receiver listens, reads, or observes the message and interprets its meaning.",
      misconception: "A receiver is active because understanding requires attention and response.",
      example: "A learner listens to safety instructions and asks a question for clarity.",
      falseStatement: "The receiver only hears words and does not need to interpret meaning.",
    }),
    syllabusConcept({
      term: "Message",
      focus: "the message as the information being communicated",
      correct: "The message is the idea, fact, instruction, or feeling that the sender wants to share.",
      misconception: "A message should not be vague because unclear words can confuse the receiver.",
      example: "Please submit the assignment by Friday is a clear message.",
      falseStatement: "A message is always clear as long as it contains many words.",
    }),
    syllabusConcept({
      term: "Channel",
      focus: "the medium used to send a message",
      correct: "A channel is the path used for communication, such as speech, writing, phone call, email, or gesture.",
      misconception: "The same channel is not best for every situation.",
      example: "An email is suitable for written instructions, while a phone call is faster for urgent news.",
      falseStatement: "One communication channel is equally suitable for every message and situation.",
    }),
    syllabusConcept({
      term: "Feedback",
      focus: "feedback in effective communication",
      correct: "Feedback is the receiver's response that tells the sender whether the message was understood.",
      misconception: "Without feedback, communication may remain incomplete.",
      example: "A student nods and repeats the instruction to show understanding.",
      falseStatement: "Feedback is optional because the sender always knows the receiver understood.",
    }),
    syllabusConcept({
      term: "Verbal communication",
      focus: "communication through spoken or written words",
      correct: "Verbal communication uses words to share a message clearly.",
      misconception: "Verbal communication can be spoken or written, not only face-to-face speech.",
      example: "Giving a presentation or writing a notice are verbal communication examples.",
      falseStatement: "Verbal communication happens only when two people speak face to face.",
    }),
    syllabusConcept({
      term: "Non-verbal communication",
      focus: "communication without words",
      correct: "Non-verbal communication uses body language, facial expressions, gestures, posture, or eye contact.",
      misconception: "Non-verbal signs can support or weaken spoken words.",
      example: "Maintaining eye contact can show attention during a conversation.",
      falseStatement: "Non-verbal communication has no effect when a person is speaking.",
    }),
    syllabusConcept({
      term: "Communication barrier",
      focus: "barriers that disturb clear communication",
      correct: "A communication barrier is anything that prevents a message from being sent, received, or understood properly.",
      misconception: "Noise, unclear language, distraction, and wrong channel can all become barriers.",
      example: "A noisy classroom can stop students from hearing an announcement.",
      falseStatement: "A barrier affects only the sender and cannot affect the receiver's understanding.",
    }),
    syllabusConcept({
      term: "Active listening",
      focus: "active listening during communication",
      correct: "Active listening means paying full attention, understanding the message, and responding appropriately.",
      misconception: "Hearing words is not the same as listening carefully.",
      example: "A learner listens, asks a relevant question, and summarizes the speaker's point.",
      falseStatement: "Active listening means staying silent without checking the message.",
    }),
    syllabusConcept({
      term: "Clarity",
      focus: "clarity in communication",
      correct: "Clarity means using simple, specific, and complete language so the receiver understands the message.",
      misconception: "Long or complicated words do not automatically make communication better.",
      example: "Meet at 9 a.m. near the library is clearer than Come there early.",
      falseStatement: "Clarity improves when the sender uses complicated words instead of specific details.",
    }),
    syllabusConcept({
      term: "Digital communication",
      focus: "safe and respectful digital communication",
      correct: "Digital communication should be clear, polite, accurate, and safe because messages can be stored or forwarded.",
      misconception: "Online messages should not share private information carelessly.",
      example: "A student writes a polite email with a clear subject and avoids sharing passwords.",
      falseStatement: "Digital communication does not need care because online messages disappear immediately.",
    }),
  ];
}

function genericSyllabusConcepts(label: string, subject: string): SyllabusNearConcept[] {
  const safeLabel = label || subject || "selected topic";
  return [
    syllabusConcept({
      term: safeLabel,
      focus: `the core idea of ${safeLabel}`,
      correct: `${safeLabel} should be explained with the correct definition, supporting condition, and one subject-specific example.`,
      misconception: `A good answer about ${safeLabel} cannot rely only on naming the chapter.`,
      example: `A correct answer connects ${safeLabel} with a concrete example from ${subject}.`,
      assertion: `${safeLabel} needs a subject-specific explanation, not only the chapter name.`,
      reason: `Definitions, conditions, and examples show whether the answer really matches ${safeLabel}.`,
    }),
    syllabusConcept({
      term: `${safeLabel} condition`,
      focus: `the condition needed in ${safeLabel}`,
      correct: `${safeLabel} answers should mention the condition or rule that controls the result.`,
      misconception: `The same answer may become wrong if the controlling condition changes.`,
      example: `A learner checks the given condition before choosing the rule for ${safeLabel}.`,
      assertion: `A condition can change the correct answer for ${safeLabel}.`,
      reason: `Subject rules often depend on the situation described in the question.`,
    }),
    syllabusConcept({
      term: `${safeLabel} example`,
      focus: `a correct example of ${safeLabel}`,
      correct: `A valid example of ${safeLabel} must show the rule or feature being used correctly.`,
      misconception: `An unrelated example does not prove understanding of ${safeLabel}.`,
      example: `The answer identifies the example and explains which feature of ${safeLabel} it shows.`,
      assertion: `An example is useful only when it shows the actual rule in ${safeLabel}.`,
      reason: `The explanation must connect the example with the tested concept.`,
    }),
  ];
}

function lightReflectionRefractionConcepts(): SyllabusNearConcept[] {
  return [
    syllabusConcept({
      term: "Law of reflection",
      focus: "the relation between incident and reflected rays",
      correct: "In reflection, the angle of incidence equals the angle of reflection, and the incident ray, reflected ray, and normal lie in the same plane.",
      misconception: "The reflected ray does not leave at a random angle.",
      example: "A plane mirror reflects a ray so that both angles measured from the normal are equal.",
      falseStatement: "The reflected ray can make any angle with the normal regardless of the incident ray.",
      assertion: "The angle of reflection equals the angle of incidence for a plane mirror.",
      reason: "Both angles are measured from the normal at the point where the ray strikes the mirror.",
    }),
    syllabusConcept({
      term: "Concave mirror",
      focus: "image formation by a concave mirror",
      correct: "A concave mirror can form real inverted images or virtual magnified images depending on the object's position.",
      misconception: "A concave mirror does not always form the same kind of image.",
      example: "A shaving mirror uses a concave mirror to form a magnified virtual image when the face is close to it.",
      falseStatement: "A concave mirror always forms a diminished virtual image for every object position.",
      assertion: "A concave mirror's image changes when the object position changes.",
      reason: "Ray diagrams show different image positions and sizes for different object distances.",
    }),
    syllabusConcept({
      term: "Convex mirror",
      focus: "image formation by a convex mirror",
      correct: "A convex mirror forms a virtual, erect, and diminished image and gives a wider field of view.",
      misconception: "A convex mirror is not used when a real inverted image is required on a screen.",
      example: "Vehicle rear-view mirrors use convex mirrors to show a wider area behind the vehicle.",
      falseStatement: "A convex mirror usually forms a real inverted image on a screen.",
      assertion: "A convex mirror is useful for rear-view mirrors.",
      reason: "It forms diminished erect images and provides a wider field of view.",
    }),
    syllabusConcept({
      term: "Refraction",
      focus: "bending of light between media",
      correct: "Refraction is the bending of light when it passes from one medium to another because its speed changes.",
      misconception: "Light does not bend at a boundary if its speed and direction remain unchanged.",
      example: "A pencil appears bent in water because light refracts as it passes from water to air.",
      falseStatement: "Refraction happens because light stops at the boundary between two media.",
      assertion: "Light bends during refraction when it enters a medium where its speed changes.",
      reason: "A change in speed at the boundary changes the direction of the ray.",
    }),
    syllabusConcept({
      term: "Convex lens",
      focus: "converging action of a convex lens",
      correct: "A convex lens converges parallel rays of light and can form real or virtual images depending on object position.",
      misconception: "A convex lens does not always form only one fixed image size.",
      example: "A magnifying glass uses a convex lens to produce an enlarged virtual image for a nearby object.",
      falseStatement: "A convex lens always diverges parallel rays away from the principal axis.",
      assertion: "A convex lens can converge parallel rays of light.",
      reason: "Its shape bends rays toward the principal focus after refraction.",
    }),
  ];
}

function chemicalReactionsConcepts(): SyllabusNearConcept[] {
  return [
    syllabusConcept({
      term: "Chemical equation",
      focus: "representation of a chemical reaction",
      correct: "A chemical equation represents reactants, products, and their physical states using chemical formulae and symbols.",
      misconception: "A chemical equation is not complete if it only names the chapter topic.",
      example: "Zn + H2SO4 -> ZnSO4 + H2 shows zinc reacting with sulphuric acid to form zinc sulphate and hydrogen.",
      falseStatement: "A chemical equation does not need reactants or products.",
      assertion: "A chemical equation must show reactants and products.",
      reason: "Reactants change into products during a chemical reaction.",
    }),
    syllabusConcept({
      term: "Balanced equation",
      focus: "law of conservation of mass in equations",
      correct: "A balanced chemical equation has the same number of atoms of each element on the reactant and product sides.",
      misconception: "Balancing does not mean changing the chemical formulae of substances.",
      example: "2H2 + O2 -> 2H2O is balanced because hydrogen and oxygen atoms are equal on both sides.",
      falseStatement: "A balanced equation can have different numbers of the same atom on both sides.",
      assertion: "Balancing a chemical equation follows conservation of mass.",
      reason: "Atoms are neither created nor destroyed in an ordinary chemical reaction.",
    }),
    syllabusConcept({
      term: "Combination reaction",
      focus: "formation of one product from reactants",
      correct: "In a combination reaction, two or more reactants combine to form a single product.",
      misconception: "A combination reaction does not produce many unrelated products.",
      example: "Calcium oxide reacts with water to form calcium hydroxide.",
      falseStatement: "A combination reaction always breaks one compound into simpler substances.",
      assertion: "A combination reaction forms a single main product.",
      reason: "The reactants combine to make one new substance.",
    }),
    syllabusConcept({
      term: "Decomposition reaction",
      focus: "breaking of a compound into simpler substances",
      correct: "In a decomposition reaction, one compound breaks down into two or more simpler products.",
      misconception: "Decomposition is not the same as two reactants joining to form one product.",
      example: "Calcium carbonate decomposes on heating to form calcium oxide and carbon dioxide.",
      falseStatement: "A decomposition reaction begins with several reactants combining into one product.",
      assertion: "A decomposition reaction has one compound breaking into simpler products.",
      reason: "Heat, light, or electricity can supply energy to split the compound.",
    }),
    syllabusConcept({
      term: "Oxidation and reduction",
      focus: "oxygen and electron changes in reactions",
      correct: "Oxidation involves gain of oxygen or loss of electrons, while reduction involves loss of oxygen or gain of electrons.",
      misconception: "Oxidation and reduction are not random labels; they describe specific changes.",
      example: "Copper oxide is reduced to copper when oxygen is removed from it.",
      falseStatement: "Reduction always means adding oxygen to a substance.",
      assertion: "Oxidation and reduction describe opposite chemical changes.",
      reason: "One process involves gain of oxygen or electron loss, while the other involves oxygen loss or electron gain.",
    }),
  ];
}

function motionAndFrictionConcepts(): SyllabusNearConcept[] {
  return [
    syllabusConcept({
      term: "Average velocity",
      focus: "change in displacement divided by the time taken",
      correct: "Average velocity is displacement divided by time, so it includes both magnitude and direction.",
      misconception: "Average velocity is not always the same as average speed because displacement depends on direction.",
      example: "A runner who returns to the starting point has zero displacement even after covering distance.",
      falseStatement: "Average velocity depends only on the total distance covered and never on direction.",
      assertion: "Average velocity can become zero even when distance has been covered.",
      reason: "Displacement may be zero if the final position is the same as the initial position.",
    }),
    syllabusConcept({
      term: "Acceleration",
      focus: "rate of change of velocity with time",
      correct: "Acceleration measures how quickly velocity changes with time and can occur when speed or direction changes.",
      misconception: "Acceleration does not require an object to be speeding up only; direction change also matters.",
      example: "A car turning on a curved road has changing velocity because its direction changes.",
      falseStatement: "Acceleration is present only when an object moves in a straight line with constant speed.",
      assertion: "An object can accelerate even when its speed remains constant.",
      reason: "Velocity includes direction, so a change in direction changes velocity.",
    }),
    syllabusConcept({
      term: "Uniform motion",
      focus: "motion in which equal distances are covered in equal intervals of time",
      correct: "Uniform motion means an object covers equal distances in equal time intervals.",
      misconception: "Uniform motion is not shown when the distance covered changes from one equal time interval to the next.",
      example: "A toy car moving 2 m every second on a straight track shows uniform motion.",
      falseStatement: "Uniform motion happens when unequal distances are covered in equal time intervals.",
      assertion: "Equal distance in equal time intervals indicates uniform motion.",
      reason: "The speed remains constant when the same distance is covered each second.",
    }),
    syllabusConcept({
      term: "Friction",
      focus: "force that opposes relative motion between surfaces in contact",
      correct: "Friction acts between surfaces in contact and opposes relative motion or the tendency of motion.",
      misconception: "Friction is not always useless because it helps walking, writing, and braking.",
      example: "A bicycle brake slows the wheel because friction acts between the brake pad and rim.",
      falseStatement: "Friction always helps objects move faster on every surface.",
      assertion: "Friction can slow a moving object.",
      reason: "It acts opposite to the relative motion between surfaces in contact.",
    }),
    syllabusConcept({
      term: "Distance and displacement",
      focus: "difference between path length and shortest directed change in position",
      correct: "Distance is the total path length, while displacement is the shortest directed change from initial to final position.",
      misconception: "Distance and displacement are not always equal because path and direction can differ.",
      example: "Walking around a square path and returning to the start gives non-zero distance but zero displacement.",
      falseStatement: "Displacement is always equal to the total distance travelled.",
      assertion: "Displacement can be smaller than distance.",
      reason: "Displacement depends only on initial and final positions with direction.",
    }),
  ];
}

function mixturesAndSeparationConcepts(): SyllabusNearConcept[] {
  return [
    syllabusConcept({
      term: "Solution",
      focus: "homogeneous mixture of solute and solvent",
      correct: "A solution is a homogeneous mixture in which the solute dissolves uniformly in the solvent.",
      misconception: "A solution does not show separate visible particles when it is truly homogeneous.",
      example: "Salt dissolved in water forms a uniform salt solution.",
      falseStatement: "A true solution always has visible particles that settle down on standing.",
      assertion: "A solution has uniform composition throughout.",
      reason: "The solute particles are distributed evenly in the solvent.",
    }),
    syllabusConcept({
      term: "Solute and solvent",
      focus: "roles of dissolved substance and dissolving medium",
      correct: "The solute is the substance dissolved, while the solvent is the medium that dissolves it.",
      misconception: "The solute and solvent should not be identified without checking which substance dissolves in which medium.",
      example: "In sugar solution, sugar is the solute and water is the solvent.",
      falseStatement: "In every solution, water must be the solute.",
      assertion: "A solute dissolves in a solvent to form a solution.",
      reason: "The solvent is the medium that spreads the solute uniformly.",
    }),
    syllabusConcept({
      term: "Suspension",
      focus: "heterogeneous mixture with particles that can settle",
      correct: "A suspension is a heterogeneous mixture whose particles are large enough to be seen and can settle on standing.",
      misconception: "A suspension is not the same as a true solution because its particles are not uniformly dissolved.",
      example: "Muddy water is a suspension because soil particles can settle down.",
      falseStatement: "Suspension particles never settle down even after a long time.",
      assertion: "A suspension can show settling of particles.",
      reason: "Its particles are large and remain unevenly distributed in the mixture.",
    }),
    syllabusConcept({
      term: "Filtration",
      focus: "separation of insoluble solid from liquid",
      correct: "Filtration separates an insoluble solid from a liquid using a filter medium.",
      misconception: "Filtration cannot separate a dissolved solute from a true solution.",
      example: "Sand can be separated from water by passing the mixture through filter paper.",
      falseStatement: "Filtration is used to separate dissolved salt from salt water directly.",
      assertion: "Filtration can separate sand from water.",
      reason: "Sand is insoluble and is trapped by the filter medium.",
    }),
    syllabusConcept({
      term: "Evaporation",
      focus: "separation based on conversion of liquid into vapour",
      correct: "Evaporation can separate a dissolved solid from a solution by converting the liquid solvent into vapour.",
      misconception: "Evaporation is not suitable when the liquid itself must be collected unchanged.",
      example: "Salt can be obtained from salt water by evaporating water.",
      falseStatement: "Evaporation keeps all the solvent in the container as liquid.",
      assertion: "Evaporation can help recover salt from salt water.",
      reason: "Water changes into vapour and leaves the dissolved salt behind.",
    }),
  ];
}

function syllabusConcept({
  term,
  focus,
  correct,
  misconception,
  example,
  falseStatement,
  assertion,
  reason,
  trueStatement,
}: {
  term: string;
  focus: string;
  correct: string;
  misconception: string;
  example: string;
  falseStatement?: string;
  assertion?: string;
  reason?: string;
  trueStatement?: string;
}): SyllabusNearConcept {
  return {
    term,
    focus,
    correct,
    misconception,
    example,
    explanation: correct,
    falseStatement:
      falseStatement ??
      `A correct answer for ${term} can ignore the relevant rule and still be complete.`,
    assertion: assertion ?? `${sentenceCase(stripFinalPunctuation(focus))} must be linked to the correct subject rule.`,
    reason: reason ?? correct,
    trueStatement: trueStatement ?? correct,
    oneWordPrompt: `${focus}`,
    fillBlankPrompt: stripFinalPunctuation(focus),
    matchTitle: term.toLowerCase(),
    scenario: `A Class 9 learner studies ${term}. ${example} The learner must explain the idea clearly and avoid common mistakes.`,
    hotsAnswer: `If ${term} is ignored, the answer or situation can become unclear because ${correct}`,
    firstCount: 3 + (term.length % 4),
    secondCount: 2 + (focus.length % 4),
  };
}

function syllabusNearAssertionReasonQuestion(
  concept: SyllabusNearConcept,
  index: number,
): Partial<GeneratedQuestion> {
  const answer = assertionReasonAnswerFor(index);
  const trueAssertion = concept.assertion;
  const explanatoryReason = concept.reason;
  const unrelatedTrueReason =
    `${sentenceCase(concept.term)} can be supported by examples, but an example alone does not prove the stated rule.`;
  const falseStatement = concept.falseStatement;

  const [assertion, reason] = assertionReasonPairForAnswer(answer, {
    trueAssertion,
    explanatoryReason,
    unrelatedTrueReason,
    falseAssertion: falseStatement,
    falseReason: falseStatement,
  });

  return {
    text: `Assertion (A): ${assertion}\nReason (R): ${reason}`,
    assertion,
    reason,
    correctAnswer: answer,
    explanation: assertionReasonExplanation(answer),
  };
}

function syllabusNearOptions(concept: SyllabusNearConcept, index: number): MCQOption[] {
  const distractors = [
    concept.misconception,
    `${concept.term} can be explained correctly even when the relevant rule is ignored.`,
    `The example is valid even when it contradicts ${concept.term}.`,
    `A correct answer for ${concept.term} should avoid the given conditions.`,
  ];

  return [
    { id: "A", text: distractors[index % distractors.length], isCorrect: false },
    { id: "B", text: concept.correct, isCorrect: true },
    { id: "C", text: distractors[(index + 1) % distractors.length], isCorrect: false },
    { id: "D", text: distractors[(index + 2) % distractors.length], isCorrect: false },
  ];
}

function syllabusNearMatchPairs(
  item: QuestionCompositionItem,
  config: PaperConfig,
  concepts: ConceptData[],
  index: number,
) {
  const seeds = syllabusNearConcepts(item, config, concepts);
  const offset = Math.abs(index) % seeds.length;
  return Array.from({ length: 4 }, (_, pairIndex) => {
    const concept = seeds[(offset + pairIndex) % seeds.length];
    return {
      left: concept.term,
      right: trimToSentence(syllabusNearMatchRight(concept), 120),
    };
  });
}

function syllabusNearMatchRight(concept: SyllabusNearConcept) {
  const termPattern = new RegExp(
    `\\b${escapeRegExp(concept.term).replace(/\s+/g, "\\s+")}\\b`,
    "ig",
  );
  const withoutTerm = concept.correct
    .replace(termPattern, "")
    .replace(/^\s*(?:is|are|means|refers to|involves|uses|can|should)\b\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();
  if (withoutTerm.split(/\s+/).filter(Boolean).length >= 5) {
    return sentenceCase(withoutTerm);
  }
  return concept.example;
}

function normalizedFallbackComposition(
  config: PaperConfig,
  concepts: ConceptData[],
) {
  if (config.questionComposition?.length) return config.questionComposition;
  const subject = config.subjects?.[0] ?? config.subject;
  const chapterId = config.chapterIds[0] ?? concepts[0]?.chapterId;
  const concept = concepts.find((item) => item.chapterId === chapterId) ?? concepts[0];
  return [
    {
      subject,
      chapterId,
      chapterName: concept?.chapterName ?? `${subject} chapter ${chapterId ?? 1}`,
      topicId: concept?.topicId,
      topicName: concept?.topicName,
      questionCount: config.totalQuestions,
    },
  ] satisfies QuestionCompositionItem[];
}

function expandMissingSections(sections: BlueprintSection[]) {
  return sections.flatMap((section) =>
    Array.from({ length: section.count }, () => ({
      ...section,
      count: 1,
      totalMarks: section.marksPerQuestion,
    })),
  );
}

function questionsMatchingSyllabusItem(
  questions: GeneratedQuestion[],
  item: QuestionCompositionItem,
) {
  return questions.filter((question) => questionMatchesSyllabusItem(question, item)).length;
}

function questionMatchesSyllabusItem(
  question: GeneratedQuestion,
  item: QuestionCompositionItem,
) {
  if (
    item.subject &&
    question.subject &&
    item.subject.trim().toLowerCase() !== question.subject.trim().toLowerCase()
  ) {
    return false;
  }
  if (item.chapterId !== undefined && question.chapterId !== item.chapterId) return false;
  if (item.topicId !== undefined && question.topicId !== item.topicId) return false;
  if (
    item.topicName &&
    question.topic &&
    item.topicName.trim().toLowerCase() !== question.topic.trim().toLowerCase()
  ) {
    return false;
  }
  return true;
}

function nextSyllabusDeficit(
  entries: Array<{ item: QuestionCompositionItem; accepted: number; added: number }>,
) {
  return entries
    .filter((entry) => entry.accepted < entry.item.questionCount)
    .sort(
      (left, right) =>
        (right.item.questionCount - right.accepted) -
        (left.item.questionCount - left.accepted),
    )[0];
}

function syllabusNearFallbackWarning(
  item: QuestionCompositionItem,
  count: number,
): SyllabusNearFallbackWarning {
  const label = item.topicName ?? item.chapterName ?? "selected coverage";
  const subject = item.subject || "Selected subject";
  return {
    type: "syllabus-near-fallback",
    reason: `${subject}: ${label} had weak/noisy source text, so ${count} question${count === 1 ? "" : "s"} were generated from chapter/topic-near syllabus coverage to preserve the requested paper count.`,
    subject,
    chapterName: item.chapterName,
    topicName: item.topicName,
    count,
  };
}

function conceptsForSyllabusItem(
  concepts: ConceptData[],
  item: QuestionCompositionItem,
) {
  const subjectMatched = concepts.filter((concept) => {
    if (!item.subject || !concept.subject) return true;
    return concept.subject.trim().toLowerCase() === item.subject.trim().toLowerCase();
  });
  if (item.topicId !== undefined) {
    const byTopic = subjectMatched.filter((concept) => concept.topicId === item.topicId);
    if (byTopic.length) return byTopic;
  }
  if (item.topicName) {
    const topicName = item.topicName.trim().toLowerCase();
    const byTopicName = subjectMatched.filter(
      (concept) => concept.topicName.trim().toLowerCase() === topicName,
    );
    if (byTopicName.length) return byTopicName;
  }
  if (item.chapterId !== undefined) {
    const byChapter = subjectMatched.filter((concept) => concept.chapterId === item.chapterId);
    if (byChapter.length) return byChapter;
  }
  return subjectMatched.length ? subjectMatched : concepts;
}

function uniqueNormalized(values: string[]) {
  return Array.from(
    new Set(values.map((value) => normalizeSourceFragment(value)).filter(Boolean)),
  );
}

function hasNoisySourceArtifact(value: string) {
  return /Unit\s+\d+\.indd|\d{2}-\d{2}-\d{4}\s+\d{1,2}:\d{2}:\d{2}|Page\s+\d+|Employability SkillS - ClaSS iX|S\s*eSSIon\s+\d+/i.test(
    value,
  );
}

function cleanSyllabusLabel(value: string) {
  return (
    value
      .replace(/\bUnit\s+\d+\.indd\b/gi, "")
      .replace(/\b\d{2}-\d{2}-\d{4}\s+\d{1,2}:\d{2}:\d{2}\b/g, "")
      .replace(/\bPage\s+\d+\b/gi, "")
      .replace(/\s+/g, " ")
      .trim() || "selected topic"
  );
}

function sourceBackedAtomTypeKey(type: QuestionType, concept: NormalizedConcept) {
  return sourceBackedUniquenessKeyFor(
    type,
    sourceBackedAtomIdForType(concept, type),
  );
}

function sourceBackedAtomIdForType(concept: NormalizedConcept, type: QuestionType) {
  return `${concept.atomId}-${type.toLowerCase()}`;
}

export function hasSourceBackedFallbackConcepts(concepts: ConceptData[]) {
  return sourceBackedConcepts(concepts).length > 0;
}

function createSourceBackedQuestion(
  type: QuestionType,
  section: BlueprintSection,
  config: PaperConfig,
  concept: NormalizedConcept,
  index: number,
  placementIndex = index,
): GeneratedQuestion {
  const variant = variantRecipeFor(index);
  const base = baseQuestion(
    type,
    concept,
    index,
    section.marksPerQuestion,
    variant,
    placementIndex,
  );
  const visibleSummary = studentVisibleSummary(concept.summary);
  const noveltyAtomId = sourceBackedAtomIdForType(concept, type);
  const sourceFocus = `${variant.sourceFocus} ${concept.atomId}: ${trimToSentence(visibleSummary, 150)} Internal angle: ${variant.id}.`;
  const answerPath = `${variant.answerPath} ${topicSentence(concept.topic)} Use internal atom ${concept.atomId} (${concept.atomLabel}) to ${variant.answerVerb} the ${concept.source === "pdf" ? "PDF" : "NCERT TXT"} idea.`;
  const difficulty = deterministicFallbackDifficultyForFormat(
    type,
    config.difficulty,
  );

  const question: GeneratedQuestion = {
    ...base,
    text: base.text ?? `Explain ${concept.topic} clearly.`,
    type,
    marks: section.marksPerQuestion,
    correctAnswer: base.correctAnswer ?? concept.summary,
    difficulty,
    bloomLevel: bloomFor(type, difficulty),
    competencyLevel: type === "MCQ" || type === "TRUE_FALSE" ? 2 : 3,
    reasoningSteps: reasoningStepsFor(difficulty),
    difficultyConfidence: 0.72,
    cognitiveComplexity: {
      conceptIntegration: complexityFor(difficulty),
      abstractionLevel: complexityFor(difficulty),
      inferenceLevel: Math.max(1, complexityFor(difficulty) - 1),
      ambiguityLevel: 1,
      cognitiveLoad: complexityFor(difficulty),
    },
    topic: concept.topic,
    chapterId: concept.chapterId,
    subject: concept.subject,
    classNum: concept.classNum,
    source: concept.source,
    noveltyAngle: `${sourceBackedCompletionMarker}:${type}:${variant.id}:${noveltyAtomId}:${index}`,
    sourceChunkFocus: sourceFocus,
    answerPath,
    explanation:
      base.explanation ||
      `The answer follows from the concept: ${visibleSummary}`,
  };

  if (concept.topicId !== undefined) question.topicId = concept.topicId;
  return question;
}

function sourceBackedQuestionForSequence(
  section: BlueprintSection,
  config: PaperConfig,
  conceptPool: NormalizedConcept[],
  sequence: number,
) {
  return sourceBackedQuestionForCursor(section, config, conceptPool, sequence);
}

function sourceBackedQuestionForCursor(
  section: BlueprintSection,
  config: PaperConfig,
  conceptPool: NormalizedConcept[],
  cursor: number,
) {
  const candidateSpace = sourceBackedCandidateSpaceSize(conceptPool);
  const normalizedSequence = positiveModulo(Math.floor(cursor), candidateSpace);
  const concept = conceptPool[normalizedSequence % conceptPool.length];
  const variantSequence = Math.floor(normalizedSequence / conceptPool.length) + 1;

  return createSourceBackedQuestion(
    section.questionType,
    section,
    config,
    concept,
    variantSequence,
    cursor,
  );
}

function sourceBackedCandidateSpaceSize(conceptPool: NormalizedConcept[]) {
  return Math.max(1, conceptPool.length * variantSlotCount());
}

function sourceBackedCursorStartForType(
  type: QuestionType,
  startIndex: number | undefined,
  candidateSpace: number,
) {
  const atomSpan = Math.max(1, Math.floor(candidateSpace / variantSlotCount()));
  const typeAtomOffset = sourceBackedTypeSeed(type) % atomSpan;
  return positiveModulo((startIndex ?? 0) + typeAtomOffset, candidateSpace);
}

export function sourceBackedTypeSeed(type: QuestionType) {
  let seed = 0;
  String(type).split("").forEach((char) => {
    seed = (seed * 33 + char.charCodeAt(0)) >>> 0;
  });
  return seed;
}

function positiveModulo(value: number, divisor: number) {
  if (!Number.isFinite(value) || divisor <= 0) return 0;
  return ((value % divisor) + divisor) % divisor;
}

function sourceBackedDeadlineReached(deadlineAt: number | undefined, minRemainingMs: number) {
  return Number.isFinite(deadlineAt) && Number(deadlineAt) - Date.now() <= minRemainingMs;
}

function baseQuestion(
  type: QuestionType,
  concept: NormalizedConcept,
  index: number,
  marks: number,
  variant: VariantRecipe,
  placementIndex = index,
): Partial<GeneratedQuestion> {
  const summary = studentVisibleSummary(concept.summary);
  const excerpt = studentVisibleSummary(concept.excerpt, 560);
  const options = conceptOptions(concept, index, variant);
  const shuffledMcq = deterministicMcqOptionShuffle(
    options,
    `source-backed:${type}:${concept.atomId}:${variant.id}:${index}`,
    placementIndex,
  );
  const idea = ideaPhrase(summary);
  const skill = visibleSkillFor(variant);
  const keyPoint = visibleKeyPoint(skill);

  switch (type) {
    case "MCQ":
      return {
        text: mcqQuestionText(skill, summary, placementIndex, concept),
        options: shuffledMcq.options,
        correctAnswer: shuffledMcq.correctAnswer,
      };
    case "ASSERTION_REASON":
      return assertionReasonQuestion(concept, summary, skill, placementIndex);
    case "TRUE_FALSE":
      return trueFalseQuestion(concept, summary, skill, placementIndex);
    case "ONE_WORD":
      return buildOneWordQuestion(summary, concept, placementIndex);
    case "FILL_BLANK":
      return buildFillBlankQuestion(summary, concept, placementIndex);
    case "VERY_SHORT":
      return {
        text: `State one ${skill} point shown by ${idea}.`,
        correctAnswer: summary,
        keyPoints: [summary],
      };
    case "MATCH_FOLLOWING":
      return matchQuestion(concept, variant, placementIndex);
    case "SHORT":
      return shortAnswerQuestion(summary, skill, placementIndex);
    case "NUMERICAL":
      return sourceBackedNumericalQuestion(concept, variant);
    case "SOURCE_BASED":
      return sourceBasedQuestion(concept, variant);
    case "CASE_BASED":
      return caseBasedQuestion(concept, variant);
    case "PARAGRAPH":
      return {
        scenario: `Read the passage below.\n${excerpt}`,
        text: `Based on the passage, explain ${idea}.`,
        correctAnswer: `${summary} The answer should refer to the passage and explain the idea in the student's own words.`,
        keyPoints: [summary, "Refer to the passage.", keyPoint],
      };
    case "HOTS":
      return {
        text: `What could be misunderstood about ${idea}? Justify your answer.`,
        correctAnswer: `The idea must be understood carefully because ${toStatement(summary)} ${keyPoint}`,
        keyPoints: [summary, "Explain the effect.", keyPoint],
      };
    case "COMPETENCY":
      return {
        text: `Use a practical example to apply ${idea} and explain your reasoning.`,
        correctAnswer: `A correct answer applies this idea: ${summary} The example should stay connected to the concept and include a clear reason.`,
        keyPoints: [summary, keyPoint, "Explain the reason."],
      };
    case "DIAGRAM":
      return {
        text: `Draw a labelled concept map for ${idea}.`,
        diagramDescription: `A concept map with the main concept at the centre and linked ${skill} points around it.`,
        correctAnswer: `The diagram should include this key idea: ${summary}`,
        keyPoints: [summary, keyPoint, "Use clear labels."],
      };
    case "PRACTICAL":
      return {
        text: `Design a simple activity or observation to show ${idea}.`,
        correctAnswer: `Use a simple activity or observation related to the concept. The final observation should show: ${summary}`,
        keyPoints: ["Aim", "Procedure", keyPoint, "Conclusion"],
      };
    case "LONG":
      return {
        text: `Write a detailed answer explaining ${idea}.`,
        correctAnswer: `Introduction: State the main concept. Explanation: ${summary} Add supporting points, connect them logically, and conclude with why this idea matters.`,
        keyPoints: ["Introduce the idea.", summary, keyPoint, "Conclude clearly."],
      };
    case "NCERT_FORMAT":
      return {
        text: `Give an NCERT-style answer explaining ${idea}.`,
        correctAnswer: summary,
        keyPoints: [summary, keyPoint],
      };
  }
}

function assertionReasonQuestion(
  concept: NormalizedConcept,
  summary: string,
  _skill: string,
  placementIndex: number,
): Partial<GeneratedQuestion> {
  const answer = assertionReasonAnswerFor(placementIndex);
  const cleanSummary = sentenceCase(stripFinalPunctuation(studentVisibleSummary(summary)));
  const focus = sentenceCase(matchFocusPhrase(summary));
  const topic = sentenceCase(concept.topic);
  const trueAssertionOptions = [
    `${cleanSummary}.`,
    `${focus} plays an important role in ${topic}.`,
    `Understanding ${focus.toLowerCase()} is essential for explaining the key concept in ${topic}.`,
  ];
  const trueAssertion =
    trueAssertionOptions[positiveModulo(placementIndex, trueAssertionOptions.length)] ??
    trueAssertionOptions[0];
  const cleanReason = trimToSentence(cleanSummary, 160);
  const explanatoryReason = cleanReason.endsWith(".") ? cleanReason : `${cleanReason}.`;
  const unrelatedTrueReason =
    "A clear, step-by-step explanation helps make the answer easier to follow.";
  const falseStatement = buildFalseStatement(concept, placementIndex);
  const [assertion, reason] = assertionReasonPairForAnswer(answer, {
    trueAssertion,
    explanatoryReason,
    unrelatedTrueReason,
    falseAssertion: falseStatement,
    falseReason: falseStatement,
  });

  return {
    text: `Assertion (A): ${assertion}\nReason (R): ${reason}`,
    assertion,
    reason,
    correctAnswer: answer,
    explanation: assertionReasonExplanation(answer),
  };
}

function buildOneWordQuestion(
  summary: string,
  concept: NormalizedConcept,
  placementIndex: number,
): Partial<GeneratedQuestion> {
  const term = oneWordAnswer(summary);
  const topic = sentenceCase(
    concept.topic
      .replace(/reading comprehension and inference|theme.*literary devices|vocabulary.*context/gi, "the selected topic")
      .trim() || "the concept",
  );
  const focus = mcqFocusPhrase(summary);
  const stems = [
    `Which term describes the key idea related to ${focus}?`,
    `Name the concept associated with ${focus} in this context.`,
    `What is the one-word term for the main idea in ${topic}?`,
    `Which term best names the central concept of ${focus}?`,
    `Give the technical term that refers to ${focus}.`,
  ];

  return {
    text: stems[positiveModulo(placementIndex, stems.length)] ?? stems[0],
    correctAnswer: term,
  };
}

function buildFillBlankQuestion(
  summary: string,
  concept: NormalizedConcept,
  placementIndex: number,
): Partial<GeneratedQuestion> {
  const term = oneWordAnswer(summary);
  const topic = sentenceCase(
    concept.topic
      .replace(/reading comprehension and inference|theme.*literary devices|vocabulary.*context/gi, "")
      .trim() || "the selected topic",
  );
  const focus = mcqFocusPhrase(summary);
  const stems = [
    `The key concept related to ${focus} is known as ________.`,
    `In ${topic}, the main idea about ${focus} is called ________.`,
    `________ is the term that best describes the concept of ${focus}.`,
    `The process or idea described by "${focus}" is called ________.`,
    `The concept of ${focus} belongs to the category of ________.`,
  ];

  return {
    text: stems[positiveModulo(placementIndex, stems.length)] ?? stems[0],
    correctAnswer: term,
  };
}

function buildFalseStatement(concept: NormalizedConcept, placementIndex: number): string {
  const topic = sentenceCase(concept.topic);
  const falsities = [
    `${topic} has no practical application in everyday life.`,
    `${topic} can be fully explained without considering any conditions or exceptions.`,
    `Changes in ${topic.toLowerCase()} never affect the surrounding environment.`,
    `${topic} follows the same rule regardless of the situation.`,
  ];
  return falsities[positiveModulo(placementIndex, falsities.length)] ?? falsities[0];
}

type AssertionReasonKey = "A" | "B" | "C" | "D";

function assertionReasonAnswerFor(index: number): AssertionReasonKey {
  const answers: AssertionReasonKey[] = ["A", "B", "C", "D"];
  return answers[positiveModulo(index, answers.length)] ?? "A";
}

function assertionReasonPairForAnswer(
  answer: AssertionReasonKey,
  statements: {
    trueAssertion: string;
    explanatoryReason: string;
    unrelatedTrueReason: string;
    falseAssertion: string;
    falseReason: string;
  },
): [string, string] {
  switch (answer) {
    case "B":
      return [statements.trueAssertion, statements.unrelatedTrueReason];
    case "C":
      return [statements.trueAssertion, statements.falseReason];
    case "D":
      return [statements.falseAssertion, statements.explanatoryReason];
    case "A":
    default:
      return [statements.trueAssertion, statements.explanatoryReason];
  }
}

function assertionReasonExplanation(answer: AssertionReasonKey) {
  switch (answer) {
    case "B":
      return "Both assertion and reason are true, but the reason does not explain the assertion.";
    case "C":
      return "The assertion is true, but the reason is false.";
    case "D":
      return "The assertion is false, but the reason is true.";
    case "A":
    default:
      return "Both assertion and reason are true, and the reason correctly explains the assertion.";
  }
}

function trueFalseQuestion(
  concept: NormalizedConcept,
  summary: string,
  skill: string,
  placementIndex: number,
): Partial<GeneratedQuestion> {
  const answer = positiveModulo(placementIndex, 2) === 0 ? "True" : "False";
  const statement =
    answer === "True"
      ? sourceTrueStatement(summary, skill, placementIndex)
      : sourceFalseStatement(concept, placementIndex);

  return {
    text: `True or False: ${statement}`,
    correctAnswer: answer,
  };
}

function sourceTrueStatement(
  summary: string,
  skill: string,
  placementIndex: number,
) {
  const cleanSummary = sentenceCase(stripFinalPunctuation(summary));
  const focus = mcqFocusPhrase(summary);
  const isCompleteSentence =
    cleanSummary.split(/\s+/).length >= 8 &&
    /\b(?:is|are|was|were|has|have|can|does|do|will|would|should|contains|includes|occurs|means|refers|helps|allows|prevents|causes|shows|explains|produces|forms|depends)\b/i.test(
      cleanSummary,
    ) &&
    !hasRawArtifact(cleanSummary);
  const variants = isCompleteSentence
    ? [
        `${cleanSummary}.`,
        `${sentenceCase(focus)} is an important concept in this topic.`,
        `${cleanSummary} This can be verified from the passage.`,
      ]
    : [
        `${sentenceCase(focus)} is a key idea in this topic.`,
        `${sentenceCase(focus)} can be understood by applying the concept correctly.`,
        `Understanding ${focus.toLowerCase()} is important for answering ${skill} questions.`,
      ];
  return variants[positiveModulo(placementIndex, variants.length)] ?? variants[0];
}

function hasRawArtifact(value: string): boolean {
  return /\b(?:phrase window|focused point|evidence point|inference point|grandmother unfortunately|Building Block of Life \d|Activity \d|Fig\.\s*\d)\b/i.test(
    value,
  );
}

function sourceFalseStatement(concept: NormalizedConcept, placementIndex: number) {
  const distractors = misconceptionOptions(concept, placementIndex);
  return trimToSentence(
    sentenceCase(distractors[positiveModulo(placementIndex, distractors.length)]),
    170,
  );
}

function shortAnswerQuestion(
  summary: string,
  skill: string,
  placementIndex: number,
): Partial<GeneratedQuestion> {
  const focus = mcqFocusPhrase(summary);
  const answer = shortModelAnswer(summary, skill);
  const keyPoints = [
    trimToSentence(summary, 140),
    visibleKeyPoint(skill),
    "Support the point with a relevant reason or example.",
  ];
  const stems = [
    `Explain why ${focus} matters in this context.`,
    `How does ${focus} help answer the question?`,
    `Give two points that show the importance of ${focus}.`,
    `Use an example to explain ${focus}.`,
    `Compare ${focus} with a common misunderstanding.`,
  ];

  return {
    text: stems[positiveModulo(placementIndex, stems.length)] ?? stems[0],
    correctAnswer: answer,
    keyPoints,
  };
}

function shortModelAnswer(summary: string, skill: string) {
  const cleanSummary = trimToSentence(summary, 170);
  const reason = visibleKeyPoint(skill).replace(/\.$/, "").toLowerCase();
  return `${cleanSummary} This matters because students must ${reason}. A complete answer should connect the idea with a relevant detail or example.`;
}

function sourceBackedNumericalQuestion(
  concept: NormalizedConcept,
  variant: VariantRecipe,
): Partial<GeneratedQuestion> {
  const context = `${concept.subject ?? ""} ${concept.chapter} ${concept.topic} ${concept.summary}`.toLowerCase();

  // === Physics branches (most specific first) ==============================
  if (isMotionConcept(concept, concept.summary)) {
    return motionNumericalQuestion(variant);
  }
  if (/work|energy|power|joule|kinetic|potential/.test(context)) {
    return workEnergyNumericalQuestion(variant);
  }
  if (/electric|current|voltage|resistance|ohm|circuit|series|parallel|watt|kilowatt/.test(context)) {
    return electricityNumericalQuestion(variant);
  }
  if (/sound|wave|frequency|wavelength|echo|vibration|pitch|loudness|hertz|hz/.test(context)) {
    return soundNumericalQuestion(variant);
  }
  if (/heat|temperature|specific heat|latent|calor|thermal/.test(context)) {
    return heatNumericalQuestion(variant);
  }
  if (/pressure|buoyancy|hydraulic|fluid|density|archimedes/.test(context)) {
    return pressureNumericalQuestion(variant);
  }
  if (/gravit|gravity|free fall|weight|acceleration due to gravity|gravitational/.test(context)) {
    return gravityNumericalQuestion(variant);
  }
  if (/light|reflection|mirror|ray|normal|incidence/.test(context)) {
    const angle = 20 + ((variant.firstCount + variant.secondCount) % 6) * 5;
    return {
      text: `A ray of light is incident on a plane mirror at ${angle}° from the normal. What is the angle of reflection?`,
      correctAnswer: `${angle}°`,
      keyPoints: [
        "Use the law of reflection.",
        `Angle of reflection = angle of incidence = ${angle}°.`,
        `Final answer: ${angle}°.`,
      ],
    };
  }
  if (/refraction|lens|refractive|medium|glass|prism/.test(context)) {
    const incident = 30 + (variant.firstCount % 4) * 5;
    const refracted = Math.max(10, incident - 10);
    return {
      text: `A ray enters a denser medium with angle of incidence ${incident}° and angle of refraction ${refracted}°. By how many degrees does it bend towards the normal?`,
      correctAnswer: `${incident - refracted}°`,
      keyPoints: [
        `Bending = ${incident}° - ${refracted}°.`,
        `Final answer: ${incident - refracted}° towards the normal.`,
      ],
    };
  }

  // === Chemistry branches ==================================================
  if (/mole|molar|molar mass|molecular mass|avogadro/.test(context)) {
    return molesNumericalQuestion(variant);
  }
  if (/acid|base|salt|pH|indicator|neutralization|titration/.test(context)) {
    return acidBaseNumericalQuestion(variant);
  }
  if (/periodic|group|period|element|proton|neutron|electron|nucleus|isotope|atomic number|mass number|electronic configuration|valence|valency/.test(context)) {
    return atomicStructureNumericalQuestion(variant);
  }
  if (/chemical|reaction|equation|balancing|oxidation|reduction|redox/.test(context)) {
    const leftAtoms = 2 + (variant.firstCount % 4);
    const rightAtoms = leftAtoms + 1 + (variant.secondCount % 3);
    const difference = rightAtoms - leftAtoms;
    return {
      text: `In an unbalanced chemical equation, one side has ${leftAtoms} oxygen atoms and the other side has ${rightAtoms} oxygen atoms. How many oxygen atoms must be balanced?`,
      correctAnswer: `${difference} oxygen atoms`,
      keyPoints: [
        `Compare the atoms: ${rightAtoms} - ${leftAtoms} = ${difference}.`,
        `Final answer: ${difference} oxygen atoms.`,
      ],
    };
  }
  if (/mixture|solution|solute|solvent|concentration|separation|filtration|evaporation|distillation/.test(context)) {
    const solute = 3 + (variant.firstCount % 6);
    const solvent = 25 + (variant.secondCount % 5) * 5;
    const total = solute + solvent;
    return {
      text: `A solution contains ${solute} g of solute and ${solvent} g of solvent. What is the total mass of the solution?`,
      correctAnswer: `${total} g`,
      keyPoints: [
        "Add the mass of solute and solvent.",
        `${solute} g + ${solvent} g = ${total} g.`,
        `Final answer: ${total} g.`,
      ],
    };
  }

  // === Mathematics (subject-level dispatcher with many templates) ==========
  if (isMathsConcept(concept)) {
    return mathNumericalQuestion(variant);
  }

  // === Biology ============================================================
  if (isBiologyConcept(concept)) {
    return biologyNumericalQuestion(concept, variant);
  }

  // === Economics / Commerce / Accountancy =================================
  if (/profit|loss|interest|gst|tax|depreciation|discount|share|dividend|economics|commerce|accounting|balance|invoice|cost price|selling price|markup/.test(context)) {
    return economicsNumericalQuestion(variant);
  }

  // === Geography ==========================================================
  if (/scale|distance|map|elevation|longitude|latitude|meridian|time zone|population density|climate|rainfall/.test(context)) {
    return geographyNumericalQuestion(variant);
  }

  // === Generic fallback: a real arithmetic problem, NOT a fake
  //     "source-based activity lists X key details" placeholder. The previous
  //     pattern produced obviously-fake questions that polluted numerical
  //     papers across all classes and subjects. This fallback uses variant
  //     inputs to generate a unique, solvable arithmetic task with a real
  //     numeric answer and proper units. =================================
  return genericArithmeticNumericalQuestion(variant);
}

/**
 * Generate a real physics numerical for a motion / kinematics concept. The
 * variant's `firstCount` and `secondCount` are used to vary the inputs
 * (distance, time, force, etc.) so multiple fallback questions don't all
 * produce the same answer.
 */
function motionNumericalQuestion(
  variant: VariantRecipe,
): Partial<GeneratedQuestion> {
  const template = (variant.firstCount + variant.secondCount * 3) % 5;

  if (template === 0) {
    // Distance + displacement (opposite directions)
    const d1 = 20 + (variant.firstCount % 8) * 10;
    const d2 = 10 + (variant.secondCount % 6) * 10;
    const axis = variant.firstCount % 2 === 0 ? "north" : "east";
    const opposite = variant.firstCount % 2 === 0 ? "south" : "west";
    const totalDistance = d1 + d2;
    const displacement = Math.abs(d1 - d2);
    return {
      text: `A car travels ${d1} km ${axis} and then ${d2} km ${opposite}. Calculate (i) the total distance covered, and (ii) the magnitude of the displacement.`,
      correctAnswer: `Distance = ${totalDistance} km; Displacement = ${displacement} km`,
      keyPoints: [
        `Total distance = ${d1} + ${d2} = ${totalDistance} km.`,
        `Displacement = |${d1} - ${d2}| = ${displacement} km.`,
        `Final answer: ${totalDistance} km, ${displacement} km.`,
      ],
    };
  }

  if (template === 1) {
    // Average speed (single leg, km/h)
    const distance = 60 + (variant.firstCount % 9) * 20;
    const time = 1.5 + (variant.secondCount % 5) * 0.5;
    const speed = +(distance / time).toFixed(2);
    return {
      text: `A car travels ${distance} km in ${time} hours. Calculate its average speed in km/h.`,
      correctAnswer: `${speed} km/h`,
      keyPoints: [
        `Average speed = total distance / total time.`,
        `Average speed = ${distance} / ${time} = ${speed} km/h.`,
        `Final answer: ${speed} km/h.`,
      ],
    };
  }

  if (template === 2) {
    // Two-leg journey — average speed AND average velocity
    const d1 = 100 + (variant.firstCount % 8) * 40;
    const t1 = 2 + (variant.secondCount % 4);
    const d2 = 50 + ((variant.firstCount + 1) % 6) * 30;
    const t2 = 1 + ((variant.secondCount + 1) % 3);
    const totalDistance = d1 + d2;
    const totalTime = t1 + t2;
    const displacement = Math.abs(d1 - d2);
    const averageSpeed = +(totalDistance / totalTime).toFixed(2);
    const averageVelocity = +(displacement / totalTime).toFixed(2);
    return {
      text: `A train moves ${d1} km east in ${t1} hours and then ${d2} km west in ${t2} hours. Calculate (i) the average speed for the entire journey, and (ii) the magnitude of the average velocity.`,
      correctAnswer: `Average speed = ${averageSpeed} km/h; Average velocity = ${averageVelocity} km/h`,
      keyPoints: [
        `Total distance = ${d1} + ${d2} = ${totalDistance} km.`,
        `Total time = ${t1} + ${t2} = ${totalTime} hours.`,
        `Average speed = ${totalDistance} / ${totalTime} = ${averageSpeed} km/h.`,
        `Displacement = |${d1} - ${d2}| = ${displacement} km.`,
        `Average velocity = ${displacement} / ${totalTime} = ${averageVelocity} km/h.`,
      ],
    };
  }

  if (template === 3) {
    // Acceleration
    const u = (variant.firstCount % 5) * 5;
    const v = u + 10 + (variant.secondCount % 6) * 5;
    const t = 2 + (variant.firstCount % 4);
    const a = +((v - u) / t).toFixed(2);
    return {
      text: `A car accelerates uniformly from ${u} m/s to ${v} m/s in ${t} seconds. Calculate the acceleration of the car.`,
      correctAnswer: `${a} m/s²`,
      keyPoints: [
        `Use a = (v - u) / t.`,
        `a = (${v} - ${u}) / ${t} = ${a} m/s².`,
        `Final answer: ${a} m/s².`,
      ],
    };
  }

  // Force (Newton's 2nd law)
  const f = 10 + (variant.firstCount % 8) * 5;
  const m = 2 + (variant.secondCount % 6);
  const a = +(f / m).toFixed(2);
  return {
    text: `A constant force of ${f} N is applied to a body of mass ${m} kg at rest on a frictionless surface. Calculate the acceleration produced.`,
    correctAnswer: `${a} m/s²`,
    keyPoints: [
      `Use Newton's second law: F = m × a, so a = F / m.`,
      `a = ${f} / ${m} = ${a} m/s².`,
      `Final answer: ${a} m/s².`,
    ],
  };
}

// ============================================================================
//  Physics: Work / Energy / Power
// ============================================================================
function workEnergyNumericalQuestion(
  variant: VariantRecipe,
): Partial<GeneratedQuestion> {
  const template = (variant.firstCount + variant.secondCount * 3) % 3;
  if (template === 0) {
    const f = 10 + (variant.firstCount % 8) * 5;
    const d = 2 + (variant.secondCount % 6);
    const w = f * d;
    return {
      text: `A force of ${f} N displaces a body through a distance of ${d} m in the direction of the force. Calculate the work done.`,
      correctAnswer: `${w} J`,
      keyPoints: [
        `W = F × d.`,
        `W = ${f} × ${d} = ${w} J.`,
        `Final answer: ${w} J.`,
      ],
    };
  }
  if (template === 1) {
    const m = 2 + (variant.firstCount % 8);
    const v = 5 + (variant.secondCount % 6) * 2;
    const ke = +(0.5 * m * v * v).toFixed(2);
    return {
      text: `A body of mass ${m} kg is moving with a velocity of ${v} m/s. Calculate its kinetic energy.`,
      correctAnswer: `${ke} J`,
      keyPoints: [
        `KE = ½ × m × v².`,
        `KE = ½ × ${m} × ${v}² = ½ × ${m * v * v} = ${ke} J.`,
        `Final answer: ${ke} J.`,
      ],
    };
  }
  const w = 200 + (variant.firstCount % 8) * 50;
  const t = 5 + (variant.secondCount % 6);
  const p = +(w / t).toFixed(2);
  return {
    text: `A machine does ${w} J of work in ${t} seconds. Calculate the power developed by the machine.`,
    correctAnswer: `${p} W`,
    keyPoints: [
      `P = W / t.`,
      `P = ${w} / ${t} = ${p} W.`,
      `Final answer: ${p} W.`,
    ],
  };
}

// ============================================================================
//  Physics: Electricity (Ohm's law, power, series resistance, energy)
// ============================================================================
function electricityNumericalQuestion(
  variant: VariantRecipe,
): Partial<GeneratedQuestion> {
  const template = (variant.firstCount + variant.secondCount * 3) % 4;
  if (template === 0) {
    const i = 1 + (variant.firstCount % 5);
    const r = 5 + (variant.secondCount % 8) * 2;
    const v = i * r;
    return {
      text: `A resistor of ${r} Ω carries a current of ${i} A. Calculate the potential difference across the resistor.`,
      correctAnswer: `${v} V`,
      keyPoints: [
        `Use Ohm's law: V = I × R.`,
        `V = ${i} × ${r} = ${v} V.`,
        `Final answer: ${v} V.`,
      ],
    };
  }
  if (template === 1) {
    const v = 10 + (variant.firstCount % 6) * 5;
    const i = 1 + (variant.secondCount % 5);
    const p = v * i;
    return {
      text: `An appliance works at ${v} V and draws a current of ${i} A. Calculate the electric power consumed.`,
      correctAnswer: `${p} W`,
      keyPoints: [
        `P = V × I.`,
        `P = ${v} × ${i} = ${p} W.`,
        `Final answer: ${p} W.`,
      ],
    };
  }
  if (template === 2) {
    const p = 500 + (variant.firstCount % 6) * 100;
    const t = 2 + (variant.secondCount % 6);
    const e = +(p * t / 1000).toFixed(2);
    return {
      text: `An appliance of power ${p} W is used for ${t} hours. Calculate the electrical energy consumed in kWh.`,
      correctAnswer: `${e} kWh`,
      keyPoints: [
        `E (kWh) = P (W) × t (h) / 1000.`,
        `E = ${p} × ${t} / 1000 = ${e} kWh.`,
        `Final answer: ${e} kWh.`,
      ],
    };
  }
  const r1 = 4 + (variant.firstCount % 6);
  const r2 = 6 + (variant.secondCount % 6);
  const rTotal = r1 + r2;
  return {
    text: `Two resistors of ${r1} Ω and ${r2} Ω are connected in series. Calculate the total resistance.`,
    correctAnswer: `${rTotal} Ω`,
    keyPoints: [
      `For resistors in series, R_total = R₁ + R₂.`,
      `R_total = ${r1} + ${r2} = ${rTotal} Ω.`,
      `Final answer: ${rTotal} Ω.`,
    ],
  };
}

// ============================================================================
//  Physics: Sound (wave speed, echo, frequency)
// ============================================================================
function soundNumericalQuestion(
  variant: VariantRecipe,
): Partial<GeneratedQuestion> {
  const template = (variant.firstCount + variant.secondCount * 3) % 3;
  if (template === 0) {
    const f = 200 + (variant.firstCount % 8) * 50;
    const wavelength = +(340 / f).toFixed(3);
    return {
      text: `A sound wave has a frequency of ${f} Hz. If the speed of sound in air is 340 m/s, calculate its wavelength.`,
      correctAnswer: `${wavelength} m`,
      keyPoints: [
        `Use v = f × λ, so λ = v / f.`,
        `λ = 340 / ${f} = ${wavelength} m.`,
        `Final answer: ${wavelength} m.`,
      ],
    };
  }
  if (template === 1) {
    const t = 1 + (variant.firstCount % 4);
    const distance = +((340 * t) / 2).toFixed(2);
    return {
      text: `A person claps near a cliff and hears the echo after ${t} second${t > 1 ? "s" : ""}. If the speed of sound is 340 m/s, calculate the distance of the cliff from the person.`,
      correctAnswer: `${distance} m`,
      keyPoints: [
        `The sound travels to the cliff and back, so distance = (v × t) / 2.`,
        `Distance = (340 × ${t}) / 2 = ${distance} m.`,
        `Final answer: ${distance} m.`,
      ],
    };
  }
  const tMs = 1 + (variant.firstCount % 5) * 2;
  const f = +(1000 / tMs).toFixed(2);
  return {
    text: `A sound wave has a time period of ${tMs} ms. Calculate its frequency.`,
    correctAnswer: `${f} Hz`,
    keyPoints: [
      `f = 1 / T (with T in seconds).`,
      `T = ${tMs} ms = ${tMs / 1000} s.`,
      `f = 1 / ${tMs / 1000} = ${f} Hz.`,
      `Final answer: ${f} Hz.`,
    ],
  };
}

// ============================================================================
//  Physics: Heat (specific heat, latent heat)
// ============================================================================
function heatNumericalQuestion(
  variant: VariantRecipe,
): Partial<GeneratedQuestion> {
  const template = (variant.firstCount + variant.secondCount * 3) % 2;
  if (template === 0) {
    const m = 1 + (variant.firstCount % 5);
    const deltaT = 10 + (variant.secondCount % 6) * 5;
    const q = m * 4200 * deltaT;
    return {
      text: `Calculate the heat required to raise the temperature of ${m} kg of water by ${deltaT} °C. (Specific heat capacity of water = 4200 J/(kg·°C))`,
      correctAnswer: `${q} J`,
      keyPoints: [
        `Q = m × c × ΔT.`,
        `Q = ${m} × 4200 × ${deltaT} = ${q} J.`,
        `Final answer: ${q} J.`,
      ],
    };
  }
  const m = (variant.firstCount % 5) + 1;
  const L = 334000;
  const q = m * L;
  return {
    text: `Calculate the heat required to melt ${m} kg of ice at 0 °C to water at 0 °C. (Latent heat of fusion of ice = 3.34 × 10⁵ J/kg)`,
    correctAnswer: `${q} J`,
    keyPoints: [
      `Q = m × L.`,
      `Q = ${m} × 3.34 × 10⁵ = ${q} J.`,
      `Final answer: ${q} J.`,
    ],
  };
}

// ============================================================================
//  Physics: Pressure / Density
// ============================================================================
function pressureNumericalQuestion(
  variant: VariantRecipe,
): Partial<GeneratedQuestion> {
  const template = (variant.firstCount + variant.secondCount * 3) % 2;
  if (template === 0) {
    const f = 100 + (variant.firstCount % 8) * 20;
    const a = +(0.5 + (variant.secondCount % 6) * 0.5).toFixed(2);
    const p = +(f / a).toFixed(2);
    return {
      text: `A force of ${f} N is applied on an area of ${a} m². Calculate the pressure exerted.`,
      correctAnswer: `${p} Pa`,
      keyPoints: [
        `P = F / A.`,
        `P = ${f} / ${a} = ${p} Pa.`,
        `Final answer: ${p} Pa.`,
      ],
    };
  }
  const m = 100 + (variant.firstCount % 6) * 50;
  const v = 50 + (variant.secondCount % 6) * 10;
  const rho = +(m / v).toFixed(2);
  return {
    text: `A block of mass ${m} g occupies a volume of ${v} cm³. Calculate its density.`,
    correctAnswer: `${rho} g/cm³`,
    keyPoints: [
      `ρ = m / V.`,
      `ρ = ${m} / ${v} = ${rho} g/cm³.`,
      `Final answer: ${rho} g/cm³.`,
    ],
  };
}

// ============================================================================
//  Physics: Gravity (weight, free fall)
// ============================================================================
function gravityNumericalQuestion(
  variant: VariantRecipe,
): Partial<GeneratedQuestion> {
  const template = (variant.firstCount + variant.secondCount * 3) % 2;
  if (template === 0) {
    const m = 5 + (variant.firstCount % 8) * 5;
    const w = +(m * 9.8).toFixed(2);
    return {
      text: `Calculate the weight of a body of mass ${m} kg on Earth. (Take g = 9.8 m/s²)`,
      correctAnswer: `${w} N`,
      keyPoints: [
        `W = m × g.`,
        `W = ${m} × 9.8 = ${w} N.`,
        `Final answer: ${w} N.`,
      ],
    };
  }
  const t = 2 + (variant.firstCount % 5);
  const v = +(9.8 * t).toFixed(2);
  return {
    text: `A stone is dropped from rest. Calculate its velocity after ${t} seconds. (Take g = 9.8 m/s²)`,
    correctAnswer: `${v} m/s`,
    keyPoints: [
      `Use v = u + g × t with u = 0.`,
      `v = 0 + 9.8 × ${t} = ${v} m/s.`,
      `Final answer: ${v} m/s.`,
    ],
  };
}

// ============================================================================
//  Chemistry: Mole concept
// ============================================================================
function molesNumericalQuestion(
  variant: VariantRecipe,
): Partial<GeneratedQuestion> {
  const template = (variant.firstCount + variant.secondCount * 3) % 3;
  if (template === 0) {
    const m = 18 + (variant.firstCount % 5) * 18;
    const n = +(m / 18).toFixed(2);
    return {
      text: `Calculate the number of moles in ${m} g of water (H₂O). (Molar mass of water = 18 g/mol)`,
      correctAnswer: `${n} mol`,
      keyPoints: [
        `n = m / M.`,
        `n = ${m} / 18 = ${n} mol.`,
        `Final answer: ${n} mol.`,
      ],
    };
  }
  if (template === 1) {
    const n = 1 + (variant.firstCount % 4);
    const M = 58.5;
    const m = +(n * M).toFixed(2);
    return {
      text: `Calculate the mass of ${n} mol of sodium chloride (NaCl). (Molar mass of NaCl = 58.5 g/mol)`,
      correctAnswer: `${m} g`,
      keyPoints: [
        `m = n × M.`,
        `m = ${n} × 58.5 = ${m} g.`,
        `Final answer: ${m} g.`,
      ],
    };
  }
  const n = (variant.firstCount % 4) + 1;
  const molecules = +(n * 6.022).toFixed(3);
  return {
    text: `Calculate the number of molecules in ${n} mol of a substance. (Avogadro's number = 6.022 × 10²³)`,
    correctAnswer: `${molecules} × 10²³ molecules`,
    keyPoints: [
      `N = n × Nₐ.`,
      `N = ${n} × 6.022 × 10²³ = ${molecules} × 10²³ molecules.`,
      `Final answer: ${molecules} × 10²³ molecules.`,
    ],
  };
}

// ============================================================================
//  Chemistry: Acids / Bases / Salts (pH, neutralization)
// ============================================================================
function acidBaseNumericalQuestion(
  variant: VariantRecipe,
): Partial<GeneratedQuestion> {
  const template = (variant.firstCount + variant.secondCount * 3) % 2;
  if (template === 0) {
    const exponent = 2 + (variant.firstCount % 5);
    return {
      text: `Calculate the pH of a solution whose hydrogen ion concentration is 1 × 10⁻${exponent} mol/L.`,
      correctAnswer: `${exponent}`,
      keyPoints: [
        `pH = -log[H⁺].`,
        `pH = -log(10⁻${exponent}) = ${exponent}.`,
        `Final answer: ${exponent}.`,
      ],
    };
  }
  const va = 20 + (variant.firstCount % 4) * 5;
  const ma = +(0.1 + (variant.firstCount % 3) * 0.1).toFixed(2);
  const mb = +(0.2 + (variant.secondCount % 3) * 0.1).toFixed(2);
  const vb = +((va * ma) / mb).toFixed(2);
  return {
    text: `${va} mL of an acid of molarity ${ma} M is completely neutralized by a base of molarity ${mb} M. Calculate the volume of the base required.`,
    correctAnswer: `${vb} mL`,
    keyPoints: [
      `For neutralization: V_a × M_a = V_b × M_b.`,
      `V_b = (V_a × M_a) / M_b = (${va} × ${ma}) / ${mb} = ${vb} mL.`,
      `Final answer: ${vb} mL.`,
    ],
  };
}

// ============================================================================
//  Chemistry: Atomic structure (mass number, electrons per shell)
// ============================================================================
function atomicStructureNumericalQuestion(
  variant: VariantRecipe,
): Partial<GeneratedQuestion> {
  const template = (variant.firstCount + variant.secondCount * 3) % 2;
  if (template === 0) {
    const z = 6 + (variant.firstCount % 8);
    const n = 6 + (variant.secondCount % 8);
    const a = z + n;
    return {
      text: `An atom has ${z} protons and ${n} neutrons. What is its mass number?`,
      correctAnswer: `${a}`,
      keyPoints: [
        `Mass number (A) = number of protons (Z) + number of neutrons (N).`,
        `A = ${z} + ${n} = ${a}.`,
        `Final answer: ${a}.`,
      ],
    };
  }
  const n = 1 + (variant.firstCount % 4);
  const electrons = 2 * n * n;
  return {
    text: `According to Bohr's formula, how many electrons can the nth shell of an atom hold? Calculate for n = ${n}.`,
    correctAnswer: `${electrons}`,
    keyPoints: [
      `Maximum electrons in nth shell = 2n².`,
      `For n = ${n}, electrons = 2 × ${n}² = 2 × ${n * n} = ${electrons}.`,
      `Final answer: ${electrons}.`,
    ],
  };
}

// ============================================================================
//  Mathematics (12 templates — algebra, geometry, trigonometry, statistics,
//  commercial math, mensuration, number system)
// ============================================================================
function mathNumericalQuestion(
  variant: VariantRecipe,
): Partial<GeneratedQuestion> {
  const template = (variant.firstCount + variant.secondCount * 3) % 12;

  if (template === 0) {
    const a = 2 + (variant.firstCount % 4);
    const x = 3 + (variant.secondCount % 6);
    const b = a * x + 5;
    return {
      text: `Solve for x: ${a}x + 5 = ${b}.`,
      correctAnswer: `x = ${x}`,
      keyPoints: [
        `${a}x + 5 = ${b}`,
        `${a}x = ${b - 5}`,
        `x = ${b - 5} / ${a} = ${x}`,
        `Final answer: x = ${x}.`,
      ],
    };
  }
  if (template === 1) {
    const a = 3 + (variant.firstCount % 4);
    const b = 4 + (variant.secondCount % 4);
    const c = +Math.sqrt(a * a + b * b).toFixed(2);
    return {
      text: `In a right-angled triangle, the two perpendicular sides are ${a} cm and ${b} cm. Find the length of the hypotenuse.`,
      correctAnswer: `${c} cm`,
      keyPoints: [
        `Use Pythagoras theorem: c² = a² + b².`,
        `c² = ${a}² + ${b}² = ${a * a} + ${b * b} = ${a * a + b * b}.`,
        `c = √${a * a + b * b} ≈ ${c} cm.`,
        `Final answer: ${c} cm.`,
      ],
    };
  }
  if (template === 2) {
    const l = 8 + (variant.firstCount % 8);
    const w = 5 + (variant.secondCount % 6);
    const area = l * w;
    return {
      text: `Find the area of a rectangle with length ${l} cm and breadth ${w} cm.`,
      correctAnswer: `${area} cm²`,
      keyPoints: [
        `Area of rectangle = length × breadth.`,
        `Area = ${l} × ${w} = ${area} cm².`,
        `Final answer: ${area} cm².`,
      ],
    };
  }
  if (template === 3) {
    const base = 10 + (variant.firstCount % 8);
    const height = 6 + (variant.secondCount % 6);
    const area = +((base * height) / 2).toFixed(2);
    return {
      text: `Find the area of a triangle with base ${base} cm and height ${height} cm.`,
      correctAnswer: `${area} cm²`,
      keyPoints: [
        `Area of triangle = ½ × base × height.`,
        `Area = ½ × ${base} × ${height} = ${area} cm².`,
        `Final answer: ${area} cm².`,
      ],
    };
  }
  if (template === 4) {
    const r = 7 + (variant.firstCount % 8);
    const c = +(2 * Math.PI * r).toFixed(2);
    return {
      text: `Find the circumference of a circle with radius ${r} cm. (Use π = 3.14)`,
      correctAnswer: `${c} cm`,
      keyPoints: [
        `Circumference = 2πr.`,
        `C = 2 × 3.14 × ${r} = ${c} cm.`,
        `Final answer: ${c} cm.`,
      ],
    };
  }
  if (template === 5) {
    const p = 1000 + (variant.firstCount % 8) * 500;
    const r = 4 + (variant.secondCount % 6);
    const t = 2 + (variant.firstCount % 4);
    const si = +((p * r * t) / 100).toFixed(2);
    return {
      text: `Find the simple interest on a principal of ₹${p} at ${r}% per annum for ${t} years.`,
      correctAnswer: `₹${si}`,
      keyPoints: [
        `Simple Interest = (P × R × T) / 100.`,
        `SI = (${p} × ${r} × ${t}) / 100 = ${si}.`,
        `Final answer: ₹${si}.`,
      ],
    };
  }
  if (template === 6) {
    const cp = 100 + (variant.firstCount % 8) * 20;
    const sp = cp + 20 + (variant.secondCount % 6) * 10;
    const profit = sp - cp;
    const profitPct = +((profit / cp) * 100).toFixed(2);
    return {
      text: `A trader buys an article for ₹${cp} and sells it for ₹${sp}. Find the profit percent.`,
      correctAnswer: `${profitPct}%`,
      keyPoints: [
        `Profit = SP - CP = ${sp} - ${cp} = ${profit}.`,
        `Profit % = (Profit / CP) × 100 = (${profit} / ${cp}) × 100 = ${profitPct}%.`,
        `Final answer: ${profitPct}%.`,
      ],
    };
  }
  if (template === 7) {
    const whole = 100 + (variant.firstCount % 8) * 50;
    const pct = 10 + (variant.secondCount % 8) * 5;
    const result = +((whole * pct) / 100).toFixed(2);
    return {
      text: `Find ${pct}% of ${whole}.`,
      correctAnswer: `${result}`,
      keyPoints: [
        `${pct}% of ${whole} = (${pct} / 100) × ${whole}.`,
        `= (${pct * whole}) / 100 = ${result}.`,
        `Final answer: ${result}.`,
      ],
    };
  }
  if (template === 8) {
    const a = 10 + (variant.firstCount % 8);
    const b = 12 + (variant.secondCount % 6);
    const c = 8 + ((variant.firstCount + variant.secondCount) % 8);
    const mean = +((a + b + c) / 3).toFixed(2);
    return {
      text: `Find the mean of the numbers ${a}, ${b}, and ${c}.`,
      correctAnswer: `${mean}`,
      keyPoints: [
        `Mean = (sum of all observations) / (number of observations).`,
        `Mean = (${a} + ${b} + ${c}) / 3 = ${a + b + c} / 3 = ${mean}.`,
        `Final answer: ${mean}.`,
      ],
    };
  }
  if (template === 9) {
    const l = 5 + (variant.firstCount % 6);
    const w = 4 + (variant.secondCount % 5);
    const h = 3 + ((variant.firstCount + 1) % 4);
    const v = l * w * h;
    return {
      text: `Find the volume of a cuboid with length ${l} cm, breadth ${w} cm, and height ${h} cm.`,
      correctAnswer: `${v} cm³`,
      keyPoints: [
        `Volume of cuboid = length × breadth × height.`,
        `Volume = ${l} × ${w} × ${h} = ${v} cm³.`,
        `Final answer: ${v} cm³.`,
      ],
    };
  }
  if (template === 10) {
    const trigValues = [
      { expr: "sin 30°", value: "0.5" },
      { expr: "sin 45°", value: "0.71" },
      { expr: "sin 60°", value: "0.87" },
      { expr: "cos 0°", value: "1" },
      { expr: "sin 90°", value: "1" },
      { expr: "tan 45°", value: "1" },
    ];
    const t =
      trigValues[variant.secondCount % trigValues.length] ?? trigValues[0];
    return {
      text: `Evaluate ${t.expr}.`,
      correctAnswer: `${t.value}`,
      keyPoints: [
        `${t.expr} is a standard trigonometric value.`,
        `${t.expr} = ${t.value}.`,
        `Final answer: ${t.value}.`,
      ],
    };
  }
  const a = 4 + (variant.firstCount % 4);
  const b = 6 + (variant.secondCount % 4);
  const lcm = (a * b) / gcd(a, b);
  return {
    text: `Find the LCM of ${a} and ${b}.`,
    correctAnswer: `${lcm}`,
    keyPoints: [
      `LCM = (a × b) / HCF(a, b).`,
      `HCF(${a}, ${b}) = ${gcd(a, b)}.`,
      `LCM = (${a} × ${b}) / ${gcd(a, b)} = ${lcm}.`,
      `Final answer: ${lcm}.`,
    ],
  };
}

function gcd(a: number, b: number): number {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b) {
    [a, b] = [b, a % b];
  }
  return a;
}

// ============================================================================
//  Biology (Mendelian ratios, cell magnification)
// ============================================================================
function biologyNumericalQuestion(
  concept: NormalizedConcept,
  variant: VariantRecipe,
): Partial<GeneratedQuestion> {
  const context = `${concept.subject ?? ""} ${concept.chapter} ${concept.topic} ${concept.summary}`.toLowerCase();

  if (/mendel|inherit|gene|allele|dominant|recessive|monohybrid|dihybrid|genotype|phenotype|cross/.test(context)) {
    const template = (variant.firstCount + variant.secondCount * 3) % 2;
    if (template === 0) {
      const total = 100 + (variant.firstCount % 4) * 50;
      const dominant = +(total * 0.75).toFixed(2);
      return {
        text: `In a monohybrid cross between two heterozygous parents (Tt × Tt), ${total} offspring are produced. How many will show the dominant phenotype?`,
        correctAnswer: `${dominant} (dominant phenotype)`,
        keyPoints: [
          `In a monohybrid cross (Tt × Tt), the phenotypic ratio is 3:1 (dominant : recessive).`,
          `Dominant phenotype = 3/4 of total offspring = 3/4 × ${total} = ${dominant}.`,
          `Final answer: ${dominant} offspring show the dominant phenotype.`,
        ],
      };
    }
    const total = 64 + (variant.firstCount % 4) * 16;
    const bothDominant = +(total * 9 / 16).toFixed(2);
    return {
      text: `In a dihybrid cross (RrYy × RrYy), ${total} offspring are produced. How many show both dominant traits according to the 9:3:3:1 ratio?`,
      correctAnswer: `${bothDominant}`,
      keyPoints: [
        `In a dihybrid cross, the ratio is 9:3:3:1.`,
        `Both dominant phenotype = 9/16 of total offspring.`,
        `= 9/16 × ${total} = ${bothDominant}.`,
        `Final answer: ${bothDominant}.`,
      ],
    };
  }
  if (/cell|magnif|microorganism|microscope|tissue/.test(context)) {
    const eyepiece = 10;
    const objective = 4 + (variant.firstCount % 5) * 10;
    const total = eyepiece * objective;
    return {
      text: `A compound microscope has an eyepiece of ${eyepiece}× magnification and an objective of ${objective}× magnification. Calculate the total magnification.`,
      correctAnswer: `${total}×`,
      keyPoints: [
        `Total magnification = magnification of eyepiece × magnification of objective.`,
        `Total = ${eyepiece} × ${objective} = ${total}.`,
        `Final answer: ${total}×.`,
      ],
    };
  }
  // Test cross (Tt × tt) → 1:1 ratio
  const total = 80 + (variant.firstCount % 4) * 20;
  const half = total / 2;
  return {
    text: `In a test cross (Tt × tt), ${total} offspring are produced. How many will show the recessive phenotype?`,
    correctAnswer: `${half}`,
    keyPoints: [
      `In a test cross, the ratio is 1:1 (dominant : recessive).`,
      `Recessive phenotype = 1/2 of total = ${total} / 2 = ${half}.`,
      `Final answer: ${half}.`,
    ],
  };
}

// ============================================================================
//  Economics / Commerce / Accountancy (profit/loss, SI, CI, discount)
// ============================================================================
function economicsNumericalQuestion(
  variant: VariantRecipe,
): Partial<GeneratedQuestion> {
  const template = (variant.firstCount + variant.secondCount * 3) % 4;
  if (template === 0) {
    const cp = 200 + (variant.firstCount % 8) * 50;
    const sp = cp + 30 + (variant.secondCount % 8) * 10;
    const profit = sp - cp;
    const profitPct = +((profit / cp) * 100).toFixed(2);
    return {
      text: `A shopkeeper buys an article for ₹${cp} and sells it for ₹${sp}. Find his profit percent.`,
      correctAnswer: `${profitPct}%`,
      keyPoints: [
        `Profit = SP - CP = ${sp} - ${cp} = ${profit}.`,
        `Profit % = (Profit / CP) × 100 = (${profit} / ${cp}) × 100 = ${profitPct}%.`,
        `Final answer: ${profitPct}%.`,
      ],
    };
  }
  if (template === 1) {
    const p = 5000 + (variant.firstCount % 8) * 1000;
    const r = 5 + (variant.secondCount % 6);
    const t = 2 + (variant.firstCount % 4);
    const si = +((p * r * t) / 100).toFixed(2);
    return {
      text: `Find the simple interest on ₹${p} at ${r}% per annum for ${t} years.`,
      correctAnswer: `₹${si}`,
      keyPoints: [
        `SI = (P × R × T) / 100.`,
        `SI = (${p} × ${r} × ${t}) / 100 = ${si}.`,
        `Final answer: ₹${si}.`,
      ],
    };
  }
  if (template === 2) {
    const mp = 500 + (variant.firstCount % 8) * 100;
    const discountPct = 10 + (variant.secondCount % 6) * 5;
    const discount = +((mp * discountPct) / 100).toFixed(2);
    const sp = mp - discount;
    return {
      text: `The marked price of a shirt is ₹${mp} and a discount of ${discountPct}% is offered. Find the selling price.`,
      correctAnswer: `₹${sp}`,
      keyPoints: [
        `Discount = (${discountPct} / 100) × ${mp} = ₹${discount}.`,
        `Selling Price = Marked Price - Discount = ${mp} - ${discount} = ₹${sp}.`,
        `Final answer: ₹${sp}.`,
      ],
    };
  }
  const p = 1000 + (variant.firstCount % 8) * 500;
  const r = 10;
  const t = 2;
  const amount = +(p * Math.pow(1 + r / 100, t)).toFixed(2);
  const ci = +(amount - p).toFixed(2);
  return {
    text: `Find the compound interest on ₹${p} for ${t} years at ${r}% per annum compounded annually.`,
    correctAnswer: `₹${ci}`,
    keyPoints: [
      `A = P × (1 + R/100)^T = ${p} × (1 + ${r}/100)^${t} = ₹${amount}.`,
      `CI = A - P = ${amount} - ${p} = ₹${ci}.`,
      `Final answer: ₹${ci}.`,
    ],
  };
}

// ============================================================================
//  Geography (map scale, population density)
// ============================================================================
function geographyNumericalQuestion(
  variant: VariantRecipe,
): Partial<GeneratedQuestion> {
  const template = (variant.firstCount + variant.secondCount * 3) % 2;
  if (template === 0) {
    const mapDistance = 5 + (variant.firstCount % 8);
    const scaleKm = 50 + (variant.secondCount % 6) * 50;
    const realDistance = +(mapDistance * scaleKm).toFixed(2);
    return {
      text: `On a map with a scale of 1 cm = ${scaleKm} km, two cities are ${mapDistance} cm apart. Find the actual distance between them.`,
      correctAnswer: `${realDistance} km`,
      keyPoints: [
        `Real distance = map distance × scale factor.`,
        `Real distance = ${mapDistance} cm × ${scaleKm} km = ${realDistance} km.`,
        `Final answer: ${realDistance} km.`,
      ],
    };
  }
  const population = 50000 + (variant.firstCount % 8) * 5000;
  const area = 100 + (variant.secondCount % 6) * 50;
  const density = +(population / area).toFixed(2);
  return {
    text: `A district has a population of ${population} and an area of ${area} km². Calculate the population density.`,
    correctAnswer: `${density} persons/km²`,
    keyPoints: [
      `Population density = population / area.`,
      `Density = ${population} / ${area} = ${density} persons/km².`,
      `Final answer: ${density} persons/km².`,
    ],
  };
}

// ============================================================================
//  Generic arithmetic fallback — a real calculation with proper units. This
//  replaces the old "source-based activity lists X key details" fake that
//  polluted papers across all subjects. The fallback is the LAST resort and
//  only fires when no subject-specific handler matched.
// ============================================================================
function genericArithmeticNumericalQuestion(
  variant: VariantRecipe,
): Partial<GeneratedQuestion> {
  const template = (variant.firstCount + variant.secondCount * 3) % 4;
  const a = variant.firstCount;
  const b = variant.secondCount;

  if (template === 0) {
    const result = a * b + (a - b);
    return {
      text: `Calculate the value of ${a} × ${b} + (${a} − ${b}).`,
      correctAnswer: `${result}`,
      keyPoints: [
        `First compute ${a} × ${b} = ${a * b}.`,
        `Then compute (${a} − ${b}) = ${a - b}.`,
        `Add them: ${a * b} + ${a - b} = ${result}.`,
        `Final answer: ${result}.`,
      ],
    };
  }
  if (template === 1) {
    const pct = 10 + (a % 5) * 10;
    const whole = 200 + (b % 8) * 50;
    const result = +((pct / 100) * whole).toFixed(2);
    return {
      text: `Calculate ${pct}% of ${whole}.`,
      correctAnswer: `${result}`,
      keyPoints: [
        `${pct}% of ${whole} = (${pct} / 100) × ${whole}.`,
        `= ${result}.`,
        `Final answer: ${result}.`,
      ],
    };
  }
  if (template === 2) {
    const km = 2 + (a % 6);
    const m = km * 1000;
    return {
      text: `Convert ${km} km into metres.`,
      correctAnswer: `${m} m`,
      keyPoints: [
        `1 km = 1000 m.`,
        `${km} km = ${km} × 1000 = ${m} m.`,
        `Final answer: ${m} m.`,
      ],
    };
  }
  const c = (a + b) % 10 + 5;
  const mean = +((a + b + c) / 3).toFixed(2);
  return {
    text: `Find the mean of the numbers ${a}, ${b}, and ${c}.`,
    correctAnswer: `${mean}`,
    keyPoints: [
      `Mean = (sum of all observations) / (number of observations).`,
      `Mean = (${a} + ${b} + ${c}) / 3 = ${a + b + c} / 3 = ${mean}.`,
      `Final answer: ${mean}.`,
    ],
  };
}

function sourceBasedQuestion(
  concept: NormalizedConcept,
  variant: VariantRecipe,
): Partial<GeneratedQuestion> {
  const summary = studentVisibleSummary(concept.summary);
  const excerpt = studentVisibleSummary(concept.excerpt, 560);
  const skill = visibleSkillFor(variant);
  const idea = ideaPhrase(summary);
  const subQuestions: SubQuestion[] = [
    shortSubQuestion(`What is the main ${skill} idea in the passage?`, summary, 1),
    shortSubQuestion(`What concept does the passage explain?`, summary, 1),
    shortSubQuestion(`Give one supporting point from the passage.`, excerpt, 1),
    shortSubQuestion(`Why is this idea important?`, summary, 1),
  ];

  return {
    scenario: `Read the passage below.\n${excerpt}`,
    text: `Read the passage about ${idea} and answer the ${skill} questions.`,
    subQuestions,
    correctAnswer: subQuestions
      .map((question, index) => `(${index + 1}) ${question.correctAnswer}`)
      .join("; "),
  };
}

function caseBasedQuestion(
  concept: NormalizedConcept,
  variant: VariantRecipe,
): Partial<GeneratedQuestion> {
  const summary = studentVisibleSummary(concept.summary);
  const skill = visibleSkillFor(variant);
  const idea = ideaPhrase(summary);
  const options = deterministicMcqOptionShuffle(
    conceptOptions(concept, concept.atomNumericId + 1, variant),
    `source-backed-case:${concept.atomId}:${variant.id}`,
  ).options;
  const correctAnswer = correctOptionId(options);
  // Build human-readable sub-question stems using topic, not raw idea phrase
  const topicForStem = concept.topic || concept.atomLabel || idea;
  const subQuestions: SubQuestion[] = [
    {
      text: `Which of the following correctly describes ${topicForStem}?`,
      type: "MCQ",
      options,
      correctAnswer,
      marks: 2,
    },
    {
      text: `Explain what you understand about ${topicForStem} based on the case.`,
      type: "SHORT",
      correctAnswer: summary,
      marks: 2,
    },
  ];

  return {
    scenario: `Study the following: ${summary}`,
    text: `Read the case and answer the questions below.`,
    subQuestions,
    correctAnswer: `(1) ${correctAnswer}; (2) ${summary}`,
  };
}

function matchQuestion(
  concept: NormalizedConcept,
  variant: VariantRecipe,
  placementIndex: number,
): Partial<GeneratedQuestion> {
  const summary = studentVisibleSummary(concept.summary, 140);
  const skill = visibleSkillFor(variant);
  const pairs = subjectMatchPairs(concept, summary, skill, placementIndex);
  const focus = matchFocusPhrase(summary);

  return {
    text: matchQuestionStem(skill, focus, placementIndex),
    matchPairs: pairs,
    correctAnswer: buildShuffledMatchAnswer(
      pairs,
      `source-backed:${concept.atomId}:${variant.id}:${placementIndex}`,
    ),
  };
}

function matchQuestionStem(skill: string, focus: string, placementIndex: number) {
  void skill;
  const stems = [
    `Match the terms about ${focus} with their correct descriptions.`,
    `Match each concept related to ${focus} with its meaning.`,
    `Match the examples and ideas linked to ${focus} with their explanations.`,
    `Match Column A with Column B for ${focus}.`,
  ];
  return stems[positiveModulo(placementIndex, stems.length)] ?? stems[0];
}

function shortSubQuestion(text: string, correctAnswer: string, marks: number): SubQuestion {
  return {
    text,
    type: "VERY_SHORT",
    correctAnswer: trimToSentence(correctAnswer, 180),
    marks,
  };
}

function conceptOptions(
  concept: NormalizedConcept,
  index: number,
  variant: VariantRecipe,
): MCQOption[] {
  const distractors = misconceptionOptions(concept, index);
  const correct = optionStatement(studentVisibleSummary(concept.summary), variant);

  return [
    { id: "A", text: distractors[index % distractors.length], isCorrect: false },
    { id: "B", text: correct, isCorrect: true },
    { id: "C", text: distractors[(index + 1) % distractors.length], isCorrect: false },
    { id: "D", text: distractors[(index + 2) % distractors.length], isCorrect: false },
  ];
}

function studentVisibleSummary(value: string, maxLength = 240) {
  const cleaned = removeDanglingTail(
    normalizeSourceFragment(value)
      .replace(/\b(?:the\s+)?selected\s+NCERT\s+chapter\s+(?:shows|explains|teaches|highlights|states)\s+(?:that\s+|how\s+)?/gi, "")
      .replace(/\b(?:the\s+)?selected\s+chapter\s+(?:shows|explains|teaches|highlights|states)\s+(?:that\s+|how\s+)?/gi, "")
      .replace(/\b(?:the\s+)?chapter\s+(?:shows|explains|teaches|highlights|states)\s+(?:that\s+|how\s+)?/gi, "")
      .replace(/\bselected\s+NCERT\s+chapter\b/gi, "NCERT passage")
      .replace(/\bselected\s+chapter\s+passage\b/gi, "passage")
      .replace(/\bselected\s+chapter\b/gi, "concept")
      .replace(/\b(?:the\s+)?chapter\s+(?:links|connects)\s+/gi, "the text connects ")
      .replace(/\baccording\s+to\s+the\s+chapter\b/gi, "")
      .replace(/\b(?:in|from)\s+the\s+chapter\b/gi, "")
      .replace(/\bidea\s+described\s+in\s+the\s+chapter\b/gi, "concept")
      .replace(/\bchapter\s+idea\b/gi, "concept")
      .replace(/\bchapter\s+evidence\b/gi, "supporting detail")
      .replace(/\bthis\s+exact\s+chapter\b/gi, "this concept")
      .replace(/\bsame\s+chapter\b/gi, "same topic")
      .replace(/\bquestion\s+focus\b/gi, "focus")
      .replace(/\bconcept\s+focus\b/gi, "focus")
      .replace(/\b[A-Z][a-zA-Z\s]{3,40}\s+\d{1,3}\s+[a-z]\s+(?=[A-Z])/g, "")
      .replace(/\b(?:Activity|Fig(?:ure)?|Table|Box|Example|Exercise)\s*\.?\s*\d+(?:\.\d+)*\s*[.:]?\s*/gi, "")
      // "Exercises." (plural, standalone, no trailing number) — stripped because
      // it is a textbook-section heading, not a learnable fact.
      .replace(/\bExercises?(?!\s*\d)\s*\.?\s*/gi, "")
      // Numbered prompt lists ("1. Why does...", "2. Explain the laws...") —
      // these are exercise prompts extracted from the textbook, not concept
      // statements the student can study. Strip the whole numbered sentence.
      // The terminator is optional so truncated fragments (where the sentence
      // got cut by `trimToSentence`) are also removed cleanly.
      .replace(
        /\b\d{1,3}\.\s+(?:Why|What|How|When|Where|Which|Who|Whom|Whose|Explain|Describe|Define|State|List|Name|Choose|Tick|Fill|Match|Answer|Give|Write|Discuss|Differentiate|Calculate|Find|Prove|Show|Determine|Identify|Compare|Contrast|Illustrate|Outline|Summarize|Formulate|Predict|Evaluate|Analyze|Justify|Apply|Solve|Compute|Express)\b[^.!?]*[.!?]?\s*/gi,
        "",
      )
      // "Answer the following questions." / "Answer the following."
      .replace(/\bAnswer\s+the\s+following\s+(?:questions?|parts?|items?|sub-?questions?)\.?\s*/gi, "")
      .replace(/\b\d{1,3}\s+(?:y|a|b|c)\s+/gi, " ")
      .replace(/^\d{1,3}\s+/, "")
      .replace(/\b\d+(?:\.\d+){1,3}\s*[:.-]\s*/g, "")
      .replace(/\b\d+\s+Exploration\s*[|\\\/]\s*Grade\s+\d+\b/gi, "")
      .replace(/\bExploration\s*[|\\\/]\s*Grade\s+\d+\b/gi, "")
      .replace(/\bGrade\s+\d+\b/gi, "")
      .replace(/[|\\]+/g, " ")
      .replace(/\bsurface\s+on\s+it\s+moves\b/gi, "surface on which it moves")
      .replace(/\bmore\s+slow\b/gi, "more slowly")
      .replace(/\bfig(?:ure)?\.?\s*\d+(?:\.\d+)*\s*[:.-]\s*/gi, "")
      .replace(/\bexact\s+source\s+detail\b/gi, "concept")
      .replace(/\bsource\s+detail\b/gi, "concept")
      .replace(/\bsource\s+text\b/gi, "passage")
      .replace(/\bselected[-\s]+source\b/gi, "concept")
      .replace(/\bdetail\s+lens\b/gi, "focus")
      .replace(/\bnoveltyAngle\b/gi, "question angle")
      .replace(/\bsourceChunkFocus\b/gi, "focus")
      .replace(/\banswerPath\b/gi, "reasoning path")
      .replace(/\b[a-z]+-c[a-z0-9-]*-t[a-z0-9-]*-(?:txt|pdf)-a\d+-[a-z0-9]+\b/gi, "concept")
      .replace(/\b(?:txt|pdf)-a\d+\b/gi, "concept"),
  );

  return trimToSentence(cleaned || "the concept", maxLength);
}

function ideaPhrase(summary: string, topic?: string) {
  // Use topic name when available — avoids embedding raw source fragments in student-visible text
  if (topic && topic.trim().length > 3) return topic.trim().toLowerCase();
  const idea = stripFinalPunctuation(summary);
  if (!idea) return "the concept";
  // Only use the idea phrase for short, clean summaries (no garbled raw-atom fragments)
  if (idea.length <= 60 && isCleanSentence(idea)) return `${lowerFirst(idea)}`;
  return "the concept";
}

function isCleanSentence(text: string): boolean {
  // A clean sentence has at least 3 words and no raw-fragment markers
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length < 3) return false;
  // Reject if it looks like a truncated/garbled source fragment (no verb-like word)
  const hasVerb = /\b(?:is|are|was|were|has|have|can|does|do|shows?|gives?|helps?|allows?|means?|refers?|occurs?|forms?|causes?|produces?|leads?|results?)\b/i.test(text);
  return hasVerb;
}

function mcqQuestionText(
  skill: string,
  summary: string,
  placementIndex?: number,
  concept?: NormalizedConcept,
) {
  const opticsQuestion = opticsMcqQuestion(summary, placementIndex);
  if (opticsQuestion) return opticsQuestion;

  const motionQuestion = motionMcqQuestion(summary);
  if (motionQuestion) return motionQuestion;

  // Use topic/atomLabel as the question subject — never raw source fragments
  const topicLabel = concept?.topic ?? "";
  const termLabel = concept?.atomLabel ?? concept?.topic ?? "";
  const subjectLabel = topicLabel || termLabel || "this concept";

  switch (skill) {
    case "evidence":
      return mcqStemVariant(subjectLabel, [
        `Which of the following statements about ${subjectLabel} is correct?`,
        `What is the most accurate description of ${subjectLabel}?`,
        `Which statement correctly explains ${subjectLabel}?`,
      ], placementIndex);
    case "inference":
      return mcqStemVariant(subjectLabel, [
        `What can be concluded about ${subjectLabel}?`,
        `Which statement correctly describes the role of ${subjectLabel}?`,
        `What does an understanding of ${subjectLabel} help us conclude?`,
      ], placementIndex);
    case "cause and effect":
      return mcqStemVariant(subjectLabel, [
        `What is the effect of ${subjectLabel}?`,
        `Which of the following correctly explains the cause-effect relationship involving ${subjectLabel}?`,
        `Why does ${subjectLabel} occur in this context?`,
      ], placementIndex);
    case "comparison":
      return mcqStemVariant(subjectLabel, [
        `How does ${subjectLabel} differ from the other options?`,
        `Which option correctly distinguishes ${subjectLabel} from related concepts?`,
        `Which statement correctly compares ${subjectLabel} with an alternative?`,
      ], placementIndex);
    case "application":
      return mcqStemVariant(subjectLabel, [
        `Which situation is an example of ${subjectLabel}?`,
        `Where is ${subjectLabel} most appropriately applied?`,
        `Which of the following correctly applies the concept of ${subjectLabel}?`,
      ], placementIndex);
    case "definition":
      return mcqStemVariant(subjectLabel, [
        `Which of the following best defines ${termLabel || subjectLabel}?`,
        `What is the correct meaning of ${termLabel || subjectLabel}?`,
        `Which option accurately describes the term '${termLabel || subjectLabel}'?`,
      ], placementIndex);
    case "process":
      return mcqStemVariant(subjectLabel, [
        `What is the correct sequence of steps in ${subjectLabel}?`,
        `Which option correctly describes the process of ${subjectLabel}?`,
        `How does ${subjectLabel} take place?`,
      ], placementIndex);
    case "case reasoning":
      return mcqStemVariant(subjectLabel, [
        `Which conclusion is most appropriate for a situation involving ${subjectLabel}?`,
        `In a scenario involving ${subjectLabel}, which judgment is correct?`,
        `Which answer shows correct reasoning about ${subjectLabel}?`,
      ], placementIndex);
    case "reasoning":
      return mcqStemVariant(subjectLabel, [
        `Why is ${subjectLabel} important in this context?`,
        `Which reason best explains ${subjectLabel}?`,
        `Which of the following gives the strongest explanation for ${subjectLabel}?`,
      ], placementIndex);
    case "conclusion":
      return mcqStemVariant(subjectLabel, [
        `What conclusion can be drawn about ${subjectLabel}?`,
        `Which statement best summarises ${subjectLabel}?`,
        `Which of the following is a valid conclusion about ${subjectLabel}?`,
      ], placementIndex);
    case "example":
      return mcqStemVariant(subjectLabel, [
        `Which of the following is an example of ${subjectLabel}?`,
        `Which option correctly illustrates ${subjectLabel}?`,
        `What is the best example of ${subjectLabel}?`,
      ], placementIndex);
    case "condition":
      return mcqStemVariant(subjectLabel, [
        `Which condition is necessary for ${subjectLabel}?`,
        `Under which condition does ${subjectLabel} occur?`,
        `What is required for ${subjectLabel} to take place?`,
      ], placementIndex);
    case "misconception correction":
      return mcqStemVariant(subjectLabel, [
        `Which statement about ${subjectLabel} corrects a common misconception?`,
        `What is a common misconception about ${subjectLabel}?`,
        `Which of the following statements about ${subjectLabel} is FALSE?`,
      ], placementIndex);
    case "visual representation":
      return mcqStemVariant(subjectLabel, [
        `Which diagram best represents ${subjectLabel}?`,
        `How would you correctly label ${subjectLabel} in a diagram?`,
        `Which visual correctly shows the relationship in ${subjectLabel}?`,
      ], placementIndex);
    case "quantity":
      return mcqStemVariant(subjectLabel, [
        `Which value correctly represents ${subjectLabel}?`,
        `What is the quantitative relationship involving ${subjectLabel}?`,
        `Which numerical interpretation of ${subjectLabel} is correct?`,
      ], placementIndex);
    case "passage reading":
      return mcqStemVariant(subjectLabel, [
        `Which statement about ${subjectLabel} is supported by the passage?`,
        `What does the passage tell us about ${subjectLabel}?`,
        `Which of the following correctly interprets ${subjectLabel} from the passage?`,
      ], placementIndex);
    default: {
      return mcqStemVariant(subjectLabel, [
        `Which of the following correctly describes ${subjectLabel}?`,
        `What is the most accurate statement about ${subjectLabel}?`,
        `Which option correctly explains ${subjectLabel}?`,
      ], placementIndex);
    }
  }
}

function opticsMcqQuestion(summary: string, placementIndex?: number) {
  const text = summary.toLowerCase();
  if (!/(light|reflection|refraction|mirror|lens|ray|image|normal|incidence|magnified|reduced)/i.test(text)) {
    return "";
  }

  if (/magnified|reduced|same size|object position|position of the object/.test(text)) {
    return mcqStemVariant(summary, [
      "What does the size of an image formed by a spherical mirror depend on?",
      "Which factor decides whether a spherical mirror image is magnified or diminished?",
      "How does object position affect the size of an image in a spherical mirror?",
    ], placementIndex);
  }

  if (/extended object|ray diagram|spherical mirror/.test(text)) {
    return mcqStemVariant(summary, [
      "Why are ray diagrams used to study image formation by spherical mirrors?",
      "Which statement explains the use of ray diagrams for a spherical mirror?",
      "What do ray diagrams help us determine for image formation?",
    ], placementIndex);
  }

  if (/angle of incidence|angle of reflection|normal/.test(text)) {
    return mcqStemVariant(summary, [
      "Which statement correctly applies the law of reflection?",
      "What relation between the incident ray and reflected ray is correct?",
      "Which answer correctly uses the normal in a reflection diagram?",
    ], placementIndex);
  }

  if (/convex mirror|rear.view|field of view/.test(text)) {
    return mcqStemVariant(summary, [
      "Why is a convex mirror useful as a rear-view mirror?",
      "Which image property makes a convex mirror suitable for vehicles?",
      "What advantage does a convex mirror give to a driver?",
    ], placementIndex);
  }

  if (/concave mirror|focus|real image|virtual image/.test(text)) {
    return mcqStemVariant(summary, [
      "How does object position affect image formation by a concave mirror?",
      "Which statement about concave-mirror image formation is correct?",
      "When can a concave mirror form a magnified virtual image?",
    ], placementIndex);
  }

  if (/refraction|bending|medium|denser|rarer/.test(text)) {
    return mcqStemVariant(summary, [
      "Why does a light ray bend when it passes from one medium to another?",
      "Which explanation correctly describes refraction of light?",
      "What causes the direction of a light ray to change at a boundary?",
      "How is refraction related to a change in the speed of light?",
      "Which statement correctly compares the incident ray and refracted ray?",
      "What should be checked to decide whether light bends towards the normal?",
    ], placementIndex);
  }

  if (/convex lens|converge|principal focus/.test(text)) {
    return mcqStemVariant(summary, [
      "Which statement correctly describes the action of a convex lens?",
      "What happens to parallel rays passing through a convex lens?",
      "Which answer identifies the principal focus of a convex lens?",
    ], placementIndex);
  }

  return mcqStemVariant(summary, [
    "Which statement correctly explains the selected concept from light, reflection, and refraction?",
    "Which option best connects the ray diagram with the optical concept?",
    "What conclusion follows from the selected light-ray behaviour?",
    "Which choice correctly applies the optics concept in the question?",
    "Which statement uses the mirror or lens rule correctly?",
    "What does the selected optical observation show?",
  ], placementIndex);
}

function isReadableFocus(focus: string): boolean {
  const words = focus.split(/\s+/).filter(Boolean);
  return (
    words.length <= 5 &&
    words.every((word) => word.length >= 3) &&
    !/\d{2,}/.test(focus)
  );
}

function mcqStemVariant(
  seed: string,
  stems: string[],
  placementIndex?: number,
) {
  const index = Number.isFinite(placementIndex)
    ? positiveModulo(Number(placementIndex), stems.length)
    : stableTextIndex(seed, stems.length);
  return stems[index] ?? stems[0];
}

function stableTextIndex(value: string, modulo: number) {
  if (modulo <= 0) return 0;
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash % modulo;
}

function mcqFocusPhrase(summary: string) {
  const words = distinctiveSourceWords(summary);
  const phrase = uniqueInOrder([...words.slice(0, 3), ...words.slice(-3)]).join(" ");
  return phrase || oneWordAnswer(summary).toLowerCase();
}

function motionMcqQuestion(summary: string) {
  const text = summary.toLowerCase();
  if (!/(friction|force|motion|velocity|surface|coins?|thought experiment)/i.test(text)) {
    return "";
  }

  if (text.includes("thought experiment")) {
    return "Why is a thought experiment useful when real experimental conditions are difficult to recreate?";
  }

  if (
    text.includes("stack of coins") &&
    (text.includes("smaller") || text.includes("larger distance") || text.includes("travels"))
  ) {
    return "Which statement correctly explains why the stack of coins travels farther when friction is smaller?";
  }

  if (text.includes("surface") && /smooth|rough|friction/.test(text)) {
    return "Which statement correctly explains how surface smoothness affects friction?";
  }

  if (text.includes("velocity") && text.includes("decrease")) {
    return "Why does the velocity of the stack of coins decrease as it moves?";
  }

  if (text.includes("friction")) {
    return "Which statement correctly explains how friction affects motion?";
  }

  return "";
}

function optionStatement(summary: string, _variant: VariantRecipe) {
  const base = stripFinalPunctuation(
    trimToSentence(sentenceCase(toStatement(summary)), 160),
  );
  return base;
}

function optionReasonForVariant(_variant: VariantRecipe) {
  // Previously this returned generic meta-commentary strings like
  // "This gives a supporting reason." / "This links the cause with the effect."
  // which were flagged as forbidden student-visible artifacts.
  // Now returns empty string — the caller (optionStatement) builds real content from the summary.
  return "";
}

function subjectMatchPairs(
  concept: NormalizedConcept,
  summary: string,
  skill: string,
  placementIndex: number,
): Array<{ left: string; right: string }> {
  if (isOpticsConcept(concept, summary)) {
    return buildOpticsMatchPairs(concept, summary, placementIndex);
  }

  if (isMotionConcept(concept, summary)) {
    return selectMatchPairs([
      { left: "Smooth surface", right: "Less friction, object travels farther" },
      { left: "Rough surface", right: "More friction, object slows down faster" },
      { left: "Smaller frictional force", right: "Object travels a greater distance" },
      { left: "Thought experiment", right: "Used when real conditions are difficult to recreate" },
      { left: "Larger frictional force", right: "Object loses speed more quickly" },
      { left: "Contact force", right: "Force that acts when surfaces touch" },
      { left: "Velocity decrease", right: "Object slows as friction opposes motion" },
      { left: "Surface condition", right: "Factor that changes the amount of friction" },
    ], placementIndex);
  }

  if (isCommunicationConcept(concept, summary)) {
    return selectMatchPairs([
      { left: "Sender", right: "Creates and transmits the message" },
      { left: "Receiver", right: "Understands and responds to the message" },
      { left: "Channel", right: "Medium used to carry the message" },
      { left: "Feedback", right: "Response that confirms the message was understood" },
      { left: "Message", right: "Information or idea being communicated" },
      { left: "Barrier", right: "Obstacle that disturbs clear communication" },
      { left: "Active listening", right: "Listening carefully and responding appropriately" },
      { left: "Clarity", right: "Using specific words so the receiver understands" },
    ], placementIndex);
  }

  if (isLanguageConcept(concept, summary)) {
    return selectMatchPairs([
      { left: "Passage main idea", right: "Central point or argument of a passage" },
      { left: "Supporting passage detail", right: "Information that explains or proves the main idea" },
      { left: "Context clue", right: "Nearby words that guide the meaning of an unfamiliar word" },
      { left: "Supported inference", right: "Conclusion drawn from clues in the passage" },
      { left: "Tone", right: "Writer's attitude shown through word choice" },
      { left: "Theme", right: "Central message developed in a text" },
      { left: "Character motive", right: "Reason behind a character's action" },
      { left: "Vocabulary in context", right: "Meaning decided from surrounding words" },
    ], placementIndex);
  }

  if (isChemistryConcept(concept)) {
    return buildChemistryMatchPairs(concept, summary, placementIndex);
  }

  if (isBiologyConcept(concept)) {
    return buildBiologyMatchPairs(concept, summary, placementIndex);
  }

  if (isMathsConcept(concept)) {
    return buildMathsMatchPairs(concept, summary, placementIndex);
  }

  return buildGenericAcademicMatchPairs(concept, summary, skill, placementIndex);
}

function buildOpticsMatchPairs(
  concept: NormalizedConcept,
  summary: string,
  placementIndex: number,
): Array<{ left: string; right: string }> {
  const text = `${concept.chapter} ${concept.topic} ${summary}`.toLowerCase();
  if (/mirror|image|reflection/.test(text)) {
    return selectMatchPairs([
      { left: "Incident ray", right: "Ray of light that strikes a reflecting surface" },
      { left: "Reflected ray", right: "Ray that returns from the mirror after reflection" },
      { left: "Normal", right: "Perpendicular line drawn at the point of incidence" },
      { left: "Concave mirror", right: "Mirror that can form magnified images for nearby objects" },
      { left: "Convex mirror", right: "Mirror that forms a diminished erect image" },
      { left: "Real image", right: "Image that can be obtained on a screen" },
      { left: "Virtual image", right: "Image that appears behind a mirror or lens" },
      { left: "Principal focus", right: "Point where reflected rays meet or appear to meet" },
    ], placementIndex);
  }

  if (/refraction|lens|medium/.test(text)) {
    return selectMatchPairs([
      { left: "Refraction", right: "Bending of light when it enters another medium" },
      { left: "Denser medium", right: "Medium in which light travels more slowly" },
      { left: "Convex lens", right: "Lens that converges parallel rays toward a focus" },
      { left: "Principal focus", right: "Point where parallel rays meet after refraction" },
      { left: "Concave lens", right: "Lens that diverges parallel rays" },
      { left: "Refractive index", right: "Measure of how much a medium slows light" },
      { left: "Rarer medium", right: "Medium in which light travels faster" },
      { left: "Emergent ray", right: "Ray that comes out after refraction" },
    ], placementIndex);
  }

  return selectMatchPairs([
    { left: "Reflection", right: "Bouncing back of light from a surface" },
    { left: "Refraction", right: "Bending of light at a boundary between media" },
    { left: "Real image", right: "Image that can be obtained on a screen" },
    { left: "Virtual image", right: "Image that appears to form behind a mirror or lens" },
    { left: "Incident ray", right: "Ray that approaches a surface or boundary" },
    { left: "Normal", right: "Reference line perpendicular to the surface" },
    { left: "Convex lens", right: "Lens that converges light rays" },
    { left: "Convex mirror", right: "Mirror that gives a wider field of view" },
  ], placementIndex);
}

function buildChemistryMatchPairs(
  concept: NormalizedConcept,
  summary: string,
  placementIndex: number,
): Array<{ left: string; right: string }> {
  const context = `${concept.chapter} ${concept.topic} ${summary}`.toLowerCase();
  if (/reaction|equation|oxidation|reduction|displacement|decomposition|combination/.test(context)) {
    return selectMatchPairs([
      { left: "Reactants", right: "Substances present before a chemical reaction" },
      { left: "Products", right: "Substances formed after a chemical reaction" },
      { left: "Balanced equation", right: "Equation with equal atoms of each element on both sides" },
      { left: "Decomposition", right: "Reaction in which one compound breaks into simpler products" },
      { left: "Combination reaction", right: "Reaction in which reactants form one product" },
      { left: "Displacement reaction", right: "Reaction where a more reactive element replaces another" },
      { left: "Oxidation", right: "Gain of oxygen or loss of electrons" },
      { left: "Reduction", right: "Loss of oxygen or gain of electrons" },
    ], placementIndex);
  }

  const words = distinctiveSourceWords(summary);
  const term1 = sentenceCase(words[0] || concept.topic);
  const term2 = sentenceCase(words[1] || "solute");
  const term3 = sentenceCase(words[2] || "solvent");
  return selectMatchPairs([
    { left: "Mixture", right: "Combination of two or more substances not chemically combined" },
    { left: term1, right: trimToSentence(summary, 90) },
    { left: term2, right: `Substance dissolved in ${term3.toLowerCase()} to form a solution` },
    { left: "Solubility", right: "Maximum amount of solute that can dissolve in a fixed amount of solvent" },
    { left: "Solution", right: "Homogeneous mixture of solute and solvent" },
    { left: "Solvent", right: "Substance that dissolves the solute" },
    { left: "Saturated solution", right: "Solution that cannot dissolve more solute at that temperature" },
    { left: "Separation", right: "Process used to obtain useful components from a mixture" },
  ], placementIndex);
}

function buildBiologyMatchPairs(
  concept: NormalizedConcept,
  summary: string,
  placementIndex: number,
): Array<{ left: string; right: string }> {
  const words = distinctiveSourceWords(summary);
  const term1 = sentenceCase(words[0] || concept.topic || "Cell wall");
  const term2 = sentenceCase(words[1] || "Cell membrane");
  return selectMatchPairs([
    { left: term1, right: trimToSentence(summary, 90) },
    { left: term2, right: "Flexible boundary controlling what enters and exits the cell" },
    { left: "Nucleus", right: "Controls cell activities and contains genetic material" },
    { left: "Cytoplasm", right: "Jelly-like fluid filling the cell where metabolic reactions occur" },
    { left: "Cell wall", right: "Rigid outer layer that supports a plant cell" },
    { left: "Mitochondria", right: "Organelles that release energy during respiration" },
    { left: "Chloroplast", right: "Organelle that contains chlorophyll for photosynthesis" },
    { left: "Vacuole", right: "Storage space for water, food, or wastes" },
  ], placementIndex);
}

function buildMathsMatchPairs(
  concept: NormalizedConcept,
  summary: string,
  placementIndex: number,
): Array<{ left: string; right: string }> {
  const words = distinctiveSourceWords(summary);
  const term1 = sentenceCase(words[0] || concept.topic);
  return selectMatchPairs([
    { left: term1, right: trimToSentence(summary, 90) },
    { left: "Formula", right: "Mathematical rule expressed using symbols and numbers" },
    { left: "Variable", right: "A symbol representing an unknown or changing quantity" },
    { left: "Result", right: "The final answer obtained by applying the formula or rule" },
    { left: "Coefficient", right: "Number multiplying a variable or term" },
    { left: "Equation", right: "Statement showing two expressions are equal" },
    { left: "Substitution", right: "Replacing a variable with a given value" },
    { left: "Verification", right: "Checking whether the result satisfies the condition" },
  ], placementIndex);
}

function buildGenericAcademicMatchPairs(
  concept: NormalizedConcept,
  summary: string,
  _skill: string,
  placementIndex: number,
): Array<{ left: string; right: string }> {
  const words = distinctiveSourceWords(summary);
  const topic = concept.topic;
  const term1 = sentenceCase(words[0] || topic);
  const term2 = sentenceCase(words[1] || "Key term");
  const term3 = sentenceCase(words[2] || "Example");
  const shortSummary = trimToSentence(summary, 90);

  return selectMatchPairs([
    { left: term1, right: shortSummary },
    { left: `${term2} definition`, right: `The precise meaning of ${term2.toLowerCase()} in this context` },
    { left: `${term3} application`, right: `A real situation where ${term3.toLowerCase()} is used` },
    { left: `${topic} importance`, right: `Why ${topic.toLowerCase()} matters in this topic` },
    { left: `${topic} condition`, right: `Rule or condition that controls the answer` },
    { left: `${term1} example`, right: `Specific example linked to ${term1.toLowerCase()}` },
    { left: `${term2} misconception`, right: `Incorrect idea that should be avoided` },
    { left: `${term3} conclusion`, right: `Final point supported by the concept` },
  ], placementIndex);
}

function selectMatchPairs(
  pool: Array<{ left: string; right: string }>,
  placementIndex: number,
) {
  if (pool.length <= 4) return pool;
  const offset = positiveModulo(placementIndex, pool.length);
  return Array.from({ length: 4 }, (_, index) => pool[(offset + index) % pool.length]);
}

function matchFocusPhrase(summary: string) {
  return keyPhrase(summary).split(/\s+/).slice(0, 4).join(" ") || oneWordAnswer(summary);
}

function isMotionConcept(concept: NormalizedConcept, summary: string) {
  const subject = `${concept.subject ?? ""} ${concept.chapter} ${summary}`.toLowerCase();
  return (
    subject.includes("force") ||
    subject.includes("motion") ||
    subject.includes("friction") ||
    subject.includes("surface") ||
    subject.includes("coins")
  );
}

function isOpticsConcept(concept: NormalizedConcept, summary: string) {
  return /light|reflection|refraction|mirror|lens|ray|image|normal|incidence|focus/i.test(
    `${concept.subject ?? ""} ${concept.chapter} ${concept.topic} ${summary}`,
  );
}

function isCommunicationConcept(concept: NormalizedConcept, summary: string) {
  return /communication|sender|receiver|message|channel|feedback|verbal|non-verbal/i.test(
    `${concept.subject ?? ""} ${concept.chapter} ${concept.topic} ${summary}`,
  );
}

function isLanguageConcept(concept: NormalizedConcept, summary: string) {
  return /english|language|reading|meaning|passage|dialogue|vocabulary|context|inference/i.test(
    `${concept.subject ?? ""} ${concept.chapter} ${concept.topic} ${summary}`,
  );
}

function isChemistryConcept(concept: NormalizedConcept): boolean {
  const text = `${concept.subject ?? ""} ${concept.chapter} ${concept.topic}`.toLowerCase();
  return /chemistry|mixture|solution|compound|element|reaction|acid|base|salt|solubility|separati/i.test(
    text,
  );
}

function isBiologyConcept(concept: NormalizedConcept): boolean {
  const text = `${concept.subject ?? ""} ${concept.chapter} ${concept.topic}`.toLowerCase();
  return /biology|cell|tissue|organ|organism|photosynthesis|respiration|dna|chromosome|membrane|nucleus/i.test(
    text,
  );
}

function isMathsConcept(concept: NormalizedConcept): boolean {
  const text = `${concept.subject ?? ""} ${concept.chapter} ${concept.topic}`.toLowerCase();
  return /math|algebra|geometry|trigonometry|polynomial|equation|theorem|proof|formula/i.test(
    text,
  );
}

function toStatement(summary: string) {
  const statement = stripFinalPunctuation(summary);
  return `${lowerFirst(statement)}.`;
}

function sentenceCase(value: string) {
  const trimmed = value.trim();
  return trimmed ? `${trimmed[0].toUpperCase()}${trimmed.slice(1)}` : trimmed;
}

function stripFinalPunctuation(value: string) {
  return value.replace(/[.!?;:]+$/g, "").trim();
}

function lowerFirst(value: string) {
  return value ? `${value[0].toLowerCase()}${value.slice(1)}` : value;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function removeDanglingTail(value: string) {
  return value
    .replace(
      /\s+\b(?:suppose|because|if|when|while|which|that|therefore|however|and|or|but|with|from|using|for|to|of|in|the|a|an)\.?$/i,
      "",
    )
    .trim();
}

function visibleSkillFor(variant: VariantRecipe) {
  if (variant.id.startsWith("cause-effect")) return "cause and effect";
  if (variant.id.startsWith("assertion")) return "reasoning";
  if (variant.id.startsWith("evidence")) return "evidence";
  if (variant.id.startsWith("inference")) return "inference";
  if (variant.id.startsWith("application")) return "application";
  if (variant.id.startsWith("comparison")) return "comparison";
  if (variant.id.startsWith("example")) return "example";
  if (variant.id.startsWith("reasoning")) return "reasoning";
  if (variant.id.startsWith("conclusion")) return "conclusion";
  if (variant.id.startsWith("definition")) return "definition";
  if (variant.id.startsWith("process")) return "process";
  if (variant.id.startsWith("exception")) return "condition";
  if (variant.id.startsWith("misconception")) return "misconception correction";
  if (variant.id.startsWith("diagram")) return "visual representation";
  if (variant.id.startsWith("numerical")) return "quantity";
  if (variant.id.startsWith("case")) return "case reasoning";
  if (variant.id.startsWith("source-extract")) return "passage reading";
  return "conceptual reasoning";
}

function visibleKeyPoint(skill: string) {
  switch (skill) {
    case "cause and effect":
      return "Connect the cause with its effect clearly.";
    case "comparison":
      return "Show the similarity or difference clearly.";
    case "application":
      return "Apply the idea to a relevant situation.";
    case "inference":
      return "Explain what follows from the idea.";
    case "misconception correction":
      return "Correct the mistaken idea with a clear reason.";
    case "definition":
      return "State the meaning in clear subject language.";
    case "process":
      return "Show the order or linked steps.";
    case "condition":
      return "Mention the condition or limit involved.";
    case "visual representation":
      return "Represent the relationship with clear labels.";
    default:
      return "Connect the idea to a clear reason.";
  }
}

function mcqLeadForSkill(skill: string) {
  switch (skill) {
    case "cause and effect":
      return "Which cause-effect statement best explains";
    case "comparison":
      return "Which comparison is most accurate for";
    case "application":
      return "Which situation correctly applies";
    case "inference":
      return "What can be inferred from";
    case "misconception correction":
      return "Which statement corrects a misconception about";
    case "definition":
      return "Which meaning best fits";
    case "process":
      return "Which process is shown by";
    case "condition":
      return "Which condition or limit is most important for";
    case "visual representation":
      return "Which visual representation best shows";
    case "quantity":
      return "Which quantitative interpretation best explains";
    default:
      return "Which statement best explains";
  }
}

function misconceptionOptions(concept: NormalizedConcept, index: number) {
  const subject = `${concept.subject ?? ""} ${concept.chapter} ${concept.topic}`.toLowerCase();
  const optics = /light|reflection|refraction|mirror|lens|ray|image|normal|incidence|focus/.test(
    subject,
  );
  const scienceMotion =
    subject.includes("force") ||
    subject.includes("motion") ||
    subject.includes("friction") ||
    subject.includes("surface");
  const chemistry = subject.includes("chemistry");
  const biology = subject.includes("biology");
  const mathematics = subject.includes("mathematics") || subject.includes("math");
  const language =
    subject.includes("english") ||
    subject.includes("hindi") ||
    subject.includes("grammar");

  const distractors = optics
    ? [
        "The image formed by a mirror is always the same size for every object position.",
        "The angle of reflection is unrelated to the angle of incidence.",
        "Light never changes direction when it passes from one medium to another.",
        "A convex mirror always forms a real inverted image on a screen.",
      ]
    : scienceMotion
    ? [
        "Friction and surface conditions do not affect motion.",
        "A moving object stops only because it runs out of energy.",
        "Changing the surface always makes an object move faster.",
        "Force and motion are unrelated in this situation.",
      ]
    : chemistry
      ? [
          "The observation is only a colour change and has no chemical meaning.",
          "All substances behave the same under the same condition.",
          "The property can be decided without checking the reaction or evidence.",
          "A chemical conclusion is correct even if the observation contradicts it.",
        ]
      : biology
        ? [
            "The structure and its function are unrelated.",
            "All living processes happen in exactly the same way.",
            "The observation can be explained without considering the organism.",
            "A biological process has no conditions or stages.",
          ]
        : mathematics
          ? [
              "The result can be accepted without using the given condition.",
              "Changing the given values never changes the result.",
              "The rule works only by memorising the final answer.",
              "The relationship between the quantities is not needed.",
          ]
        : language
            ? buildLanguageDistractors(concept, index)
            : [
                "The idea can be answered without using the given condition.",
                "Only a memorised label is needed; no explanation is required.",
                "The conclusion is correct even if it does not match the described idea.",
                "The relationship between the ideas does not matter.",
              ];

  return distractors.slice(index % distractors.length).concat(distractors).slice(0, 4);
}

function buildLanguageDistractors(concept: NormalizedConcept, index: number): string[] {
  const topic = `${concept.topic} ${concept.chapter}`.toLowerCase();

  if (/comprehension|passage|reading/i.test(topic)) {
    return [
      "The passage can be summarised accurately by reading only the first sentence.",
      "The tone of a passage is unrelated to the author's message.",
      "A title gives no useful information about the passage's main idea.",
      "Every word in a passage carries equal importance for meaning.",
    ];
  }

  if (/vocabulary|word|grammar|syntax/i.test(topic)) {
    return [
      "Word meaning never changes with the surrounding context.",
      "Grammar rules are the same across all styles of writing.",
      "Synonyms always have identical meaning in every context.",
      "Punctuation does not affect the meaning of a sentence.",
    ];
  }

  if (/character|theme|tone|literary/i.test(topic)) {
    return [
      "A character's actions have no connection to the story's theme.",
      "The theme of a story is always stated directly in the first paragraph.",
      "Tone and mood refer to the same quality of a literary text.",
      "Symbols in a story are always explained by the narrator.",
    ];
  }

  if (/novel|story|prose|narrative/i.test(topic)) {
    return [
      "The setting of a story has no effect on the characters' choices.",
      "A first-person narrator always gives an unbiased account of events.",
      "The climax of a story always occurs in the final paragraph.",
      "Dialogue in a narrative is only decorative and not plot-relevant.",
    ];
  }

  const sets = [
    [
      "The author's purpose is irrelevant when reading a passage.",
      "Figurative language and literal language mean the same thing.",
      "A reader does not need to consider the audience when interpreting a text.",
      "Repetition in poetry has no effect on emphasis or meaning.",
    ],
    [
      "The structure of a paragraph has no impact on the reader's understanding.",
      "A conclusion paragraph can introduce new ideas not covered in the body.",
      "Coherence and cohesion refer to the same feature of a text.",
      "The voice of a narrator never influences the reader's perspective.",
    ],
    [
      "Similes and metaphors serve identical functions in descriptive writing.",
      "A story's conflict is always resolved before the final chapter.",
      "The point of view of a story does not affect how events are described.",
      "Foreshadowing is used only in science fiction and fantasy texts.",
    ],
  ];
  return sets[positiveModulo(index, sets.length)] ?? sets[0];
}

type NormalizedConcept = {
  summary: string;
  excerpt: string;
  topic: string;
  chapter: string;
  atomId: string;
  atomLabel: string;
  atomNumericId: number;
  topicId?: number;
  chapterId: number;
  subject?: string;
  classNum?: number;
  source: "ncert_txt" | "pdf";
};

type VariantRecipe = {
  id: string;
  label: string;
  mcqStem: string;
  optionLead: string;
  sourceFocus: string;
  sourceLead: string;
  caseLead: string;
  assertion: (topic: string) => string;
  reason: (summary: string) => string;
  trueFalseLead: string;
  shortStem: string;
  shortAnswer: string;
  paragraphLead: string;
  paragraphQuestion: string;
  hotsStem: string;
  hotsAnswer: string;
  competencyStem: string;
  diagramStem: string;
  practicalStem: string;
  longStem: string;
  ncertStem: string;
  keyPoint: string;
  explanationLead: string;
  answerPath: string;
  answerVerb: string;
  firstCount: number;
  secondCount: number;
};

type VariantLens = {
  id: string;
  label: string;
  stemFocus: string;
  optionLead: string;
  sourceFocus: string;
  contextLead: string;
  answerPath: string;
  keyPoint: string;
  answerVerb: string;
};

const variantLenses: VariantLens[] = [
  {
    id: "detail",
    label: "detail",
    stemFocus: "focus on one precise source detail",
    optionLead: "precise detail",
    sourceFocus: "Detail lens",
    contextLead: "Focus on the exact source detail before generalising.",
    answerPath: "isolate the precise detail, quote its role, and",
    keyPoint: "Name the exact source detail.",
    answerVerb: "identify",
  },
  {
    id: "support",
    label: "support",
    stemFocus: "show how the source supports the answer",
    optionLead: "supporting clue",
    sourceFocus: "Support lens",
    contextLead: "Use the source clue as support for the answer.",
    answerPath: "locate the supporting clue, link it to the answer, and",
    keyPoint: "Use a supporting clue from the source.",
    answerVerb: "support",
  },
  {
    id: "consequence",
    label: "consequence",
    stemFocus: "trace the consequence of the source idea",
    optionLead: "consequence",
    sourceFocus: "Consequence lens",
    contextLead: "Follow what the source idea leads to.",
    answerPath: "find the source idea, trace its consequence, and",
    keyPoint: "State the consequence of the source idea.",
    answerVerb: "trace",
  },
  {
    id: "example",
    label: "example",
    stemFocus: "connect the source idea to a grounded example",
    optionLead: "grounded example",
    sourceFocus: "Example lens",
    contextLead: "Use a concrete example that remains inside the selected source.",
    answerPath: "choose the source idea, build the example, and",
    keyPoint: "Give a source-grounded example.",
    answerVerb: "apply",
  },
  {
    id: "misconception",
    label: "misconception",
    stemFocus: "separate the source idea from a likely misconception",
    optionLead: "misconception check",
    sourceFocus: "Misconception lens",
    contextLead: "Avoid the tempting but unsupported reading.",
    answerPath: "spot the misconception, compare it with the source, and",
    keyPoint: "Correct a likely misconception.",
    answerVerb: "correct",
  },
  {
    id: "boundary",
    label: "boundary",
    stemFocus: "define the boundary of the source idea",
    optionLead: "boundary condition",
    sourceFocus: "Boundary lens",
    contextLead: "Show what the source idea includes and excludes.",
    answerPath: "define the boundary, separate included and excluded points, and",
    keyPoint: "Explain the boundary of the idea.",
    answerVerb: "define",
  },
  {
    id: "process-step",
    label: "process step",
    stemFocus: "identify the step or order in the source idea",
    optionLead: "process step",
    sourceFocus: "Process-step lens",
    contextLead: "Read the source idea as an ordered step.",
    answerPath: "identify the step, place it in order, and",
    keyPoint: "Use the relevant process step.",
    answerVerb: "sequence",
  },
  {
    id: "contrast",
    label: "contrast",
    stemFocus: "contrast the source idea with a nearby alternative",
    optionLead: "contrast clue",
    sourceFocus: "Contrast lens",
    contextLead: "Contrast the selected source idea with a nearby alternative.",
    answerPath: "find the source contrast, separate the alternatives, and",
    keyPoint: "Show the contrast in the source.",
    answerVerb: "contrast",
  },
];

const variantRecipes: VariantRecipe[] = [
  {
    id: "evidence",
    label: "evidence",
    mcqStem: "Which evidence-based statement best explains",
    optionLead: "Evidence from the selected source",
    sourceFocus: "Evidence focus",
    sourceLead: "This extract gives evidence from the selected source.",
    caseLead: "A learner uses source evidence to interpret this idea:",
    assertion: (topic) => `${topic} can be explained through evidence in the selected source.`,
    reason: (summary) => `The source states that ${summary}`,
    trueFalseLead: "The evidence in the selected source shows that",
    shortStem: "Explain the evidence for",
    shortAnswer: "This evidence supports the answer because it is directly tied to the selected source.",
    paragraphLead: "The paragraph highlights source evidence.",
    paragraphQuestion: "Using the evidence in the paragraph, explain",
    hotsStem: "What conclusion would become weak if the evidence for",
    hotsAnswer: "Without the evidence, the explanation would be unsupported.",
    competencyStem: "Use a classroom evidence example to apply",
    diagramStem: "Draw an evidence map for",
    practicalStem: "Design an evidence-gathering activity for",
    longStem: "Write a detailed evidence-based answer on",
    ncertStem: "Give an NCERT-style evidence answer on",
    keyPoint: "Use evidence from the selected source.",
    explanationLead: "The answer is supported by source evidence",
    answerPath: "Identify source evidence, connect it to the concept, and",
    answerVerb: "support",
    firstCount: 3,
    secondCount: 2,
  },
  {
    id: "inference",
    label: "inference",
    mcqStem: "Which inference most accurately follows from",
    optionLead: "Inference from the selected source",
    sourceFocus: "Inference focus",
    sourceLead: "This extract supports an inference from the selected source.",
    caseLead: "A learner infers meaning from this selected-source idea:",
    assertion: (topic) => `${topic} requires inference from the selected source.`,
    reason: (summary) => `The idea implies that ${summary}`,
    trueFalseLead: "A reasonable inference from the selected source is that",
    shortStem: "Infer the meaning of",
    shortAnswer: "This inference follows when the source detail is connected to the topic.",
    paragraphLead: "The paragraph invites an inference.",
    paragraphQuestion: "Using the paragraph, infer the role of",
    hotsStem: "How would an incorrect inference about",
    hotsAnswer: "A wrong inference would distort the selected-source meaning.",
    competencyStem: "Apply an inference from the selected source to",
    diagramStem: "Draw an inference chain for",
    practicalStem: "Plan an activity that helps learners infer",
    longStem: "Write a detailed inferential answer on",
    ncertStem: "Give an NCERT-style inference answer on",
    keyPoint: "Explain the inference, not only the fact.",
    explanationLead: "The answer follows by inference",
    answerPath: "Read the source detail, infer the relationship, and",
    answerVerb: "explain",
    firstCount: 4,
    secondCount: 3,
  },
  {
    id: "application",
    label: "application",
    mcqStem: "Which application best uses",
    optionLead: "Application of the selected source",
    sourceFocus: "Application focus",
    sourceLead: "This extract can be applied to a new situation.",
    caseLead: "A learner applies this selected-source idea:",
    assertion: (topic) => `${topic} can be applied beyond direct recall.`,
    reason: (summary) => `Application is possible because ${summary}`,
    trueFalseLead: "The selected source can be applied to show that",
    shortStem: "Apply the idea of",
    shortAnswer: "The application should stay within the selected-source meaning.",
    paragraphLead: "The paragraph shows how the idea may be applied.",
    paragraphQuestion: "Using the application in the paragraph, explain",
    hotsStem: "What would happen if the application of",
    hotsAnswer: "The application would fail unless the source idea is used correctly.",
    competencyStem: "Use a practical example to apply",
    diagramStem: "Draw an application flow for",
    practicalStem: "Design a short application activity for",
    longStem: "Write a detailed application-based answer on",
    ncertStem: "Give an NCERT-style application answer on",
    keyPoint: "Apply the source idea to a new but relevant situation.",
    explanationLead: "The answer applies the selected source",
    answerPath: "Choose the source idea, transfer it to the example, and",
    answerVerb: "apply",
    firstCount: 2,
    secondCount: 5,
  },
  {
    id: "comparison",
    label: "comparison",
    mcqStem: "Which comparison best clarifies",
    optionLead: "Comparison using the selected source",
    sourceFocus: "Comparison focus",
    sourceLead: "This extract helps compare related ideas.",
    caseLead: "A learner compares this source idea with a related point:",
    assertion: (topic) => `${topic} becomes clearer when compared with related source details.`,
    reason: (summary) => `The comparison is meaningful because ${summary}`,
    trueFalseLead: "A comparison from the selected source shows that",
    shortStem: "Compare the selected-source role of",
    shortAnswer: "The comparison should show both the shared idea and the difference.",
    paragraphLead: "The paragraph sets up a comparison.",
    paragraphQuestion: "Using the comparison in the paragraph, explain",
    hotsStem: "How would the comparison change if",
    hotsAnswer: "The comparison would become incomplete without the source distinction.",
    competencyStem: "Use a comparison example to explain",
    diagramStem: "Draw a comparison chart for",
    practicalStem: "Design a comparison activity for",
    longStem: "Write a detailed comparative answer on",
    ncertStem: "Give an NCERT-style comparison answer on",
    keyPoint: "Show a clear comparison using source details.",
    explanationLead: "The answer uses comparison",
    answerPath: "Identify the two linked ideas, compare them, and",
    answerVerb: "clarify",
    firstCount: 5,
    secondCount: 2,
  },
  {
    id: "cause-effect",
    label: "cause-effect",
    mcqStem: "Which cause-effect statement best explains",
    optionLead: "Cause-effect link from the selected source",
    sourceFocus: "Cause-effect focus",
    sourceLead: "This extract shows a cause-effect relationship.",
    caseLead: "A learner traces a cause-effect link in this source idea:",
    assertion: (topic) => `${topic} can be understood through a cause-effect link.`,
    reason: (summary) => `The effect follows because ${summary}`,
    trueFalseLead: "The selected source shows the cause-effect idea that",
    shortStem: "Explain the cause-effect link in",
    shortAnswer: "The answer should connect the cause to its effect in the selected source.",
    paragraphLead: "The paragraph describes a cause-effect link.",
    paragraphQuestion: "Using the cause-effect relation, explain",
    hotsStem: "What effect would follow if",
    hotsAnswer: "The effect must be justified through the selected-source relationship.",
    competencyStem: "Use a cause-effect example to explain",
    diagramStem: "Draw a cause-effect chain for",
    practicalStem: "Design a cause-effect activity for",
    longStem: "Write a detailed cause-effect answer on",
    ncertStem: "Give an NCERT-style cause-effect answer on",
    keyPoint: "Connect cause and effect clearly.",
    explanationLead: "The answer explains cause and effect",
    answerPath: "Find the cause, link the effect, and",
    answerVerb: "justify",
    firstCount: 6,
    secondCount: 3,
  },
  {
    id: "example",
    label: "example",
    mcqStem: "Which example best represents",
    optionLead: "Example grounded in the selected source",
    sourceFocus: "Example focus",
    sourceLead: "This extract can be represented through an example.",
    caseLead: "A learner builds an example from this source idea:",
    assertion: (topic) => `${topic} can be represented through a selected-source example.`,
    reason: (summary) => `The example is valid because ${summary}`,
    trueFalseLead: "An example based on the selected source shows that",
    shortStem: "Give and explain an example of",
    shortAnswer: "The example should remain grounded in the selected-source idea.",
    paragraphLead: "The paragraph develops an example.",
    paragraphQuestion: "Using the example in the paragraph, explain",
    hotsStem: "Why would a weak example of",
    hotsAnswer: "A weak example would miss the selected-source point.",
    competencyStem: "Use a real-life example to explain",
    diagramStem: "Draw an example-based concept map for",
    practicalStem: "Design an example-based activity for",
    longStem: "Write a detailed example-based answer on",
    ncertStem: "Give an NCERT-style example answer on",
    keyPoint: "Use a relevant example from the source idea.",
    explanationLead: "The answer uses a grounded example",
    answerPath: "Choose a relevant example, connect it to the topic, and",
    answerVerb: "demonstrate",
    firstCount: 2,
    secondCount: 4,
  },
  {
    id: "reasoning",
    label: "reasoning",
    mcqStem: "Which reasoning statement best explains",
    optionLead: "Reasoning from the selected source",
    sourceFocus: "Reasoning focus",
    sourceLead: "This extract requires reasoning from the selected source.",
    caseLead: "A learner reasons through this selected-source idea:",
    assertion: (topic) => `${topic} should be explained through reasoning, not memorisation alone.`,
    reason: (summary) => `The reasoning is valid because ${summary}`,
    trueFalseLead: "Reasoning from the selected source shows that",
    shortStem: "Explain the reasoning behind",
    shortAnswer: "The answer should show the reasoning path, not just the final point.",
    paragraphLead: "The paragraph presents a reasoning path.",
    paragraphQuestion: "Using this reasoning path, explain",
    hotsStem: "How would the reasoning fail if",
    hotsAnswer: "The reasoning would fail if the selected-source link is broken.",
    competencyStem: "Use stepwise reasoning to apply",
    diagramStem: "Draw a reasoning chain for",
    practicalStem: "Design a reasoning activity for",
    longStem: "Write a detailed reasoning-based answer on",
    ncertStem: "Give an NCERT-style reasoning answer on",
    keyPoint: "Show the reasoning steps clearly.",
    explanationLead: "The answer follows a reasoning path",
    answerPath: "Trace the source idea, state the reasoning, and",
    answerVerb: "conclude",
    firstCount: 4,
    secondCount: 4,
  },
  {
    id: "conclusion",
    label: "conclusion",
    mcqStem: "Which conclusion is best supported by",
    optionLead: "Conclusion supported by the selected source",
    sourceFocus: "Conclusion focus",
    sourceLead: "This extract supports a conclusion.",
    caseLead: "A learner draws a conclusion from this source idea:",
    assertion: (topic) => `${topic} supports a conclusion from the selected source.`,
    reason: (summary) => `The conclusion is supported because ${summary}`,
    trueFalseLead: "The conclusion supported by the selected source is that",
    shortStem: "Draw a conclusion about",
    shortAnswer: "The conclusion should follow directly from the selected-source detail.",
    paragraphLead: "The paragraph leads to a conclusion.",
    paragraphQuestion: "Using the paragraph, conclude the role of",
    hotsStem: "What conclusion would change if",
    hotsAnswer: "The conclusion should change only when the source reasoning changes.",
    competencyStem: "Draw a practical conclusion about",
    diagramStem: "Draw a conclusion map for",
    practicalStem: "Design an activity to reach a conclusion about",
    longStem: "Write a detailed conclusion-based answer on",
    ncertStem: "Give an NCERT-style conclusion answer on",
    keyPoint: "End with a source-supported conclusion.",
    explanationLead: "The answer draws a conclusion",
    answerPath: "Read the source idea, identify support, and",
    answerVerb: "conclude",
    firstCount: 5,
    secondCount: 4,
  },
  {
    id: "definition",
    label: "definition",
    mcqStem: "Which definition-focused statement best captures",
    optionLead: "Definition grounded in the selected source",
    sourceFocus: "Definition focus",
    sourceLead: "This extract defines or clarifies a source idea.",
    caseLead: "A learner defines a key source idea:",
    assertion: (topic) => `${topic} can be defined using selected-source clues.`,
    reason: (summary) => `The definition is supported because ${summary}`,
    trueFalseLead: "The selected source defines the idea by showing that",
    shortStem: "Define the source-supported meaning of",
    shortAnswer: "The definition should use the selected-source clue and not a generic memory answer.",
    paragraphLead: "The paragraph clarifies a definition.",
    paragraphQuestion: "Using this definition clue, explain",
    hotsStem: "Why would a generic definition of",
    hotsAnswer: "A generic definition would miss the selected-source clue.",
    competencyStem: "Use a precise definition to explain",
    diagramStem: "Draw a definition map for",
    practicalStem: "Design a definition-check activity for",
    longStem: "Write a detailed definition-focused answer on",
    ncertStem: "Give an NCERT-style definition answer on",
    keyPoint: "Define the idea using source wording and context.",
    explanationLead: "The answer defines the idea from the source",
    answerPath: "Locate the defining clue, state the meaning, and",
    answerVerb: "define",
    firstCount: 3,
    secondCount: 4,
  },
  {
    id: "process",
    label: "process",
    mcqStem: "Which process-based statement best explains",
    optionLead: "Process shown by the selected source",
    sourceFocus: "Process focus",
    sourceLead: "This extract shows a process or sequence.",
    caseLead: "A learner traces a source process:",
    assertion: (topic) => `${topic} can be understood as a process in the selected source.`,
    reason: (summary) => `The sequence is clear because ${summary}`,
    trueFalseLead: "The selected source shows the process idea that",
    shortStem: "Explain the process connected with",
    shortAnswer: "The answer should show ordered steps or linked movement in the source idea.",
    paragraphLead: "The paragraph presents a process.",
    paragraphQuestion: "Using this process, explain",
    hotsStem: "What step would fail if",
    hotsAnswer: "The process would become incomplete if the source link is skipped.",
    competencyStem: "Apply the process of",
    diagramStem: "Draw a process flow for",
    practicalStem: "Design a process activity for",
    longStem: "Write a detailed process-based answer on",
    ncertStem: "Give an NCERT-style process answer on",
    keyPoint: "Show the ordered source process.",
    explanationLead: "The answer follows the source process",
    answerPath: "Identify the first idea, connect the next step, and",
    answerVerb: "sequence",
    firstCount: 4,
    secondCount: 5,
  },
  {
    id: "exception",
    label: "exception",
    mcqStem: "Which exception-aware statement best explains",
    optionLead: "Exception handled by the selected source",
    sourceFocus: "Exception focus",
    sourceLead: "This extract helps separate the main idea from an exception.",
    caseLead: "A learner checks whether a source idea has an exception:",
    assertion: (topic) => `${topic} should be understood with its limits in mind.`,
    reason: (summary) => `The limit is visible because ${summary}`,
    trueFalseLead: "The selected source limits the idea by showing that",
    shortStem: "Explain one limit or exception related to",
    shortAnswer: "The answer should state the source idea and the condition where it changes.",
    paragraphLead: "The paragraph highlights a limit.",
    paragraphQuestion: "Using this limit, explain",
    hotsStem: "How would the answer change if the exception to",
    hotsAnswer: "The answer changes only when the source condition changes.",
    competencyStem: "Use an exception-aware example to explain",
    diagramStem: "Draw a limit-and-exception chart for",
    practicalStem: "Design an activity to test the exception in",
    longStem: "Write a detailed answer on the limits of",
    ncertStem: "Give an NCERT-style exception answer on",
    keyPoint: "Mention the condition, limit, or exception.",
    explanationLead: "The answer recognises the source limit",
    answerPath: "State the main idea, identify the limit, and",
    answerVerb: "qualify",
    firstCount: 5,
    secondCount: 3,
  },
  {
    id: "misconception",
    label: "misconception",
    mcqStem: "Which correction best removes a misconception about",
    optionLead: "Misconception corrected by the selected source",
    sourceFocus: "Misconception focus",
    sourceLead: "This extract corrects a possible misunderstanding.",
    caseLead: "A learner corrects a misunderstanding using the source:",
    assertion: (topic) => `${topic} can be misunderstood without the selected-source clue.`,
    reason: (summary) => `The correction is needed because ${summary}`,
    trueFalseLead: "A misconception corrected by the selected source is that",
    shortStem: "Correct a misconception about",
    shortAnswer: "The answer should name the mistaken idea and correct it with source support.",
    paragraphLead: "The paragraph corrects a misunderstanding.",
    paragraphQuestion: "Using this correction, explain",
    hotsStem: "What wrong conclusion would appear if",
    hotsAnswer: "The wrong conclusion is avoided by using the selected-source clue.",
    competencyStem: "Use a misconception-correction example to explain",
    diagramStem: "Draw a misconception-correction map for",
    practicalStem: "Design a misconception-check activity for",
    longStem: "Write a detailed misconception-correction answer on",
    ncertStem: "Give an NCERT-style misconception answer on",
    keyPoint: "Correct the mistaken idea with source evidence.",
    explanationLead: "The answer corrects a misconception",
    answerPath: "Name the misconception, cite the source clue, and",
    answerVerb: "correct",
    firstCount: 6,
    secondCount: 2,
  },
  {
    id: "diagram-angle",
    label: "diagram",
    mcqStem: "Which diagram-based interpretation best represents",
    optionLead: "Diagram interpretation from the selected source",
    sourceFocus: "Diagram focus",
    sourceLead: "This extract can be organised visually.",
    caseLead: "A learner turns a source idea into a visual organiser:",
    assertion: (topic) => `${topic} can be represented visually from the selected source.`,
    reason: (summary) => `The visual link is possible because ${summary}`,
    trueFalseLead: "A diagram of the selected source would show that",
    shortStem: "Describe a diagrammatic representation of",
    shortAnswer: "The answer should identify what the diagram must show and why.",
    paragraphLead: "The paragraph can be converted into a visual organiser.",
    paragraphQuestion: "Using this visual organiser, explain",
    hotsStem: "Which part of the diagram would be wrong if",
    hotsAnswer: "The diagram would be wrong if the source relationship is misplaced.",
    competencyStem: "Use a diagram-based explanation for",
    diagramStem: "Draw a labelled visual organiser for",
    practicalStem: "Design a visual sorting activity for",
    longStem: "Write a detailed diagram-supported answer on",
    ncertStem: "Give an NCERT-style diagram answer on",
    keyPoint: "Represent the source relationship visually.",
    explanationLead: "The answer organises the source visually",
    answerPath: "Identify the visual relation, label it, and",
    answerVerb: "map",
    firstCount: 3,
    secondCount: 6,
  },
  {
    id: "numerical-angle",
    label: "quantitative",
    mcqStem: "Which quantity-based interpretation best explains",
    optionLead: "Quantitative interpretation from the selected source",
    sourceFocus: "Quantitative focus",
    sourceLead: "This extract can be checked through counted or ordered points.",
    caseLead: "A learner counts linked source points:",
    assertion: (topic) => `${topic} can be checked by counting linked source points.`,
    reason: (summary) => `The counted points matter because ${summary}`,
    trueFalseLead: "A quantity-based reading of the selected source shows that",
    shortStem: "Explain the counted or ordered points in",
    shortAnswer: "The answer should connect the count or order back to the source idea.",
    paragraphLead: "The paragraph contains points that can be counted or ordered.",
    paragraphQuestion: "Using this counted structure, explain",
    hotsStem: "What would be miscounted if",
    hotsAnswer: "The count would be wrong if the source links are grouped incorrectly.",
    competencyStem: "Use a count-based example to explain",
    diagramStem: "Draw a numbered flow for",
    practicalStem: "Design a counting or sorting activity for",
    longStem: "Write a detailed quantity-supported answer on",
    ncertStem: "Give an NCERT-style quantitative answer on",
    keyPoint: "Use a counted or ordered source structure.",
    explanationLead: "The answer uses a quantitative source check",
    answerPath: "Count the linked points, compare the order, and",
    answerVerb: "calculate",
    firstCount: 7,
    secondCount: 2,
  },
  {
    id: "case-angle",
    label: "case",
    mcqStem: "Which case-based judgement best explains",
    optionLead: "Case judgement from the selected source",
    sourceFocus: "Case focus",
    sourceLead: "This extract can be used as a case for judgement.",
    caseLead: "A learner studies this source case:",
    assertion: (topic) => `${topic} can be judged through a selected-source case.`,
    reason: (summary) => `The case is valid because ${summary}`,
    trueFalseLead: "The selected-source case shows that",
    shortStem: "Explain the case-based meaning of",
    shortAnswer: "The answer should connect the case detail to the source idea.",
    paragraphLead: "The paragraph gives a case for judgement.",
    paragraphQuestion: "Using this case, explain",
    hotsStem: "How would the judgement change if the case of",
    hotsAnswer: "The judgement changes when the source case is interpreted differently.",
    competencyStem: "Use a case-based situation to explain",
    diagramStem: "Draw a case-analysis map for",
    practicalStem: "Design a case-analysis activity for",
    longStem: "Write a detailed case-based answer on",
    ncertStem: "Give an NCERT-style case answer on",
    keyPoint: "Judge the case using selected-source evidence.",
    explanationLead: "The answer uses a source case",
    answerPath: "Read the case, judge the source detail, and",
    answerVerb: "evaluate",
    firstCount: 4,
    secondCount: 6,
  },
  {
    id: "source-extract",
    label: "source-extract",
    mcqStem: "Which extract-based reading best explains",
    optionLead: "Extract-based reading from the selected source",
    sourceFocus: "Extract focus",
    sourceLead: "This extract must be read closely.",
    caseLead: "A learner reads a selected extract closely:",
    assertion: (topic) => `${topic} depends on close reading of the selected extract.`,
    reason: (summary) => `Close reading matters because ${summary}`,
    trueFalseLead: "Close reading of the selected extract shows that",
    shortStem: "Explain the extract-based point for",
    shortAnswer: "The answer should stay close to the extract and avoid outside knowledge.",
    paragraphLead: "The paragraph is an extract for close reading.",
    paragraphQuestion: "Using this extract, explain",
    hotsStem: "What would be missed if the extract for",
    hotsAnswer: "The key point would be missed without close reading of the selected extract.",
    competencyStem: "Use an extract-based response to explain",
    diagramStem: "Draw an extract-point map for",
    practicalStem: "Design a close-reading activity for",
    longStem: "Write a detailed extract-based answer on",
    ncertStem: "Give an NCERT-style extract answer on",
    keyPoint: "Use only the selected extract point.",
    explanationLead: "The answer comes from close source reading",
    answerPath: "Read the extract, isolate the clue, and",
    answerVerb: "interpret",
    firstCount: 5,
    secondCount: 5,
  },
];

export function normalizeConceptPool(
  concepts: ConceptData[],
  config: PaperConfig,
): NormalizedConcept[] {
  const pool: NormalizedConcept[] = [];
  const seenAtoms = new Set<string>();
  const selectedConcepts = sourceBackedConcepts(concepts).filter((concept) =>
    conceptMatchesSelectedCoverage(concept, config),
  );

  selectedConcepts.forEach((concept, conceptIndex) => {
    const topic = concept.topicName?.trim() || concept.chapterName || config.subject;
    const chapter = concept.chapterName || `Chapter ${concept.chapterId}`;
    const atoms = sourceAtomsForConcept(concept);

    atoms.forEach((atom, atomIndex) => {
      const atomKey = normalizeAtomKey(
        `${concept.subject ?? config.subject}:${concept.chapterId}:${concept.topicId ?? ""}:${atom.summary}`,
      );
      if (seenAtoms.has(atomKey)) return;
      seenAtoms.add(atomKey);

      const normalized: NormalizedConcept = {
        summary: atom.summary,
        excerpt: atom.excerpt,
        topic,
        chapter,
        atomId: sourceAtomId(concept, config, atom, conceptIndex, atomIndex),
        atomLabel: atom.label,
        atomNumericId: conceptIndex * 100 + atomIndex,
        chapterId: concept.chapterId,
        subject: concept.subject ?? config.subject,
        classNum: concept.classNum ?? config.classNum,
        source: concept.source === "pdf" ? "pdf" : "ncert_txt",
      };

      if (concept.topicId !== undefined) normalized.topicId = concept.topicId;
      pool.push(normalized);
    });
  });

  return pool;
}

function conceptMatchesSelectedCoverage(
  concept: ConceptData,
  config: PaperConfig,
) {
  const selectedSubjects = selectedSubjectLabels(config);
  const conceptSubject = concept.subject;
  if (
    conceptSubject &&
    selectedSubjects.length &&
    !selectedSubjects.some((subject) => labelsCompatible(subject, conceptSubject))
  ) {
    return false;
  }

  const composition = config.questionComposition ?? [];
  if (composition.length) {
    const subjectCompatibleItems = composition.filter((item) => {
      if (!item.subject || !concept.subject) return true;
      return labelsCompatible(item.subject, concept.subject);
    });
    if (!subjectCompatibleItems.length) return false;

    const hasCoverageMetadata = Boolean(
      concept.topicId !== undefined ||
        concept.chapterId !== undefined ||
        concept.topicName ||
        concept.chapterName,
    );
    if (!hasCoverageMetadata) return true;

    return subjectCompatibleItems.some((item) =>
      conceptMatchesSyllabusCoverage(concept, item),
    );
  }

  return true;
}

function conceptMatchesSyllabusCoverage(
  concept: ConceptData,
  item: QuestionCompositionItem,
) {
  const itemHasSpecificCoverage = Boolean(
    item.topicId !== undefined ||
      item.chapterId !== undefined ||
      item.topicName ||
      item.chapterName,
  );
  if (!itemHasSpecificCoverage) return true;

  if (
    item.topicId !== undefined &&
    concept.topicId !== undefined &&
    item.topicId === concept.topicId
  ) {
    return true;
  }
  if (
    item.chapterId !== undefined &&
    concept.chapterId !== undefined &&
    item.chapterId === concept.chapterId
  ) {
    return true;
  }
  if (
    item.topicName &&
    concept.topicName &&
    labelsCompatible(item.topicName, concept.topicName)
  ) {
    return true;
  }
  if (
    item.chapterName &&
    concept.chapterName &&
    labelsCompatible(item.chapterName, concept.chapterName)
  ) {
    return true;
  }

  const conceptHasSpecificCoverage = Boolean(
    concept.topicId !== undefined ||
      concept.chapterId !== undefined ||
      concept.topicName ||
      concept.chapterName,
  );
  return !conceptHasSpecificCoverage;
}

function selectedSubjectLabels(config: PaperConfig) {
  return uniqueNormalizedLabels([
    config.subject,
    ...(config.subjects ?? []),
    ...(config.subjectSelections ?? []).map((selection) => selection.subject),
    ...(config.questionComposition ?? []).map((item) => item.subject),
  ]);
}

function uniqueNormalizedLabels(values: Array<string | undefined>) {
  return Array.from(
    new Set(
      values
        .flatMap((value) => splitSubjectLabel(value ?? ""))
        .map(normalizeCoverageLabel)
        .filter(Boolean),
    ),
  );
}

function splitSubjectLabel(value: string) {
  return value
    .split(/\s*(?:\+|,|\/|&|\band\b)\s*/i)
    .map((item) => item.trim())
    .filter(Boolean);
}

function labelsCompatible(left: string, right: string) {
  const normalizedLeft = normalizeCoverageLabel(left);
  const normalizedRight = normalizeCoverageLabel(right);
  if (!normalizedLeft || !normalizedRight) return false;
  if (normalizedLeft === normalizedRight) return true;
  if (
    normalizedLeft.length >= 8 &&
    normalizedRight.length >= 8 &&
    (normalizedLeft.includes(normalizedRight) ||
      normalizedRight.includes(normalizedLeft))
  ) {
    return true;
  }

  const leftTokens = coverageTokens(normalizedLeft);
  const rightTokens = coverageTokens(normalizedRight);
  const smaller = Math.min(leftTokens.length, rightTokens.length);
  if (smaller < 2) return false;
  const overlap = leftTokens.filter((token) => rightTokens.includes(token)).length;
  return overlap / smaller >= 0.75;
}

function normalizeCoverageLabel(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function coverageTokens(value: string) {
  return value
    .split(/\s+/)
    .filter(
      (token) =>
        token.length > 2 &&
        !["and", "the", "for", "with", "chapter", "unit"].includes(token),
    );
}

function sourceAtomId(
  concept: ConceptData,
  config: PaperConfig,
  atom: { summary: string },
  conceptIndex: number,
  atomIndex: number,
) {
  const subject = slugPart(concept.subject ?? config.subject ?? "subject");
  const chapter = slugPart(String(concept.chapterId ?? conceptIndex + 1));
  const topic = slugPart(String(concept.topicId ?? "all"));
  const source = concept.source === "pdf" ? "pdf" : "txt";
  const suffix = stableAtomSuffix(atom.summary);

  return `${subject}-c${chapter}-t${topic}-${source}-a${atomIndex + 1}-${suffix}`;
}

function sourceBackedConcepts(concepts: ConceptData[]) {
  return concepts.filter((concept) => {
    const text = concept.text.replace(/\s+/g, " ").trim();
    return (
      (concept.source === "ncert_txt" || concept.source === "pdf") &&
      text.length >= 80
    );
  });
}

function trimToSentence(value: string, maxLength: number) {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) return removeDanglingTail(normalized);

  const completeSentences = normalized.match(/[^.!?]+[.!?]+/g) ?? [];
  const sentenceFit: string[] = [];
  for (const sentence of completeSentences) {
    const candidate = [...sentenceFit, sentence.trim()].join(" ");
    if (candidate.length > maxLength) break;
    sentenceFit.push(sentence.trim());
  }
  if (sentenceFit.length) {
    return removeDanglingTail(sentenceFit.join(" "));
  }

  const rawSlice = normalized.slice(0, maxLength).trim();
  const clauseBoundary = Math.max(
    rawSlice.lastIndexOf(","),
    rawSlice.lastIndexOf(";"),
    rawSlice.lastIndexOf(":"),
  );
  const clauseSlice =
    clauseBoundary >= Math.floor(maxLength * 0.45)
      ? rawSlice.slice(0, clauseBoundary).trim()
      : rawSlice;
  const sliced = clauseSlice.replace(/\s+\S*$/, "").trim() || clauseSlice;
  const complete = removeDanglingTail(sliced.replace(/[,.!?;:]+$/, ""));
  return `${complete || "concept"}.`;
}

function sourceAtomsForConcept(concept: ConceptData) {
  const rawText = concept.text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  const text = normalizeSourceFragment(rawText);
  const paragraphs = rawText
    .split(/\n\s*\n+/)
    .map(normalizeSourceFragment)
    .filter((paragraph) => paragraph.length >= 60);
  const sentences = sourceSentences(text);
  const clauses = sourceClauses(text);
  const atoms: Array<{ summary: string; excerpt: string; label: string }> = [];
  const addAtom = (value: string, labelHint = "") => {
    const fragment = normalizeSourceFragment(value);
    if (!isCleanSourceAtom(fragment, labelHint)) return;
    const summary = trimToSentence(fragment, 240);
    if (!summary || summary.length < 36) return;
    atoms.push({
      summary,
      excerpt: trimToSentence(fragment, 560),
      label: keyPhrase(summary),
    });
  };

  paragraphs.slice(0, 10).forEach((paragraph, index) =>
    addAtom(paragraph, `paragraph ${index + 1}`),
  );
  sentences.slice(0, 24).forEach((sentence, index) =>
    addAtom(sentence, `sentence ${index + 1}`),
  );
  for (let index = 0; index < Math.min(sentences.length - 1, 12); index += 1) {
    addAtom(
      `${sentences[index]} ${sentences[index + 1]}`,
      `sentence-window ${index + 1}`,
    );
  }
  for (let index = 0; index < Math.min(sentences.length - 2, 8); index += 1) {
    addAtom(
      `${sentences[index]} ${sentences[index + 1]} ${sentences[index + 2]}`,
      `paragraph-window ${index + 1}`,
    );
  }
  clauses.slice(0, 28).forEach((clause, index) => {
    addAtom(clause, `clause ${index + 1}`);
    if (isCoherentClause(clause)) {
      addAtom(sourceLensAtom(clause), `lens ${index + 1}`);
    }
  });
  for (let index = 0; index < Math.min(clauses.length - 1, 24); index += 1) {
    addAtom(`${clauses[index]} ${clauses[index + 1]}`, `clause-window ${index + 1}`);
  }
  for (let index = 0; index < Math.min(clauses.length - 2, 16); index += 1) {
    addAtom(
      `${clauses[index]} ${clauses[index + 1]} ${clauses[index + 2]}`,
      `clause-window ${index + 1}`,
    );
  }
  const words = text.split(/\s+/).filter(Boolean);
  for (let index = 0; index < Math.min(Math.max(0, words.length - 8), 48); index += 4) {
    const phrase = words.slice(index, index + 12).join(" ");
    if (isCompleteSourceThought(phrase)) {
      addAtom(phrase, `phrase-window ${index + 1}`);
    }
  }
  addAtom(text, "full-source");

  const seen = new Set<string>();
  return atoms
    .filter((atom) => {
      const key = normalizeAtomKey(atom.summary);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 96);
}

function isCleanSourceAtom(fragment: string, labelHint: string) {
  if (!fragment || hasNoisySourceArtifact(fragment)) return false;
  if (isExtractedExercisePromptAtom(fragment)) return false;
  if (/\b(?:phrase window|focused point|grandmother unfortunately)\b/i.test(fragment)) {
    return false;
  }
  if (/phrase-window/i.test(labelHint)) return isCompleteSourceThought(fragment);
  if (/clause/i.test(labelHint) && !isCoherentClause(fragment)) return false;
  return !hasSourceFragmentBoundaryProblem(fragment);
}

function isExtractedExercisePromptAtom(value: string) {
  const normalized = normalizeSourceFragment(value);
  if (!normalized) return false;

  return (
    /^(?:exercise|exercises|questions?|question\s+bank|worksheet|practice\s+questions?|review\s+questions?|multiple\s+choice\s+questions?|very\s+short\s+answer|short\s+answer|long\s+answer)\s*[:.-]?$/i.test(
      normalized,
    ) ||
    /^(?:q(?:uestion)?\.?\s*)?\d{1,3}[.)]\s*(?:what|why|how|when|where|which|who|whom|whose|explain|describe|define|state|list|name|choose|tick|fill|match|answer|give|write|discuss|differentiate|calculate|find|prove|show)\b/i.test(
      normalized,
    ) ||
    /^(?:what|why|how|when|where|which|who|whom|whose)\b.{12,}\?/i.test(
      normalized,
    ) ||
    /^(?:explain|describe|define|state|list|name|choose|tick|fill|match|answer|give|write|discuss|differentiate|calculate|find|prove|show)\b.{12,}[.?]?$/i.test(
      normalized,
    ) ||
    /\b(?:answer\s+the\s+following|answer\s+these\s+questions|choose\s+the\s+correct|tick\s+the\s+correct|fill\s+in\s+the\s+blanks?|match\s+the\s+following|true\s+or\s+false|assertion\s+and\s+reason|give\s+reasons?|very\s+short\s+answer|short\s+answer|long\s+answer)\b/i.test(
      normalized,
    )
  );
}

function sourceLensAtom(fragment: string) {
  return `The source detail shows that ${lowerFirst(stripFinalPunctuation(fragment))}.`;
}

function isCompleteSourceThought(fragment: string) {
  const normalized = normalizeSourceFragment(fragment);
  const words = normalized.split(/\s+/).filter(Boolean);
  return (
    words.length >= 8 &&
    /^[A-Z0-9"']/.test(normalized) &&
    /[.!?]$/.test(normalized) &&
    !hasSourceFragmentBoundaryProblem(normalized)
  );
}

function isCoherentClause(fragment: string) {
  const normalized = normalizeSourceFragment(fragment);
  const words = normalized.split(/\s+/).filter(Boolean);
  if (words.length < 5) return false;
  if (/^(?:of|and|or|but|with|from|to|in)\b/i.test(normalized)) {
    return false;
  }
  if (
    /^(?:connects?|supports?|separates?|places?|defines?|gives?|asks?|contrasts?|depends?|shows?|explains?|means?|includes?|uses?|helps?|warns?|links?)\b/i.test(
      normalized,
    )
  ) {
    return false;
  }
  if (hasSourceFragmentBoundaryProblem(normalized)) return false;
  return /\b(?:is|are|was|were|has|have|had|can|could|should|would|will|does|do|did|becomes?|shows?|explains?|uses?|helps?|connects?|means?|includes?)\b/i.test(
    normalized,
  );
}

function hasSourceFragmentBoundaryProblem(fragment: string) {
  const normalized = normalizeSourceFragment(fragment);
  return (
    /\b(?:was|were|is|are|also|very|then|because|which|that|with|from|to|of|in|the)\.?$/i.test(
      normalized,
    ) ||
    /^(?:of|and|or|but|with|from|to|in)\b/i.test(normalized) ||
    /\bGrandmother\s+Unfortunately\b/i.test(normalized)
  );
}

function normalizeSourceFragment(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function sourceSentences(text: string) {
  const sentenceParts = text
    .split(/(?<=[.!?])\s+/)
    .map(normalizeSourceFragment)
    .filter((sentence) => sentence.length >= 36);

  if (sentenceParts.length > 1) return sentenceParts;
  return text ? [text] : [];
}

function sourceClauses(text: string) {
  return text
    .split(
      /[,;:]|\s+-\s+|\s+(?:and|but|because|when|where|while|which|that|therefore|however)\s+/i,
    )
    .map(normalizeSourceFragment)
    .filter((clause) => clause.length >= 24);
}

function keyPhrase(value: string) {
  const words = value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 3 && !sourceAtomStopWords.has(word))
    .slice(0, 7);

  return words.length ? words.join(" ") : trimToSentence(value, 70);
}

function distinctiveSourceWords(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 3 && !sourceAtomStopWords.has(word));
}

function uniqueInOrder(values: string[]) {
  const seen = new Set<string>();
  return values.filter((value) => {
    if (!value || seen.has(value)) return false;
    seen.add(value);
    return true;
  });
}

function normalizeAtomKey(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function slugPart(value: string) {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 32) || "x"
  );
}

function stableAtomSuffix(value: string) {
  const normalized = normalizeAtomKey(value);
  let hash = 0;
  for (let index = 0; index < normalized.length; index += 1) {
    hash = (hash * 31 + normalized.charCodeAt(index)) >>> 0;
  }
  return hash.toString(36).slice(0, 8) || "0";
}

const sourceAtomStopWords = new Set([
  "about",
  "after",
  "before",
  "because",
  "chapter",
  "concept",
  "context",
  "detail",
  "explains",
  "learners",
  "selected",
  "source",
  "students",
  "through",
  "unfortunately",
  "using",
  "which",
  "would",
]);

function oneWordAnswer(topic: string) {
  const words = distinctiveSourceWords(topic)
    .filter((word) => !/^(?:ordinary|people|statement|grandmother)$/i.test(word))
    .slice(0, 2);
  if (words.length) return sentenceCase(words.join(" "));
  return sentenceCase(topic.split(/\s+/).filter(Boolean).slice(0, 2).join(" ")) || "Concept";
}

function variantRecipeFor(index: number) {
  const normalizedIndex = Math.abs(index - 1);
  const recipe = variantRecipes[normalizedIndex % variantRecipes.length];
  const lens =
    variantLenses[
      Math.floor(normalizedIndex / variantRecipes.length) % variantLenses.length
    ];

  return applyVariantLens(recipe, lens);
}

function variantSlotCount() {
  return variantRecipes.length * variantLenses.length;
}

function applyVariantLens(
  recipe: VariantRecipe,
  lens: VariantLens,
): VariantRecipe {
  return {
    ...recipe,
    id: `${recipe.id}-${lens.id}`,
    label: `${recipe.label} ${lens.label}`,
    mcqStem: `${recipe.mcqStem} with a ${lens.label} lens that ${lens.stemFocus}`,
    optionLead: `${recipe.optionLead}; ${lens.optionLead}`,
    sourceFocus: `${recipe.sourceFocus}; ${lens.sourceFocus}`,
    sourceLead: `${recipe.sourceLead} ${lens.contextLead}`,
    caseLead: `${recipe.caseLead} ${lens.contextLead}`,
    trueFalseLead: `${recipe.trueFalseLead}, with a ${lens.label} check,`,
    shortStem: `${recipe.shortStem} with a ${lens.label} lens`,
    shortAnswer: `${recipe.shortAnswer} ${lens.keyPoint}`,
    paragraphLead: `${recipe.paragraphLead} ${lens.contextLead}`,
    paragraphQuestion: `${recipe.paragraphQuestion} with a ${lens.label} focus`,
    hotsStem: `${recipe.hotsStem} through a ${lens.label} lens`,
    hotsAnswer: `${recipe.hotsAnswer} ${lens.keyPoint}`,
    competencyStem: `${recipe.competencyStem} with a ${lens.label} focus`,
    diagramStem: `${recipe.diagramStem} using a ${lens.label} lens`,
    practicalStem: `${recipe.practicalStem} with a ${lens.label} focus`,
    longStem: `${recipe.longStem} with a ${lens.label} lens`,
    ncertStem: `${recipe.ncertStem} with a ${lens.label} focus`,
    keyPoint: `${recipe.keyPoint} ${lens.keyPoint}`,
    explanationLead: `${recipe.explanationLead} using the ${lens.label} lens`,
    answerPath: `${recipe.answerPath} ${lens.answerPath}`,
    answerVerb: lens.answerVerb,
  };
}

function topicSentence(topic: string) {
  return topic.endsWith(".") ? topic : `${topic}.`;
}

function bloomFor(type: QuestionType, difficulty: Difficulty): BloomLevel {
  if (type === "HOTS" || difficulty === "ABSURD") return "EVALUATE";
  if (type === "COMPETENCY" || type === "CASE_BASED") return "APPLY";
  if (difficulty === "HARD") return "ANALYZE";
  if (difficulty === "EASY") return "UNDERSTAND";
  return "UNDERSTAND";
}

function reasoningStepsFor(difficulty: Difficulty) {
  if (difficulty === "ABSURD") return 5;
  if (difficulty === "HARD") return 4;
  if (difficulty === "MEDIUM") return 3;
  return 2;
}

function complexityFor(difficulty: Difficulty) {
  if (difficulty === "ABSURD") return 5;
  if (difficulty === "HARD") return 4;
  if (difficulty === "MEDIUM") return 3;
  return 2;
}

function deterministicFallbackDifficultyForFormat(
  type: QuestionType,
  selectedDifficulty: Difficulty,
): Difficulty {
  if (selectedDifficulty !== "ABSURD") return selectedDifficulty;

  const allowed = allowedDifficultiesForFormat(selectedDifficulty, type);
  if (allowed.includes("ABSURD")) return "ABSURD";
  if (allowed.includes("HARD")) return "HARD";
  return selectedDifficulty;
}
