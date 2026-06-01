import { NextRequest } from "next/server";
import {
  jsonError,
  parseJsonWithSchema,
  requireAuthenticatedUser,
} from "@/lib/api-security";
import {
  generateBlueprint,
} from "@/lib/blueprint";
import {
  buildQuestionCompositionPlan,
  normalizeQuestionComposition,
} from "@/lib/composition";
import {
  allocateDifficultyTargetsForSections,
  normalizeBloomDistributionForDifficulty,
} from "@/lib/difficulty-protocol";
import { assertDemoModeAllowed, demoMetadata } from "@/lib/demo-mode";
import { compactAiProviderFailureMessage } from "@/lib/error-classification";
import { getChapterContent } from "@/lib/extractor";
import { buildGenerationManifest } from "@/lib/generation-manifest";
import { getConfiguredProviders } from "@/lib/gemini";
import {
  generateDemoQuestions,
  generateQuestionsForSection,
} from "@/lib/generator";
import {
  createPaperInDB,
  markPaperDemoMode,
  markPaperReady,
  saveQuestionsAndLink,
  setPaperGenerationManifest,
  updatePaperDefinition,
  updatePaperStatus,
} from "@/lib/paper-store";
import { getUploadedPdfSourceConcepts } from "@/lib/pdf-source-store";
import {
  buildGenerationArchitecturePlan,
  type GenerationArchitecturePlan,
} from "@/lib/question-planning";
import { retrieveConcepts } from "@/lib/retriever";
import { generationRequestSchema } from "@/lib/schemas";
import { validatePaperKeepingValidQuestions } from "@/lib/validator";
import type {
  Blueprint,
  BlueprintSection,
  ConceptData,
  GeneratedQuestion,
  AITask,
  PaperConfig,
  QuestionCompositionItem,
  QuestionType,
} from "@/types";

export const runtime = "nodejs";
export const maxDuration = 60;

type LocalFallbackContext = {
  effectiveConfig: PaperConfig;
  blueprint: Blueprint;
  scopedConcepts: ConceptData[];
};

