import {
  buildQuestionCompositionPlan,
  type SectionCompositionPlan,
} from "@/lib/composition";
import { difficultyTargetsForCount } from "@/lib/difficulty-protocol";
import {
  generateQuestionsForSection,
} from "@/lib/generator";
import { isAIProviderUnavailableError } from "@/lib/error-classification";
import { analyzeConceptSourceQuality, retrieveConcepts } from "@/lib/retriever";
import { generateSourceBackedFallbackQuestions } from "@/lib/source-backed-fallback";
import type { DirectAIProvider } from "@/lib/gemini";
import type {
  Blueprint,
  ConceptData,
  GeneratedQuestion,
  PaperConfig,
  QuestionCompositionItem,
} from "@/types";
import type { GenerationArchitecturePlan } from "@/lib/question-planning";

export interface CoverageGenerationDiagnostic {
  subject: string;
  chapterId?: number;
  chapterName?: string;
  topicId?: number;
  topicName?: string;
  questionType: string;
  requestedQuestions: number;
  generatedQuestions: number;
  generationMode: "ai" | "source_backed_provider_outage";
  sourceConcepts: number;
  sourceTextChunks: number;
  sourceQuality: ReturnType<typeof analyzeConceptSourceQuality>["quality"];
}

export async function generateCoveragePlannedQuestions({
  blueprint,
  concepts,
  config,
  generationPlan,
  existingQuestions = [],
  acceptedQuestions = [],
  generationNonce,
  cooldownScope,
  healthyProviders,
  allowPartial = true,
  signal,
  shouldStop,
  onProgress,
  onBatchComplete,
}: {
  blueprint: Blueprint;
  concepts: ConceptData[];
  config: PaperConfig;
  generationPlan?: GenerationArchitecturePlan;
  existingQuestions?: GeneratedQuestion[];
  acceptedQuestions?: GeneratedQuestion[];
  generationNonce?: string;
  cooldownScope?: string;
  healthyProviders?: DirectAIProvider[];
  allowPartial?: boolean;
  signal?: AbortSignal;
  shouldStop?: (generatedQuestionCount: number) => boolean;
  onProgress?: (details: {
    label: string;
    generated: number;
    total: number;
    diagnostic: CoverageGenerationDiagnostic;
  }) => void;
  onBatchComplete?: (details: {
    generated: number;
    total: number;
    batch: number;
    batches: number;
  }) => void;
}) {
  const remainingPlan = buildRemainingCoveragePlan(
    blueprint,
    config.questionComposition ?? [],
    acceptedQuestions,
  );
  const generatedQuestions: GeneratedQuestion[] = [];
  const diagnostics: CoverageGenerationDiagnostic[] = [];
  const totalRequested = remainingPlan.reduce(
    (sum, sectionPlan) =>
      sum + sectionPlan.allocations.reduce((inner, item) => inner + item.count, 0),
    0,
  );
  let stoppedForBudget = false;
  const providersUnavailableBeforeCall =
    Array.isArray(healthyProviders) && healthyProviders.length === 0;

  for (const sectionPlan of remainingPlan) {
    for (const allocation of sectionPlan.allocations) {
      if (allocation.count <= 0) continue;
      if (shouldStop?.(existingQuestions.length + generatedQuestions.length)) {
        stoppedForBudget = true;
        return { questions: generatedQuestions, diagnostics, stoppedForBudget };
      }

      const coverage = await retrieveConceptsForCoverageUnit(
        concepts,
        allocation.item,
        config,
      );
      const focusedSection = {
        ...sectionPlan.section,
        count: allocation.count,
        totalMarks: allocation.count * sectionPlan.section.marksPerQuestion,
      };
      const label = coverageLabel(allocation.item);
      let generationMode: CoverageGenerationDiagnostic["generationMode"] = "ai";
      let taggedQuestions: GeneratedQuestion[] = [];
      const existingForBatch = [...existingQuestions, ...generatedQuestions];

      if (providersUnavailableBeforeCall) {
        generationMode = "source_backed_provider_outage";
        taggedQuestions = sourceBackedCoverageQuestions({
          allocation: allocation.item,
          section: focusedSection,
          concepts: coverage.concepts,
          config,
          existingQuestions: existingForBatch,
        });
      } else {
        try {
          const batchQuestions = await generateQuestionsForSection(
            focusedSection,
            coverage.context,
            config,
            {
              allowPartial,
              availableTopics: coverage.availableTopics,
              coverageFocus: allocation.item,
              existingQuestions: existingForBatch,
              generationPlan,
              difficultyTargets: difficultyTargetsForCount(
                config.difficulty,
                allocation.count,
                sectionPlan.section.questionType,
              ),
              generationNonce: `${generationNonce ?? "coverage"}:coverage:${diagnostics.length + 1}`,
              cooldownScope,
              healthyProviders,
              signal,
              onBatchComplete,
            },
          );
          taggedQuestions = tagQuestionsWithCoverage(
            batchQuestions,
            allocation.item,
          );
        } catch (error) {
          if (!isAIProviderUnavailableError(error)) throw error;
          generationMode = "source_backed_provider_outage";
          taggedQuestions = sourceBackedCoverageQuestions({
            allocation: allocation.item,
            section: focusedSection,
            concepts: coverage.concepts,
            config,
            existingQuestions: existingForBatch,
          });
        }
      }

      const toppedUpQuestions =
        generationMode === "ai"
          ? topUpCoverageQuestions({
              questions: taggedQuestions,
              allocation: allocation.item,
              section: focusedSection,
              concepts: coverage.concepts,
              config,
              existingQuestions: [
                ...existingForBatch,
                ...taggedQuestions,
              ],
            })
          : taggedQuestions;
      const acceptedBatch = toppedUpQuestions.slice(0, allocation.count);
      generatedQuestions.push(...acceptedBatch);

      const diagnostic: CoverageGenerationDiagnostic = {
        subject: allocation.item.subject,
        chapterId: allocation.item.chapterId,
        chapterName: allocation.item.chapterName,
        topicId: allocation.item.topicId,
        topicName: allocation.item.topicName,
        questionType: sectionPlan.section.questionType,
        requestedQuestions: allocation.count,
        generatedQuestions: acceptedBatch.length,
        generationMode,
        sourceConcepts: coverage.concepts.length,
        sourceTextChunks: coverage.sourceQuality.sourceTextChunks,
        sourceQuality: coverage.sourceQuality.quality,
      };
      diagnostics.push(diagnostic);
      onProgress?.({
        label,
        generated: Math.min(
          generatedQuestions.length,
          totalRequested,
        ),
        total: totalRequested,
        diagnostic,
      });
    }
  }

  return { questions: generatedQuestions, diagnostics, stoppedForBudget };
}

