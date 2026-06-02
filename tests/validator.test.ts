import { describe, expect, it } from "vitest";
import { generateBlueprint } from "@/lib/blueprint";
import { defaultBloomDistribution } from "@/lib/edutest-data";
import {
  validatePaper,
  validatePaperKeepingValidQuestions,
} from "@/lib/validator";
import type { Blueprint, GeneratedQuestion, PaperConfig } from "@/types";

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

function mcq(index: number): GeneratedQuestion {
  return {
    text: `Question asks about alpha${index} beta${index} gamma${index} delta${index}.`,
    type: "MCQ",
    difficulty: "MEDIUM",
    marks: 1,
    options: [
      { id: "A", text: "Option A", isCorrect: false },
      { id: "B", text: "Option B", isCorrect: true },
      { id: "C", text: "Option C", isCorrect: false },
      { id: "D", text: "Option D", isCorrect: false },
    ],
    correctAnswer: "B",
    explanation: "Option B applies the concept.",
    bloomLevel: "UNDERSTAND",
    competencyLevel: 2,
  };
}

function mcqWithNoCorrectAnswer(index: number): GeneratedQuestion {
  return {
    ...mcq(index),
    options: mcq(index).options?.map((option) => ({
      ...option,
      isCorrect: false,
    })),
    correctAnswer: "",
  };
}

function ncertQuestion(index: number): GeneratedQuestion {
  const concepts = [
    "cell organelles and their functions",
    "tissue organization in plants",
    "transport of materials across membranes",
  ];
  const concept = concepts[(index - 1) % concepts.length];

  return {
    text: `Answer the NCERT exercise question about ${concept} with a precise textbook explanation.`,
    type: "NCERT_FORMAT",
    difficulty: "MEDIUM",
    marks: 2,
    correctAnswer: `The NCERT answer explains ${concept} using the chapter definition.`,
    explanation: "The response should match the NCERT concept and wording.",
    bloomLevel: "UNDERSTAND",
    competencyLevel: 2,
  };
}

