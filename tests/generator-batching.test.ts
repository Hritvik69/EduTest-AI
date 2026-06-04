import { beforeEach, describe, expect, it, vi } from "vitest";
import { defaultBloomDistribution } from "@/lib/edutest-data";
import type { BlueprintSection, GeneratedQuestion, PaperConfig } from "@/types";

const mocks = vi.hoisted(() => ({
  generateJSON: vi.fn(),
}));

vi.mock("@/lib/gemini", () => ({
  generateJSON: mocks.generateJSON,
  getConfiguredProviders: () => ["OPENROUTER"],
}));

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
  aiProvider: "OPENROUTER",
  questionTypes: ["MCQ"],
  typeDistribution: { MCQ: 40 },
  bloomDistribution: defaultBloomDistribution,
  totalQuestions: 40,
};

const section: BlueprintSection = {
  name: "Section A",
  questionType: "MCQ",
  count: 5,
  marksPerQuestion: 1,
  totalMarks: 5,
  difficulty: "MEDIUM",
  difficultyBreakdown: { EASY: 20, MEDIUM: 70, HARD: 10, ABSURD: 0 },
  bloomBreakdown: defaultBloomDistribution,
};

describe("generateQuestionsForSection batching", () => {
  beforeEach(() => {
    mocks.generateJSON.mockReset();
  });

  it("top-ups short MCQ batches until the exact count is reached", async () => {
    mocks.generateJSON
      .mockResolvedValueOnce({ questions: [mcq(1), mcq(2), mcq(3)] })
      .mockResolvedValueOnce({ questions: [mcq(4), mcq(5)] });
    const { generateQuestionsForSection } = await import("@/lib/generator");

    const questions = await generateQuestionsForSection(
      section,
      "[Source: curriculum] [Topic: Acids] [UNDERSTAND] [FACT] Acids have indicator properties.",
      config,
      { availableTopics: ["Acids"] },
    );

    expect(questions).toHaveLength(5);
    expect(mocks.generateJSON).toHaveBeenCalledTimes(2);
    expect(mocks.generateJSON.mock.calls[0][0]).toContain("Generate 5 MCQ");
    expect(mocks.generateJSON.mock.calls[1][0]).toContain("Generate 2 MCQ");
  });

  it("drops duplicate MCQs and requests replacements before validation", async () => {
    mocks.generateJSON
      .mockResolvedValueOnce({
        questions: [mcq(1), mcq(1), mcq(2), mcq(3)],
      })
      .mockResolvedValueOnce({ questions: [mcq(4), mcq(5)] });
    const { generateQuestionsForSection } = await import("@/lib/generator");

    const questions = await generateQuestionsForSection(
      section,
      "[Source: curriculum] [Topic: Acids] [UNDERSTAND] [FACT] Acids have indicator properties.",
      config,
      { availableTopics: ["Acids"] },
    );

    expect(questions).toHaveLength(5);
    expect(mocks.generateJSON).toHaveBeenCalledTimes(2);
  });

  it("avoids duplicates against reusable seed questions", async () => {
    mocks.generateJSON
      .mockResolvedValueOnce({ questions: [mcq(1), mcq(2), mcq(3)] })
      .mockResolvedValueOnce({ questions: [mcq(4)] });
    const { generateQuestionsForSection } = await import("@/lib/generator");

    const questions = await generateQuestionsForSection(
      { ...section, count: 3, totalMarks: 3 },
      "[Source: curriculum] [Topic: Acids] [UNDERSTAND] [FACT] Acids have indicator properties.",
      config,
      { availableTopics: ["Acids"], existingQuestions: [mcq(1)] },
    );

    expect(questions).toHaveLength(3);
    expect(questions.map((question) => question.text)).not.toContain(mcq(1).text);
    expect(mocks.generateJSON).toHaveBeenCalledTimes(2);
  });

  it("keeps valid batch items and tops up malformed provider output", async () => {
    mocks.generateJSON
      .mockResolvedValueOnce({
        questions: [
          { ...mcq(1), topic: "Wrong topic" },
          { ...mcq(2), options: [] },
          mcq(3),
        ],
      })
      .mockResolvedValueOnce({ questions: [mcq(4), mcq(5)] });
    const { generateQuestionsForSection } = await import("@/lib/generator");

    const questions = await generateQuestionsForSection(
      { ...section, count: 3, totalMarks: 3 },
      "[Source: curriculum] [Topic: Acids] [UNDERSTAND] [FACT] Acids have indicator properties.",
      config,
      { availableTopics: ["Acids"] },
    );

    expect(questions).toHaveLength(3);
    expect(questions.map((question) => question.text)).toEqual([
      mcq(3).text,
      mcq(4).text,
      mcq(5).text,
    ]);
    expect(mocks.generateJSON).toHaveBeenCalledTimes(2);
  });

  it("normalizes MCQ answer text to the option id and rejects duplicate options", async () => {
    mocks.generateJSON
      .mockResolvedValueOnce({
        questions: [mcqWithAnswerText(1), mcqWithDuplicateOptionText(2)],
      })
      .mockResolvedValueOnce({ questions: [mcq(3)] });
    const { generateQuestionsForSection } = await import("@/lib/generator");

    const questions = await generateQuestionsForSection(
      { ...section, count: 2, totalMarks: 2 },
      "[Source: curriculum] [Topic: Acids] [UNDERSTAND] [FACT] Acids have indicator properties.",
      config,
      { availableTopics: ["Acids"] },
    );

    expect(questions).toHaveLength(2);
    expect(questions[0].correctAnswer).toBe("B");
    expect(questions.map((question) => question.text)).toEqual([
      mcqWithAnswerText(1).text,
      mcq(3).text,
    ]);
    expect(mocks.generateJSON).toHaveBeenCalledTimes(2);
  });

  it("rejects MCQs with zero or multiple correct answers and requests replacements", async () => {
    mocks.generateJSON
      .mockResolvedValueOnce({
        questions: [mcqWithNoCorrectAnswer(1), mcqWithMultipleCorrectAnswers(2), mcq(3)],
      })
      .mockResolvedValueOnce({ questions: [mcq(4), mcq(5)] });
    const { generateQuestionsForSection } = await import("@/lib/generator");

    const questions = await generateQuestionsForSection(
      { ...section, count: 3, totalMarks: 3 },
      "[Source: curriculum] [Topic: Acids] [UNDERSTAND] [FACT] Acids have indicator properties.",
      config,
      { availableTopics: ["Acids"] },
    );

    expect(questions.map((question) => question.text)).toEqual([
      mcq(3).text,
      mcq(4).text,
      mcq(5).text,
    ]);
    expect(mocks.generateJSON).toHaveBeenCalledTimes(2);
  });

  it("rejects broken source-based sub-question structure and tops up", async () => {
    mocks.generateJSON
      .mockResolvedValueOnce({
        questions: [brokenSourceBasedQuestion()],
      })
      .mockResolvedValueOnce({ questions: [sourceBasedQuestion()] });
    const { generateQuestionsForSection } = await import("@/lib/generator");

    const questions = await generateQuestionsForSection(
      {
        ...section,
        questionType: "SOURCE_BASED",
        count: 1,
        marksPerQuestion: 4,
        totalMarks: 4,
      },
      "[Source: curriculum] [Topic: Acids] [UNDERSTAND] [FACT] Acids have indicator properties.",
      {
        ...config,
        questionTypes: ["SOURCE_BASED"],
        typeDistribution: { SOURCE_BASED: 1 },
        totalQuestions: 1,
      },
      { availableTopics: ["Acids"] },
    );

    expect(questions).toHaveLength(1);
    expect(questions[0].subQuestions).toHaveLength(4);
    expect(mocks.generateJSON).toHaveBeenCalledTimes(2);
  });

  it("returns partial valid output without top-up calls when token-saving skip mode is enabled", async () => {
    mocks.generateJSON.mockResolvedValueOnce({
      questions: [
        { ...mcq(1), topic: "Wrong topic" },
        { ...mcq(2), options: [] },
        mcq(3),
      ],
    });
    const { generateQuestionsForSection } = await import("@/lib/generator");

    const questions = await generateQuestionsForSection(
      { ...section, count: 3, totalMarks: 3 },
      "[Source: curriculum] [Topic: Acids] [UNDERSTAND] [FACT] Acids have indicator properties.",
      config,
      { allowPartial: true, availableTopics: ["Acids"] },
    );

    expect(questions.map((question) => question.text)).toEqual([mcq(3).text]);
    expect(mocks.generateJSON).toHaveBeenCalledTimes(1);
  });

  it("can use targeted extra top-up attempts in replacement mode without retrying a full paper", async () => {
    mocks.generateJSON
      .mockResolvedValueOnce({
        questions: [
          { ...mcq(1), topic: "Wrong topic" },
          { ...mcq(2), options: [] },
          mcq(3),
        ],
      })
      .mockResolvedValueOnce({ questions: [mcq(4), mcq(5)] });
    const { generateQuestionsForSection } = await import("@/lib/generator");

    const questions = await generateQuestionsForSection(
      { ...section, count: 3, totalMarks: 3 },
      "[Source: curriculum] [Topic: Acids] [UNDERSTAND] [FACT] Acids have indicator properties.",
      config,
      {
        allowPartial: true,
        availableTopics: ["Acids"],
        partialMaxExtraAttempts: 2,
      },
    );

    expect(questions.map((question) => question.text)).toEqual([
      mcq(3).text,
      mcq(4).text,
      mcq(5).text,
    ]);
    expect(mocks.generateJSON).toHaveBeenCalledTimes(2);
    expect(mocks.generateJSON.mock.calls[1][0]).toContain("Generate 2 MCQ");
    expect(mocks.generateJSON.mock.calls[1][0]).toContain(
      "Do not repeat, paraphrase, lightly reword",
    );
  });

  it("returns an empty section instead of retrying when all output is invalid in token-saving skip mode", async () => {
    mocks.generateJSON.mockResolvedValueOnce({
      questions: [{ ...mcq(1), topic: "Wrong topic" }],
    });
    const { generateQuestionsForSection } = await import("@/lib/generator");

    const questions = await generateQuestionsForSection(
      { ...section, count: 3, totalMarks: 3 },
      "[Source: curriculum] [Topic: Acids] [UNDERSTAND] [FACT] Acids have indicator properties.",
      config,
      { allowPartial: true, availableTopics: ["Acids"] },
    );

    expect(questions).toEqual([]);
    expect(mocks.generateJSON).toHaveBeenCalledTimes(1);
  });

  it("sanitizes provider-supplied text IDs before saving", async () => {
    mocks.generateJSON.mockResolvedValue({
      questions: [
        {
          ...mcq(1),
          chapterId: "Understanding Concepts" as unknown as number,
          topicId: "Understanding Concepts" as unknown as number,
        },
      ],
    });
    const { generateQuestionsForSection } = await import("@/lib/generator");

    const questions = await generateQuestionsForSection(
      { ...section, count: 1, totalMarks: 1 },
      "[Source: curriculum] [Topic: Acids] [UNDERSTAND] [FACT] Acids have indicator properties.",
      config,
      { availableTopics: ["Acids"] },
    );

    expect(questions[0].chapterId).toBe(1);
    expect(questions[0].topicId).toBeUndefined();
  });

  it("normalizes object-shaped MCQ options in case-based output", async () => {
    mocks.generateJSON.mockResolvedValue({ questions: [caseBasedQuestion()] });
    const { generateQuestionsForSection } = await import("@/lib/generator");

    const questions = await generateQuestionsForSection(
      {
        ...section,
        questionType: "CASE_BASED",
        count: 1,
        marksPerQuestion: 4,
        totalMarks: 4,
      },
      "[Source: curriculum] [Topic: Acids] [UNDERSTAND] [FACT] Acids have indicator properties.",
      {
        ...config,
        questionTypes: ["CASE_BASED"],
        typeDistribution: { CASE_BASED: 10 },
        totalQuestions: 10,
      },
      { availableTopics: ["Acids"] },
    );

    expect(questions[0].subQuestions?.[0].options).toEqual([
      { id: "A", text: "Option A", isCorrect: false },
      { id: "B", text: "Option B", isCorrect: true },
      { id: "C", text: "Option C", isCorrect: false },
      { id: "D", text: "Option D", isCorrect: false },
    ]);
  });

  it("normalizes usable case-based output with omitted sub-question type and marks", async () => {
    mocks.generateJSON.mockResolvedValue({
      questions: [looseCaseBasedQuestion()],
    });
    const { generateQuestionsForSection } = await import("@/lib/generator");

    const questions = await generateQuestionsForSection(
      {
        ...section,
        questionType: "CASE_BASED",
        count: 1,
        marksPerQuestion: 4,
        totalMarks: 4,
      },
      "[Source: curriculum] [Topic: Acids] [UNDERSTAND] [FACT] Acids have indicator properties.",
      {
        ...config,
        questionTypes: ["CASE_BASED"],
        typeDistribution: { CASE_BASED: 1 },
        totalQuestions: 1,
      },
      { availableTopics: ["Acids"] },
    );

    expect(questions[0].subQuestions?.[0]).toMatchObject({
      type: "MCQ",
      marks: 2,
      correctAnswer: "B",
    });
    expect(questions[0].subQuestions?.[1]).toMatchObject({
      type: "SHORT",
      marks: 2,
      correctAnswer: "The indicator changes because the acid reacts with it.",
    });
  });

  it("uses small one-question batches for OpenRouter-heavy formats", async () => {
    mocks.generateJSON
      .mockResolvedValueOnce({ questions: [caseBasedQuestion(1)] })
      .mockResolvedValueOnce({ questions: [caseBasedQuestion(2)] });
    const { generateQuestionsForSection } = await import("@/lib/generator");

    const questions = await generateQuestionsForSection(
      {
        ...section,
        questionType: "CASE_BASED",
        count: 2,
        marksPerQuestion: 4,
        totalMarks: 8,
      },
      "[Source: curriculum] [Topic: Acids] [UNDERSTAND] [FACT] Acids have indicator properties.",
      {
        ...config,
        questionTypes: ["CASE_BASED"],
        typeDistribution: { CASE_BASED: 2 },
        totalQuestions: 2,
      },
      { availableTopics: ["Acids"] },
    );

    expect(questions).toHaveLength(2);
    expect(mocks.generateJSON).toHaveBeenCalledTimes(2);
    expect(mocks.generateJSON.mock.calls[0][0]).toContain("Generate 1 Case-Based");
    expect(mocks.generateJSON.mock.calls[0][1].maxOutputTokens).toBeLessThanOrEqual(
      1100,
    );
  });

  it("does not retry provider credit errors", async () => {
    mocks.generateJSON.mockRejectedValue(
      new Error("OpenRouter generation failed (402): can only afford 1204"),
    );
    const { generateQuestionsForSection } = await import("@/lib/generator");

    await expect(
      generateQuestionsForSection(
        {
          ...section,
          questionType: "CASE_BASED",
          count: 2,
          marksPerQuestion: 4,
          totalMarks: 8,
        },
        "[Source: curriculum] [Topic: Acids] [UNDERSTAND] [FACT] Acids have indicator properties.",
        {
          ...config,
          questionTypes: ["CASE_BASED"],
          typeDistribution: { CASE_BASED: 2 },
          totalQuestions: 2,
        },
        { availableTopics: ["Acids"] },
      ),
    ).rejects.toThrow(/OpenRouter/);

    expect(mocks.generateJSON).toHaveBeenCalledTimes(1);
  });

  it("does not retry missing provider key errors", async () => {
    mocks.generateJSON.mockRejectedValue(
      new Error("Set XAI_API_KEY before using Grok."),
    );
    const { generateQuestionsForSection } = await import("@/lib/generator");

    await expect(
      generateQuestionsForSection(
        section,
        "[Source: curriculum] [Topic: Acids] [UNDERSTAND] [FACT] Acids have indicator properties.",
        {
          ...config,
          aiProvider: "GROK",
        },
        { availableTopics: ["Acids"] },
      ),
    ).rejects.toThrow(/XAI_API_KEY/);

    expect(mocks.generateJSON).toHaveBeenCalledTimes(1);
  });

  it("falls back immediately in guest mode when all AI providers are unavailable", async () => {
    mocks.generateJSON.mockRejectedValue(
      new Error("All configured AI providers failed. Gemini: provider is temporarily busy."),
    );
    const { generateQuestionsForSection } = await import("@/lib/generator");

    const questions = await generateQuestionsForSection(
      section,
      "[Source: curriculum] [Topic: Acids] [UNDERSTAND] [FACT] Acids have indicator properties.",
      config,
      { availableTopics: ["Acids"], allowDemoFallback: true },
    );

    expect(questions).toHaveLength(section.count);
    expect(questions[0].text).toContain("Acids");
    expect(mocks.generateJSON).toHaveBeenCalledTimes(1);
  });

  it("passes abort signals into the shared provider call", async () => {
    const controller = new AbortController();
    mocks.generateJSON.mockResolvedValue({ questions: [mcq(1)] });
    const { generateQuestionsForSection } = await import("@/lib/generator");

    await generateQuestionsForSection(
      { ...section, count: 1, totalMarks: 1 },
      "[Source: curriculum] [Topic: Acids] [UNDERSTAND] [FACT] Acids have indicator properties.",
      config,
      { availableTopics: ["Acids"], signal: controller.signal },
    );

    expect(mocks.generateJSON.mock.calls[0][1].signal).toBe(controller.signal);
  });

  it("passes exact per-format counts and the master contract into provider calls", async () => {
    mocks.generateJSON.mockResolvedValue({ questions: [mcq(1), mcq(2)] });
    const { questionGenerationSystemInstruction } = await import(
      "@/lib/gemini-prompts"
    );
    const { generateQuestionsForSection } = await import("@/lib/generator");

    await generateQuestionsForSection(
      { ...section, count: 2, totalMarks: 2 },
      "[Source: curriculum] [Topic: Acids] [UNDERSTAND] [FACT] Acids have indicator properties.",
      {
        ...config,
        questionTypes: ["MCQ", "TRUE_FALSE", "MATCH_FOLLOWING", "SHORT"],
        typeDistribution: {
          MCQ: 2,
          TRUE_FALSE: 3,
          MATCH_FOLLOWING: 4,
          SHORT: 5,
        },
        totalQuestions: 14,
      },
      { availableTopics: ["Acids"] },
    );

    const prompt = String(mocks.generateJSON.mock.calls[0][0]);
    const promptConfig = extractPromptConfig(prompt);

    expect(mocks.generateJSON.mock.calls[0][1].systemInstruction).toBe(
      questionGenerationSystemInstruction,
    );
    expect(questionGenerationSystemInstruction).toContain(
      "professional CBSE/NCERT exam composition engine",
    );
    expect(questionGenerationSystemInstruction).toContain(
      "QUESTION INTELLIGENCE MODEL",
    );
    expect(prompt).toContain("Generate ONLY current_section.type");
    expect(prompt).toContain("Self-check count, marks, structure");
    expect(prompt).toContain("Required fields on every item");
    expect(promptConfig.question_type_counts).toMatchObject({
      MCQ: 2,
      TRUE_FALSE: 3,
      MATCH_FOLLOWING: 4,
      SHORT: 5,
      ASSERTION_REASON: 0,
      DIAGRAM: 0,
    });
    expect(promptConfig.current_section).toMatchObject({
      type: "MCQ",
      count: 2,
      marks_per_question: 1,
      total_marks: 2,
    });
  });

  it("uses one NCERT_Books TXT blueprint prompt scoped to selected chapter topics", async () => {
    mocks.generateJSON.mockResolvedValue({
      questions: [mcq(1), mcq(2)],
    });
    const { generateBlueprintQuestions } = await import("@/lib/generator");

    const questions = await generateBlueprintQuestions(
      {
        totalQuestions: 2,
        totalMarks: 2,
        estimatedTime: 4,
        competencyPercentage: 60,
        sections: [{ ...section, count: 2, totalMarks: 2 }],
      },
      "[Source: ncert_txt] [Chapter: 1] [Topic: Acids] Litmus changes colour in acidic solutions after reacting with hydrogen ions.",
      {
        ...config,
        chapterIds: [1],
        totalQuestions: 2,
        typeDistribution: { MCQ: 2 },
      },
      {
        availableTopics: ["Acids"],
        existingQuestions: [mcq(99)],
        generationNonce: "unit-test-job",
      },
    );

    const prompt = String(mocks.generateJSON.mock.calls[0][0]);
    const promptConfig = extractPromptConfig(prompt);

    expect(questions).toHaveLength(2);
    expect(mocks.generateJSON).toHaveBeenCalledTimes(1);
    expect(promptConfig).toMatchObject({
      class: 10,
      source_kind: "NCERT_BOOKS_TXT",
      chapters: { Science: [1] },
      topics: ["Acids"],
      total_questions: 2,
    });
    expect(prompt).toContain("Selected source text chunks:");
    expect(prompt).toContain("Litmus changes colour in acidic solutions");
    expect(prompt).toContain("Do not copy source lines verbatim");
    expect(prompt).toContain("Question 99 asks about acid indicator property");
  });

  it("uses reserve candidates to still return 16 valid questions after duplicate candidates", async () => {
    const uniqueCandidates = Array.from({ length: 16 }, (_, index) =>
      leveledMcq(index + 1, "EASY"),
    );
    mocks.generateJSON.mockResolvedValue({
      questions: [
        uniqueCandidates[0],
        { ...uniqueCandidates[0] },
        uniqueCandidates[1],
        { ...uniqueCandidates[1] },
        uniqueCandidates[2],
        { ...uniqueCandidates[2] },
        ...uniqueCandidates.slice(3),
      ],
    });
    const { generateBlueprintQuestions } = await import("@/lib/generator");

    const questions = await generateBlueprintQuestions(
      {
        totalQuestions: 16,
        totalMarks: 16,
        estimatedTime: 32,
        competencyPercentage: 60,
        sections: [
          {
            ...section,
            difficulty: "EASY",
            count: 16,
            totalMarks: 16,
          },
        ],
      },
      "[Source: ncert_txt] [Chapter: 1] [Topic: Acids] Litmus and indicators identify acidic solutions from the chapter activity.",
      {
        ...config,
        difficulty: "EASY",
        totalQuestions: 16,
        totalMarks: 16,
        typeDistribution: { MCQ: 16 },
      },
      { availableTopics: ["Acids"] },
    );

    const promptConfig = extractPromptConfig(String(mocks.generateJSON.mock.calls[0][0]));

    expect(questions).toHaveLength(16);
    expect(new Set(questions.map((question) => question.text))).toHaveProperty(
      "size",
      16,
    );
    expect(promptConfig.total_questions).toBe(16);
    expect(promptConfig.total_candidate_questions).toBeGreaterThan(16);
    expect(promptConfig.sections?.[0]).toMatchObject({
      required_count: 16,
      candidate_count: 24,
    });
  });

  it("fills an 18-question request when one required candidate is duplicate and a reserve candidate is unique", async () => {
    const uniqueCandidates = Array.from({ length: 18 }, (_, index) =>
      leveledMcq(index + 1, "EASY"),
    );
    mocks.generateJSON.mockResolvedValue({
      questions: [
        ...uniqueCandidates.slice(0, 17),
        { ...uniqueCandidates[0] },
        uniqueCandidates[17],
      ],
    });
    const { generateBlueprintQuestions } = await import("@/lib/generator");

    const questions = await generateBlueprintQuestions(
      {
        totalQuestions: 18,
        totalMarks: 18,
        estimatedTime: 36,
        competencyPercentage: 60,
        sections: [
          {
            ...section,
            difficulty: "EASY",
            count: 18,
            totalMarks: 18,
          },
        ],
      },
      "[Source: ncert_txt] [Chapter: 1] [Topic: Acids] The selected TXT explains acid indicators, colour changes, and observations.",
      {
        ...config,
        difficulty: "EASY",
        totalQuestions: 18,
        totalMarks: 18,
        typeDistribution: { MCQ: 18 },
      },
      { availableTopics: ["Acids"] },
    );

    expect(questions).toHaveLength(18);
    expect(new Set(questions.map((question) => question.text))).toHaveProperty(
      "size",
      18,
    );
    expect(questions[17].text).toBe(uniqueCandidates[17].text);
  });

  it("includes repair feedback and TXT scope in replacement blueprint prompts", async () => {
    mocks.generateJSON.mockResolvedValue({
      questions: [mcq(21)],
    });
    const { generateBlueprintQuestions } = await import("@/lib/generator");

    await generateBlueprintQuestions(
      {
        totalQuestions: 1,
        totalMarks: 1,
        estimatedTime: 2,
        competencyPercentage: 60,
        sections: [{ ...section, count: 1, totalMarks: 1 }],
      },
      "[Source: ncert_txt] [Chapter: 1] [Topic: Acids] The TXT excerpt explains indicator colour changes.",
      {
        ...config,
        chapterIds: [1],
        totalQuestions: 1,
        typeDistribution: { MCQ: 1 },
      },
      {
        availableTopics: ["Acids"],
        candidateReserveCount: 3,
        existingQuestions: [mcq(1)],
        generationNonce: "unit-test-job:repair:2",
        repairFeedback: {
          attempt: 2,
          rejectedQuestions: [
            { type: "MCQ", reason: "DUPLICATE", question: mcq(1) },
          ],
          duplicateGroups: [[mcq(1).text, mcq(2).text]],
        },
      },
    );

    const prompt = String(mocks.generateJSON.mock.calls[0][0]);
    const promptConfig = extractPromptConfig(prompt);

    expect(promptConfig).toMatchObject({
      class: 10,
      source_kind: "NCERT_BOOKS_TXT",
      chapters: { Science: [1] },
      topics: ["Acids"],
      total_questions: 1,
      total_candidate_questions: 4,
    });
    expect(promptConfig.sections?.[0]).toMatchObject({
      required_count: 1,
      candidate_count: 4,
    });
    expect(prompt).toContain("Validator repair feedback (attempt 2)");
    expect(prompt).toContain("DUPLICATE");
    expect(prompt).toContain("Duplicate pairs rejected by validation");
    expect(prompt).toContain("TXT excerpt explains indicator colour changes");
    expect(prompt).toContain(
      "different noveltyAngle, sourceChunkFocus, scenario/example, answerPath",
    );
    expect(prompt).toContain(
      "noveltyAngle, sourceChunkFocus, answerPath",
    );
  });
});

