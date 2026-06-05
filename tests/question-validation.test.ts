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

const matchSection: BlueprintSection = {
  ...section,
  questionType: "MATCH_FOLLOWING",
  marksPerQuestion: 3,
  totalMarks: 3,
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
    expect(
      hasForbiddenStudentVisiblePattern(
        "Which statement best explains the idea described in the chapter?",
      ),
    ).toBe(true);
    expect(
      hasForbiddenStudentVisiblePattern(
        "Match Column A with Column B for ideas from How Forces Affect Motion.",
      ),
    ).toBe(true);
    expect(
      hasForbiddenStudentVisiblePattern(
        "Unit 1.indd 2 24-08-2018 15:24:21 S eSSIon 1 Communication Skills",
      ),
    ).toBe(true);
    expect(
      hasForbiddenStudentVisiblePattern(
        "True or False: The evidence clue shows that communication is complete.",
      ),
    ).toBe(true);
    expect(
      hasForbiddenStudentVisiblePattern(
        "Which case reasoning clue about feedback is most suitable?",
      ),
    ).toBe(true);
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

  it("rejects match-column questions that use metadata labels instead of academic items", () => {
    const question: GeneratedQuestion = {
      text: "Match Column A with Column B.",
      type: "MATCH_FOLLOWING",
      marks: 3,
      difficulty: "MEDIUM",
      bloomLevel: "UNDERSTAND",
      competencyLevel: 3,
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
      correctAnswer: "A1-B1, A2-B2, A3-B3, A4-B4",
      explanation: "The pairs should match subject concepts.",
      matchPairs: [
        { left: "Chapter idea", right: "Smooth surfaces reduce friction." },
        { left: "Chapter", right: "How Forces Affect Motion" },
        { left: "Question focus", right: "evidence" },
        { left: "Conclusion", right: "Explain the chapter idea clearly." },
      ],
    };

    expect(isUsableGeneratedQuestion(question, matchSection)).toBe(false);
  });
});