describe("validatePaper", () => {
  it("accepts a complete valid paper", async () => {
    const blueprint = generateBlueprint(config);
    const questions = Array.from({ length: 40 }, (_, index) => mcq(index + 1));

    await expect(validatePaper(questions, blueprint, config)).resolves.toHaveLength(40);
  });

  it("fails clearly instead of inserting demo replacements", async () => {
    const blueprint = generateBlueprint(config);
    const questions = Array.from({ length: 40 }, (_, index) => mcq(index + 1));
    questions[3] = mcqWithNoCorrectAnswer(4);

    await expect(validatePaper(questions, blueprint, config)).rejects.toThrow(
      /Invalid MCQ question/,
    );
  });

  it("normalizes object-shaped MCQ options", async () => {
    const question = {
      ...mcq(1),
      options: {
        A: "Option A",
        B: "Option B",
        C: "Option C",
        D: "Option D",
      } as unknown as GeneratedQuestion["options"],
    };

    const [validated] = await validatePaper([question], blueprintFor("MCQ", 1), config);

    expect(validated.options).toEqual([
      { id: "A", text: "Option A", isCorrect: false },
      { id: "B", text: "Option B", isCorrect: true },
      { id: "C", text: "Option C", isCorrect: false },
      { id: "D", text: "Option D", isCorrect: false },
    ]);
  });

  it("normalizes MCQ correct answer text to the matching option id", async () => {
    const question = {
      ...mcq(1),
      options: [
        { id: "A", text: "Wrong acid explanation", isCorrect: false },
        { id: "B", text: "Correct acid explanation", isCorrect: false },
        { id: "C", text: "Unrelated explanation", isCorrect: false },
        { id: "D", text: "Random observation", isCorrect: false },
      ],
      correctAnswer: "Correct acid explanation",
    };

    const [validated] = await validatePaper([question], blueprintFor("MCQ", 1), config);

    expect(validated.correctAnswer).toBe("B");
    expect(validated.options?.filter((option) => option.isCorrect)).toEqual([
      { id: "B", text: "Correct acid explanation", isCorrect: true },
    ]);
  });

  it("rejects MCQs with duplicate option text", async () => {
    const question = {
      ...mcq(1),
      options: [
        { id: "A", text: "Repeated option", isCorrect: false },
        { id: "B", text: "Repeated option", isCorrect: true },
        { id: "C", text: "Different option", isCorrect: false },
        { id: "D", text: "Another option", isCorrect: false },
      ],
      correctAnswer: "B",
    };

    await expect(
      validatePaper([question], blueprintFor("MCQ", 1), config),
    ).rejects.toThrow(/Invalid MCQ question/);
  });

  it("normalizes MCQ options inside case-based sub-questions", async () => {
    const [validated] = await validatePaper(
      [caseBasedQuestion()],
      blueprintFor("CASE_BASED", 4),
      config,
    );

    expect(validated.subQuestions?.[0].options).toEqual([
      { id: "A", text: "Option A", isCorrect: false },
      { id: "B", text: "Option B", isCorrect: true },
      { id: "C", text: "Option C", isCorrect: false },
      { id: "D", text: "Option D", isCorrect: false },
    ]);
  });

  it("accepts usable case-based sub-questions when provider omits type and marks", async () => {
    const [validated] = await validatePaper(
      [looseCaseBasedQuestion()],
      blueprintFor("CASE_BASED", 4),
      config,
    );

    expect(validated.subQuestions?.[0]).toMatchObject({
      type: "MCQ",
      marks: 2,
      correctAnswer: "B",
    });
    expect(validated.subQuestions?.[1]).toMatchObject({
      type: "SHORT",
      marks: 2,
      correctAnswer: "The observation follows from applying the concept correctly.",
    });
  });

  it("normalizes alternate case-based question containers from AI output", async () => {
    const [validated] = await validatePaper(
      [alternateCaseBasedQuestion()],
      blueprintFor("CASE_BASED", 4),
      config,
    );

    expect(validated.subQuestions).toHaveLength(2);
    expect(validated.subQuestions?.[0]).toMatchObject({
      type: "MCQ",
      marks: 2,
      correctAnswer: "B",
    });
    expect(validated.subQuestions?.[1]).toMatchObject({
      type: "SHORT",
      marks: 2,
      correctAnswer: "Because the concept explains the observed classroom change.",
    });
  });

  it("keeps valid questions and adjusts totals when some generated output is bad", () => {
    const result = validatePaperKeepingValidQuestions(
      [
        mcq(1),
        mcqWithNoCorrectAnswer(2),
        mcq(3),
        { ...mcq(1), text: mcq(1).text },
      ],
      {
        ...blueprintFor("MCQ", 1),
        sections: [{ ...blueprintFor("MCQ", 1).sections[0], count: 4, totalMarks: 4 }],
        totalQuestions: 4,
        totalMarks: 4,
      },
      config,
    );

    expect(result.questions).toHaveLength(2);
    expect(result.skipped).toEqual([
      { type: "MCQ", position: 2, reason: "invalid-structure" },
      { type: "MCQ", position: 4, reason: "duplicate" },
    ]);
    expect(result.blueprint.totalQuestions).toBe(2);
    expect(result.blueprint.totalMarks).toBe(2);
    expect(result.config.totalQuestions).toBe(2);
    expect(result.config.totalMarks).toBe(2);
    expect(result.validQuestions).toHaveLength(2);
    expect(result.rejectedQuestions.map((item) => item.reason)).toEqual([
      "WRONG_FORMAT",
      "DUPLICATE",
    ]);
    expect(result.rejectionReasons).toMatchObject({
      WRONG_FORMAT: 1,
      DUPLICATE: 1,
    });
    expect(result.duplicateGroups).toHaveLength(1);
    expect(result.missingSections[0]).toMatchObject({
      questionType: "MCQ",
      count: 2,
    });
  });

  it("rejects near-duplicate scenarios even when question stems differ", () => {
    const sharedScenario =
      "A student tests a solution with litmus and observes a clear colour change during the chapter activity.";
    const result = validatePaperKeepingValidQuestions(
      [
        {
          ...mcq(11),
          text: "Which inference should the student make from the litmus activity?",
          scenario: sharedScenario,
          topic: "Acids",
        },
        {
          ...mcq(12),
          text: "What conclusion follows from the colour change in the activity?",
          scenario: sharedScenario,
          topic: "Acids",
        },
      ],
      {
        ...blueprintFor("MCQ", 1),
        sections: [{ ...blueprintFor("MCQ", 1).sections[0], count: 2, totalMarks: 2 }],
        totalQuestions: 2,
        totalMarks: 2,
      },
      config,
    );

    expect(result.questions).toHaveLength(1);
    expect(result.skipped).toEqual([
      { type: "MCQ", position: 2, reason: "duplicate" },
    ]);
    expect(result.duplicateGroups).toHaveLength(1);
    expect(result.rejectionReasons).toMatchObject({ DUPLICATE: 1 });
  });

  it("skips malformed NCERT Books/PDF questions instead of failing the paper", () => {
    const blueprint = {
      ...blueprintFor("NCERT_FORMAT", 2),
      sections: [
        {
          ...blueprintFor("NCERT_FORMAT", 2).sections[0],
          count: 3,
          totalMarks: 6,
        },
      ],
      totalQuestions: 3,
      totalMarks: 6,
    };

    const result = validatePaperKeepingValidQuestions(
      [ncertQuestion(1), { ...ncertQuestion(2), correctAnswer: "" }, ncertQuestion(3)],
      blueprint,
      config,
    );

    expect(result.questions).toHaveLength(2);
    expect(result.skipped).toEqual([
      { type: "NCERT_FORMAT", position: 2, reason: "invalid-structure" },
    ]);
    expect(result.blueprint.totalQuestions).toBe(2);
    expect(result.blueprint.totalMarks).toBe(4);
  });
});