function mcq(index: number): GeneratedQuestion {
  return {
    text: `Question ${index} asks about acid indicator property alpha${index}.`,
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
    explanation: "Option B applies the selected concept.",
    bloomLevel: "APPLY",
    competencyLevel: 2,
    topic: "Acids",
  };
}

function leveledMcq(
  index: number,
  difficulty: "EASY" | "MEDIUM",
): GeneratedQuestion {
  return {
    ...mcq(index),
    difficulty,
    bloomLevel: difficulty === "EASY" ? "REMEMBER" : "APPLY",
    reasoningSteps: difficulty === "EASY" ? 1 : 2,
    difficultyConfidence: 0.9,
    cognitiveComplexity:
      difficulty === "EASY"
        ? {
            conceptIntegration: 1,
            abstractionLevel: 1,
            inferenceLevel: 1,
            ambiguityLevel: 1,
            cognitiveLoad: 1,
          }
        : {
            conceptIntegration: 2,
            abstractionLevel: 2,
            inferenceLevel: 2,
            ambiguityLevel: 2,
            cognitiveLoad: 2,
          },
  };
}

function mcqWithAnswerText(index: number): GeneratedQuestion {
  return {
    ...mcq(index),
    text: `Question ${index} asks which acid indicator explanation is valid.`,
    options: [
      { id: "A", text: "The colour changes without any cause", isCorrect: false },
      { id: "B", text: "The acid changes the indicator colour", isCorrect: false },
      { id: "C", text: "The indicator is unrelated to the acid", isCorrect: false },
      { id: "D", text: "The observation is random", isCorrect: false },
    ],
    correctAnswer: "The acid changes the indicator colour",
  };
}

