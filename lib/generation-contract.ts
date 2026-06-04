import { questionTypeMeta } from "@/lib/edutest-data";
import {
  buildQuestionCompositionPlan,
  compositionKey,
} from "@/lib/composition";
import type {
  AIProvider,
  Blueprint,
  Difficulty,
  GenerationContract,
  GenerationRiskLevel,
  PaperConfig,
  QuestionType,
} from "@/types";

interface BuildGenerationContractOptions {
  availableTopics?: string[];
  candidateQuestions?: number;
  sourceTextChunks?: number;
}

export function buildGenerationContract(
  config: PaperConfig,
  blueprint: Blueprint,
  options: BuildGenerationContractOptions = {},
): GenerationContract {
  const subjects = config.subjects?.length ? config.subjects : [config.subject];
  const source = {
    mode: config.sourceMode ?? "curriculum",
    kind:
      config.sourceMode === "pdf_upload"
        ? ("UPLOADED_PDF" as const)
        : ("NCERT_BOOKS_TXT" as const),
    classNum: config.classNum,
    subject: config.subject,
    subjects,
    chapters: selectedChaptersBySubject(config),
    chapterIds: [...config.chapterIds],
    topicIds: [...(config.topicIds ?? [])],
    allowedTopics: unique(options.availableTopics ?? []),
    pdfTitle: config.pdfSource?.title,
    pdfFocusPrompt: config.pdfSource?.focusPrompt,
  };
  const sections = blueprint.sections.map((section) => ({
    name: section.name,
    type: section.questionType,
    label: questionTypeLabel(section.questionType),
    count: section.count,
    marksPerQuestion: section.marksPerQuestion,
    totalMarks: section.totalMarks,
  }));
  const apiEstimate = estimateApiUse(config, blueprint, {
    candidateQuestions: options.candidateQuestions,
    sourceTextChunks: options.sourceTextChunks,
  });
  const contractWithoutHash = {
    source,
    paper: {
      totalQuestions: blueprint.totalQuestions,
      totalMarks: blueprint.totalMarks,
      durationMin: config.duration,
      examType: config.examType,
      difficulty: config.difficulty,
      generationMode: normalizeGenerationMode(config.generationMode),
      bloomDistribution: config.bloomDistribution,
      aiProvider: config.aiProvider ?? "AUTO",
      integrationPrompt: normalizeIntegrationPrompt(config.integrationPrompt),
    },
    sections,
    apiEstimate,
  };

  return {
    hash: stableHash(contractWithoutHash),
    ...contractWithoutHash,
  };
}

export function generationContractPromptPayload(contract: GenerationContract) {
  return {
    prompt_contract_hash: contract.hash,
    class: contract.source.classNum,
    subjects: contract.source.subjects,
    source_mode: contract.source.mode,
    source_kind: contract.source.kind,
    chapters: contract.source.chapters,
    topics: contract.source.allowedTopics,
    uploaded_pdf_title: contract.source.pdfTitle ?? null,
    uploaded_pdf_focus_prompt: contract.source.pdfFocusPrompt ?? null,
    total_questions: contract.paper.totalQuestions,
    total_marks: contract.paper.totalMarks,
    duration_min: contract.paper.durationMin,
    exam_type: contract.paper.examType,
    difficulty: contract.paper.difficulty,
    generation_mode: contract.paper.generationMode,
    generation_mode_label:
      contract.paper.generationMode === "source_exact"
        ? "NCERT/PDF Source"
        : "Fresh Questions",
    blooms: contract.paper.bloomDistribution,
    ai_provider: contract.paper.aiProvider,
    integration_prompt: contract.paper.integrationPrompt ?? "",
    question_types: questionTypeCounts(contract),
    question_type_counts: questionTypeCounts(contract),
    sections: contract.sections.map((section) => ({
      name: section.name,
      type: section.type,
      label: section.label,
      count: section.count,
      marks_per_question: section.marksPerQuestion,
      total_marks: section.totalMarks,
    })),
    api_estimate: contract.apiEstimate,
  };
}

function selectedChaptersBySubject(config: PaperConfig) {
  if (config.subjectSelections?.length) {
    return config.subjectSelections.reduce<Record<string, number[]>>((acc, selection) => {
      acc[selection.subject] = [...selection.chapterIds];
      return acc;
    }, {});
  }

  return { [config.subject]: [...config.chapterIds] };
}

function questionTypeCounts(contract: GenerationContract) {
  const counts = questionTypeMeta.reduce<Record<QuestionType, number>>((acc, item) => {
    acc[item.type] = 0;
    return acc;
  }, {} as Record<QuestionType, number>);

  return contract.sections.reduce<Record<QuestionType, number>>((acc, section) => {
    acc[section.type] = section.count;
    return acc;
  }, counts);
}

function questionTypeLabel(type: QuestionType) {
  return questionTypeMeta.find((item) => item.type === type)?.label ?? type;
}