export function buildRemainingCoveragePlan(
  blueprint: Blueprint,
  composition: QuestionCompositionItem[],
  acceptedQuestions: GeneratedQuestion[] = [],
): SectionCompositionPlan[] {
  return buildQuestionCompositionPlan(blueprint, composition)
    .map((sectionPlan) => ({
      section: sectionPlan.section,
      allocations: sectionPlan.allocations
        .map((allocation) => {
          const alreadyAccepted = acceptedQuestions.filter((question) =>
            questionMatchesAllocation(
              question,
              sectionPlan.section.questionType,
              allocation.item,
            ),
          ).length;

          return {
            item: allocation.item,
            count: Math.max(0, allocation.count - alreadyAccepted),
          };
        })
        .filter((allocation) => allocation.count > 0),
    }))
    .filter((sectionPlan) => sectionPlan.allocations.length > 0);
}

export async function retrieveConceptsForCoverageUnit(
  concepts: ConceptData[],
  item: QuestionCompositionItem,
  config: PaperConfig,
) {
  const focusedConcepts = conceptsForCoverageItem(concepts, item);
  if (!hasSelectedSourceText(focusedConcepts)) {
    throw new Error(
      `Selected source text is not enough for ${coverageLabel(item)}. Select more chapters/topics, upload stronger source text, or lower this coverage count.`,
    );
  }

  const context = await retrieveConcepts(
    focusedConcepts,
    config.difficulty,
    config.bloomDistribution,
  );
  if (!context.trim()) {
    throw new Error(
      `Selected source text is not enough for ${coverageLabel(item)}. No focused TXT/PDF context could be built.`,
    );
  }

  return {
    concepts: focusedConcepts,
    context,
    availableTopics: conceptTopics(focusedConcepts),
    sourceQuality: analyzeConceptSourceQuality(focusedConcepts),
  };
}

export function coverageDiagnosticsForFinalQuestions(
  config: PaperConfig,
  blueprint: Blueprint,
  finalQuestions: GeneratedQuestion[],
  generationDiagnostics: CoverageGenerationDiagnostic[] = [],
) {
  const planned = buildQuestionCompositionPlan(
    blueprint,
    config.questionComposition ?? [],
  ).flatMap((sectionPlan) =>
    sectionPlan.allocations.map((allocation) => ({
      subject: allocation.item.subject,
      chapterId: allocation.item.chapterId,
      chapterName: allocation.item.chapterName,
      topicId: allocation.item.topicId,
      topicName: allocation.item.topicName,
      questionType: sectionPlan.section.questionType,
      requestedQuestions: allocation.count,
      finalQuestions: finalQuestions.filter((question) =>
        questionMatchesAllocation(
          question,
          sectionPlan.section.questionType,
          allocation.item,
        ),
      ).length,
    })),
  );

  return {
    strict: true,
    generated: generationDiagnostics,
    planned,
  };
}

