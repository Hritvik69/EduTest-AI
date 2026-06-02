import { generateJSON } from "@/lib/gemini";
import type { EvaluationResult, GeneratedQuestion } from "@/types";

interface SubjectiveGrade {
  marksAwarded: number;
  maxMarks?: number;
  feedback: string;
  missingPoints?: string[];
  strongPoints?: string[];
  grade?: string;
  evaluationMethod: EvaluationResult["evaluationMethod"];
}

interface SubjectiveEvaluationOptions {
  allowDemoHeuristic?: boolean;
  forceLocalFallback?: boolean;
  onAiUnavailable?: () => void;
}

const objectiveTypes = new Set([
  "MCQ",
  "ASSERTION_REASON",
  "TRUE_FALSE",
  "ONE_WORD",
  "FILL_BLANK",
  "MATCH_FOLLOWING",
]);

export async function evaluateAnswers(
  questions: (GeneratedQuestion & { id?: number })[],
  answers: Record<string, unknown>,
  options: { allowDemoHeuristic?: boolean } = {},
): Promise<EvaluationResult[]> {
  const results: EvaluationResult[] = [];
  let useLocalSubjectiveFallback = Boolean(options.allowDemoHeuristic);

  for (let index = 0; index < questions.length; index += 1) {
    const question = questions[index];
    const questionId = question.id ?? index + 1;
    const rawAnswer = answers[String(questionId)];
    const studentAnswer = stringifyAnswer(rawAnswer);

    if (objectiveTypes.has(question.type)) {
      results.push(evaluateObjective(question, rawAnswer, studentAnswer, questionId));
      continue;
    }

    if (question.type === "NUMERICAL") {
      const numerical = evaluateNumerical(question, rawAnswer, studentAnswer, questionId);
      if (numerical) {
        results.push(numerical);
        continue;
      }
    }

    const subjectiveOptions: SubjectiveEvaluationOptions = {
      allowDemoHeuristic: options.allowDemoHeuristic,
      forceLocalFallback: useLocalSubjectiveFallback,
      onAiUnavailable: () => {
        useLocalSubjectiveFallback = true;
      },
    };
    const grade = question.subQuestions?.length
      ? await evaluateSubQuestions(question, rawAnswer, subjectiveOptions)
      : await evaluateSubjective(question, studentAnswer, subjectiveOptions);

    results.push({
      questionId,
      questionText: question.text,
      questionType: question.type,
      section: question.section,
      topic: question.topic,
      bloomLevel: question.bloomLevel,
      marksAwarded: clampScore(grade.marksAwarded, question.marks),
      maxMarks: question.marks,
      isCorrect: grade.marksAwarded >= question.marks,
      feedback: grade.feedback,
      missingPoints: grade.missingPoints ?? [],
      strongPoints: grade.strongPoints ?? [],
      studentAnswer,
      correctAnswer: question.correctAnswer,
      evaluationMethod: grade.evaluationMethod,
    });
  }

  const awarded = results.reduce((sum, result) => sum + result.marksAwarded, 0);
  const maximum = results.reduce((sum, result) => sum + result.maxMarks, 0);
  if (awarded > maximum) {
    throw new Error("Evaluation score exceeds maximum marks.");
  }

  return results;
}

export function evaluateDemoAnswers(
  questions: (GeneratedQuestion & { id?: number })[],
  answers: Record<string, unknown>,
) {
  return questions.map((question, index) => {
    const questionId = question.id ?? index + 1;
    const studentAnswer = stringifyAnswer(answers[String(questionId)]);
    const hasAnswer = studentAnswer.trim().length > 0;
    const marksAwarded = hasAnswer ? Math.max(1, Math.round(question.marks * 0.72)) : 0;

    return {
      questionId,
      questionText: question.text,
      questionType: question.type,
      section: question.section,
      topic: question.topic,
      bloomLevel: question.bloomLevel,
      marksAwarded,
      maxMarks: question.marks,
      isCorrect: marksAwarded === question.marks,
      feedback: hasAnswer
        ? "Demo evaluation: good attempt. Add more NCERT keywords for full marks."
        : "No answer was submitted.",
      missingPoints: hasAnswer ? ["Precise NCERT keyword"] : ["Complete answer"],
      strongPoints: hasAnswer ? ["Relevant concept identified"] : [],
      studentAnswer,
      correctAnswer: question.correctAnswer,
      evaluationMethod: "LOCAL_FALLBACK",
    } satisfies EvaluationResult;
  });
}

