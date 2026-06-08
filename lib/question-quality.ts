import { isIdentityMatchAnswer } from "@/lib/match-display";
import type { Blueprint, GeneratedQuestion, QuestionType } from "@/types";

export type TeacherQualityIssue = {
  question: GeneratedQuestion;
  type: QuestionType;
  position: number;
  reason: string;
};

export function auditTeacherLogicQuality(
  questions: GeneratedQuestion[],
  blueprint?: Blueprint,
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
  mcqAnswerImbalanceIssues(questions, blueprint).forEach((issue) => {
    if (!issues.has(issue.position)) issues.set(issue.position, issue);
  });
  trueFalseAnswerImbalanceIssues(questions, blueprint).forEach((issue) => {
    if (!issues.has(issue.position)) issues.set(issue.position, issue);
  });
  assertionReasonAnswerImbalanceIssues(questions).forEach((issue) => {
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
  if (visible.some(hasIncompleteSourceFragment)) return "incomplete-source-fragment";

  if (
    (question.type === "ONE_WORD" || question.type === "FILL_BLANK") &&
    hasAccidentalShortAnswer(question.correctAnswer)
  ) {
    return "accidental-fragment-answer";
  }

  if (question.type === "ASSERTION_REASON" && hasWeakAssertionReasonPair(question)) {
    return "weak-assertion-reason";
  }

  if (
    question.type === "MATCH_FOLLOWING" &&
    (question.matchPairs ?? []).some((pair) =>
      hasLegacyRawMatchArtifact(pair.left) || hasLegacyRawMatchArtifact(pair.right),
    )
  ) {
    return "raw-template-artifact";
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

  if (
    question.type === "MATCH_FOLLOWING" &&
    isIdentityMatchAnswer(question.correctAnswer, question.matchPairs?.length ?? 0)
  ) {
    return "identity-match-answer";
  }

  if (question.type === "SHORT") {
    if (hasWeakShortStem(question.text)) return "weak-short-stem";
    if (hasWeakShortAnswer(question.correctAnswer, question.text)) {
      return "weak-short-answer";
    }
  }

  if (visible.some(hasRawTemplateArtifact)) return "raw-template-artifact";

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

function mcqAnswerImbalanceIssues(
  questions: GeneratedQuestion[],
  blueprint?: Blueprint,
) {
  const mcqs = questions
    .map((question, index) => ({ question, position: index + 1 }))
    .filter(({ question }) => question.type === "MCQ");
  const deterministicFallbackMcqs = mcqs.filter(({ question }) =>
    isDeterministicFallbackQuestion(question),
  );
  const completeRealisticMcqs = hasCompleteQuestionTypeBatch(
    questions,
    "MCQ",
    blueprint,
  )
    ? mcqs.filter(({ question }) => !hasPlaceholderMcqOptionSet(question))
    : [];

  return uniqueQualityIssuesByPosition([
    ...answerKeyImbalanceIssues(deterministicFallbackMcqs, "majority"),
    ...answerKeyImbalanceIssues(completeRealisticMcqs, "one-sided"),
  ]);
}

function answerKeyImbalanceIssues(
  candidates: Array<{ question: GeneratedQuestion; position: number }>,
  mode: "majority" | "one-sided",
) {
  if (candidates.length < 4) return [] satisfies TeacherQualityIssue[];

  const byAnswer = new Map<string, typeof candidates>();
  candidates.forEach((item) => {
    const answer = mcqAnswerId(item.question);
    if (!answer) return;
    const group = byAnswer.get(answer) ?? [];
    group.push(item);
    byAnswer.set(answer, group);
  });
  if (mode === "one-sided" && byAnswer.size !== 1) return [];

  const allowedPerAnswer = Math.max(2, Math.ceil(candidates.length / 3));
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

function trueFalseAnswerImbalanceIssues(
  questions: GeneratedQuestion[],
  blueprint?: Blueprint,
) {
  const trueFalseQuestions = questions
    .map((question, index) => ({ question, position: index + 1 }))
    .filter(({ question }) => question.type === "TRUE_FALSE");
  const deterministicFallbackQuestions = trueFalseQuestions.filter(({ question }) =>
    isDeterministicFallbackQuestion(question),
  );
  const completeQuestions = hasCompleteQuestionTypeBatch(
    questions,
    "TRUE_FALSE",
    blueprint,
  )
    ? trueFalseQuestions
    : [];

  return uniqueQualityIssuesByPosition([
    ...trueFalseOneSidedIssues(deterministicFallbackQuestions),
    ...trueFalseOneSidedIssues(completeQuestions),
  ]);
}

function trueFalseOneSidedIssues(
  trueFalseQuestions: Array<{ question: GeneratedQuestion; position: number }>,
) {
  if (trueFalseQuestions.length < 2) return [] satisfies TeacherQualityIssue[];

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

function assertionReasonAnswerImbalanceIssues(questions: GeneratedQuestion[]) {
  const assertionReasonQuestions = questions
    .map((question, index) => ({ question, position: index + 1 }))
    .filter(({ question }) => question.type === "ASSERTION_REASON");
  if (assertionReasonQuestions.length < 2) return [];

  const answers = assertionReasonQuestions
    .map(({ question }) => assertionReasonAnswerId(question))
    .filter((answer): answer is string => Boolean(answer));
  if (answers.length !== assertionReasonQuestions.length) return [];
  if (new Set(answers).size > 1) return [];

  return assertionReasonQuestions.slice(1).map((item) => ({
    question: item.question,
    type: item.question.type,
    position: item.position,
    reason: "assertion-reason-answer-key-imbalance",
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
    if (/^which inference (?:most accurately )?follows from the detail about\b/.test(normalized)) {
      return `${question.type}:which-inference-follows-from`;
    }
    if (/^which evidence-based statement best explains\b/.test(normalized)) {
      return `${question.type}:which-evidence-based-statement`;
    }
    if (/^which option best matches the detail about\b/.test(normalized)) {
      return `${question.type}:which-option-matches-detail`;
    }
    if (/^which choice best fits the detail about\b/.test(normalized)) {
      return `${question.type}:which-choice-fits-detail`;
    }
    if (/^which answer is most accurate for\b/.test(normalized)) {
      return `${question.type}:which-answer-accurate-for`;
    }
  }

  if (question.type === "FILL_BLANK") {
    if (/^the statement ".{5,}" is mainly connected with\b/.test(normalized)) {
      return `${question.type}:the-statement-is-mainly-connected`;
    }
  }

  if (question.type === "ONE_WORD") {
    if (/^which key term best fits this statement/.test(normalized)) {
      return `${question.type}:which-key-term-fits-statement`;
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

function assertionReasonAnswerId(question: GeneratedQuestion) {
  return question.correctAnswer?.trim().match(/^[A-D]/i)?.[0]?.toUpperCase() ?? "";
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
    /\bthe idea that\s*$/i.test(value) ||
    /\bThis follows logically from the given detail\b/i.test(value) ||
    /\bThis links the cause with the effect\b/i.test(value) ||
    /\bThis distinguishes it from a similar idea\b/i.test(value) ||
    /\bThis applies the concept correctly\b/i.test(value) ||
    /\bThis fits the passage meaning\b/i.test(value) ||
    /\bThis is the best judgement for the situation\b/i.test(value) ||
    /\bThis states the condition clearly\b/i.test(value) ||
    /\bThis identifies the relationship to show\b/i.test(value) ||
    /\bThis keeps the steps in order\b/i.test(value) ||
    /\bThis states the meaning clearly\b/i.test(value) ||
    /\bThis avoids the common mistaken reading\b/i.test(value) ||
    /\bThis gives a supporting reason\b/i.test(value) ||
    /\bimportant for effective learning\b/i.test(value) ||
    /\bcan be answered well by naming the topic without a reason or example\b/i.test(value) ||
    /\bmeans using unrelated information without checking the situation\b/i.test(value) ||
    /\bis useful only when no explanation is required\b/i.test(value) ||
    /\bThe idea can be answered correctly without clarity or examples\b/i.test(value) ||
    /\bWhich choice explains how .+ supports clear understanding\b/i.test(value) ||
    /\bA worked example for .+ uses \d+ given cases and \d+ checking cases\b/i.test(value) ||
    /\bcan be understood through (?:inference|evidence)\b/i.test(value) ||
    /\bcan be explained through evidence\b/i.test(value) ||
    /\brequires inference from the selected source\b/i.test(value) ||
    /\bsupports the (?:evidence|inference) reasoning\b/i.test(value) ||
    /\bshould include a clear (?:evidence|inference|case|source) link\b/i.test(value) ||
    /\bA correct answer about .{3,60} should include a clear \w+ link\b/i.test(value) ||
    /\bWhich (?:evidence-based|inference-based|case-based) statement best (?:explains|describes)\b/i.test(value) ||
    /\bWhich inference (?:most accurately )?follows from the detail about\b/i.test(value) ||
    /\bWhich (?:evidence-based answer|choice) fits the detail about\b/i.test(value) ||
    /\bWhich statement best explains the (?:evidence|inference|case) point about\b/i.test(value) ||
    /\bExplain the concept clearly\b/i.test(value) ||
    /\b[A-Z][a-zA-Z\s]{5,35}\s+\d{1,3}\s+[a-z]\s+/i.test(value) ||
    /\b\d{1,3}\s+Activity\s+\d+\b/i.test(value) ||
    /\bOnly memorised definitions matter in this (?:passage|chapter)\b/i.test(value) ||
    /\bThe surrounding sentence gives no clue to meaning\b/i.test(value) ||
    /\bThe meaning can be decided without considering context\b/i.test(value) ||
    /\bTone and word choice never affect interpretation\b/i.test(value)
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
  const normalized = value.replace(/\s+/g, " ").trim();
  return (
    /^(?:focused point|phrase window|context|correct use|reason|application|evidence|conclusion|inference)$/i.test(
      normalized,
    ) ||
    /^(?:main concept being tested|specific case that shows the idea|common mistaken reading to avoid|explain what follows from the idea|use the idea in a relevant situation|explain the concept clearly)$/i.test(
      normalized,
    ) ||
    /^\w{3,20} reason$/i.test(normalized) ||
    /^\w{3,20} use$/i.test(normalized) ||
    /^\w{3,20} importance$/i.test(normalized) ||
    /^\w{3,20} example$/i.test(normalized) ||
    /\b\d{1,3}\s+Activity\s+\d+\b/i.test(normalized) ||
    /\b[A-Z][a-zA-Z\s]{5,35}\s+\d{1,3}\s+[a-z]\s+/i.test(normalized)
  );
}

function hasLegacyRawMatchArtifact(value: string) {
  return /\b(?:phrase window|focused point)\b/i.test(value);
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

function hasWeakAssertionReasonPair(question: GeneratedQuestion) {
  const assertion = question.assertion?.trim() || assertionFromText(question.text);
  const reason = question.reason?.trim() || reasonFromText(question.text);
  if (!assertion || !reason) return true;
  if (hasGenericAssertionReasonTemplate(assertion, reason)) return true;

  const normalizedAssertion = normalizeVisible(assertion);
  const normalizedReason = normalizeVisible(reason);
  if (!normalizedAssertion || !normalizedReason) return true;
  if (normalizedAssertion === normalizedReason) return true;
  if (
    normalizedAssertion.length >= 18 &&
    normalizedReason.length >= 18 &&
    (normalizedAssertion.includes(normalizedReason) ||
      normalizedReason.includes(normalizedAssertion))
  ) {
    return true;
  }

  const assertionTerms = contentWords(normalizedAssertion);
  const reasonTerms = contentWords(normalizedReason);
  if (assertionTerms.length < 4 || reasonTerms.length < 4) return false;
  const assertionSet = new Set(assertionTerms);
  const overlap = reasonTerms.filter((word) => assertionSet.has(word)).length;
  return overlap / reasonTerms.length > 0.82;
}

function hasGenericAssertionReasonTemplate(assertion: string, reason: string) {
  return (
    /\bimportant for effective learning\b/i.test(assertion) ||
    /\bExamples can make a classroom explanation easier to remember\b/i.test(reason) ||
    /\bcan be answered well by naming the topic without a reason or example\b/i.test(reason) ||
    /\bcan be understood through\s+(?:evidence|inference|reasoning|application|case reasoning|conceptual reasoning)\b/i.test(
      assertion,
    ) ||
    /\bthis supports (?:the )?(?:evidence|inference|reasoning|application|case|conceptual reasoning)\s+reasoning\b/i.test(
      reason,
    ) ||
    /\bsupports the inference reasoning\b/i.test(reason) ||
    /\bcan be explained through evidence\b/i.test(assertion) ||
    /\brequires inference from the selected source\b/i.test(assertion) ||
    /\bshould include a clear \w+ link\b/i.test(assertion) ||
    /\bA correct answer about .{3,60} should include\b/i.test(assertion) ||
    /\bThis supports (?:a clear )?\w+ link\b/i.test(reason) ||
    /\bA complete answer connects the idea with this point\b/i.test(reason) ||
    /\bThe (?:idea|source) implies that\b/i.test(reason)
  );
}

function assertionFromText(text: string) {
  return text.match(/Assertion\s*\(A\)\s*:\s*([\s\S]*?)(?:\n|Reason\s*\(R\)\s*:)/i)?.[1]?.trim() ?? "";
}

function reasonFromText(text: string) {
  return text.match(/Reason\s*\(R\)\s*:\s*([\s\S]*)/i)?.[1]?.trim() ?? "";
}

function contentWords(value: string) {
  const stopWords = new Set([
    "the",
    "and",
    "that",
    "this",
    "with",
    "from",
    "because",
    "should",
    "would",
    "could",
    "about",
    "when",
    "where",
    "which",
    "what",
    "into",
    "only",
    "also",
  ]);
  return value
    .split(/\s+/)
    .filter((word) => word.length > 3 && !stopWords.has(word));
}

function hasWeakShortStem(value: string) {
  return (
    /\b(?:explain|describe|state)\s+the\s+(?:evidence|inference|case|source)\s+point\b/i.test(
      value,
    ) ||
    /\bState one important point about the application of\b/i.test(value)
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

function uniqueQualityIssuesByPosition(issues: TeacherQualityIssue[]) {
  const seen = new Set<number>();
  return issues.filter((issue) => {
    if (seen.has(issue.position)) return false;
    seen.add(issue.position);
    return true;
  });
}

function hasCompleteQuestionTypeBatch(
  questions: GeneratedQuestion[],
  type: QuestionType,
  blueprint?: Blueprint,
) {
  if (!blueprint) return true;
  const required = blueprint.sections
    .filter((section) => section.questionType === type)
    .reduce((sum, section) => sum + section.count, 0);
  if (required <= 0) return false;
  return questions.filter((question) => question.type === type).length >= required;
}

function hasPlaceholderMcqOptionSet(question: GeneratedQuestion) {
  const texts = (question.options ?? [])
    .map((option) => normalizeVisible(option.text))
    .filter(Boolean);
  if (texts.length !== 4) return false;

  const genericLetterOptions = texts.every((text) => /^option [a-d]$/.test(text));
  if (genericLetterOptions) return true;

  const genericDemoOptions = new Set([
    "correct answer",
    "distractor one",
    "distractor two",
    "distractor three",
  ]);
  return texts.every((text) => genericDemoOptions.has(text));
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
