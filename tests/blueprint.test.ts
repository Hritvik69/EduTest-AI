import { describe, expect, it } from "vitest";
import { generateBlueprint } from "@/lib/blueprint";
import { defaultBloomDistribution } from "@/lib/edutest-data";
import type { PaperConfig } from "@/types";

const baseConfig: PaperConfig = {
  classNum: 10,
  subject: "Science",
  subjects: ["Science"],
  subjectSelections: [{ subject: "Science", chapterIds: [1], topicIds: [] }],
  chapterIds: [1],
  totalMarks: 40,
  duration: 90,
  examType: "Practice",
  difficulty: "MEDIUM",
  questionTypes: ["MCQ", "SHORT", "LONG"],
  typeDistribution: { MCQ: 12, SHORT: 6, LONG: 2 },
  bloomDistribution: defaultBloomDistribution,
  totalQuestions: 20,
};

describe("generateBlueprint", () => {
  it("deterministically matches requested marks", () => {
    const blueprint = generateBlueprint(baseConfig);

    expect(blueprint.totalMarks).toBe(40);
    expect(
      blueprint.sections.reduce((sum, section) => sum + section.totalMarks, 0),
    ).toBe(40);
  });

  it("turns a 40-mark MCQ-only paper into exactly 40 MCQs", () => {
    const blueprint = generateBlueprint({
      ...baseConfig,
      questionTypes: ["MCQ"],
      typeDistribution: { MCQ: 40 },
      totalQuestions: 40,
    });

    expect(blueprint.sections).toHaveLength(1);
    expect(blueprint.sections[0].questionType).toBe("MCQ");
    expect(blueprint.sections[0].count).toBe(40);
    expect(blueprint.sections[0].totalMarks).toBe(40);
  });

  it("calculates marks from the selected question counts", () => {
    const blueprint = generateBlueprint({
      ...baseConfig,
      questionTypes: ["MATCH_FOLLOWING"],
      typeDistribution: { MATCH_FOLLOWING: 20 },
    });

    expect(blueprint.totalQuestions).toBe(20);
    expect(blueprint.totalMarks).toBe(60);
  });
});