function evaluateObjective(
  question: GeneratedQuestion,
  rawAnswer: unknown,
  studentAnswer: string,
  questionId: number,
): EvaluationResult {
  if (!studentAnswer.trim()) {
    return emptyResult(question, questionId, studentAnswer);
  }

  if (question.type === "MATCH_FOLLOWING") {
    const expected = question.matchPairs ?? [];
    const answerObject =
      rawAnswer && typeof rawAnswer === "object"
        ? (rawAnswer as Record<string, unknown>)
        : {};
    const correct = expected.filter(
      (pair) => normalize(answerObject[pair.left]) === normalize(pair.right),
    ).length;
    const marksAwarded = expected.length
      ? clampScore((correct / expected.length) * question.marks, question.marks)
      : 0;

    return {
      questionId,
      questionText: question.text,
      questionType: question.type,
      section: question.section,
      topic: question.topic,
      bloomLevel: question.bloomLevel,
      marksAwarded,
      maxMarks: question.marks,
      isCorrect: marksAwarded === question.marks,
      feedback:
        marksAwarded === question.marks
          ? "Correct."
          : `${correct}/${expected.length} matches were correct.`,
      missingPoints: marksAwarded === question.marks ? [] : ["Review matching pairs."],
      strongPoints: marksAwarded > 0 ? ["Some matches were correct."] : [],
      studentAnswer,
      correctAnswer: question.correctAnswer,
      evaluationMethod: "OBJECTIVE_KEY",
    };
  }

  const correct = isObjectiveAnswerCorrect(question, studentAnswer);
  return {
    questionId,
    questionText: question.text,
    questionType: question.type,
    section: question.section,
    topic: question.topic,
    bloomLevel: question.bloomLevel,
    marksAwarded: correct ? question.marks : 0,
    maxMarks: question.marks,
    isCorrect: correct,
    feedback: correct ? "Correct." : "Incorrect.",
    missingPoints: correct ? [] : ["Answer does not match the accepted answer key."],
    strongPoints: correct ? ["Answer matched the key."] : [],
    studentAnswer,
    correctAnswer: question.correctAnswer,
    evaluationMethod: "OBJECTIVE_KEY",
  };
}

async function evaluateSubQuestions(
  question: GeneratedQuestion,
  rawAnswer: unknown,
  options: SubjectiveEvaluationOptions = {},
): Promise<SubjectiveGrade> {
  const answerObject =
    rawAnswer && typeof rawAnswer === "object"
      ? (rawAnswer as Record<string, unknown>)
      : {};
  let total = 0;
  const feedback: string[] = [];
  const missingPoints: string[] = [];
  const strongPoints: string[] = [];
  const methods = new Set<EvaluationResult["evaluationMethod"]>();

  for (let index = 0; index < (question.subQuestions ?? []).length; index += 1) {
    const subQuestion = question.subQuestions![index];
    const answer = stringifyAnswer(answerObject[String(index)]);
    const generatedQuestion = {
      ...subQuestion,
      difficulty: question.difficulty,
      explanation: "",
      bloomLevel: question.bloomLevel,
      competencyLevel: question.competencyLevel,
    } satisfies GeneratedQuestion;

    if (objectiveTypes.has(subQuestion.type)) {
      const result = evaluateObjective(
        generatedQuestion,
        answerObject[String(index)],
        answer,
        index + 1,
      );
      total += result.marksAwarded;
      feedback.push(result.feedback);
      missingPoints.push(...(result.missingPoints ?? []));
      strongPoints.push(...(result.strongPoints ?? []));
      methods.add(result.evaluationMethod ?? "OBJECTIVE_KEY");
      continue;
    }

    if (subQuestion.type === "NUMERICAL") {
      const result = evaluateNumerical(
        generatedQuestion,
        answerObject[String(index)],
        answer,
        index + 1,
      );
      if (result) {
        total += result.marksAwarded;
        feedback.push(result.feedback);
        missingPoints.push(...(result.missingPoints ?? []));
        strongPoints.push(...(result.strongPoints ?? []));
        methods.add(result.evaluationMethod ?? "OBJECTIVE_KEY");
        continue;
      }
    }

    const result = await evaluateSubjective(
      generatedQuestion,
      answer,
      options,
    );
    total += result.marksAwarded;
    feedback.push(result.feedback);
    missingPoints.push(...(result.missingPoints ?? []));
    strongPoints.push(...(result.strongPoints ?? []));
    methods.add(result.evaluationMethod ?? "LOCAL_FALLBACK");
  }

  return {
    marksAwarded: total,
    feedback: feedback.join(" "),
    missingPoints: unique(missingPoints).slice(0, 5),
    strongPoints: unique(strongPoints).slice(0, 5),
    evaluationMethod: methods.has("LOCAL_FALLBACK")
      ? "LOCAL_FALLBACK"
      : methods.has("AI")
        ? "AI"
        : "OBJECTIVE_KEY",
  };
}

