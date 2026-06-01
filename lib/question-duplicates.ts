const stopWords = new Set([
  "about",
  "above",
  "after",
  "answer",
  "based",
  "best",
  "choose",
  "correct",
  "describe",
  "does",
  "each",
  "explain",
  "explains",
  "following",
  "from",
  "given",
  "happen",
  "happens",
  "most",
  "question",
  "read",
  "reason",
  "statement",
  "student",
  "which",
  "with",
  "would",
]);

export function isDuplicateQuestionText(left: string, right: string) {
  const leftNormalized = normalizeQuestionText(left);
  const rightNormalized = normalizeQuestionText(right);

  if (!leftNormalized || !rightNormalized) return false;
  if (leftNormalized === rightNormalized) return true;

  const { ratio, shared } = questionOverlap(leftNormalized, rightNormalized);
  return shared >= 6 && ratio >= 0.76;
}

export function uniqueQuestionsByText<T extends { text: string }>(
  questions: T[],
  existingQuestions: { text: string }[] = [],
) {
  return partitionUniqueQuestionsByText(questions, existingQuestions).unique;
}

export function partitionUniqueQuestionsByText<T extends { text: string }>(
  questions: T[],
  existingQuestions: { text: string }[] = [],
) {
  const selected: T[] = [];
  const duplicates: T[] = [];

  for (const question of questions) {
    const duplicate = [...existingQuestions, ...selected].some((existing) =>
      isDuplicateQuestionText(existing.text, question.text),
    );

    if (duplicate) {
      duplicates.push(question);
    } else {
      selected.push(question);
    }
  }

  return { unique: selected, duplicates };
}

export function questionOverlap(left: string, right: string) {
  const leftWords = uniqueQuestionWords(left);
  const rightWords = uniqueQuestionWords(right);
  if (!leftWords.size || !rightWords.size) return { ratio: 0, shared: 0 };

  let shared = 0;
  leftWords.forEach((word) => {
    if (rightWords.has(word)) shared += 1;
  });

  return {
    ratio: shared / Math.min(leftWords.size, rightWords.size),
    shared,
  };
}

function normalizeQuestionText(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function uniqueQuestionWords(value: string) {
  return new Set(
    value
      .split(/\s+/)
      .filter((word) => word.length > 3 && !stopWords.has(word)),
  );
}
