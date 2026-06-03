import { describe, expect, it } from "vitest";
import {
  duplicateQuestionDecision,
  duplicateQuestionReason,
  numericDistinctnessProof,
  parseSourceBackedCompletionMetadata,
  sourceBackedDistinctnessProof,
} from "@/lib/question-duplicates";

type DuplicateTestQuestion = {
  text: string;
  type?: string;
  subject?: string;
  topic?: string;
  scenario?: string;
  correctAnswer?: string;
  options?: Array<{ id?: string; text?: string; isCorrect?: boolean }>;
  subQuestions?: Array<{
    text?: string;
    correctAnswer?: string;
    options?: Array<{ id?: string; text?: string; isCorrect?: boolean }>;
  }>;
  noveltyAngle?: string;
  sourceChunkFocus?: string;
  answerPath?: string;
};

describe("question duplicate decisions", () => {
  it("rejects exact source-backed question text as a hard duplicate", () => {
    const first = sourceBackedMcq({
      text: "Which evidence statement explains the selected source detail about acid-base indicators?",
      noveltyAngle: "SOURCE_BACKED_COMPLETION:MCQ:evidence:atom-1:1",
    });
    const second = sourceBackedMcq({
      text: "Which evidence statement explains the selected source detail about acid-base indicators?",
      noveltyAngle: "SOURCE_BACKED_COMPLETION:MCQ:inference:atom-2:2",
      sourceChunkFocus:
        "Inference focus atom-2: methyl orange changes colour in acidic solution.",
      answerPath:
        "Read atom-2, infer the indicator result, and explain the acidic solution.",
    });

    const decision = duplicateQuestionDecision(first, second);

    expect(decision).toMatchObject({
      duplicate: true,
      kind: "hard",
      reason: "exact question stem",
    });
  });

  it("rejects exact MCQ option signatures even when source-backed metadata differs", () => {
    const first = sourceBackedMcq({
      noveltyAngle: "SOURCE_BACKED_COMPLETION:MCQ:evidence:atom-1:1",
    });
    const second = sourceBackedMcq({
      text: "Which inference statement identifies the acid-base indicator result from the source?",
      noveltyAngle: "SOURCE_BACKED_COMPLETION:MCQ:inference:atom-2:2",
      sourceChunkFocus:
        "Inference focus atom-2: methyl orange changes colour in acidic solution.",
      answerPath:
        "Read atom-2, infer the indicator result, and explain the acidic solution.",
    });

    expect(duplicateQuestionReason(first, second)).toBe("repeated option pattern");
  });

  it("rejects the same source atom and angle as a hard duplicate", () => {
    const first = sourceBackedMcq({
      noveltyAngle: "SOURCE_BACKED_COMPLETION:MCQ:evidence:atom-1:1",
      options: uniqueOptions("evidence", "atom-1"),
    });
    const second = sourceBackedMcq({
      text: "Which evidence choice explains the selected indicator activity from the chapter?",
      noveltyAngle: "SOURCE_BACKED_COMPLETION:MCQ:evidence:atom-1:99",
      sourceChunkFocus:
        "Different words for atom-1: litmus changes colour in acidic solution.",
      answerPath:
        "Use atom-1 evidence, connect it to litmus colour change, and support the acid conclusion.",
      options: uniqueOptions("evidence-repeat", "atom-1"),
    });

    expect(duplicateQuestionReason(first, second)).toBe(
      "repeated source-backed angle",
    );
  });

  it("rejects same-atom source-backed questions even when the angle and proof fields differ", () => {
    const first = sourceBackedMcq({
      text: "Which evidence statement best explains the litmus colour change for the acid sample in the selected chapter?",
      noveltyAngle: "SOURCE_BACKED_COMPLETION:MCQ:evidence:atom-1:1",
      options: uniqueOptions("evidence", "atom-1"),
    });
    const second = sourceBackedMcq({
      text: "Which inference statement best explains the litmus colour change for the acid sample in the selected chapter?",
      noveltyAngle: "SOURCE_BACKED_COMPLETION:MCQ:inference:atom-1:2",
      sourceChunkFocus:
        "Inference focus atom-1: the litmus observation implies the acidic nature of the sample.",
      answerPath:
        "Read atom-1, infer the relationship between litmus and acidity, and explain the sample result.",
      options: uniqueOptions("inference", "atom-1"),
    });
    const weakSecond = {
      ...second,
      sourceChunkFocus: first.sourceChunkFocus,
      answerPath: first.answerPath,
    };

    expect(duplicateQuestionReason(first, second)).toBe("repeated source-backed atom");
    expect(sourceBackedDistinctnessProof(first, second)).toMatchObject({
      bothSourceBacked: true,
      differentAngle: true,
      allowSoftSimilarity: false,
    });
    expect(duplicateQuestionReason(first, weakSecond)).toBe(
      "repeated source-backed atom",
    );
  });

  it("rejects same atom with different source-backed lenses", () => {
    const first = sourceBackedMcq({
      text: "Which evidence detail best explains the litmus colour change for the acid sample in the selected chapter?",
      noveltyAngle: "SOURCE_BACKED_COMPLETION:MCQ:evidence-detail:atom-1:1",
      sourceChunkFocus:
        "Evidence detail focus atom-1: litmus gives the exact selected-source colour clue.",
      answerPath:
        "Read atom-1, isolate the detail lens, and identify the litmus colour clue.",
      options: uniqueOptions("evidence-detail", "atom-1"),
    });
    const second = sourceBackedMcq({
      text: "Which evidence support best explains the litmus colour change for the acid sample in the selected chapter?",
      noveltyAngle: "SOURCE_BACKED_COMPLETION:MCQ:evidence-support:atom-1:2",
      sourceChunkFocus:
        "Evidence support focus atom-1: litmus supports the acidic solution conclusion.",
      answerPath:
        "Read atom-1, use the support lens, and connect litmus to the acid conclusion.",
      options: uniqueOptions("evidence-support", "atom-1"),
    });

    expect(duplicateQuestionReason(first, second)).toBe("repeated source-backed atom");
    expect(sourceBackedDistinctnessProof(first, second)).toMatchObject({
      differentAngle: true,
      differentAtom: false,
      allowSoftSimilarity: false,
    });
  });

  it("rejects different atom and angle pairs when they remain near-paraphrased conceptual stems", () => {
    const first = sourceBackedMcq({
      text: "Which evidence statement best explains the litmus colour change for the acid sample in the selected chapter?",
      noveltyAngle: "SOURCE_BACKED_COMPLETION:MCQ:evidence:atom-1:1",
      options: uniqueOptions("evidence", "atom-1"),
    });
    const second = sourceBackedMcq({
      text: "Which inference statement best explains the litmus colour change for the acid sample in the selected chapter?",
      noveltyAngle: "SOURCE_BACKED_COMPLETION:MCQ:inference:atom-2:2",
      sourceChunkFocus:
        "Inference focus atom-2: methyl orange provides a separate selected-source indicator clue.",
      answerPath:
        "Read atom-2, infer the methyl orange relationship, and explain the acidic sample result.",
      options: uniqueOptions("inference", "atom-2"),
    });

    expect(duplicateQuestionDecision(first, second)).toMatchObject({
      duplicate: true,
      reason: "near-duplicate question stem",
      kind: "soft",
    });
  });

  it("rejects AI-vs-source-backed similarity when the answer path repeats", () => {
    const aiQuestion = aiMcq({
      answerPath:
        "Identify the acid by linking litmus colour change to the selected indicator activity.",
    });
    const sourceQuestion = sourceBackedMcq({
      text: "Which evidence statement identifies the acid by using litmus colour change in the selected indicator activity?",
      noveltyAngle: "SOURCE_BACKED_COMPLETION:MCQ:evidence:atom-1:1",
      answerPath:
        "Identify the acid by linking litmus colour change to the selected indicator activity.",
      options: uniqueOptions("evidence", "atom-1"),
    });

    expect(duplicateQuestionReason(aiQuestion, sourceQuestion)).toBe(
      "repeated answer path metadata",
    );
  });

  it("rejects AI-vs-source-backed similarity even with distinct source proof", () => {
    const aiQuestion = aiMcq({
      scenario:
        "A student observes litmus during an acid-base test and records one colour change.",
      options: uniqueOptions("ai-indicator", "general"),
      sourceChunkFocus:
        "AI focus: a broad acid-base indicator activity from the selected chapter.",
      answerPath:
        "Use the broad indicator activity, identify the acid result, and explain the colour change.",
    });
    const sourceQuestion = sourceBackedMcq({
      text: "Which evidence choice explains the litmus colour change for the acid sample in the selected chapter?",
      scenario:
        "Selected TXT atom-3 describes a separate methyl orange result before the learner compares it with litmus.",
      noveltyAngle: "SOURCE_BACKED_COMPLETION:MCQ:evidence:atom-3:3",
      sourceChunkFocus:
        "Evidence focus atom-3: methyl orange gives a separate selected-source clue.",
      answerPath:
        "Read atom-3, compare methyl orange with litmus, and support the source-specific conclusion.",
      options: uniqueOptions("source-indicator", "atom-3"),
    });

    expect(duplicateQuestionDecision(aiQuestion, sourceQuestion)).toMatchObject({
      duplicate: true,
      reason: "near-duplicate question stem",
      kind: "soft",
    });
  });

  it("allows similar numerical wording only when values, answer, and path differ", () => {
    const first = numericalQuestion({
      text: "A rectangle has length 12 cm and breadth 8 cm. Calculate the area in square centimetres from these measurements.",
      correctAnswer: "96 square centimetres",
      answerPath: "Multiply 12 by 8 to get 96 square centimetres.",
    });
    const second = numericalQuestion({
      text: "A rectangle has length 15 cm and breadth 6 cm. Calculate the area in square centimetres from these measurements.",
      correctAnswer: "90 square centimetres",
      answerPath: "Multiply 15 by 6 to get 90 square centimetres.",
    });

    const decision = duplicateQuestionDecision(first, second);

    expect(decision).toMatchObject({
      duplicate: false,
      reason: null,
      allowedSoftSimilarity: "near-duplicate question stem",
    });
    expect(decision.numericDistinctnessProof).toMatchObject({
      leftNumerical: true,
      rightNumerical: true,
      numericTupleDiffers: true,
      finalAnswerDiffers: true,
      answerPathDiffers: true,
      allowSoftSimilarity: true,
    });
  });

  it("rejects similar numerical questions with the same final answer", () => {
    const first = numericalQuestion({
      text: "A rectangle has length 12 cm and breadth 8 cm. Calculate the area in square centimetres from these measurements.",
      correctAnswer: "96 square centimetres",
      answerPath: "Multiply 12 by 8 to get 96 square centimetres.",
    });
    const second = numericalQuestion({
      text: "A rectangle has length 16 cm and breadth 6 cm. Calculate the area in square centimetres from these measurements.",
      correctAnswer: "96 square centimetres",
      answerPath: "Multiply 16 by 6 to get 96 square centimetres.",
    });

    expect(duplicateQuestionReason(first, second)).toBe(
      "repeated numerical answer",
    );
  });

  it("rejects similar numerical questions with the same value tuple", () => {
    const first = numericalQuestion({
      text: "A rectangle has length 12 cm and breadth 8 cm. Calculate the area in square centimetres from these measurements.",
      correctAnswer: "96 square centimetres",
      answerPath: "Multiply 12 by 8 to get 96 square centimetres.",
    });
    const second = numericalQuestion({
      text: "A garden plot has length 12 cm and breadth 8 cm. Calculate the area in square centimetres from these measurements.",
      correctAnswer: "96 square centimetres",
      answerPath: "Use the same 12 and 8 measurements to calculate the area.",
    });

    expect(duplicateQuestionReason(first, second)).toBe(
      "repeated numerical values",
    );
  });

  it("does not apply the numerical exception to non-numerical source-backed paraphrases", () => {
    const first = sourceBackedMcq({
      text: "Which evidence statement best explains the litmus colour change for the acid sample in the selected chapter?",
      noveltyAngle: "SOURCE_BACKED_COMPLETION:MCQ:evidence-detail:atom-4:1",
      options: uniqueOptions("evidence-detail", "atom-4"),
    });
    const second = sourceBackedMcq({
      text: "Which evidence statement best explains the litmus colour change for the acid sample in this selected chapter?",
      noveltyAngle: "SOURCE_BACKED_COMPLETION:MCQ:evidence-support:atom-5:2",
      sourceChunkFocus:
        "Evidence support focus atom-5: the source gives a separate clue.",
      answerPath:
        "Read atom-5, use the support lens, and connect the clue to the conclusion.",
      options: uniqueOptions("evidence-support", "atom-5"),
    });

    const decision = duplicateQuestionDecision(first, second);

    expect(decision).toMatchObject({
      duplicate: true,
      reason: "near-duplicate question stem",
    });
    expect(decision.numericDistinctnessProof?.allowSoftSimilarity).not.toBe(true);
  });

  it("exposes numerical distinctness proof for diagnostics", () => {
    const first = numericalQuestion({
      text: "Find the total of 12 and 8 using the given values.",
      correctAnswer: "20",
      answerPath: "Add 12 and 8 to get 20.",
    });
    const second = numericalQuestion({
      text: "Find the total of 15 and 6 using the given values.",
      correctAnswer: "21",
      answerPath: "Add 15 and 6 to get 21.",
    });

    expect(numericDistinctnessProof(first, second)).toMatchObject({
      allowSoftSimilarity: true,
      leftNumbers: ["12", "8"],
      rightNumbers: ["15", "6"],
      leftFinalAnswer: "20",
      rightFinalAnswer: "21",
    });
  });

  it("rejects AI-vs-source-backed similarity without a structural proof difference", () => {
    const aiQuestion = aiMcq({
      sourceChunkFocus:
        "AI focus: a broad acid-base indicator activity from the selected chapter.",
      answerPath:
        "Use the broad indicator activity, identify the acid result, and explain the colour change.",
    });
    const sourceQuestion = sourceBackedMcq({
      text: "Which evidence choice explains the litmus colour change for the acid sample in the selected chapter?",
      noveltyAngle: "SOURCE_BACKED_COMPLETION:MCQ:evidence-detail:atom-3:3",
      sourceChunkFocus:
        "Evidence detail focus atom-3: methyl orange gives a separate selected-source clue.",
      answerPath:
        "Read atom-3, use the detail lens, and support the source-specific conclusion.",
      options: undefined,
    });

    const decision = duplicateQuestionDecision(aiQuestion, sourceQuestion);

    expect(decision).toMatchObject({
      duplicate: true,
      reason: "near-duplicate question stem",
    });
    expect(decision.distinctnessProof).toMatchObject({
      hasStructuralDifference: false,
      allowSoftSimilarity: false,
    });
  });

  it("parses source-backed completion metadata", () => {
    expect(
      parseSourceBackedCompletionMetadata(
        "SOURCE_BACKED_COMPLETION:SOURCE_BASED:source-extract:atom-7:42",
      ),
    ).toEqual({
      marker: "SOURCE_BACKED_COMPLETION",
      type: "SOURCE_BASED",
      angleId: "source-extract",
      atomId: "atom-7",
      sequence: "42",
    });
  });
});