async function evaluateSubjective(
  question: GeneratedQuestion,
  studentAnswer: string,
  options: SubjectiveEvaluationOptions = {},
): Promise<SubjectiveGrade> {
  if (!studentAnswer.trim()) {
    return {
      marksAwarded: 0,
      feedback: "No answer was submitted.",
      missingPoints: ["Complete answer"],
      strongPoints: [],
      evaluationMethod: "OBJECTIVE_KEY",
    };
  }

  if (options.allowDemoHeuristic || options.forceLocalFallback) {
    return heuristicSubjectiveGrade(question, studentAnswer, {
      reason: options.forceLocalFallback ? "ai-unavailable" : "demo",
    });
  }

  const prompt = `You are a strict CBSE examiner. Evaluate this student answer.

Question:
${limit(question.text, 1200)}

Total Marks: ${question.marks}
Subject: ${question.subject ?? "CBSE"}
Class: ${question.classNum ?? question.class_num ?? "NCERT"}

Model Answer:
${limit(question.correctAnswer, 1800)}

Key Points Required:
${limit((question.keyPoints ?? []).join("; "), 1200)}

Student's Answer:
${limit(studentAnswer, 3000)}

CBSE Evaluation Rules:
- Award partial marks for partially correct answers
- One key point explained correctly = proportional mark
- Penalize factual errors but not phrasing differences
- Short one-liner for a 5-mark question = max 1 mark

Return ONLY JSON:
{
  "marksAwarded": 2,
  "maxMarks": ${question.marks},
  "feedback": "You correctly explained X. You missed Y and Z.",
  "missingPoints": ["missed point 1", "missed point 2"],
  "strongPoints": ["what student got right"],
  "grade": "Good"
}`;

  try {
    const grade = await generateJSON<SubjectiveGrade>(prompt, {
      task: "ANSWER_EVALUATION",
    });
    return {
      marksAwarded: clampScore(Number(grade.marksAwarded ?? 0), question.marks),
      feedback: limit(String(grade.feedback ?? "Evaluation complete."), 300),
      missingPoints: (grade.missingPoints ?? []).slice(0, 5).map((item) => limit(item, 120)),
      strongPoints: (grade.strongPoints ?? []).slice(0, 5).map((item) => limit(item, 120)),
      evaluationMethod: "AI",
    };
  } catch {
    options.onAiUnavailable?.();
    return heuristicSubjectiveGrade(question, studentAnswer, {
      reason: "ai-unavailable",
    });
  }
}

function evaluateNumerical(
  question: GeneratedQuestion,
  rawAnswer: unknown,
  studentAnswer: string,
  questionId: number,
): EvaluationResult | null {
  if (!studentAnswer.trim()) return emptyResult(question, questionId, studentAnswer);

  const studentFinal =
    extractNumericalFinal(rawAnswer) ?? extractNumericalFinal(studentAnswer);
  const correctFinal = extractNumericalFinal(question.correctAnswer);

  if (!correctFinal || !studentFinal) return null;

  const tolerance = Math.max(Math.abs(correctFinal.value) * 0.02, 0.0001);
  const finalCorrect = Math.abs(studentFinal.value - correctFinal.value) <= tolerance;

  if (finalCorrect) {
    return {
      questionId,
      questionText: question.text,
      questionType: question.type,
      section: question.section,
      topic: question.topic,
      bloomLevel: question.bloomLevel,
      marksAwarded: question.marks,
      maxMarks: question.marks,
      isCorrect: true,
      feedback: "Final numerical answer is within the accepted tolerance.",
      missingPoints: [],
      strongPoints: ["Correct final answer."],
      studentAnswer,
      correctAnswer: question.correctAnswer,
      evaluationMethod: "OBJECTIVE_KEY",
    };
  }

  if (showsNumericalWork(studentAnswer, question)) return null;

  return {
    questionId,
    questionText: question.text,
    questionType: question.type,
    section: question.section,
    topic: question.topic,
    bloomLevel: question.bloomLevel,
    marksAwarded: 0,
    maxMarks: question.marks,
    isCorrect: false,
    feedback: "Final numerical answer is outside the accepted tolerance.",
    missingPoints: ["Correct formula and final answer."],
    strongPoints: [],
    studentAnswer,
    correctAnswer: question.correctAnswer,
    evaluationMethod: "OBJECTIVE_KEY",
  };
}

