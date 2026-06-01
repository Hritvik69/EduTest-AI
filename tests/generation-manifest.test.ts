import { describe, expect, it } from "vitest";
import { buildGenerationManifest } from "@/lib/generation-manifest";
import { defaultBloomDistribution } from "@/lib/edutest-data";
import type { Blueprint, ConceptData, GeneratedQuestion, PaperConfig } from "@/types";

const config: PaperConfig = {
  sourceMode: "pdf_upload",
  pdfSourceId: 7,
  pdfSource: {
    id: 7,
    title: "Uploaded chapter",
    fileName: "chapter.pdf",
    wordCount: 1200,
    conceptsCount: 1,
    topics: ["Linear equations"],
  },
  classNum: 9,
  subject: "Uploaded PDF",
  subjects: ["Uploaded PDF"],
  subjectSelections: [],
  chapterIds: [],
  totalMarks: 1,
  duration: 30,
  examType: "Practice",
  difficulty: "MEDIUM",
  aiProvider: "AUTO",
  questionTypes: ["MCQ"],
  typeDistribution: { MCQ: 1 },
  bloomDistribution: defaultBloomDistribution,
  totalQuestions: 1,
};

const blueprint: Blueprint = {
  sections: [
    {
      name: "Section A",
      questionType: "MCQ",
      count: 1,
      marksPerQuestion: 1,
      totalMarks: 1,
      difficulty: "MEDIUM",
      difficultyBreakdown: { MEDIUM: 1 },
      bloomBreakdown: defaultBloomDistribution,
    },
  ],
  totalQuestions: 1,
  totalMarks: 1,
  estimatedTime: 30,
  competencyPercentage: 60,
};

const question: GeneratedQuestion = {
  id: 1,
  text: "What is x?",
  type: "MCQ",
  difficulty: "MEDIUM",
  marks: 1,
  options: [
    { id: "A", text: "1", isCorrect: true },
    { id: "B", text: "2", isCorrect: false },
    { id: "C", text: "3", isCorrect: false },
    { id: "D", text: "4", isCorrect: false },
  ],
  correctAnswer: "A",
  explanation: "x is 1.",
  bloomLevel: "REMEMBER",
  competencyLevel: 1,
};

describe("generation manifest provenance", () => {
  it("does not claim PDF-backed generation when PDF mode falls back to non-PDF concepts", () => {
    const concepts: ConceptData[] = [
      {
        text: "Linear equations",
        type: "concept",
        bloomLevel: "REMEMBER",
        hotsPotential: false,
        topicName: "Linear equations",
        chapterId: 1,
        source: "curriculum",
      },
    ];

    const manifest = buildGenerationManifest({
      config,
      blueprint,
      concepts,
      finalQuestions: [question],
      skippedQuestions: 0,
      replacedQuestions: 0,
      validationWarnings: [],
      taskProviderOrder: { QUESTION_GENERATION: ["GEMINI"] },
    });

    expect(manifest.source.mode).toBe("pdf_upload");
    expect(manifest.source.conceptSource).toBe("curriculum");
    expect(manifest.warnings).toContain(
      "PDF mode was selected, but no extracted PDF concepts were used.",
    );
  });
});
