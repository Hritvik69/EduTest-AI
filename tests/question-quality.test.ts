import { describe, expect, it } from "vitest";
import { deterministicMcqOptionShuffle } from "@/lib/mcq-option-shuffle";
import {
  buildShuffledMatchAnswer,
  displayedMatchColumns,
} from "@/lib/match-display";
import { normalizeQuestionStructure } from "@/lib/question-structure";
import { auditTeacherLogicQuality } from "@/lib/question-quality";
import { defaultBloomDistribution } from "@/lib/edutest-data";
import type { Blueprint, GeneratedQuestion, QuestionType } from "@/types";

describe("deterministic MCQ option shuffle", () => {
  it("moves the correct option across A-D while preserving one correct answer", () => {
    const answers = Array.from({ length: 8 }, (_, index) =>
      deterministicMcqOptionShuffle(baseOptions(), `seed-${index}`, index),
    );

    expect(new Set(answers.map((item) => item.correctAnswer)).size).toBe(4);
    answers.forEach((item) => {
      expect(item.options).toHaveLength(4);
      expect(item.options.filter((option) => option.isCorrect)).toHaveLength(1);
      expect(item.options.find((option) => option.isCorrect)?.id).toBe(
        item.correctAnswer,
      );
    });
  });

  it("keeps option order reproducible for the same seed and sequence", () => {
    const first = deterministicMcqOptionShuffle(baseOptions(), "stable-seed", 3);
    const second = deterministicMcqOptionShuffle(baseOptions(), "stable-seed", 3);

    expect(second).toEqual(first);
  });
});