function caseBasedQuestion(): GeneratedQuestion {
  return {
    text: "Read the case and answer the assessment questions below.",
    type: "CASE_BASED",
    difficulty: "MEDIUM",
    marks: 4,
    scenario:
      "A student observes a concept in a classroom activity and compares four possible explanations before writing a short reason.",
    subQuestions: [
      {
        text: "Which option best explains the observed concept?",
        type: "MCQ",
        options: {
          A: "Option A",
          B: "Option B",
          C: "Option C",
          D: "Option D",
        } as unknown as GeneratedQuestion["options"],
        correctAnswer: "B",
        marks: 2,
      },
      {
        text: "Explain the reason for the observation.",
        type: "SHORT",
        correctAnswer: "The observation follows from applying the concept correctly.",
        marks: 2,
      },
    ],
    correctAnswer:
      "(1) B; (2) The observation follows from applying the concept correctly.",
    explanation: "Each sub-question is marked independently.",
    bloomLevel: "APPLY",
    competencyLevel: 2,
  };
}

function looseCaseBasedQuestion(): GeneratedQuestion {
  return {
    ...caseBasedQuestion(),
    subQuestions: [
      {
        prompt: "Which option best explains the observed concept?",
        options: {
          A: { text: "Option A" },
          B: { text: "Option B", correct: true },
          C: { text: "Option C" },
          D: { text: "Option D" },
        },
      },
      {
        question: "Explain the reason for the observation.",
        answer: "The observation follows from applying the concept correctly.",
      },
    ],
    correctAnswer: "",
  } as unknown as GeneratedQuestion;
}

function alternateCaseBasedQuestion(): GeneratedQuestion {
  return {
    ...caseBasedQuestion(),
    subQuestions: undefined,
    questions: [
      {
        questionText: "Which option best explains the classroom change?",
        choices: {
          A: "Option A",
          B: "Option B",
          C: "Option C",
          D: "Option D",
        },
        correct_option: "B",
      },
      {
        prompt: "Give the reason for this observation.",
        model_answer: "Because the concept explains the observed classroom change.",
      },
    ],
    correctAnswer: "",
  } as unknown as GeneratedQuestion;
}

function blueprintFor(type: GeneratedQuestion["type"], marks: number): Blueprint {
  return {
    sections: [
      {
        name: "Section A",
        questionType: type,
        count: 1,
        marksPerQuestion: marks,
        totalMarks: marks,
        difficulty: "MEDIUM",
        difficultyBreakdown: { EASY: 20, MEDIUM: 70, HARD: 10, ABSURD: 0 },
        bloomBreakdown: defaultBloomDistribution,
      },
    ],
    totalQuestions: 1,
    totalMarks: marks,
    estimatedTime: 30,
    competencyPercentage: 60,
  };
}
