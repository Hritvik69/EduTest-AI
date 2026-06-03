import { describe, expect, it } from "vitest";
import {
  generateBlueprint,
  normalizeQuestionFormatsForDifficulty,
} from "@/lib/blueprint";
import {
  allocateDifficultyTargetsForSections,
  difficultyMixFor,
  formatDifficultyCeilings,
  normalizeBloomDistributionForDifficulty,
  normalizeQuestionDifficulty,
  validateFinalDifficultyDistribution,
} from "@/lib/difficulty-protocol";
import type { GeneratedQuestion } from "@/types";
import type { PaperConfig } from "@/types";

describe("difficulty protocol", () => {
  it("exposes strict global difficulty mixes", () => {
    expect(difficultyMixFor("EASY")).toEqual({
      EASY: 85,
      MEDIUM: 15,
      HARD: 0,
      ABSURD: 0,
    });
    expect(difficultyMixFor("MEDIUM")).toEqual({
      EASY: 20,
      MEDIUM: 70,
      HARD: 10,
      ABSURD: 0,
    });
    expect(difficultyMixFor("HARD")).toEqual({
      EASY: 0,
      MEDIUM: 20,
      HARD: 70,
      ABSURD: 10,
    });
    expect(difficultyMixFor("ABSURD")).toEqual({
      EASY: 0,
      MEDIUM: 0,
      HARD: 20,
      ABSURD: 80,
    });
  });

  it("clamps Bloom values so they cannot contradict selected difficulty", () => {
    const easy = normalizeBloomDistributionForDifficulty("EASY", {
        REMEMBER: 0,
        UNDERSTAND: 0,
        APPLY: 0,
        ANALYZE: 40,
        EVALUATE: 30,
        CREATE: 30,
      });

    expect(easy.ANALYZE).toBe(0);
    expect(easy.EVALUATE).toBe(0);
    expect(easy.CREATE).toBe(0);
    expect(Object.values(easy).reduce((sum, value) => sum + value, 0)).toBe(100);

    const absurd = normalizeBloomDistributionForDifficulty("ABSURD", {
      REMEMBER: 90,
      UNDERSTAND: 10,
      APPLY: 0,
      ANALYZE: 0,
      EVALUATE: 0,
      CREATE: 0,
    });

    expect(absurd.REMEMBER).toBe(0);
    expect(absurd.UNDERSTAND).toBe(0);
    expect(absurd.CREATE).toBeGreaterThanOrEqual(25);
    expect(Object.values(absurd).reduce((sum, value) => sum + value, 0)).toBe(100);
  });

  it("enforces format ceilings while allocating section targets", () => {
    expect(formatDifficultyCeilings.ONE_WORD).toBe("MEDIUM");
    expect(formatDifficultyCeilings.HOTS).toBe("ABSURD");

    const allocation = allocateDifficultyTargetsForSections("HARD", [
      { questionType: "ONE_WORD", count: 2 },
      { questionType: "MCQ", count: 18 },
    ]);

    expect(allocation[0]).toMatchObject({ MEDIUM: 2, HARD: 0, ABSURD: 0 });
    expect(allocation[1].HARD).toBeGreaterThanOrEqual(14);
  });

  it("fails early when selected formats cannot satisfy difficulty", () => {
    expect(() =>
      allocateDifficultyTargetsForSections("ABSURD", [
        { questionType: "ONE_WORD", count: 10 },
      ]),
    ).toThrow(/cannot be generated|requires at least/);
  });

  it("lets absurd papers use advanced formats without an exact absurd minimum", () => {
    const allocation = allocateDifficultyTargetsForSections("ABSURD", [
      { questionType: "MCQ", count: 19 },
      { questionType: "ASSERTION_REASON", count: 6 },
    ]);

    expect(allocation[0]).toMatchObject({ HARD: 0, ABSURD: 19 });
    expect(allocation[1]).toMatchObject({ HARD: 6, ABSURD: 0 });
  });

  it("replaces medium-ceiling one-mark formats before absurd generation", () => {
    const config: PaperConfig = {
      classNum: 9,
      subject: "Mathematics",
      subjects: ["Mathematics"],
      chapterIds: [910001],
      topicIds: [],
      questionTypes: ["FILL_BLANK", "MCQ"],
      typeDistribution: { FILL_BLANK: 3, MCQ: 2 },
      totalQuestions: 5,
      totalMarks: 5,
      duration: 90,
      examType: "School Test",
      difficulty: "ABSURD",
      bloomDistribution: {
        REMEMBER: 0,
        UNDERSTAND: 0,
        APPLY: 10,
        ANALYZE: 20,
        EVALUATE: 40,
        CREATE: 30,
      },
    };

    const normalized = normalizeQuestionFormatsForDifficulty(config);
    const blueprint = generateBlueprint(config);

    expect(normalized.questionTypes).toEqual(["MCQ"]);
    expect(normalized.typeDistribution.MCQ).toBe(5);
    expect(normalized.typeDistribution.FILL_BLANK).toBeUndefined();
    expect(blueprint.sections).toHaveLength(1);
    expect(blueprint.sections[0]).toMatchObject({
      questionType: "MCQ",
      count: 5,
      totalMarks: 5,
    });
  });

  it("uses heuristics to reject fake high difficulty", () => {
    const result = normalizeQuestionDifficulty(
      {
        ...questionBase(),
        difficulty: "HARD",
        bloomLevel: "EVALUATE",
        text: "Name the process of evaporation.",
        correctAnswer: "Evaporation",
        reasoningSteps: 1,
        difficultyConfidence: 0.95,
      },
      "HARD",
      "ONE_WORD",
    );

    expect(result.valid).toBe(false);
    expect(result.reasons.join(" ")).toMatch(/not allowed|conflicts|ceiling/);
  });

  it("validates final distribution with minimum and maximum overlap bounds", () => {
    const questions: GeneratedQuestion[] = Array.from({ length: 10 }, (_, index) => ({
      ...questionBase(),
      text: `Question ${index} asks for a standard CBSE application with explanation.`,
      difficulty: "MEDIUM" as const,
      validatedDifficulty: "MEDIUM" as const,
    }));

    expect(() => validateFinalDifficultyDistribution(questions, "MEDIUM")).not.toThrow();
    expect(() => validateFinalDifficultyDistribution(questions, "HARD")).toThrow(
      /violates/,
    );
  });

  it("does not fail absurd final papers only because valid advanced questions are hard", () => {
    const questions: GeneratedQuestion[] = Array.from({ length: 25 }, (_, index) => ({
      ...questionBase(),
      text: `Advanced question ${index} requires reasoning from the selected source.`,
      difficulty: index < 19 ? ("ABSURD" as const) : ("HARD" as const),
      validatedDifficulty: index < 19 ? ("ABSURD" as const) : ("HARD" as const),
      bloomLevel: index < 19 ? ("EVALUATE" as const) : ("ANALYZE" as const),
      reasoningSteps: index < 19 ? 5 : 4,
    }));

    expect(() => validateFinalDifficultyDistribution(questions, "ABSURD")).not.toThrow();
  });
});

function questionBase(): GeneratedQuestion {
  return {
    text: "Explain the concept using the selected NCERT topic.",
    type: "SHORT",
    difficulty: "MEDIUM",
    marks: 3,
    correctAnswer: "The answer applies the concept with clear reasoning.",
    explanation: "The answer is accepted when the concept and reason are correct.",
    bloomLevel: "APPLY",
    competencyLevel: 2,
    topic: "Selected topic",
  };
}
