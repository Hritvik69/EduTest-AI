import { describe, expect, it } from "vitest";
import { createPaperPdfBuffer } from "@/lib/paper-pdf-export";
import { defaultBloomDistribution } from "@/lib/edutest-data";
import type { StoredPaper } from "@/types";

const paper: StoredPaper = {
  id: 101,
  title: "Class 9 Science Practice",
  status: "READY",
  isDemoMode: false,
  createdAt: new Date().toISOString(),
  config: {
    classNum: 9,
    subject: "Science",
    subjects: ["Science"],
    subjectSelections: [{ subject: "Science", chapterIds: [1], topicIds: [] }],
    chapterIds: [1],
    totalMarks: 3,
    duration: 90,
    examType: "Practice",
    difficulty: "MEDIUM",
    aiProvider: "AUTO",
    questionTypes: ["MCQ", "MATCH_FOLLOWING"],
    typeDistribution: { MCQ: 1, MATCH_FOLLOWING: 1 },
    questionComposition: [],
    bloomDistribution: defaultBloomDistribution,
    totalQuestions: 2,
  },
  blueprint: {
    sections: [],
    totalQuestions: 2,
    totalMarks: 3,
    estimatedTime: 90,
    competencyPercentage: 65,
  },
  questions: [
    {
      id: 1,
      text: "Which option is correct?",
      type: "MCQ",
      difficulty: "MEDIUM",
      marks: 1,
      options: [
        { id: "A", text: "Correct", isCorrect: true },
        { id: "B", text: "Wrong", isCorrect: false },
      ],
      correctAnswer: "A",
      explanation: "A is correct.",
      bloomLevel: "UNDERSTAND",
      competencyLevel: 2,
      section: "Section A",
    },
    {
      id: 2,
      text: "Match the following.",
      type: "MATCH_FOLLOWING",
      difficulty: "MEDIUM",
      marks: 2,
      matchPairs: [{ left: "Cell wall", right: "Outer boundary" }],
      correctAnswer: "Cell wall - Outer boundary",
      explanation: "Pairing.",
      bloomLevel: "REMEMBER",
      competencyLevel: 1,
      section: "Section A",
    },
  ],
};

describe("paper PDF export", () => {
  it("creates a valid PDF buffer for guest-session papers", async () => {
    const pdf = await createPaperPdfBuffer(paper, true);

    expect(pdf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect(pdf.toString("latin1")).toContain("xref");
    expect(pdf.length).toBeGreaterThan(1000);
  });

  it("exports long text, symbols, Hindi, and page-break markers without crashing", async () => {
    const pdf = await createPaperPdfBuffer(
      {
        ...paper,
        title: "Class 9 Science दीर्घ Test",
        questions: [
          {
            ...paper.questions[0]!,
            text:
              "Explain ऊर्जा transfer: α + β → γ. --- Page Break --- " +
              "Compare values in a table with ≤, ≥, ×, and ÷ symbols.",
            correctAnswer: "ऊर्जा is conserved with correct comparison symbols.",
          },
        ],
      },
      true,
    );

    expect(pdf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect(pdf.length).toBeGreaterThan(1000);
  });
});
