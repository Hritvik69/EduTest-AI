import type {
  BloomLevel,
  BlueprintSection,
  Difficulty,
  GeneratedQuestion,
  QuestionType,
} from "@/types";

export type DifficultyTargets = Partial<Record<Difficulty, number>>;

export interface CognitiveComplexity {
  conceptIntegration: number;
  abstractionLevel: number;
  inferenceLevel: number;
  ambiguityLevel: number;
  cognitiveLoad: number;
}

export interface DifficultyValidationResult {
  valid: boolean;
  question: GeneratedQuestion;
  validatedDifficulty: Difficulty;
  reasons: string[];
}

interface DifficultyProtocol {
  mix: Record<Difficulty, number>;
  allowed: Difficulty[];
  forbidden: Difficulty[];
  bloomDefaults: Record<BloomLevel, number>;
  bloomBounds: Record<BloomLevel, { min: number; max: number }>;
  reasoningSteps: { min: number; max: number };
  cognitiveBounds: {
    conceptIntegration: { min: number; max: number };
    abstractionLevel: { min: number; max: number };
    inferenceLevel: { min: number; max: number };
    ambiguityLevel: { min: number; max: number };
    cognitiveLoad: { min: number; max: number };
  };
  promptLabel: string;
}

const bloomLevels: BloomLevel[] = [
  "REMEMBER",
  "UNDERSTAND",
  "APPLY",
  "ANALYZE",
  "EVALUATE",
  "CREATE",
];

export const difficultyOrder: Difficulty[] = ["EASY", "MEDIUM", "HARD", "ABSURD"];

const difficultyRank = difficultyOrder.reduce<Record<Difficulty, number>>(
  (acc, difficulty, index) => {
    acc[difficulty] = index;
    return acc;
  },
  {} as Record<Difficulty, number>,
);

const bloomRank: Record<BloomLevel, number> = {
  REMEMBER: 0,
  UNDERSTAND: 1,
  APPLY: 2,
  ANALYZE: 3,
  EVALUATE: 4,
  CREATE: 5,
};

