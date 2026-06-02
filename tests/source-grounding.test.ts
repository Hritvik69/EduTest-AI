import { describe, expect, it } from "vitest";
import { assertSourceGroundingForGeneration } from "@/lib/source-grounding";
import { defaultBloomDistribution } from "@/lib/edutest-data";
import type { ConceptData, PaperConfig } from "@/types";

const baseConfig: PaperConfig = {
  sourceMode: "curriculum",
  classNum: 8,
  subject: "English",
  subjects: ["English"],
  subjectSelections: [],
  chapterIds: [1],
  topicIds: [],
  totalMarks: 5,
  duration: 30,
  examType: "School Test",
  difficulty: "MEDIUM",
  aiProvider: "AUTO",
  questionTypes: ["MCQ"],
  typeDistribution: { MCQ: 5 },
  bloomDistribution: defaultBloomDistribution,
  totalQuestions: 5,
};

describe("source grounding preflight", () => {
  it("blocks English literature generation from outline-only curriculum topics", () => {
    expect(() =>
      assertSourceGroundingForGeneration(baseConfig, [
        concept(
          "Poorvi: The Wit that Won Hearts",
          'Class 8 English chapter "The Wit that Won Hearts" includes the NCERT/CBSE topic "Poorvi: The Wit that Won Hearts". Generate questions only from this selected chapter-topic pair.',
          "curriculum",
        ),
        concept("Reading comprehension and inference", "Reading comprehension and inference", "curriculum"),
        concept("Theme, character, tone, and literary devices", "Theme, character, tone, and literary devices", "curriculum"),
      ]),
    ).toThrow(/only outline topics/i);
  });

  it("blocks non-textual curriculum generation from outline-only topic labels", () => {
    const config: PaperConfig = {
      ...baseConfig,
      classNum: 9,
      subject: "Mathematics",
      subjects: ["Mathematics"],
    };

    expect(() =>
      assertSourceGroundingForGeneration(config, [
        concept(
          "Coordinate Geometry",
          'Class 9 Mathematics chapter "Coordinate Geometry" includes the NCERT/CBSE topic "Plotting points on the Cartesian plane". Generate questions only from this selected chapter-topic pair.',
          "curriculum",
        ),
      ]),
    ).toThrow(/only outline topics|not enough real NCERT chapter text/i);
  });

  it("blocks PDF mode when no PDF concepts were actually loaded", () => {
    const config: PaperConfig = {
      ...baseConfig,
      sourceMode: "pdf_upload",
      pdfSourceId: 9,
      pdfSource: { id: 9, title: "Poorvi.pdf", fileName: "Poorvi.pdf", wordCount: 1200, conceptsCount: 1, topics: [] },
    };

    expect(() =>
      assertSourceGroundingForGeneration(config, [
        concept("Fallback", "Reading comprehension and inference", "curriculum"),
      ]),
    ).toThrow(/no extracted PDF concepts/i);
  });

  it("blocks weak PDF extraction that only produced headings or fallback labels", () => {
    const config: PaperConfig = {
      ...baseConfig,
      sourceMode: "pdf_upload",
      pdfSourceId: 10,
      pdfSource: { id: 10, title: "Poorvi.pdf", fileName: "Poorvi.pdf", wordCount: 900, conceptsCount: 1, topics: [] },
    };

    expect(() =>
      assertSourceGroundingForGeneration(config, [
        concept("Poorvi", "Poorvi is an important concept from the uploaded PDF.", "pdf"),
      ]),
    ).toThrow(/did not produce enough real readable text/i);
  });

  it("allows PDF mode when concepts contain real extracted source evidence", () => {
    const config: PaperConfig = {
      ...baseConfig,
      sourceMode: "pdf_upload",
      pdfSourceId: 11,
      pdfSource: { id: 11, title: "Poorvi.pdf", fileName: "Poorvi.pdf", wordCount: 1400, conceptsCount: 3, topics: [] },
    };
    const paragraph =
      "The uploaded chapter describes Poorvi as a student whose quick thinking helps her answer a difficult classroom question. The teacher asks the class to explain a proverb, and Poorvi connects it to kindness through a simple example from daily life.";

    expect(() =>
      assertSourceGroundingForGeneration(config, [
        concept("Poorvi", paragraph, "pdf"),
        concept("Character", `${paragraph} Her classmates respond with surprise because the answer is both respectful and witty.`, "pdf"),
      ]),
    ).not.toThrow();
  });
});

function concept(
  topicName: string,
  text: string,
  source: ConceptData["source"],
): ConceptData {
  return {
    text,
    type: "FACT",
    bloomLevel: "UNDERSTAND",
    hotsPotential: false,
    topicName,
    chapterId: 1,
    source,
  };
}
