import {
  isDuplicateQuestion,
  sourceBackedUniquenessKey,
  sourceBackedUniquenessKeyFor,
} from "@/lib/question-duplicates";
import { QuestionCandidateBank } from "@/lib/question-candidate-bank";
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

export type SourceBackedGuaranteedCompletionRetarget = {
  bank: QuestionCandidateBank;
  blueprint: Blueprint;
  config: PaperConfig;
  conversions: SourceBackedGuaranteedConversion[];
  warning: string;
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
  }).accepted;
}

export function analyzeSourceBackedCompletionCapacity({
  bank,
  concepts,
  config,
  startIndex,
  maxCandidatesPerMissing = 96,
}: {
  bank: QuestionCandidateBank;
  concepts: ConceptData[];
  config: PaperConfig;
  startIndex?: number;
  maxCandidatesPerMissing?: number;
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
  const conversions = guaranteedCompletionConversions(bank, sourceCapacity);
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
  };
}

function guaranteedCompletionConversions(
  bank: QuestionCandidateBank,
  sourceCapacity: SourceBackedCapacityDiagnostics,
) {
  return bank
    .missingSections()
    .map((section) => {
      const replacement = guaranteedCompletionReplacementFor(section.questionType);
      if (!replacement) return null;

      const item = sourceCapacity.byType[section.questionType];
      if (!item) return null;
      if (item.rawAvailable < section.count) return null;
      if (item.effectiveAvailable >= section.count) return null;

      return {
        from: section.questionType,
        to: replacement,
        count: section.count,
      };
    })
    .filter((item): item is SourceBackedGuaranteedConversion => Boolean(item));
}