function heuristicSubjectiveGrade(
  question: GeneratedQuestion,
  studentAnswer: string,
  options: { reason?: "demo" | "ai-unavailable" } = {},
): SubjectiveGrade {
  const keyPoints = question.keyPoints?.length
    ? question.keyPoints
    : question.correctAnswer.split(/[.;]/).filter(Boolean).slice(0, 4);
  const hits = keyPoints.filter((point) =>
    normalize(studentAnswer).includes(normalize(point).slice(0, 24)),
  ).length;
  const marksAwarded = keyPoints.length
    ? Math.round((hits / keyPoints.length) * question.marks)
    : Math.max(1, Math.round(question.marks * 0.5));

  const fallbackLabel =
    options.reason === "ai-unavailable"
      ? "AI examiner unavailable; local answer-key rubric used"
      : "Demo heuristic evaluation";

  return {
    marksAwarded: clampScore(marksAwarded, question.marks),
    feedback: `${fallbackLabel} based on overlap with key points.`,
    missingPoints: hits === keyPoints.length ? [] : ["Add more model-answer points."],
    strongPoints: hits ? ["Some key points were present."] : [],
    evaluationMethod: "LOCAL_FALLBACK",
  };
}

function emptyResult(
  question: GeneratedQuestion,
  questionId: number,
  studentAnswer: string,
): EvaluationResult {
  return {
    questionId,
    questionText: question.text,
    questionType: question.type,
    section: question.section,
    topic: question.topic,
    bloomLevel: question.bloomLevel,
    marksAwarded: 0,
    maxMarks: question.marks,
    isCorrect: false,
    feedback: "No answer was submitted.",
    missingPoints: ["Complete answer"],
    strongPoints: [],
    studentAnswer,
    correctAnswer: question.correctAnswer,
    evaluationMethod: "OBJECTIVE_KEY",
  };
}

function stringifyAnswer(value: unknown) {
  if (typeof value === "string") return value;
  if (!value) return "";
  if (typeof value === "object") {
    return Object.values(value as Record<string, unknown>)
      .map((item) => String(item ?? ""))
      .filter(Boolean)
      .join(" | ");
  }
  return String(value);
}

function normalize(value: unknown) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/(\d)([a-zA-Z])/g, "$1 $2")
    .replace(/([a-zA-Z])(\d)/g, "$1 $2")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function isObjectiveAnswerCorrect(question: GeneratedQuestion, studentAnswer: string) {
  if (["ONE_WORD", "FILL_BLANK"].includes(question.type)) {
    return shortAnswerEquivalent(studentAnswer, question.correctAnswer);
  }

  return normalize(studentAnswer) === normalize(question.correctAnswer);
}

function shortAnswerEquivalent(studentAnswer: string, correctAnswer: string) {
  const alternatives = answerAlternatives(correctAnswer);
  return alternatives.some((expected) => answersEquivalent(studentAnswer, expected));
}

function answersEquivalent(studentAnswer: string, expectedAnswer: string) {
  if (!studentAnswer.trim() || !expectedAnswer.trim()) return false;

  if (numericAnswersEquivalent(studentAnswer, expectedAnswer)) return true;

  const normalizedStudent = canonicalShortAnswer(studentAnswer);
  const normalizedExpected = canonicalShortAnswer(expectedAnswer);
  if (!normalizedStudent || !normalizedExpected) return false;

  return (
    normalizedStudent === normalizedExpected ||
    compact(normalizedStudent) === compact(normalizedExpected) ||
    singularizeAnswer(normalizedStudent) === singularizeAnswer(normalizedExpected)
  );
}

