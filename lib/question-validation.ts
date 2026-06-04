import { normalizeMCQOptions } from "@/lib/question-options";
import type { BlueprintSection, GeneratedQuestion, SubQuestion } from "@/types";

export function isUsableGeneratedQuestion(
  question: GeneratedQuestion,
  section: BlueprintSection,
) {
  if (!question.text?.trim() || question.text.trim().length <= 10) return false;
  if (question.marks !== section.marksPerQuestion) return false;
  if (hasStudentVisibleQualityIssue(question)) return false;

  if (question.type === "MCQ") {
    return hasValidMCQAnswer(question.options, question.correctAnswer);
  }

  if (question.type === "ASSERTION_REASON") {
    return ["A", "B", "C", "D"].includes(question.correctAnswer);
  }

  if (question.type === "TRUE_FALSE") {
    return /^(true|false)$/i.test(question.correctAnswer.trim());
  }

  if (question.type === "MATCH_FOLLOWING") {
    return Boolean(question.correctAnswer?.trim()) && question.matchPairs?.length === 4;
  }

  if (question.type === "CASE_BASED") {
    return (
      question.subQuestions?.length === 2 &&
      question.subQuestions[0]?.type === "MCQ" &&
      question.subQuestions[0]?.marks === 2 &&
      question.subQuestions[1]?.type === "SHORT" &&
      question.subQuestions[1]?.marks === 2 &&
      question.subQuestions.every(hasAnswerableSubQuestion) &&
      question.subQuestions.reduce((sum, item) => sum + item.marks, 0) === 4
    );
  }

  if (question.type === "SOURCE_BASED") {
    return (
      Boolean(question.scenario?.trim() || question.text?.trim()) &&
      question.subQuestions?.length === 4 &&
      question.subQuestions.every(hasAnswerableSubQuestion) &&
      question.subQuestions.reduce((sum, item) => sum + item.marks, 0) === 4
    );
  }

  return Boolean(question.correctAnswer?.trim());
}

export function hasAnswerableSubQuestion(subQuestion: SubQuestion) {
  if (subQuestion.type === "MCQ") {
    return (
      Boolean(subQuestion.text?.trim()) &&
      hasValidMCQAnswer(subQuestion.options, subQuestion.correctAnswer)
    );
  }

  return Boolean(subQuestion.text?.trim()) && Boolean(subQuestion.correctAnswer?.trim());
}

export function hasValidMCQAnswer(options: unknown, correctAnswer?: string) {
  const normalized = normalizeMCQOptions(options, correctAnswer);
  if (!correctAnswer?.trim()) return false;
  if (normalized.length !== 4) return false;

  const ids = normalized.map((option) => option.id.trim().toUpperCase());
  if (ids.some((id) => !/^[A-D]$/.test(id))) return false;
  if (new Set(ids).size !== 4) return false;

  const optionTexts = normalized.map((option) => normalizeForUniqueness(option.text));
  if (optionTexts.some((text) => !text)) return false;
  if (new Set(optionTexts).size !== 4) return false;

  const correctOptions = normalized.filter((option) => option.isCorrect);
  if (correctOptions.length !== 1) return false;

  const answer = correctAnswer.trim();
  const answerId = answer.match(/^(?:OPTION\s*)?([A-D])(?:[).:\s-]|$)/i)?.[1];
  if (answerId) return answerId.toUpperCase() === correctOptions[0].id;

  return normalizeForUniqueness(answer) === normalizeForUniqueness(correctOptions[0].text);
}

export function hasStudentVisibleQualityIssue(question: GeneratedQuestion) {
  return studentVisibleStrings(question).some((value) =>
    hasForbiddenStudentVisiblePattern(value),
  );
}

export function hasForbiddenStudentVisiblePattern(value: string) {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) return false;

  return (
    forbiddenStudentVisiblePatterns.some((pattern) => pattern.test(normalized)) ||
    hasDanglingQuestionFragment(normalized)
  );
}

function studentVisibleStrings(question: GeneratedQuestion) {
  const values: string[] = [
    question.text,
    question.correctAnswer,
    question.explanation,
    question.scenario,
    question.assertion,
    question.reason,
    question.diagramDescription,
    ...(question.keyPoints ?? []),
  ].filter(isVisibleString);

  question.options?.forEach((option) => {
    if (isVisibleString(option.text)) values.push(option.text);
  });

  question.matchPairs?.forEach((pair) => {
    if (isVisibleString(pair.left)) values.push(pair.left);
    if (isVisibleString(pair.right)) values.push(pair.right);
  });

  question.subQuestions?.forEach((subQuestion) => {
    values.push(...studentVisibleSubQuestionStrings(subQuestion));
  });

  return values;
}

function studentVisibleSubQuestionStrings(subQuestion: SubQuestion) {
  const values = [subQuestion.text, subQuestion.correctAnswer].filter(isVisibleString);

  subQuestion.options?.forEach((option) => {
    if (isVisibleString(option.text)) values.push(option.text);
  });

  return values;
}

function isVisibleString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

const forbiddenStudentVisiblePatterns = [
  /\bsource\s+detail\b/i,
  /\bselected[-\s]+source\b/i,
  /\bexact\s+source\b/i,
  /\bdetail\s+lens\b/i,
  /\bnoveltyAngle\b/i,
  /\bsourceChunkFocus\b/i,
  /\banswerPath\b/i,
  /\bSOURCE_BACKED_COMPLETION\b/i,
  /\b[a-z]+-c[a-z0-9-]*-t[a-z0-9-]*-(?:txt|pdf)-a\d+-[a-z0-9]+\b/i,
  /\b(?:txt|pdf)-a\d+\b/i,
  /\bonly\s+naming\b/i,
  /\bno\s+selected[-\s]+source\s+support\b/i,
  /\bpartial\s+detail\s+that\s+misses\b/i,
  /\bunrelated\s+definition\s+not\s+supported\b/i,
  /\bevidence\s+detail\s+link\b/i,
  /\bgeneral\s+claim\s+with\s+no\b/i,
];

function hasDanglingQuestionFragment(value: string) {
  if (value.length < 20) return false;
  return /\b(?:suppose|because|if|when|while|which|that|therefore|however|and|or|but|with|from|using|for|to|of|in|the)\.?$/i.test(
    value,
  );
}

function normalizeForUniqueness(value: string) {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}
