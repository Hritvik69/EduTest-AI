import type { Blueprint, GeneratedQuestion, QuestionType } from "@/types";

export type TeacherQualityIssue = {
  question: GeneratedQuestion;
  type: QuestionType;
  position: number;
  reason: string;
};

export function auditTeacherLogicQuality(
  questions: GeneratedQuestion[],
  _blueprint?: Blueprint,
) {
  const issues = new Map<number, TeacherQualityIssue>();

  questions.forEach((question, index) => {
    const reason = teacherLogicIssueReason(question);
    if (reason) {
      issues.set(index + 1, {
        question,
        type: question.type,
        position: index + 1,
        reason,
      });
    }
  });

  repeatedStemIssues(questions).forEach((issue) => {
    if (!issues.has(issue.position)) issues.set(issue.position, issue);
  });
  mcqAnswerImbalanceIssues(questions).forEach((issue) => {
    if (!issues.has(issue.position)) issues.set(issue.position, issue);
  });
  trueFalseAnswerImbalanceIssues(questions).forEach((issue) => {
    if (!issues.has(issue.position)) issues.set(issue.position, issue);
  });

  return Array.from(issues.values()).sort(
    (left, right) => left.position - right.position,
  );
}

export function hasTeacherLogicQualityIssue(question: GeneratedQuestion) {
  return Boolean(teacherLogicIssueReason(question));
}

function teacherLogicIssueReason(question: GeneratedQuestion) {
  const visible = studentVisibleStrings(question);
  if (visible.some(hasRawTemplateArtifact)) return "raw-template-artifact";
  if (visible.some(hasIncompleteSourceFragment)) return "incomplete-source-fragment";

  if (
    (question.type === "ONE_WORD" || question.type === "FILL_BLANK") &&
    hasAccidentalShortAnswer(question.correctAnswer)
  ) {
    return "accidental-fragment-answer";
  }

  if (
    question.type === "MATCH_FOLLOWING" &&
    (question.matchPairs ?? []).some((pair) =>
      hasGenericMatchLabel(pair.left) ||
      hasGenericMatchLabel(pair.right) ||
      hasWeakMatchPair(pair.left, pair.right),
    )
  ) {
    return "weak-match-pair";
  }

  if (question.type === "SHORT") {
    if (hasWeakShortStem(question.text)) return "weak-short-stem";
    if (hasWeakShortAnswer(question.correctAnswer, question.text)) {
      return "weak-short-answer";
    }
  }

  return "";
}

function repeatedStemIssues(questions: GeneratedQuestion[]) {
  const issues: TeacherQualityIssue[] = [];
  const groups = new Map<string, Array<{ question: GeneratedQuestion; position: number }>>();
  const totalsByType = new Map<QuestionType, number>();

  questions.forEach((question, index) => {
    totalsByType.set(question.type, (totalsByType.get(question.type) ?? 0) + 1);
    const key = repeatedStemKey(question);
    if (!key) return;
    const group = groups.get(key) ?? [];
    group.push({ question, position: index + 1 });
    groups.set(key, group);
  });

  groups.forEach((group) => {
    const typeTotal = totalsByType.get(group[0]?.question.type ?? "MCQ") ?? group.length;
    const allowed = Math.max(2, Math.ceil(typeTotal * 0.4));
    if (group.length <= allowed) return;
    group.slice(allowed).forEach((item) => {
      issues.push({
        question: item.question,
        type: item.question.type,
        position: item.position,
        reason: "repeated-stem-template",
      });
    });
  });

  return issues;
}

function mcqAnswerImbalanceIssues(questions: GeneratedQuestion[]) {
  const mcqs = questions
    .map((question, index) => ({ question, position: index + 1 }))
    .filter(
      ({ question }) =>
        question.type === "MCQ" && isDeterministicFallbackQuestion(question),
    );
  if (mcqs.length < 4) return [];

  const byAnswer = new Map<string, typeof mcqs>();
  mcqs.forEach((item) => {
    const answer = mcqAnswerId(item.question);
    if (!answer) return;
    const group = byAnswer.get(answer) ?? [];
    group.push(item);
    byAnswer.set(answer, group);
  });

  const allowedPerAnswer = Math.max(2, Math.ceil(mcqs.length / 3));
  const issues: TeacherQualityIssue[] = [];
  byAnswer.forEach((group) => {
    if (group.length <= allowedPerAnswer) return;
    group.slice(allowedPerAnswer).forEach((item) => {
      issues.push({
        question: item.question,
        type: item.question.type,
        position: item.position,
        reason: "mcq-answer-key-imbalance",
      });
    });
  });

  return issues;
}

function trueFalseAnswerImbalanceIssues(questions: GeneratedQuestion[]) {
  const trueFalseQuestions = questions
    .map((question, index) => ({ question, position: index + 1 }))
    .filter(
      ({ question }) =>
        question.type === "TRUE_FALSE" && isDeterministicFallbackQuestion(question),
    );
  if (trueFalseQuestions.length < 2) return [];

  const answers = trueFalseQuestions
    .map(({ question }) => question.correctAnswer?.trim().toLowerCase())
    .filter((answer): answer is string => answer === "true" || answer === "false");
  if (answers.length !== trueFalseQuestions.length) return [];
  if (new Set(answers).size > 1) return [];

  return trueFalseQuestions.slice(1).map((item) => ({
    question: item.question,
    type: item.question.type,
    position: item.position,
    reason: "true-false-answer-key-imbalance",
  }));
}

