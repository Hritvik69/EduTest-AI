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
  normalizeQuestionComposition,
} from "@/lib/composition";
import {
  coverageDiagnosticsForFinalQuestions,
  generateCoveragePlannedQuestions,
  type CoverageGenerationStopContext,
  type CoverageGenerationDiagnostic,
} from "@/lib/coverage-generation";
import {
  normalizeBloomDistributionForDifficulty,
} from "@/lib/difficulty-protocol";
import { assertDemoModeAllowed, demoMetadata } from "@/lib/demo-mode";
import {
  compactAiProviderFailureMessage,
  isAIProviderUnavailableError,
} from "@/lib/error-classification";
import { summarizeAIUsage } from "@/lib/ai-usage-log";
import { getChapterContent } from "@/lib/extractor";
import { buildGenerationManifest } from "@/lib/generation-manifest";
import { buildGenerationContract } from "@/lib/generation-contract";
import {
  checkAIProviderHealth,
  getConfiguredProviders,
  type DirectAIProvider,
} from "@/lib/gemini";
import { signGuestPaperSnapshot } from "@/lib/guest-paper-snapshot";
import {
  generateBlueprintQuestions,
  generateDemoQuestions,
} from "@/lib/generator";
import {
  createPaperInDB,
  deletePaperForUser,
  getPaper,
  getPaperGenerationState,
  markPaperDemoMode,
  markPaperReady,
  saveQuestionsAndLink,
  setPaperGenerationState,
  setPaperGenerationManifest,
  updatePaperDefinition,
  updatePaperStatus,
} from "@/lib/paper-store";
import { getUploadedPdfSourceConcepts } from "@/lib/pdf-source-store";
import {
  buildGenerationArchitecturePlan,
  type GenerationArchitecturePlan,
} from "@/lib/question-planning";
import {
  blueprintForSections,
  QuestionCandidateBank,
  repairCandidateReserveCount,
  stripGenerationMetadataFromQuestions,
  type PaperGenerationState,
} from "@/lib/question-candidate-bank";
import {
  completeQuestionBankWithSourceBackedFallback,
  generateSourceBackedFallbackQuestions,
  hasSourceBackedFallbackConcepts,
  sourceBackedCompletionMarker,
} from "@/lib/source-backed-fallback";
import { analyzeConceptSourceQuality, retrieveConcepts } from "@/lib/retriever";
import { generationRequestSchema } from "@/lib/schemas";
import {
  assertSourceGroundingForGeneration,
  SourceGroundingError,
} from "@/lib/source-grounding";
import { validatePaperKeepingValidQuestions } from "@/lib/validator";
import type { LocalNcertSourceDiagnostics } from "@/lib/local-ncert-source";
import type {
  Blueprint,
  ConceptData,
  GeneratedQuestion,
  AITask,
  GenerationRiskLevel,
  PaperConfig,
  QuestionCompositionItem,
  StoredPaper,
} from "@/types";

export const runtime = "nodejs";
export const maxDuration = 60;

