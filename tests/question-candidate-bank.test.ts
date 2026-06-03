import { describe, expect, it } from "vitest";
import {
  QuestionCandidateBank,
  stripGenerationMetadataFromQuestions,
} from "@/lib/question-candidate-bank";
import type { Blueprint, GeneratedQuestion, PaperConfig } from "@/types";

const blueprint: Blueprint = {
  totalQuestions: 2,
  totalMarks: 2,
  sections: [
    {
      name: "Section A",
      questionType: "MCQ",
      count: 2,
      marksPerQuestion: 1,
      totalMarks: 2,
      difficulty: "MEDIUM",
      difficultyBreakdown: { MEDIUM: 2 },
      bloomBreakdown: { UNDERSTAND: 2 },
    },
  ],
  estimatedTime: 2,
  competencyPercentage: 0,
};

const config: PaperConfig = {
  classNum: 10,
  subject: "English",
  chapterIds: [1],
  totalMarks: 2,
  duration: 10,
  examType: "Test",
  difficulty: "MEDIUM",
  questionTypes: ["MCQ"],
  typeDistribution: { MCQ: 2 },
  bloomDistribution: {
    REMEMBER: 20,
    UNDERSTAND: 40,
    APPLY: 20,
    ANALYZE: 10,
    EVALUATE: 5,
    CREATE: 5,
  },
  totalQuestions: 2,
};

describe("QuestionCandidateBank", () => {
  it("serializes accepted, rejected, duplicate, and missing state for resume", () => {
    const bank = new QuestionCandidateBank(
      [
        mcq("Why does the narrator feel uneasy?", "A"),
        mcq("Why does the narrator feel uneasy?", "A"),
      ],
      blueprint,
      config,
    );

    const state = bank.toGenerationState({
      status: "NEEDS_CONTINUATION",
      phase: "REPAIR",
      generationJobId: "job-1",
      idempotencyKey: "paper:test",
      sourceContextHash: "ctx",
      attemptCount: 1,
      createdAt: "2026-06-03T00:00:00.000Z",
    });

    expect(state.readyQuestionCount).toBe(1);
    expect(state.missingQuestionCount).toBe(1);
    expect(state.candidateQuestions).toHaveLength(2);
    expect(state.acceptedQuestions).toHaveLength(1);
    expect(state.rejectedQuestions.map((item) => item.reason)).toContain(
      "DUPLICATE",
    );
    expect(state.duplicateGroups).toHaveLength(1);

    const restored = QuestionCandidateBank.fromGenerationState(state);
    restored.add([mcq("What choice shows the narrator's courage?", "B")]);

    expect(restored.readyCount()).toBe(2);
    expect(restored.missingCount()).toBe(0);
  });

  it("strips generation-only novelty metadata before final save", () => {
    const [saved] = stripGenerationMetadataFromQuestions([
      {
        ...mcq("What is the central conflict?", "C"),
        noveltyAngle: "conflict contrast",
        sourceChunkFocus: "opening exchange",
        answerPath: "identify conflict, then infer motive",
      },
    ]);

    expect(saved).not.toHaveProperty("noveltyAngle");
    expect(saved).not.toHaveProperty("sourceChunkFocus");
    expect(saved).not.toHaveProperty("answerPath");
  });
});

function mcq(text: string, correctId: string): GeneratedQuestion {
  return {
    text,
    type: "MCQ",
    difficulty: "MEDIUM",
    marks: 1,
    options: ["A", "B", "C", "D"].map((id) => ({
      id,
      text: `Option ${id}`,
      isCorrect: id === correctId,
    })),
    correctAnswer: correctId,
    explanation: "The answer follows the selected NCERT TXT source.",
    bloomLevel: "UNDERSTAND",
    competencyLevel: 2,
    topic: "Reading",
    chapterId: 1,
    subject: "English",
    classNum: 10,
    noveltyAngle: `angle ${text}`,
    sourceChunkFocus: `chunk ${text}`,
    answerPath: `path ${correctId}`,
  };
}