function mcqWithDuplicateOptionText(index: number): GeneratedQuestion {
  return {
    ...mcq(index),
    text: `Question ${index} has repeated option text from the AI.`,
    options: [
      { id: "A", text: "Same repeated option", isCorrect: false },
      { id: "B", text: "Same repeated option", isCorrect: true },
      { id: "C", text: "Different option", isCorrect: false },
      { id: "D", text: "Another different option", isCorrect: false },
    ],
    correctAnswer: "B",
  };
}

function mcqWithNoCorrectAnswer(index: number): GeneratedQuestion {
  return {
    ...mcq(index),
    text: `Question ${index} has no usable correct answer from the AI.`,
    options: mcq(index).options?.map((option) => ({
      ...option,
      isCorrect: false,
    })),
    correctAnswer: "",
  };
}

function mcqWithMultipleCorrectAnswers(index: number): GeneratedQuestion {
  return {
    ...mcq(index),
    text: `Question ${index} has multiple correct options from the AI.`,
    options: [
      { id: "A", text: "Option A", isCorrect: true },
      { id: "B", text: "Option B", isCorrect: true },
      { id: "C", text: "Option C", isCorrect: false },
      { id: "D", text: "Option D", isCorrect: false },
    ],
    correctAnswer: "B",
  };
}