describe("teacher logic quality audit", () => {
  it("rejects fragment artifacts, raw template labels, and repeated deterministic stems", () => {
    const questions = [
      mcq(
        1,
        "Which statement best explains the evidence point about a raw fragment?",
        "B",
      ),
      mcq(2, "Which statement best explains the evidence point about another fragment?", "B"),
      mcq(3, "Which statement best explains the evidence point about third fragment?", "B"),
      fillBlank(4, 'The statement "of ordinary people and were always interesting" is mainly connected with ________.', "of ordinary"),
      matchFollowing(5),
    ];

    const reasons = issuesByPosition(
      auditTeacherLogicQuality(questions, blueprintFor(questions)),
    );

    expect(reasons.get(1)).toBe("raw-template-artifact");
    expect(reasons.get(4)).toMatch(/fragment|accidental/);
    expect(reasons.get(5)).toMatch(/raw-template-artifact|generic-match-label/);
  });

  it("rejects deterministic MCQ answer-key imbalance", () => {
    const stems = [
      "Which option correctly describes communication feedback?",
      "What result follows when a receiver understands the message?",
      "Which example best shows clear verbal communication?",
      "How does active listening improve communication?",
      "Which choice explains the role of a communication channel?",
      "What does non-verbal communication mainly include?",
      "Which statement shows a barrier to communication?",
    ];
    const questions = Array.from({ length: 7 }, (_, index) =>
      mcq(
        index + 1,
        stems[index],
        "B",
      ),
    );

    expect(
      auditTeacherLogicQuality(questions, blueprintFor(questions)).some(
        (issue) => issue.reason === "mcq-answer-key-imbalance",
      ),
    ).toBe(true);
  });

  it("rejects pasted non-MCQ fallback artifacts", () => {
    const questions = [
      {
        ...baseQuestion(
          1,
          "TRUE_FALSE",
          "True or False: IntroductIon to communIcatIon You probably hear people talking about communication all the time. Everyone needs it what exactly is communication.",
        ),
        correctAnswer: "True",
        noveltyAngle: "SYLLABUS_NEAR_FALLBACK:TRUE_FALSE:1",
      },
      {
        ...baseQuestion(
          2,
          "MATCH_FOLLOWING",
          "Match the inference points about match highlighted words with their meanings.",
          3,
        ),
        correctAnswer: "A1-B1, A2-B2, A3-B3, A4-B4",
        matchPairs: [
          {
            left: "Match highlighted",
            right: "Match the highlighted words with their meanings given in the box below.",
          },
          { left: "Context", right: "Match highlighted words with their meanings given" },
          { left: "Inference", right: "Explain what follows from the idea." },
          { left: "Correct use", right: "Use the idea in a relevant situation" },
        ],
        noveltyAngle: "SOURCE_BACKED_COMPLETION:MATCH_FOLLOWING:2",
      },
      {
        ...baseQuestion(
          3,
          "SHORT",
          "Explain the evidence point in the passage detail about receiving speaking writing examples information.",
          3,
        ),
        correctAnswer:
          "receiving (Fig. Speaking writing to someone are examples of giving information. Reading listening to someone are examples of receiving information. Explain the concept clearly.",
        noveltyAngle: "SOURCE_BACKED_COMPLETION:SHORT:3",
      },
    ];

    const reasons = issuesByPosition(
      auditTeacherLogicQuality(questions, blueprintFor(questions)),
    );

    expect(reasons.get(1)).toBe("raw-template-artifact");
    expect(reasons.get(2)).toBe("weak-match-pair");
    expect(reasons.get(3)).toMatch(/raw-template-artifact|weak-short/);
  });

  it("rejects deterministic True/False fallback batches with one-sided answers", () => {
    const questions = [
      trueFalse(1, "True", true),
      trueFalse(2, "True", true),
      trueFalse(3, "True", true),
    ];

    expect(
      auditTeacherLogicQuality(questions, blueprintFor(questions)).some(
        (issue) => issue.reason === "true-false-answer-key-imbalance",
      ),
    ).toBe(true);
  });

  it("rejects one-sided Assertion-Reason batches and weak template links", () => {
    const weakTemplate = {
      ...baseQuestion(
        1,
        "ASSERTION_REASON",
        "Assertion (A): Feedback can be understood through inference.\nReason (R): Feedback tells the sender whether the message was understood. This supports the inference reasoning.",
      ),
      assertion: "Feedback can be understood through inference.",
      reason:
        "Feedback tells the sender whether the message was understood. This supports the inference reasoning.",
      correctAnswer: "A",
    };

    const weakReasons = issuesByPosition(
      auditTeacherLogicQuality([weakTemplate], blueprintFor([weakTemplate])),
    );
    expect(weakReasons.get(1)).toBe("weak-assertion-reason");

    const oneSided = [
      assertionReason(2, "A"),
      assertionReason(3, "A"),
      assertionReason(4, "A"),
    ];
    expect(
      auditTeacherLogicQuality(oneSided, blueprintFor(oneSided)).some(
        (issue) => issue.reason === "assertion-reason-answer-key-imbalance",
      ),
    ).toBe(true);
  });

  it("normalizes identity match answer keys into shuffled keys", () => {
    const question = matchFollowing(10, false, true);
    const normalized = normalizeQuestionStructure(
      question,
      blueprintFor([question]).sections[0],
    );

    expect(question.correctAnswer).toBe("A1-B1, A2-B2, A3-B3, A4-B4");
    expect(normalized.correctAnswer).not.toBe("A1-B1, A2-B2, A3-B3, A4-B4");
    expect(
      auditTeacherLogicQuality([normalized], blueprintFor([normalized])),
    ).toEqual([]);
  });

  it("derives shuffled match display columns from canonical pairs", () => {
    const pairs = [
      { left: "Sender", right: "Creates a message" },
      { left: "Receiver", right: "Understands a message" },
      { left: "Channel", right: "Carries the message" },
      { left: "Feedback", right: "Confirms understanding" },
    ];
    const columns = displayedMatchColumns(
      pairs,
      "A1-B3, A2-B1, A3-B4, A4-B2",
    );

    expect(columns.leftItems.map((item) => item.text)).toEqual([
      "Sender",
      "Receiver",
      "Channel",
      "Feedback",
    ]);
    expect(columns.rightItems.map((item) => item.text)).toEqual([
      "Understands a message",
      "Confirms understanding",
      "Creates a message",
      "Carries the message",
    ]);
    expect(columns.answerKey).toBe("A1-B3, A2-B1, A3-B4, A4-B2");
    expect(buildShuffledMatchAnswer(pairs, "quality-match-seed")).not.toBe(
      "A1-B1, A2-B2, A3-B3, A4-B4",
    );
  });

  it("accepts normal mixed teacher-usable questions", () => {
    const questions = [
      mcq(1, "Which option correctly describes feedback in communication?", "A"),
      trueFalse(2),
      oneWord(3),
      fillBlank(4, "Clear spoken or written words are called ________.", "Verbal communication"),
      assertionReason(5),
      matchFollowing(6, false),
      shortQuestion(7),
      caseBased(8),
      sourceBased(9),
    ];

    expect(auditTeacherLogicQuality(questions, blueprintFor(questions))).toEqual([]);
  });
});

function baseOptions() {
  return [
    { id: "A", text: "Distractor one", isCorrect: false },
    { id: "B", text: "Correct answer", isCorrect: true },
    { id: "C", text: "Distractor two", isCorrect: false },
    { id: "D", text: "Distractor three", isCorrect: false },
  ];
}

function baseQuestion(
  id: number,
  type: QuestionType,
  text: string,
  marks = 1,
): GeneratedQuestion {
  return {
    id,
    text,
    type,
    marks,
    difficulty: "MEDIUM",
    bloomLevel: "UNDERSTAND",
    competencyLevel: 2,
    reasoningSteps: 2,
    difficultyConfidence: 0.8,
    cognitiveComplexity: {
      conceptIntegration: 2,
      abstractionLevel: 2,
      inferenceLevel: 2,
      ambiguityLevel: 1,
      cognitiveLoad: 2,
    },
    topic: "Communication Skills",
    chapterId: 1,
    subject: "Advanced Computer",
    classNum: 9,
    correctAnswer: "Communication is clear sharing of ideas.",
    explanation: "The answer is accepted when it is clear and relevant.",
  };
}

