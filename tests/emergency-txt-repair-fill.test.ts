import { describe, expect, it } from "vitest";
import { defaultBloomDistribution } from "@/lib/edutest-data";
import { QuestionCandidateBank } from "@/lib/question-candidate-bank";
import {
  analyzeSourceBackedCompletionCapacity,
  completeQuestionBankWithSourceBackedFallback,
  completeQuestionBankWithSyllabusNearFallback,
  retargetSourceBackedCompletionForGuaranteedFinalRepair,
  sourceBackedCapacityMessage,
  sourceBackedCompletionMarker,
} from "@/lib/source-backed-fallback";
import type {
  Blueprint,
  BlueprintSection,
  ConceptData,
  GeneratedQuestion,
  PaperConfig,
  QuestionType,
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
  concept(
    10,
    "Dialogue inference",
    "The selected NCERT chapter explains that careful reading of dialogue helps students infer a speaker's intention, tone, and hidden meaning. The chapter shows that a character's choice of words can reveal politeness, wit, hesitation, or confidence in a social situation.",
  ),
  concept(
    11,
    "Tone and intention",
    "The selected source explains how tone and intention are recognised through word choice, pauses, and context. Students can connect these clues to understand why a speaker responds politely, sharply, confidently, or cautiously.",
  ),
  concept(
    12,
    "Context clues",
    "The selected source shows that context clues guide interpretation when the meaning is not directly stated. Learners compare surrounding details, speaker behaviour, and the situation before drawing a supported conclusion.",
  ),
  concept(
    13,
    "Character response",
    "The selected source highlights that a character's response can reveal attitude and purpose. Students need to connect actions, words, and consequences to explain the deeper meaning of a scene.",
  ),
  concept(
    14,
    "Vocabulary in context",
    "The selected source explains that vocabulary should be understood from context instead of isolated memorisation. A word may carry a specific meaning because of the sentence, speaker, and situation around it.",
  ),
  concept(
    15,
    "Source-supported conclusion",
    "The selected source teaches that conclusions should be supported by evidence from the passage. Students should avoid unsupported guesses and connect each answer to a clear textual clue.",
  ),
];