function answerAlternatives(answer: string) {
  const normalized = answer.trim();
  if (!normalized) return [];

  return normalized
    .split(/\s*(?:\/|;|\bor\b|\|)\s*/i)
    .map((item) => item.trim())
    .filter(Boolean);
}

function canonicalShortAnswer(answer: string) {
  return normalize(replaceNumberWords(answer));
}

function singularizeAnswer(answer: string) {
  return answer
    .split(/\s+/)
    .map((token) => {
      if (token.length <= 3 || token.endsWith("ss")) return token;
      if (token.endsWith("ies")) return `${token.slice(0, -3)}y`;
      if (token.endsWith("s")) return token.slice(0, -1);
      return token;
    })
    .join(" ");
}

function compact(answer: string) {
  return answer.replace(/\s+/g, "");
}

function numericAnswersEquivalent(studentAnswer: string, expectedAnswer: string) {
  const studentFinal = extractNumericalFinal(replaceNumberWords(studentAnswer));
  const expectedFinal = extractNumericalFinal(replaceNumberWords(expectedAnswer));
  if (!studentFinal || !expectedFinal) return false;

  const tolerance = Math.max(Math.abs(expectedFinal.value) * 0.02, 0.0001);
  const valueMatches = Math.abs(studentFinal.value - expectedFinal.value) <= tolerance;
  if (!valueMatches) return false;

  const studentUnit = normalizeUnit(studentFinal.unit);
  const expectedUnit = normalizeUnit(expectedFinal.unit);
  return !studentUnit || !expectedUnit || studentUnit === expectedUnit;
}

function replaceNumberWords(value: string) {
  return value.replace(
    /\b(zero|nil|none|one|two|three|four|five|six|seven|eight|nine|ten)\b/gi,
    (word) =>
      String(numberWordMap[word.toLowerCase() as keyof typeof numberWordMap]),
  );
}

const numberWordMap = {
  zero: 0,
  nil: 0,
  none: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
};

function normalizeUnit(unit?: string) {
  const normalized = normalize(unit ?? "").replace(/\s+/g, "");
  if (["meter", "metre", "meters", "metres"].includes(normalized)) return "m";
  if (["centimeter", "centimetre", "centimeters", "centimetres"].includes(normalized)) {
    return "cm";
  }
  if (["kilometer", "kilometre", "kilometers", "kilometres"].includes(normalized)) {
    return "km";
  }
  if (["second", "seconds", "sec", "secs"].includes(normalized)) return "s";
  return normalized;
}

function extractNumericalFinal(value: unknown) {
  if (value && typeof value === "object") {
    const object = value as Record<string, unknown>;
    const final = [object.final, object.answer, object["Final answer"]]
      .map((item) => String(item ?? "").trim())
      .find(Boolean);
    const unit = String(object.unit ?? "").trim();
    if (final) return extractNumericalFinal(`${final} ${unit}`);
  }

  const text = String(value ?? "");
  const matches = Array.from(
    text.matchAll(/[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?\s*[a-zA-Z%/°²³]*/gi),
  )
    .map((match) => match[0].trim())
    .filter(Boolean);
  const candidate = matches[matches.length - 1];
  if (!candidate) return null;

  const valueMatch = candidate.match(/[-+]?\d*\.?\d+(?:e[-+]?\d+)?/i);
  if (!valueMatch) return null;

  return {
    value: Number(valueMatch[0]),
    raw: candidate,
    unit: candidate.slice(valueMatch[0].length).trim(),
  };
}

function showsNumericalWork(studentAnswer: string, question: GeneratedQuestion) {
  const normalizedAnswer = normalize(studentAnswer);
  if (/[=+\-*/]/.test(studentAnswer)) return true;

  return (question.keyPoints ?? []).some((point) => {
    const normalizedPoint = normalize(point);
    return (
      normalizedPoint.includes("formula") &&
      normalizedPoint
        .split(" ")
        .filter((token) => token.length > 3)
        .some((token) => normalizedAnswer.includes(token))
    );
  });
}

function unique(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function clampScore(value: number, max: number) {
  return Math.max(0, Math.min(max, Math.round(value * 2) / 2));
}

function limit(value: string, max: number) {
  return value.length > max ? `${value.slice(0, max)}...` : value;
}