export const difficultyProtocols: Record<Difficulty, DifficultyProtocol> = {
  EASY: {
    mix: { EASY: 85, MEDIUM: 15, HARD: 0, ABSURD: 0 },
    allowed: ["EASY", "MEDIUM"],
    forbidden: ["HARD", "ABSURD"],
    bloomDefaults: {
      REMEMBER: 45,
      UNDERSTAND: 40,
      APPLY: 15,
      ANALYZE: 0,
      EVALUATE: 0,
      CREATE: 0,
    },
    bloomBounds: {
      REMEMBER: { min: 35, max: 65 },
      UNDERSTAND: { min: 25, max: 55 },
      APPLY: { min: 0, max: 15 },
      ANALYZE: { min: 0, max: 0 },
      EVALUATE: { min: 0, max: 0 },
      CREATE: { min: 0, max: 0 },
    },
    reasoningSteps: { min: 1, max: 2 },
    cognitiveBounds: {
      conceptIntegration: { min: 1, max: 2 },
      abstractionLevel: { min: 1, max: 2 },
      inferenceLevel: { min: 1, max: 2 },
      ambiguityLevel: { min: 1, max: 2 },
      cognitiveLoad: { min: 1, max: 2 },
    },
    promptLabel:
      "single-step, direct, low-ambiguity, foundational CBSE/NCERT understanding",
  },
  MEDIUM: {
    mix: { EASY: 20, MEDIUM: 70, HARD: 10, ABSURD: 0 },
    allowed: ["EASY", "MEDIUM", "HARD"],
    forbidden: ["ABSURD"],
    bloomDefaults: {
      REMEMBER: 10,
      UNDERSTAND: 25,
      APPLY: 40,
      ANALYZE: 25,
      EVALUATE: 0,
      CREATE: 0,
    },
    bloomBounds: {
      REMEMBER: { min: 0, max: 20 },
      UNDERSTAND: { min: 10, max: 35 },
      APPLY: { min: 25, max: 50 },
      ANALYZE: { min: 15, max: 35 },
      EVALUATE: { min: 0, max: 10 },
      CREATE: { min: 0, max: 0 },
    },
    reasoningSteps: { min: 1, max: 3 },
    cognitiveBounds: {
      conceptIntegration: { min: 1, max: 3 },
      abstractionLevel: { min: 1, max: 3 },
      inferenceLevel: { min: 1, max: 3 },
      ambiguityLevel: { min: 1, max: 3 },
      cognitiveLoad: { min: 2, max: 3 },
    },
    promptLabel:
      "standard CBSE reasoning, moderate application, 2-3 steps, readable academic wording",
  },
  HARD: {
    mix: { EASY: 0, MEDIUM: 20, HARD: 70, ABSURD: 10 },
    allowed: ["MEDIUM", "HARD", "ABSURD"],
    forbidden: ["EASY"],
    bloomDefaults: {
      REMEMBER: 0,
      UNDERSTAND: 10,
      APPLY: 20,
      ANALYZE: 40,
      EVALUATE: 30,
      CREATE: 0,
    },
    bloomBounds: {
      REMEMBER: { min: 0, max: 0 },
      UNDERSTAND: { min: 0, max: 20 },
      APPLY: { min: 10, max: 30 },
      ANALYZE: { min: 30, max: 50 },
      EVALUATE: { min: 20, max: 40 },
      CREATE: { min: 0, max: 10 },
    },
    reasoningSteps: { min: 2, max: 4 },
    cognitiveBounds: {
      conceptIntegration: { min: 2, max: 4 },
      abstractionLevel: { min: 2, max: 4 },
      inferenceLevel: { min: 2, max: 4 },
      ambiguityLevel: { min: 1, max: 4 },
      cognitiveLoad: { min: 3, max: 4 },
    },
    promptLabel:
      "HOTS reasoning, integrated concepts, analytical inference, deeper application",
  },
  ABSURD: {
    mix: { EASY: 0, MEDIUM: 0, HARD: 20, ABSURD: 80 },
    allowed: ["HARD", "ABSURD"],
    forbidden: ["EASY", "MEDIUM"],
    bloomDefaults: {
      REMEMBER: 0,
      UNDERSTAND: 0,
      APPLY: 10,
      ANALYZE: 20,
      EVALUATE: 40,
      CREATE: 30,
    },
    bloomBounds: {
      REMEMBER: { min: 0, max: 0 },
      UNDERSTAND: { min: 0, max: 0 },
      APPLY: { min: 0, max: 15 },
      ANALYZE: { min: 10, max: 30 },
      EVALUATE: { min: 30, max: 50 },
      CREATE: { min: 25, max: 45 },
    },
    reasoningSteps: { min: 3, max: 5 },
    cognitiveBounds: {
      conceptIntegration: { min: 3, max: 5 },
      abstractionLevel: { min: 3, max: 5 },
      inferenceLevel: { min: 3, max: 5 },
      ambiguityLevel: { min: 2, max: 5 },
      cognitiveLoad: { min: 4, max: 5 },
    },
    promptLabel:
      "advanced conceptual synthesis, Olympiad-style application, multi-layer inference",
  },
};

export const formatDifficultyCeilings: Record<QuestionType, Difficulty> = {
  MCQ: "ABSURD",
  ASSERTION_REASON: "HARD",
  TRUE_FALSE: "HARD",
  ONE_WORD: "MEDIUM",
  FILL_BLANK: "MEDIUM",
  VERY_SHORT: "HARD",
  MATCH_FOLLOWING: "HARD",
  SHORT: "HARD",
  NUMERICAL: "ABSURD",
  SOURCE_BASED: "ABSURD",
  CASE_BASED: "ABSURD",
  PARAGRAPH: "ABSURD",
  HOTS: "ABSURD",
  COMPETENCY: "ABSURD",
  DIAGRAM: "ABSURD",
  PRACTICAL: "ABSURD",
  LONG: "ABSURD",
  NCERT_FORMAT: "HARD",
};

export function difficultyMixFor(difficulty: Difficulty): Record<Difficulty, number> {
  return { ...difficultyProtocols[difficulty].mix };
}

export function bloomDistributionForDifficulty(
  difficulty: Difficulty,
): Record<BloomLevel, number> {
  return { ...difficultyProtocols[difficulty].bloomDefaults };
}

