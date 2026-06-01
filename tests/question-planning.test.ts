import { describe, expect, it } from "vitest";
import {
  bloomDistributionForDifficulty,
  buildGenerationArchitecturePlan,
  generationPhaseLabels,
  intelligenceCountsForTotal,
  targetBloomLevelsForDifficulty,
} from "@/lib/question-planning";
import type {
  Blueprint,
  ConceptData,
  PaperConfig,
  QuestionCompositionItem,
} from "@/types";

const composition: QuestionCompositionItem[] = [
  {
    subject: "Mathematics",
    chapterId: 1,
    chapterName: "Number Systems",
    topicId: 101,
    topicName: "Irrational Numbers",
    questionCount: 5,
  },
  {
    subject: "Mathematics",
    chapterId: 1,
    chapterName: "Number Systems",
    topicId: 102,
    topicName: "Real Number Representation",
    questionCount: 3,
  },
];

const config: PaperConfig = {
  classNum: 9,
  subject: "Mathematics",
  subjects: ["Mathematics"],
  subjectSelections: [
    { subject: "Mathematics", chapterIds: [1], topicIds: [101, 102] },
  ],
  chapterIds: [1],
  topicIds: [101, 102],
  totalMarks: 8,
  duration: 60,
  examType: "Practice",
  difficulty: "HARD",
  questionTypes: ["MCQ", "ASSERTION_REASON"],
  typeDistribution: { MCQ: 5, ASSERTION_REASON: 3 },
  questionComposition: composition,
  bloomDistribution: bloomDistributionForDifficulty("HARD"),
  totalQuestions: 8,
};

const blueprint: Blueprint = {
  sections: [
    {
      name: "Section A",
      questionType: "MCQ",
      count: 5,
      marksPerQuestion: 1,
      totalMarks: 5,
      difficulty: "HARD",
      difficultyBreakdown: { EASY: 0, MEDIUM: 20, HARD: 70, ABSURD: 10 },
      bloomBreakdown: bloomDistributionForDifficulty("HARD"),
    },
    {
      name: "Section B",
      questionType: "ASSERTION_REASON",
      count: 3,
      marksPerQuestion: 1,
      totalMarks: 3,
      difficulty: "HARD",
      difficultyBreakdown: { EASY: 0, MEDIUM: 20, HARD: 70, ABSURD: 10 },
      bloomBreakdown: bloomDistributionForDifficulty("HARD"),
    },
  ],
  totalQuestions: 8,
  totalMarks: 8,
  estimatedTime: 60,
  competencyPercentage: 60,
};

const concepts: ConceptData[] = [
  {
    text: "Irrational numbers cannot be expressed as p/q.",
    type: "DEFINITION",
    bloomLevel: "UNDERSTAND",
    hotsPotential: false,
    topicName: "Irrational Numbers",
    topicId: 101,
    chapterId: 1,
    source: "curriculum",
  },
  {
    text: "Proofs around irrationality reveal common misconception traps.",
    type: "APPLICATION",
    bloomLevel: "ANALYZE",
    hotsPotential: true,
    topicName: "Irrational Numbers",
    topicId: 101,
    chapterId: 1,
    source: "curriculum",
  },
  {
    text: "Real numbers can be represented on the number line.",
    type: "FACT",
    bloomLevel: "APPLY",
    hotsPotential: false,
    topicName: "Real Number Representation",
    topicId: 102,
    chapterId: 1,
    source: "curriculum",
  },
];

describe("question planning architecture", () => {
  it("splits Phase 3 question intelligence into exact counts", () => {
    expect(intelligenceCountsForTotal(17)).toEqual({
      basic: 7,
      important: 6,
      conceptualTrap: 4,
    });
  });

  it("maps difficulty to the intended Bloom focus", () => {
    expect(targetBloomLevelsForDifficulty("EASY")).toEqual([
      "REMEMBER",
      "UNDERSTAND",
    ]);
    expect(targetBloomLevelsForDifficulty("MEDIUM")).toEqual(["APPLY", "ANALYZE"]);
    expect(targetBloomLevelsForDifficulty("HARD")).toEqual([
      "ANALYZE",
      "EVALUATE",
    ]);
    expect(targetBloomLevelsForDifficulty("ABSURD")).toEqual([
      "EVALUATE",
      "CREATE",
    ]);
  });

  it("builds the seven-phase generation contract passed to AI", () => {
    const plan = buildGenerationArchitecturePlan(
      config,
      blueprint,
      concepts,
      composition,
    );

    expect(plan.phases).toEqual(generationPhaseLabels);
    expect(plan.configuration).toMatchObject({
      class: 9,
      difficulty: "HARD",
      examType: "Practice",
      questionTarget: 8,
    });
    expect(plan.configuration.subjects).toEqual(["Mathematics"]);
    expect(plan.configuration.questionFormats).toEqual({
      MCQ: 5,
      ASSERTION_REASON: 3,
    });
    expect(plan.questionPlanning.questionIntelligence).toMatchObject({
      basic: { percentage: 40, goal: "Foundational understanding" },
      important: { percentage: 35, goal: "Board-weightage concepts" },
      conceptualTrap: {
        percentage: 25,
        goal: "Deep conceptual reasoning",
      },
    });
    expect(plan.cognitiveDistribution).toEqual({
      difficulty: "HARD",
      targetBloomLevels: ["ANALYZE", "EVALUATE"],
      bloomDistribution: bloomDistributionForDifficulty("HARD"),
    });
    expect(plan.conceptWeightage[0]).toMatchObject({
      subject: "Mathematics",
      topicName: "Irrational Numbers",
      questionCount: 5,
      priority: "HIGH",
    });
  });
});