export async function POST(request: NextRequest) {
  const auth = await requireAuthenticatedUser(request);
  if (auth.response) return auth.response;

  const parsed = await parseJsonWithSchema(request, generationRequestSchema);
  if (parsed.response) return parsed.response;

  const {
    idempotencyKey: requestedKey,
    demoMode,
    salvageInvalidQuestions,
    ...config
  } = parsed.data;
  const salvageMode = salvageInvalidQuestions !== false;
  if (demoMode) {
    try {
      assertDemoModeAllowed(true);
    } catch (error) {
      return jsonError(
        error instanceof Error ? error.message : "Demo mode is unavailable.",
        403,
      );
    }
  }

  const generationJobId = crypto.randomUUID();
  const headerKey = request.headers.get("idempotency-key")?.trim();
  const idempotencyKey =
    requestedKey ??
    (headerKey && headerKey.length >= 8 && headerKey.length <= 128
      ? headerKey
      : null) ??
    `paper:${generationJobId}`;
  const encoder = new TextEncoder();
  let paperId: number | null = null;
  const providerCooldownScope = `user:${auth.user.id}`;

  const stream = new ReadableStream({
    async start(controller) {
      let streamClosed = false;
      const generationSignalController = new AbortController();
      const generationDeadlineTimer = setTimeout(() => {
        generationSignalController.abort(generationDeadlineError());
      }, generationServerBudgetMs());
      const abortGenerationFromClient = () => {
        generationSignalController.abort(new Error("Generation cancelled by client."));
      };
      request.signal.addEventListener("abort", abortGenerationFromClient, {
        once: true,
      });
      const generationSignal = generationSignalController.signal;
      const send = (data: object, event = "progress") => {
        if (streamClosed || request.signal.aborted) return false;

        try {
          controller.enqueue(
            encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
          );
          return true;
        } catch {
          streamClosed = true;
          return false;
        }
      };
      const close = () => {
        if (streamClosed) return;
        streamClosed = true;
        try {
          controller.close();
        } catch {
          // Client already disconnected.
        }
      };
      const assertActive = () => {
        if (streamClosed || request.signal.aborted) {
          throw new Error("Generation cancelled by client.");
        }
        if (generationSignal.aborted) {
          throw abortSignalError(generationSignal);
        }
      };
      let localFallbackContext: LocalFallbackContext | null = null;

      try {
        assertActive();
        send({
          step: 1,
          pct: 5,
          progress: 5,
          msg: "Phase 1 - Configuration Understanding: reading selected class, subjects, chapters, formats, and target.",
        });

        assertActive();
        send({
          step: 2,
          pct: 15,
          progress: 15,
          msg:
            config.sourceMode === "pdf_upload"
              ? "Phase 2 - Syllabus Intelligence: loading uploaded PDF concepts."
              : "Phase 2 - Syllabus Intelligence: loading chapter concepts.",
        });
        let effectiveConfig = config as PaperConfig;
        const uploadedPdf =
          effectiveConfig.sourceMode === "pdf_upload"
            ? await loadUploadedPdfSource(effectiveConfig.pdfSourceId, auth.user.id)
            : null;
        const allowExplicitDemoFallback = Boolean(demoMode);
        const concepts = uploadedPdf
          ? uploadedPdf.concepts
          : await getChapterContent(
                effectiveConfig.chapterIds,
                effectiveConfig.subject,
                effectiveConfig.classNum,
                {
                  allowDemoFallback: allowExplicitDemoFallback,
                  allowCurriculumFallback: true,
                  requireKnownSource: !allowExplicitDemoFallback,
                },
              );

        if (uploadedPdf) {
          effectiveConfig = {
            ...effectiveConfig,
            sourceMode: "pdf_upload",
            pdfSourceId: uploadedPdf.source.id,
            pdfSource: uploadedPdf.source,
            subject: uploadedPdf.source.subject || "Uploaded PDF",
            subjects: [uploadedPdf.source.subject || "Uploaded PDF"],
            classNum: uploadedPdf.source.classNum ?? effectiveConfig.classNum,
            chapterIds: [],
            topicIds: [],
            subjectSelections: [],
          };
        }

        const selectionAwareConcepts = enrichConceptsWithSelectionMetadata(
          concepts,
          effectiveConfig,
        );
        const scopedConcepts = applySelectedTopicScope(
          selectionAwareConcepts,
          effectiveConfig,
        );
        const paperQuestionSource = scopedConcepts.some(
          (concept) => concept.source === "pdf",
        )
          ? "pdf"
          : "curriculum";
        const composition = normalizeServerQuestionComposition(
          effectiveConfig,
          scopedConcepts,
        );
        effectiveConfig = {
          ...effectiveConfig,
          questionComposition: composition,
          bloomDistribution: normalizeBloomDistributionForDifficulty(
            effectiveConfig.difficulty,
            effectiveConfig.bloomDistribution,
          ),
        };
        const blueprint = generateBlueprint(effectiveConfig);
        const conceptContext = await retrieveConcepts(
          scopedConcepts,
          effectiveConfig.difficulty,
          effectiveConfig.bloomDistribution,
        );
        const availableTopics = conceptTopics(scopedConcepts);
        const generationPlan = buildGenerationArchitecturePlan(
          effectiveConfig,
          blueprint,
          scopedConcepts,
          composition,
        );
        const isDemoMode =
          effectiveConfig.sourceMode !== "pdf_upload" &&
          scopedConcepts.some((concept) => concept.source === "demo");

        assertActive();
        send({
          step: 3,
          pct: 25,
          progress: 25,
          msg: "Phase 3 - Question Planning: building blueprint, S/C/T split, and question intelligence.",
        });
        localFallbackContext = {
          effectiveConfig,
          blueprint,
          scopedConcepts,
        };
        const created = await createPaperInDB(effectiveConfig, blueprint, isDemoMode, {
          userId: auth.user.id,
          generationJobId,
          idempotencyKey,
        });
        paperId = created.paperId;

        if (created.reused) {
          if (created.status === "READY") {
            send(
              {
                error: true,
                code: "GENERATION_ALREADY_COMPLETED",
                msg: "This generation already completed. Start a new generation to create a fresh paper.",
                paperId: created.paperId,
                idempotencyKey,
              },
              "error",
            );
            close();
            return;
          }

          send(
            {
              error: true,
              code: "GENERATION_IN_PROGRESS",
              msg: "A generation job for this configuration is already running.",
              paperId: created.paperId,
              idempotencyKey,
            },
            "error",
          );
          close();
          return;
        }

        send({
          step: 3,
          pct: 30,
          progress: 30,
          msg: "Phase 3 - Question Planning: paper shell saved; starting AI question generation.",
          paperId,
          status: "GENERATING",
          idempotencyKey,
          generationJobId,
        });

        const allQuestions: GeneratedQuestion[] = [];
        let pct = 40;

        const compositionPlan = buildQuestionCompositionPlan(blueprint, composition);
        const generationUnits = compositionPlan.flatMap((plan) => {
          const allocations = plan.allocations.length
            ? plan.allocations
            : [{ item: null, count: plan.section.count }];

          return allocations
            .filter((allocation) => allocation.count > 0)
            .map((allocation) => ({
              questionType: plan.section.questionType,
              count: allocation.count,
            }));
        });
        const difficultyAllocations = allocateDifficultyTargetsForSections(
          effectiveConfig.difficulty,
          generationUnits,
        );
        let generationUnitIndex = 0;

        assertActive();
        send({
          step: 4,
          pct: 35,
          progress: 35,
          msg: "Phase 4 - Cognitive Distribution: applying Bloom levels from difficulty.",
        });

        for (const plan of compositionPlan) {
          const { section } = plan;
          assertActive();
          send({
            step: 5,
            pct,
            progress: pct,
            msg: `Phase 5 - Question Generation: generating ${section.questionType} questions...`,
          });
          const sectionQuestions: GeneratedQuestion[] = [];
          const allocations = plan.allocations.length
            ? plan.allocations
            : [{ item: null, count: section.count }];

          for (const allocation of allocations) {
            if (!allocation.count) continue;
            const difficultyTargets = difficultyAllocations[generationUnitIndex++];
            const allocationSection = {
              ...section,
              count: allocation.count,
              totalMarks: allocation.count * section.marksPerQuestion,
            };
            const allocationConcepts = allocation.item
              ? conceptsForCompositionItem(scopedConcepts, allocation.item)
              : scopedConcepts;
            const allocationContext = await retrieveConcepts(
              allocationConcepts,
              effectiveConfig.difficulty,
              effectiveConfig.bloomDistribution,
            );
            const allocationTopics = conceptTopics(allocationConcepts);

            if (allocation.item) {
              send({
                step: 5,
                pct,
                progress: pct,
                msg: `Phase 5 - Question Generation: ${allocation.count} ${section.questionType} from ${compositionLabel(allocation.item)}...`,
              });
            }

            const questions = await generateQuestionsForSection(
              allocationSection,
              allocationContext || conceptContext,
              effectiveConfig,
              {
                allowDemoFallback: allowExplicitDemoFallback,
                availableTopics: allocationTopics.length
                  ? allocationTopics
                  : availableTopics,
                allowPartial: salvageMode,
                coverageFocus: allocation.item ?? undefined,
                existingQuestions: allQuestions,
                generationPlan,
                difficultyTargets,
                generationNonce: `${generationJobId}:${generationUnitIndex}`,
                cooldownScope: providerCooldownScope,
                signal: generationSignal,
                onBatchComplete: (details) => {
                  send({
                    step: 5,
                    pct,
                    progress: pct,
                    msg: `Phase 5 - Question Generation: ${details.generated}/${details.total} ${section.questionType} ready...`,
                  });
                },
              },
            );

            const taggedQuestions = allocation.item
              ? tagQuestionsWithComposition(questions, allocation.item)
              : questions;
            sectionQuestions.push(...taggedQuestions);
            allQuestions.push(...taggedQuestions);
          }

          pct += Math.floor(60 / Math.max(1, blueprint.sections.length));
          send({
            step: 5,
            pct,
            progress: pct,
            msg: `Phase 5 - Question Generation: ${section.questionType} done (${sectionQuestions.length} questions)`,
          });
        }

        assertActive();
        send({
          step: 6,
          pct: 88,
          progress: 88,
          msg: "Phase 6 - Validation Engine: checking duplicates, marks, structure, and answers.",
        });
        const validation = await validateGeneratedPaperSkippingInvalid({
          questions: allQuestions,
          blueprint,
          config: effectiveConfig,
          conceptContext,
          availableTopics,
          generationPlan,
          allowDemoFallback: allowExplicitDemoFallback,
          generationNonce: generationJobId,
          cooldownScope: providerCooldownScope,
          signal: generationSignal,
          send,
        });
        const validated = validation.questions;
        effectiveConfig = validation.config;

        if (validation.replacedQuestions) {
          send({
            step: 6,
            pct: 92,
            progress: 92,
            msg: `Phase 6 - Validation Engine: replaced ${validation.replacedQuestions} invalid or duplicate question${validation.replacedQuestions === 1 ? "" : "s"} with valid alternatives.`,
          });
        } else if (validation.skipped.length) {
          send({
            step: 6,
            pct: 92,
            progress: 92,
            msg: `Phase 6 - Validation Engine: found ${validation.skipped.length} invalid or duplicate question${validation.skipped.length === 1 ? "" : "s"}.`,
          });
        }

        assertActive();
        send({
          step: 7,
          pct: 95,
          progress: 95,
          msg: "Phase 7 - Final Paper Composition: numbering sections and preparing layout.",
        });
        await updatePaperDefinition(paperId, effectiveConfig, validation.blueprint);
        const storedQuestions = await saveQuestionsAndLink(
          validated,
          paperId,
          isDemoMode ? "demo" : paperQuestionSource,
        );
        await markPaperReady(paperId);
        const manifest = buildGenerationManifest({
          config: effectiveConfig,
          blueprint: validation.blueprint,
          concepts: scopedConcepts,
          finalQuestions: storedQuestions,
          skippedQuestions: validation.remainingMissingQuestions,
          replacedQuestions: validation.replacedQuestions,
          validationWarnings: validation.skipped,
          generationJobId,
          idempotencyKey,
          taskProviderOrder: configuredTaskProviderOrder(),
        });
        await setPaperGenerationManifest(paperId, manifest, effectiveConfig);

        send(
          {
            step: 7,
            pct: 100,
            progress: 100,
            msg: "Phase 7 - Final Paper Composition: paper ready.",
            paperId,
            done: true,
            idempotencyKey,
            generationJobId,
            blueprint: validation.blueprint,
            questions: storedQuestions,
            skippedQuestions: validation.remainingMissingQuestions,
            replacedQuestions: validation.replacedQuestions,
            validationWarnings: validation.skipped,
            manifest,
            status: "READY",
            isDemoMode,
            createdAt: new Date().toISOString(),
            sessionOnly: Boolean(auth.user.isGuest),
            config: effectiveConfig,
            ...(isDemoMode ? demoMetadata() : {}),
          },
          "done",
        );
        close();
      } catch (error) {
        const message = request.signal.aborted
          ? "Generation cancelled by client."
          : error instanceof Error
            ? error.message
            : "Generation failed.";
        const code = generationErrorCode(error);
        console.error("[generate-paper] failed", {
          paperId,
          generationJobId,
          message,
        });

        if (
          localFallbackContext &&
          !request.signal.aborted &&
          shouldUseLocalGenerationFallback(Boolean(auth.user.isGuest), error)
        ) {
          try {
            if (!paperId) {
              const fallbackPaper = await createPaperInDB(
                localFallbackContext.effectiveConfig,
                localFallbackContext.blueprint,
                true,
                {
                  userId: auth.user.id,
                  generationJobId,
                  idempotencyKey,
                },
              );
              paperId = fallbackPaper.paperId;
            }

            await completeWithLocalGenerationFallback({
              paperId,
              context: localFallbackContext,
              generationJobId,
              idempotencyKey,
              originalError: error,
              sessionOnly: Boolean(auth.user.isGuest),
              send,
            });
            close();
            return;
          } catch (fallbackError) {
            console.error("[generate-paper] local fallback failed", {
              paperId,
              generationJobId,
              message:
                fallbackError instanceof Error
                  ? fallbackError.message
                  : String(fallbackError),
            });
          }
        }

        let paperStatusSaved = false;
        if (paperId) {
          try {
            await updatePaperStatus(paperId, "FAILED", {
              message,
              generationJobId,
              cancelled: request.signal.aborted,
            });
            paperStatusSaved = true;
          } catch (statusError) {
            console.error("[generate-paper] failed to mark paper FAILED", {
              paperId,
              generationJobId,
              message:
                statusError instanceof Error
                  ? statusError.message
                  : String(statusError),
            });
          }
        }

        if (!request.signal.aborted && !streamClosed) {
          send(
            {
              error: true,
              code,
              msg: generationErrorMessage(error),
              paperId,
              generationJobId,
              status: paperStatusSaved ? "FAILED" : undefined,
            },
            "error",
          );
        }
        close();
      } finally {
        clearTimeout(generationDeadlineTimer);
        request.signal.removeEventListener("abort", abortGenerationFromClient);
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform, no-store",
      Connection: "keep-alive",
    },
  });
}

async function completeWithLocalGenerationFallback({
  paperId,
  context,
  generationJobId,
  idempotencyKey,
  originalError,
  sessionOnly,
  send,
}: {
  paperId: number;
  context: LocalFallbackContext;
  generationJobId: string;
  idempotencyKey: string;
  originalError: unknown;
  sessionOnly: boolean;
  send: (data: object, event?: string) => void;
}) {
  send({
    step: 6,
    pct: 88,
    progress: 88,
    msg: "AI providers could not finish; using local guest fallback so the paper is still saved.",
    paperId,
    status: "GENERATING",
    generationJobId,
  });

  const generated = generateDemoQuestions(
    context.effectiveConfig,
    context.blueprint,
    {
      availableTopics: conceptTopics(context.scopedConcepts),
    },
  );
  const validation = validatePaperKeepingValidQuestions(
    generated,
    context.blueprint,
    context.effectiveConfig,
  );

  send({
    step: 7,
    pct: 95,
    progress: 95,
    msg: "Phase 7 - Final Paper Composition: saving fallback paper.",
    paperId,
    status: "GENERATING",
    generationJobId,
  });

  await updatePaperDefinition(paperId, validation.config, validation.blueprint);
  await markPaperDemoMode(paperId);
  const storedQuestions = await saveQuestionsAndLink(
    validation.questions,
    paperId,
    "demo",
  );
  await markPaperReady(paperId);
  const manifest = buildGenerationManifest({
    config: validation.config,
    blueprint: validation.blueprint,
    concepts: context.scopedConcepts,
    finalQuestions: storedQuestions,
    skippedQuestions: 0,
    replacedQuestions: 0,
    validationWarnings: [
      {
        type: "local-fallback",
        reason: generationErrorMessage(originalError),
      },
    ],
    generationJobId,
    idempotencyKey,
    taskProviderOrder: configuredTaskProviderOrder(),
  });
  await setPaperGenerationManifest(paperId, manifest, validation.config);

  send(
    {
      step: 7,
      pct: 100,
      progress: 100,
      msg: "Phase 7 - Final Paper Composition: fallback paper ready.",
      paperId,
      done: true,
      idempotencyKey,
      generationJobId,
      blueprint: validation.blueprint,
      questions: storedQuestions,
      skippedQuestions: 0,
      replacedQuestions: 0,
      validationWarnings: [
        {
          type: "local-fallback",
          reason: generationErrorMessage(originalError),
        },
      ],
      manifest,
      status: "READY",
      localFallback: true,
      createdAt: new Date().toISOString(),
      sessionOnly,
      config: validation.config,
      ...demoMetadata(),
    },
    "done",
  );
}

async function loadUploadedPdfSource(pdfSourceId: number | undefined, userId: number) {
  if (!pdfSourceId) {
    throw new Error("Uploaded PDF source is required.");
  }

  const uploaded = await getUploadedPdfSourceConcepts(pdfSourceId, userId);
  if (!uploaded) {
    throw new Error("Uploaded PDF source was not found.");
  }

  if (!uploaded.concepts.length) {
    throw new Error("Uploaded PDF source has no extracted concepts.");
  }

  return uploaded;
}

function applySelectedTopicScope(concepts: ConceptData[], config: PaperConfig) {
  if (!config.topicIds?.length) return concepts;

  const selectedTopicIds = new Set(config.topicIds);
  const scoped = concepts.filter(
    (concept) => concept.topicId && selectedTopicIds.has(concept.topicId),
  );

  return scoped.length ? scoped : concepts;
}

function enrichConceptsWithSelectionMetadata(
  concepts: ConceptData[],
  config: PaperConfig,
) {
  return concepts.map((concept) => {
    const selection = config.subjectSelections?.find((item) =>
      item.chapterIds.includes(concept.chapterId),
    );
    const singleSubject =
      config.subjects?.length === 1 ? config.subjects[0] : undefined;

    return {
      ...concept,
      subject: concept.subject ?? selection?.subject ?? singleSubject ?? config.subject,
      classNum: concept.classNum ?? config.classNum,
      chapterName:
        concept.chapterName ??
        (selection ? `${selection.subject} chapter ${concept.chapterId}` : undefined) ??
        config.pdfSource?.title,
    };
  });
}

function normalizeServerQuestionComposition(
  config: PaperConfig,
  concepts: ConceptData[],
) {
  const configuredUnits = (config.questionComposition ?? []).map((item) => ({
    subject: item.subject,
    chapterId: item.chapterId,
    chapterName: item.chapterName,
    topicId: item.topicId,
    topicName: item.topicName,
  }));
  const units = configuredUnits.length
    ? configuredUnits
    : compositionUnitsFromConcepts(config, concepts);

  return normalizeQuestionComposition(
    units,
    config.questionComposition ?? [],
    config.totalQuestions,
  );
}

function compositionUnitsFromConcepts(config: PaperConfig, concepts: ConceptData[]) {
  const byTopic = new Map<string, QuestionCompositionItem>();

  concepts.forEach((concept) => {
    const subject = subjectForConcept(config, concept);
    const key = [
      subject,
      concept.chapterId,
      concept.topicId ?? "",
      concept.topicName,
    ].join("|");

    if (byTopic.has(key)) return;
    byTopic.set(key, {
      subject,
      chapterId: concept.chapterId,
      chapterName: chapterLabel(config, concept),
      topicId: concept.topicId,
      topicName: concept.topicName,
      questionCount: 0,
    });
  });

  return Array.from(byTopic.values());
}

function conceptsForCompositionItem(
  concepts: ConceptData[],
  item: QuestionCompositionItem,
) {
  const byTopicId = item.topicId
    ? concepts.filter(
        (concept) =>
          concept.topicId === item.topicId &&
          conceptMatchesCompositionSubject(concept, item),
      )
    : [];
  if (byTopicId.length) return byTopicId;

  const byTopicName = item.topicName
    ? concepts.filter(
        (concept) =>
          conceptMatchesCompositionSubject(concept, item) &&
          concept.topicName.trim().toLowerCase() ===
          item.topicName?.trim().toLowerCase(),
      )
    : [];
  if (byTopicName.length) return byTopicName;

  const byChapter = item.chapterId
    ? concepts.filter(
        (concept) =>
          concept.chapterId === item.chapterId &&
          conceptMatchesCompositionSubject(concept, item),
      )
    : [];

  return byChapter.length ? byChapter : concepts;
}

function conceptMatchesCompositionSubject(
  concept: ConceptData,
  item: QuestionCompositionItem,
) {
  if (!item.subject || !concept.subject) return true;
  return concept.subject.trim().toLowerCase() === item.subject.trim().toLowerCase();
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

function tagQuestionsWithComposition(
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

function compositionLabel(item: QuestionCompositionItem) {
  return item.topicName ?? item.chapterName ?? item.subject;
}

function subjectForConcept(config: PaperConfig, concept: ConceptData) {
  const selection = config.subjectSelections?.find((item) =>
    item.chapterIds.includes(concept.chapterId),
  );
  return concept.subject ?? selection?.subject ?? config.subject;
}

function chapterLabel(config: PaperConfig, concept: ConceptData) {
  if (concept.chapterName) return concept.chapterName;

  const selection = config.subjectSelections?.find((item) =>
    item.chapterIds.includes(concept.chapterId),
  );
  return selection
    ? `${selection.subject} chapter ${concept.chapterId}`
    : config.pdfSource?.title ?? `Chapter ${concept.chapterId}`;
}

function generationErrorMessage(error: unknown) {
  const message =
    error instanceof Error ? error.message : "Generation failed. Please try again.";

  if (/SERVER_GENERATION_TIME_BUDGET_EXCEEDED|Vercel function time budget|server time budget/i.test(message)) {
    return "Generation reached the deployment time limit before AI could finish. The app will use guest fallback when possible; lower the question count if this repeats.";
  }

  if (
    /GoogleGenerativeAI|generativelanguage\.googleapis\.com|503|Service Unavailable|high demand/i.test(
      message,
    )
  ) {
    return "The selected AI provider is temporarily busy. I tried configured backup models too. Please click Retry in a minute.";
  }

  if (/Set .*API_?KEY|Set at least one AI provider key|no AI provider key/i.test(message)) {
    return "No usable AI provider key is configured for Auto Fallback. Add at least one valid provider key, or choose a configured provider.";
  }

  if (/All configured AI providers failed/i.test(message)) {
    return compactAiProviderFailureMessage(message);
  }

  if (/401|403|unauthorized|api[_\s-]?key|invalid key|not allowed|permission/i.test(message)) {
    return "The selected AI provider key is missing, invalid, or not allowed. Use Auto Fallback or add a valid provider key.";
  }

  if (/invalid input syntax for type integer/i.test(message)) {
    return "The AI returned text where a numeric chapter or topic ID was expected. Please retry; invalid IDs are cleaned before saving now.";
  }

  if (/OpenRouter|Mistral|402|credit|quota|billing|can only afford|max_tokens/i.test(message)) {
    return "The selected AI provider does not have enough credits or quota for that request. Try Retry Auto, choose another AI engine, lower the question count, or add provider credits.";
  }

  if (/timeout|timed out|network|fetch failed|ECONNRESET|ENOTFOUND|ETIMEDOUT/i.test(message)) {
    return "The deployed server could not reach the AI provider or the provider timed out. Check Vercel API keys/credits, try Auto Fallback, lower the question count, or retry in a minute.";
  }

  if (/empty response|text instead of valid JSON|malformed JSON/i.test(message)) {
    return "The AI provider returned invalid output. Use Skip & Replace to keep valid questions and rebuild the paper where possible, or retry with Auto Fallback.";
  }

  return compactAiProviderFailureMessage(message);
}

function shouldUseLocalGenerationFallback(isGuest: boolean, error: unknown) {
  const configured = process.env.EDUTEST_LOCAL_GENERATION_FALLBACK;
  if (configured === "false") return false;
  if (configured === "true") return true;
  if (!isGuest) return false;

  const code = generationErrorCode(error);
  if (
    code === "PROVIDER_AUTO_FAILED" ||
    code === "PROVIDER_AUTH_ERROR" ||
    code === "PROVIDER_QUOTA_ERROR" ||
    code === "PROVIDER_NETWORK_ERROR" ||
    code === "GENERATION_CAN_SKIP_INVALID"
  ) {
    return true;
  }

  const message =
    error instanceof Error ? error.message : "Generation failed. Please try again.";
  return /AI provider|Auto Fallback|Gemini|Mistral|Cerebras|OpenRouter|Grok|DeepSeek|OpenAI|question generation|No valid generated questions|Could not replace/i.test(
    message,
  );
}

function generationErrorCode(error: unknown) {
  const message =
    error instanceof Error ? error.message : "Generation failed. Please try again.";

  if (/SERVER_GENERATION_TIME_BUDGET_EXCEEDED|Vercel function time budget|server time budget/i.test(message)) {
    return "PROVIDER_NETWORK_ERROR";
  }

  if (/All configured AI providers failed/i.test(message)) {
    return "PROVIDER_AUTO_FAILED";
  }

  if (/401|403|unauthorized|api[_\s-]?key|invalid key|not allowed|permission/i.test(message)) {
    return "PROVIDER_AUTH_ERROR";
  }

  if (/402|credit|quota|billing|can only afford|max_tokens/i.test(message)) {
    return "PROVIDER_QUOTA_ERROR";
  }

  if (/timeout|timed out|network|fetch failed|ECONNRESET|ENOTFOUND|ETIMEDOUT/i.test(message)) {
    return "PROVIDER_NETWORK_ERROR";
  }

  if (
    /Invalid .* question|No valid generated questions|no usable .* questions|generated \d+\/\d+ unique|Duplicate question|empty response|text instead of valid JSON|malformed JSON/i.test(
      message,
    )
  ) {
    return "GENERATION_CAN_SKIP_INVALID";
  }

  return undefined;
}

function generationServerBudgetMs() {
  const configured = Number(process.env.EDUTEST_SERVER_GENERATION_BUDGET_MS);
  if (Number.isFinite(configured) && configured >= 15_000 && configured <= 55_000) {
    return configured;
  }

  return 45_000;
}

function generationDeadlineError() {
  return new Error(
    "SERVER_GENERATION_TIME_BUDGET_EXCEEDED: Vercel function time budget is almost over.",
  );
}

function abortSignalError(signal: AbortSignal) {
  const reason = signal.reason as unknown;
  if (reason instanceof Error) {
    if (reason.name === "AbortError" || /operation was aborted/i.test(reason.message)) {
      return new Error("Generation cancelled by client.");
    }
    return reason;
  }
  if (typeof reason === "string" && reason.trim()) {
    return new Error(reason);
  }
  return new Error("Generation cancelled by client.");
}

async function validateGeneratedPaperSkippingInvalid({
  questions,
  blueprint,
  config,
  conceptContext,
  availableTopics,
  generationPlan,
  allowDemoFallback,
  generationNonce,
  cooldownScope,
  signal,
  send,
}: {
  questions: GeneratedQuestion[];
  blueprint: Blueprint;
  config: PaperConfig;
  conceptContext: string;
  availableTopics: string[];
  generationPlan: GenerationArchitecturePlan;
  allowDemoFallback: boolean;
  generationNonce: string;
  cooldownScope: string;
  signal: AbortSignal;
  send: (data: object, event?: string) => void;
}) {
  const candidates = [...questions];
  const initialValidation = validatePaperKeepingValidOrEmpty(
    candidates,
    blueprint,
    config,
  );
  let validation = initialValidation;
  const targetQuestionCount = blueprint.totalQuestions;
  const initialValidCount = countQuestionsForBlueprint(
    initialValidation.questions,
    blueprint,
  );
  const maxReplacementPasses = 2;

  for (let pass = 1; pass <= maxReplacementPasses; pass += 1) {
    const missingSections = missingSectionsForBlueprint(
      validation.questions,
      blueprint,
    );
    const missingCount = missingSections.reduce(
      (sum, section) => sum + section.count,
      0,
    );

    if (missingCount === 0) break;

    send({
      step: 6,
      pct: 89,
      progress: 89,
      msg: `Phase 6 - Validation Engine: replacing ${missingCount} invalid or duplicate question${missingCount === 1 ? "" : "s"} (pass ${pass}/${maxReplacementPasses}).`,
    });

    const replacements: GeneratedQuestion[] = [];
    for (const section of missingSections) {
      const sectionReplacements = await generateQuestionsForSection(
        section,
        conceptContext,
        config,
        {
          allowDemoFallback,
          availableTopics,
          allowPartial: true,
          partialMaxExtraAttempts: 4,
          existingQuestions: [...candidates, ...replacements],
          generationPlan,
          generationNonce: `${generationNonce}:replacement:${pass}`,
          cooldownScope,
          signal,
          onBatchComplete: (details) => {
            send({
              step: 6,
              pct: 90,
              progress: 90,
              msg: `Phase 6 - Validation Engine: replacement ${details.generated}/${details.total} ${section.questionType} ready...`,
            });
          },
        },
      );

      replacements.push(...sectionReplacements);
    }

    if (!replacements.length) break;

    candidates.push(...replacements);
    validation = validatePaperKeepingValidOrEmpty(candidates, blueprint, config);

    if (countQuestionsForBlueprint(validation.questions, blueprint) >= targetQuestionCount) {
      break;
    }
  }

  const remainingMissingQuestions = missingSectionsForBlueprint(
    validation.questions,
    blueprint,
  ).reduce((sum, section) => sum + section.count, 0);

  if (remainingMissingQuestions > 0) {
    const readyCount = countQuestionsForBlueprint(validation.questions, blueprint);
    throw new Error(
      `Could not replace ${remainingMissingQuestions} invalid or duplicate question${remainingMissingQuestions === 1 ? "" : "s"}. Generated ${readyCount}/${targetQuestionCount} valid questions. Use Retry Auto, choose another provider, or lower the question count.`,
    );
  }

  const replacedQuestions = Math.max(
    0,
    countQuestionsForBlueprint(validation.questions, blueprint) - initialValidCount,
  );

  return {
    ...validation,
    replacedQuestions,
    remainingMissingQuestions,
  };
}

function validatePaperKeepingValidOrEmpty(
  questions: GeneratedQuestion[],
  blueprint: Blueprint,
  config: PaperConfig,
) {
  try {
    return validatePaperKeepingValidQuestions(questions, blueprint, config);
  } catch (error) {
    if (
      error instanceof Error &&
      /No valid generated questions were available/i.test(error.message)
    ) {
      return {
        questions: [],
        blueprint: {
          ...blueprint,
          sections: [],
          totalQuestions: 0,
          totalMarks: 0,
        },
        config: {
          ...config,
          questionTypes: [],
          typeDistribution: {},
          totalQuestions: 0,
          totalMarks: 0,
        },
        skipped: questions.map((question, index) => ({
          type: question.type,
          position: index + 1,
          reason: "invalid-structure",
        })),
      };
    }

    throw error;
  }
}

function missingSectionsForBlueprint(
  questions: GeneratedQuestion[],
  blueprint: Blueprint,
) {
  const counts = questionCountsByType(questions);

  return blueprint.sections
    .map((section) => {
      const missing = Math.max(
        0,
        section.count - (counts.get(section.questionType) ?? 0),
      );

      if (!missing) return null;

      return {
        ...section,
        count: missing,
        totalMarks: missing * section.marksPerQuestion,
      };
    })
    .filter((section): section is BlueprintSection => Boolean(section));
}

function countQuestionsForBlueprint(
  questions: GeneratedQuestion[],
  blueprint: Blueprint,
) {
  const counts = questionCountsByType(questions);

  return blueprint.sections.reduce(
    (sum, section) =>
      sum + Math.min(section.count, counts.get(section.questionType) ?? 0),
    0,
  );
}

function questionCountsByType(questions: GeneratedQuestion[]) {
  return questions.reduce((counts, question) => {
    counts.set(question.type, (counts.get(question.type) ?? 0) + 1);
    return counts;
  }, new Map<QuestionType, number>());
}

function configuredTaskProviderOrder() {
  const tasks: AITask[] = [
    "PDF_EXTRACTION",
    "QUESTION_GENERATION",
    "QUESTION_REPLACEMENT",
    "ANSWER_EVALUATION",
  ];

  return tasks.reduce<Partial<Record<AITask, ReturnType<typeof getConfiguredProviders>>>>(
    (orders, task) => {
      orders[task] = getConfiguredProviders(task);
      return orders;
    },
    {},
  );
}