function mcq(id: number, text: string, correctAnswer: string): GeneratedQuestion {
  const shuffled = deterministicMcqOptionShuffle(
    baseOptions(),
    `quality-test:${id}`,
    ["A", "B", "C", "D"].indexOf(correctAnswer),
  );
  return {
    ...baseQuestion(id, "MCQ", text),
    options: shuffled.options,
    correctAnswer: shuffled.correctAnswer,
    noveltyAngle: `SYLLABUS_NEAR_FALLBACK:MCQ:${id}`,
  };
}

function trueFalse(id: number, answer = "True", fallback = false) {
  return {
    ...baseQuestion(id, "TRUE_FALSE", "True or False: Feedback helps confirm whether a message was understood."),
    correctAnswer: answer,
    noveltyAngle: fallback ? `SYLLABUS_NEAR_FALLBACK:TRUE_FALSE:${id}` : undefined,
  };
}

function oneWord(id: number) {
  return {
    ...baseQuestion(id, "ONE_WORD", "Which term means communication without spoken or written words?"),
    correctAnswer: "Non-verbal communication",
  };
}

function fillBlank(id: number, text: string, answer: string) {
  return {
    ...baseQuestion(id, "FILL_BLANK", text),
    correctAnswer: answer,
  };
}

function assertionReason(id: number, correctAnswer = "A") {
  return {
    ...baseQuestion(
      id,
      "ASSERTION_REASON",
      "Assertion (A): Feedback improves communication.\nReason (R): It helps the sender know whether the receiver understood the message.",
    ),
    assertion: "Feedback improves communication.",
    reason: "It helps the sender know whether the receiver understood the message.",
    correctAnswer,
  };
}

function matchFollowing(id: number, bad = true, forceIdentity = false) {
  const matchPairs = bad
    ? [
        { left: "Focused point", right: "Phrase window communication feedback" },
        { left: "Reason", right: "Explain the concept clearly." },
        { left: "Application", right: "Use the idea." },
        { left: "Conclusion", right: "Finish clearly." },
      ]
    : [
        { left: "Sender", right: "Starts the message" },
        { left: "Receiver", right: "Understands the message" },
        { left: "Channel", right: "Medium used for communication" },
        { left: "Feedback", right: "Response from the receiver" },
      ];
  return {
    ...baseQuestion(id, "MATCH_FOLLOWING", "Match the terms with their meanings.", 3),
    correctAnswer:
      bad || forceIdentity
        ? "A1-B1, A2-B2, A3-B3, A4-B4"
        : buildShuffledMatchAnswer(matchPairs, `quality-good-match:${id}`),
    matchPairs,
  };
}

function shortQuestion(id: number) {
  return {
    ...baseQuestion(id, "SHORT", "Explain why active listening is important.", 3),
    correctAnswer: "Active listening helps the receiver understand and respond correctly.",
  };
}

function caseBased(id: number) {
  return {
    ...baseQuestion(id, "CASE_BASED", "Read the case and answer the questions.", 4),
    scenario: "A student gives unclear instructions and the class asks for clarification.",
    subQuestions: [
      {
        text: "Which option best explains the problem?",
        type: "MCQ" as const,
        options: baseOptions(),
        correctAnswer: "B",
        marks: 2,
      },
      {
        text: "Give one reason.",
        type: "SHORT" as const,
        correctAnswer: "The sender should make the message clear.",
        marks: 2,
      },
    ],
    correctAnswer: "(1) B; (2) The sender should make the message clear.",
  };
}

function sourceBased(id: number) {
  return {
    ...baseQuestion(id, "SOURCE_BASED", "Read the passage and answer the questions.", 4),
    scenario: "Feedback tells the sender whether a message was understood.",
    subQuestions: [
      { text: "Name the concept.", type: "VERY_SHORT" as const, correctAnswer: "Feedback", marks: 1 },
      { text: "State its use.", type: "VERY_SHORT" as const, correctAnswer: "It confirms understanding.", marks: 1 },
      { text: "Give one example.", type: "VERY_SHORT" as const, correctAnswer: "A listener repeats the instruction.", marks: 1 },
      { text: "Mention one mistake.", type: "VERY_SHORT" as const, correctAnswer: "Ignoring the receiver's response.", marks: 1 },
    ],
    correctAnswer: "(1) Feedback; (2) It confirms understanding.",
  };
}

function blueprintFor(questions: GeneratedQuestion[]): Blueprint {
  const sections = questions.map((question) => ({
    name: `Section ${question.type}`,
    questionType: question.type,
    count: 1,
    marksPerQuestion: question.marks,
    totalMarks: question.marks,
    difficulty: "MEDIUM" as const,
    difficultyBreakdown: { MEDIUM: 100 },
    bloomBreakdown: defaultBloomDistribution,
  }));

  return {
    sections,
    totalQuestions: questions.length,
    totalMarks: questions.reduce((sum, question) => sum + question.marks, 0),
    estimatedTime: questions.length,
    competencyPercentage: 60,
  };
}

function issuesByPosition(
  issues: ReturnType<typeof auditTeacherLogicQuality>,
) {
  return new Map(issues.map((issue) => [issue.position, issue.reason]));
}
