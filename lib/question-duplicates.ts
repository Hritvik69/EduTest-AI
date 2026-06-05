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
  subject?: string;
  topic?: string;
  scenario?: string;
  correctAnswer?: string;
  explanation?: string;
  keyPoints?: string[];
  options?: Array<{ id?: string; text?: string; isCorrect?: boolean }>;
  subQuestions?: Array<{
    text?: string;
    correctAnswer?: string;
    options?: Array<{ id?: string; text?: string; isCorrect?: boolean }>;
  }>;
  noveltyAngle?: string;
  sourceChunkFocus?: string;
  answerPath?: string;
};

type DuplicateReasonKind = "hard" | "soft";

export type DuplicateQuestionDecision = {
  duplicate: boolean;
  reason: string | null;
  kind?: DuplicateReasonKind;
  allowedSoftSimilarity?: string;
  distinctnessProof?: SourceBackedDistinctnessProof;
  numericDistinctnessProof?: NumericDistinctnessProof;
};

export type SourceBackedCompletionMetadata = {
  marker: "SOURCE_BACKED_COMPLETION";
  type: string;
  angleId: string;
  atomId: string;
  sequence: string;
};

export type SourceBackedDistinctnessProof = {
  sourceBackedInvolved: boolean;
  bothSourceBacked: boolean;
  sourceBackedMetadataComplete: boolean;
  differentAtom: boolean;
  differentAngle: boolean;
  differentSourceChunkFocus: boolean;
  differentAnswerPath: boolean;
  differentScenario: boolean;
  differentOptionSignature: boolean;
  differentSubQuestionSignature: boolean;
  repeatedAnswerPath: boolean;
  hasStructuralDifference: boolean;
  score: number;
  allowSoftSimilarity: boolean;
};

export type NumericDistinctnessProof = {
  numericalInvolved: boolean;
  leftNumerical: boolean;
  rightNumerical: boolean;
  leftNumbers: string[];
  rightNumbers: string[];
  leftFinalAnswer?: string;
  rightFinalAnswer?: string;
  numericTupleDiffers: boolean;
  finalAnswerDiffers: boolean;
  answerPathDiffers: boolean;
  hasCalculationSignal: boolean;
  allowSoftSimilarity: boolean;
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
  return duplicateQuestionDecision(left, right).reason;
}

export function duplicateQuestionDecision(
  left: QuestionLike,
  right: QuestionLike,
): DuplicateQuestionDecision {
  const hardReason = hardDuplicateReason(left, right);
  if (hardReason) {
    return { duplicate: true, reason: hardReason, kind: "hard" };
  }

  const softReason = softSimilarityReason(left, right);
  if (!softReason) {
    return { duplicate: false, reason: null };
  }

  const numericProof = numericDistinctnessProof(left, right);
  if (numericProof.allowSoftSimilarity) {
    return {
      duplicate: false,
      reason: null,
      allowedSoftSimilarity: softReason,
      numericDistinctnessProof: numericProof,
    };
  }

  const distinctnessProof = sourceBackedDistinctnessProof(left, right);
  if (distinctnessProof.allowSoftSimilarity) {
    return {
      duplicate: false,
      reason: null,
      allowedSoftSimilarity: softReason,
      distinctnessProof,
    };
  }

  return {
    duplicate: true,
    reason: softReason,
    kind: "soft",
    distinctnessProof: distinctnessProof.sourceBackedInvolved
      ? distinctnessProof
      : undefined,
    numericDistinctnessProof: numericProof.numericalInvolved
      ? numericProof
      : undefined,
  };
}

