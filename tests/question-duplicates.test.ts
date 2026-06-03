import { describe, expect, it } from "vitest";
import {
  duplicateQuestionDecision,
  duplicateQuestionReason,
  parseSourceBackedCompletionMetadata,
  sourceBackedDistinctnessProof,
} from "@/lib/question-duplicates";

type DuplicateTestQuestion = {
  text: string;
  type?: string;
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

  it("allows same-atom source-backed similarity only when the angle and proof fields differ", () => {
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

    expect(duplicateQuestionReason(first, second)).toBeNull();
    expect(sourceBackedDistinctnessProof(first, second)).toMatchObject({
      bothSourceBacked: true,
      differentAngle: true,
      allowSoftSimilarity: true,
    });
    expect(duplicateQuestionReason(first, weakSecond)).toBe(
      "repeated answer path metadata",
    );
  });

  it("allows different atom and angle pairs despite shared chapter vocabulary", () => {
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
      duplicate: false,
      reason: null,
      allowedSoftSimilarity: "near-duplicate question stem",
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

  it("allows AI-vs-source-backed similarity only with stronger distinct source proof", () => {
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
      duplicate: false,
      reason: null,
      allowedSoftSimilarity: "near-duplicate question stem",
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