describe("source-backed completion", () => {
  it("reports that one tiny source cannot satisfy 11 strict unique MCQs", () => {
    const totalQuestions = 11;
    const paperConfig = {
      ...config,
      totalQuestions,
      totalMarks: totalQuestions,
      typeDistribution: { MCQ: totalQuestions },
    };
    const bank = new QuestionCandidateBank(
      [],
      blueprintForCount(totalQuestions),
      paperConfig,
    );

    const capacity = analyzeSourceBackedCompletionCapacity({
      bank,
      concepts: [tinyRepetitiveConcept()],
      config: paperConfig,
    });

    expect(capacity.requiredMissingCount).toBe(11);
    expect(capacity.effectiveCapacity).toBeLessThan(11);
    expect(capacity.rawAtomCapacity).toBeLessThan(11);
    expect(capacity.enough).toBe(false);
    expect(() =>
      completeQuestionBankWithSourceBackedFallback({
        bank,
        concepts: [tinyRepetitiveConcept()],
        config: paperConfig,
        throwOnInsufficientCapacity: true,
        capacityScope: "test strict capacity",
      }),
    ).toThrow(/SOURCE_TEXT_NOT_ENOUGH/);
  });

  it("allows a long source paragraph to satisfy 11 strict unique MCQs", () => {
    const totalQuestions = 11;
    const paperConfig = {
      ...config,
      totalQuestions,
      totalMarks: totalQuestions,
      typeDistribution: { MCQ: totalQuestions },
    };
    const bank = new QuestionCandidateBank(
      [],
      blueprintForCount(totalQuestions),
      paperConfig,
    );
    const capacity = analyzeSourceBackedCompletionCapacity({
      bank,
      concepts: [longParagraphConcept()],
      config: paperConfig,
    });

    expect(capacity.effectiveCapacity).toBeGreaterThanOrEqual(11);
    expect(capacity.rawAtomCapacity).toBeGreaterThanOrEqual(11);
    expect(capacity.enough).toBe(true);

    const completed = completeQuestionBankWithSourceBackedFallback({
      bank,
      concepts: [longParagraphConcept()],
      config: paperConfig,
      throwOnInsufficientCapacity: true,
    });

    expect(completed).toHaveLength(11);
    expect(bank.readyCount()).toBe(11);
    expect(bank.missingCount()).toBe(0);
  });

  it("tracks strict source capacity independently per question type", () => {
    const mixedBlueprint: Blueprint = {
      sections: [
        {
          ...mcqSection,
          count: 2,
          totalMarks: 2,
        },
        {
          ...mcqSection,
          name: "Section B",
          questionType: "SHORT",
          count: 2,
          marksPerQuestion: 3,
          totalMarks: 6,
        },
      ],
      totalQuestions: 4,
      totalMarks: 8,
      estimatedTime: 10,
      competencyPercentage: 60,
    };
    const mixedConfig: PaperConfig = {
      ...config,
      questionTypes: ["MCQ", "SHORT"],
      totalQuestions: 4,
      totalMarks: 8,
      typeDistribution: { MCQ: 2, SHORT: 2 },
    };
    const existingMcq = completeQuestionBankWithSourceBackedFallback({
      bank: new QuestionCandidateBank(
        [],
        blueprintForCount(1),
        {
          ...config,
          totalQuestions: 1,
          totalMarks: 1,
          typeDistribution: { MCQ: 1 },
        },
      ),
      concepts: [longParagraphConcept()],
      config: {
        ...config,
        totalQuestions: 1,
        totalMarks: 1,
        typeDistribution: { MCQ: 1 },
      },
    })[0];
    const bank = new QuestionCandidateBank(
      existingMcq ? [existingMcq] : [],
      mixedBlueprint,
      mixedConfig,
    );

    const capacity = analyzeSourceBackedCompletionCapacity({
      bank,
      concepts: [longParagraphConcept()],
      config: mixedConfig,
    });

    expect(capacity.byType.MCQ?.required).toBe(1);
    expect(capacity.byType.SHORT?.required).toBe(2);
    expect(capacity.byType.MCQ?.consumed).toBe(1);
    expect(capacity.byType.SHORT?.consumed).toBe(0);
  });

  it("completes the mixed 9-question replacement shape when effective capacity is enough", () => {
    const mixedBlueprint: Blueprint = {
      sections: [
        sectionFor("MATCH_FOLLOWING", 3, 3),
        sectionFor("TRUE_FALSE", 2, 1),
        sectionFor("VERY_SHORT", 2, 1),
        sectionFor("SHORT", 2, 3),
      ],
      totalQuestions: 9,
      totalMarks: 19,
      estimatedTime: 25,
      competencyPercentage: 60,
    };
    const mixedConfig: PaperConfig = {
      ...config,
      questionTypes: ["MATCH_FOLLOWING", "TRUE_FALSE", "VERY_SHORT", "SHORT"],
      totalQuestions: 9,
      totalMarks: 19,
      typeDistribution: {
        MATCH_FOLLOWING: 3,
        TRUE_FALSE: 2,
        VERY_SHORT: 2,
        SHORT: 2,
      },
    };
    const bank = new QuestionCandidateBank(
      [],
      mixedBlueprint,
      mixedConfig,
    );

    const capacity = analyzeSourceBackedCompletionCapacity({
      bank,
      concepts: [longParagraphConcept()],
      config: mixedConfig,
    });

    expect(capacity.rawAtomCapacity).toBeGreaterThanOrEqual(9);
    expect(capacity.effectiveCapacity).toBe(9);
    expect(capacity.enough).toBe(true);
    expect(sourceBackedCapacityMessage(capacity)).toContain(
      "effective source capacity 9",
    );
    expect(sourceBackedCapacityMessage(capacity)).not.toContain(
      "strict source capacity 9",
    );

    const completed = completeQuestionBankWithSourceBackedFallback({
      bank,
      concepts: [longParagraphConcept()],
      config: mixedConfig,
      throwOnInsufficientCapacity: true,
    });

    expect(completed).toHaveLength(9);
    expect(bank.readyCount()).toBe(9);
    expect(bank.missingCount()).toBe(0);
  });

  it("completes the screenshot mixed-type replacement shape after stale source keys", () => {
    const screenshotBlueprint: Blueprint = {
      sections: [
        sectionFor("MCQ", 4, 1),
        sectionFor("SHORT", 1, 3),
        sectionFor("ASSERTION_REASON", 2, 1),
        sectionFor("TRUE_FALSE", 1, 1),
        sectionFor("MATCH_FOLLOWING", 1, 3),
      ],
      totalQuestions: 9,
      totalMarks: 13,
      estimatedTime: 25,
      competencyPercentage: 60,
    };
    const screenshotConfig: PaperConfig = {
      ...config,
      questionTypes: [
        "MCQ",
        "SHORT",
        "ASSERTION_REASON",
        "TRUE_FALSE",
        "MATCH_FOLLOWING",
      ],
      totalQuestions: 9,
      totalMarks: 13,
      typeDistribution: {
        MCQ: 4,
        SHORT: 1,
        ASSERTION_REASON: 2,
        TRUE_FALSE: 1,
        MATCH_FOLLOWING: 1,
      },
    };
    const staleBank = new QuestionCandidateBank(
      [],
      screenshotBlueprint,
      screenshotConfig,
    );
    const staleSourceQuestions = completeQuestionBankWithSourceBackedFallback({
      bank: staleBank,
      concepts: [longParagraphConcept()],
      config: screenshotConfig,
      throwOnInsufficientCapacity: true,
    });
    const invalidStaleCandidates = staleSourceQuestions.map((question) => ({
      ...question,
      marks: question.marks + 20,
    }));
    const bank = new QuestionCandidateBank(
      invalidStaleCandidates,
      screenshotBlueprint,
      screenshotConfig,
    );

    expect(bank.readyCount()).toBe(0);
    expect(bank.missingCount()).toBe(9);

    const capacity = analyzeSourceBackedCompletionCapacity({
      bank,
      concepts: [longParagraphConcept()],
      config: screenshotConfig,
    });

    expect(capacity.consumedAtomTypeKeys).toBe(9);
    expect(capacity.rawAtomCapacity).toBeGreaterThanOrEqual(9);
    expect(capacity.effectiveCapacity).toBe(9);
    expect(capacity.enough).toBe(true);
    expect(
      Object.values(capacity.byType).some(
        (item) => (item?.skipped.repeatedSourceKey ?? 0) > 0,
      ),
    ).toBe(true);

    const completed = completeQuestionBankWithSourceBackedFallback({
      bank,
      concepts: [longParagraphConcept()],
      config: screenshotConfig,
      throwOnInsufficientCapacity: true,
    });
    const validation = bank.result();

    expect(completed).toHaveLength(9);
    expect(bank.readyCount()).toBe(9);
    expect(bank.missingCount()).toBe(0);
    expect(validation.rejectionReasons.DUPLICATE ?? 0).toBe(0);
    expect(studentVisibleText(validation.questions)).not.toMatch(
      /source detail|selected source|exact source|detail lens|noveltyAngle|sourceChunkFocus|answerPath|english-c|txt-a|chapter idea|question focus|according to the chapter|ideas from/i,
    );
  });

  it("retargets fragile final repair formats to same-mark robust formats", () => {
    const fragileBlueprint: Blueprint = {
      sections: [
        sectionFor("MCQ", 3, 1),
        sectionFor("ASSERTION_REASON", 2, 1),
        sectionFor("TRUE_FALSE", 2, 1),
        sectionFor("MATCH_FOLLOWING", 1, 3),
      ],
      totalQuestions: 8,
      totalMarks: 10,
      estimatedTime: 20,
      competencyPercentage: 60,
    };
    const fragileConfig: PaperConfig = {
      ...config,
      questionTypes: ["MCQ", "ASSERTION_REASON", "TRUE_FALSE", "MATCH_FOLLOWING"],
      totalQuestions: 8,
      totalMarks: 10,
      typeDistribution: {
        MCQ: 3,
        ASSERTION_REASON: 2,
        TRUE_FALSE: 2,
        MATCH_FOLLOWING: 1,
      },
    };
    const staleBank = new QuestionCandidateBank(
      [],
      fragileBlueprint,
      fragileConfig,
    );
    const staleSourceQuestions = completeQuestionBankWithSourceBackedFallback({
      bank: staleBank,
      concepts: [longParagraphConcept()],
      config: fragileConfig,
      throwOnInsufficientCapacity: true,
    });
    const bank = new QuestionCandidateBank(
      staleSourceQuestions.map((question) => ({
        ...question,
        marks: question.marks + 20,
      })),
      fragileBlueprint,
      fragileConfig,
    );
    const capacity = analyzeSourceBackedCompletionCapacity({
      bank,
      concepts: [longParagraphConcept()],
      config: fragileConfig,
    });
    const screenshotCapacity = {
      ...capacity,
      requiredMissingCount: 8,
      effectiveCapacity: 3,
      effectiveMissingCount: 5,
      availableStrictCapacity: 3,
      enough: false,
      byType: {
        ...capacity.byType,
        MCQ: {
          ...capacity.byType.MCQ!,
          required: 3,
          effectiveAvailable: 3,
          available: 3,
          missing: 0,
        },
        ASSERTION_REASON: {
          ...capacity.byType.ASSERTION_REASON!,
          required: 2,
          effectiveAvailable: 0,
          available: 0,
          missing: 2,
        },
        TRUE_FALSE: {
          ...capacity.byType.TRUE_FALSE!,
          required: 2,
          effectiveAvailable: 0,
          available: 0,
          missing: 2,
        },
        MATCH_FOLLOWING: {
          ...capacity.byType.MATCH_FOLLOWING!,
          required: 1,
          effectiveAvailable: 0,
          available: 0,
          missing: 1,
        },
      },
    };

    const retarget = retargetSourceBackedCompletionForGuaranteedFinalRepair({
      bank,
      concepts: [longParagraphConcept()],
      blueprint: fragileBlueprint,
      config: fragileConfig,
      sourceCapacity: screenshotCapacity,
    });

    expect(retarget).not.toBeNull();
    expect(retarget?.conversions).toEqual([
      { from: "ASSERTION_REASON", to: "MCQ", count: 2 },
      { from: "TRUE_FALSE", to: "MCQ", count: 2 },
      { from: "MATCH_FOLLOWING", to: "SHORT", count: 1 },
    ]);
    expect(retarget?.warning).toContain(
      "Converted 2 ASSERTION_REASON replacements to MCQ and 2 TRUE_FALSE replacements to MCQ and 1 MATCH_FOLLOWING replacement to SHORT",
    );

    const completed = completeQuestionBankWithSourceBackedFallback({
      bank: retarget!.bank,
      concepts: [longParagraphConcept()],
      config: retarget!.config,
      throwOnInsufficientCapacity: true,
    });
    const validation = retarget!.bank.result();

    expect(completed).toHaveLength(8);
    expect(retarget!.bank.readyCount()).toBe(8);
    expect(retarget!.bank.missingCount()).toBe(0);
    expect(validation.blueprint.totalQuestions).toBe(8);
    expect(validation.blueprint.totalMarks).toBe(10);
    expect(validation.config.typeDistribution).toMatchObject({
      MCQ: 7,
      SHORT: 1,
    });
    expect(validation.questions.every((question) =>
      question.noveltyAngle?.startsWith(sourceBackedCompletionMarker),
    )).toBe(true);
    expect(validation.rejectionReasons.DUPLICATE ?? 0).toBe(0);
  });

  it("completes the same selected source under absurd mixed fragile formats", () => {
    const absurdBlueprint: Blueprint = {
      sections: [
        sectionFor("MCQ", 10, 1),
        sectionFor("SHORT", 1, 3),
        sectionFor("ASSERTION_REASON", 2, 1),
        sectionFor("TRUE_FALSE", 2, 1),
        sectionFor("MATCH_FOLLOWING", 2, 3),
      ],
      totalQuestions: 17,
      totalMarks: 23,
      estimatedTime: 45,
      competencyPercentage: 70,
    };
    const absurdConfig: PaperConfig = {
      ...config,
      difficulty: "ABSURD",
      questionTypes: [
        "MCQ",
        "SHORT",
        "ASSERTION_REASON",
        "TRUE_FALSE",
        "MATCH_FOLLOWING",
      ],
      totalQuestions: 17,
      totalMarks: 23,
      typeDistribution: {
        MCQ: 10,
        SHORT: 1,
        ASSERTION_REASON: 2,
        TRUE_FALSE: 2,
        MATCH_FOLLOWING: 2,
      },
    };
    const bank = new QuestionCandidateBank([], absurdBlueprint, absurdConfig);

    const completed = completeQuestionBankWithSourceBackedFallback({
      bank,
      concepts: [longParagraphConcept()],
      config: absurdConfig,
      throwOnInsufficientCapacity: true,
      capacityScope: "absurd mixed fragile regression",
    });
    const validation = bank.result();

    expect(completed).toHaveLength(17);
    expect(bank.readyCount()).toBe(17);
    expect(bank.missingCount()).toBe(0);
    expect(validation.questions).toHaveLength(17);
    expect(validation.rejectionReasons.DIFFICULTY_INCOMPATIBLE ?? 0).toBe(0);
    expect(validation.questions.every((question) =>
      question.noveltyAngle?.startsWith(sourceBackedCompletionMarker),
    )).toBe(true);
  });

  it.each(["EASY", "MEDIUM", "HARD", "ABSURD"] as const)(
    "completes the same selected source at %s difficulty",
    (difficulty) => {
      const mixedBlueprint: Blueprint = {
        sections: [
          sectionFor("MCQ", 2, 1),
          sectionFor("SHORT", 1, 3),
          sectionFor("ASSERTION_REASON", 1, 1),
          sectionFor("TRUE_FALSE", 1, 1),
          sectionFor("MATCH_FOLLOWING", 1, 3),
        ],
        totalQuestions: 6,
        totalMarks: 10,
        estimatedTime: 20,
        competencyPercentage: 60,
      };
      const paperConfig: PaperConfig = {
        ...config,
        difficulty,
        questionTypes: [
          "MCQ",
          "SHORT",
          "ASSERTION_REASON",
          "TRUE_FALSE",
          "MATCH_FOLLOWING",
        ],
        totalQuestions: 6,
        totalMarks: 10,
        typeDistribution: {
          MCQ: 2,
          SHORT: 1,
          ASSERTION_REASON: 1,
          TRUE_FALSE: 1,
          MATCH_FOLLOWING: 1,
        },
      };
      const bank = new QuestionCandidateBank([], mixedBlueprint, paperConfig);

      completeQuestionBankWithSourceBackedFallback({
        bank,
        concepts: [longParagraphConcept()],
        config: paperConfig,
        throwOnInsufficientCapacity: true,
        capacityScope: `${difficulty.toLowerCase()} mixed-source regression`,
      });

      expect(bank.readyCount()).toBe(6);
      expect(bank.missingCount()).toBe(0);
    },
  );

  it("generates distinct fixed-format stems for repeated source-backed formats", () => {
    const fixedBlueprint: Blueprint = {
      sections: [
        sectionFor("MATCH_FOLLOWING", 3, 3),
        sectionFor("SOURCE_BASED", 2, 4),
        sectionFor("CASE_BASED", 2, 4),
      ],
      totalQuestions: 7,
      totalMarks: 25,
      estimatedTime: 30,
      competencyPercentage: 60,
    };
    const fixedConfig: PaperConfig = {
      ...config,
      questionTypes: ["MATCH_FOLLOWING", "SOURCE_BASED", "CASE_BASED"],
      totalQuestions: 7,
      totalMarks: 25,
      typeDistribution: {
        MATCH_FOLLOWING: 3,
        SOURCE_BASED: 2,
        CASE_BASED: 2,
      },
    };
    const bank = new QuestionCandidateBank([], fixedBlueprint, fixedConfig);

    completeQuestionBankWithSourceBackedFallback({
      bank,
      concepts: [longParagraphConcept()],
      config: fixedConfig,
      throwOnInsufficientCapacity: true,
    });

    const validation = bank.result();
    expect(validation.questions).toHaveLength(7);
    expect(validation.rejectionReasons.DUPLICATE ?? 0).toBe(0);

    const fixedTexts = validation.questions
      .filter((question) =>
        ["MATCH_FOLLOWING", "SOURCE_BASED", "CASE_BASED"].includes(question.type),
      )
      .map((question) => question.text);
    expect(new Set(fixedTexts).size).toBe(fixedTexts.length);
  });

  it("can complete an empty candidate bank when providers produce nothing", () => {
    const blueprint = blueprintForCount(4);
    const paperConfig = {
      ...config,
      totalQuestions: 4,
      totalMarks: 4,
      typeDistribution: { MCQ: 4 },
    };
    const bank = new QuestionCandidateBank([], blueprint, paperConfig);

    const completed = completeQuestionBankWithSourceBackedFallback({
      bank,
      concepts,
      config: paperConfig,
    });

    expect(completed).toHaveLength(4);
    expect(bank.readyCount()).toBe(4);
    expect(bank.missingCount()).toBe(0);
    expect(completed.every((question) =>
      question.noveltyAngle?.includes(sourceBackedCompletionMarker),
    )).toBe(true);
  });

  it("fills more than two final missing slots from selected NCERT TXT", () => {
    const blueprint = blueprintForCount(5);
    const bank = new QuestionCandidateBank([mcq(1)], blueprint, {
      ...config,
      totalQuestions: 5,
      totalMarks: 5,
      typeDistribution: { MCQ: 5 },
    });

    const completed = completeQuestionBankWithSourceBackedFallback({
      bank,
      concepts,
      config: {
        ...config,
        totalQuestions: 5,
        totalMarks: 5,
        typeDistribution: { MCQ: 5 },
      },
    });

    expect(completed).toHaveLength(4);
    expect(completed[0]?.noveltyAngle).toContain(sourceBackedCompletionMarker);
    expect(bank.readyCount()).toBe(5);
    expect(bank.missingCount()).toBe(0);
    expect(new Set(bank.result().questions.map((question) => question.text))).toHaveProperty(
      "size",
      5,
    );
  });

  it.each([22, 27])(
    "completes a %i-question paper after duplicate AI candidates",
    (totalQuestions) => {
      const acceptedAiCount = 12;
      const duplicateAiCount = Math.min(6, totalQuestions - acceptedAiCount);
      const aiCandidates = [
        ...Array.from({ length: acceptedAiCount }, (_, index) => mcq(index + 1)),
        ...Array.from({ length: duplicateAiCount }, () => mcq(1)),
      ];
      const blueprint = blueprintForCount(totalQuestions);
      const paperConfig = {
        ...config,
        totalQuestions,
        totalMarks: totalQuestions,
        typeDistribution: { MCQ: totalQuestions },
      };
      const bank = new QuestionCandidateBank(aiCandidates, blueprint, paperConfig);

      expect(bank.readyCount()).toBeLessThan(totalQuestions);

      completeQuestionBankWithSourceBackedFallback({
        bank,
        concepts,
        config: paperConfig,
      });

      expect(bank.readyCount()).toBe(totalQuestions);
      expect(bank.missingCount()).toBe(0);
      expect(new Set(bank.result().questions.map((question) => question.text))).toHaveProperty(
        "size",
        totalQuestions,
      );
    },
  );

  it("completes the 28-question 21-valid continuation case from selected TXT", () => {
    const totalQuestions = 28;
    const acceptedAiCount = 21;
    const paperConfig = {
      ...config,
      totalQuestions,
      totalMarks: totalQuestions,
      typeDistribution: { MCQ: totalQuestions },
    };
    const blueprint = blueprintForCount(totalQuestions);
    const aiCandidates = [
      ...Array.from({ length: acceptedAiCount }, (_, index) => mcq(index + 1)),
      ...Array.from({ length: 7 }, (_, index) => ({
        ...mcq(index + 1),
        noveltyAngle: "duplicate-pressure-angle",
        sourceChunkFocus: "duplicate-pressure-focus",
        answerPath: "duplicate-pressure-answer-path",
      })),
    ];
    const bank = new QuestionCandidateBank(aiCandidates, blueprint, paperConfig);

    expect(bank.readyCount()).toBe(21);
    expect(bank.missingCount()).toBe(7);

    const completed = completeQuestionBankWithSourceBackedFallback({
      bank,
      concepts,
      config: paperConfig,
    });

    expect(completed).toHaveLength(7);
    expect(bank.readyCount()).toBe(28);
    expect(bank.missingCount()).toBe(0);
    expect(bank.result().skipped.some((item) => item.reason === "duplicate")).toBe(true);
    expect(new Set(bank.result().questions.map((question) => question.text))).toHaveProperty(
      "size",
      28,
    );
  });

  it("completes the 16-question 14-valid source-shortage screenshot case", () => {
    const totalQuestions = 16;
    const paperConfig = {
      ...config,
      totalQuestions,
      totalMarks: totalQuestions,
      typeDistribution: { MCQ: totalQuestions },
    };
    const blueprint = blueprintForCount(totalQuestions);
    const aiCandidates = [
      ...Array.from({ length: 14 }, (_, index) => mcq(index + 1)),
      mcq(1),
      mcq(2),
    ];
    const bank = new QuestionCandidateBank(aiCandidates, blueprint, paperConfig);

    expect(bank.readyCount()).toBe(14);
    expect(bank.missingCount()).toBe(2);

    const completed = completeQuestionBankWithSourceBackedFallback({
      bank,
      concepts: [longParagraphConcept()],
      config: paperConfig,
    });

    expect(completed).toHaveLength(2);
    expect(bank.readyCount()).toBe(16);
    expect(bank.missingCount()).toBe(0);
    expect(completed.every((question) =>
      question.noveltyAngle?.startsWith(sourceBackedCompletionMarker),
    )).toBe(true);
  });

  it("fails strict completion instead of filling weak 10/16 source-shortage cases", () => {
    const totalQuestions = 16;
    const paperConfig = {
      ...config,
      totalQuestions,
      totalMarks: totalQuestions,
      typeDistribution: { MCQ: totalQuestions },
    };
    const blueprint = blueprintForCount(totalQuestions);
    const aiCandidates = [
      ...Array.from({ length: 10 }, (_, index) => mcq(index + 1)),
      ...Array.from({ length: 6 }, () => mcq(1)),
    ];
    const bank = new QuestionCandidateBank(aiCandidates, blueprint, paperConfig);

    expect(bank.readyCount()).toBe(10);
    expect(bank.missingCount()).toBe(6);

    const completed = completeQuestionBankWithSourceBackedFallback({
      bank,
      concepts: [singleAtomConcept()],
      config: paperConfig,
    });

    expect(completed.length).toBeLessThan(6);
    expect(bank.readyCount()).toBeLessThan(16);
    expect(bank.missingCount()).toBeGreaterThan(0);
  });

  it("survives duplicate pressure across stems, options, and answer metadata", () => {
    const totalQuestions = 28;
    const paperConfig = {
      ...config,
      totalQuestions,
      totalMarks: totalQuestions,
      typeDistribution: { MCQ: totalQuestions },
    };
    const blueprint = blueprintForCount(totalQuestions);
    const duplicatePressure = Array.from({ length: 21 }, (_, index) => ({
      ...mcq(index + 1),
      options: [
        { id: "A", text: `Incorrect pressure distractor A ${index}`, isCorrect: false },
        { id: "B", text: `Correct pressure clue ${index}`, isCorrect: true },
        { id: "C", text: `Incorrect pressure distractor C ${index}`, isCorrect: false },
        { id: "D", text: `Incorrect pressure distractor D ${index}`, isCorrect: false },
      ],
      noveltyAngle: `pressure-angle-${index}`,
      sourceChunkFocus: `pressure-focus-${index}`,
      answerPath: `pressure-answer-${index}`,
    }));
    const rejectedDuplicates = Array.from({ length: 12 }, () => ({
      ...duplicatePressure[0],
      text: duplicatePressure[0].text,
      noveltyAngle: duplicatePressure[0].noveltyAngle,
      sourceChunkFocus: duplicatePressure[0].sourceChunkFocus,
      answerPath: duplicatePressure[0].answerPath,
    }));
    const bank = new QuestionCandidateBank(
      [...duplicatePressure, ...rejectedDuplicates],
      blueprint,
      paperConfig,
    );

    expect(bank.readyCount()).toBe(21);

    completeQuestionBankWithSourceBackedFallback({
      bank,
      concepts,
      config: paperConfig,
    });

    expect(bank.readyCount()).toBe(28);
    expect(bank.missingCount()).toBe(0);
    expect(bank.result().rejectionReasons.DUPLICATE).toBeGreaterThan(0);
  });

  it("supports uploaded PDF source concepts with normal concept types", () => {
    const blueprint = blueprintForCount(3);
    const paperConfig = {
      ...config,
      sourceMode: "pdf_upload" as const,
      totalQuestions: 3,
      totalMarks: 3,
      typeDistribution: { MCQ: 3 },
    };
    const bank = new QuestionCandidateBank([mcq(1)], blueprint, paperConfig);
    const completed = completeQuestionBankWithSourceBackedFallback({
      bank,
      concepts: concepts.map((item) => ({
        ...item,
        type: "FACT",
        source: "pdf" as const,
      })),
      config: paperConfig,
    });

    expect(completed).toHaveLength(2);
    expect(bank.readyCount()).toBe(3);
    expect(completed.every((question) => question.source === "pdf")).toBe(true);
  });

  it("uses one long paragraph as clause and lens atoms for large completion", () => {
    const totalQuestions = 24;
    const paperConfig = {
      ...config,
      totalQuestions,
      totalMarks: totalQuestions,
      typeDistribution: { MCQ: totalQuestions },
    };
    const blueprint = blueprintForCount(totalQuestions);
    const bank = new QuestionCandidateBank([], blueprint, paperConfig);

    const completed = completeQuestionBankWithSourceBackedFallback({
      bank,
      concepts: [longParagraphConcept()],
      config: paperConfig,
    });

    expect(completed).toHaveLength(24);
    expect(bank.readyCount()).toBe(24);
    expect(bank.missingCount()).toBe(0);
    expect(new Set(completed.map((question) => question.noveltyAngle))).toHaveProperty(
      "size",
      24,
    );
  });

  it("does not use outline-only curriculum concepts", () => {
    const blueprint = blueprintForCount(3);
    const paperConfig = {
      ...config,
      totalQuestions: 3,
      totalMarks: 3,
      typeDistribution: { MCQ: 3 },
    };
    const bank = new QuestionCandidateBank([mcq(1)], blueprint, paperConfig);
    const completed = completeQuestionBankWithSourceBackedFallback({
      bank,
      concepts: [
        {
          ...concepts[0],
          text: "Dialogue inference",
          type: "CURRICULUM_TOPIC",
          source: "curriculum",
        },
      ],
      config: paperConfig,
    });

    expect(completed).toEqual([]);
    expect(bank.readyCount()).toBe(1);
    expect(bank.missingCount()).toBe(2);
  });

  it("does not use too-short selected TXT as deterministic source material", () => {
    const blueprint = blueprintForCount(3);
    const paperConfig = {
      ...config,
      totalQuestions: 3,
      totalMarks: 3,
      typeDistribution: { MCQ: 3 },
    };
    const bank = new QuestionCandidateBank([mcq(1)], blueprint, paperConfig);
    const completed = completeQuestionBankWithSourceBackedFallback({
      bank,
      concepts: [
        {
          ...concepts[0],
          text: "Brief source note only.",
          source: "ncert_txt",
        },
      ],
      config: paperConfig,
    });

    expect(completed).toEqual([]);
    expect(bank.readyCount()).toBe(1);
    expect(bank.missingCount()).toBe(2);
  });

  it("stops source-backed completion when the server deadline is already spent", () => {
    const blueprint = blueprintForCount(4);
    const paperConfig = {
      ...config,
      totalQuestions: 4,
      totalMarks: 4,
      typeDistribution: { MCQ: 4 },
    };
    const bank = new QuestionCandidateBank([], blueprint, paperConfig);

    const completed = completeQuestionBankWithSourceBackedFallback({
      bank,
      concepts,
      config: paperConfig,
      deadlineAt: Date.now() - 1,
      minRemainingMs: 1,
    });

    expect(completed).toEqual([]);
    expect(bank.readyCount()).toBe(0);
    expect(bank.missingCount()).toBe(4);
  });

  it("fills final missing slots with clean syllabus-near Communication Skills questions when OCR source is noisy", () => {
    const communicationBlueprint: Blueprint = {
      sections: [
        sectionFor("MCQ", 2, 1),
        sectionFor("TRUE_FALSE", 1, 1),
        sectionFor("MATCH_FOLLOWING", 1, 3),
      ],
      totalQuestions: 4,
      totalMarks: 6,
      estimatedTime: 12,
      competencyPercentage: 60,
    };
    const paperConfig: PaperConfig = {
      ...config,
      classNum: 9,
      subject: "Advanced Computer",
      subjects: ["Advanced Computer"],
      subjectSelections: [
        { subject: "Advanced Computer", chapterIds: [1], topicIds: [] },
      ],
      chapterIds: [1],
      topicIds: [],
      totalQuestions: 4,
      totalMarks: 6,
      questionTypes: ["MCQ", "TRUE_FALSE", "MATCH_FOLLOWING"],
      typeDistribution: { MCQ: 2, TRUE_FALSE: 1, MATCH_FOLLOWING: 1 },
      questionComposition: [
        {
          subject: "Advanced Computer",
          chapterId: 1,
          chapterName: "Communication Skills",
          questionCount: 4,
        },
      ],
    };
    const bank = new QuestionCandidateBank([], communicationBlueprint, paperConfig);

    const completed = completeQuestionBankWithSyllabusNearFallback({
      bank,
      config: paperConfig,
      concepts: [noisyCommunicationConcept()],
      startIndex: 700,
    });
    const validation = bank.result();
    const visibleText = studentVisibleText(validation.questions);

    expect(completed.accepted).toBe(4);
    expect(bank.readyCount()).toBe(4);
    expect(bank.missingCount()).toBe(0);
    expect(validation.skipped).toEqual([]);
    expect(completed.warnings[0]?.reason).toMatch(/weak\/noisy source text/);
    expect(visibleText).toMatch(/communication|sender|receiver|feedback/i);
    expect(visibleText).not.toMatch(
      /Unit\s+1\.indd|24-08-2018|S\s*eSSIon|evidence clue|case reasoning clue/i,
    );
  });
});