export function targetBloomLevelsForDifficulty(difficulty: Difficulty): BloomLevel[] {
  if (difficulty === "EASY") return ["REMEMBER", "UNDERSTAND"];
  if (difficulty === "MEDIUM") return ["APPLY", "ANALYZE"];
  if (difficulty === "HARD") return ["ANALYZE", "EVALUATE"];
  return ["EVALUATE", "CREATE"];
}

export function compareDifficulty(left: Difficulty, right: Difficulty) {
  return difficultyRank[left] - difficultyRank[right];
}

export function isDifficultyAtMost(
  difficulty: Difficulty,
  ceiling: Difficulty,
) {
  return compareDifficulty(difficulty, ceiling) <= 0;
}

export function allowedDifficultiesForFormat(
  selectedDifficulty: Difficulty,
  questionType: QuestionType,
) {
  const ceiling = formatDifficultyCeilings[questionType];
  return difficultyProtocols[selectedDifficulty].allowed.filter((difficulty) =>
    isDifficultyAtMost(difficulty, ceiling),
  );
}

export function normalizeBloomDistributionForDifficulty(
  selectedDifficulty: Difficulty,
  input?: Partial<Record<BloomLevel, number>>,
) {
  const protocol = difficultyProtocols[selectedDifficulty];
  const values = bloomLevels.reduce<Record<BloomLevel, number>>((acc, level) => {
    const value = Number(input?.[level] ?? protocol.bloomDefaults[level]);
    const bounded = Number.isFinite(value) ? Math.round(value) : 0;
    const bounds = protocol.bloomBounds[level];
    acc[level] = Math.min(bounds.max, Math.max(bounds.min, bounded));
    return acc;
  }, {} as Record<BloomLevel, number>);

  return normalizeBoundedBloom(values, protocol.bloomBounds, selectedDifficulty);
}

export function difficultyTargetsForCount(
  selectedDifficulty: Difficulty,
  count: number,
  questionType?: QuestionType,
): Record<Difficulty, number> {
  const targetCount = Math.max(0, Math.round(count));
  const protocol = difficultyProtocols[selectedDifficulty];
  const available = questionType
    ? allowedDifficultiesForFormat(selectedDifficulty, questionType)
    : protocol.allowed;

  if (!targetCount) return emptyDifficultyCounts();
  if (!available.length) {
    throw new Error(
      `${questionType} cannot satisfy ${selectedDifficulty} difficulty because its ceiling is ${questionType ? formatDifficultyCeilings[questionType] : "unknown"}.`,
    );
  }

  const filteredMix = difficultyOrder.reduce<Record<Difficulty, number>>(
    (acc, difficulty) => {
      acc[difficulty] = available.includes(difficulty) ? protocol.mix[difficulty] : 0;
      return acc;
    },
    emptyDifficultyCounts(),
  );
  const filteredTotal = difficultyOrder.reduce(
    (sum, difficulty) => sum + filteredMix[difficulty],
    0,
  );

  if (filteredTotal <= 0) {
    throw new Error(
      `${questionType ?? "Selected format"} cannot satisfy ${selectedDifficulty} difficulty without violating format ceilings.`,
    );
  }

  return countsFromPercentages(filteredMix, targetCount, filteredTotal);
}

