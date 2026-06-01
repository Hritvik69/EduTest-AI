import { NextRequest } from "next/server";
import {
  jsonSuccess,
  jsonError,
  parseJsonWithSchema,
  rateLimit,
  requireAuthenticatedUser,
} from "@/lib/api-security";
import { evaluateAnswers } from "@/lib/evaluator";
import {
  getPaper,
  getPaperOwnerId,
  saveAttemptForUser,
} from "@/lib/paper-store";
import { evaluationRequestSchema } from "@/lib/schemas";
import type { BloomLevel, GeneratedQuestion, StoredAttempt } from "@/types";

export async function POST(request: NextRequest) {
  const auth = await requireAuthenticatedUser(request);
  if (auth.response) return auth.response;

  const limited = rateLimit(request, `evaluate:${auth.user.id}`, 20, 60_000, {
    action: "evaluation requests",
  });
  if (limited) return limited;

  const parsed = await parseJsonWithSchema(request, evaluationRequestSchema);
  if (parsed.response) return parsed.response;

  const body = parsed.data;
  const ownerId = await getPaperOwnerId(body.paperId);
  if (!ownerId) {
    return jsonError(
      "Paper not found. It may have been removed or created in another browser session.",
      404,
    );
  }
  if (ownerId !== auth.user.id) {
    return jsonError(
      "Paper access denied. This paper belongs to another user or guest session.",
      403,
    );
  }

  const paper = await getPaper(body.paperId, auth.user.id);
  if (!paper) {
    return jsonError(
      "Paper not found. It may have been removed or created in another browser session.",
      404,
    );
  }
  if (paper.status !== "READY") {
    return jsonError("Paper is not ready for evaluation. Wait for generation to finish, or regenerate it if generation failed.", 409, {
      status: paper.status,
      errorMetadata: paper.errorMetadata ?? null,
    });
  }

  const questions = paper.questions;

  if (!questions.length) {
    return jsonError(
      "Paper questions are only available in the current browser session. Generate a fresh paper to take this test.",
      404,
    );
  }
  const invalidQuestion = findInvalidQuestionForEvaluation(questions);
  if (invalidQuestion) {
    return jsonError(
      "Paper contains invalid question data and cannot be evaluated safely. Regenerate the paper.",
      409,
      invalidQuestion,
    );
  }

  let results;
  try {
    results = await evaluateAnswers(questions, body.answers, {
      allowDemoHeuristic: paper.isDemoMode,
    });
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "Evaluation failed.",
      502,
    );
  }
  if (results.length !== questions.length) {
    return jsonError(
      "Evaluation returned an incomplete result set. Please retry.",
      502,
    );
  }

  const totalScore = results.reduce((sum, item) => sum + item.marksAwarded, 0);
  const maxScore = results.reduce((sum, item) => sum + item.maxMarks, 0);
  const percentage = maxScore ? Math.round((totalScore / maxScore) * 100) : 0;
  if (totalScore > maxScore) {
    return jsonError("Evaluation score exceeds maximum marks.", 500);
  }

  const bloomScores = buildBloomScores(questions, results);
  const topicScores = buildTopicScores(questions, results);
  const sectionScores = buildSectionScores(questions, results);
  const weakTopics = topicScores.filter((topic) => topic.accuracy < 50).slice(0, 5);
  const strongTopics = topicScores.filter((topic) => topic.accuracy >= 80).slice(0, 5);
  const payload: StoredAttempt = {
    attemptId: 0,
    paperId: body.paperId,
    paperTitle: paper.title,
    subject: paper.config.subject,
    classNum: paper.config.classNum,
    totalScore,
    maxScore,
    percentage,
    grade: gradeFor(percentage),
    timeTaken: body.timeTaken ?? 0,
    sectionScores,
    questionResults: results,
    bloomScores,
    topicAccuracy: topicScores,
    weakTopics,
    strongTopics,
    competencyScore: Math.round(
      average(
        questions.map((question, index) =>
          ((question.competencyLevel ?? 1) *
            (results[index].marksAwarded / Math.max(1, results[index].maxMarks))),
        ),
      ),
    ),
    recommendations: buildRecommendations({
      weakTopics,
      strongTopics,
      subject: paper.config.subject,
      classNum: paper.config.classNum,
      percentage,
    }),
    createdAt: new Date().toISOString(),
    isDemoMode: paper.isDemoMode,
    generationManifest: paper.manifest,
  };

  const saved = await saveAttemptForUser(
    auth.user.id,
    body.paperId,
    payload,
    body.answers,
  );
  return jsonSuccess(saved);
}