function caseBasedQuestion(index = 1): GeneratedQuestion {
  const variants = [
    {
      scenario:
        "A student observes an indicator colour change and evaluates four possible explanations.",
      mcq: "Which option best explains the observed indicator change?",
      short: "Explain the reason for the indicator observation.",
      answer: "The acid changes the indicator colour because it reacts with it.",
    },
    {
      scenario:
        "A learner compares two labelled solutions and uses an indicator property to classify one sample.",
      mcq: "Which observation best supports the classification of the sample?",
      short: "Explain how the property helps identify the sample.",
      answer: "The sample is identified by applying the indicator property correctly.",
    },
    {
      scenario:
        "A classroom activity records a before-and-after result and asks students to infer the cause.",
      mcq: "Which inference follows from the recorded classroom result?",
      short: "Explain the cause of the recorded change.",
      answer: "The recorded change follows from the concept tested in the activity.",
    },
  ];
  const variant = variants[(index - 1) % variants.length];

  return {
    text: `Read case ${index} and answer the assessment questions below.`,
    type: "CASE_BASED",
    difficulty: "MEDIUM",
    marks: 4,
    scenario: variant.scenario,
    subQuestions: [
      {
        text: variant.mcq,
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
        text: variant.short,
        type: "SHORT",
        correctAnswer: variant.answer,
        marks: 2,
      },
    ],
    correctAnswer:
      `(1) B; (2) ${variant.answer}`,
    explanation: "Each sub-question is marked independently.",
    bloomLevel: "APPLY",
    competencyLevel: 2,
    topic: "Acids",
  };
}

