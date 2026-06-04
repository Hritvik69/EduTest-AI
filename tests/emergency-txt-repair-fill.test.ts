import { describe, expect, it } from "vitest";
import { defaultBloomDistribution } from "@/lib/edutest-data";
import { QuestionCandidateBank } from "@/lib/question-candidate-bank";
import {
  completeQuestionBankWithSourceBackedFallback,
  sourceBackedCompletionMarker,
} from "@/lib/source-backed-fallback";
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