function guaranteedCompletionReplacementFor(type: QuestionType): QuestionType | null {
  if (type === "TRUE_FALSE") return "MCQ";
  if (type === "MATCH_FOLLOWING") return "SHORT";
  return null;
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

function fillQuestionBankWithSourceBackedCandidates({
  bank,
  conceptPool,
  config,
  startIndex,
  maxCandidatesPerMissing = 96,
  deadlineAt,
  minRemainingMs = 5_000,
}: {
  bank: QuestionCandidateBank;
  conceptPool: NormalizedConcept[];
  config: PaperConfig;
  startIndex?: number;
  maxCandidatesPerMissing?: number;
  deadlineAt?: number;
  minRemainingMs?: number;
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
        continue;
      }

      if (
        [...existing, ...generated].some((item) =>
          isDuplicateQuestion(item, question),
        )
      ) {
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
  } = {},
) {
  const existing = [...(options.existingQuestions ?? [])];
  const generated: GeneratedQuestion[] = [];
  let index = options.startIndex ?? existing.length + 1;

  for (const section of sections) {
    let acceptedInSection = 0;
    let attempts = 0;
    const maxAttempts = Math.max(section.count * 8, 16);

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
}: {
  bank: QuestionCandidateBank;
  config: PaperConfig;
  concepts: ConceptData[];
  startIndex?: number;
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

  for (const missingSection of expandMissingSections(bank.missingSections())) {
    const target = nextSyllabusDeficit(acceptedByItem) ?? acceptedByItem[0];
    if (!target) break;

    const candidates = generateSyllabusNearFallbackQuestions(
      [missingSection],
      target.item,
      config,
      {
        concepts: conceptsForSyllabusItem(concepts, target.item),
        existingQuestions: bank.allCandidates(),
        startIndex: cursor,
      },
    );
    cursor += candidates.length + 1;

    const accepted = candidates.some((candidate) => bank.tryAdd(candidate));
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

  switch (section.questionType) {
    case "MCQ":
      return {
        ...common,
        text: `Which statement best explains ${concept.focus}?`,
        options,
        correctAnswer: "B",
        explanation: concept.explanation,
      };
    case "ASSERTION_REASON":
      return {
        ...common,
        text: `Assertion (A): ${concept.assertion}\nReason (R): ${concept.reason}`,
        assertion: concept.assertion,
        reason: concept.reason,
        correctAnswer: "A",
        explanation: "Both assertion and reason are true, and the reason correctly explains the assertion.",
      };
    case "TRUE_FALSE":
      return {
        ...common,
        text: `True or False: ${concept.trueStatement}`,
        correctAnswer: "True",
        explanation: concept.explanation,
      };
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
    case "MATCH_FOLLOWING":
      return {
        ...common,
        text: `Match the ${concept.matchTitle} terms with their meanings.`,
        matchPairs: syllabusNearMatchPairs(item, config, concepts, index),
        correctAnswer: "A1-B1, A2-B2, A3-B3, A4-B4",
        explanation: "Each term should be matched with its correct classroom meaning.",
      };
    case "SHORT":
      return {
        ...common,
        text: `Explain why ${concept.focus} is important.`,
        correctAnswer: concept.correct,
        keyPoints: [concept.correct, concept.example, concept.explanation],
        explanation: concept.explanation,
      };
    case "NUMERICAL":
      return {
        ...common,
        text: `A learner notes ${concept.firstCount} examples of ${concept.term} and adds ${concept.secondCount} more. How many examples are noted in all?`,
        correctAnswer: `${concept.firstCount + concept.secondCount} examples`,
        keyPoints: [
          `${concept.firstCount} + ${concept.secondCount} = ${concept.firstCount + concept.secondCount}.`,
          `Final answer: ${concept.firstCount + concept.secondCount} examples.`,
        ],
        explanation: "Add both counts to find the total.",
      };
    case "SOURCE_BASED":
      return syllabusNearSourceBasedQuestion(common, concept);
    case "CASE_BASED":
      return syllabusNearCaseBasedQuestion(common, concept, options);
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
  return {
    id: index,
    text: concept.focus,
    type: section.questionType,
    marks: section.marksPerQuestion,
    difficulty: config.difficulty,
    bloomLevel: bloomFor(section.questionType, config.difficulty),
    competencyLevel: section.questionType === "MCQ" || section.questionType === "TRUE_FALSE" ? 2 : 3,
    reasoningSteps: reasoningStepsFor(config.difficulty),
    difficultyConfidence: 0.76,
    cognitiveComplexity: {
      conceptIntegration: complexityFor(config.difficulty),
      abstractionLevel: complexityFor(config.difficulty),
      inferenceLevel: Math.max(1, complexityFor(config.difficulty) - 1),
      ambiguityLevel: 1,
      cognitiveLoad: complexityFor(config.difficulty),
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
  const subQuestions: SubQuestion[] = [
    {
      text: `Which option best explains the situation related to ${concept.term}?`,
      type: "MCQ",
      options,
      correctAnswer: "B",
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
    correctAnswer: `(1) B; (2) ${concept.correct}`,
  };
}

type SyllabusNearConcept = {
  term: string;
  focus: string;
  correct: string;
  misconception: string;
  example: string;
  explanation: string;
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
    }),
    syllabusConcept({
      term: "Sender",
      focus: "the role of the sender in a communication process",
      correct: "The sender starts communication by creating and sending a clear message.",
      misconception: "A sender should not assume the receiver understood without checking feedback.",
      example: "A teacher announces homework instructions clearly before the class ends.",
    }),
    syllabusConcept({
      term: "Receiver",
      focus: "the role of the receiver in understanding a message",
      correct: "The receiver listens, reads, or observes the message and interprets its meaning.",
      misconception: "A receiver is active because understanding requires attention and response.",
      example: "A learner listens to safety instructions and asks a question for clarity.",
    }),
    syllabusConcept({
      term: "Message",
      focus: "the message as the information being communicated",
      correct: "The message is the idea, fact, instruction, or feeling that the sender wants to share.",
      misconception: "A message should not be vague because unclear words can confuse the receiver.",
      example: "Please submit the assignment by Friday is a clear message.",
    }),
    syllabusConcept({
      term: "Channel",
      focus: "the medium used to send a message",
      correct: "A channel is the path used for communication, such as speech, writing, phone call, email, or gesture.",
      misconception: "The same channel is not best for every situation.",
      example: "An email is suitable for written instructions, while a phone call is faster for urgent news.",
    }),
    syllabusConcept({
      term: "Feedback",
      focus: "feedback in effective communication",
      correct: "Feedback is the receiver's response that tells the sender whether the message was understood.",
      misconception: "Without feedback, communication may remain incomplete.",
      example: "A student nods and repeats the instruction to show understanding.",
    }),
    syllabusConcept({
      term: "Verbal communication",
      focus: "communication through spoken or written words",
      correct: "Verbal communication uses words to share a message clearly.",
      misconception: "Verbal communication can be spoken or written, not only face-to-face speech.",
      example: "Giving a presentation or writing a notice are verbal communication examples.",
    }),
    syllabusConcept({
      term: "Non-verbal communication",
      focus: "communication without words",
      correct: "Non-verbal communication uses body language, facial expressions, gestures, posture, or eye contact.",
      misconception: "Non-verbal signs can support or weaken spoken words.",
      example: "Maintaining eye contact can show attention during a conversation.",
    }),
    syllabusConcept({
      term: "Communication barrier",
      focus: "barriers that disturb clear communication",
      correct: "A communication barrier is anything that prevents a message from being sent, received, or understood properly.",
      misconception: "Noise, unclear language, distraction, and wrong channel can all become barriers.",
      example: "A noisy classroom can stop students from hearing an announcement.",
    }),
    syllabusConcept({
      term: "Active listening",
      focus: "active listening during communication",
      correct: "Active listening means paying full attention, understanding the message, and responding appropriately.",
      misconception: "Hearing words is not the same as listening carefully.",
      example: "A learner listens, asks a relevant question, and summarizes the speaker's point.",
    }),
    syllabusConcept({
      term: "Clarity",
      focus: "clarity in communication",
      correct: "Clarity means using simple, specific, and complete language so the receiver understands the message.",
      misconception: "Long or complicated words do not automatically make communication better.",
      example: "Meet at 9 a.m. near the library is clearer than Come there early.",
    }),
    syllabusConcept({
      term: "Digital communication",
      focus: "safe and respectful digital communication",
      correct: "Digital communication should be clear, polite, accurate, and safe because messages can be stored or forwarded.",
      misconception: "Online messages should not share private information carelessly.",
      example: "A student writes a polite email with a clear subject and avoids sharing passwords.",
    }),
  ];
}

function genericSyllabusConcepts(label: string, subject: string): SyllabusNearConcept[] {
  const safeLabel = label || subject || "selected topic";
  return [
    syllabusConcept({
      term: safeLabel,
      focus: `${safeLabel} as an important ${subject} concept`,
      correct: `${safeLabel} should be explained with its meaning, one supporting point, and a relevant example.`,
      misconception: `A good answer about ${safeLabel} needs more than just the term name.`,
      example: `A correct answer connects ${safeLabel} with a classroom example from ${subject}.`,
    }),
    syllabusConcept({
      term: `${safeLabel} application`,
      focus: `the application of ${safeLabel}`,
      correct: `Applying ${safeLabel} means using the idea correctly in a suitable situation.`,
      misconception: `An application must stay connected to ${safeLabel}, not to an unrelated idea.`,
      example: `A learner uses ${safeLabel} to explain a familiar classroom situation.`,
    }),
    syllabusConcept({
      term: `${safeLabel} reasoning`,
      focus: `reasoning about ${safeLabel}`,
      correct: `Reasoning about ${safeLabel} requires a clear cause, effect, or explanation.`,
      misconception: `A reason is stronger when it explains why the answer is correct.`,
      example: `The answer states the point and then gives a reason linked to ${safeLabel}.`,
    }),
  ];
}

function syllabusConcept({
  term,
  focus,
  correct,
  misconception,
  example,
}: {
  term: string;
  focus: string;
  correct: string;
  misconception: string;
  example: string;
}): SyllabusNearConcept {
  return {
    term,
    focus,
    correct,
    misconception,
    example,
    explanation: correct,
    assertion: `${sentenceCase(stripFinalPunctuation(focus))} is important for effective learning.`,
    reason: correct,
    trueStatement: correct,
    oneWordPrompt: `${focus}`,
    fillBlankPrompt: stripFinalPunctuation(focus),
    matchTitle: term.toLowerCase(),
    scenario: `A Class 9 learner studies ${term}. ${example} The learner must explain the idea clearly and avoid common mistakes.`,
    hotsAnswer: `If ${term} is ignored, the answer or situation can become unclear because ${correct}`,
    firstCount: 3 + (term.length % 4),
    secondCount: 2 + (focus.length % 4),
  };
}

function syllabusNearOptions(concept: SyllabusNearConcept, index: number): MCQOption[] {
  const distractors = [
    concept.misconception,
    `${concept.term} means using unrelated information without checking the situation.`,
    `${concept.term} is useful only when no explanation is required.`,
    `The idea can be answered correctly without clarity or examples.`,
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
      right: trimToSentence(concept.correct, 120),
    };
  });
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
): GeneratedQuestion {
  const variant = variantRecipeFor(index);
  const base = baseQuestion(type, concept, index, section.marksPerQuestion, variant);
  const visibleSummary = studentVisibleSummary(concept.summary);
  const noveltyAtomId = sourceBackedAtomIdForType(concept, type);
  const sourceFocus = `${variant.sourceFocus} ${concept.atomId}: ${trimToSentence(visibleSummary, 150)} Internal angle: ${variant.id}.`;
  const answerPath = `${variant.answerPath} ${topicSentence(concept.topic)} Use internal atom ${concept.atomId} (${concept.atomLabel}) to ${variant.answerVerb} the ${concept.source === "pdf" ? "PDF" : "NCERT TXT"} idea.`;

  const question: GeneratedQuestion = {
    ...base,
    text: base.text ?? `Explain ${concept.topic} clearly.`,
    type,
    marks: section.marksPerQuestion,
    correctAnswer: base.correctAnswer ?? concept.summary,
    difficulty: config.difficulty,
    bloomLevel: bloomFor(type, config.difficulty),
    competencyLevel: type === "MCQ" || type === "TRUE_FALSE" ? 2 : 3,
    reasoningSteps: reasoningStepsFor(config.difficulty),
    difficultyConfidence: 0.72,
    cognitiveComplexity: {
      conceptIntegration: complexityFor(config.difficulty),
      abstractionLevel: complexityFor(config.difficulty),
      inferenceLevel: Math.max(1, complexityFor(config.difficulty) - 1),
      ambiguityLevel: 1,
      cognitiveLoad: complexityFor(config.difficulty),
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
  return positiveModulo((startIndex ?? 0) + sourceBackedTypeSeed(type), candidateSpace);
}

function sourceBackedTypeSeed(type: QuestionType) {
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
): Partial<GeneratedQuestion> {
  const summary = studentVisibleSummary(concept.summary);
  const excerpt = studentVisibleSummary(concept.excerpt, 560);
  const options = conceptOptions(concept, index, variant);
  const idea = ideaPhrase(summary);
  const skill = visibleSkillFor(variant);
  const keyPoint = visibleKeyPoint(skill);

  switch (type) {
    case "MCQ":
      return {
        text: mcqQuestionText(skill, summary),
        options,
        correctAnswer: "B",
      };
    case "ASSERTION_REASON":
      return assertionReasonQuestion(summary, idea, skill);
    case "TRUE_FALSE":
      return {
        text: trueFalseQuestionText(summary, skill),
        correctAnswer: "True",
      };
    case "ONE_WORD":
      return {
        text: `Which key term best fits this statement: ${summary}`,
        correctAnswer: oneWordAnswer(summary),
      };
    case "FILL_BLANK":
      return {
        text: `The statement "${stripFinalPunctuation(summary)}" is mainly connected with ________.`,
        correctAnswer: oneWordAnswer(summary),
      };
    case "VERY_SHORT":
      return {
        text: `State one ${skill} point shown by ${idea}.`,
        correctAnswer: summary,
        keyPoints: [summary],
      };
    case "MATCH_FOLLOWING":
      return matchQuestion(concept, variant);
    case "SHORT":
      return {
        text: shortQuestionText(idea, skill),
        correctAnswer: `${summary} ${keyPoint}`,
        keyPoints: [summary, keyPoint, "Connect the reason to the concept."],
      };
    case "NUMERICAL":
      return {
        text: `A learner records ${variant.firstCount} observations about this concept and adds ${variant.secondCount} more related observations. How many observations are recorded in total?`,
        correctAnswer: `${variant.firstCount + variant.secondCount} points`,
        keyPoints: [
          "Add the two counts.",
          `${variant.firstCount} + ${variant.secondCount} = ${variant.firstCount + variant.secondCount}.`,
          `Final answer: ${variant.firstCount + variant.secondCount} points.`,
        ],
      };
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
  summary: string,
  idea: string,
  skill: string,
): Partial<GeneratedQuestion> {
  const assertion = `${sentenceCase(stripFinalPunctuation(idea))} can be understood through ${skill}.`;
  const reason = `${sentenceCase(toStatement(summary))} This supports the ${skill} reasoning.`;

  return {
    text: `Assertion (A): ${assertion}\nReason (R): ${reason}`,
    assertion,
    reason,
    correctAnswer: "A",
  };
}

function trueFalseQuestionText(summary: string, _skill: string) {
  return `True or False: ${sentenceCase(stripFinalPunctuation(summary))}.`;
}

function shortQuestionText(idea: string, skill: string) {
  return `Explain the ${skill} point in ${idea}.`;
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
  const options = conceptOptions(concept, concept.atomNumericId + 1, variant);
  const subQuestions: SubQuestion[] = [
    {
      text: `Which option best explains the ${skill} case?`,
      type: "MCQ",
      options,
      correctAnswer: "B",
      marks: 2,
    },
    {
      text: `Explain the ${skill} reason behind your answer.`,
      type: "SHORT",
      correctAnswer: summary,
      marks: 2,
    },
  ];

  return {
    scenario: `A class considers this idea: ${summary} The learner has to explain what follows from it.`,
    text: `Read the case about ${idea} and answer the ${skill} questions.`,
    subQuestions,
    correctAnswer: `(1) B; (2) ${summary}`,
  };
}

function matchQuestion(
  concept: NormalizedConcept,
  variant: VariantRecipe,
): Partial<GeneratedQuestion> {
  const summary = studentVisibleSummary(concept.summary, 140);
  const skill = visibleSkillFor(variant);
  const pairs = subjectMatchPairs(concept, summary, skill);
  const focus = matchFocusPhrase(summary);

  return {
    text: `Match the ${skill} points about ${focus} with their meanings.`,
    matchPairs: pairs,
    correctAnswer: "A1-B1, A2-B2, A3-B3, A4-B4",
  };
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
      .replace(/\b\d+\s+Exploration\s*[|\\\/]\s*Grade\s+\d+\b/gi, "")
      .replace(/\bExploration\s*[|\\\/]\s*Grade\s+\d+\b/gi, "")
      .replace(/\bGrade\s+\d+\b/gi, "")
      .replace(/[|\\]+/g, " ")
      .replace(/\bsurface\s+on\s+it\s+moves\b/gi, "surface on which it moves")
      .replace(/\bmore\s+slow\b/gi, "more slowly")
      .replace(/\bfig(?:ure)?\.?\s*\d+(?:\.\d+)*\s*[:.-]\s*/gi, "")
      .replace(/\b\d+(?:\.\d+)+\s*[:.-]\s*/g, "")
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

function ideaPhrase(summary: string) {
  const idea = stripFinalPunctuation(summary);
  if (!idea) return "the concept";
  if (idea.length > 130) return lowerFirst(stripFinalPunctuation(trimToSentence(idea, 120)));
  return `the idea that ${lowerFirst(idea)}`;
}

function mcqQuestionText(skill: string, summary: string) {
  const motionQuestion = motionMcqQuestion(summary);
  if (motionQuestion) return motionQuestion;
  return `${mcqLeadForSkill(skill)} the ${skill} point about ${mcqFocusPhrase(summary)} in ${ideaPhrase(summary)}?`;
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

function optionStatement(summary: string, variant: VariantRecipe) {
  const base = stripFinalPunctuation(trimToSentence(sentenceCase(toStatement(summary)), 130));
  return trimToSentence(`${base}. ${optionReasonForVariant(variant)}`, 180);
}

function optionReasonForVariant(variant: VariantRecipe) {
  const id = variant.id;
  if (id.includes("cause") || id.includes("consequence")) {
    return "This links the cause with the effect.";
  }
  if (id.includes("comparison") || id.includes("contrast")) {
    return "This distinguishes it from a similar idea.";
  }
  if (id.includes("application") || id.includes("example")) {
    return "This applies the concept correctly.";
  }
  if (id.includes("inference") || id.includes("conclusion") || id.includes("reasoning")) {
    return "This follows logically from the clue.";
  }
  if (id.includes("misconception")) {
    return "This avoids the common mistaken reading.";
  }
  if (id.includes("definition")) {
    return "This states the meaning clearly.";
  }
  if (id.includes("process")) {
    return "This keeps the steps in order.";
  }
  if (id.includes("exception") || id.includes("boundary")) {
    return "This states the condition clearly.";
  }
  if (id.includes("diagram")) {
    return "This identifies the relationship to show.";
  }
  if (id.includes("case")) {
    return "This is the best judgement for the situation.";
  }
  if (id.includes("source-extract")) {
    return "This fits the passage meaning.";
  }
  return "This gives a supporting reason.";
}

function subjectMatchPairs(
  concept: NormalizedConcept,
  summary: string,
  skill: string,
) {
  if (isMotionConcept(concept, summary)) {
    return [
      { left: "Smooth surface", right: "Less friction" },
      { left: "Rough surface", right: "More friction" },
      { left: "Smaller frictional force", right: "Object travels farther" },
      { left: "Thought experiment", right: "Used when real conditions are difficult to recreate" },
    ];
  }

  const conceptTerm = sentenceCase(oneWordAnswer(summary));
  const atomLabel = sentenceCase(trimToSentence(concept.atomLabel, 90));
  return [
    { left: conceptTerm, right: trimToSentence(summary, 110) },
    { left: "Focused point", right: atomLabel },
    { left: "Reason", right: visibleKeyPoint(skill) },
    { left: "Application", right: "Use the idea in a relevant situation" },
  ];
}

function matchFocusPhrase(summary: string) {
  return keyPhrase(summary).split(/\s+/).slice(0, 4).join(" ") || oneWordAnswer(summary);
}

function isMotionConcept(concept: NormalizedConcept, summary: string) {
  const subject = `${concept.subject ?? ""} ${concept.chapter} ${summary}`.toLowerCase();
  return (
    subject.includes("physics") ||
    subject.includes("force") ||
    subject.includes("motion") ||
    subject.includes("friction") ||
    subject.includes("surface") ||
    subject.includes("coins")
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
      return "Explain the concept clearly.";
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
  const subject = `${concept.subject ?? ""} ${concept.chapter}`.toLowerCase();
  const scienceMotion =
    subject.includes("physics") ||
    subject.includes("force") ||
    subject.includes("motion");
  const chemistry = subject.includes("chemistry");
  const biology = subject.includes("biology");
  const mathematics = subject.includes("mathematics") || subject.includes("math");
  const language =
    subject.includes("english") ||
    subject.includes("hindi") ||
    subject.includes("grammar");

  const distractors = scienceMotion
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
            ? [
                "The meaning can be decided without considering context.",
                "Tone and word choice never affect interpretation.",
                "Only memorised definitions matter in this passage.",
                "The surrounding sentence gives no clue to meaning.",
              ]
            : [
                "The idea can be answered without using the given condition.",
                "Only a memorised label is needed; no explanation is required.",
                "The conclusion is correct even if it does not match the described idea.",
                "The relationship between the ideas does not matter.",
              ];

  return distractors.slice(index % distractors.length).concat(distractors).slice(0, 4);
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

function normalizeConceptPool(
  concepts: ConceptData[],
  config: PaperConfig,
): NormalizedConcept[] {
  const pool: NormalizedConcept[] = [];
  const seenAtoms = new Set<string>();

  sourceBackedConcepts(concepts).forEach((concept, conceptIndex) => {
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

  const rawSlice = normalized.slice(0, maxLength).trim();
  const sliced = rawSlice.replace(/\s+\S*$/, "").trim() || rawSlice;
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
    const summary = trimToSentence(fragment, 240);
    if (!summary || summary.length < 36) return;
    atoms.push({
      summary,
      excerpt: trimToSentence(fragment, 560),
      label: keyPhrase(`${labelHint} ${summary}`),
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
  clauses.slice(0, 28).forEach((clause, index) =>
    addAtom(clause, `clause ${index + 1}`),
  );
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
    addAtom(words.slice(index, index + 12).join(" "), `phrase-window ${index + 1}`);
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
  "using",
  "which",
  "would",
]);

function oneWordAnswer(topic: string) {
  return topic.split(/\s+/).filter(Boolean).slice(0, 2).join(" ") || "Concept";
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