export function allocateDifficultyTargetsForSections(
  selectedDifficulty: Difficulty,
  sections: Array<Pick<BlueprintSection, "questionType" | "count">>,
): Record<number, Record<Difficulty, number>> {
  const total = sections.reduce((sum, section) => sum + section.count, 0);
  const protocol = difficultyProtocols[selectedDifficulty];
  const remainingBySection = sections.map((section) => section.count);
  const allocations = sections.map(() => emptyDifficultyCounts());
  const allowedBySection = sections.map((section) =>
    allowedDifficultiesForFormat(selectedDifficulty, section.questionType),
  );
  const actualTotals = emptyDifficultyCounts();

  sections.forEach((section, index) => {
    if (section.count > 0 && !allowedBySection[index].length) {
      throw new Error(
        `${section.questionType} cannot be generated for ${selectedDifficulty} difficulty because its format ceiling is ${formatDifficultyCeilings[section.questionType]}.`,
      );
    }
  });

  const selectedMinimum = Math.ceil((protocol.mix[selectedDifficulty] / 100) * total);
  const selectedCapacity = capacityForDifficulty(
    selectedDifficulty,
    sections,
    allowedBySection,
  );

  if (selectedCapacity < selectedMinimum) {
    throw new Error(
      `Selected formats can provide only ${selectedCapacity} ${selectedDifficulty} question(s), but the difficulty contract requires at least ${selectedMinimum}.`,
    );
  }

  let selectedToAssign = selectedMinimum;
  while (selectedToAssign > 0) {
    const index = bestSectionIndexForDifficulty(
      selectedDifficulty,
      remainingBySection,
      allowedBySection,
    );

    if (index < 0) {
      throw new Error(
        `Could not allocate required ${selectedDifficulty} questions without violating format ceilings.`,
      );
    }

    allocations[index][selectedDifficulty] += 1;
    actualTotals[selectedDifficulty] += 1;
    remainingBySection[index] -= 1;
    selectedToAssign -= 1;
  }

  while (remainingBySection.some((count) => count > 0)) {
    const sectionIndex = bestRemainingSectionIndex(remainingBySection);
    const difficulty = chooseDifficultyForSectionRemainder(
      selectedDifficulty,
      allowedBySection[sectionIndex],
      actualTotals,
      total,
    );

    if (!difficulty) {
      throw new Error(
        `Selected formats cannot satisfy ${selectedDifficulty} overlap limits without fake difficulty.`,
      );
    }

    allocations[sectionIndex][difficulty] += 1;
    actualTotals[difficulty] += 1;
    remainingBySection[sectionIndex] -= 1;
  }

  const leftovers = remainingBySection.reduce((sum, count) => sum + count, 0);
  if (leftovers > 0) {
    throw new Error(
      `Difficulty allocation left ${leftovers} unassigned question(s). Check selected formats and difficulty.`,
    );
  }

  return Object.fromEntries(allocations.map((allocation, index) => [index, allocation]));
}

export function buildDifficultyProtocolPrompt(
  selectedDifficulty: Difficulty,
  questionType: QuestionType,
  targets: DifficultyTargets,
) {
  const protocol = difficultyProtocols[selectedDifficulty];
  const ceiling = formatDifficultyCeilings[questionType];
  const allowed = allowedDifficultiesForFormat(selectedDifficulty, questionType);

  return {
    selected: selectedDifficulty,
    mode: protocol.promptLabel,
    mix: protocol.mix,
    allowed,
    forbidden: protocol.forbidden,
    ceiling,
    targets: normalizeDifficultyTargets(targets),
    bloom: compactBounds(protocol.bloomBounds),
    steps: [protocol.reasoningSteps.min, protocol.reasoningSteps.max],
    cognitive: {
      ci: compactRange(protocol.cognitiveBounds.conceptIntegration),
      abs: compactRange(protocol.cognitiveBounds.abstractionLevel),
      inf: compactRange(protocol.cognitiveBounds.inferenceLevel),
      amb: compactRange(protocol.cognitiveBounds.ambiguityLevel),
      load: compactRange(protocol.cognitiveBounds.cognitiveLoad),
    },
    rule: "Use reasoning/concepts/application/load, not long wording/tricks.",
  };
}

