import { beforeEach, describe, expect, it, vi } from "vitest";
import { defaultBloomDistribution } from "@/lib/edutest-data";
import type {
  Blueprint,
  ConceptData,
  GeneratedQuestion,
  PaperConfig,
  QuestionCompositionItem,
} from "@/types";

const mocks = vi.hoisted(() => ({
  generateJSON: vi.fn(),
}));

vi.mock("@/lib/gemini", () => ({
  generateJSON: mocks.generateJSON,
  getConfiguredProviders: () => ["GEMINI"],
}));

const composition: QuestionCompositionItem[] = [
  {
    subject: "Biology",
    chapterId: 101,
    chapterName: "Human Reproduction",
    topicId: 1001,
    topicName: "Gamete formation",
    questionCount: 5,
  },
  {
    subject: "Mathematics",
    chapterId: 201,
    chapterName: "Relations and Functions",
    topicId: 2001,
    topicName: "Functions",
    questionCount: 5,
  },
  {
    subject: "Chemistry",
    chapterId: 301,
    chapterName: "Solutions",
    topicId: 3001,
    topicName: "Molarity",
    questionCount: 5,
  },
  {
    subject: "Physics",
    chapterId: 401,
    chapterName: "Ray Optics",
    topicId: 4001,
    topicName: "Refraction",
    questionCount: 5,
  },
];

const config: PaperConfig = {
  sourceMode: "curriculum",
  classNum: 12,
  subject: "Biology",
  subjects: ["Biology", "Mathematics", "Chemistry", "Physics"],
  subjectSelections: [
    { subject: "Biology", chapterIds: [101], topicIds: [1001] },
    { subject: "Mathematics", chapterIds: [201], topicIds: [2001] },
    { subject: "Chemistry", chapterIds: [301], topicIds: [3001] },
    { subject: "Physics", chapterIds: [401], topicIds: [4001] },
  ],
  chapterIds: [101, 201, 301, 401],
  topicIds: [1001, 2001, 3001, 4001],
  totalMarks: 20,
  duration: 60,
  examType: "Practice",
  difficulty: "MEDIUM",
  aiProvider: "AUTO",
  questionTypes: ["MCQ"],
  typeDistribution: { MCQ: 20 },
  questionComposition: composition,
  bloomDistribution: defaultBloomDistribution,
  totalQuestions: 20,
};

