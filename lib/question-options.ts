import type { GeneratedQuestion, MCQOption, SubQuestion } from "@/types";

const fallbackOptionIds = ["A", "B", "C", "D"];
const ignoredOptionKeys = new Set([
  "answer",
  "correct",
  "correctanswer",
  "explanation",
  "marks",
  "question",
  "text",
  "type",
]);

type OptionEntry = {
  key?: string;
  value: unknown;
};

type RuntimeQuestion = (GeneratedQuestion | SubQuestion) & {
  options?: unknown;
  subQuestions?: SubQuestion[];
};

export function normalizeMCQOptions(
  options: unknown,
  correctAnswer?: string,
): MCQOption[] {
  return optionEntries(options)
    .map((entry, index) => optionFromEntry(entry, index, correctAnswer))
    .filter((option): option is MCQOption => option !== null);
}

export function withNormalizedQuestionOptions<T extends GeneratedQuestion | SubQuestion>(
  question: T,
): T {
  const normalized = { ...question } as RuntimeQuestion;

  if (normalized.type === "MCQ") {
    const options = normalizeMCQOptions(normalized.options, question.correctAnswer);
    normalized.options = options;
    const correctOption = options.find((option) => option.isCorrect);
    if (correctOption) {
      normalized.correctAnswer = correctOption.id;
    }
  }

  if (Array.isArray(normalized.subQuestions)) {
    normalized.subQuestions = normalized.subQuestions.map((subQuestion) =>
      withNormalizedQuestionOptions(subQuestion),
    );
  }

  return normalized as T;
}

function optionEntries(options: unknown): OptionEntry[] {
  if (Array.isArray(options)) {
    return options.map((value) => ({ value }));
  }

  if (!isRecord(options)) return [];

  if (Array.isArray(options.options) || isRecord(options.options)) {
    return optionEntries(options.options);
  }

  return Object.entries(options)
    .filter(([key]) => !ignoredOptionKeys.has(key.toLowerCase()))
    .map(([key, value]) => ({ key, value }));
}

function optionFromEntry(
  { key, value }: OptionEntry,
  index: number,
  correctAnswer?: string,
): MCQOption | null {
  const recordValue = isRecord(value) ? value : null;
  const id = normalizeOptionId(
    recordValue?.id ?? recordValue?.key ?? recordValue?.label ?? key,
    index,
  );
  const text = normalizeOptionText(
    recordValue
      ? recordValue.text ??
          recordValue.optionText ??
          recordValue.option ??
          recordValue.value ??
          recordValue.content
      : value,
  );

  if (!text) return null;

  return {
    id,
    text,
    isCorrect:
      coerceBoolean(recordValue?.isCorrect ?? recordValue?.correct) ||
      answerMatchesOption(id, text, correctAnswer),
  };
}

function normalizeOptionId(value: unknown, index: number) {
  const raw = typeof value === "string" ? value.trim() : "";
  const directMatch = raw.match(/^[A-D]$/i);
  const prefixedMatch = raw.match(/^(?:option\s*)?([A-D])(?:[).:\s-]|$)/i);

  return (
    directMatch?.[0] ??
    prefixedMatch?.[1] ??
    fallbackOptionIds[index] ??
    String(index + 1)
  ).toUpperCase();
}

function normalizeOptionText(value: unknown) {
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return String(value).trim();
  }

  return "";
}

function coerceBoolean(value: unknown) {
  if (typeof value === "boolean") return value;
  if (typeof value !== "string") return false;

  const normalized = value.trim().toLowerCase();
  return normalized === "true" || normalized === "yes" || normalized === "1";
}

function answerMatchesOption(id: string, text: string, correctAnswer?: string) {
  const answer = correctAnswer?.trim();
  if (!answer) return false;

  const upperAnswer = answer.toUpperCase();
  const optionLetter = upperAnswer.match(/^(?:OPTION\s*)?([A-D])(?:[).:\s-]|$)/)?.[1];

  return (
    upperAnswer === id.toUpperCase() ||
    optionLetter === id.toUpperCase() ||
    answer.toLowerCase() === text.trim().toLowerCase()
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