export function hardDuplicateReason(left: QuestionLike, right: QuestionLike) {
  const leftText = normalizeQuestionText(left.text);
  const rightText = normalizeQuestionText(right.text);
  if (leftText && rightText && leftText === rightText) {
    return "exact question stem";
  }

  const leftScenario = normalizeQuestionText(left.scenario ?? "");
  const rightScenario = normalizeQuestionText(right.scenario ?? "");
  if (leftScenario && rightScenario && leftScenario === rightScenario) {
    return "exact scenario";
  }

  const leftOptions = optionSignature(left.options);
  const rightOptions = optionSignature(right.options);
  if (
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
    leftSubQuestions &&
    rightSubQuestions &&
    leftSubQuestions === rightSubQuestions
  ) {
    return "repeated sub-question pattern";
  }

  const leftNovelty = normalizeQuestionText(left.noveltyAngle ?? "");
  const rightNovelty = normalizeQuestionText(right.noveltyAngle ?? "");
  if (leftNovelty && rightNovelty && leftNovelty === rightNovelty) {
    return "repeated novelty angle";
  }

  const leftMetadata = parseSourceBackedCompletionMetadata(left.noveltyAngle);
  const rightMetadata = parseSourceBackedCompletionMetadata(right.noveltyAngle);
  if (
    leftMetadata &&
    rightMetadata &&
    normalizeSmall(leftMetadata.angleId) === normalizeSmall(rightMetadata.angleId) &&
    normalizeSmall(leftMetadata.atomId) === normalizeSmall(rightMetadata.atomId)
  ) {
    return "repeated source-backed angle";
  }

  const leftSourceKey = sourceBackedUniquenessKeyFromMetadata(leftMetadata);
  const rightSourceKey = sourceBackedUniquenessKeyFromMetadata(rightMetadata);
  if (leftSourceKey && rightSourceKey && leftSourceKey === rightSourceKey) {
    return "repeated source-backed atom";
  }

  if (
    leftMetadata &&
    rightMetadata &&
    normalizeSmall(leftMetadata.atomId) === normalizeSmall(rightMetadata.atomId) &&
    !numericDistinctnessProof(left, right).allowSoftSimilarity
  ) {
    return "repeated source-backed atom";
  }

  const leftAnswerPath = normalizeQuestionText(left.answerPath ?? "");
  const rightAnswerPath = normalizeQuestionText(right.answerPath ?? "");
  if (
    leftAnswerPath &&
    rightAnswerPath &&
    isMeaningfulAnswerSignature(leftAnswerPath) &&
    leftAnswerPath === rightAnswerPath
  ) {
    return "repeated answer path metadata";
  }

  const numericalDuplicate = hardNumericalDuplicateReason(left, right);
  if (numericalDuplicate) return numericalDuplicate;

  return null;
}

