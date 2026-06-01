import type {
  Blueprint,
  BlueprintSection,
  PaperConfig,
  QuestionCompositionItem,
} from "@/types";

export type QuestionCompositionUnit = Omit<
  QuestionCompositionItem,
  "questionCount"
>;

export interface SectionCompositionPlan {
  section: BlueprintSection;
  allocations: {
    item: QuestionCompositionItem;
    count: number;
  }[];
}

export function compositionKey(item: QuestionCompositionUnit) {
  return [
    item.subject.trim().toLowerCase(),
    item.chapterId ?? "",
    item.chapterName?.trim().toLowerCase() ?? "",
    item.topicId ?? "",
    item.topicName?.trim().toLowerCase() ?? "",
  ].join("|");
}

export function normalizeQuestionComposition(
  units: QuestionCompositionUnit[],
  current: QuestionCompositionItem[] = [],
  totalQuestions: number,
) {
  const uniqueUnits = uniqueCompositionUnits(units);
  if (!uniqueUnits.length) return [];

  const targetTotal = clampQuestionTotal(totalQuestions);
  const currentByKey = new Map(
    current.map((item) => [compositionKey(item), item.questionCount]),
  );
  const preferred = uniqueUnits.reduce<Record<string, number>>((acc, unit) => {
    acc[compositionKey(unit)] = Math.max(
      0,
      Math.round(currentByKey.get(compositionKey(unit)) ?? 0),
    );
    return acc;
  }, {});
  const counts = normalizeCounts(
    uniqueUnits.map(compositionKey),
    preferred,
    targetTotal,
  );

  return uniqueUnits.map((unit) => ({
    ...unit,
    questionCount: counts[compositionKey(unit)] ?? 0,
  }));
}

export function adjustQuestionComposition(
  composition: QuestionCompositionItem[],
  targetKey: string,
  value: number,
  totalQuestions: number,
) {
  if (!composition.length) return [];

  const targetTotal = clampQuestionTotal(totalQuestions);
  const keys = composition.map(compositionKey);
  const current = composition.reduce<Record<string, number>>((acc, item) => {
    acc[compositionKey(item)] = Math.max(0, Math.round(item.questionCount));
    return acc;
  }, {});
  const safeValue = Math.max(0, Math.min(targetTotal, Math.round(value)));
  const otherKeys = keys.filter((key) => key !== targetKey);

  if (!otherKeys.length) {
    return [{ ...composition[0], questionCount: targetTotal }];
  }

  const remaining = targetTotal - safeValue;
  const otherTotal = otherKeys.reduce((sum, key) => sum + (current[key] ?? 0), 0);
  const otherCounts = otherTotal
    ? scaleCountsToTotal(otherKeys, current, otherTotal, remaining)
    : normalizeCounts(otherKeys, {}, remaining);

  return composition.map((item) => {
    const key = compositionKey(item);
    return {
      ...item,
      questionCount: key === targetKey ? safeValue : (otherCounts[key] ?? 0),
    };
  });
}

export function buildQuestionCompositionPlan(
  blueprint: Blueprint,
  composition: QuestionCompositionItem[] = [],
): SectionCompositionPlan[] {
  const activeComposition = normalizeQuestionComposition(
    composition,
    composition,
    blueprint.totalQuestions,
  ).filter((item) => item.questionCount > 0);

  if (!activeComposition.length) {
    return blueprint.sections.map((section) => ({
      section,
      allocations: [],
    }));
  }

  const totalQuestions = Math.max(1, blueprint.totalQuestions);
  const cells = activeComposition.flatMap((item, rowIndex) =>
    blueprint.sections.map((section, columnIndex) => {
      const exact = (item.questionCount * section.count) / totalQuestions;
      return {
        rowIndex,
        columnIndex,
        floor: Math.floor(exact),
        fraction: exact - Math.floor(exact),
      };
    }),
  );
  const matrix = activeComposition.map(() =>
    blueprint.sections.map(() => 0),
  );
  const rowRemaining = activeComposition.map((item) => item.questionCount);
  const columnRemaining = blueprint.sections.map((section) => section.count);

  cells.forEach((cell) => {
    matrix[cell.rowIndex][cell.columnIndex] = cell.floor;
    rowRemaining[cell.rowIndex] -= cell.floor;
    columnRemaining[cell.columnIndex] -= cell.floor;
  });

  cells
    .sort((left, right) => right.fraction - left.fraction)
    .forEach((cell) => {
      if (
        rowRemaining[cell.rowIndex] <= 0 ||
        columnRemaining[cell.columnIndex] <= 0
      ) {
        return;
      }

      matrix[cell.rowIndex][cell.columnIndex] += 1;
      rowRemaining[cell.rowIndex] -= 1;
      columnRemaining[cell.columnIndex] -= 1;
    });

  return blueprint.sections.map((section, columnIndex) => ({
    section,
    allocations: activeComposition
      .map((item, rowIndex) => ({
        item,
        count: matrix[rowIndex][columnIndex],
      }))
      .filter((allocation) => allocation.count > 0),
  }));
}

export function questionCompositionTotal(config: Pick<PaperConfig, "questionComposition">) {
  return (config.questionComposition ?? []).reduce(
    (sum, item) => sum + item.questionCount,
    0,
  );
}

function uniqueCompositionUnits(units: QuestionCompositionUnit[]) {
  const seen = new Set<string>();
  const unique: QuestionCompositionUnit[] = [];

  units.forEach((unit) => {
    const key = compositionKey(unit);
    if (seen.has(key)) return;
    seen.add(key);
    unique.push(unit);
  });

  return unique;
}

function clampQuestionTotal(totalQuestions: number) {
  return Math.max(0, Math.round(totalQuestions));
}

function normalizeCounts(
  keys: string[],
  input: Record<string, number>,
  totalQuestions: number,
) {
  if (!keys.length) return {};

  const sanitized = keys.reduce<Record<string, number>>((acc, key) => {
    acc[key] = Math.max(0, Math.round(input[key] ?? 0));
    return acc;
  }, {});
  const selectedTotal = keys.reduce((sum, key) => sum + (sanitized[key] ?? 0), 0);

  if (selectedTotal === totalQuestions) return sanitized;
  if (selectedTotal > 0) {
    return scaleCountsToTotal(keys, sanitized, selectedTotal, totalQuestions);
  }

  const even = Math.floor(totalQuestions / keys.length);
  const result: Record<string, number> = {};
  let remainder = totalQuestions - even * keys.length;

  keys.forEach((key) => {
    result[key] = even + (remainder > 0 ? 1 : 0);
    remainder -= 1;
  });

  return result;
}

function scaleCountsToTotal(
  keys: string[],
  counts: Record<string, number>,
  currentTotal: number,
  targetTotal: number,
) {
  const scaled = keys.map((key, index) => {
    const exact = ((counts[key] ?? 0) / currentTotal) * targetTotal;
    return {
      key,
      index,
      floor: Math.floor(exact),
      fraction: exact - Math.floor(exact),
    };
  });
  const result: Record<string, number> = {};

  scaled.forEach((item) => {
    result[item.key] = item.floor;
  });

  let assigned = keys.reduce((sum, key) => sum + (result[key] ?? 0), 0);
  scaled
    .sort((left, right) => {
      if (right.fraction !== left.fraction) return right.fraction - left.fraction;
      return left.index - right.index;
    })
    .forEach((item) => {
      if (assigned >= targetTotal) return;
      result[item.key] = (result[item.key] ?? 0) + 1;
      assigned += 1;
    });

  return result;
}
