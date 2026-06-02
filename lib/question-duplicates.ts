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

type QuestionLike = {
  text: string;
  type?: string;
  topic?: string;
  scenario?: string;
  correctAnswer?: string;
  options?: Array<{ id?: string; text?: string; isCorrect?: boolean }>;
  subQuestions?: Array<{
    text?: string;
    correctAnswer?: string;
    options?: Array<{ id?: string; text?: string; isCorrect?: boolean }>;
  }>;
};

export interface DuplicateQuestionMatch<T extends QuestionLike> {
  question: T;
  duplicateOf: QuestionLike;
  reason: string;
}

export function isDuplicateQuestionText(left: string, right: string) {
  const leftNormalized = normalizeQuestionText(left);
  const rightNormalized = normalizeQuestionText(right);

  if (!leftNormalized || !rightNormalized) return false;
  if (leftNormalized === rightNormalized) return true;

  const { ratio, shared } = questionOverlap(leftNormalized, rightNormalized);
  return shared >= 6 && ratio >= 0.76;
}

export function isDuplicateQuestion(left: QuestionLike, right: QuestionLike) {
  return duplicateQuestionReason(left, right) !== null;
}

export function duplicateQuestionReason(left: QuestionLike, right: QuestionLike) {
  if (isDuplicateQuestionText(left.text, right.text)) {
    return "near-duplicate question stem";
  }

  const sameType = normalizeSmall(left.type) === normalizeSmall(right.type);
  const sameTopic = normalizeSmall(left.topic) === normalizeSmall(right.topic);
  const comparableScope = sameType && (!left.topic || !right.topic || sameTopic);

  if (
    comparableScope &&
    left.scenario &&
    right.scenario &&
    isDuplicateQuestionText(left.scenario, right.scenario)
  ) {
    return "near-duplicate scenario";
  }

  const leftAnswer = answerSignature(left);
  const rightAnswer = answerSignature(right);
  if (
    comparableScope &&
    leftAnswer &&
    rightAnswer &&
    isMeaningfulAnswerSignature(leftAnswer) &&
    isDuplicateQuestionText(leftAnswer, rightAnswer)
  ) {
    return "repeated answer path";
  }

  const leftOptions = optionSignature(left.options);
  const rightOptions = optionSignature(right.options);
  if (
    comparableScope &&
    leftOptions &&
    rightOptions &&
    isMeaningfulOptionSignature(leftOptions) &&
    leftOptions === rightOptions
  ) {
    return "repeated option pattern";
  }

  const leftSubQuestions = subQuestionSignature(left);
  const rightSubQuestions = subQuestionSignature(right);
  if (
    comparableScope &&
    leftSubQuestions &&
    rightSubQuestions &&
    isDuplicateQuestionText(leftSubQuestions, rightSubQuestions)
  ) {
    return "near-duplicate sub-question pattern";
  }

  return null;
}

export function uniqueQuestionsByText<T extends QuestionLike>(
  questions: T[],
  existingQuestions: QuestionLike[] = [],
) {
  return partitionUniqueQuestionsByText(questions, existingQuestions).unique;
}

export function partitionUniqueQuestionsByText<T extends QuestionLike>(
  questions: T[],
  existingQuestions: QuestionLike[] = [],
) {
  const detailed = partitionUniqueQuestionsByNovelty(questions, existingQuestions);
  return {
    unique: detailed.unique,
    duplicates: detailed.duplicates.map((item) => item.question),
  };
}

export function partitionUniqueQuestionsByNovelty<T extends QuestionLike>(
  questions: T[],
  existingQuestions: QuestionLike[] = [],
) {
  const selected: T[] = [];
  const duplicates: Array<DuplicateQuestionMatch<T>> = [];

  for (const question of questions) {
    const duplicate = findDuplicateQuestion(question, [
      ...existingQuestions,
      ...selected,
    ]);

    if (duplicate) {
      duplicates.push({ question, ...duplicate });
    } else {
      selected.push(question);
    }
  }

  return { unique: selected, duplicates };
}

export function questionNoveltyFingerprint(question: QuestionLike) {
  return [
    question.text,
    question.scenario,
    question.correctAnswer,
    question.options?.map((option) => option.text).join(" | "),
    question.subQuestions
      ?.map((item) => `${item.text ?? ""} ${item.correctAnswer ?? ""}`)
      .join(" | "),
  ]
    .filter(Boolean)
    .join(" || ")
    .slice(0, 500);
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

function findDuplicateQuestion(question: QuestionLike, existingQuestions: QuestionLike[]) {
  for (const existing of existingQuestions) {
    const reason = duplicateQuestionReason(existing, question);
    if (reason) return { duplicateOf: existing, reason };
  }

  return null;
}

function answerSignature(question: QuestionLike) {
  const subAnswers =
    question.subQuestions
      ?.map((item) => item.correctAnswer)
      .filter((value): value is string => Boolean(value?.trim()))
      .join(" | ") ?? "";
  return normalizeQuestionText([question.correctAnswer, subAnswers].filter(Boolean).join(" | "));
}

function optionSignature(options: QuestionLike["options"]) {
  if (!options?.length) return "";
  return options
    .map((option) =>
      normalizeQuestionText(`${option.id ?? ""}:${option.text ?? ""}:${option.isCorrect ? "1" : "0"}`),
    )
    .join("|");
}

function subQuestionSignature(question: QuestionLike) {
  if (!question.subQuestions?.length) return "";
  return question.subQuestions
    .map((item) =>
      normalizeQuestionText(
        [
          item.text,
          item.correctAnswer,
          optionSignature(item.options),
        ]
          .filter(Boolean)
          .join(" "),
      ),
    )
    .join(" | ");
}

function isMeaningfulAnswerSignature(value: string) {
  const words = uniqueQuestionWords(value);
  return value.length >= 24 && words.size >= 4;
}

function isMeaningfulOptionSignature(value: string) {
  const words = uniqueQuestionWords(value);
  if (words.size < 5 || value.length < 40) return false;
  return !/^a option a false\|b option b true\|c option c false\|d option d false$/.test(
    value,
  );
}

function normalizeSmall(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
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
