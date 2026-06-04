import { describe, expect, it } from "vitest";
import { marksPerType } from "@/lib/blueprint";
import {
  defaultBloomDistribution,
  presetQuestionTypes,
  questionTypeDetails,
  questionTypeMeta,
  selectableQuestionTypeMeta,
} from "@/lib/edutest-data";
import { generateDemoQuestionsForSection } from "@/lib/generator";
import { questionTypeValues } from "@/lib/schemas";
import { validatePaper } from "@/lib/validator";
import type { Blueprint, BlueprintSection, PaperConfig, QuestionType } from "@/types";

const config: PaperConfig = {
  classNum: 10,
  subject: "Science",
  subjects: ["Science"],
  subjectSelections: [{ subject: "Science", chapterIds: [1], topicIds: [] }],
  chapterIds: [1],
  totalMarks: 40,
  duration: 90,
  examType: "Practice",
  difficulty: "MEDIUM",
  questionTypes: ["MCQ"],
  typeDistribution: { MCQ: 40 },
  bloomDistribution: defaultBloomDistribution,
  totalQuestions: 40,
};

describe("question type setup", () => {
  it("has clear objective presets", () => {
    expect(presetQuestionTypes["Only MCQ"]).toEqual(["MCQ"]);
    expect(presetQuestionTypes["Objective Mix"]).toEqual([
      "MCQ",
      "ASSERTION_REASON",
      "TRUE_FALSE",
    ]);
    expect(presetQuestionTypes["NCERT Books/PDF"]).toBeUndefined();
    expect(presetQuestionTypes["MCQ Focus"]).toBeUndefined();
  });

  it("keeps diagram and legacy source-mode questions out of the selectable wizard list", () => {
    expect(selectableQuestionTypeMeta.map((item) => item.type)).not.toContain(
      "DIAGRAM",
    );
    expect(selectableQuestionTypeMeta.map((item) => item.type)).not.toContain(
      "NCERT_FORMAT",
    );
    expect(presetQuestionTypes["Full Mix"]).not.toContain("DIAGRAM");
    expect(presetQuestionTypes["Full Mix"]).not.toContain("NCERT_FORMAT");
    expect(selectableQuestionTypeMeta[selectableQuestionTypeMeta.length - 1]?.type).toBe(
      "MATCH_FOLLOWING",
    );
  });

  it("defines UI structure details for every question type", () => {
    expect(Object.keys(questionTypeDetails).sort()).toEqual(
      [...questionTypeValues].sort(),
    );

    for (const type of questionTypeValues) {
      expect(questionTypeDetails[type].goal).toBeTruthy();
      expect(questionTypeDetails[type].expectedFields.length).toBeGreaterThan(1);
      expect(questionTypeDetails[type].sample).toBeTruthy();
    }
  });

  it("keeps demo structures valid for every question type", async () => {
    for (const type of questionTypeValues) {
      const section = sectionFor(type);
      const blueprint: Blueprint = {
        sections: [section],
        totalQuestions: 1,
        totalMarks: section.totalMarks,
        estimatedTime: 30,
        competencyPercentage: 60,
      };
      const question = generateDemoQuestionsForSection(section, {
        ...config,
        questionTypes: [type],
        typeDistribution: { [type]: 1 },
      })[0];

      await expect(validatePaper([question], blueprint, config)).resolves.toHaveLength(1);
    }
  });
});

function sectionFor(type: QuestionType): BlueprintSection {
  const marks = marksPerType[type];
  const meta = questionTypeMeta.find((item) => item.type === type);

  return {
    name: `Section ${meta?.section ?? "A"}`,
    questionType: type,
    count: 1,
    marksPerQuestion: marks,
    totalMarks: marks,
    difficulty: "MEDIUM",
    difficultyBreakdown: { EASY: 20, MEDIUM: 70, HARD: 10, ABSURD: 0 },
    bloomBreakdown: defaultBloomDistribution,
  };
}
