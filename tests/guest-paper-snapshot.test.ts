import { describe, expect, it } from "vitest";
import {
  signGuestPaperSnapshot,
  toGuestPaperSnapshot,
  verifyGuestPaperSnapshot,
} from "@/lib/guest-paper-snapshot";
import { createGuestUser } from "@/lib/api-security";
import { defaultBloomDistribution } from "@/lib/edutest-data";
import type { StoredPaper } from "@/types";

describe("guest paper snapshot signing", () => {
  it("verifies the same guest paper snapshot for the same guest session", async () => {
    const guest = createGuestUser("guest-session-snapshot-a");
    const paper = paperFixture();
    const token = await signGuestPaperSnapshot(paper, guest.id);

    await expect(
      verifyGuestPaperSnapshot(toGuestPaperSnapshot(paper), token, guest.id, paper.id),
    ).resolves.toMatchObject({ id: paper.id, questions: paper.questions });
  });

  it("rejects tampered snapshots and different guest sessions", async () => {
    const guest = createGuestUser("guest-session-snapshot-a");
    const otherGuest = createGuestUser("guest-session-snapshot-b");
    const paper = paperFixture();
    const token = await signGuestPaperSnapshot(paper, guest.id);
    const tampered = {
      ...toGuestPaperSnapshot(paper),
      questions: [{ ...paper.questions[0], correctAnswer: "A" }],
    };

    await expect(
      verifyGuestPaperSnapshot(tampered, token, guest.id, paper.id),
    ).resolves.toBeNull();
    await expect(
      verifyGuestPaperSnapshot(toGuestPaperSnapshot(paper), token, otherGuest.id, paper.id),
    ).resolves.toBeNull();
  });
});

function paperFixture(): StoredPaper {
  return {
    id: 123,
    title: "Class 8 English School Test",
    config: {
      classNum: 8,
      subject: "English",
      subjects: ["English"],
      subjectSelections: [{ subject: "English", chapterIds: [1], topicIds: [] }],
      chapterIds: [1],
      totalMarks: 1,
      duration: 90,
      examType: "School Test",
      difficulty: "MEDIUM",
      questionTypes: ["MCQ"],
      typeDistribution: { MCQ: 1 },
      bloomDistribution: defaultBloomDistribution,
      totalQuestions: 1,
    },
    blueprint: {
      sections: [
        {
          name: "Section A",
          questionType: "MCQ",
          count: 1,
          marksPerQuestion: 1,
          totalMarks: 1,
          difficulty: "MEDIUM",
          difficultyBreakdown: { MEDIUM: 100 },
          bloomBreakdown: defaultBloomDistribution,
        },
      ],
      totalQuestions: 1,
      totalMarks: 1,
      estimatedTime: 10,
      competencyPercentage: 60,
    },
    questions: [
      {
        id: 1,
        text: "Which option best explains the selected chapter concept?",
        type: "MCQ",
        difficulty: "MEDIUM",
        marks: 1,
        options: [
          { id: "A", text: "Wrong", isCorrect: false },
          { id: "B", text: "Correct", isCorrect: true },
          { id: "C", text: "Wrong again", isCorrect: false },
          { id: "D", text: "Unrelated", isCorrect: false },
        ],
        correctAnswer: "B",
        explanation: "B matches the source concept.",
        bloomLevel: "UNDERSTAND",
        competencyLevel: 2,
      },
    ],
    isDemoMode: false,
    status: "READY",
    createdAt: "2026-06-01T00:00:00.000Z",
  };
}