function repeatedStemKey(question: GeneratedQuestion) {
  const normalized = normalizeVisible(question.text);
  if (question.type === "MCQ") {
    if (/^which statement best explains\b/.test(normalized)) {
      return `${question.type}:which-statement-best-explains`;
    }
    if (/^which option best explains\b/.test(normalized)) {
      return `${question.type}:which-option-best-explains`;
    }
  }

  const words = normalized.split(/\s+/).slice(0, 6).join(" ");
  return words.split(/\s+/).length >= 5 ? `${question.type}:${words}` : "";
}

function mcqAnswerId(question: GeneratedQuestion) {
  const answer = question.correctAnswer?.trim().match(/^[A-D]/i)?.[0];
  if (answer) return answer.toUpperCase();
  return question.options?.find((option) => option.isCorrect)?.id?.toUpperCase() ?? "";
}

function isDeterministicFallbackQuestion(question: GeneratedQuestion) {
  return [
    question.noveltyAngle,
    question.sourceChunkFocus,
    question.answerPath,
    question.source,
  ].some((value) =>
    /SOURCE_BACKED_COMPLETION|SYLLABUS_NEAR_FALLBACK/i.test(String(value ?? "")),
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
    if (isVisibleString(subQuestion.text)) values.push(subQuestion.text);
    if (isVisibleString(subQuestion.correctAnswer)) {
      values.push(subQuestion.correctAnswer);
    }
    subQuestion.options?.forEach((option) => {
      if (isVisibleString(option.text)) values.push(option.text);
    });
  });

  return values;
}

function hasRawTemplateArtifact(value: string) {
  return (
    /\b(?:phrase window|focused point|evidence point|inference point|case point|source point|grandmother unfortunately|case reasoning clue|evidence clue)\b/i.test(
      value,
    ) ||
    /\bIntroductIon\s+to\s+communIcatIon\b/i.test(value) ||
    /\beveryone\s+needs\s+it\s+what\s+exactly\s+is\s+communication\b/i.test(value) ||
    /\bthe idea that\s*$/i.test(value)
  );
}

function hasIncompleteSourceFragment(value: string) {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized || normalized.length < 18) return false;
  if (/\b(?:was|were|is|are|also|very|then|because|which|that|with|from|to|of|in|the)\??$/i.test(normalized)) {
    return true;
  }
  return /\bThe statement\s+"(?:of|and|or|but|with|from|to|in)\b/i.test(
    normalized,
  );
}

function hasAccidentalShortAnswer(value: string | undefined) {
  const normalized = value?.replace(/\s+/g, " ").trim() ?? "";
  if (!normalized) return true;
  if (/^(?:it is|of ordinary|how i|the statement)$/i.test(normalized)) return true;
  if (/\b(?:grandmother unfortunately|unfortunately)\b/i.test(normalized)) {
    return true;
  }
  const words = normalized.split(/\s+/);
  return (
    words.length <= 2 &&
    /^(?:of|and|or|but|with|from|to|in|the|a|an)$/i.test(words[0])
  );
}

function hasGenericMatchLabel(value: string) {
  return /^(?:focused point|phrase window|context|correct use|reason|application|evidence|conclusion|inference)$/i.test(
    value.replace(/\s+/g, " ").trim(),
  );
}

function hasWeakMatchPair(left: string, right: string) {
  const normalizedLeft = normalizeMatchText(left);
  const normalizedRight = normalizeMatchText(right);
  if (!normalizedLeft || !normalizedRight) return true;
  if (normalizedLeft === normalizedRight) return true;
  if (
    normalizedLeft.length >= 12 &&
    normalizedRight.length >= 12 &&
    (normalizedLeft.includes(normalizedRight) ||
      normalizedRight.includes(normalizedLeft))
  ) {
    return true;
  }
  const leftTerms = new Set(normalizedLeft.split(/\s+/).filter((word) => word.length > 3));
  const rightTerms = normalizedRight.split(/\s+/).filter((word) => word.length > 3);
  if (leftTerms.size === 0 || rightTerms.length === 0) return false;
  const overlap = rightTerms.filter((word) => leftTerms.has(word)).length;
  return overlap >= Math.min(3, rightTerms.length) && overlap / rightTerms.length >= 0.75;
}

function hasWeakShortStem(value: string) {
  return /\b(?:explain|describe|state)\s+the\s+(?:evidence|inference|case|source)\s+point\b/i.test(
    value,
  );
}

function hasWeakShortAnswer(answer: string | undefined, questionText: string) {
  const normalizedAnswer = normalizeVisible(answer ?? "");
  if (!normalizedAnswer) return true;
  if (/\bexplain the concept clearly\b/i.test(answer ?? "")) return true;
  if (/\ba complete answer should only\b/i.test(answer ?? "")) return true;
  const questionTerms = new Set(
    normalizeVisible(questionText)
      .split(/\s+/)
      .filter((word) => word.length > 4),
  );
  const answerTerms = normalizedAnswer.split(/\s+/).filter((word) => word.length > 4);
  if (questionTerms.size < 4 || answerTerms.length < 8) return false;
  const overlap = answerTerms.filter((word) => questionTerms.has(word)).length;
  return overlap / answerTerms.length > 0.82;
}

function normalizeMatchText(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeVisible(value: string) {
  return value
    .toLowerCase()
    .replace(/"[^"]+"/g, '"..."')
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isVisibleString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
