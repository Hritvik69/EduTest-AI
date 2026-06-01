import { describe, expect, it } from "vitest";
import {
  buildQuestionCompositionPlan,
  normalizeQuestionComposition,
} from "@/lib/composition";
import { defaultBloomDistribution } from "@/lib/edutest-data";
import type { Blueprint, QuestionCompositionItem } from "@/types";

const composition: QuestionCompositionItem[] = [
  {
    subject: "Science",
    chapterId: 1,
    chapterName: "Chemical Reactions",
    topicId: 11,
    topicName: "Equations",
    questionCount: 5,
  },
  {
    subject: "Science",
    chapterId: 2,
    chapterName: "Acids",
    topicId: 21,
    topicName: "Indicators",
    questionCount: 4,
  },
  {
    subject: "Science",
    chapterId: 3,
    chapterName: "Metals",
    topicId: 31,
    topicName: "Reactivity",
    questionCount: 3,
  },
];

const blueprint: Blueprint = {
  sections: [
    {
      name: "Section A",
      questionType: "MCQ",
      count: 6,
      marksPerQuestion: 1,
      totalMarks: 6,
      difficulty: "MEDIUM",
      difficultyBreakdown: { EASY: 20, MEDIUM: 70, HARD: 10, ABSURD: 0 },
      bloomBreakdown: defaultBloomDistribution,
    },
    {
      name: "Section B/C",
      questionType: "SHORT",
      count: 4,
      marksPerQuestion: 3,
      totalMarks: 12,
      difficulty: "MEDIUM",
      difficultyBreakdown: { EASY: 20, MEDIUM: 70, HARD: 10, ABSURD: 0 },
      bloomBreakdown: defaultBloomDistribution,
    },
    {
      name: "Section E",
      questionType: "LONG",
      count: 2,
      marksPerQuestion: 5,
      totalMarks: 10,
      difficulty: "MEDIUM",
      difficultyBreakdown: { EASY: 20, MEDIUM: 70, HARD: 10, ABSURD: 0 },
      bloomBreakdown: defaultBloomDistribution,
    },
  ],
  totalQuestions: 12,
  totalMarks: 28,
  estimatedTime: 90,
  competencyPercentage: 60,
};

describe("question composition", () => {
  it("normalizes coverage rows to the exact question total", () => {
    const result = normalizeQuestionComposition(
      composition.map(({ questionCount, ...item }) => item),
      [],
      10,
    );

    expect(result.map((item) => item.questionCount)).toEqual([4, 3, 3]);
    expect(result.reduce((sum, item) => sum + item.questionCount, 0)).toBe(10);
  });

  it("builds a section plan that preserves composition and question-type totals", () => {
    const plan = buildQuestionCompositionPlan(blueprint, composition);
    const columnTotals = plan.map((sectionPlan) =>
      sectionPlan.allocations.reduce((sum, item) => sum + item.count, 0),
    );
    const rowTotals = composition.map((item) =>
      plan.reduce((sum, sectionPlan) => {
        const allocation = sectionPlan.allocations.find(
          (candidate) => candidate.item.topicId === item.topicId,
        );
        return sum + (allocation?.count ?? 0);
      }, 0),
    );

    expect(columnTotals).toEqual([6, 4, 2]);
    expect(rowTotals).toEqual([5, 4, 3]);
  });
});