function buildSectionScores(
  questions: GeneratedQuestion[],
  results: Awaited<ReturnType<typeof evaluateAnswers>>,
) {
  const grouped = new Map<string, { scored: number; max: number }>();

  questions.forEach((question, index) => {
    const section = question.section ?? "Section";
    const current = grouped.get(section) ?? { scored: 0, max: 0 };
    current.scored += results[index].marksAwarded;
    current.max += results[index].maxMarks;
    grouped.set(section, current);
  });

  return Array.from(grouped.entries()).map(([section, score]) => ({
    section,
    scored: Math.round(score.scored * 2) / 2,
    max: score.max,
  }));
}

function buildBloomScores(
  questions: GeneratedQuestion[],
  results: Awaited<ReturnType<typeof evaluateAnswers>>,
) {
  const grouped: Partial<Record<BloomLevel, number[]>> = {};
  questions.forEach((question, index) => {
    const score =
      (results[index].marksAwarded / Math.max(1, results[index].maxMarks)) * 100;
    const bloom = question.bloomLevel;
    grouped[bloom] = [...(grouped[bloom] ?? []), score];
  });

  return Object.fromEntries(
    Object.entries(grouped).map(([level, scores]) => [
      level,
      Math.round(average(scores)),
    ]),
  ) as Partial<Record<BloomLevel, number>>;
}

function buildTopicScores(
  questions: GeneratedQuestion[],
  results: Awaited<ReturnType<typeof evaluateAnswers>>,
) {
  const grouped = new Map<string, number[]>();

  questions.forEach((question, index) => {
    const topic = question.topic ?? question.type;
    const score =
      (results[index].marksAwarded / Math.max(1, results[index].maxMarks)) * 100;
    grouped.set(topic, [...(grouped.get(topic) ?? []), score]);
  });

  return Array.from(grouped.entries())
    .map(([topic, scores]) => ({ topic, accuracy: Math.round(average(scores)) }))
    .sort((left, right) => left.accuracy - right.accuracy);
}

function average(values: (number | undefined)[]) {
  const valid = values.filter((value): value is number => typeof value === "number");
  if (!valid.length) return 0;
  return valid.reduce((sum, value) => sum + value, 0) / valid.length;
}

function gradeFor(percentage: number) {
  if (percentage >= 90) return "A+";
  if (percentage >= 75) return "A";
  if (percentage >= 60) return "B";
  if (percentage >= 45) return "C";
  return "D";
}

function buildRecommendations({
  weakTopics,
  strongTopics,
  subject,
  classNum,
  percentage,
}: {
  weakTopics: { topic: string; accuracy: number }[];
  strongTopics: { topic: string; accuracy: number }[];
  subject: string;
  classNum: number;
  percentage: number;
}) {
  const topWeakTopics = weakTopics.slice(0, 2);
  const strongestTopic = strongTopics[0]?.topic;
  const recommendations = topWeakTopics.map(
    (topic) =>
      `Revise ${topic.topic} from Class ${classNum} ${subject} NCERT, then solve five back-exercise questions on that topic.`,
  );

  if (strongestTopic && recommendations.length < 3) {
    recommendations.push(
      `Use your strength in ${strongestTopic} as a model: write the keyword, reason, and final conclusion for similar answers.`,
    );
  }

  if (percentage < 60) {
    recommendations.push(
      "Practise one short timed mixed-format paper and review every incorrect answer against the answer key.",
    );
  } else {
    recommendations.push(
      "Attempt one higher-difficulty mixed-format paper to improve speed and accuracy.",
    );
  }

  recommendations.push(
    "For subjective answers, include NCERT keywords, a clear reason, and a final conclusion for partial marks.",
  );

  return unique(recommendations).slice(0, 3);
}

function unique(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function findInvalidQuestionForEvaluation(questions: GeneratedQuestion[]) {
  const index = questions.findIndex(
    (question) =>
      !question.text?.trim() ||
      !question.type ||
      !Number.isFinite(Number(question.marks)) ||
      Number(question.marks) <= 0 ||
      !question.correctAnswer?.trim(),
  );

  return index >= 0
    ? {
        questionNumber: index + 1,
        type: questions[index]?.type ?? "unknown",
      }
    : null;
}