function blueprintForCount(count: number): Blueprint {
  return {
    sections: [
      {
        ...mcqSection,
        count,
        totalMarks: count,
      },
    ],
    totalQuestions: count,
    totalMarks: count,
    estimatedTime: count,
    competencyPercentage: 60,
  };
}

function studentVisibleText(questions: GeneratedQuestion[]) {
  const values: string[] = [];

  questions.forEach((question) => {
    values.push(
      question.text,
      question.correctAnswer,
      question.explanation,
      question.scenario ?? "",
      question.assertion ?? "",
      question.reason ?? "",
      question.diagramDescription ?? "",
      ...(question.keyPoints ?? []),
    );
    question.options?.forEach((option) => values.push(option.text));
    question.matchPairs?.forEach((pair) => values.push(pair.left, pair.right));
    question.subQuestions?.forEach((subQuestion) => {
      values.push(subQuestion.text, subQuestion.correctAnswer);
      subQuestion.options?.forEach((option) => values.push(option.text));
    });
  });

  return values.join(" ");
}

function sectionFor(
  questionType: QuestionType,
  count: number,
  marksPerQuestion: number,
): BlueprintSection {
  return {
    ...mcqSection,
    name: `Section ${questionType}`,
    questionType,
    count,
    marksPerQuestion,
    totalMarks: count * marksPerQuestion,
  };
}

