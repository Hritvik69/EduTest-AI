import { describe, expect, it } from "vitest";
import {
  collapseForPaperFocus,
  generateBlueprint,
} from "@/lib/blueprint";
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

describe("collapseForPaperFocus", () => {
  it("passes through when focus is mixed / undefined", () => {
    const cfg: PaperConfig = {
      ...baseConfig,
      questionTypes: ["MCQ", "ONE_WORD", "NUMERICAL"],
      typeDistribution: { MCQ: 2, ONE_WORD: 3, NUMERICAL: 3 },
      totalQuestions: 8,
    };
    const collapsed = collapseForPaperFocus(cfg);
    expect(collapsed).toBe(cfg);
  });

  it("collapses mixed MCQ + NUMERICAL + ONE_WORD to all NUMERICAL on numerical focus", () => {
    const cfg: PaperConfig = {
      ...baseConfig,
      questionTypes: ["MCQ", "NUMERICAL", "ONE_WORD"],
      typeDistribution: { MCQ: 2, NUMERICAL: 3, ONE_WORD: 3 },
      totalQuestions: 8,
      paperFocus: "numerical",
    };
    const collapsed = collapseForPaperFocus(cfg);
    expect(collapsed.questionTypes).toEqual(["NUMERICAL"]);
    expect(collapsed.typeDistribution).toEqual({ NUMERICAL: 8 });
  });

  it("is a no-op when the config is already all-numerical on numerical focus", () => {
    const cfg: PaperConfig = {
      ...baseConfig,
      questionTypes: ["NUMERICAL"],
      typeDistribution: { NUMERICAL: 5 },
      totalQuestions: 5,
      paperFocus: "numerical",
    };
    const collapsed = collapseForPaperFocus(cfg);
    expect(collapsed).toBe(cfg);
  });

  it("keeps MATCH_FOLLOWING alongside NUMERICAL on numerical focus", () => {
    const cfg: PaperConfig = {
      ...baseConfig,
      questionTypes: ["NUMERICAL", "MATCH_FOLLOWING"],
      typeDistribution: { NUMERICAL: 4, MATCH_FOLLOWING: 2 },
      totalQuestions: 6,
      paperFocus: "numerical",
    };
    const collapsed = collapseForPaperFocus(cfg);
    expect(collapsed).toBe(cfg);
  });

  it("collapses mixed NUMERICAL + MCQ + ONE_WORD to all MCQ on concept focus", () => {
    const cfg: PaperConfig = {
      ...baseConfig,
      questionTypes: ["NUMERICAL", "MCQ", "ONE_WORD"],
      typeDistribution: { NUMERICAL: 3, MCQ: 2, ONE_WORD: 3 },
      totalQuestions: 8,
      paperFocus: "concept",
    };
    const collapsed = collapseForPaperFocus(cfg);
    expect(collapsed.questionTypes).toEqual(["MCQ"]);
    expect(collapsed.typeDistribution).toEqual({ MCQ: 8 });
  });

  it("falls back to NUMERICAL with totalQuestions=8 when focus=numerical and config is empty", () => {
    const cfg: PaperConfig = {
      ...baseConfig,
      questionTypes: ["MCQ"],
      typeDistribution: { MCQ: 0 },
      totalQuestions: 0,
      paperFocus: "numerical",
    };
    const collapsed = collapseForPaperFocus(cfg);
    expect(collapsed.questionTypes).toEqual(["NUMERICAL"]);
    expect(collapsed.typeDistribution).toEqual({ NUMERICAL: 8 });
  });
});

describe("generateBlueprint with paperFocus", () => {
  it("produces only NUMERICAL sections when paperFocus=numerical", () => {
    const blueprint = generateBlueprint({
      ...baseConfig,
      questionTypes: ["MCQ", "NUMERICAL", "ONE_WORD"],
      typeDistribution: { MCQ: 2, NUMERICAL: 3, ONE_WORD: 3 },
      totalQuestions: 8,
      paperFocus: "numerical",
    });

    expect(blueprint.sections).toHaveLength(1);
    expect(blueprint.sections[0].questionType).toBe("NUMERICAL");
    expect(blueprint.sections[0].count).toBe(8);
    expect(blueprint.sections[0].totalMarks).toBe(24);
    expect(blueprint.totalQuestions).toBe(8);
  });

  it("produces only MCQ sections when paperFocus=concept", () => {
    const blueprint = generateBlueprint({
      ...baseConfig,
      questionTypes: ["MCQ", "NUMERICAL", "ONE_WORD"],
      typeDistribution: { MCQ: 2, NUMERICAL: 3, ONE_WORD: 3 },
      totalQuestions: 8,
      paperFocus: "concept",
    });

    expect(blueprint.sections.every((s) => s.questionType === "MCQ")).toBe(true);
    expect(blueprint.totalQuestions).toBe(8);
  });

  it("leaves the existing structure alone when paperFocus=mixed", () => {
    const blueprint = generateBlueprint({
      ...baseConfig,
      questionTypes: ["MCQ", "NUMERICAL", "ONE_WORD"],
      typeDistribution: { MCQ: 2, NUMERICAL: 3, ONE_WORD: 3 },
      totalQuestions: 8,
      paperFocus: "mixed",
    });

    const types = blueprint.sections.map((s) => s.questionType);
    expect(types).toContain("MCQ");
    expect(types).toContain("NUMERICAL");
    expect(types).toContain("ONE_WORD");
  });
});
