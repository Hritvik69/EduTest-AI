import { describe, expect, it } from "vitest";
import { classifyRecoveredPaper } from "@/lib/generation-recovery";
import type { StoredPaper } from "@/types";

const basePaper: StoredPaper = {
  id: 101,
  title: "Class 9 Mathematics Practice",
  config: {} as StoredPaper["config"],
  blueprint: {} as StoredPaper["blueprint"],
  questions: [],
  isDemoMode: false,
  status: "GENERATING",
  createdAt: "2026-06-04T00:00:00.000Z",
};

describe("generation recovery classification", () => {
  it("opens a ready paper only when questions are saved", () => {
    const paper: StoredPaper = {
      ...basePaper,
      status: "READY",
      questions: [{} as StoredPaper["questions"][number]],
    };

    expect(classifyRecoveredPaper(paper)).toMatchObject({
      kind: "ready",
      paperId: 101,
    });
  });

  it("allows manual retry for a generating paper with saved zero-question state", () => {
    const paper: StoredPaper = {
      ...basePaper,
      errorMetadata: {
        generationState: {
          version: 1,
          status: "IN_PROGRESS",
          phase: "INITIAL_GENERATION",
          readyQuestionCount: 0,
          targetQuestionCount: 28,
          missingQuestionCount: 28,
          lastMessage: "Paper shell saved; waiting for the first valid AI questions.",
        },
      },
    };

    expect(classifyRecoveredPaper(paper)).toMatchObject({
      kind: "recoverable",
      paperId: 101,
      readyQuestionCount: 0,
      targetQuestionCount: 28,
      savedQuestionProgress: false,
    });
  });

  it("treats NEEDS_CONTINUATION metadata as recoverable even if the paper row is failed", () => {
    const paper: StoredPaper = {
      ...basePaper,
      status: "FAILED",
      errorMetadata: {
        generationState: {
          version: 1,
          status: "NEEDS_CONTINUATION",
          phase: "QUESTION_GENERATION",
          readyQuestionCount: 4,
          targetQuestionCount: 10,
          missingQuestionCount: 6,
          lastMessage: "Generation reached the deployment time limit.",
        },
      },
    };

    expect(classifyRecoveredPaper(paper)).toMatchObject({
      kind: "recoverable",
      paperId: 101,
      readyQuestionCount: 4,
      targetQuestionCount: 10,
      missingQuestionCount: 6,
      savedQuestionProgress: true,
      message: "Generation reached the deployment time limit.",
    });
  });

  it("marks shell-only and failed papers as ignored instead of dashboard-ready", () => {
    expect(classifyRecoveredPaper(basePaper)).toMatchObject({
      kind: "ignored",
    });
    expect(
      classifyRecoveredPaper({
        ...basePaper,
        status: "FAILED",
        errorMetadata: { message: "provider timeout" },
      }),
    ).toMatchObject({
      kind: "ignored",
      message: expect.stringContaining("No finished paper"),
    });
  });
});
