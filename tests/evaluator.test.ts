import { beforeEach, describe, expect, it, vi } from "vitest";
import { evaluateAnswers } from "@/lib/evaluator";
import { generateJSON } from "@/lib/gemini";
import type { GeneratedQuestion } from "@/types";

vi.mock("@/lib/gemini", () => ({
  generateJSON: vi.fn(),
}));

const mockedGenerateJSON = vi.mocked(generateJSON);

const mcq: GeneratedQuestion = {
  id: 7,
  text: "Choose the correct explanation.",
  type: "MCQ",
  difficulty: "MEDIUM",
  marks: 1,
  options: [
    { id: "A", text: "Wrong", isCorrect: false },
    { id: "B", text: "Right", isCorrect: true },
    { id: "C", text: "Wrong", isCorrect: false },
    { id: "D", text: "Wrong", isCorrect: false },
  ],
  correctAnswer: "B",
  explanation: "B is correct.",
  bloomLevel: "UNDERSTAND",
  competencyLevel: 2,
};

const match: GeneratedQuestion = {
  id: 8,
  text: "Match the following.",
  type: "MATCH_FOLLOWING",
  difficulty: "MEDIUM",
  marks: 3,
  matchPairs: [
    { left: "A", right: "Alpha" },
    { left: "B", right: "Beta" },
    { left: "C", right: "Gamma" },
  ],
  correctAnswer: "A-Alpha, B-Beta, C-Gamma",
  explanation: "All pairs match.",
  bloomLevel: "UNDERSTAND",
  competencyLevel: 2,
};

const subjective: GeneratedQuestion = {
  id: 9,
  text: "Explain photosynthesis.",
  type: "SHORT",
  difficulty: "MEDIUM",
  marks: 3,
  correctAnswer: "Plants use chlorophyll and sunlight to convert carbon dioxide and water into glucose and oxygen.",
  keyPoints: ["chlorophyll captures sunlight", "carbon dioxide and water form glucose", "oxygen is released"],
  explanation: "Rubric",
  bloomLevel: "UNDERSTAND",
  competencyLevel: 2,
};

const caseBasedWithNumerical: GeneratedQuestion = {
  id: 11,
  text: "Read the case and solve the numerical.",
  type: "CASE_BASED",
  difficulty: "MEDIUM",
  marks: 2,
  correctAnswer: "Sub-questions are marked independently.",
  explanation: "Rubric",
  bloomLevel: "APPLY",
  competencyLevel: 3,
  subQuestions: [
    {
      text: "Find the final value.",
      type: "NUMERICAL",
      marks: 2,
      correctAnswer: "20 cm",
    },
  ],
};

describe("evaluateAnswers", () => {
  beforeEach(() => {
    mockedGenerateJSON.mockReset();
  });

  it("grades objective answers deterministically", async () => {
    const results = await evaluateAnswers([mcq, match], {
      "7": "B",
      "8": { A: "Alpha", B: "Wrong", C: "Gamma" },
    });

    expect(results[0].marksAwarded).toBe(1);
    expect(results[1].marksAwarded).toBe(2);
    expect(results[0].evaluationMethod).toBe("OBJECTIVE_KEY");
    expect(results[1].evaluationMethod).toBe("OBJECTIVE_KEY");
  });

  it("never awards more than maximum marks", async () => {
    const results = await evaluateAnswers([mcq], { "7": "B" });
    const total = results.reduce((sum, result) => sum + result.marksAwarded, 0);
    const max = results.reduce((sum, result) => sum + result.maxMarks, 0);

    expect(total).toBeLessThanOrEqual(max);
  });

  it("falls back to a local rubric when AI evaluation providers are unavailable", async () => {
    mockedGenerateJSON.mockRejectedValue(
      new Error("All configured AI providers failed."),
    );

    const results = await evaluateAnswers(
      [
        subjective,
        {
          ...subjective,
          id: 10,
          text: "State two outputs of photosynthesis.",
        },
      ],
      {
        "9": "Chlorophyll captures sunlight. Plants use carbon dioxide and water to make glucose.",
        "10": "Glucose and oxygen are released.",
      },
    );

    expect(results).toHaveLength(2);
    expect(results[0].feedback).toContain("AI examiner unavailable");
    expect(results[0].evaluationMethod).toBe("LOCAL_FALLBACK");
    expect(results[0].marksAwarded).toBeLessThanOrEqual(results[0].maxMarks);
    expect(results[1].feedback).toContain("AI examiner unavailable");
    expect(results[1].evaluationMethod).toBe("LOCAL_FALLBACK");
    expect(mockedGenerateJSON).toHaveBeenCalledTimes(1);
  });

  it("checks numerical sub-questions locally when the final answer is clear", async () => {
    const results = await evaluateAnswers([caseBasedWithNumerical], {
      "11": { "0": { final: "20", unit: "cm" } },
    });

    expect(results[0].marksAwarded).toBe(2);
    expect(results[0].evaluationMethod).toBe("OBJECTIVE_KEY");
    expect(mockedGenerateJSON).not.toHaveBeenCalled();
  });

  it("accepts equivalent fill-blank and one-word answers despite spacing, case, and singular wording", async () => {
    const questions: GeneratedQuestion[] = [
      {
        id: 12,
        text: "A ________ is a homogeneous mixture.",
        type: "FILL_BLANK",
        difficulty: "MEDIUM",
        marks: 1,
        correctAnswer: "true solution",
        explanation: "A true solution is homogeneous.",
        bloomLevel: "REMEMBER",
        competencyLevel: 1,
      },
      {
        id: 13,
        text: "The resultant displacement is ________ m.",
        type: "FILL_BLANK",
        difficulty: "MEDIUM",
        marks: 1,
        correctAnswer: "150 m",
        explanation: "Use Pythagoras theorem.",
        bloomLevel: "APPLY",
        competencyLevel: 2,
      },
      {
        id: 14,
        text: "What is acceleration in uniform velocity?",
        type: "ONE_WORD",
        difficulty: "MEDIUM",
        marks: 1,
        correctAnswer: "Zero",
        explanation: "Uniform velocity has no acceleration.",
        bloomLevel: "REMEMBER",
        competencyLevel: 1,
      },
    ];

    const results = await evaluateAnswers(questions, {
      "12": "True Solutions",
      "13": "150m",
      "14": "0",
    });

    expect(results.map((result) => result.marksAwarded)).toEqual([1, 1, 1]);
    expect(results.every((result) => result.isCorrect)).toBe(true);
  });
});