describe("strict coverage generation", () => {
  beforeEach(() => {
    mocks.generateJSON.mockReset();
  });

  it("allocates a 20-question paper across Biology, Maths, Chemistry, and Physics", async () => {
    const { buildRemainingCoveragePlan } = await import("@/lib/coverage-generation");
    const plan = buildRemainingCoveragePlan(blueprintFor(20), composition, []);

    expect(plan).toHaveLength(1);
    expect(plan[0].allocations.map((allocation) => allocation.count)).toEqual([
      5,
      5,
      5,
      5,
    ]);
    expect(plan[0].allocations.map((allocation) => allocation.item.subject)).toEqual([
      "Biology",
      "Mathematics",
      "Chemistry",
      "Physics",
    ]);
  });

  it("sends each focused prompt only the matching subject/chapter TXT context", async () => {
    mocks.generateJSON.mockImplementation(async (prompt: string) => ({
      questions: prompt.includes("Biology source text")
        ? [mcq(1, "Biology", 101, 1001, "Gamete formation")]
        : [mcq(2, "Chemistry", 301, 3001, "Molarity")],
    }));
    const { generateCoveragePlannedQuestions } = await import(
      "@/lib/coverage-generation"
    );
    const focusedComposition = [composition[0], composition[2]].map((item) => ({
      ...item,
      questionCount: 1,
    }));

    const result = await generateCoveragePlannedQuestions({
      blueprint: blueprintFor(2),
      concepts: conceptsFor(focusedComposition),
      config: {
        ...config,
        subjects: ["Biology", "Chemistry"],
        chapterIds: [101, 301],
        topicIds: [1001, 3001],
        questionComposition: focusedComposition,
        totalQuestions: 2,
        totalMarks: 2,
        typeDistribution: { MCQ: 2 },
      },
    });

    const firstPrompt = String(mocks.generateJSON.mock.calls[0][0]);
    const secondPrompt = String(mocks.generateJSON.mock.calls[1][0]);

    expect(result.questions).toHaveLength(2);
    expect(mocks.generateJSON).toHaveBeenCalledTimes(2);
    expect(firstPrompt).toContain("Biology source text");
    expect(firstPrompt).not.toContain("Chemistry source text");
    expect(secondPrompt).toContain("Chemistry source text");
    expect(secondPrompt).not.toContain("Biology source text");
  });

  it("uses selected-source coverage batches when no providers pass preflight", async () => {
    const counts = [6, 6, 5, 5];
    const largeComposition = composition.map((item, index) => ({
      ...item,
      questionCount: counts[index],
    }));
    const blueprint = blueprintFor(22);
    const paperConfig = {
      ...config,
      questionComposition: largeComposition,
      totalQuestions: 22,
      totalMarks: 22,
      typeDistribution: { MCQ: 22 },
    };
    const { generateCoveragePlannedQuestions } = await import(
      "@/lib/coverage-generation"
    );
    const { QuestionCandidateBank } = await import(
      "@/lib/question-candidate-bank"
    );

    const result = await generateCoveragePlannedQuestions({
      blueprint,
      concepts: conceptsFor(largeComposition),
      config: paperConfig,
      healthyProviders: [],
    });
    const bank = new QuestionCandidateBank(result.questions, blueprint, paperConfig);

    expect(mocks.generateJSON).not.toHaveBeenCalled();
    expect(result.questions).toHaveLength(22);
    expect(bank.result().rejectedQuestions).toEqual([]);
    expect(bank.result().skipped).toEqual([]);
    expect(bank.readyCount()).toBe(22);
    expect(bank.missingCount()).toBe(0);
    expect(result.diagnostics.map((item) => item.generationMode)).toEqual([
      "source_backed_provider_outage",
      "source_backed_provider_outage",
      "source_backed_provider_outage",
      "source_backed_provider_outage",
    ]);
  });

  it("falls back to selected-source batches when providers fail before first candidate", async () => {
    const counts = [6, 6, 5, 5];
    const largeComposition = composition.map((item, index) => ({
      ...item,
      questionCount: counts[index],
    }));
    mocks.generateJSON.mockRejectedValue(
      new Error(
        "All configured AI providers failed. GroqCloud: no credits or quota. Gemini: provider timed out.",
      ),
    );
    const blueprint = blueprintFor(22);
    const paperConfig = {
      ...config,
      questionComposition: largeComposition,
      totalQuestions: 22,
      totalMarks: 22,
      typeDistribution: { MCQ: 22 },
    };
    const { generateCoveragePlannedQuestions } = await import(
      "@/lib/coverage-generation"
    );
    const { QuestionCandidateBank } = await import(
      "@/lib/question-candidate-bank"
    );

    const result = await generateCoveragePlannedQuestions({
      blueprint,
      concepts: conceptsFor(largeComposition),
      config: paperConfig,
    });
    const bank = new QuestionCandidateBank(result.questions, blueprint, paperConfig);

    expect(mocks.generateJSON).toHaveBeenCalledTimes(4);
    expect(result.questions).toHaveLength(22);
    expect(bank.result().rejectedQuestions).toEqual([]);
    expect(bank.result().skipped).toEqual([]);
    expect(bank.readyCount()).toBe(22);
    expect(bank.missingCount()).toBe(0);
    expect(new Set(result.questions.map((question) => question.subject))).toEqual(
      new Set(["Biology", "Mathematics", "Chemistry", "Physics"]),
    );
    expect(result.diagnostics.every(
      (item) => item.generationMode === "source_backed_provider_outage",
    )).toBe(true);
  });

  it("continues only remaining coverage allocations on resume", async () => {
    mocks.generateJSON.mockResolvedValue({
      questions: [mcq(3, "Chemistry", 301, 3001, "Molarity")],
    });
    const { generateCoveragePlannedQuestions } = await import(
      "@/lib/coverage-generation"
    );
    const focusedComposition = [composition[0], composition[2]].map((item) => ({
      ...item,
      questionCount: 1,
    }));
    const acceptedBiology = mcq(1, "Biology", 101, 1001, "Gamete formation");

    const result = await generateCoveragePlannedQuestions({
      blueprint: blueprintFor(2),
      concepts: conceptsFor(focusedComposition),
      config: {
        ...config,
        subjects: ["Biology", "Chemistry"],
        chapterIds: [101, 301],
        topicIds: [1001, 3001],
        questionComposition: focusedComposition,
        totalQuestions: 2,
        totalMarks: 2,
        typeDistribution: { MCQ: 2 },
      },
      existingQuestions: [acceptedBiology],
      acceptedQuestions: [acceptedBiology],
    });

    const prompt = String(mocks.generateJSON.mock.calls[0][0]);

    expect(result.questions).toHaveLength(1);
    expect(result.questions[0].subject).toBe("Chemistry");
    expect(mocks.generateJSON).toHaveBeenCalledTimes(1);
    expect(prompt).toContain("Chemistry source text");
    expect(prompt).not.toContain("Biology source text");
  });

  it("fails clearly when a positive allocation has no real TXT or PDF source text", async () => {
    const { generateCoveragePlannedQuestions } = await import(
      "@/lib/coverage-generation"
    );

    await expect(
      generateCoveragePlannedQuestions({
        blueprint: blueprintFor(1),
        concepts: [
          {
            ...conceptFor(composition[0]),
            text: "Only topic outline",
            source: "curriculum",
            type: "CURRICULUM_TOPIC",
          },
        ],
        config: {
          ...config,
          subjects: ["Biology"],
          chapterIds: [101],
          topicIds: [1001],
          questionComposition: [{ ...composition[0], questionCount: 1 }],
          totalQuestions: 1,
          totalMarks: 1,
          typeDistribution: { MCQ: 1 },
        },
      }),
    ).rejects.toThrow(/Selected source text is not enough/);
    expect(mocks.generateJSON).not.toHaveBeenCalled();
  });

  it("generates a 22-question multi-subject paper in focused batches", async () => {
    const counts = [6, 6, 5, 5];
    const largeComposition = composition.map((item, index) => ({
      ...item,
      questionCount: counts[index],
    }));
    mocks.generateJSON.mockImplementation(async (prompt: string) => {
      const subject =
        largeComposition.find((item) => prompt.includes(`${item.subject} source text`))
          ?.subject ?? "Biology";
      const item =
        largeComposition.find((candidate) => candidate.subject === subject) ??
        largeComposition[0];
      const count = prompt.match(/Generate\s+(\d+)\s+MCQ/i)?.[1] ?? "1";
      return {
        questions: Array.from({ length: Number(count) }, (_, index) =>
          mcq(index + 20, item.subject, item.chapterId!, item.topicId!, item.topicName!),
        ),
      };
    });
    const { generateCoveragePlannedQuestions } = await import(
      "@/lib/coverage-generation"
    );

    const result = await generateCoveragePlannedQuestions({
      blueprint: blueprintFor(22),
      concepts: conceptsFor(largeComposition),
      config: {
        ...config,
        questionComposition: largeComposition,
        totalQuestions: 22,
        totalMarks: 22,
        typeDistribution: { MCQ: 22 },
      },
    });

    expect(result.questions).toHaveLength(22);
    expect(mocks.generateJSON).toHaveBeenCalledTimes(4);
    expect(result.diagnostics.map((item) => item.generatedQuestions)).toEqual(counts);
    expect(new Set(result.questions.map((question) => question.subject))).toEqual(
      new Set(["Biology", "Mathematics", "Chemistry", "Physics"]),
    );
  });
});

