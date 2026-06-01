import {
  allowedDifficultiesForFormat,
  difficultyMixFor,
  normalizeBloomDistributionForDifficulty,
} from "@/lib/difficulty-protocol";
import type {
  Blueprint,
  BlueprintSection,
  PaperConfig,
  QuestionType,
} from "@/types";

export const marksPerType: Record<QuestionType, number> = {
  MCQ: 1,
  ASSERTION_REASON: 1,
  TRUE_FALSE: 1,
  ONE_WORD: 1,
  FILL_BLANK: 1,
  VERY_SHORT: 2,
  MATCH_FOLLOWING: 3,
  SHORT: 3,
  NUMERICAL: 3,
  SOURCE_BASED: 4,
  CASE_BASED: 4,
  PARAGRAPH: 4,
  HOTS: 4,
  COMPETENCY: 4,
  DIAGRAM: 5,
  PRACTICAL: 5,
  LONG: 5,
  NCERT_FORMAT: 2,
};

const replacementOrderByMarks: Record<number, QuestionType[]> = {
  1: ["MCQ", "ASSERTION_REASON", "TRUE_FALSE", "ONE_WORD", "FILL_BLANK"],
  2: ["NCERT_FORMAT", "VERY_SHORT"],
  3: ["NUMERICAL", "SHORT", "MATCH_FOLLOWING"],
  4: ["HOTS", "COMPETENCY", "CASE_BASED", "SOURCE_BASED", "PARAGRAPH"],
  5: ["DIAGRAM", "PRACTICAL", "LONG"],
};

export function normalizeQuestionFormatsForDifficulty(
  config: PaperConfig,
): PaperConfig {
  if (!config.questionTypes.length) return config;

  const replacements = new Map<QuestionType, QuestionType>();

  config.questionTypes.forEach((type) => {
    if (allowedDifficultiesForFormat(config.difficulty, type).length) return;

    const marks = marksPerType[type];
    const replacement = replacementOrderByMarks[marks]?.find(
      (candidate) =>
        candidate !== type &&
        allowedDifficultiesForFormat(config.difficulty, candidate).length,
    );

    if (replacement) {
      replacements.set(type, replacement);
    }
  });

  if (!replacements.size) return config;

  const nextTypes: QuestionType[] = [];
  const nextDistribution: PaperConfig["typeDistribution"] = {
    ...config.typeDistribution,
  };

  config.questionTypes.forEach((type) => {
    const replacement = replacements.get(type) ?? type;

    if (!nextTypes.includes(replacement)) {
      nextTypes.push(replacement);
    }

    if (replacement !== type) {
      nextDistribution[replacement] =
        (nextDistribution[replacement] ?? 0) + (nextDistribution[type] ?? 0);
      delete nextDistribution[type];
    }
  });

  return {
    ...config,
    questionTypes: nextTypes,
    typeDistribution: nextDistribution,
  };
}

export function buildBlueprint(config: PaperConfig): Blueprint {
  return generateBlueprint(config);
}

export function generateBlueprint(config: PaperConfig): Blueprint {
  const normalizedConfig = normalizeQuestionFormatsForDifficulty(config);
  const selectedTypes: QuestionType[] = normalizedConfig.questionTypes.length
    ? normalizedConfig.questionTypes
    : ["MCQ", "SHORT", "CASE_BASED", "LONG"];
  const counts = normalizeQuestionCountDistribution(
    selectedTypes,
    normalizedConfig.typeDistribution,
    normalizedConfig.totalQuestions,
  );
  const bloomBreakdown = normalizeBloomDistributionForDifficulty(
    normalizedConfig.difficulty,
    normalizedConfig.bloomDistribution,
  );

  const sections: BlueprintSection[] = selectedTypes
    .filter((questionType) => (counts[questionType] ?? 0) > 0)
    .map((questionType) => {
      const marks = marksPerType[questionType];
      const count = counts[questionType] ?? 0;
      return {
        name: sectionForMarks(marks),
        questionType,
        count,
        marksPerQuestion: marks,
        totalMarks: count * marks,
        difficulty: normalizedConfig.difficulty,
        difficultyBreakdown: difficultyMixFor(normalizedConfig.difficulty),
        bloomBreakdown,
      };
    });

  return {
    sections,
    totalQuestions: sections.reduce((sum, section) => sum + section.count, 0),
    totalMarks: sections.reduce((sum, section) => sum + section.totalMarks, 0),
    estimatedTime: normalizedConfig.duration,
    competencyPercentage: Math.round(
      (bloomBreakdown.APPLY +
        bloomBreakdown.ANALYZE +
        bloomBreakdown.EVALUATE +
        bloomBreakdown.CREATE) /
        1,
    ),
  };
}

