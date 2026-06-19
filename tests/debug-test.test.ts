import { describe, it } from "vitest";
import { QuestionCandidateBank } from "../lib/question-candidate-bank";
import { completeQuestionBankWithFinalFallbacks } from "../lib/final-generation-completion";
import { analyzeSourceBackedCompletionCapacity, normalizeConceptPool, sourceBackedTypeSeed } from "../lib/source-backed-fallback";
import type { Blueprint, PaperConfig, ConceptData } from "../types";

const mcqSection = {
  name: "Section MCQ",
  questionType: "MCQ" as const,
  count: 4,
  marksPerQuestion: 1,
  totalMarks: 4,
  difficulty: "ABSURD" as const,
  difficultyBreakdown: { ABSURD: 4 },
  bloomBreakdown: { ANALYZE: 4 },
};

function sectionFor(questionType: any, count: number, marksPerQuestion: number) {
  return {
    ...mcqSection,
    name: `Section ${questionType}`,
    questionType,
    count,
    marksPerQuestion,
    totalMarks: count * marksPerQuestion,
  };
}

function physicsMotionConcept(): ConceptData {
  return {
    text: [
      "A physics chapter explains that friction is a contact force that opposes relative motion between surfaces.",
      "A smoother surface usually produces less friction, so an object can travel farther before stopping.",
      "A rougher surface produces more friction, so the motion slows down faster and more energy changes into heat.",
      "Learners compare the same object on different surfaces to judge how surface texture affects distance, speed, and stopping time.",
      "A correct answer connects force, surface condition, motion, and evidence from the observation instead of only memorising a definition.",
    ].join(" "),
    type: "NCERT_TXT_SOURCE",
    bloomLevel: "ANALYZE",
    hotsPotential: true,
    subject: "Physics",
    classNum: 9,
    chapterName: "Motion and Friction",
    topicName: "Friction and motion",
    chapterId: 401,
    topicId: 4001,
    source: "ncert_txt",
  };
}

function chemistryMixtureConcept(): ConceptData {
  return {
    text: [
      "A chemistry chapter explains that a solution is a homogeneous mixture in which a solute dissolves in a solvent.",
      "The amount of solute and solvent affects concentration, and observations should be linked to evidence from the mixture.",
      "Learners distinguish a true solution from a suspension or colloid by checking uniformity, visibility of particles, and settling behavior.",
      "A correct answer explains the relationship between composition, solubility, concentration, and observable properties.",
      "Students should avoid unsupported guesses and use the described chemical evidence to justify the conclusion.",
    ].join(" "),
    type: "NCERT_TXT_SOURCE",
    bloomLevel: "ANALYZE",
    hotsPotential: true,
    subject: "Chemistry",
    classNum: 9,
    chapterName: "Solutions and Mixtures",
    topicName: "Solutions and mixtures",
    chapterId: 301,
    topicId: 3001,
    source: "ncert_txt",
  };
}

describe("debugging paper generation", () => {
  it("prints generated questions", () => {
    const requestedBlueprint: Blueprint = {
      sections: [
        sectionFor("MCQ", 4, 1),
        sectionFor("TRUE_FALSE", 2, 1),
        sectionFor("ASSERTION_REASON", 2, 1),
        sectionFor("MATCH_FOLLOWING", 2, 3),
        sectionFor("VERY_SHORT", 2, 2),
        sectionFor("SHORT", 2, 3),
      ],
      totalQuestions: 14,
      totalMarks: 24,
      estimatedTime: 45,
      competencyPercentage: 70,
    };
    const requestedConfig: PaperConfig = {
      classNum: 9,
      subject: "Physics",
      subjects: ["Physics", "Chemistry"],
      subjectSelections: [
        { subject: "Physics", chapterIds: [401], topicIds: [4001] },
        { subject: "Chemistry", chapterIds: [301], topicIds: [3001] },
      ],
      chapterIds: [401, 301],
      topicIds: [4001, 3001],
      difficulty: "ABSURD",
      duration: 180,
      examType: "Mock Exam",
      questionTypes: [
        "MCQ",
        "TRUE_FALSE",
        "ASSERTION_REASON",
        "MATCH_FOLLOWING",
        "VERY_SHORT",
        "SHORT",
      ],
      typeDistribution: {
        MCQ: 4,
        TRUE_FALSE: 2,
        ASSERTION_REASON: 2,
        MATCH_FOLLOWING: 2,
        VERY_SHORT: 2,
        SHORT: 2,
      },
      totalQuestions: 14,
      totalMarks: 24,
      questionComposition: [
        {
          subject: "Physics",
          chapterId: 401,
          chapterName: "Motion and Friction",
          topicId: 4001,
          topicName: "Friction and motion",
          questionCount: 7,
        },
        {
          subject: "Chemistry",
          chapterId: 301,
          chapterName: "Solutions and Mixtures",
          topicId: 3001,
          topicName: "Solutions and mixtures",
          questionCount: 7,
        },
      ],
      bloomDistribution: {
        REMEMBER: 2,
        UNDERSTAND: 4,
        APPLY: 4,
        ANALYZE: 4,
        EVALUATE: 0,
        CREATE: 0,
      },
    };
    const bank = new QuestionCandidateBank([], requestedBlueprint, requestedConfig);

    const completion = completeQuestionBankWithFinalFallbacks({
      bank,
      blueprint: requestedBlueprint,
      config: requestedConfig,
      concepts: [physicsMotionConcept(), chemistryMixtureConcept()],
      requireSyllabusComposition: true,
    });
    const validation = completion.bank.result();
    console.log("READY COUNT:", completion.readyQuestionCount);
    const types = ["MCQ", "TRUE_FALSE", "ASSERTION_REASON", "MATCH_FOLLOWING", "VERY_SHORT", "SHORT"];
    types.forEach((type) => {
      const seed = sourceBackedTypeSeed(type as any);
      const offset = seed % 49;
      console.log(`TYPE: ${type}, SEED: ${seed}, OFFSET: ${offset}`);
    });
  });
});