export function normalizeQuestionDifficulty(
  question: GeneratedQuestion,
  selectedDifficulty: Difficulty,
  questionType: QuestionType,
): DifficultyValidationResult {
  const reasons: string[] = [];
  const estimated = estimateQuestionDifficulty(question, questionType);
  const ceiling = formatDifficultyCeilings[questionType];
  const allowed = allowedDifficultiesForFormat(selectedDifficulty, questionType);
  const aiDifficulty = normalizeDifficultyLabel(question.difficulty);
  const bloomLevel = normalizeBloomLevel(question.bloomLevel);
  const confidence = normalizeConfidence(question.difficultyConfidence);
  const metadataSupportedDifficulty =
    aiDifficulty &&
    Math.abs(compareDifficulty(aiDifficulty, estimated.difficulty)) <= 1 &&
    isDifficultyAtMost(aiDifficulty, ceiling)
      ? aiDifficulty
      : estimated.difficulty;
  const boundedDifficulty = isDifficultyAtMost(metadataSupportedDifficulty, ceiling)
    ? metadataSupportedDifficulty
    : ceiling;
  const complexity = {
    ...estimated.complexity,
    ...(question.cognitiveComplexity ?? {}),
  };
  const reasoningSteps =
    validScale(question.reasoningSteps, 1, 5) ?? estimated.reasoningSteps;

  if (!allowed.includes(boundedDifficulty)) {
    reasons.push(
      `${boundedDifficulty} is not allowed for ${selectedDifficulty}/${questionType}.`,
    );
  }

  if (!isDifficultyAtMost(boundedDifficulty, ceiling)) {
    reasons.push(`${questionType} exceeds its ${ceiling} difficulty ceiling.`);
  }

  if (
    aiDifficulty &&
    !isDifficultyAtMost(aiDifficulty, ceiling) &&
    confidence >= 0.7
  ) {
    reasons.push(
      `AI difficulty metadata ${aiDifficulty} exceeds ${questionType} ceiling ${ceiling}.`,
    );
  }

  if (!isBloomCompatibleWithDifficulty(bloomLevel, boundedDifficulty)) {
    reasons.push(`${bloomLevel} does not align with ${boundedDifficulty} difficulty.`);
  }

  if (isFakeDifficulty(question, boundedDifficulty, reasoningSteps, complexity)) {
    reasons.push("Question appears to inflate difficulty without real reasoning.");
  }

  if (
    aiDifficulty &&
    Math.abs(compareDifficulty(aiDifficulty, boundedDifficulty)) >= 2 &&
    confidence >= 0.7
  ) {
    reasons.push(
      `AI difficulty metadata ${aiDifficulty} conflicts with deterministic estimate ${boundedDifficulty}.`,
    );
  }

  const normalizedQuestion = {
    ...question,
    difficulty: boundedDifficulty,
    bloomLevel,
    reasoningSteps,
    cognitiveComplexity: complexity,
    difficultyConfidence: confidence,
    validatedDifficulty: boundedDifficulty,
  };

  return {
    valid: reasons.length === 0,
    question: normalizedQuestion,
    validatedDifficulty: boundedDifficulty,
    reasons,
  };
}

export function validateFinalDifficultyDistribution(
  questions: GeneratedQuestion[],
  selectedDifficulty: Difficulty,
) {
  const protocol = difficultyProtocols[selectedDifficulty];
  const targets = difficultyTargetsForCount(selectedDifficulty, questions.length);
  const actual = questions.reduce<Record<Difficulty, number>>((acc, question) => {
    const difficulty = normalizeDifficultyLabel(
      question.validatedDifficulty ?? question.difficulty,
    );
    if (difficulty) acc[difficulty] += 1;
    return acc;
  }, emptyDifficultyCounts());
  const total = questions.length;

  for (const difficulty of difficultyOrder) {
    if (difficulty === selectedDifficulty) {
      const minimum = Math.ceil((protocol.mix[difficulty] / 100) * total);
      if (actual[difficulty] < minimum) {
        throw new Error(
          `Final difficulty distribution violates ${selectedDifficulty}: ${difficulty}=${actual[difficulty]}, minimum ${minimum}.`,
        );
      }
      continue;
    }

    const maximum = Math.floor((protocol.mix[difficulty] / 100) * total);
    if (actual[difficulty] > maximum) {
      throw new Error(
        `Final difficulty distribution violates ${selectedDifficulty}: ${difficulty}=${actual[difficulty]}, maximum ${maximum}.`,
      );
    }
  }

  return { actual, targets };
}

export function normalizeDifficultyTargets(
  targets: DifficultyTargets = {},
): Record<Difficulty, number> {
  return difficultyOrder.reduce<Record<Difficulty, number>>((acc, difficulty) => {
    acc[difficulty] = Math.max(0, Math.round(targets[difficulty] ?? 0));
    return acc;
  }, emptyDifficultyCounts());
}