function estimateApiUse(
  config: PaperConfig,
  blueprint: Blueprint,
  options: Pick<BuildGenerationContractOptions, "candidateQuestions" | "sourceTextChunks">,
): GenerationContract["apiEstimate"] {
  const compositionRows =
    config.questionComposition?.filter((item) => item.questionCount > 0).length ?? 0;
  const generationCalls = estimateCoverageGenerationCalls(config, blueprint);
  const repairAllowance = Math.min(3, Math.max(1, Math.ceil(blueprint.totalQuestions / 20)));
  const candidateQuestions = options.candidateQuestions ?? blueprint.totalQuestions;
  const baseInput = 1200 + blueprint.totalQuestions * 180 + blueprint.sections.length * 320;
  const sourceInput = Math.max(0, options.sourceTextChunks ?? 0) * 220;
  const difficultyMultiplier = difficultyTokenMultiplier(config.difficulty);
  const estimatedInputMin = Math.round((baseInput + sourceInput) * difficultyMultiplier);
  const estimatedInputMax = Math.round(
    estimatedInputMin * Math.max(1.2, generationCalls > 1 ? 1.45 : 1.25),
  );
  const estimatedOutputMin = Math.round(candidateQuestions * 180 * difficultyMultiplier);
  const estimatedOutputMax = Math.round(candidateQuestions * 310 * difficultyMultiplier);
  const riskReasons = estimateRiskReasons({
    config,
    blueprint,
    plannedCalls: generationCalls,
    sourceTextChunks: options.sourceTextChunks,
  });
  const riskLevel = estimateRiskLevel(riskReasons, generationCalls, blueprint.totalQuestions);

  return {
    plannedCalls: generationCalls,
    repairAllowance,
    estimatedInputTokens: { min: estimatedInputMin, max: estimatedInputMax },
    estimatedOutputTokens: { min: estimatedOutputMin, max: estimatedOutputMax },
    riskLevel,
    riskReasons,
    providerFallbackNote:
      (config.aiProvider ?? "AUTO") === "AUTO"
        ? "Auto can try the next healthy provider if one fails."
        : "A selected provider may need Retry Auto Fallback if it runs out of quota or times out.",
  };
}

function difficultyTokenMultiplier(difficulty: Difficulty) {
  if (difficulty === "ABSURD") return 1.35;
  if (difficulty === "HARD") return 1.2;
  if (difficulty === "MEDIUM") return 1.08;
  return 1;
}

function estimateRiskReasons({
  config,
  blueprint,
  plannedCalls,
  sourceTextChunks,
}: {
  config: PaperConfig;
  blueprint: Blueprint;
  plannedCalls: number;
  sourceTextChunks?: number;
}) {
  const reasons: string[] = [];
  const compositionRows =
    config.questionComposition?.filter((item) => item.questionCount > 0).length ?? 0;

  if (blueprint.totalQuestions >= 60) {
    reasons.push("High question count may take longer and consume more provider quota.");
  } else if (blueprint.totalQuestions >= 40) {
    reasons.push("Medium-high question count may need more generation time.");
  }
  if (compositionRows > 0 && blueprint.sections.length > coverageSectionsPerAiCall()) {
    reasons.push(
      "Many question formats will run as chunked focused batches so the server can pause and continue safely.",
    );
  }
  if (plannedCalls >= 12) {
    reasons.push("Many chunked focused batches are planned from the selected coverage split.");
  } else if (compositionRows >= 6) {
    reasons.push("Several S/C/T coverage rows will be generated separately.");
  }
  if (blueprint.sections.length >= 7) {
    reasons.push("Many question formats increase structure and validation work.");
  }
  if (config.difficulty === "ABSURD" || config.difficulty === "HARD") {
    reasons.push("Higher difficulty requires deeper reasoning and more validation.");
  }
  if (config.sourceMode === "pdf_upload" && (config.pdfSource?.conceptsCount ?? 0) < 8) {
    reasons.push("Uploaded PDF has limited extracted concepts for the requested paper.");
  }
  if (sourceTextChunks !== undefined && sourceTextChunks < 2) {
    reasons.push("Selected source text looks thin for grounded generation.");
  }
  if (!reasons.length) {
    reasons.push("Balanced setup for normal generation.");
  }

  return reasons;
}

function estimateRiskLevel(
  reasons: string[],
  plannedCalls: number,
  totalQuestions: number,
): GenerationRiskLevel {
  if (
    totalQuestions >= 60 ||
    plannedCalls >= 12 ||
    reasons.some((reason) => /limited|thin|Higher difficulty/i.test(reason))
  ) {
    return "high";
  }
  if (totalQuestions >= 40 || plannedCalls >= 6 || reasons.length > 1) {
    return "medium";
  }
  return "low";
}

function estimateCoverageGenerationCalls(config: PaperConfig, blueprint: Blueprint) {
  const composition = config.questionComposition ?? [];
  if (!composition.some((item) => item.questionCount > 0)) return 1;

  const groupedSectionCounts = new Map<string, number>();
  buildQuestionCompositionPlan(blueprint, composition).forEach((sectionPlan) => {
    sectionPlan.allocations.forEach((allocation) => {
      if (allocation.count <= 0) return;
      const key = compositionKey(allocation.item);
      groupedSectionCounts.set(key, (groupedSectionCounts.get(key) ?? 0) + 1);
    });
  });

  const perCall = coverageSectionsPerAiCall();
  const calls = Array.from(groupedSectionCounts.values()).reduce(
    (sum, sectionCount) => sum + Math.ceil(sectionCount / perCall),
    0,
  );

  return Math.max(1, calls);
}

function coverageSectionsPerAiCall() {
  const configured = Number(process.env.EDUTEST_COVERAGE_SECTIONS_PER_AI_CALL);
  if (Number.isFinite(configured) && configured >= 1 && configured <= 8) {
    return Math.floor(configured);
  }

  return 4;
}

function stableHash(value: unknown) {
  const text = stableStringify(value);
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.keys(value as Record<string, unknown>)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify((value as Record<string, unknown>)[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function unique(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function normalizeIntegrationPrompt(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed.slice(0, 1200) : undefined;
}

function normalizeGenerationMode(
  value: PaperConfig["generationMode"],
): NonNullable<PaperConfig["generationMode"]> {
  return value === "source_exact" ? "source_exact" : "fresh";
}