function concept(topicId: number, topicName: string, text: string): ConceptData {
  return {
    text,
    type: "NCERT_TXT_SOURCE",
    bloomLevel: "UNDERSTAND",
    hotsPotential: true,
    subject: "English",
    classNum: 8,
    chapterName: "A Dialogue in Context",
    topicName,
    chapterId: 1,
    topicId,
    source: "ncert_txt",
  };
}

function longParagraphConcept(): ConceptData {
  return concept(
    20,
    "Dialogue evidence",
    [
      "The selected NCERT passage presents a conversation where the speaker chooses careful words to avoid open conflict, the listener notices the polite pause, the setting creates pressure, the reply uses wit instead of anger, the surrounding action shows hesitation, the final sentence changes the tone, the chapter links this response to social intelligence, the evidence asks students to connect word choice with intention, the passage also contrasts direct accusation with thoughtful explanation, the learner must separate a supported inference from a guess, the vocabulary clue depends on context, the conclusion should mention the exact dialogue detail, and the answer should remain grounded in the selected text.",
    ].join(" "),
  );
}

function singleAtomConcept(): ConceptData {
  return concept(
    21,
    "Single dialogue clue",
    "The selected source gives one precise dialogue tone clue about a speaker choosing polite words to avoid conflict during a difficult classroom conversation.",
  );
}