export function subtractDifficultyTargets(
  targets: DifficultyTargets,
  questions: GeneratedQuestion[],
) {
  const remaining = normalizeDifficultyTargets(targets);
  questions.forEach((question) => {
    const difficulty = normalizeDifficultyLabel(
      question.validatedDifficulty ?? question.difficulty,
    );
    if (difficulty) remaining[difficulty] = Math.max(0, remaining[difficulty] - 1);
  });
  return remaining;
}

export function chooseBatchDifficultyTargets(
  remainingTargets: DifficultyTargets,
  batchCount: number,
) {
  const remaining = normalizeDifficultyTargets(remainingTargets);
  const batchTargets = emptyDifficultyCounts();
  let count = Math.max(0, Math.round(batchCount));

  difficultyOrder
    .slice()
    .sort((left, right) => remaining[right] - remaining[left])
    .forEach((difficulty) => {
      if (!count) return;
      const take = Math.min(count, remaining[difficulty]);
      batchTargets[difficulty] = take;
      count -= take;
    });

  return batchTargets;
}

function normalizeBoundedBloom(
  values: Record<BloomLevel, number>,
  bounds: DifficultyProtocol["bloomBounds"],
  selectedDifficulty: Difficulty,
) {
  let total = bloomLevels.reduce((sum, level) => sum + values[level], 0);

  if (total < 100) {
    let remaining = 100 - total;
    const preferred = [
      ...targetBloomLevelsForDifficulty(selectedDifficulty),
      ...bloomLevels,
    ].filter((level, index, levels) => levels.indexOf(level) === index);

    preferred.forEach((level) => {
      if (!remaining) return;
      const capacity = bounds[level].max - values[level];
      const add = Math.min(capacity, remaining);
      values[level] += add;
      remaining -= add;
    });
  }

  total = bloomLevels.reduce((sum, level) => sum + values[level], 0);
  if (total > 100) {
    let excess = total - 100;
    const preferred = new Set(targetBloomLevelsForDifficulty(selectedDifficulty));
    const removalOrder = bloomLevels
      .slice()
      .sort((left, right) => {
        const leftPreferred = preferred.has(left) ? 1 : 0;
        const rightPreferred = preferred.has(right) ? 1 : 0;
        if (leftPreferred !== rightPreferred) return leftPreferred - rightPreferred;
        return bloomRank[left] - bloomRank[right];
      });

    removalOrder.forEach((level) => {
      if (!excess) return;
      const removable = values[level] - bounds[level].min;
      const remove = Math.min(removable, excess);
      values[level] -= remove;
      excess -= remove;
    });
  }

  const finalTotal = bloomLevels.reduce((sum, level) => sum + values[level], 0);
  if (finalTotal !== 100) {
    return { ...difficultyProtocols[selectedDifficulty].bloomDefaults };
  }

  return values;
}

function compactBounds<T extends string>(
  bounds: Record<T, { min: number; max: number }>,
) {
  return Object.fromEntries(
    Object.entries(bounds).map(([key, value]) => [
      key,
      compactRange(value as { min: number; max: number }),
    ]),
  ) as Record<T, [number, number]>;
}

function compactRange(range: { min: number; max: number }): [number, number] {
  return [range.min, range.max];
}

function countsFromPercentages(
  percentages: Record<Difficulty, number>,
  total: number,
  percentageTotal = 100,
) {
  const exact = difficultyOrder.map((difficulty, index) => {
    const value = (percentages[difficulty] / percentageTotal) * total;
    return {
      difficulty,
      index,
      floor: Math.floor(value),
      fraction: value - Math.floor(value),
    };
  });
  const result = emptyDifficultyCounts();

  exact.forEach((item) => {
    result[item.difficulty] = item.floor;
  });

  let assigned = difficultyOrder.reduce((sum, difficulty) => sum + result[difficulty], 0);
  exact
    .sort((left, right) => {
      if (right.fraction !== left.fraction) return right.fraction - left.fraction;
      return left.index - right.index;
    })
    .forEach((item) => {
      if (assigned >= total) return;
      result[item.difficulty] += 1;
      assigned += 1;
    });

  return result;
}

function emptyDifficultyCounts(): Record<Difficulty, number> {
  return { EASY: 0, MEDIUM: 0, HARD: 0, ABSURD: 0 };
}