function topUpCoverageQuestions({
  questions,
  allocation,
  section,
  concepts,
  config,
  existingQuestions,
}: {
  questions: GeneratedQuestion[];
  allocation: QuestionCompositionItem;
  section: Blueprint["sections"][number];
  concepts: ConceptData[];
  config: PaperConfig;
  existingQuestions: GeneratedQuestion[];
}) {
  if (questions.length >= section.count) return questions;

  const missing = section.count - questions.length;
  const fallback = sourceBackedCoverageQuestions({
    allocation,
    section: {
      ...section,
      count: missing,
      totalMarks: missing * section.marksPerQuestion,
    },
    concepts,
    config,
    existingQuestions,
  });

  return [
    ...questions,
    ...fallback,
  ];
}

function sourceBackedCoverageQuestions({
  allocation,
  section,
  concepts,
  config,
  existingQuestions,
}: {
  allocation: QuestionCompositionItem;
  section: Blueprint["sections"][number];
  concepts: ConceptData[];
  config: PaperConfig;
  existingQuestions: GeneratedQuestion[];
}) {
  const fallback = generateSourceBackedFallbackQuestions(
    [section],
    concepts,
    config,
    {
      existingQuestions,
      startIndex: existingQuestions.length + 101,
    },
  );

  return tagQuestionsWithCoverage(fallback, allocation);
}

function conceptsForCoverageItem(
  concepts: ConceptData[],
  item: QuestionCompositionItem,
) {
  const subjectMatched = concepts.filter((concept) =>
    conceptMatchesSubject(concept, item),
  );

  if (item.topicId) {
    const byTopicId = subjectMatched.filter(
      (concept) => concept.topicId === item.topicId,
    );
    if (byTopicId.length) return byTopicId;
  }

  if (item.topicName) {
    const topicName = item.topicName.trim().toLowerCase();
    const byTopicName = subjectMatched.filter(
      (concept) => concept.topicName.trim().toLowerCase() === topicName,
    );
    if (byTopicName.length) return byTopicName;
  }

  if (item.chapterId) {
    const byChapter = subjectMatched.filter(
      (concept) => concept.chapterId === item.chapterId,
    );
    if (byChapter.length) return byChapter;
  }

  return subjectMatched;
}

function tagQuestionsWithCoverage(
  questions: GeneratedQuestion[],
  item: QuestionCompositionItem,
) {
  return questions.map((question) => ({
    ...question,
    subject: item.subject || question.subject,
    chapterId: item.chapterId ?? question.chapterId,
    topicId: item.topicId ?? question.topicId,
    topic: item.topicName ?? question.topic,
  }));
}

function questionMatchesAllocation(
  question: GeneratedQuestion,
  questionType: string,
  item: QuestionCompositionItem,
) {
  if (question.type !== questionType) return false;
  if (
    item.subject &&
    question.subject &&
    item.subject.trim().toLowerCase() !== question.subject.trim().toLowerCase()
  ) {
    return false;
  }
  if (item.topicId !== undefined && question.topicId !== item.topicId) return false;
  if (
    item.topicName &&
    question.topic &&
    item.topicName.trim().toLowerCase() !== question.topic.trim().toLowerCase()
  ) {
    return false;
  }
  if (item.chapterId !== undefined && question.chapterId !== item.chapterId) {
    return false;
  }

  return true;
}

function conceptMatchesSubject(
  concept: ConceptData,
  item: QuestionCompositionItem,
) {
  if (!item.subject || !concept.subject) return true;
  return concept.subject.trim().toLowerCase() === item.subject.trim().toLowerCase();
}

function hasSelectedSourceText(concepts: ConceptData[]) {
  return concepts.some((concept) => {
    const text = concept.text.replace(/\s+/g, " ").trim();
    return (
      (concept.source === "ncert_txt" || concept.source === "pdf") &&
      text.length >= 80
    );
  });
}

function conceptTopics(concepts: ConceptData[]) {
  return Array.from(
    new Set(
      concepts
        .map((concept) => concept.topicName?.trim())
        .filter((topic): topic is string => Boolean(topic)),
    ),
  );
}

function coverageLabel(item: QuestionCompositionItem) {
  const parts = [
    item.subject,
    item.chapterName ?? (item.chapterId ? `chapter ${item.chapterId}` : ""),
    item.topicName,
  ].filter(Boolean);

  return parts.join(": ");
}
