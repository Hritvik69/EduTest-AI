import { describe, expect, it } from "vitest";
import { generateBlueprint } from "@/lib/blueprint";
import { defaultBloomDistribution } from "@/lib/edutest-data";
import {
  buildGenerationContract,
  generationContractPromptPayload,
} from "@/lib/generation-contract";
import type { PaperConfig } from "@/types";

const baseConfig: PaperConfig = {
  sourceMode: "curriculum",
  classNum: 9,
  subject: "Mathematics",
  subjects: ["Mathematics"],
  subjectSelections: [{ subject: "Mathematics", chapterIds: [101], topicIds: [1001] }],
  chapterIds: [101],
  topicIds: [1001],
  totalMarks: 30,
  duration: 60,
  examType: "Practice",
  difficulty: "MEDIUM",
  aiProvider: "AUTO",
  generationMode: "fresh",
  integrationPrompt:
    "Use simple classroom language and prefer practical examples where suitable.",
  questionTypes: ["MCQ", "SHORT"],
  typeDistribution: { MCQ: 12, SHORT: 6 },
  questionComposition: [
    {
      subject: "Mathematics",
      chapterId: 101,
      chapterName: "Real Numbers",
      topicId: 1001,
      topicName: "Euclid Division Lemma",
      questionCount: 18,
    },
  ],
  bloomDistribution: defaultBloomDistribution,
  totalQuestions: 18,
};

describe("GenerationContract", () => {
  it("summarizes selected paper settings for prompt and UI", () => {
    const blueprint = generateBlueprint(baseConfig);
    const contract = buildGenerationContract(baseConfig, blueprint, {
      availableTopics: ["Euclid Division Lemma"],
      sourceTextChunks: 4,
    });
    const payload = generationContractPromptPayload(contract);

    expect(contract.hash).toMatch(/^[a-f0-9]{8}$/);
    expect(contract.paper).toMatchObject({
      totalQuestions: 18,
      totalMarks: 30,
      difficulty: "MEDIUM",
      generationMode: "fresh",
      aiProvider: "AUTO",
    });
    expect(contract.sections.map((section) => [section.type, section.count])).toEqual([
      ["MCQ", 12],
      ["SHORT", 6],
    ]);
    expect(payload).toMatchObject({
      prompt_contract_hash: contract.hash,
      class: 9,
      source_mode: "curriculum",
      total_questions: 18,
      difficulty: "MEDIUM",
      generation_mode: "fresh",
      generation_mode_label: "Fresh Questions",
      integration_prompt:
        "Use simple classroom language and prefer practical examples where suitable.",
      question_type_counts: { MCQ: 12, SHORT: 6 },
    });
  });

  it("changes the hash when user-selected prompt inputs change", () => {
    const hashFor = (config: PaperConfig) =>
      buildGenerationContract(config, generateBlueprint(config), {
        availableTopics: ["Euclid Division Lemma"],
      }).hash;
    const baseline = hashFor(baseConfig);

    expect(hashFor({ ...baseConfig, difficulty: "HARD" })).not.toBe(baseline);
    expect(
      hashFor({
        ...baseConfig,
        totalQuestions: 20,
        typeDistribution: { MCQ: 14, SHORT: 6 },
      }),
    ).not.toBe(baseline);
    expect(
      hashFor({
        ...baseConfig,
        questionTypes: ["MCQ", "LONG"],
        typeDistribution: { MCQ: 12, LONG: 6 },
      }),
    ).not.toBe(baseline);
    expect(
      hashFor({
        ...baseConfig,
        bloomDistribution: { ...defaultBloomDistribution, APPLY: 35, CREATE: 0 },
      }),
    ).not.toBe(baseline);
    expect(
      hashFor({
        ...baseConfig,
        sourceMode: "pdf_upload",
        subject: "Uploaded PDF",
        subjects: ["Uploaded PDF"],
        subjectSelections: [],
        chapterIds: [],
        topicIds: [],
        pdfSourceId: 12,
        pdfSource: {
          id: 12,
          title: "Real Numbers Notes",
          fileName: "real-numbers.pdf",
          subject: "Mathematics",
          classNum: 9,
          wordCount: 2400,
          conceptsCount: 12,
          topics: ["Euclid Division Lemma"],
          focusPrompt: "Only divisibility examples",
          extractionMethod: "AI",
          createdAt: "2026-06-04T00:00:00.000Z",
        },
      }),
    ).not.toBe(baseline);
    expect(hashFor({ ...baseConfig, aiProvider: "GEMINI" })).not.toBe(baseline);
    expect(hashFor({ ...baseConfig, generationMode: "source_exact" })).not.toBe(
      baseline,
    );
    expect(
      hashFor({
        ...baseConfig,
        integrationPrompt: "Make every suitable question use local market examples.",
      }),
    ).not.toBe(baseline);
  });

  it("estimates focused generation as bounded chunks instead of every type as a call", () => {
    const config: PaperConfig = {
      ...baseConfig,
      totalQuestions: 9,
      totalMarks: 25,
      questionTypes: [
        "MCQ",
        "TRUE_FALSE",
        "ONE_WORD",
        "FILL_BLANK",
        "VERY_SHORT",
        "SHORT",
        "NUMERICAL",
        "HOTS",
        "LONG",
      ],
      typeDistribution: {
        MCQ: 1,
        TRUE_FALSE: 1,
        ONE_WORD: 1,
        FILL_BLANK: 1,
        VERY_SHORT: 1,
        SHORT: 1,
        NUMERICAL: 1,
        HOTS: 1,
        LONG: 1,
      },
      questionComposition: [
        {
          ...baseConfig.questionComposition![0],
          questionCount: 9,
        },
      ],
    };
    const contract = buildGenerationContract(config, generateBlueprint(config));

    expect(contract.apiEstimate.plannedCalls).toBe(3);
    expect(contract.apiEstimate.riskReasons.join(" ")).toMatch(/chunked focused batches/);
  });
});