function capacityForDifficulty(
  difficulty: Difficulty,
  sections: Array<Pick<BlueprintSection, "count">>,
  allowedBySection: Difficulty[][],
) {
  return sections.reduce(
    (sum, section, index) =>
      allowedBySection[index].includes(difficulty) ? sum + section.count : sum,
    0,
  );
}

function bestSectionIndexForDifficulty(
  difficulty: Difficulty,
  remainingBySection: number[],
  allowedBySection: Difficulty[][],
) {
  let bestIndex = -1;
  let bestRemaining = -1;

  remainingBySection.forEach((remaining, index) => {
    if (remaining <= 0 || !allowedBySection[index].includes(difficulty)) return;
    if (remaining > bestRemaining) {
      bestIndex = index;
      bestRemaining = remaining;
    }
  });

  return bestIndex;
}

function bestRemainingSectionIndex(remainingBySection: number[]) {
  let bestIndex = -1;
  let bestRemaining = -1;

  remainingBySection.forEach((remaining, index) => {
    if (remaining > bestRemaining) {
      bestIndex = index;
      bestRemaining = remaining;
    }
  });

  return bestIndex;
}

function chooseDifficultyForSectionRemainder(
  selectedDifficulty: Difficulty,
  allowed: Difficulty[],
  actualTotals: Record<Difficulty, number>,
  total: number,
) {
  if (allowed.includes(selectedDifficulty)) return selectedDifficulty;

  const protocol = difficultyProtocols[selectedDifficulty];
  return protocol.allowed
    .filter((difficulty) => difficulty !== selectedDifficulty)
    .filter((difficulty) => allowed.includes(difficulty))
    .find((difficulty) => {
      const maximum = Math.floor((protocol.mix[difficulty] / 100) * total);
      return actualTotals[difficulty] < maximum;
    });
}

function estimateQuestionDifficulty(
  question: GeneratedQuestion,
  questionType: QuestionType,
) {
  const text = combinedQuestionText(question);
  const bloomLevel = normalizeBloomLevel(question.bloomLevel);
  const typeBase = baseReasoningStepsForType(questionType);
  const reasoningSteps = Math.min(
    5,
    Math.max(1, typeBase + reasoningSignalCount(text)),
  );
  const complexity = estimateCognitiveComplexity(text, questionType, reasoningSteps);
  const score =
    reasoningSteps +
    complexity.conceptIntegration +
    complexity.abstractionLevel +
    complexity.inferenceLevel +
    Math.max(0, bloomRank[bloomLevel] - 1);
  const difficulty = difficultyFromScore(score);

  return { difficulty, reasoningSteps, complexity };
}

