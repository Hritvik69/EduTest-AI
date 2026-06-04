import { describe, expect, it } from "vitest";
import {
  hasForbiddenStudentVisiblePattern,
  isUsableGeneratedQuestion,
} from "@/lib/question-validation";
import type { BlueprintSection, GeneratedQuestion } from "@/types";

const section: BlueprintSection = {
  name: "Section A",
  questionType: "MCQ",
  count: 1,
  marksPerQuestion: 1,
  totalMarks: 1,
  difficulty: "MEDIUM",
  difficultyBreakdown: { MEDIUM: 100 },
  bloomBreakdown: { UNDERSTAND: 100 },
};

describe("student-visible question quality validation", () => {
  it("rejects internal source metadata and source-audit wording", () => {
    expect(
      hasForbiddenStudentVisiblePattern(
        "Which evidence-based statement best explains source detail physics-c930002-tall-txt-a7-sd99r7?",
      ),
    ).toBe(true);
    expect(
      hasForbiddenStudentVisiblePattern(
        "Only naming Vocabulary and grammar in context without explaining the evidence detail link.",
      ),
    ).toBe(true);
    expect(
      hasForbiddenStudentVisiblePattern(
        "Why does a stack of coins slow down more on a rough surface?",
      ),
    ).toBe(false);
  });

  it("rejects an otherwise valid MCQ if options leak metadata", () => {
    const question: GeneratedQuestion = {
      text: "Which statement best explains the motion of a stack of coins?",
      type: "MCQ",
      marks: 1,
      difficulty: "MEDIUM",
      bloomLevel: "UNDERSTAND",
      competencyLevel: 2,
      reasoningSteps: 2,
      difficultyConfidence: 0.8,
      cognitiveComplexity: {
        conceptIntegration: 2,
        abstractionLevel: 2,
        inferenceLevel: 2,
        ambiguityLevel: 1,
        cognitiveLoad: 2,
      },
      topic: "Force and friction",
      correctAnswer: "B",
      explanation: "The correct option explains how friction affects motion.",
      options: [
        { id: "A", text: "Friction has no effect on motion.", isCorrect: false },
        {
          id: "B",
          text: "Evidence from the selected source; precise detail physics-c930002-tall-txt-a7-sd99r7.",
          isCorrect: true,
        },
        { id: "C", text: "A moving object stops only when energy disappears.", isCorrect: false },
        { id: "D", text: "Smoothness always makes an object slower.", isCorrect: false },
      ],
    };

    expect(isUsableGeneratedQuestion(question, section)).toBe(false);
  });
});