function aiMcq(overrides: Partial<DuplicateTestQuestion> = {}): DuplicateTestQuestion {
  return {
    text: "Which evidence statement explains the litmus colour change for the acid sample in the selected chapter?",
    type: "MCQ",
    topic: "Acids and bases",
    correctAnswer: "B",
    options: uniqueOptions("ai", "general"),
    sourceChunkFocus:
      "AI focus: acid-base indicators and litmus colour changes in the selected chapter.",
    answerPath:
      "Connect the indicator observation to the acid result and explain the colour change.",
    ...overrides,
  };
}

function sourceBackedMcq(
  overrides: Partial<DuplicateTestQuestion> = {},
): DuplicateTestQuestion {
  return {
    text: "Which evidence statement explains the selected indicator result from the acid-base source?",
    type: "MCQ",
    topic: "Acids and bases",
    correctAnswer: "B",
    options: uniqueOptions("evidence", "atom-1"),
    noveltyAngle: "SOURCE_BACKED_COMPLETION:MCQ:evidence:atom-1:1",
    sourceChunkFocus:
      "Evidence focus atom-1: litmus changes colour in acidic solution.",
    answerPath:
      "Read atom-1, identify the litmus evidence, and support the acidic solution conclusion.",
    ...overrides,
  };
}

function numericalQuestion(
  overrides: Partial<DuplicateTestQuestion> = {},
): DuplicateTestQuestion {
  return {
    text: "A rectangle has length 12 cm and breadth 8 cm. Calculate the area in square centimetres from these measurements.",
    type: "NUMERICAL",
    subject: "Mathematics",
    topic: "Area",
    correctAnswer: "96 square centimetres",
    answerPath: "Multiply 12 by 8 to get 96 square centimetres.",
    ...overrides,
  };
}

function uniqueOptions(angle: string, atomId: string) {
  return [
    {
      id: "A",
      text: `A distractor that ignores ${angle} evidence from ${atomId}`,
      isCorrect: false,
    },
    {
      id: "B",
      text: `The selected ${angle} detail from ${atomId} supports the indicator conclusion`,
      isCorrect: true,
    },
    {
      id: "C",
      text: `A partial ${angle} claim from ${atomId} without source reasoning`,
      isCorrect: false,
    },
    {
      id: "D",
      text: `An unrelated ${angle} definition that is not supported by ${atomId}`,
      isCorrect: false,
    },
  ];
}
