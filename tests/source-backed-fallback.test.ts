import { describe, expect, it } from "vitest";
import { defaultBloomDistribution } from "@/lib/edutest-data";
import {
  generateSourceBackedFallbackQuestions,
  hasSourceBackedFallbackConcepts,
} from "@/lib/source-backed-fallback";
import { validatePaperKeepingValidQuestions } from "@/lib/validator";
import type { Blueprint, ConceptData, PaperConfig } from "@/types";

const config: PaperConfig = {
  classNum: 8,
  subject: "English",
  subjects: ["English"],
  subjectSelections: [{ subject: "English", chapterIds: [1], topicIds: [] }],
  chapterIds: [1],
  totalMarks: 18,
  duration: 90,
  examType: "School Test",
  difficulty: "MEDIUM",
  aiProvider: "AUTO",
  questionTypes: ["MCQ", "CASE_BASED", "SHORT", "SOURCE_BASED", "LONG"],
  typeDistribution: { MCQ: 2, CASE_BASED: 1, SHORT: 1, SOURCE_BASED: 1, LONG: 1 },
  bloomDistribution: defaultBloomDistribution,
  totalQuestions: 6,
};

const concepts: ConceptData[] = [
  {
    text: "The selected chapter shows how wit can solve a difficult social situation through careful language and quick reasoning.",
    type: "NCERT_TXT_SOURCE",
    bloomLevel: "UNDERSTAND",
    hotsPotential: true,
    subject: "English",
    classNum: 8,
    chapterName: "The Wit that Won Hearts",
    topicName: "Reading comprehension and inference",
    chapterId: 1,
    topicId: 10,
    source: "ncert_txt",
  },
  {
    text: "Vocabulary and grammar in context help students infer tone, intention, and meaning from the selected chapter passage.",
    type: "NCERT_TXT_SOURCE",
    bloomLevel: "APPLY",
    hotsPotential: false,
    subject: "English",
    classNum: 8,
    chapterName: "The Wit that Won Hearts",
    topicName: "Vocabulary and grammar in context",
    chapterId: 1,
    topicId: 11,
    source: "ncert_txt",
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
        {
          name: "Section E",
          questionType: "SOURCE_BASED",
          count: 1,
          marksPerQuestion: 4,
          totalMarks: 4,
          difficulty: "MEDIUM",
          difficultyBreakdown: { MEDIUM: 100 },
          bloomBreakdown: defaultBloomDistribution,
        },
        {
          name: "Section F",
          questionType: "LONG",
          count: 1,
          marksPerQuestion: 5,
          totalMarks: 5,
          difficulty: "MEDIUM",
          difficultyBreakdown: { MEDIUM: 100 },
          bloomBreakdown: defaultBloomDistribution,
        },
      ],
      totalQuestions: 6,
      totalMarks: 18,
      estimatedTime: 30,
      competencyPercentage: 60,
    };

    const questions = generateSourceBackedFallbackQuestions(
      blueprint.sections,
      concepts,
      config,
    );
    const validation = validatePaperKeepingValidQuestions(questions, blueprint, config);

    expect(validation.questions).toHaveLength(6);
    expect(validation.blueprint.totalQuestions).toBe(6);
    expect(validation.blueprint.totalMarks).toBe(18);
    expect(validation.skipped).toEqual([]);
    expect(validation.questions.every((question) => question.chapterId === 1)).toBe(true);
    expect(
      validation.questions.find((question) => question.type === "SOURCE_BASED")
        ?.subQuestions,
    ).toHaveLength(4);
    expect(
      validation.questions.find((question) => question.type === "LONG")
        ?.correctAnswer,
    ).toContain("Introduction:");
  });

  it("does not generate fallback questions from outline-only concepts", () => {
    const outlineOnly: ConceptData[] = [
      {
        text: "Reading comprehension and inference",
        type: "CURRICULUM_TOPIC",
        bloomLevel: "UNDERSTAND",
        hotsPotential: false,
        subject: "English",
        classNum: 8,
        chapterName: "Outline Chapter",
        topicName: "Reading comprehension and inference",
        chapterId: 1,
        topicId: 10,
        source: "curriculum",
      },
    ];

    expect(hasSourceBackedFallbackConcepts(outlineOnly)).toBe(false);
    expect(
      generateSourceBackedFallbackQuestions(
        [
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
        outlineOnly,
        config,
      ),
    ).toEqual([]);
  });
});
