import {
  normalizeMCQOptions,
  withNormalizedQuestionOptions,
} from "@/lib/question-options";
import type { BlueprintSection, GeneratedQuestion, SubQuestion } from "@/types";

type LooseRecord = Record<string, unknown>;
type LooseSubQuestion = Partial<SubQuestion> & LooseRecord;

export function normalizeQuestionStructure(
  question: GeneratedQuestion,
  section: BlueprintSection,
) {
  const normalized = { ...question, marks: section.marksPerQuestion };

  if (normalized.type === "CASE_BASED") {
    normalized.subQuestions = normalizeCaseBasedSubQuestions(normalized);
    normalized.correctAnswer =
      readAnswer(normalized) || summarizeSubQuestionAnswers(normalized);
  }

  if (normalized.type === "SOURCE_BASED") {
    normalized.subQuestions = normalizeSourceBasedSubQuestions(normalized);
    normalized.correctAnswer =
      readAnswer(normalized) || summarizeSubQuestionAnswers(normalized);
  }

  return withNormalizedQuestionOptions(normalized);
}

export function summarizeSubQuestionAnswers(question: GeneratedQuestion) {
  const subQuestions = question.subQuestions ?? [];
  if (!subQuestions.length) return "";

  return subQuestions
    .map((item, index) => `(${index + 1}) ${item.correctAnswer}`)
    .join("; ");
}

function normalizeCaseBasedSubQuestions(question: GeneratedQuestion) {
  const subQuestions = looseSubQuestions(question);
  if (subQuestions.length < 2) return question.subQuestions;

  const first = subQuestions[0];
  const second = subQuestions[1];
  const firstAnswer = readAnswer(first) || answerFromSummary(question, 0);
  const firstOptions = readOptions(first) ?? readOptions(question);
  const normalizedFirstOptions = normalizeMCQOptions(firstOptions, firstAnswer);
  const normalizedFirstAnswer =
    firstAnswer || normalizedFirstOptions.find((option) => option.isCorrect)?.id || "";
  const secondAnswer =
    readAnswer(second) ||
    answerFromSummary(question, 1) ||
    readString((question as unknown as LooseRecord).explanation);

  return [
    {
      ...first,
      text:
        readQuestionText(first) ||
        "Which option best answers the case-based question?",
      type: "MCQ",
      options: normalizeMCQOptions(firstOptions, normalizedFirstAnswer),
      correctAnswer: normalizedFirstAnswer,
      marks: 2,
    },
    {
      ...second,
      text:
        readQuestionText(second) ||
        "Explain the reason for your answer using the case.",
      type: "SHORT",
      correctAnswer: secondAnswer,
      marks: 2,
    },
  ] satisfies SubQuestion[];
}

function normalizeSourceBasedSubQuestions(question: GeneratedQuestion) {
  const subQuestions = looseSubQuestions(question);
  if (subQuestions.length < 4) return question.subQuestions;

  return subQuestions.slice(0, 4).map((subQuestion) => ({
    ...subQuestion,
    text: readQuestionText(subQuestion),
    type: subQuestion.type ?? "VERY_SHORT",
    correctAnswer: readAnswer(subQuestion),
    marks: 1,
  })) satisfies SubQuestion[];
}

function looseSubQuestions(question: GeneratedQuestion) {
  const loose = question as unknown as LooseRecord;
  const candidates = [
    question.subQuestions,
    loose.sub_questions,
    loose.questions,
    loose.parts,
    loose.items,
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate as LooseSubQuestion[];
  }

  const first =
    recordFrom(loose.question1) ??
    recordFrom(loose.q1) ??
    recordFrom(loose.mcqQuestion) ??
    recordFrom(loose.mcq);
  const second =
    recordFrom(loose.question2) ??
    recordFrom(loose.q2) ??
    recordFrom(loose.shortQuestion) ??
    recordFrom(loose.shortAnswerQuestion) ??
    recordFrom(loose.reasonQuestion);

  return [first, second].filter(Boolean) as LooseSubQuestion[];
}

function readQuestionText(record: LooseRecord | GeneratedQuestion) {
  const loose = record as unknown as LooseRecord;
  return readString(
    loose.text ??
      loose.question ??
      loose.prompt ??
      loose.stem ??
      loose.questionText ??
      loose.subQuestion ??
      loose.sub_question ??
      loose.title,
  );
}

function readAnswer(record: LooseRecord | GeneratedQuestion) {
  const loose = record as unknown as LooseRecord;
  return readString(
      loose.correctAnswer ??
      loose.answer ??
      loose.correct_answer ??
      loose.correctOption ??
      loose.correct_option ??
      loose.solution ??
      loose.modelAnswer ??
      loose.model_answer ??
      loose.expectedAnswer ??
      loose.expected_answer,
  );
}

function readOptions(record: LooseRecord | GeneratedQuestion) {
  const loose = record as unknown as LooseRecord;
  return loose.options ?? loose.choices ?? loose.alternatives;
}

function answerFromSummary(question: GeneratedQuestion, index: number) {
  const answer = readAnswer(question);
  if (!answer) return "";

  const numberedAnswers = answer.match(/\(\s*\d+\s*\)\s*([^;]+)/g);
  if (!numberedAnswers?.[index]) return "";

  return numberedAnswers[index]
    .replace(/^\(\s*\d+\s*\)\s*/, "")
    .trim();
}

function readString(value: unknown) {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value).trim();
  }

  return "";
}

function recordFrom(value: unknown): LooseSubQuestion | null {
  if (typeof value === "string") return { text: value };
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as LooseSubQuestion;
  }

  return null;
}