function sourceBasedQuestion(): GeneratedQuestion {
  return {
    text: "Read the source and answer the questions.",
    type: "SOURCE_BASED",
    difficulty: "MEDIUM",
    marks: 4,
    scenario:
      "A student adds a few drops of indicator to an acid and observes a clear colour change. The observation is recorded and discussed using the acid indicator concept.",
    subQuestions: Array.from({ length: 4 }, (_, index) => ({
      text: `What does passage point ${index + 1} show?`,
      type: "VERY_SHORT",
      correctAnswer: "It shows evidence for the acid indicator concept.",
      marks: 1,
    })),
    correctAnswer: "Each sub-question should connect the source to the acid concept.",
    explanation: "Source-based answers are marked independently.",
    bloomLevel: "APPLY",
    competencyLevel: 2,
    topic: "Acids",
  };
}

function brokenSourceBasedQuestion(): GeneratedQuestion {
  return {
    ...sourceBasedQuestion(),
    subQuestions: sourceBasedQuestion().subQuestions?.slice(0, 2),
  };
}

function looseCaseBasedQuestion(): GeneratedQuestion {
  return {
    ...caseBasedQuestion(),
    subQuestions: [
      {
        text: "Which option best explains the indicator change?",
        options: {
          A: "Option A",
          B: "Option B",
          C: "Option C",
          D: "Option D",
        },
        answer: "B",
      },
      {
        question: "Explain the reason for the observation.",
        solution: "The indicator changes because the acid reacts with it.",
      },
    ],
    correctAnswer: "",
  } as unknown as GeneratedQuestion;
}

function extractPromptConfig(prompt: string) {
  const match = prompt.match(/CONFIG_JSON:(\{[^\n]*\})\n\nSubject:/);
  if (!match) throw new Error("CONFIG_JSON block not found in prompt.");
  return JSON.parse(match[1]) as {
    question_type_counts: Record<string, number>;
    current_section: Record<string, unknown>;
    source_kind?: string;
    chapters?: unknown;
    topics?: unknown;
    total_questions?: unknown;
    total_candidate_questions?: number;
    sections?: Array<Record<string, unknown>>;
    [key: string]: unknown;
  };
}