function tinyRepetitiveConcept(): ConceptData {
  return concept(
    22,
    "Tiny friction clue",
    "The source explains that friction slows motion on surfaces because contact opposes movement.",
  );
}

function noisyCommunicationConcept(): ConceptData {
  return {
    text:
      "Unit 1.indd 2 24-08-2018 15:24:21 S eSSIon 1 Communication Skills Employability SkillS - ClaSS iX",
    type: "NCERT_TXT_SOURCE",
    bloomLevel: "UNDERSTAND",
    hotsPotential: true,
    subject: "Advanced Computer",
    classNum: 9,
    chapterName: "Communication Skills",
    topicName: "Communication Skills",
    chapterId: 1,
    topicId: 1,
    source: "ncert_txt",
  };
}

function mcq(index: number): GeneratedQuestion {
  const uniqueTerms = [
    "speaker intention",
    "polite hesitation",
    "confident reply",
    "hidden tone",
    "social wit",
    "careful pause",
    "context signal",
    "word choice",
    "character motive",
    "supported conclusion",
    "dialogue purpose",
    "meaning shift",
    "response pattern",
    "attitude clue",
    "sentence context",
    "tone contrast",
    "source evidence",
    "inference chain",
    "vocabulary clue",
    "scene effect",
    "reader judgement",
    "conversation turn",
    "implied reason",
    "speaker confidence",
    "context meaning",
    "textual support",
    "interpretive clue",
    "dialogue outcome",
  ];
  const uniqueTerm = uniqueTerms[(index - 1) % uniqueTerms.length];

  return {
    text: `For ${uniqueTerm}, choose the source-based meaning in clue ${index}.`,
    type: "MCQ",
    difficulty: "MEDIUM",
    marks: 1,
    options: [
      { id: "A", text: "Ignore the speaker's words", isCorrect: false },
      { id: "B", text: `Use dialogue clue ${index} to infer meaning`, isCorrect: true },
      { id: "C", text: "Read an unrelated chapter", isCorrect: false },
      { id: "D", text: "Count lines without context", isCorrect: false },
    ],
    correctAnswer: "B",
    explanation: `The answer follows the chapter passage for ${uniqueTerm}.`,
    bloomLevel: "APPLY",
    competencyLevel: 2,
    topic: "Dialogue inference",
    chapterId: 1,
    topicId: 10,
    subject: "English",
    classNum: 8,
    source: "ncert_txt",
    noveltyAngle: `ai-dialogue-angle-${uniqueTerm}-${index}`,
    sourceChunkFocus: `ai-dialogue-focus-${uniqueTerm}-${index}`,
    answerPath: `infer ${uniqueTerm} through source clue ${index}`,
  };
}
