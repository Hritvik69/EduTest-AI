import { describe, expect, it } from "vitest";
import { defaultBloomDistribution } from "@/lib/edutest-data";
import { generateSourceBackedFallbackQuestions } from "@/lib/source-backed-fallback";
import { validatePaperKeepingValidQuestions } from "@/lib/validator";
import type { Blueprint, ConceptData, PaperConfig } from "@/types";

const config: PaperConfig = {
  classNum: 8,
  subject: "English",
  subjects: ["English"],
  subjectSelections: [{ subject: "English", chapterIds: [1], topicIds: [] }],
  chapterIds: [1],
  totalMarks: 9,
  duration: 90,
  examType: "School Test",
  difficulty: "MEDIUM",
  aiProvider: "AUTO",
  questionTypes: ["MCQ", "CASE_BASED", "SHORT"],
  typeDistribution: { MCQ: 2, CASE_BASED: 1, SHORT: 1 },
  bloomDistribution: defaultBloomDistribution,
  totalQuestions: 4,
};

const concepts: ConceptData[] = [
  {
    text: "The selected chapter shows how wit can solve a difficult social situation through careful language and quick reasoning.",
    type: "FACT",
    bloomLevel: "UNDERSTAND",
    hotsPotential: true,
    subject: "English",
    classNum: 8,
    chapterName: "The Wit that Won Hearts",
    topicName: "Reading comprehension and inference",
    chapterId: 1,
    topicId: 10,
    source: "pdf",
  },
  {
    text: "Vocabulary and grammar in context help students infer tone, intention, and meaning from the selected chapter passage.",
    type: "FACT",
    bloomLevel: "APPLY",
    hotsPotential: false,
    subject: "English",
    classNum: 8,
    chapterName: "The Wit that Won Hearts",
    topicName: "Vocabulary and grammar in context",
    chapterId: 1,
    topicId: 11,
    source: "pdf",
  },
];

describe("generateSourceBackedFallbackQuestions", () => {
  it("fills every missing section with locally valid selected-source questions", () => {
    const blueprint: Blueprint = {
      sections: [
        {
          name: "Section A",
          questionType: "MCQ",
          count: 2,
          marksPerQuestion: 1,
          totalMarks: 2,
          difficulty: "MEDIUM",
          difficultyBreakdown: { MEDIUM: 100 },
          bloomBreakdown: defaultBloomDistribution,
        },
        {
          name: "Section D",
          questionType: "CASE_BASED",
          count: 1,
          marksPerQuestion: 4,
          totalMarks: 4,
          difficulty: "MEDIUM",
          difficultyBreakdown: { MEDIUM: 100 },
          bloomBreakdown: defaultBloomDistribution,
        },
        {
          name: "Section B/C",
          questionType: "SHORT",
          count: 1,
          marksPerQuestion: 3,
          totalMarks: 3,
          difficulty: "MEDIUM",
          difficultyBreakdown: { MEDIUM: 100 },
          bloomBreakdown: defaultBloomDistribution,
        },
      ],
      totalQuestions: 4,
      totalMarks: 9,
      estimatedTime: 30,
      competencyPercentage: 60,
    };

    const questions = generateSourceBackedFallbackQuestions(
      blueprint.sections,
      concepts,
      config,
    );
    const validation = validatePaperKeepingValidQuestions(questions, blueprint, config);

    expect(validation.questions).toHaveLength(4);
    expect(validation.blueprint.totalQuestions).toBe(4);
    expect(validation.blueprint.totalMarks).toBe(9);
    expect(validation.skipped).toEqual([]);
    expect(validation.questions.every((question) => question.chapterId === 1)).toBe(true);
  });
});