interface GenerationStreamContractSummary {
  contractHash: string;
  generationModeLabel: string;
  plannedCalls: number;
  riskLevel: GenerationRiskLevel;
  chunkingNote?: string;
}

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
    resumePaperId,
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
      const serverBudgetMs = generationServerBudgetMs();
      const generationDeadlineAt = Date.now() + serverBudgetMs;
      const generationDeadlineTimer = setTimeout(() => {
        generationSignalController.abort(generationDeadlineError());
      }, serverBudgetMs);
      const abortGenerationFromClient = () => {
        generationSignalController.abort(new Error("Generation cancelled by client."));
      };
      request.signal.addEventListener("abort", abortGenerationFromClient, {
        once: true,
      });
      const generationSignal = generationSignalController.signal;
      let recoverySnapshot: Partial<
        Pick<
          PaperGenerationState,
          | "status"
          | "phase"
          | "readyQuestionCount"
          | "targetQuestionCount"
          | "missingQuestionCount"
          | "lastMessage"
        >
      > = {};
      let heartbeatStep = 5;
      let heartbeatPct = 40;
      let heartbeatMessage =
        "Phase 5 - Question Generation: still working with the selected AI/source contract.";
      let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
      let streamContractSummary: GenerationStreamContractSummary | null = null;
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
      const updateRecoverySnapshot = (state: PaperGenerationState | null) => {
        if (!state) return;
        recoverySnapshot = {
          status: state.status,
          phase: state.phase,
          readyQuestionCount: state.readyQuestionCount,
          targetQuestionCount: state.targetQuestionCount,
          missingQuestionCount: state.missingQuestionCount,
          lastMessage: state.lastMessage,
        };
      };
      const contractPayload = () =>
        streamContractSummary
          ? {
              promptContract: streamContractSummary,
              contractHash: streamContractSummary.contractHash,
              generationModeLabel: streamContractSummary.generationModeLabel,
              plannedCalls: streamContractSummary.plannedCalls,
              apiRiskLevel: streamContractSummary.riskLevel,
              chunkingNote: streamContractSummary.chunkingNote,
            }
          : {};
      const recoveryPayload = () => ({
        paperId: paperId ?? undefined,
        status: streamStatusForGenerationState(recoverySnapshot.status),
        generationPhase: recoverySnapshot.phase,
        readyQuestionCount: recoverySnapshot.readyQuestionCount,
        targetQuestionCount: recoverySnapshot.targetQuestionCount,
        missingQuestionCount: recoverySnapshot.missingQuestionCount,
        recoveryReason: recoverySnapshot.lastMessage,
        ...contractPayload(),
      });
      const setHeartbeatContext = (step: number, pct: number, msg: string) => {
        heartbeatStep = step;
        heartbeatPct = pct;
        heartbeatMessage = msg;
      };
      const startHeartbeat = () => {
        if (heartbeatTimer) return;
        heartbeatTimer = setInterval(() => {
          if (!paperId) return;
          send(
            {
              step: heartbeatStep,
              pct: heartbeatPct,
              progress: heartbeatPct,
              msg: heartbeatMessage,
              ...recoveryPayload(),
            },
            "progress",
          );
        }, generationHeartbeatMs());
      };
      const stopHeartbeat = () => {
        if (!heartbeatTimer) return;
        clearInterval(heartbeatTimer);
        heartbeatTimer = null;
      };
      const close = () => {
        stopHeartbeat();
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
      const localNcertDiagnostics: LocalNcertSourceDiagnostics[] = [];

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
                  onLocalNcertDiagnostics: (diagnostics) => {
                    localNcertDiagnostics.push(diagnostics);
                  },
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
        let scopedConcepts = applySelectedTopicScope(
          selectionAwareConcepts,
          effectiveConfig,
        );
        scopedConcepts = textBackedConceptScope(
          effectiveConfig,
          scopedConcepts,
          selectionAwareConcepts,
          localNcertDiagnostics,
        );
        const paperQuestionSource = paperQuestionSourceForConcepts(scopedConcepts);
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
        streamContractSummary = generationStreamContractSummary(
          effectiveConfig,
          blueprint,
          scopedConcepts,
          availableTopics,
        );
        const generationAiBudget = {
          deadlineAt: generationDeadlineAt,
          finalizationReserveMs: generationFinalizationReserveMs(),
          ...providerAttemptLimitForGeneration(streamContractSummary),
        };
        const isDemoMode =
          effectiveConfig.sourceMode !== "pdf_upload" &&
          scopedConcepts.some((concept) => concept.source === "demo");

        assertActive();
        send({
          step: 3,
          pct: 25,
          progress: 25,
          msg: "Phase 3 - Question Planning: building blueprint, S/C/T split, and question intelligence.",
          ...contractPayload(),
        });
        localFallbackContext = {
          effectiveConfig,
          blueprint,
          scopedConcepts,
        };
        const sourceContextHash = generationSourceContextHash({
          config: effectiveConfig,
          blueprint,
          conceptContext,
          concepts: scopedConcepts,
        });
        let resumeState: PaperGenerationState | null = null;
        if (resumePaperId) {
          const resumablePaper = await getPaper(resumePaperId, auth.user.id);
          if (!resumablePaper) {
            console.warn("[generate-paper] resume paper not found; starting fresh", {
              resumePaperId,
              generationJobId,
              idempotencyKey,
            });
            send({
              step: 3,
              pct: 25,
              progress: 25,
              msg: "Saved generation progress was no longer available, so a fresh durable generation is starting.",
              status: "GENERATING",
              ...contractPayload(),
            });
          } else if (resumablePaper.status === "READY") {
            send(
              {
                error: true,
                code: "GENERATION_ALREADY_COMPLETED",
                msg: "This generation already completed. Start a new generation to create a fresh paper.",
                paperId: resumablePaper.id,
                idempotencyKey,
                ...contractPayload(),
              },
              "error",
            );
            close();
            return;
          } else {
            const storedState = await getPaperGenerationState(
              resumablePaper.id,
              auth.user.id,
            );
            if (storedState && storedState.sourceContextHash === sourceContextHash) {
              resumeState = storedState;
              paperId = resumablePaper.id;
              await updatePaperDefinition(paperId, effectiveConfig, blueprint);
            } else {
              console.warn("[generate-paper] resume state unavailable or stale", {
                resumePaperId,
                hasStoredState: Boolean(storedState),
                expectedSourceContextHash: sourceContextHash,
                storedSourceContextHash: storedState?.sourceContextHash,
              });
              send({
                step: 3,
                pct: 25,
                progress: 25,
                msg: "Saved generation progress did not match this request, so a fresh durable generation is starting.",
                status: "GENERATING",
              });
            }
          }
        }

        if (!paperId) {
          const created = await createPaperInDB(
            effectiveConfig,
            blueprint,
            isDemoMode,
            {
              userId: auth.user.id,
              generationJobId,
              idempotencyKey,
            },
          );
          paperId = created.paperId;

          if (created.reused) {
            const storedState = await getPaperGenerationState(
              created.paperId,
              auth.user.id,
            );
            if (
              created.status !== "READY" &&
              storedState?.sourceContextHash === sourceContextHash
            ) {
              resumeState = storedState;
            } else if (created.status === "READY") {
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
            } else {
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
          }
        }

        if (!paperId) {
          throw new Error("Paper shell could not be created.");
        }

        if (resumeState) {
          updateRecoverySnapshot(resumeState);
        } else {
          const initialGenerationState = new QuestionCandidateBank(
            [],
            blueprint,
            effectiveConfig,
          ).toGenerationState({
            status: "IN_PROGRESS",
            phase: "INITIAL_GENERATION",
            generationJobId,
            idempotencyKey,
            sourceContextHash,
            attemptCount: 0,
            lastMessage:
              "Paper shell saved; waiting for the first valid AI questions.",
          });
          await setPaperGenerationState(
            paperId,
            initialGenerationState,
            effectiveConfig,
          );
          updateRecoverySnapshot(initialGenerationState);
        }
        startHeartbeat();

        send({
          step: 3,
          pct: 30,
          progress: 30,
          msg: resumeState
            ? `Phase 3 - Question Planning: continuing saved generation from ${resumeState.readyQuestionCount}/${resumeState.targetQuestionCount} valid questions.`
            : "Phase 3 - Question Planning: paper shell saved; starting AI question generation.",
          paperId,
          status: resumeState ? "CONTINUING" : "GENERATING",
          generationPhase: recoverySnapshot.phase,
          readyQuestionCount: recoverySnapshot.readyQuestionCount,
          targetQuestionCount: recoverySnapshot.targetQuestionCount,
          missingQuestionCount: recoverySnapshot.missingQuestionCount,
          idempotencyKey,
          generationJobId,
        });

        assertActive();
        setHeartbeatContext(
          4,
          35,
          "Phase 4 - Cognitive Distribution: applying Bloom levels from difficulty.",
        );
        send({
          step: 4,
          pct: 35,
          progress: 35,
          msg: "Phase 4 - Cognitive Distribution: applying Bloom levels from difficulty.",
        });

        assertActive();
        let healthyProviders: DirectAIProvider[] | undefined;
        if (!allowExplicitDemoFallback) {
          setHeartbeatContext(5, 38, "Checking AI provider health...");
          send({
            step: 5,
            pct: 38,
            progress: 38,
            msg: "Checking AI provider health...",
          });
          const providerHealth = await checkAIProviderHealth({
            task: "QUESTION_GENERATION",
            signal: generationSignal,
            cooldownScope: providerCooldownScope,
          });
          healthyProviders = providerHealth.usableProviders;
          console.info("[generate-paper] provider health", {
            generationJobId,
            paperId,
            usableProviders: providerHealth.usableProviders,
            configuredProviders: providerHealth.configuredProviders,
            providers: providerHealth.providers.map((provider) => ({
              provider: provider.provider,
              configured: provider.configured,
              usable: provider.usable,
              model: provider.model,
              lastFailureClass: provider.lastFailureClass,
              cooldownErrorClass: provider.cooldownErrorClass,
            })),
          });
          send({
            step: 5,
            pct: 39,
            progress: 39,
            msg: healthyProviders.length
              ? `AI provider health ready: ${healthyProviders.join(", ")} usable.`
              : "No AI provider passed health preflight; continuing from selected TXT/PDF source text without demo fallback.",
          });
        }

        let allQuestions = resumeState?.candidateQuestions ?? [];
        let coverageDiagnostics: CoverageGenerationDiagnostic[] = [];
        let stoppedDuringCoverageGeneration = false;
        const persistQuestionGenerationState = async (
          candidateQuestions: GeneratedQuestion[],
          lastMessage: string,
          status: PaperGenerationState["status"] = "IN_PROGRESS",
        ) => {
          if (!paperId) return null;
          const bank = new QuestionCandidateBank(
            candidateQuestions,
            blueprint,
            effectiveConfig,
            { initialReadyCount: resumeState?.readyQuestionCount ?? 0 },
          );
          const state = bank.toGenerationState({
            status,
            phase: "QUESTION_GENERATION",
            generationJobId,
            idempotencyKey,
            sourceContextHash,
            attemptCount: resumeState?.attemptCount ?? 0,
            createdAt: resumeState?.createdAt,
            lastMessage,
          });
          await setPaperGenerationState(paperId, state, effectiveConfig);
          updateRecoverySnapshot(state);
          return state;
        };
        const resumeNeedsFinalCompletion =
          Boolean(resumeState) &&
          (resumeState?.phase === "VALIDATION" || resumeState?.phase === "REPAIR") &&
          (resumeState?.missingQuestionCount ?? 0) > 0;
        if (resumeState) {
          setHeartbeatContext(
            5,
            82,
            `Phase 5 - Question Generation: continuing from ${resumeState.readyQuestionCount}/${resumeState.targetQuestionCount} valid saved TXT-grounded questions.`,
          );
          send({
            step: 5,
            pct: 82,
            progress: 82,
            msg: `Phase 5 - Question Generation: continuing from ${resumeState.readyQuestionCount}/${resumeState.targetQuestionCount} valid saved TXT-grounded questions.`,
            paperId,
            status: "CONTINUING",
          });
        }

        if (resumeNeedsFinalCompletion) {
          setHeartbeatContext(
            6,
            88,
            `Phase 6 - Validation Engine: resolving ${resumeState?.missingQuestionCount} saved duplicate/missing questions before retrying AI.`,
          );
          send({
            step: 6,
            pct: 88,
            progress: 88,
            msg: `Phase 6 - Validation Engine: resolving ${resumeState?.missingQuestionCount} saved duplicate/missing question${resumeState?.missingQuestionCount === 1 ? "" : "s"} from selected source text before retrying AI.`,
            paperId,
            status: "CONTINUING",
          });
        } else if (allowExplicitDemoFallback || !composition.length) {
          if (!resumeState || !resumeState.candidateQuestions.length) {
            setHeartbeatContext(
              5,
              40,
              `Phase 5 - Question Generation: generating ${blueprint.totalQuestions} questions from selected NCERT_Books TXT source...`,
            );
            send({
              step: 5,
              pct: 40,
              progress: 40,
              msg: `Phase 5 - Question Generation: generating ${blueprint.totalQuestions} questions from selected NCERT_Books TXT source...`,
            });
            const providersUnavailableBeforeCall =
              !allowExplicitDemoFallback &&
              Array.isArray(healthyProviders) &&
              healthyProviders.length === 0;
            if (providersUnavailableBeforeCall) {
              send({
                step: 5,
                pct: 42,
                progress: 42,
                msg: "Phase 5 - Question Generation: providers unavailable; generating from selected TXT/PDF source text.",
              });
              allQuestions = generateSourceBackedProviderOutageQuestions({
                blueprint,
                concepts: scopedConcepts,
                config: effectiveConfig,
                existingQuestions: [],
              });
              const savedState = await persistQuestionGenerationState(
                allQuestions,
                `Phase 5 saved ${allQuestions.length}/${blueprint.totalQuestions} source-backed questions after provider preflight outage.`,
              );
              if (savedState) {
                send({
                  step: 5,
                  pct: 84,
                  progress: 84,
                  msg: `Phase 5 - Question Generation: saved ${savedState.readyQuestionCount}/${savedState.targetQuestionCount} valid source-backed questions.`,
                  ...recoveryPayload(),
                });
              }
            } else {
              try {
                allQuestions = await generateBlueprintQuestions(
                  blueprint,
                  conceptContext,
                  effectiveConfig,
                  {
                    allowPartial: salvageMode,
                    availableTopics,
                    existingQuestions: [],
                    generationPlan,
                    generationNonce: generationJobId,
                    cooldownScope: providerCooldownScope,
                    healthyProviders,
                    ...generationAiBudget,
                    signal: generationSignal,
                    onBatchComplete: (details) => {
                      send({
                        step: 5,
                        pct: 82,
                        progress: 82,
                        msg: `Phase 5 - Question Generation: ${details.generated}/${details.total} TXT-grounded AI questions ready...`,
                      });
                    },
                  },
                );
                const savedState = await persistQuestionGenerationState(
                  allQuestions,
                  `Phase 5 saved ${allQuestions.length}/${blueprint.totalQuestions} candidate questions before validation.`,
                );
                if (savedState) {
                  send({
                    step: 5,
                    pct: 84,
                    progress: 84,
                    msg: `Phase 5 - Question Generation: saved ${savedState.readyQuestionCount}/${savedState.targetQuestionCount} valid questions before validation.`,
                    ...recoveryPayload(),
                  });
                }
              } catch (error) {
                if (!allowExplicitDemoFallback && isAIProviderUnavailableError(error)) {
                  send({
                    step: 5,
                    pct: 42,
                    progress: 42,
                    msg: "Phase 5 - Question Generation: providers unavailable; generating from selected TXT/PDF source text.",
                  });
                  allQuestions = generateSourceBackedProviderOutageQuestions({
                    blueprint,
                    concepts: scopedConcepts,
                    config: effectiveConfig,
                    existingQuestions: [],
                  });
                  const savedState = await persistQuestionGenerationState(
                    allQuestions,
                    `Phase 5 saved ${allQuestions.length}/${blueprint.totalQuestions} source-backed questions after provider outage.`,
                  );
                  if (savedState) {
                    send({
                      step: 5,
                      pct: 84,
                      progress: 84,
                      msg: `Phase 5 - Question Generation: saved ${savedState.readyQuestionCount}/${savedState.targetQuestionCount} valid source-backed questions.`,
                      ...recoveryPayload(),
                    });
                  }
                } else {
                  throw error;
                }
              }
            }
          }
        } else {
          setHeartbeatContext(
            5,
            40,
            resumeState
              ? "Phase 5 - Question Generation: continuing strict subject/chapter TXT coverage batches..."
              : `Phase 5 - Question Generation: generating ${blueprint.totalQuestions} questions in strict subject/chapter TXT batches...`,
          );
          send({
            step: 5,
            pct: 40,
            progress: 40,
            msg: resumeState
              ? "Phase 5 - Question Generation: continuing strict subject/chapter TXT coverage batches..."
              : `Phase 5 - Question Generation: generating ${blueprint.totalQuestions} questions in strict subject/chapter TXT batches...`,
          });
          const coverageGeneration = await generateCoveragePlannedQuestions({
            blueprint,
            concepts: scopedConcepts,
            config: effectiveConfig,
            generationPlan,
            existingQuestions: allQuestions,
            acceptedQuestions: resumeState?.acceptedQuestions ?? [],
            allowPartial: salvageMode,
            generationNonce: generationJobId,
            cooldownScope: providerCooldownScope,
            healthyProviders,
            ...generationAiBudget,
            signal: generationSignal,
            shouldStop: (context) =>
              shouldStopBeforeNextGenerationCall(generationDeadlineAt, context),
            onAcceptedBatch: async (details) => {
              const savedCandidates = [...allQuestions, ...details.generatedQuestions];
              const savedState = await persistQuestionGenerationState(
                savedCandidates,
                `Phase 5 saved ${details.generated}/${details.total} focused questions across ${details.batch}/${details.batches} chunked AI batch${details.batches === 1 ? "" : "es"}.`,
              );
              if (savedState) {
                send({
                  step: 5,
                  pct: 82,
                  progress: 82,
                  msg: `Phase 5 - Question Generation: saved ${savedState.readyQuestionCount}/${savedState.targetQuestionCount} valid questions (${details.batch}/${details.batches} chunked AI batch${details.batches === 1 ? "" : "es"}).`,
                  ...recoveryPayload(),
                });
              }
            },
            onProgress: (details) => {
              const providerOutageRecovered =
                details.diagnostic.generationMode === "source_backed_provider_outage";
              send({
                step: 5,
                pct: 82,
                progress: 82,
                msg: providerOutageRecovered
                  ? `Phase 5 - Question Generation: providers unavailable; generated ${details.label} from selected TXT/PDF (${details.diagnostic.generatedQuestions}/${details.diagnostic.requestedQuestions} question${details.diagnostic.requestedQuestions === 1 ? "" : "s"}).`
                  : `Phase 5 - Question Generation: ${details.label} - ${details.diagnostic.generatedQuestions}/${details.diagnostic.requestedQuestions} focused question${details.diagnostic.requestedQuestions === 1 ? "" : "s"} ready.`,
              });
            },
            onBatchComplete: (details) => {
              send({
                step: 5,
                pct: 82,
                progress: 82,
                msg: `Phase 5 - Question Generation: focused batch ${details.generated}/${details.total} TXT-grounded AI questions ready...`,
              });
            },
          });
          allQuestions = [...allQuestions, ...coverageGeneration.questions];
          coverageDiagnostics = coverageGeneration.diagnostics;
          stoppedDuringCoverageGeneration = coverageGeneration.stoppedForBudget;
        }

        if (stoppedDuringCoverageGeneration && !allQuestions.length) {
          await persistQuestionGenerationState(
            allQuestions,
            "Phase 5 paused before the first AI chunk because the server time budget was too low. Retry continues the same saved paper setup.",
            "NEEDS_CONTINUATION",
          );
          throw generationContinuationError(
            "Server time budget was too low before the next AI chunk. Saved setup is intact; retry continues this same paper.",
          );
        }

        const stoppedForServerBudget = shouldStopForFinalization(
          generationDeadlineAt,
          allQuestions.length,
        ) || stoppedDuringCoverageGeneration;
        if (!stoppedForServerBudget) {
          send({
            step: 5,
            pct: 85,
            progress: 85,
            msg: `Phase 5 - Question Generation: source-text generation batch done (${allQuestions.length} questions).`,
          });
        }

        assertActive();
        setHeartbeatContext(
          6,
          88,
          stoppedForServerBudget
            ? "Phase 6 - Validation Engine: deployment time is low, saving valid real AI questions already generated."
            : "Phase 6 - Validation Engine: checking duplicates, marks, structure, and answers.",
        );
        send({
          step: 6,
          pct: 88,
          progress: 88,
          msg: stoppedForServerBudget
            ? "Phase 6 - Validation Engine: deployment time is low, saving valid real AI questions already generated."
            : "Phase 6 - Validation Engine: checking duplicates, marks, structure, and answers.",
        });
        const validation = await validateGeneratedPaperSkippingInvalid({
          questions: allQuestions,
          blueprint,
          config: effectiveConfig,
          conceptContext,
          scopedConcepts,
          availableTopics,
          generationPlan,
          allowDemoFallback: allowExplicitDemoFallback,
          generationNonce: generationJobId,
          cooldownScope: providerCooldownScope,
          healthyProviders,
          allowSourceBackedCompletion: !allowExplicitDemoFallback,
          deadlineAt: generationDeadlineAt,
          finalizationReserveMs: generationAiBudget.finalizationReserveMs,
          maxProviderAttempts: generationAiBudget.maxProviderAttempts,
          paperId,
          idempotencyKey,
          sourceContextHash,
          resumeState,
          partialFinalizationReason: stoppedForServerBudget
            ? "Generation reached the deployment time limit before every requested question could be generated."
            : undefined,
          signal: generationSignal,
          send,
          onStatePersisted: updateRecoverySnapshot,
        });
        const validated = stripGenerationMetadataFromQuestions(validation.questions);
        effectiveConfig = validation.config;

        if (validation.sourceBackedCompletedQuestions) {
          send({
            step: 6,
          pct: 94,
          progress: 94,
          msg: `Phase 6 - Validation Engine: completed ${validation.sourceBackedCompletedQuestions} final source-backed replacement question${validation.sourceBackedCompletedQuestions === 1 ? "" : "s"} from selected text.`,
          ...contractPayload(),
        });
      }

        if (validation.replacedQuestions) {
          send({
            step: 6,
          pct: 92,
          progress: 92,
          msg: `Phase 6 - Validation Engine: replaced ${validation.replacedQuestions} invalid or duplicate question${validation.replacedQuestions === 1 ? "" : "s"} with valid alternatives.`,
          ...contractPayload(),
        });
      } else if (validation.skipped.length) {
        send({
          step: 6,
          pct: 92,
          progress: 92,
          msg: `Phase 6 - Validation Engine: found ${validation.skipped.length} invalid or duplicate question${validation.skipped.length === 1 ? "" : "s"}.`,
          ...contractPayload(),
        });
      }

        assertActive();
        setHeartbeatContext(
          7,
          95,
          "Phase 7 - Final Paper Composition: numbering sections and preparing layout.",
        );
        send({
          step: 7,
          pct: 95,
          progress: 95,
          msg: "Phase 7 - Final Paper Composition: numbering sections and preparing layout.",
          ...contractPayload(),
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
          usageSummary: summarizeAIUsage(generationJobId),
          coverage:
            !allowExplicitDemoFallback && composition.length
              ? coverageDiagnosticsForFinalQuestions(
                  effectiveConfig,
                  validation.blueprint,
                  storedQuestions,
                  coverageDiagnostics,
                )
              : undefined,
        });
        await setPaperGenerationManifest(paperId, manifest, effectiveConfig);
        const readyPaper = buildReadyPaperPayload({
          paperId,
          config: effectiveConfig,
          blueprint: validation.blueprint,
          questions: storedQuestions,
          isDemoMode,
          manifest,
          generationJobId,
          idempotencyKey,
        });
        const guestPaperToken = auth.user.isGuest
          ? await signGuestPaperSnapshot(readyPaper, auth.user.id)
          : undefined;

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
            title: readyPaper.title,
            blueprint: validation.blueprint,
            questions: storedQuestions,
            skippedQuestions: validation.remainingMissingQuestions,
            replacedQuestions: validation.replacedQuestions,
            validationWarnings: validation.skipped,
            manifest,
            status: "READY",
            isDemoMode,
            createdAt: readyPaper.createdAt,
            sessionOnly: Boolean(auth.user.isGuest),
            config: effectiveConfig,
            guestPaperToken,
            ...contractPayload(),
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
          shouldUseLocalGenerationFallback(Boolean(demoMode), error)
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
              ownerId: auth.user.id,
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

        const savedFailureState = paperId
          ? await getPaperGenerationState(paperId, auth.user.id).catch(() => null)
          : null;
        let paperStatusSaved = false;
        const canContinueGeneration =
          Boolean(paperId) &&
          !request.signal.aborted &&
          (isGenerationContinuationError(error) ||
            isRecoverableGenerationRuntimeError(error, savedFailureState));
        if (paperId && !canContinueGeneration) {
          try {
            await updatePaperStatus(paperId, "FAILED", {
              message,
              generationJobId,
              cancelled: request.signal.aborted,
            });
            paperStatusSaved = true;
            if (auth.user.isGuest) {
              await deletePaperForUser(paperId, auth.user.id);
              paperId = null;
            }
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
          const continuationState =
            canContinueGeneration && paperId ? savedFailureState : null;
          send(
            {
              error: true,
              code,
              msg: generationErrorMessage(error),
              generationJobId,
              paperId,
              generationPhase: continuationState?.phase ?? recoverySnapshot.phase,
              readyQuestionCount:
                continuationState?.readyQuestionCount ??
                recoverySnapshot.readyQuestionCount,
              targetQuestionCount:
                continuationState?.targetQuestionCount ??
                recoverySnapshot.targetQuestionCount,
              missingQuestionCount:
                continuationState?.missingQuestionCount ??
                recoverySnapshot.missingQuestionCount,
              recoveryReason:
                continuationState?.lastMessage ?? recoverySnapshot.lastMessage,
              ...contractPayload(),
              status: canContinueGeneration
                ? "CONTINUING"
                : paperStatusSaved
                  ? "FAILED"
                  : streamStatusForGenerationState(recoverySnapshot.status),
            },
            "error",
          );
        }
        close();
      } finally {
        stopHeartbeat();
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

function generateSourceBackedProviderOutageQuestions({
  blueprint,
  concepts,
  config,
  existingQuestions,
}: {
  blueprint: Blueprint;
  concepts: ConceptData[];
  config: PaperConfig;
  existingQuestions: GeneratedQuestion[];
}) {
  if (!hasSourceBackedFallbackConcepts(concepts)) {
    throw selectedSourceTextNotEnoughError("this paper");
  }

  const questions = generateSourceBackedFallbackQuestions(
    blueprint.sections,
    concepts,
    config,
    {
      existingQuestions,
      startIndex: existingQuestions.length + 101,
    },
  );

  if (!questions.length) {
    throw selectedSourceTextNotEnoughError("this paper");
  }

  return questions;
}

async function completeWithLocalGenerationFallback({
  paperId,
  context,
  generationJobId,
  idempotencyKey,
  ownerId,
  originalError,
  sessionOnly,
  send,
}: {
  paperId: number;
  context: LocalFallbackContext;
  generationJobId: string;
  idempotencyKey: string;
  ownerId: number;
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
    stripGenerationMetadataFromQuestions(validation.questions),
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
    usageSummary: summarizeAIUsage(generationJobId),
  });
  await setPaperGenerationManifest(paperId, manifest, validation.config);
  const readyPaper = buildReadyPaperPayload({
    paperId,
    config: validation.config,
    blueprint: validation.blueprint,
    questions: storedQuestions,
    isDemoMode: true,
    manifest,
    generationJobId,
    idempotencyKey,
  });
  const guestPaperToken = sessionOnly
    ? await signGuestPaperSnapshot(readyPaper, ownerId)
    : undefined;

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
      title: readyPaper.title,
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
      createdAt: readyPaper.createdAt,
      sessionOnly,
      config: validation.config,
      guestPaperToken,
      ...demoMetadata(),
    },
    "done",
  );
}

