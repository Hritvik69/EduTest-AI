import { describe, expect, it } from "vitest";
import { defaultBloomDistribution } from "@/lib/edutest-data";
import {
  emergencyTxtRepairFillMarker,
  generateEmergencyTxtRepairFill,
} from "@/lib/emergency-txt-repair-fill";
import { QuestionCandidateBank } from "@/lib/question-candidate-bank";
import type {
  Blueprint,
  BlueprintSection,
  ConceptData,
  GeneratedQuestion,
  PaperConfig,
} from "@/types";

const mcqSection: BlueprintSection = {
  name: "Section A",
  questionType: "MCQ",
  count: 2,
  marksPerQuestion: 1,
  totalMarks: 2,
  difficulty: "MEDIUM",
  difficultyBreakdown: { MEDIUM: 100 },
  bloomBreakdown: defaultBloomDistribution,
};

const blueprint: Blueprint = {
  sections: [mcqSection],
  totalQuestions: 2,
  totalMarks: 2,
  estimatedTime: 10,
  competencyPercentage: 60,
};

const config: PaperConfig = {
  sourceMode: "curriculum",
  classNum: 8,
  subject: "English",
  subjects: ["English"],
  subjectSelections: [{ subject: "English", chapterIds: [1], topicIds: [10] }],
  chapterIds: [1],
  topicIds: [10],
  totalMarks: 2,
  duration: 30,
  examType: "School Test",
  difficulty: "MEDIUM",
  aiProvider: "AUTO",
  questionTypes: ["MCQ"],
  typeDistribution: { MCQ: 2 },
  bloomDistribution: defaultBloomDistribution,
  totalQuestions: 2,
};

const concepts: ConceptData[] = [
  {
    text: "The selected NCERT chapter explains that careful reading of dialogue helps students infer a speaker's intention, tone, and hidden meaning. The chapter shows that a character's choice of words can reveal politeness, wit, hesitation, or confidence in a social situation.",
    type: "NCERT_TXT_SOURCE",
    bloomLevel: "UNDERSTAND",
    hotsPotential: true,
    subject: "English",
    classNum: 8,
    chapterName: "A Dialogue in Context",
    topicName: "Dialogue inference",
    chapterId: 1,
    topicId: 10,
    source: "ncert_txt",
  },
];

describe("generateEmergencyTxtRepairFill", () => {
  it("fills a final missing slot from NCERT TXT and survives bank validation", () => {
    const existing: GeneratedQuestion[] = [
      {
        text: "Which reading skill helps a learner understand a character's hidden intention in dialogue?",
        type: "MCQ",
        difficulty: "MEDIUM",
        marks: 1,
        options: [
          { id: "A", text: "Ignoring the speaker's words", isCorrect: false },
          { id: "B", text: "Inferring tone and intention from dialogue", isCorrect: true },
          { id: "C", text: "Counting the number of lines only", isCorrect: false },
          { id: "D", text: "Reading an unrelated chapter summary", isCorrect: false },
        ],
        correctAnswer: "B",
        explanation: "The source text says dialogue can reveal intention and tone.",
        bloomLevel: "UNDERSTAND",
        competencyLevel: 2,
        topic: "Dialogue inference",
        chapterId: 1,
        topicId: 10,
        subject: "English",
        classNum: 8,
        source: "ncert_txt",
        noveltyAngle: "dialogue-hidden-intention",
        sourceChunkFocus: "dialogue reveals intention",
        answerPath: "infer intention from dialogue",
      },
    ];
    const bank = new QuestionCandidateBank(existing, blueprint, config);

    const emergency = generateEmergencyTxtRepairFill({
      missingSections: bank.missingSections(),
      concepts,
      config,
      existingQuestions: bank.allCandidates(),
      limit: 2,
    });
    bank.add(emergency);

    expect(emergency).toHaveLength(1);
    expect(emergency[0]?.noveltyAngle).toContain(emergencyTxtRepairFillMarker);
    expect(bank.readyCount()).toBe(2);
    expect(bank.missingCount()).toBe(0);
    expect(bank.result().skipped).toEqual([]);
  });

  it("does not run when more than two final slots are missing", () => {
    const threeMissingSections = [
      {
        ...mcqSection,
        count: 3,
        totalMarks: 3,
      },
    ];

    expect(
      generateEmergencyTxtRepairFill({
        missingSections: threeMissingSections,
        concepts,
        config,
        existingQuestions: [],
        limit: 2,
      }),
    ).toEqual([]);
  });

  it("does not use outline-only curriculum concepts", () => {
    expect(
      generateEmergencyTxtRepairFill({
        missingSections: [{ ...mcqSection, count: 1, totalMarks: 1 }],
        concepts: [
          {
            ...concepts[0],
            text: "Dialogue inference",
            type: "CURRICULUM_TOPIC",
            source: "curriculum",
          },
        ],
        config,
        existingQuestions: [],
        limit: 2,
      }),
    ).toEqual([]);
  });
});