function blueprintFor(count: number): Blueprint {
  return {
    totalQuestions: count,
    totalMarks: count,
    estimatedTime: count * 2,
    competencyPercentage: 60,
    sections: [
      {
        name: "Section A",
        questionType: "MCQ",
        count,
        marksPerQuestion: 1,
        totalMarks: count,
        difficulty: "MEDIUM",
        difficultyBreakdown: { MEDIUM: 100 },
        bloomBreakdown: defaultBloomDistribution,
      },
    ],
  };
}

function conceptsFor(items: QuestionCompositionItem[]): ConceptData[] {
  return items.map(conceptFor);
}

function conceptFor(item: QuestionCompositionItem): ConceptData {
  const subject = item.subject;
  const chapter = item.chapterName;
  const topic = item.topicName ?? "General";
  const sourceSentences = [
    `${subject} source text for ${chapter} explains ${topic} with selected NCERT details for this exact chapter.`,
    `The foundation detail defines ${topic} by naming the key relationship students must recognise before answering.`,
    `The process detail shows the ordered step that connects the first condition with the later result in ${topic}.`,
    `The evidence detail gives a concrete textbook clue that supports the correct conclusion about ${topic}.`,
    `The comparison detail separates ${topic} from a nearby but different idea in the same chapter.`,
    `The application detail places ${topic} inside a classroom example where the learner chooses the correct method.`,
    `The misconception detail warns that a tempting shortcut gives the wrong interpretation of ${topic}.`,
    `The conclusion detail links the chapter evidence back to the final answer expected for ${topic}.`,
  ];

  return {
    text: sourceSentences.join(" "),
    type: "NCERT_TXT_SOURCE",
    bloomLevel: "UNDERSTAND",
    hotsPotential: true,
    subject,
    classNum: 12,
    chapterName: chapter,
    topicName: topic,
    chapterId: item.chapterId ?? 1,
    topicId: item.topicId,
    source: "ncert_txt",
  };
}

function mcq(
  index: number,
  subject: string,
  chapterId: number,
  topicId: number,
  topic: string,
): GeneratedQuestion {
  const uniqueTerms = [
    "definition",
    "application",
    "evidence",
    "process",
    "comparison",
    "inference",
    "reasoning",
    "example",
  ];
  const uniqueTerm = uniqueTerms[index % uniqueTerms.length];

  return {
    text: `${subject} ${uniqueTerm} prompt ${index} checks ${topic} concept token${index}.`,
    type: "MCQ",
    difficulty: "MEDIUM",
    marks: 1,
    options: [
      { id: "A", text: `Wrong ${subject} idea ${index}`, isCorrect: false },
      { id: "B", text: `Correct ${subject} idea ${index}`, isCorrect: true },
      { id: "C", text: `Unrelated ${subject} idea ${index}`, isCorrect: false },
      { id: "D", text: `Partial ${subject} idea ${index}`, isCorrect: false },
    ],
    correctAnswer: "B",
    explanation: "The answer follows the passage concept.",
    bloomLevel: "APPLY",
    competencyLevel: 2,
    topic,
    chapterId,
    topicId,
    subject,
    classNum: 12,
    source: "ncert_txt",
    noveltyAngle: `${subject}-angle-${index}`,
    sourceChunkFocus: `${subject}-focus-${index}`,
    answerPath: `${subject}-answer-path-${index}`,
  };
}