function buildReadyPaperPayload({
  paperId,
  config,
  blueprint,
  questions,
  isDemoMode,
  manifest,
  generationJobId,
  idempotencyKey,
}: {
  paperId: number;
  config: PaperConfig;
  blueprint: Blueprint;
  questions: GeneratedQuestion[];
  isDemoMode: boolean;
  manifest: StoredPaper["manifest"];
  generationJobId: string;
  idempotencyKey: string;
}): StoredPaper {
  return {
    id: paperId,
    title:
      config.sourceMode === "pdf_upload"
        ? `${config.pdfSource?.title ?? "PDF-EDU-TEST"} Paper`
        : `Class ${config.classNum} ${config.subject} ${config.examType}`,
    config,
    blueprint,
    questions,
    isDemoMode,
    status: "READY",
    createdAt: new Date().toISOString(),
    manifest,
    generationJobId,
    idempotencyKey,
  };
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

function textBackedConceptScope(
  config: PaperConfig,
  scopedConcepts: ConceptData[],
  chapterConcepts: ConceptData[],
  localNcertDiagnostics: LocalNcertSourceDiagnostics[] = [],
) {
  try {
    assertSourceGroundingForGeneration(config, scopedConcepts);
    return scopedConcepts;
  } catch (error) {
    if (!(error instanceof SourceGroundingError) || scopedConcepts === chapterConcepts) {
      logSourceGroundingBlock(config, scopedConcepts, localNcertDiagnostics, "scoped");
      throw error;
    }

    try {
      assertSourceGroundingForGeneration(config, chapterConcepts);
      return chapterConcepts;
    } catch (chapterError) {
      logSourceGroundingBlock(
        config,
        chapterConcepts,
        localNcertDiagnostics,
        "chapter",
      );
      throw chapterError;
    }
  }
}

function logSourceGroundingBlock(
  config: PaperConfig,
  concepts: ConceptData[],
  localNcertDiagnostics: LocalNcertSourceDiagnostics[],
  scope: "scoped" | "chapter",
) {
  const sourceQuality = analyzeConceptSourceQuality(concepts);
  console.warn("[generate-paper] source grounding blocked", {
    scope,
    sourceMode: config.sourceMode ?? "curriculum",
    classNum: config.classNum,
    subject: config.subject,
    subjects: config.subjects ?? [],
    chapterIds: config.chapterIds,
    topicIdsCount: config.topicIds?.length ?? 0,
    conceptCount: concepts.length,
    conceptSources: conceptSourceCounts(concepts),
    sourceQuality,
    localNcert: localNcertDiagnostics.map(summarizeLocalNcertDiagnostics),
  });
}

function conceptSourceCounts(concepts: ConceptData[]) {
  return concepts.reduce<Record<string, number>>((counts, concept) => {
    const source = concept.source ?? "unknown";
    counts[source] = (counts[source] ?? 0) + 1;
    return counts;
  }, {});
}

function summarizeLocalNcertDiagnostics(diagnostics: LocalNcertSourceDiagnostics) {
  return {
    selectedChapterId: diagnostics.selectedChapterId,
    resolved: diagnostics.resolved,
    selectedSource: diagnostics.selectedSource,
    reason: diagnostics.reason,
    conceptCount: diagnostics.conceptCount,
    sourceTextChunks: diagnostics.sourceTextChunks,
    cacheHit: Boolean(diagnostics.cacheHit),
    manifestMatch: diagnostics.manifestMatch,
    manifestCandidateCount: diagnostics.manifestCandidates.length,
    attemptedLocalPathCount: diagnostics.attemptedLocalPaths.length,
    attemptedExtractedTextPathCount: diagnostics.attemptedExtractedTextPaths.length,
    attemptedPdfPathCount: diagnostics.attemptedPdfPaths.length,
    remoteFallbacks: diagnostics.remoteFallbacks.map((attempt) => ({
      path: attempt.path,
      status: attempt.status,
      statusCode: attempt.statusCode,
      length: attempt.length,
      error: attempt.error?.slice(0, 180),
    })),
    tooShortText: diagnostics.tooShortText.slice(0, 5),
    readErrors: diagnostics.readErrors.slice(0, 5).map((item) => ({
      ...item,
      error: item.error.slice(0, 180),
    })),
  };
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

  if (/SOURCE_TEXT_NOT_ENOUGH|Selected source text (?:is not enough|did not provide enough distinct material|cannot produce enough 100% distinct questions)/i.test(message)) {
    return stripSourceTextNotEnoughPrefix(message);
  }

  if (/SOURCE_NOT_TEXT_BACKED/i.test(message)) {
    return stripSourceGroundingPrefix(message);
  }

  if (/GENERATION_CONTINUE_AVAILABLE/i.test(message)) {
    return stripGenerationContinuationPrefix(message);
  }

  if (/SERVER_GENERATION_TIME_BUDGET_EXCEEDED|Vercel function time budget|server time budget/i.test(message)) {
    return "Real AI generation reached the deployment time limit before enough valid questions were ready. Saved progress can continue on retry; if this repeats, use fewer question formats or a faster configured provider.";
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

  if (/OpenRouter|Mistral|GroqCloud|GitHub Models|Cohere|Cloudflare|402|credit|quota|billing|can only afford|max_tokens/i.test(message)) {
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

function shouldUseLocalGenerationFallback(isExplicitDemoMode: boolean, error: unknown) {
  const configured = process.env.EDUTEST_LOCAL_GENERATION_FALLBACK;
  if (configured === "false") return false;
  if (configured === "true") {
    return isExplicitDemoMode || process.env.NODE_ENV !== "production";
  }
  if (!isExplicitDemoMode) return false;

  const code = generationErrorCode(error);
  if (code === "GENERATION_CONTINUE_AVAILABLE") return false;
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
  return /AI provider|Auto Fallback|Gemini|GroqCloud|Mistral|Cerebras|OpenRouter|GitHub Models|Cohere|Cloudflare|Grok|DeepSeek|OpenAI|question generation|No valid generated questions|Could not replace/i.test(
    message,
  );
}

function paperQuestionSourceForConcepts(concepts: ConceptData[]) {
  if (concepts.some((concept) => concept.source === "ncert_txt")) return "ncert_txt";
  return concepts.some((concept) => concept.source === "pdf") ? "pdf" : "curriculum";
}

function generationStreamContractSummary(
  config: PaperConfig,
  blueprint: Blueprint,
  concepts: ConceptData[],
  availableTopics: string[],
): GenerationStreamContractSummary {
  const sourceQuality = analyzeConceptSourceQuality(concepts);
  const contract = buildGenerationContract(config, blueprint, {
    availableTopics,
    sourceTextChunks: sourceQuality.sourceTextChunks,
  });
  const chunkingNote = contract.apiEstimate.riskReasons.find((reason) =>
    /chunked focused batches/i.test(reason),
  );

  return {
    contractHash: contract.hash,
    generationModeLabel:
      contract.paper.generationMode === "source_exact"
        ? "NCERT/PDF Source"
        : "Fresh Questions",
    plannedCalls: contract.apiEstimate.plannedCalls,
    riskLevel: contract.apiEstimate.riskLevel,
    ...(chunkingNote ? { chunkingNote } : {}),
  };
}

function providerAttemptLimitForGeneration(
  summary: GenerationStreamContractSummary,
): { maxProviderAttempts?: number } {
  if (summary.plannedCalls >= 12) return { maxProviderAttempts: 1 };
  if (summary.riskLevel === "high" || summary.plannedCalls >= 6) {
    return { maxProviderAttempts: 2 };
  }
  return {};
}

function generationErrorCode(error: unknown) {
  const message =
    error instanceof Error ? error.message : "Generation failed. Please try again.";

  if (/SOURCE_TEXT_NOT_ENOUGH|Selected source text (?:is not enough|did not provide enough distinct material|cannot produce enough 100% distinct questions)/i.test(message)) {
    return "SOURCE_TEXT_NOT_ENOUGH";
  }

  if (/SOURCE_NOT_TEXT_BACKED/i.test(message)) {
    return "SOURCE_NOT_TEXT_BACKED";
  }

  if (/GENERATION_CONTINUE_AVAILABLE/i.test(message)) {
    return "GENERATION_CONTINUE_AVAILABLE";
  }

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

function stripSourceGroundingPrefix(message: string) {
  return message.replace(/^SOURCE_NOT_TEXT_BACKED:\s*/i, "");
}

function stripSourceTextNotEnoughPrefix(message: string) {
  return message.replace(/^SOURCE_TEXT_NOT_ENOUGH:\s*/i, "");
}

function generationContinuationError(message: string) {
  return new Error(`GENERATION_CONTINUE_AVAILABLE: ${message}`);
}

function isGenerationContinuationError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /GENERATION_CONTINUE_AVAILABLE/i.test(message);
}

function isRecoverableGenerationRuntimeError(
  error: unknown,
  state: PaperGenerationState | null,
) {
  if (
    !state ||
    (state.phase !== "QUESTION_GENERATION" && state.phase !== "INITIAL_GENERATION")
  ) {
    return false;
  }

  const code = generationErrorCode(error);
  if (
    code === "SOURCE_TEXT_NOT_ENOUGH" ||
    code === "SOURCE_NOT_TEXT_BACKED" ||
    code === "PROVIDER_AUTH_ERROR"
  ) {
    return false;
  }

  const hasSavedProgress =
    state.readyQuestionCount > 0 || state.candidateQuestions.length > 0;
  if (!hasSavedProgress) {
    return (
      state.phase === "INITIAL_GENERATION" &&
      (code === "PROVIDER_NETWORK_ERROR" || isServerTimeBudgetError(error))
    );
  }

  return (
    code === "PROVIDER_NETWORK_ERROR" ||
    code === "PROVIDER_AUTO_FAILED" ||
    code === "PROVIDER_QUOTA_ERROR" ||
    code === "GENERATION_CAN_SKIP_INVALID" ||
    isServerTimeBudgetError(error)
  );
}

function stripGenerationContinuationPrefix(message: string) {
  return message.replace(/^GENERATION_CONTINUE_AVAILABLE:\s*/i, "");
}

function generationSourceContextHash({
  config,
  blueprint,
  conceptContext,
  concepts,
}: {
  config: PaperConfig;
  blueprint: Blueprint;
  conceptContext: string;
  concepts: ConceptData[];
}) {
  return stableHash(
    JSON.stringify({
      classNum: config.classNum,
      subject: config.subject,
      subjects: config.subjects ?? [],
      chapterIds: config.chapterIds,
      topicIds: config.topicIds ?? [],
      questionComposition: config.questionComposition ?? [],
      questionTypes: config.questionTypes,
      typeDistribution: config.typeDistribution,
      integrationPrompt: config.integrationPrompt?.trim() ?? "",
      totalQuestions: blueprint.totalQuestions,
      totalMarks: blueprint.totalMarks,
      sourceMode: config.sourceMode ?? "curriculum",
      pdfSourceId: config.pdfSourceId ?? null,
      conceptSources: conceptSourceCounts(concepts),
      conceptIds: concepts.map((concept) => [
        concept.subject ?? "",
        concept.chapterId,
        concept.topicId ?? "",
        concept.topicName,
        concept.source ?? "unknown",
      ]),
      contextHash: stableHash(conceptContext),
    }),
  );
}

function stableHash(input: string) {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function generationServerBudgetMs() {
  const configured = Number(process.env.EDUTEST_SERVER_GENERATION_BUDGET_MS);
  if (Number.isFinite(configured) && configured >= 15_000 && configured <= 55_000) {
    return configured;
  }

  return 45_000;
}

function generationHeartbeatMs() {
  const configured = Number(process.env.EDUTEST_GENERATION_HEARTBEAT_MS);
  if (Number.isFinite(configured) && configured >= 3_000 && configured <= 20_000) {
    return configured;
  }

  return 8_000;
}

function streamStatusForGenerationState(status?: PaperGenerationState["status"]) {
  if (status === "NEEDS_CONTINUATION") return "CONTINUING";
  if (status === "FAILED") return "FAILED";
  if (status === "READY") return "READY";
  return "GENERATING";
}

function generationFinalizationReserveMs() {
  const configured = Number(process.env.EDUTEST_GENERATION_FINALIZATION_RESERVE_MS);
  if (Number.isFinite(configured) && configured >= 5_000 && configured <= 20_000) {
    return configured;
  }

  return 12_000;
}

function shouldStopForFinalization(deadlineAt: number, readyQuestionCount: number) {
  if (readyQuestionCount <= 0) return false;
  return deadlineAt - Date.now() <= generationFinalizationReserveMs();
}

function shouldStopBeforeNextGenerationCall(
  deadlineAt: number,
  context: CoverageGenerationStopContext,
) {
  const remainingMs = deadlineAt - Date.now();
  const reserveForFinalization = generationFinalizationReserveMs();
  const reserveForNextAiCall = Math.min(
    22_000,
    Math.max(10_000, context.nextQuestionCount * 2_750),
  );

  if (context.generatedQuestionCount > 0) {
    return remainingMs <= reserveForFinalization + Math.min(8_000, reserveForNextAiCall);
  }

  return remainingMs <= reserveForFinalization + reserveForNextAiCall;
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

function isServerTimeBudgetError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /SERVER_GENERATION_TIME_BUDGET_EXCEEDED|Vercel function time budget|server time budget/i.test(
    message,
  );
}

function isAIProviderRepairUnavailable(error: unknown) {
  return isAIProviderUnavailableError(error);
}

function selectedSourceTextNotEnoughError(scope: string) {
  return new Error(
    `SOURCE_TEXT_NOT_ENOUGH: Selected source text is not enough for ${scope}. Select more chapters/topics, upload stronger source text, or lower the question count.`,
  );
}

async function validateGeneratedPaperSkippingInvalid({
  questions,
  blueprint,
  config,
  conceptContext,
  scopedConcepts,
  availableTopics,
  generationPlan,
  allowDemoFallback,
  generationNonce,
  cooldownScope,
  healthyProviders,
  allowSourceBackedCompletion,
  deadlineAt,
  finalizationReserveMs,
  maxProviderAttempts,
  paperId,
  idempotencyKey,
  sourceContextHash,
  resumeState,
  partialFinalizationReason,
  signal,
  send,
  onStatePersisted,
}: {
  questions: GeneratedQuestion[];
  blueprint: Blueprint;
  config: PaperConfig;
  conceptContext: string;
  scopedConcepts: ConceptData[];
  availableTopics: string[];
  generationPlan: GenerationArchitecturePlan;
  allowDemoFallback: boolean;
  generationNonce: string;
  cooldownScope: string;
  healthyProviders?: DirectAIProvider[];
  allowSourceBackedCompletion: boolean;
  deadlineAt: number;
  finalizationReserveMs?: number;
  maxProviderAttempts?: number;
  paperId: number;
  idempotencyKey: string;
  sourceContextHash: string;
  resumeState?: PaperGenerationState | null;
  partialFinalizationReason?: string;
  signal: AbortSignal;
  send: (data: object, event?: string) => void;
  onStatePersisted?: (state: PaperGenerationState) => void;
}) {
  const bank = resumeState
    ? QuestionCandidateBank.fromGenerationState(resumeState, blueprint, config)
    : new QuestionCandidateBank(questions, blueprint, config);
  const targetQuestionCount = blueprint.totalQuestions;
  let stoppedForServerBudget = Boolean(partialFinalizationReason);
  let lastRepairError: string | undefined;
  let sourceBackedCompletedQuestions = 0;
  const stateCreatedAt = resumeState?.createdAt ?? new Date().toISOString();
  const persistBank = async (
    status: PaperGenerationState["status"],
    phase: PaperGenerationState["phase"],
    attemptCount: number,
    lastMessage?: string,
    lastError?: string,
  ) => {
    const state = bank.toGenerationState({
      status,
      phase,
      generationJobId: generationNonce,
      idempotencyKey,
      sourceContextHash,
      attemptCount,
      createdAt: stateCreatedAt,
      lastMessage,
      lastError,
    });
    await setPaperGenerationState(paperId, state, config);
    onStatePersisted?.(state);
  };

  await persistBank(
    bank.missingCount() > 0 ? "IN_PROGRESS" : "READY",
    "VALIDATION",
    resumeState?.attemptCount ?? 0,
    `Validated ${bank.readyCount()}/${targetQuestionCount} TXT-grounded candidates.`,
  );

  if (!stoppedForServerBudget) {
    for (let repairAttempt = 1; repairAttempt <= 3; repairAttempt += 1) {
    const missingSections = bank.missingSections();
    const missingCount = bank.missingCount();

    if (missingCount <= 0) break;

    if (shouldStopForFinalization(deadlineAt, bank.readyCount())) {
      stoppedForServerBudget = true;
      await persistBank(
        "NEEDS_CONTINUATION",
        "REPAIR",
        (resumeState?.attemptCount ?? 0) + repairAttempt - 1,
        "Server time budget is low; saved valid candidates for continuation.",
      );
      break;
    }

    const repairBlueprint = blueprintForSections(blueprint, missingSections);
    await persistBank(
      "IN_PROGRESS",
      "REPAIR",
      (resumeState?.attemptCount ?? 0) + repairAttempt,
      `Repairing ${missingCount} missing TXT-grounded question${missingCount === 1 ? "" : "s"}.`,
    );
    send({
      step: 6,
      pct: 88 + repairAttempt,
      progress: 88 + repairAttempt,
      msg: `Phase 6 - Validation Engine: repair attempt ${repairAttempt}/3 for ${missingCount} missing/invalid TXT-grounded question${missingCount === 1 ? "" : "s"}.`,
    });

    let replacements: GeneratedQuestion[] = [];
    try {
      replacements = await generateBlueprintQuestions(
        repairBlueprint,
        conceptContext,
        config,
        {
          availableTopics,
          allowPartial: true,
          candidateReserveCount: repairCandidateReserveCount(missingCount),
          existingQuestions: bank.allCandidates(),
          generationPlan,
          generationNonce: `${generationNonce}:repair:${repairAttempt}`,
          repairFeedback: bank.repairFeedback(repairAttempt),
          cooldownScope,
          healthyProviders,
          deadlineAt,
          finalizationReserveMs,
          maxProviderAttempts,
          signal,
          onBatchComplete: (details) => {
            send({
              step: 6,
              pct: 90 + repairAttempt,
              progress: 90 + repairAttempt,
              msg: `Phase 6 - Validation Engine: repair attempt ${repairAttempt}/3 produced ${details.generated}/${details.total} valid TXT-grounded AI question${details.generated === 1 ? "" : "s"}...`,
            });
          },
        },
      );
    } catch (error) {
      if (isServerTimeBudgetError(error)) {
        stoppedForServerBudget = true;
        await persistBank(
          "NEEDS_CONTINUATION",
          bank.readyCount() > 0 ? "REPAIR" : "QUESTION_GENERATION",
          (resumeState?.attemptCount ?? 0) + repairAttempt,
          "AI repair hit the server time budget; saved valid candidates for continuation.",
          error instanceof Error ? error.message : String(error),
        );
        break;
      }

      if (isAIProviderRepairUnavailable(error)) {
        lastRepairError = error instanceof Error ? error.message : String(error);
        await persistBank(
          "IN_PROGRESS",
          "REPAIR",
          (resumeState?.attemptCount ?? 0) + repairAttempt,
          "AI repair providers were unavailable; attempting selected-source completion.",
          lastRepairError,
        );
        break;
      }

      throw error;
    }

    if (replacements.length) {
      bank.add(replacements);
      await persistBank(
        bank.missingCount() > 0 ? "IN_PROGRESS" : "READY",
        "REPAIR",
        (resumeState?.attemptCount ?? 0) + repairAttempt,
        `Accepted ${bank.readyCount()}/${targetQuestionCount} TXT-grounded candidates after repair.`,
      );
    }
    }
  }

  if (
    allowSourceBackedCompletion &&
    !stoppedForServerBudget &&
    bank.missingCount() > 0
  ) {
    send({
      step: 6,
      pct: 94,
      progress: 94,
      msg: "Completing remaining questions from selected source text...",
    });
    const beforeCompletionReady = bank.readyCount();
    const completionQuestions = completeQuestionBankWithSourceBackedFallback({
      bank,
      concepts: scopedConcepts,
      config,
      startIndex: bank.allCandidates().length + 101,
    });

    sourceBackedCompletedQuestions = Math.max(
      0,
      bank.readyCount() - beforeCompletionReady,
    );
    await persistBank(
      bank.missingCount() > 0 ? "IN_PROGRESS" : "READY",
      "REPAIR",
      (resumeState?.attemptCount ?? 0) + 4,
      sourceBackedCompletedQuestions
        ? `Accepted ${sourceBackedCompletedQuestions} selected-source completion question${sourceBackedCompletedQuestions === 1 ? "" : "s"}.`
        : completionQuestions.length
          ? "Selected-source completion candidates were generated but did not pass validation."
          : "Selected source text cannot produce enough 100% distinct completion candidates.",
      lastRepairError,
    );
  }

  const validation = bank.result();
  const remainingMissingQuestions = bank.missingCount();
  const readyCount = bank.readyCount();
  const replacedQuestions = bank.replacedQuestions();
  const sourceBackedCompletionWarnings = sourceBackedCompletedQuestions
    ? [
        {
          type: "source-backed-completion",
          reason: `${sourceBackedCompletionMarker}: completed ${sourceBackedCompletedQuestions} final source-backed replacement question${sourceBackedCompletedQuestions === 1 ? "" : "s"} from selected source text.`,
        },
      ]
    : [];

  if (remainingMissingQuestions > 0) {
    if (stoppedForServerBudget) {
      const reason =
        partialFinalizationReason ??
        "Generation reached the deployment time limit during replacement.";
      await persistBank(
        "NEEDS_CONTINUATION",
        readyCount > 0 ? "REPAIR" : "QUESTION_GENERATION",
        (resumeState?.attemptCount ?? 0) + 3,
        `${reason} Saved ${readyCount}/${targetQuestionCount} valid candidate${readyCount === 1 ? "" : "s"} for continuation.`,
      );
      throw generationContinuationError(
        `${reason} Generated ${readyCount}/${targetQuestionCount} valid AI question${readyCount === 1 ? "" : "s"} from the selected source text. Saved progress. Retry continues this same paper instead of starting over.`,
      );
    }

    if (!allowDemoFallback) {
      const reason = `Selected source text cannot produce enough 100% distinct questions to replace ${remainingMissingQuestions} invalid or duplicate question${remainingMissingQuestions === 1 ? "" : "s"}.`;
      const sourceConceptCount = scopedConcepts.filter((concept) => {
        const source = concept.source;
        const textLength = concept.text?.replace(/\s+/g, " ").trim().length ?? 0;
        return (source === "ncert_txt" || source === "pdf") && textLength >= 80;
      }).length;
      const topRejectionReasons = Object.entries(validation.rejectionReasons ?? {})
        .map(([key, count]) => [key, Number(count) || 0] as const)
        .filter(([, count]) => count > 0)
        .sort((left, right) => right[1] - left[1])
        .slice(0, 3)
        .map(([key, count]) => `${key}:${count}`)
        .join(", ");
      const guidance = `Generated ${readyCount}/${targetQuestionCount} valid questions. Missing ${remainingMissingQuestions}. Select more chapters/topics, upload more source text, or lower the question count.`;
      const diagnostics = `Source concepts: ${sourceConceptCount}. Top rejection reasons: ${topRejectionReasons || "none"}.`;
      await persistBank(
        "FAILED",
        "REPAIR",
        (resumeState?.attemptCount ?? 0) + 4,
        undefined,
        `${reason} ${guidance} ${diagnostics}`,
      );
      throw new Error(
        `SOURCE_TEXT_NOT_ENOUGH: ${reason} ${guidance}`,
      );
    }

    if (readyCount > 0) {
      const reason =
        partialFinalizationReason ??
        "Generation reached the deployment time limit during replacement.";
      await persistBank(
        "NEEDS_CONTINUATION",
        "REPAIR",
        (resumeState?.attemptCount ?? 0) + 3,
        `${reason} Saved ${readyCount}/${targetQuestionCount} valid candidates for continuation.`,
      );
      if (!allowDemoFallback) {
        throw generationContinuationError(
          `${reason} Generated ${readyCount}/${targetQuestionCount} valid AI question${readyCount === 1 ? "" : "s"} from the selected source text. Saved progress. No local template paper was saved. Click Retry Auto to continue this same paper instead of starting over.`,
        );
      }

      return {
        ...validation,
        skipped: [
          ...validation.skipped,
          ...sourceBackedCompletionWarnings,
          {
            type: "server-time-budget",
            reason: `${reason} Saved ${readyCount}/${targetQuestionCount} valid question${readyCount === 1 ? "" : "s"}; ${remainingMissingQuestions} requested question${remainingMissingQuestions === 1 ? "" : "s"} could not be generated in time.`,
          },
        ],
        replacedQuestions,
        remainingMissingQuestions,
        sourceBackedCompletedQuestions,
      };
    }

    await persistBank(
      "FAILED",
      "REPAIR",
      (resumeState?.attemptCount ?? 0) + 3,
      undefined,
      `Could not produce any valid TXT-grounded candidates for ${remainingMissingQuestions} missing question${remainingMissingQuestions === 1 ? "" : "s"}.`,
    );
    throw new Error(
      `Could not replace ${remainingMissingQuestions} invalid or duplicate question${remainingMissingQuestions === 1 ? "" : "s"}. Generated ${readyCount}/${targetQuestionCount} valid questions. Use Retry Auto, choose another provider, or lower the question count.`,
    );
  }

  await persistBank(
    "READY",
    "FINALIZING",
    (resumeState?.attemptCount ?? 0) + 3,
    `Generation candidate bank complete with ${readyCount}/${targetQuestionCount} valid questions.`,
  );

  return {
    ...validation,
    skipped: [...validation.skipped, ...sourceBackedCompletionWarnings],
    replacedQuestions,
    remainingMissingQuestions,
    sourceBackedCompletedQuestions,
  };
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