function combinedQuestionText(question: GeneratedQuestion) {
  return [
    question.text,
    question.scenario,
    question.assertion,
    question.reason,
    question.correctAnswer,
    question.explanation,
    question.keyPoints?.join(" "),
    question.subQuestions
      ?.map((subQuestion) => `${subQuestion.text} ${subQuestion.correctAnswer}`)
      .join(" "),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function baseReasoningStepsForType(questionType: QuestionType) {
  if (["ONE_WORD", "FILL_BLANK"].includes(questionType)) return 1;
  if (["TRUE_FALSE", "VERY_SHORT"].includes(questionType)) return 1;
  if (["MCQ", "ASSERTION_REASON", "MATCH_FOLLOWING"].includes(questionType)) return 2;
  if (["SHORT", "NUMERICAL", "NCERT_FORMAT"].includes(questionType)) return 2;
  if (["SOURCE_BASED", "CASE_BASED", "PARAGRAPH", "COMPETENCY"].includes(questionType)) {
    return 3;
  }
  if (["HOTS", "PRACTICAL", "LONG", "DIAGRAM"].includes(questionType)) return 3;
  return 2;
}

function reasoningSignalCount(text: string) {
  const signals = [
    /\bwhy\b/,
    /\bhow\b/,
    /\bjustify\b/,
    /\binfer\b/,
    /\banaly[sz]e\b/,
    /\bevaluate\b/,
    /\bpredict\b/,
    /\bcompare\b/,
    /\bcontrast\b/,
    /\bdesign\b/,
    /\bprove\b/,
    /\bderive\b/,
    /\bexplain the relationship\b/,
    /\bwhat would happen if\b/,
    /\bif\b.+\bthen\b/,
  ];

  return Math.min(
    2,
    signals.reduce((count, pattern) => count + Number(pattern.test(text)), 0),
  );
}

function estimateCognitiveComplexity(
  text: string,
  questionType: QuestionType,
  reasoningSteps: number,
): CognitiveComplexity {
  const hasScenario =
    /\bcase\b|\bsource\b|\bpassage\b|\bexperiment\b|\bobservation\b|\bdata\b/.test(
      text,
    );
  const hasSynthesis =
    /\bsynthesi[sz]e\b|\bdesign\b|\bcreate\b|\bderive\b|\bprove\b|\bunfamiliar\b|\bolympiad\b/.test(
      text,
    );
  const hasInference =
    /\binfer\b|\bpredict\b|\bjustify\b|\bevaluate\b|\banaly[sz]e\b|\bwhat would happen\b/.test(
      text,
    );
  const hasCompare = /\bcompare\b|\bcontrast\b|\brelationship\b|\binterdepend/.test(
    text,
  );
  const loadBoost = ["CASE_BASED", "SOURCE_BASED", "HOTS", "LONG"].includes(
    questionType,
  )
    ? 1
    : 0;

  return {
    conceptIntegration: clampScale(1 + Number(hasCompare) + Number(hasSynthesis)),
    abstractionLevel: clampScale(1 + Number(hasSynthesis) + Number(hasScenario)),
    inferenceLevel: clampScale(1 + Number(hasInference) + Number(hasSynthesis)),
    ambiguityLevel: clampScale(1 + Number(/\bmay\b|\bcould\b|\bunknown\b/.test(text))),
    cognitiveLoad: clampScale(Math.ceil(reasoningSteps / 1.2) + loadBoost),
  };
}

function difficultyFromScore(score: number): Difficulty {
  if (score <= 5) return "EASY";
  if (score <= 9) return "MEDIUM";
  if (score <= 13) return "HARD";
  return "ABSURD";
}

function isBloomCompatibleWithDifficulty(
  bloomLevel: BloomLevel,
  difficulty: Difficulty,
) {
  if (difficulty === "EASY") return ["REMEMBER", "UNDERSTAND", "APPLY"].includes(bloomLevel);
  if (difficulty === "MEDIUM") {
    return ["UNDERSTAND", "APPLY", "ANALYZE", "EVALUATE"].includes(bloomLevel);
  }
  if (difficulty === "HARD") {
    return ["APPLY", "ANALYZE", "EVALUATE", "CREATE"].includes(bloomLevel);
  }
  return ["ANALYZE", "EVALUATE", "CREATE"].includes(bloomLevel);
}

function isFakeDifficulty(
  question: GeneratedQuestion,
  difficulty: Difficulty,
  reasoningSteps: number,
  complexity: CognitiveComplexity,
) {
  const text = combinedQuestionText(question);
  const excessiveLength = text.length > 700 && reasoningSteps <= 2;
  const shallowHighDifficulty =
    compareDifficulty(difficulty, "HARD") >= 0 &&
    (reasoningSteps < 2 ||
      complexity.conceptIntegration < 2 ||
      complexity.inferenceLevel < 2);
  const decorativeWords =
    /\bextremely complex\b|\bvery difficult\b|\bconfusing\b|\btricky\b/.test(text) &&
    reasoningSteps <= 2;

  return excessiveLength || shallowHighDifficulty || decorativeWords;
}

function normalizeDifficultyLabel(value: unknown): Difficulty | null {
  return difficultyOrder.includes(value as Difficulty) ? (value as Difficulty) : null;
}

function normalizeBloomLevel(value: unknown): BloomLevel {
  return bloomLevels.includes(value as BloomLevel) ? (value as BloomLevel) : "UNDERSTAND";
}

function normalizeConfidence(value: unknown) {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) return 0.65;
  return Math.max(0, Math.min(1, numberValue));
}

function validScale(value: unknown, min: number, max: number) {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) return undefined;
  const rounded = Math.round(numberValue);
  if (rounded < min || rounded > max) return undefined;
  return rounded;
}

function clampScale(value: number) {
  return Math.max(1, Math.min(5, Math.round(value)));
}