export function softSimilarityReason(left: QuestionLike, right: QuestionLike) {
  if (isDuplicateQuestionText(left.text, right.text)) {
    return "near-duplicate question stem";
  }

  const comparableScope = comparableQuestionScope(left, right);

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
    return "similar answer content";
  }

  const leftAnswerPath = normalizeQuestionText(left.answerPath ?? "");
  const rightAnswerPath = normalizeQuestionText(right.answerPath ?? "");
  if (
    comparableScope &&
    leftAnswerPath &&
    rightAnswerPath &&
    isMeaningfulAnswerSignature(leftAnswerPath) &&
    isDuplicateQuestionText(leftAnswerPath, rightAnswerPath)
  ) {
    return "similar answer path metadata";
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

export function sourceBackedDistinctnessProof(
  left: QuestionLike,
  right: QuestionLike,
): SourceBackedDistinctnessProof {
  const leftMetadata = parseSourceBackedCompletionMetadata(left.noveltyAngle);
  const rightMetadata = parseSourceBackedCompletionMetadata(right.noveltyAngle);
  const sourceBackedInvolved = Boolean(leftMetadata || rightMetadata);
  const bothSourceBacked = Boolean(leftMetadata && rightMetadata);
  const sourceBackedMetadataComplete = Boolean(
    (leftMetadata?.atomId && leftMetadata.angleId) ||
      (rightMetadata?.atomId && rightMetadata.angleId),
  );

  const differentAtom = Boolean(
    leftMetadata?.atomId &&
      rightMetadata?.atomId &&
      normalizeSmall(leftMetadata.atomId) !== normalizeSmall(rightMetadata.atomId),
  );
  const differentAngle = Boolean(
    leftMetadata?.angleId &&
      rightMetadata?.angleId &&
      normalizeSmall(leftMetadata.angleId) !== normalizeSmall(rightMetadata.angleId),
  );

  const leftFocus = normalizeQuestionText(left.sourceChunkFocus ?? "");
  const rightFocus = normalizeQuestionText(right.sourceChunkFocus ?? "");
  const leftPath = normalizeQuestionText(left.answerPath ?? "");
  const rightPath = normalizeQuestionText(right.answerPath ?? "");
  const leftScenario = normalizeQuestionText(left.scenario ?? "");
  const rightScenario = normalizeQuestionText(right.scenario ?? "");
  const leftOptions = optionSignature(left.options);
  const rightOptions = optionSignature(right.options);
  const leftSubQuestions = subQuestionSignature(left);
  const rightSubQuestions = subQuestionSignature(right);

  const differentSourceChunkFocus = distinctMeaningfulText(leftFocus, rightFocus);
  const differentAnswerPath = distinctMeaningfulText(leftPath, rightPath);
  const differentScenario = distinctMeaningfulText(leftScenario, rightScenario);
  const differentOptionSignature = distinctMeaningfulText(leftOptions, rightOptions);
  const differentSubQuestionSignature = distinctMeaningfulText(
    leftSubQuestions,
    rightSubQuestions,
  );

  const repeatedAnswerPath = Boolean(
    leftPath &&
      rightPath &&
      isMeaningfulAnswerSignature(leftPath) &&
      isDuplicateQuestionText(leftPath, rightPath),
  );

  const score = [
    differentAtom,
    differentAngle,
    differentSourceChunkFocus,
    differentAnswerPath,
    differentScenario,
    differentOptionSignature,
    differentSubQuestionSignature,
  ].filter(Boolean).length;
  const hasStructuralDifference = Boolean(
    differentScenario ||
      differentOptionSignature ||
      differentSubQuestionSignature,
  );

  const allowSoftSimilarity = false;

  return {
    sourceBackedInvolved,
    bothSourceBacked,
    sourceBackedMetadataComplete,
    differentAtom,
    differentAngle,
    differentSourceChunkFocus,
    differentAnswerPath,
    differentScenario,
    differentOptionSignature,
    differentSubQuestionSignature,
    repeatedAnswerPath,
    hasStructuralDifference,
    score,
    allowSoftSimilarity,
  };
}

export function numericDistinctnessProof(
  left: QuestionLike,
  right: QuestionLike,
): NumericDistinctnessProof {
  const leftNumbers = numericTuple(left);
  const rightNumbers = numericTuple(right);
  const leftFinalAnswer = finalNumericAnswer(left);
  const rightFinalAnswer = finalNumericAnswer(right);
  const leftNumerical = isNumericalQuestion(left, leftNumbers);
  const rightNumerical = isNumericalQuestion(right, rightNumbers);
  const numericalInvolved = leftNumerical || rightNumerical;
  const answerPathDiffers = distinctMeaningfulText(
    normalizeQuestionText(left.answerPath ?? ""),
    normalizeQuestionText(right.answerPath ?? ""),
  );
  const numericTupleDiffers = Boolean(
    leftNumbers.length >= 2 &&
      rightNumbers.length >= 2 &&
      leftNumbers.join("|") !== rightNumbers.join("|"),
  );
  const finalAnswerDiffers = Boolean(
    leftFinalAnswer &&
      rightFinalAnswer &&
      leftFinalAnswer !== rightFinalAnswer,
  );
  const hasCalculationSignal =
    hasNumericCalculationSignal(left) && hasNumericCalculationSignal(right);

  return {
    numericalInvolved,
    leftNumerical,
    rightNumerical,
    leftNumbers,
    rightNumbers,
    leftFinalAnswer,
    rightFinalAnswer,
    numericTupleDiffers,
    finalAnswerDiffers,
    answerPathDiffers,
    hasCalculationSignal,
    allowSoftSimilarity:
      leftNumerical &&
      rightNumerical &&
      numericTupleDiffers &&
      finalAnswerDiffers &&
      answerPathDiffers &&
      hasCalculationSignal,
  };
}

export function parseSourceBackedCompletionMetadata(
  value: string | undefined,
): SourceBackedCompletionMetadata | null {
  if (!value) return null;

  const parts = value.trim().split(":");
  if (parts[0] !== "SOURCE_BACKED_COMPLETION" || parts.length < 5) {
    return null;
  }

  const [, type, angleId, atomId, sequence] = parts;
  if (!type || !angleId || !atomId || !sequence) return null;

  return {
    marker: "SOURCE_BACKED_COMPLETION",
    type,
    angleId,
    atomId,
    sequence,
  };
}

export function sourceBackedUniquenessKey(question: QuestionLike) {
  return sourceBackedUniquenessKeyFromMetadata(
    parseSourceBackedCompletionMetadata(question.noveltyAngle),
  );
}

export function sourceBackedUniquenessKeyFor(type: string, atomId: string) {
  const normalizedType = normalizeSmall(type);
  const normalizedAtom = normalizeSmall(atomId);
  if (!normalizedType || !normalizedAtom) return null;
  return `${normalizedType}:${normalizedAtom}`;
}

function sourceBackedUniquenessKeyFromMetadata(
  metadata: SourceBackedCompletionMetadata | null,
) {
  if (!metadata) return null;
  return sourceBackedUniquenessKeyFor(metadata.type, metadata.atomId);
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
    question.noveltyAngle,
    question.sourceChunkFocus,
    question.answerPath,
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

function hardNumericalDuplicateReason(left: QuestionLike, right: QuestionLike) {
  const leftNumbers = numericTuple(left);
  const rightNumbers = numericTuple(right);
  const leftNumerical = isNumericalQuestion(left, leftNumbers);
  const rightNumerical = isNumericalQuestion(right, rightNumbers);
  if (!leftNumerical || !rightNumerical) return null;

  if (
    leftNumbers.length >= 2 &&
    rightNumbers.length >= 2 &&
    leftNumbers.join("|") === rightNumbers.join("|")
  ) {
    return "repeated numerical values";
  }

  const leftFinalAnswer = finalNumericAnswer(left);
  const rightFinalAnswer = finalNumericAnswer(right);
  if (leftFinalAnswer && rightFinalAnswer && leftFinalAnswer === rightFinalAnswer) {
    return "repeated numerical answer";
  }

  return null;
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

function comparableQuestionScope(left: QuestionLike, right: QuestionLike) {
  const sameType = normalizeSmall(left.type) === normalizeSmall(right.type);
  const sameTopic = normalizeSmall(left.topic) === normalizeSmall(right.topic);
  return sameType && (!left.topic || !right.topic || sameTopic);
}

function numericTuple(question: QuestionLike) {
  return uniqueNumberTokens(
    numberTokensFromText(
      questionNonAnswerText(question)
        .map((value) => value.trim())
        .filter(Boolean)
        .join(" "),
    ),
  );
}

function finalNumericAnswer(question: QuestionLike) {
  const answers = [
    question.correctAnswer,
    ...(question.subQuestions?.map((item) => item.correctAnswer) ?? []),
  ]
    .filter((value): value is string => Boolean(value?.trim()))
    .join(" ");
  const numbers = numberTokensFromText(answers);
  return numbers[numbers.length - 1];
}

function isNumericalQuestion(question: QuestionLike, numbers: string[]) {
  const type = normalizeSmall(question.type).replace(/[\s_-]+/g, "");
  if (type === "numerical" || type === "numeric") return true;

  const text = questionAllText(question).join(" ").toLowerCase();
  const mathLike =
    /\b(math|mathematics|arithmetic|algebra|geometry|mensuration|percentage|percent|ratio|proportion|equation|linear|quadratic|coordinate|probability|statistics|area|perimeter|volume|speed|distance|time|interest|profit|loss|average)\b/.test(
      text,
    );

  return numbers.length >= 2 && mathLike && hasNumericCalculationSignal(question);
}

function hasNumericCalculationSignal(question: QuestionLike) {
  const text = questionAllText(question).join(" ").toLowerCase();
  if (/[+\-*/=×÷]/.test(text)) return true;
  return /\b(calculate|compute|solve|find|evaluate|simplify|total|sum|add|subtract|multiply|divide|product|difference|quotient|ratio|percentage|percent|interest|speed|distance|time|area|perimeter|volume|equation|value|result|answer|more|less|remaining|altogether)\b/.test(
    text,
  );
}

function questionNonAnswerText(question: QuestionLike) {
  return [
    question.text,
    question.scenario,
    question.topic,
    question.subject,
    question.sourceChunkFocus,
    question.options?.map((option) => option.text).join(" "),
    question.subQuestions?.map((item) => item.text).join(" "),
  ].filter((value): value is string => Boolean(value?.trim()));
}

function questionAllText(question: QuestionLike) {
  return [
    ...questionNonAnswerText(question),
    question.correctAnswer,
    question.answerPath,
    question.explanation,
    question.keyPoints?.join(" "),
    question.subQuestions
      ?.map((item) => item.correctAnswer)
      .filter(Boolean)
      .join(" "),
  ].filter((value): value is string => Boolean(value?.trim()));
}

function numberTokensFromText(value: string) {
  const matches =
    value.match(/[-+]?(?:\d+(?:\.\d+)?|\.\d+)(?:\s*\/\s*(?:\d+(?:\.\d+)?|\.\d+))?\s*%?/g) ??
    [];
  return matches.map(normalizeNumberToken).filter(Boolean);
}

function normalizeNumberToken(value: string) {
  return value.replace(/\s+/g, "").toLowerCase();
}

function uniqueNumberTokens(values: string[]) {
  const seen = new Set<string>();
  const unique: string[] = [];
  values.forEach((value) => {
    if (!value || seen.has(value)) return;
    seen.add(value);
    unique.push(value);
  });
  return unique;
}

function distinctMeaningfulText(left: string, right: string) {
  return Boolean(left && right && left !== right);
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
