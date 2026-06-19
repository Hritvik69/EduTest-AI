import type { MCQOption } from "@/types";

const optionIds = ["A", "B", "C", "D"] as const;

export function deterministicMcqOptionShuffle(
  options: MCQOption[],
  seed: string,
  sequence?: number,
) {
  const len = options.length;
  if (len === 0) return { options: [], correctAnswer: "" };

  const normalized = options.slice(0, 4);
  const correct = normalized.find((option) => option.isCorrect) ?? normalized[0];
  const distractors = deterministicShuffle(
    normalized.filter((option) => option !== correct),
    `${seed}:distractors`,
  );
  const correctIndex = Number.isFinite(sequence)
    ? positiveModulo(Number(sequence), normalized.length)
    : positiveModulo(stableHash(seed), normalized.length);
  const arranged: MCQOption[] = [];
  arranged[correctIndex] = correct;

  let distractorIndex = 0;
  for (let index = 0; index < normalized.length; index += 1) {
    if (arranged[index]) continue;
    arranged[index] = distractors[distractorIndex] ?? normalized[distractorIndex];
    distractorIndex += 1;
  }

  const shuffledOptions = arranged.map((option, index) => ({
    ...option,
    id: optionIds[index] ?? String.fromCharCode(65 + index),
    isCorrect: index === correctIndex,
  }));

  return {
    options: shuffledOptions,
    correctAnswer: shuffledOptions[correctIndex]?.id ?? "",
  };
}

function deterministicShuffle<T>(items: T[], seed: string) {
  return items
    .map((item, index) => ({
      item,
      score: stableHash(`${seed}:${index}`),
    }))
    .sort((left, right) => left.score - right.score)
    .map(({ item }) => item);
}

function stableHash(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash >>> 0;
}

function positiveModulo(value: number, divisor: number) {
  return ((Math.floor(value) % divisor) + divisor) % divisor;
}