export function normalizeQuestionCountDistribution(
  types: PaperConfig["questionTypes"],
  input: PaperConfig["typeDistribution"],
  totalQuestions: number,
): Partial<Record<QuestionType, number>> {
  if (!types.length) return {};

  const questionTarget = Math.max(1, Math.round(totalQuestions));
  return normalizePreferredQuestionCounts(
    types,
    input,
    questionTarget,
  );
}

export function balancedQuestionCounts(
  types: PaperConfig["questionTypes"],
  input: PaperConfig["typeDistribution"],
  totalQuestions: number,
) {
  return normalizePreferredQuestionCounts(
    types,
    input,
    Math.max(1, Math.round(totalQuestions)),
  );
}

export function adjustQuestionCountDistribution(
  current: PaperConfig["typeDistribution"],
  types: PaperConfig["questionTypes"],
  target: QuestionType,
  value: number,
  totalQuestions: number,
) {
  const questionTarget = Math.max(1, Math.round(totalQuestions));
  const baseCounts = normalizePreferredQuestionCounts(types, current, questionTarget);
  const targetCount = Math.max(0, Math.min(questionTarget, Math.round(value)));
  const others = types.filter((type) => type !== target);

  if (!others.length) return { [target]: questionTarget };

  const remaining = questionTarget - targetCount;
  const otherTotal = others.reduce((sum, type) => sum + (baseCounts[type] ?? 0), 0);
  const otherCounts = otherTotal
    ? scaleCountsToTotal(others, baseCounts, otherTotal, remaining)
    : normalizePreferredQuestionCounts(others, {}, remaining);

  return {
    ...otherCounts,
    [target]: targetCount,
  };
}

function normalizePreferredQuestionCounts(
  types: PaperConfig["questionTypes"],
  input: PaperConfig["typeDistribution"],
  totalQuestions: number,
) {
  const sanitized = types.reduce<PaperConfig["typeDistribution"]>((acc, type) => {
    acc[type] = Math.max(0, Math.round(input[type] ?? 0));
    return acc;
  }, {});
  const selectedTotal = types.reduce((sum, type) => sum + (sanitized[type] ?? 0), 0);

  if (selectedTotal === totalQuestions) return sanitized;

  if (selectedTotal > 0) {
    return scaleCountsToTotal(types, sanitized, selectedTotal, totalQuestions);
  }

  const even = Math.floor(totalQuestions / types.length);
  const result: PaperConfig["typeDistribution"] = {};
  let remainder = totalQuestions - even * types.length;

  types.forEach((type) => {
    result[type] = even + (remainder > 0 ? 1 : 0);
    remainder -= 1;
  });

  return result;
}

function scaleCountsToTotal(
  types: PaperConfig["questionTypes"],
  counts: PaperConfig["typeDistribution"],
  currentTotal: number,
  targetTotal: number,
) {
  const scaled = types.map((type, index) => {
    const exact = ((counts[type] ?? 0) / currentTotal) * targetTotal;
    return {
      type,
      index,
      floor: Math.floor(exact),
      fraction: exact - Math.floor(exact),
    };
  });
  const result: PaperConfig["typeDistribution"] = {};

  scaled.forEach((item) => {
    result[item.type] = item.floor;
  });

  let assigned = types.reduce((sum, type) => sum + (result[type] ?? 0), 0);
  scaled
    .sort((left, right) => {
      if (right.fraction !== left.fraction) return right.fraction - left.fraction;
      return left.index - right.index;
    })
    .forEach((item) => {
      if (assigned >= targetTotal) return;
      result[item.type] = (result[item.type] ?? 0) + 1;
      assigned += 1;
    });

  return result;
}

export function marksForQuestionCounts(
  types: QuestionType[],
  counts: PaperConfig["typeDistribution"],
) {
  return types.reduce((sum, type) => sum + (counts[type] ?? 0) * marksPerType[type], 0);
}

function sectionForMarks(marks: number) {
  if (marks === 1) return "Section A";
  if (marks <= 3) return "Section B/C";
  if (marks === 4) return "Section D";
  return "Section E";
}
