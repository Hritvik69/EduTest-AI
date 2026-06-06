import type { MatchPair } from "@/types";

export type MatchDisplayItem = {
  label: string;
  text: string;
  pairIndex: number;
};

export type MatchDisplayColumns = {
  leftItems: MatchDisplayItem[];
  rightItems: MatchDisplayItem[];
  answerKey: string;
};

export function buildShuffledMatchAnswer(
  pairs: MatchPair[],
  seed: string,
) {
  const order = deterministicMatchOrder(pairs.length, seed);
  return pairs
    .map((_, pairIndex) => `A${pairIndex + 1}-B${order.indexOf(pairIndex) + 1}`)
    .join(", ");
}

export function normalizeMatchAnswerKey(
  pairs: MatchPair[],
  correctAnswer: string | undefined,
  seed: string,
) {
  if (!pairs.length) return correctAnswer ?? "";
  if (
    !hasCompleteMatchAnswer(correctAnswer ?? "", pairs.length) ||
    isIdentityMatchAnswer(correctAnswer ?? "", pairs.length)
  ) {
    return buildShuffledMatchAnswer(pairs, seed);
  }

  return displayedMatchColumns(pairs, correctAnswer).answerKey;
}

export function isIdentityMatchAnswer(answer: string | undefined, length: number) {
  if (length <= 1) return false;
  const mapping = parseMatchAnswer(answer ?? "", length);
  if (mapping.size !== length) return false;

  for (let index = 0; index < length; index += 1) {
    if (mapping.get(index) !== index) return false;
  }
  return true;
}

export function displayedMatchColumns(
  pairs: MatchPair[] = [],
  correctAnswer = "",
): MatchDisplayColumns {
  const leftItems = pairs.map((pair, index) => ({
    label: `A${index + 1}`,
    text: pair.left,
    pairIndex: index,
  }));
  const answerMap = parseMatchAnswer(correctAnswer, pairs.length);
  const rightByDisplayIndex: Array<MatchDisplayItem | undefined> = [];
  const usedPairIndexes = new Set<number>();

  answerMap.forEach((displayIndex, pairIndex) => {
    if (
      pairIndex < 0 ||
      pairIndex >= pairs.length ||
      displayIndex < 0 ||
      displayIndex >= pairs.length ||
      usedPairIndexes.has(pairIndex) ||
      rightByDisplayIndex[displayIndex]
    ) {
      return;
    }
    rightByDisplayIndex[displayIndex] = {
      label: `B${displayIndex + 1}`,
      text: pairs[pairIndex]?.right ?? "",
      pairIndex,
    };
    usedPairIndexes.add(pairIndex);
  });

  pairs.forEach((pair, pairIndex) => {
    if (usedPairIndexes.has(pairIndex)) return;
    const displayIndex = firstEmptyIndex(rightByDisplayIndex, pairs.length);
    rightByDisplayIndex[displayIndex] = {
      label: `B${displayIndex + 1}`,
      text: pair.right,
      pairIndex,
    };
    usedPairIndexes.add(pairIndex);
  });

  const rightItems = rightByDisplayIndex
    .slice(0, pairs.length)
    .map((item, index) => ({
      label: `B${index + 1}`,
      text: item?.text ?? "",
      pairIndex: item?.pairIndex ?? index,
    }));

  return {
    leftItems,
    rightItems,
    answerKey: pairs
      .map((_, pairIndex) => {
        const displayIndex = rightItems.findIndex(
          (item) => item.pairIndex === pairIndex,
        );
        return `A${pairIndex + 1}-B${displayIndex + 1}`;
      })
      .join(", "),
  };
}

function hasCompleteMatchAnswer(answer: string, length: number) {
  const mapping = parseMatchAnswer(answer, length);
  if (mapping.size !== length) return false;
  return new Set(mapping.values()).size === length;
}

function deterministicMatchOrder(length: number, seed: string) {
  const order = Array.from({ length }, (_, index) => index)
    .map((index) => ({
      index,
      score: stableHash(`${seed}:${index}`),
    }))
    .sort((left, right) => left.score - right.score)
    .map((item) => item.index);

  if (length > 1 && order.every((item, index) => item === index)) {
    return [...order.slice(1), order[0]];
  }
  return order;
}

function parseMatchAnswer(answer: string, length: number) {
  const mapping = new Map<number, number>();
  const pattern = /A\s*(\d+)\s*[-:=]\s*B\s*(\d+)/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(answer)) !== null) {
    const pairIndex = Number(match[1]) - 1;
    const displayIndex = Number(match[2]) - 1;
    if (
      Number.isInteger(pairIndex) &&
      Number.isInteger(displayIndex) &&
      pairIndex >= 0 &&
      pairIndex < length &&
      displayIndex >= 0 &&
      displayIndex < length
    ) {
      mapping.set(pairIndex, displayIndex);
    }
  }
  return mapping;
}

function firstEmptyIndex<T>(items: Array<T | undefined>, length: number) {
  for (let index = 0; index < length; index += 1) {
    if (!items[index]) return index;
  }
  return Math.max(0, Math.min(items.length, length - 1));
}

function stableHash(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash >>> 0;
}
