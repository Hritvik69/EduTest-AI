import { NextRequest } from "next/server";
import {
  jsonError,
  parseJsonWithSchema,
  rateLimit,
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
  providerHealthFailureMessage,
  publicAIProviderHealthSnapshot,
} from "@/lib/error-classification";
import { summarizeAIUsage } from "@/lib/ai-usage-log";
import { getChapterContent } from "@/lib/extractor";
import { buildGenerationManifest } from "@/lib/generation-manifest";
import { buildGenerationContract } from "@/lib/generation-contract";
import {
  checkAIProviderHealth,
  getConfiguredProviders,
  type AIProviderHealthSnapshot,
  type DirectAIProvider,
} from "@/lib/gemini";
import { signGuestPaperSnapshot } from "@/lib/guest-paper-snapshot";
import {
  generateBlueprintQuestions,
  generateDemoQuestions,
} from "@/lib/generator";
import { getUploadedPdfSourceConcepts } from "@/lib/pdf-source-store";
import {
  buildGenerationArchitecturePlan,
  type GenerationArchitecturePlan,
} from "@/lib/question-planning";
import {
  blueprintForSections,
  QuestionCandidateBank,
  repairCandidateReserveByType,
  stripGenerationMetadataFromQuestions,
  type PaperGenerationState,
} from "@/lib/question-candidate-bank";
import {
  analyzeSourceBackedCompletionCapacity,
  hasSourceBackedFallbackConcepts,
  sourceBackedCapacityMessage,
  type SourceBackedCapacityDiagnostics,
} from "@/lib/source-backed-fallback";
import { completeQuestionBankWithFinalFallbacks } from "@/lib/final-generation-completion";
import {
  buildSourceBackedProviderRecoveryBank,
  sourceBackedProviderRecoveryMode,
  sourceBackedProviderRecoveryWarning,
  type SourceBackedProviderRecoveryMode,
  type SourceBackedProviderRecoveryResult,
} from "@/lib/provider-outage-recovery";
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
  AIProvider,
  GenerationRiskLevel,
  PaperConfig,
  QuestionCompositionItem,
  QuestionType,
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
type ProviderRecoveryMode = SourceBackedProviderRecoveryMode;
type ActiveGenerationOperation =
  | "configuration"
  | "source_loading"
  | "planning"
  | "provider_preflight"
  | "ai_generation"
  | "validation_repair"
  | "finalize";
type GenerationFailureSource =
  | "provider"
  | "persistence"
  | "source"
  | "validation"
  | "deployment"
  | "unknown";

const globalForGenerationRequests = globalThis as typeof globalThis & {
  __edutestInFlightGenerationKeys?: Map<string, number>;
};
const inFlightGenerationKeys =
  globalForGenerationRequests.__edutestInFlightGenerationKeys ??
  new Map<string, number>();
globalForGenerationRequests.__edutestInFlightGenerationKeys = inFlightGenerationKeys;
const inFlightGenerationTtlMs = 10 * 60 * 1000;

function createSessionPaperId() {
  const random = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
  return `session-${Date.now()}-${random}`;
}

function sessionOnlyResumeState(): PaperGenerationState | null {
  return null;
}

export async function POST(request: NextRequest) {
  const auth = await requireAuthenticatedUser(request);
  if (auth.response) return auth.response;

  const limited = rateLimit(
    request,
    `generate-paper:${auth.user.id}`,
    6,
    10 * 60_000,
    { action: "paper generation requests" },
  );
  if (limited) return limited;

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
  const paperId = createSessionPaperId();
  const providerCooldownScope = `user:${auth.user.id}`;
  const releaseInFlightGeneration = acquireInFlightGeneration(
    auth.user.id,
    idempotencyKey,
  );
  if (!releaseInFlightGeneration) {
    return jsonError(
      "This exact paper generation is already running. Wait for it to finish, or retry after a minute if the previous request was interrupted.",
      409,
      { code: "GENERATION_IN_PROGRESS", idempotencyKey },
    );
  }

  const stream = new ReadableStream({
    async start(controller) {
      let streamClosed = false;
      let preflightPassed = false;
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
      let latestProviderHealth: AIProviderHealthSnapshot | null = null;
      let healthyProviders: DirectAIProvider[] | undefined;
      let providerRecoveryMode: ProviderRecoveryMode | undefined;
      let providerRecoveryWarnings: Array<{ type: string; reason: string }> = [];
      let activeOperation: ActiveGenerationOperation = "configuration";
      let failedOperation: ActiveGenerationOperation | null = null;
      const setActiveOperation = (operation: ActiveGenerationOperation) => {
        activeOperation = operation;
      };
      const runWithOperation = async <T,>(
        operation: ActiveGenerationOperation,
        run: () => Promise<T>,
      ) => {
        const previousOperation = activeOperation;
        activeOperation = operation;
        try {
          const result = await run();
          activeOperation = previousOperation;
          return result;
        } catch (error) {
          failedOperation = operation;
          throw error;
        }
      };
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
        ...providerRecoveryPayload(),
      });
      const providerHealthPayload = () =>
        latestProviderHealth
          ? {
              providerHealth: publicAIProviderHealthSnapshot(latestProviderHealth),
            }
          : {};
      const providerRecoveryPayload = () =>
        providerRecoveryMode ? { providerRecoveryMode } : {};
      const refreshProviderHealthAfterRuntimeFailure = async (error: unknown) => {
        if (
          request.signal.aborted ||
          generationSignal.aborted ||
          !isProviderOutageRecoverableForSource(error)
        ) {
          return;
        }

        try {
          latestProviderHealth = await checkAIProviderHealth({
            task: "QUESTION_GENERATION",
            providers: healthyProviders?.length
              ? healthyProviders
              : providersForHealthPreflight(config.aiProvider ?? "AUTO"),
            signal: generationSignal,
            cooldownScope: providerCooldownScope,
            timeoutMs: runtimeProviderHealthTimeoutMs(),
          });
        } catch (healthError) {
          console.warn("[generate-paper] runtime provider health refresh failed", {
            generationJobId,
            message:
              healthError instanceof Error
                ? healthError.message
                : String(healthError),
          });
        }
      };
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
        setActiveOperation("source_loading");
        let effectiveConfig = config as PaperConfig;
        const uploadedPdf =
          effectiveConfig.sourceMode === "pdf_upload"
            ? await runWithOperation("source_loading", () =>
                loadUploadedPdfSource(effectiveConfig.pdfSourceId, auth.user.id),
              )
            : null;
        const allowExplicitDemoFallback = Boolean(demoMode);
        const concepts = uploadedPdf
          ? uploadedPdf.concepts
          : await runWithOperation("source_loading", () =>
              getChapterContent(
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
                ),
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
        setActiveOperation("planning");
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
        let blueprint = generateBlueprint(effectiveConfig);
        const conceptContext = await runWithOperation("planning", () =>
          retrieveConcepts(
            scopedConcepts,
            effectiveConfig.difficulty,
            effectiveConfig.bloomDistribution,
          ),
        );
        const availableTopics = conceptTopics(scopedConcepts);
        let generationPlan = buildGenerationArchitecturePlan(
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
        const sourceCapacityRisk = qualityFirstSourceCapacityRisk({
          blueprint,
          config: effectiveConfig,
          concepts: scopedConcepts,
        });
        if (sourceCapacityRisk) {
          send({
            step: 3,
            pct: 28,
            progress: 28,
            msg: sourceCapacityRisk.message,
            sourceCapacity: sourceCapacityRisk.sourceCapacity,
            sourceCapacityRisk: true,
            ...contractPayload(),
          });
        }
        localFallbackContext = {
          effectiveConfig,
          blueprint,
          scopedConcepts,
        };
        let sourceContextHash = generationSourceContextHash({
          config: effectiveConfig,
          blueprint,
          conceptContext,
          concepts: scopedConcepts,
        });
        let resumeState: PaperGenerationState | null = sessionOnlyResumeState();
        if (resumePaperId) {
          console.info("[generate-paper] ignoring persisted resume for session-only generation", {
            resumePaperId,
            sessionPaperId: paperId,
            generationJobId,
            idempotencyKey,
          });
          send({
            step: 3,
            pct: 25,
            progress: 25,
            msg: "Session-only generation starts fresh from the selected configuration.",
            paperId,
            status: "GENERATING",
            ...contractPayload(),
          });
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
              "Session-only paper snapshot prepared; waiting for the first valid questions.",
          });
          updateRecoverySnapshot(initialGenerationState);
        }
        startHeartbeat();

        send({
          step: 3,
          pct: 30,
          progress: 30,
          msg: resumeState
            ? `Phase 3 - Question Planning: continuing saved generation from ${resumeState.readyQuestionCount}/${resumeState.targetQuestionCount} valid questions.`
            : "Phase 3 - Question Planning: session paper prepared; starting question generation.",
          paperId,
          status: resumeState ? "CONTINUING" : "GENERATING",
          generationPhase: recoverySnapshot.phase,
          readyQuestionCount: recoverySnapshot.readyQuestionCount,
          targetQuestionCount: recoverySnapshot.targetQuestionCount,
          missingQuestionCount: recoverySnapshot.missingQuestionCount,
          idempotencyKey,
          generationJobId,
        });

        if (!allowExplicitDemoFallback) {
          assertActive();
          setHeartbeatContext(3, 31, "Checking deployed AI provider health...");
          send({
            step: 3,
            pct: 31,
            progress: 31,
            msg: "Checking deployed AI provider health before paper generation...",
            ...recoveryPayload(),
          });
          const providerHealth = await runWithOperation("provider_preflight", () =>
            checkAIProviderHealth({
              task: "QUESTION_GENERATION",
              providers: providersForHealthPreflight(
                effectiveConfig.aiProvider ?? "AUTO",
              ),
              signal: generationSignal,
              cooldownScope: providerCooldownScope,
            }),
          );
          latestProviderHealth = providerHealth;
          healthyProviders = providerHealth.usableProviders;
          console.info("[generate-paper] provider health", {
            generationJobId,
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
          if (
            !healthyProviders.length &&
            !allowExplicitDemoFallback &&
            hasSourceBackedFallbackConcepts(scopedConcepts)
          ) {
            providerRecoveryMode = sourceBackedProviderRecoveryMode;
          }
          send({
            step: 3,
            pct: 32,
            progress: 32,
            msg: healthyProviders.length
              ? `AI provider health ready: ${healthyProviders.join(", ")} usable.`
              : hasSourceBackedFallbackConcepts(scopedConcepts)
                ? "No AI provider passed health preflight; continuing from selected TXT/PDF source text."
                : "No AI provider passed health preflight.",
            ...providerHealthPayload(),
            ...recoveryPayload(),
          });
          if (!healthyProviders.length) {
            if (!providerRecoveryMode) {
              throw sourceTextNotEnoughForProviderOutage(scopedConcepts);
            }
          } else {
            preflightPassed = true;
          }
        }

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
        let allQuestions = resumeState?.candidateQuestions ?? [];
        let coverageDiagnostics: CoverageGenerationDiagnostic[] = [];
        let stoppedDuringCoverageGeneration = false;
        const applyProviderRecoveryResult = (
          recovery: SourceBackedProviderRecoveryResult,
        ) => {
          blueprint = recovery.blueprint;
          effectiveConfig = recovery.config;
          generationPlan = buildGenerationArchitecturePlan(
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
          sourceContextHash = generationSourceContextHash({
            config: effectiveConfig,
            blueprint,
            conceptContext,
            concepts: scopedConcepts,
          });
          localFallbackContext = {
            effectiveConfig,
            blueprint,
            scopedConcepts,
          };
          providerRecoveryWarnings = [
            sourceBackedProviderRecoveryWarning(recovery.warnings),
            ...recovery.warnings,
          ];
          return recovery.candidateQuestions;
        };
        const persistQuestionGenerationState = async (
          candidateQuestions: GeneratedQuestion[],
          lastMessage: string,
          status: PaperGenerationState["status"] = "IN_PROGRESS",
        ) => {
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
              providerRecoveryMode = sourceBackedProviderRecoveryMode;
              send({
                step: 5,
                pct: 42,
                progress: 42,
                msg: "Phase 5 - Question Generation: providers unavailable; generating from selected TXT/PDF source text.",
                ...providerHealthPayload(),
                ...providerRecoveryPayload(),
              });
              const recovery = generateSourceBackedProviderOutageQuestions({
                blueprint,
                concepts: scopedConcepts,
                config: effectiveConfig,
                existingQuestions: [],
              });
              allQuestions = applyProviderRecoveryResult(recovery);
              const savedState = await persistQuestionGenerationState(
                allQuestions,
                `Phase 5 prepared ${allQuestions.length}/${blueprint.totalQuestions} source-backed questions after provider preflight outage.`,
              );
              if (savedState) {
                send({
                  step: 5,
                  pct: 84,
                  progress: 84,
                  msg: `Phase 5 - Question Generation: prepared ${savedState.readyQuestionCount}/${savedState.targetQuestionCount} valid source-backed questions.`,
                  ...recoveryPayload(),
                  ...providerHealthPayload(),
                });
              }
            } else {
              try {
                allQuestions = await runWithOperation("ai_generation", () =>
                  generateBlueprintQuestions(
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
                  ),
                );
                const savedState = await persistQuestionGenerationState(
                  allQuestions,
                  `Phase 5 prepared ${allQuestions.length}/${blueprint.totalQuestions} candidate questions before validation.`,
                );
                if (savedState) {
                  send({
                    step: 5,
                    pct: 84,
                    progress: 84,
                    msg: `Phase 5 - Question Generation: prepared ${savedState.readyQuestionCount}/${savedState.targetQuestionCount} valid questions before validation.`,
                    ...recoveryPayload(),
                  });
                }
              } catch (error) {
                if (
                  canUseSourceBackedProviderRecovery(
                    allowExplicitDemoFallback,
                    scopedConcepts,
                  ) &&
                  isProviderOutageRecoverableForSource(error)
                ) {
                  providerRecoveryMode = sourceBackedProviderRecoveryMode;
                  await refreshProviderHealthAfterRuntimeFailure(error);
                  send({
                    step: 5,
                    pct: 42,
                    progress: 42,
                    msg: "Phase 5 - Question Generation: providers unavailable; generating from selected TXT/PDF source text.",
                    ...providerHealthPayload(),
                    ...providerRecoveryPayload(),
                  });
                  const recovery = generateSourceBackedProviderOutageQuestions({
                    blueprint,
                    concepts: scopedConcepts,
                    config: effectiveConfig,
                    existingQuestions: [],
                  });
                  allQuestions = applyProviderRecoveryResult(recovery);
                  const savedState = await persistQuestionGenerationState(
                    allQuestions,
                    `Phase 5 prepared ${allQuestions.length}/${blueprint.totalQuestions} source-backed questions after provider outage.`,
                  );
                  if (savedState) {
                    send({
                      step: 5,
                      pct: 84,
                      progress: 84,
                      msg: `Phase 5 - Question Generation: prepared ${savedState.readyQuestionCount}/${savedState.targetQuestionCount} valid source-backed questions.`,
                      ...recoveryPayload(),
                      ...providerHealthPayload(),
                    });
                  }
                } else {
                  if (
                    !allowExplicitDemoFallback &&
                    isProviderOutageRecoverableForSource(error)
                  ) {
                    throw sourceTextNotEnoughForProviderOutage(scopedConcepts);
                  }
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
          let coverageGeneration;
          try {
            coverageGeneration = await runWithOperation("ai_generation", () =>
              generateCoveragePlannedQuestions({
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
                onProviderUnavailable: async ({ error }) => {
                  providerRecoveryMode = sourceBackedProviderRecoveryMode;
                  await refreshProviderHealthAfterRuntimeFailure(error);
                },
                onAcceptedBatch: async (details) => {
                  const savedCandidates = [
                    ...allQuestions,
                    ...details.generatedQuestions,
                  ];
                  const savedState = await persistQuestionGenerationState(
                    savedCandidates,
                    `Phase 5 prepared ${details.generated}/${details.total} focused questions across ${details.batch}/${details.batches} chunked AI batch${details.batches === 1 ? "" : "es"}.`,
                  );
                  if (savedState) {
                    send({
                      step: 5,
                      pct: 82,
                      progress: 82,
                      msg: `Phase 5 - Question Generation: prepared ${savedState.readyQuestionCount}/${savedState.targetQuestionCount} valid questions (${details.batch}/${details.batches} chunked AI batch${details.batches === 1 ? "" : "es"}).`,
                      ...recoveryPayload(),
                      ...providerHealthPayload(),
                    });
                  }
                },
                onProgress: (details) => {
                  const providerOutageRecovered =
                    details.diagnostic.generationMode === sourceBackedProviderRecoveryMode;
                  if (providerOutageRecovered) {
                    providerRecoveryMode = sourceBackedProviderRecoveryMode;
                  }
                  send({
                    step: 5,
                    pct: 82,
                    progress: 82,
                    msg: providerOutageRecovered
                      ? `Phase 5 - Question Generation: providers unavailable; generated ${details.label} from selected TXT/PDF (${details.diagnostic.generatedQuestions}/${details.diagnostic.requestedQuestions} question${details.diagnostic.requestedQuestions === 1 ? "" : "s"}).`
                      : `Phase 5 - Question Generation: ${details.label} - ${details.diagnostic.generatedQuestions}/${details.diagnostic.requestedQuestions} focused question${details.diagnostic.requestedQuestions === 1 ? "" : "s"} ready.`,
                    ...providerHealthPayload(),
                    ...providerRecoveryPayload(),
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
              }),
            );
          } catch (error) {
            if (
              !allowExplicitDemoFallback &&
              isProviderOutageRecoverableForSource(error)
            ) {
              throw sourceTextNotEnoughForProviderOutage(scopedConcepts);
            }
            throw error;
          }
          allQuestions = [...allQuestions, ...coverageGeneration.questions];
          coverageDiagnostics = coverageGeneration.diagnostics;
          stoppedDuringCoverageGeneration = coverageGeneration.stoppedForBudget;
        }

        if (
          stoppedDuringCoverageGeneration &&
          !allQuestions.length &&
          !canUseSourceBackedProviderRecovery(
            allowExplicitDemoFallback,
            scopedConcepts,
          )
        ) {
          await persistQuestionGenerationState(
            allQuestions,
            "Phase 5 stopped before the first AI chunk because the server time budget was too low. Retry starts a fresh session-only generation.",
            "FAILED",
          );
          throw serverGenerationBudgetError(
            "Server time budget was too low before the next AI chunk. Retry starts a fresh session-only generation.",
          );
        }

        let stoppedForServerBudget = shouldStopForFinalization(
          generationDeadlineAt,
          allQuestions.length,
        ) || stoppedDuringCoverageGeneration;
        if (
          stoppedForServerBudget &&
          canUseSourceBackedProviderRecovery(
            allowExplicitDemoFallback,
            scopedConcepts,
          )
        ) {
          providerRecoveryMode = sourceBackedProviderRecoveryMode;
          stoppedForServerBudget = false;
          send({
            step: 5,
            pct: 84,
            progress: 84,
            msg: "Phase 5 - Question Generation: AI time budget is low; completing from selected TXT/PDF source text.",
            ...providerHealthPayload(),
            ...providerRecoveryPayload(),
          });
        }
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
          idempotencyKey,
          sourceContextHash,
          resumeState,
          partialFinalizationReason: stoppedForServerBudget
            ? "Generation reached the deployment time limit before every requested question could be generated."
            : undefined,
          signal: generationSignal,
          send,
          onStatePersisted: updateRecoverySnapshot,
          onActiveOperation: setActiveOperation,
          onProviderUnavailable: async (error) => {
            providerRecoveryMode = sourceBackedProviderRecoveryMode;
            await refreshProviderHealthAfterRuntimeFailure(error);
          },
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
            ...providerHealthPayload(),
            ...providerRecoveryPayload(),
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
          ...providerHealthPayload(),
          ...providerRecoveryPayload(),
        });
        const storedQuestions = validated;
        const finalProviderRecoveryWarnings = providerRecoveryMode
          ? providerRecoveryWarnings.length
            ? providerRecoveryWarnings
            : [sourceBackedProviderRecoveryWarning()]
          : [];
        const finalValidationWarnings = [
          ...validation.skipped,
          ...finalProviderRecoveryWarnings,
        ];
        const manifest = buildGenerationManifest({
          config: effectiveConfig,
          blueprint: validation.blueprint,
          concepts: scopedConcepts,
          finalQuestions: storedQuestions,
          skippedQuestions: validation.remainingMissingQuestions,
          replacedQuestions: validation.replacedQuestions,
          validationWarnings: finalValidationWarnings,
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
        const paperSnapshotToken = await signGuestPaperSnapshot(
          readyPaper,
          auth.user.id,
        );

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
            validationWarnings: finalValidationWarnings,
            manifest,
            status: "READY",
            isDemoMode,
            createdAt: readyPaper.createdAt,
            sessionOnly: true,
            config: effectiveConfig,
            paperSnapshot: readyPaper,
            paperSnapshotToken,
            guestPaperToken: paperSnapshotToken,
            ...providerHealthPayload(),
            ...providerRecoveryPayload(),
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
        const failedActiveOperation = failedOperation ?? activeOperation;
        const failureSource = generationFailureSource(
          error,
          failedActiveOperation,
        );
        const errorClass = generationErrorClass(error, failureSource);
        console.error("[generate-paper] failed", {
          paperId,
          generationJobId,
          message,
          activeOperation: failedActiveOperation,
          failureSource,
          errorClass,
        });

        if (
          localFallbackContext &&
          !request.signal.aborted &&
          shouldUseLocalGenerationFallback(Boolean(demoMode), error)
        ) {
          try {
            await completeWithLocalGenerationFallback({
              paperId,
              context: localFallbackContext,
              generationJobId,
              idempotencyKey,
              ownerId: auth.user.id,
              originalError: error,
              sessionOnly: true,
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

        if (!request.signal.aborted && isProviderOutageRecoverableForSource(error)) {
          await refreshProviderHealthAfterRuntimeFailure(error);
        }

        if (!request.signal.aborted && !streamClosed) {
          const sourceCapacity = sourceCapacityFromError(error);
          send(
            {
              error: true,
              code,
              msg: generationErrorMessage(error, {
                providerHealth: latestProviderHealth,
                activeOperation: failedActiveOperation,
                failureSource,
              }),
              generationJobId,
              paperId,
              activeOperation: failedActiveOperation,
              failureSource,
              errorClass,
              generationPhase: recoverySnapshot.phase,
              readyQuestionCount: recoverySnapshot.readyQuestionCount,
              targetQuestionCount: recoverySnapshot.targetQuestionCount,
              missingQuestionCount: recoverySnapshot.missingQuestionCount,
              ...questionProgressPayload(error),
              recoveryReason: recoverySnapshot.lastMessage,
              ...(sourceCapacity ? { sourceCapacity } : {}),
              ...rejectionReasonsPayload(error),
              ...providerHealthPayload(),
              ...providerRecoveryPayload(),
              ...contractPayload(),
              status: "FAILED",
            },
            "error",
          );
        }
        close();
      } finally {
        stopHeartbeat();
        clearTimeout(generationDeadlineTimer);
        request.signal.removeEventListener("abort", abortGenerationFromClient);
        releaseInFlightGeneration();
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
}): SourceBackedProviderRecoveryResult {
  return buildSourceBackedProviderRecoveryBank({
    blueprint,
    concepts,
    config,
    existingQuestions,
    scope: "this paper",
    startIndex: existingQuestions.length + 101,
  });
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
  paperId: string;
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
    msg: "AI providers could not finish; using local fallback to finish this session paper.",
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
    msg: "Phase 7 - Final Paper Composition: preparing fallback paper snapshot.",
    paperId,
    status: "GENERATING",
    generationJobId,
  });

  const storedQuestions = stripGenerationMetadataFromQuestions(validation.questions);
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
  const paperSnapshotToken = await signGuestPaperSnapshot(readyPaper, ownerId);

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
      paperSnapshot: readyPaper,
      paperSnapshotToken,
      guestPaperToken: paperSnapshotToken,
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
  paperId: number | string;
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
    sessionOnly: typeof paperId === "string",
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

function generationErrorMessage(
  error: unknown,
  context: {
    providerHealth?: AIProviderHealthSnapshot | null;
    activeOperation?: ActiveGenerationOperation;
    failureSource?: GenerationFailureSource;
  } = {},
) {
  const message =
    error instanceof Error ? error.message : "Generation failed. Please try again.";
  const providerHealth = context.providerHealth ?? null;
  const hasProviderDiagnostics = Boolean(providerHealth);
  const activeOperation = context.activeOperation;
  const failureSource =
    context.failureSource ?? generationFailureSource(error, activeOperation);

  if (isFinalRepairValidationBlockedError(error)) {
    return stripFinalRepairValidationBlockedPrefix(message);
  }

  if (/SOURCE_TEXT_NOT_ENOUGH|Selected source text (?:is not enough|did not provide enough distinct material|cannot produce enough 100% distinct questions)/i.test(message)) {
    return stripSourceTextNotEnoughPrefix(message);
  }

  if (/SOURCE_NOT_TEXT_BACKED/i.test(message)) {
    return stripSourceGroundingPrefix(message);
  }

  if (/SERVER_GENERATION_TIME_BUDGET_EXCEEDED|Vercel function time budget|server time budget/i.test(message)) {
    return "Real AI generation reached the deployment time limit before enough valid questions were ready. Retry starts a fresh session-only generation; if this repeats, use fewer question formats or a faster configured provider.";
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
    if (providerHealth && !providerHealth.usableProviders.length) {
      return providerHealthFailureMessage(providerHealth);
    }
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
    if (failureSource === "source") {
      return "Source loading timed out before question generation. Check imported NCERT/PDF source availability, deployment health, and database reachability before retrying.";
    }
    if (failureSource === "provider" && hasProviderDiagnostics) {
      return "An AI provider request timed out after provider health preflight. Retry with Auto Fallback, reduce question count/format variety, or check the provider health details below.";
    }
    return "Generation stopped before provider diagnostics were available. Retry once; if this repeats, open deployment health and provider health, then check the first Vercel runtime log error.";
  }

  if (/empty response|text instead of valid JSON|malformed JSON/i.test(message)) {
    return "The AI provider returned invalid output. Use Skip & Replace to keep valid questions and rebuild the paper where possible, or retry with Auto Fallback.";
  }

  return compactAiProviderFailureMessage(message);
}

function generationFailureSource(
  error: unknown,
  activeOperation: ActiveGenerationOperation | undefined,
): GenerationFailureSource {
  const message = error instanceof Error ? error.message : String(error ?? "");

  if (
    /PAPER_PERSISTENCE_|Database save failed for generated paper persistence/i.test(
      message,
    )
  ) {
    return "persistence";
  }

  if (isFinalRepairValidationBlockedError(error)) {
    return "validation";
  }

  if (/SOURCE_TEXT_NOT_ENOUGH|SOURCE_NOT_TEXT_BACKED|Selected source text/i.test(message)) {
    return "source";
  }

  if (activeOperation === "source_loading" || activeOperation === "planning") {
    return "source";
  }

  if (
    activeOperation === "provider_preflight" ||
    activeOperation === "ai_generation" ||
    activeOperation === "validation_repair"
  ) {
    if (isAIProviderUnavailableError(error) || /AI provider|Gemini|GroqCloud|Mistral|Cerebras|MiniMax|OpenRouter|GitHub Models|Cohere|Cloudflare|Grok|DeepSeek|OpenAI/i.test(message)) {
      return "provider";
    }
    return activeOperation === "validation_repair" ? "validation" : "unknown";
  }

  if (/SERVER_GENERATION_TIME_BUDGET_EXCEEDED|Vercel function time budget/i.test(message)) {
    return "deployment";
  }

  return "unknown";
}

function generationErrorClass(
  error: unknown,
  failureSource: GenerationFailureSource,
) {
  const message = error instanceof Error ? error.message : String(error ?? "");

  if (isFinalRepairValidationBlockedError(error)) {
    return "validation_repair_blocked";
  }
  if (/timeout|timed out|ETIMEDOUT/i.test(message)) return `${failureSource}_timeout`;
  if (/network|fetch failed|ECONNRESET|ENOTFOUND/i.test(message)) {
    return `${failureSource}_network`;
  }
  if (/database|neon|postgres|sql/i.test(message)) return "persistence_database";
  const code = generationErrorCode(error);
  if (code) return code;
  return `${failureSource}_error`;
}

function shouldUseLocalGenerationFallback(isExplicitDemoMode: boolean, error: unknown) {
  const configured = process.env.EDUTEST_LOCAL_GENERATION_FALLBACK;
  if (configured === "false") return false;
  if (configured === "true") {
    return isExplicitDemoMode || process.env.NODE_ENV !== "production";
  }
  if (!isExplicitDemoMode) return false;

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
  return /AI provider|Auto Fallback|Gemini|GroqCloud|Mistral|Cerebras|OpenRouter|GitHub Models|Cohere|Cloudflare|Grok|DeepSeek|OpenAI|question generation|No valid generated questions|Could not replace/i.test(
    message,
  );
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

function providersForHealthPreflight(
  provider: AIProvider,
): DirectAIProvider[] | undefined {
  return provider === "AUTO" ? undefined : [provider];
}

function generationErrorCode(error: unknown) {
  const message =
    error instanceof Error ? error.message : "Generation failed. Please try again.";
  const explicitCode = explicitErrorCode(error);

  if (
    explicitCode === "FINAL_REPAIR_VALIDATION_BLOCKED" ||
    /^FINAL_REPAIR_VALIDATION_BLOCKED:/i.test(message)
  ) {
    return "FINAL_REPAIR_VALIDATION_BLOCKED";
  }

  if (/SOURCE_TEXT_NOT_ENOUGH|Selected source text (?:is not enough|did not provide enough distinct material|cannot produce enough 100% distinct questions)/i.test(message)) {
    return "SOURCE_TEXT_NOT_ENOUGH";
  }

  if (/SOURCE_NOT_TEXT_BACKED/i.test(message)) {
    return "SOURCE_NOT_TEXT_BACKED";
  }

  if (/PAPER_PERSISTENCE_TIMEOUT/i.test(message)) {
    return "PAPER_PERSISTENCE_TIMEOUT";
  }

  if (/PAPER_PERSISTENCE_|Database save failed for generated paper persistence/i.test(message)) {
    return "PAPER_PERSISTENCE_FAILED";
  }

  if (/No configured AI provider|No configured provider is usable|Set at least one AI provider key/i.test(message)) {
    return "PROVIDER_AUTO_FAILED";
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

function stripFinalRepairValidationBlockedPrefix(message: string) {
  return message.replace(/^FINAL_REPAIR_VALIDATION_BLOCKED:\s*/i, "");
}

function stripSourceTextNotEnoughPrefix(message: string) {
  return message.replace(/^SOURCE_TEXT_NOT_ENOUGH:\s*/i, "");
}

function explicitErrorCode(error: unknown) {
  if (!error || typeof error !== "object" || !("code" in error)) {
    return undefined;
  }
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" || typeof code === "number" ? code : undefined;
}

function isFinalRepairValidationBlockedError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return (
    explicitErrorCode(error) === "FINAL_REPAIR_VALIDATION_BLOCKED" ||
    /^FINAL_REPAIR_VALIDATION_BLOCKED:/i.test(message)
  );
}

function qualityFirstSourceCapacityRisk({
  blueprint,
  config,
  concepts,
}: {
  blueprint: Blueprint;
  config: PaperConfig;
  concepts: ConceptData[];
}): { message: string; sourceCapacity: SourceBackedCapacityDiagnostics } | null {
  if (!hasSourceBackedFallbackConcepts(concepts)) return null;

  const sourceCapacity = analyzeSourceBackedCompletionCapacity({
    bank: new QuestionCandidateBank([], blueprint, config),
    concepts,
    config,
  });
  const riskyTypes = Object.entries(sourceCapacity.byType ?? {}).filter(
    ([type, item]) =>
      fragileGenerationQuestionTypes.has(type as QuestionType) &&
      (item.effectiveAvailable ?? item.available) < item.required,
  );
  if (!riskyTypes.length) return null;

  const typeSummary = riskyTypes
    .map(([type, item]) => {
      const effective = item.effectiveAvailable ?? item.available;
      return `${type} ${effective}/${item.required}`;
    })
    .join(", ");

  return {
    sourceCapacity,
    message: `Source capacity risk: ${typeSummary}. Quality-first reserve is active and the requested mix will be preserved; if this repeats, add source text or lower fragile format counts.`,
  };
}

const fragileGenerationQuestionTypes = new Set<QuestionType>([
  "MCQ",
  "TRUE_FALSE",
  "MATCH_FOLLOWING",
  "ASSERTION_REASON",
  "SHORT",
  "FILL_BLANK",
  "ONE_WORD",
]);

function sourceCapacityFromError(error: unknown) {
  if (!error || typeof error !== "object" || !("sourceCapacity" in error)) {
    return undefined;
  }

  const value = (error as { sourceCapacity?: unknown }).sourceCapacity;
  return isSourceBackedCapacityDiagnostics(value) ? value : undefined;
}

function rejectionReasonsPayload(error: unknown) {
  if (!error || typeof error !== "object" || !("rejectionReasons" in error)) {
    return {};
  }

  const value = (error as { rejectionReasons?: unknown }).rejectionReasons;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return { rejectionReasons: value };
}

function questionProgressPayload(error: unknown) {
  if (!error || typeof error !== "object") return {};
  const record = error as {
    readyQuestionCount?: unknown;
    targetQuestionCount?: unknown;
    missingQuestionCount?: unknown;
  };
  const readyQuestionCount = numericErrorField(record.readyQuestionCount);
  const targetQuestionCount = numericErrorField(record.targetQuestionCount);
  const missingQuestionCount = numericErrorField(record.missingQuestionCount);

  return {
    ...(readyQuestionCount !== undefined ? { readyQuestionCount } : {}),
    ...(targetQuestionCount !== undefined ? { targetQuestionCount } : {}),
    ...(missingQuestionCount !== undefined ? { missingQuestionCount } : {}),
  };
}

function numericErrorField(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function isSourceBackedCapacityDiagnostics(
  value: unknown,
): value is SourceBackedCapacityDiagnostics {
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<SourceBackedCapacityDiagnostics>;
  return (
    typeof record.requiredMissingCount === "number" &&
    typeof record.availableStrictCapacity === "number" &&
    typeof record.sourceConceptCount === "number" &&
    typeof record.atomCount === "number" &&
    typeof record.consumedAtomTypeKeys === "number" &&
    typeof record.enough === "boolean"
  );
}

function sourceTextNotEnoughForProviderOutage(concepts: ConceptData[]) {
  const sourceConceptCount = concepts.filter((concept) => {
    const source = concept.source;
    const textLength = concept.text?.replace(/\s+/g, " ").trim().length ?? 0;
    return (source === "ncert_txt" || source === "pdf") && textLength >= 80;
  }).length;
  return new Error(
    `SOURCE_TEXT_NOT_ENOUGH: No AI provider passed health preflight, and the selected TXT/PDF source text is not enough for deterministic source-backed completion. Source concepts: ${sourceConceptCount}. Select more chapters/topics, upload more source text, or lower the question count.`,
  );
}

function serverGenerationBudgetError(message: string) {
  return new Error(`SERVER_GENERATION_TIME_BUDGET_EXCEEDED: ${message}`);
}

function finalRepairValidationBlockedError({
  message,
  readyQuestionCount,
  targetQuestionCount,
  missingQuestionCount,
  sourceCapacity,
  rejectionReasons,
}: {
  message: string;
  readyQuestionCount: number;
  targetQuestionCount: number;
  missingQuestionCount: number;
  sourceCapacity: SourceBackedCapacityDiagnostics;
  rejectionReasons: Record<string, number>;
}) {
  const error = new Error(`FINAL_REPAIR_VALIDATION_BLOCKED: ${message}`);
  (
    error as Error & {
      code?: string;
      readyQuestionCount?: number;
      targetQuestionCount?: number;
      missingQuestionCount?: number;
      sourceCapacity?: SourceBackedCapacityDiagnostics;
      rejectionReasons?: Record<string, number>;
      activeOperation?: ActiveGenerationOperation;
      failureSource?: GenerationFailureSource;
    }
  ).code = "FINAL_REPAIR_VALIDATION_BLOCKED";
  (
    error as Error & {
      readyQuestionCount?: number;
      targetQuestionCount?: number;
      missingQuestionCount?: number;
    }
  ).readyQuestionCount = readyQuestionCount;
  (
    error as Error & {
      targetQuestionCount?: number;
    }
  ).targetQuestionCount = targetQuestionCount;
  (
    error as Error & {
      missingQuestionCount?: number;
    }
  ).missingQuestionCount = missingQuestionCount;
  (
    error as Error & {
      sourceCapacity?: SourceBackedCapacityDiagnostics;
    }
  ).sourceCapacity = sourceCapacity;
  (
    error as Error & {
      rejectionReasons?: Record<string, number>;
    }
  ).rejectionReasons = rejectionReasons;
  (
    error as Error & {
      activeOperation?: ActiveGenerationOperation;
      failureSource?: GenerationFailureSource;
    }
  ).activeOperation = "validation_repair";
  (
    error as Error & {
      failureSource?: GenerationFailureSource;
    }
  ).failureSource = "validation";
  return error;
}

function finalRepairValidationBlockedMessage({
  readyCount,
  targetQuestionCount,
  remainingMissingQuestions,
  sourceCapacity,
  rejectionSummary,
}: {
  readyCount: number;
  targetQuestionCount: number;
  remainingMissingQuestions: number;
  sourceCapacity: SourceBackedCapacityDiagnostics;
  rejectionSummary: string;
}) {
  const effectiveCapacity =
    sourceCapacity.effectiveCapacity ?? sourceCapacity.availableStrictCapacity;
  const rawCapacity = sourceCapacity.rawAtomCapacity ?? sourceCapacity.availableStrictCapacity;

  return `Final completion tried strict source-backed repair and chapter/topic-near fallback, but validation still rejected the remaining candidates. Strict selected-source capacity was ${effectiveCapacity}/${sourceCapacity.requiredMissingCount} effective from ${rawCapacity} raw source slot${rawCapacity === 1 ? "" : "s"}. Generated ${readyCount}/${targetQuestionCount} valid questions; ${remainingMissingQuestions} still missing. Top rejection reasons: ${rejectionSummary}.`;
}

function topValidationRejectionReasons(
  reasons: Partial<Record<string, number>> | undefined,
) {
  return Object.entries(reasons ?? {})
    .map(([key, count]) => [key, Number(count) || 0] as const)
    .filter(([, count]) => count > 0)
    .sort((left, right) => right[1] - left[1])
    .slice(0, 3);
}

function formatTopRejectionReasons(
  reasons: Array<readonly [string, number]>,
) {
  return reasons.length
    ? reasons.map(([key, count]) => `${key}:${count}`).join(", ")
    : "none";
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

  return 52_000;
}

function generationHeartbeatMs() {
  const configured = Number(process.env.EDUTEST_GENERATION_HEARTBEAT_MS);
  if (Number.isFinite(configured) && configured >= 3_000 && configured <= 20_000) {
    return configured;
  }

  return 8_000;
}

function runtimeProviderHealthTimeoutMs() {
  const configured = Number(process.env.EDUTEST_RUNTIME_PROVIDER_HEALTH_TIMEOUT_MS);
  if (Number.isFinite(configured) && configured >= 1_500 && configured <= 6_000) {
    return Math.floor(configured);
  }

  return 2_500;
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

function sourceBackedCompletionReserveMs() {
  const configured = Number(process.env.EDUTEST_SOURCE_BACKED_COMPLETION_RESERVE_MS);
  if (Number.isFinite(configured) && configured >= 250 && configured <= 5_000) {
    return Math.floor(configured);
  }

  return 1_000;
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

function canUseSourceBackedProviderRecovery(
  allowExplicitDemoFallback: boolean,
  concepts: ConceptData[],
) {
  return !allowExplicitDemoFallback && hasSourceBackedFallbackConcepts(concepts);
}

function isProviderOutageRecoverableForSource(error: unknown) {
  return isAIProviderUnavailableError(error) || isServerTimeBudgetError(error);
}

function isAIProviderRepairUnavailable(error: unknown) {
  return isProviderOutageRecoverableForSource(error);
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
  idempotencyKey,
  sourceContextHash,
  resumeState,
  partialFinalizationReason,
  signal,
  send,
  onStatePersisted,
  onActiveOperation,
  onProviderUnavailable,
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
  idempotencyKey: string;
  sourceContextHash: string;
  resumeState?: PaperGenerationState | null;
  partialFinalizationReason?: string;
  signal: AbortSignal;
  send: (data: object, event?: string) => void;
  onStatePersisted?: (state: PaperGenerationState) => void;
  onActiveOperation?: (operation: ActiveGenerationOperation) => void;
  onProviderUnavailable?: (error: unknown) => void | Promise<void>;
}) {
  let bank = resumeState
    ? QuestionCandidateBank.fromGenerationState(resumeState, blueprint, config)
    : new QuestionCandidateBank(questions, blueprint, config);
  let activeBlueprint = blueprint;
  let activeConfig = config;
  const targetQuestionCount = blueprint.totalQuestions;
  let stoppedForServerBudget = Boolean(partialFinalizationReason);
  let lastRepairError: string | undefined;
  let sourceBackedCompletedQuestions = 0;
  let finalCompletionSourceCapacity: SourceBackedCapacityDiagnostics | undefined;
  const finalCompletionWarnings: Array<{ type: string; reason: string }> = [];
  const stateCreatedAt = resumeState?.createdAt ?? new Date().toISOString();
  const sourceBackedRepairRecoveryAvailable =
    allowSourceBackedCompletion && hasSourceBackedFallbackConcepts(scopedConcepts);
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
        if (sourceBackedRepairRecoveryAvailable) {
          lastRepairError =
            "SERVER_GENERATION_TIME_BUDGET_EXCEEDED: Server time budget is low before AI repair.";
          await persistBank(
            "IN_PROGRESS",
            "REPAIR",
            (resumeState?.attemptCount ?? 0) + repairAttempt - 1,
            "Server time budget is low; attempting selected-source completion.",
            lastRepairError,
          );
          break;
        }

        stoppedForServerBudget = true;
        await persistBank(
          "NEEDS_CONTINUATION",
          "REPAIR",
          (resumeState?.attemptCount ?? 0) + repairAttempt - 1,
          "Server time budget is low; retry starts a fresh session-only generation.",
        );
        break;
      }

      const repairBlueprint = blueprintForSections(activeBlueprint, missingSections);
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
        onActiveOperation?.("validation_repair");
        replacements = await generateBlueprintQuestions(
          repairBlueprint,
          conceptContext,
          activeConfig,
          {
            availableTopics,
            allowPartial: true,
            candidateReserveByType: repairCandidateReserveByType(missingSections),
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
          if (sourceBackedRepairRecoveryAvailable) {
            await onProviderUnavailable?.(error);
            lastRepairError = error instanceof Error ? error.message : String(error);
            await persistBank(
              "IN_PROGRESS",
              "REPAIR",
              (resumeState?.attemptCount ?? 0) + repairAttempt,
              "AI repair hit the server time budget; attempting selected-source completion.",
              lastRepairError,
            );
            break;
          }

          stoppedForServerBudget = true;
          await persistBank(
            "NEEDS_CONTINUATION",
            bank.readyCount() > 0 ? "REPAIR" : "QUESTION_GENERATION",
            (resumeState?.attemptCount ?? 0) + repairAttempt,
            "AI repair hit the server time budget; retry starts a fresh session-only generation.",
            error instanceof Error ? error.message : String(error),
          );
          break;
        }

        if (isAIProviderRepairUnavailable(error)) {
          await onProviderUnavailable?.(error);
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
    !allowDemoFallback &&
    !stoppedForServerBudget &&
    bank.missingCount() > 0
  ) {
    send({
      step: 6,
      pct: 94,
      progress: 94,
      msg: "Completing remaining questions from selected source text and chapter/topic-near coverage...",
    });
    const beforeFinalCompletionReady = bank.readyCount();
    const completion = completeQuestionBankWithFinalFallbacks({
      bank,
      blueprint: activeBlueprint,
      config: activeConfig,
      concepts: scopedConcepts,
      scope: "replacing invalid or duplicate questions",
      startIndex: bank.allCandidates().length + 101,
      deadlineAt,
      minRemainingMs: sourceBackedCompletionReserveMs(),
      requireSyllabusComposition: true,
    });
    bank = completion.bank;
    activeBlueprint = completion.blueprint;
    activeConfig = completion.config;
    sourceBackedCompletedQuestions = completion.sourceBackedCompletedQuestions;
    finalCompletionSourceCapacity = completion.sourceCapacity;
    finalCompletionWarnings.push(...completion.warnings);

    const finalCompletedQuestions = Math.max(
      0,
      bank.readyCount() - beforeFinalCompletionReady,
    );
    await persistBank(
      bank.missingCount() > 0 ? "IN_PROGRESS" : "READY",
      "REPAIR",
      (resumeState?.attemptCount ?? 0) + 5,
      finalCompletedQuestions
        ? `Accepted ${finalCompletedQuestions} final fallback replacement question${finalCompletedQuestions === 1 ? "" : "s"}.`
        : "Final fallback completion could not produce additional valid questions.",
      lastRepairError,
    );
  }

  const validation = bank.result();
  const remainingMissingQuestions = bank.missingCount();
  const readyCount = bank.readyCount();
  const replacedQuestions = bank.replacedQuestions();
  const validationWarnings = finalCompletionWarnings;

  if (remainingMissingQuestions > 0) {
    if (stoppedForServerBudget) {
      const reason =
        partialFinalizationReason ??
        "Generation reached the deployment time limit during replacement.";
      await persistBank(
        "FAILED",
        readyCount > 0 ? "REPAIR" : "QUESTION_GENERATION",
        (resumeState?.attemptCount ?? 0) + 3,
        `${reason} Generated ${readyCount}/${targetQuestionCount} valid candidate${readyCount === 1 ? "" : "s"}. Retry starts a fresh session-only generation.`,
      );
      throw serverGenerationBudgetError(
        `${reason} Generated ${readyCount}/${targetQuestionCount} valid AI question${readyCount === 1 ? "" : "s"} from the selected source text. Retry starts a fresh session-only generation.`,
      );
    }

    if (!allowDemoFallback) {
      const topRejectionReasons = topValidationRejectionReasons(
        validation.rejectionReasons,
      );
      const rejectionSummary = formatTopRejectionReasons(topRejectionReasons);
      const sourceCapacity = finalCompletionSourceCapacity;

      if (!sourceCapacity) {
        await persistBank(
          "FAILED",
          "REPAIR",
          (resumeState?.attemptCount ?? 0) + 4,
          undefined,
          `Final fallback completion did not run, and ${remainingMissingQuestions} question${remainingMissingQuestions === 1 ? "" : "s"} remain missing. Top rejection reasons: ${rejectionSummary}.`,
        );
        throw new Error(
          `FINAL_REPAIR_VALIDATION_BLOCKED: Final fallback completion did not run. Generated ${readyCount}/${targetQuestionCount} valid questions; ${remainingMissingQuestions} still missing.`,
        );
      }

      const blockedMessage = finalRepairValidationBlockedMessage({
        readyCount,
        targetQuestionCount,
        remainingMissingQuestions,
        sourceCapacity,
        rejectionSummary,
      });
      await persistBank(
        "FAILED",
        "REPAIR",
        (resumeState?.attemptCount ?? 0) + 4,
        undefined,
        `${blockedMessage} ${sourceBackedCapacityMessage(sourceCapacity)}`,
      );
      throw finalRepairValidationBlockedError({
        message: blockedMessage,
        readyQuestionCount: readyCount,
        targetQuestionCount,
        missingQuestionCount: remainingMissingQuestions,
        sourceCapacity,
        rejectionReasons: Object.fromEntries(topRejectionReasons),
      });
    }

    if (readyCount > 0) {
      const reason =
        partialFinalizationReason ??
        "Generation reached the deployment time limit during replacement.";
      await persistBank(
        "FAILED",
        "REPAIR",
        (resumeState?.attemptCount ?? 0) + 3,
        `${reason} Generated ${readyCount}/${targetQuestionCount} valid candidates. Retry starts a fresh session-only generation.`,
      );
      if (!allowDemoFallback) {
        throw serverGenerationBudgetError(
          `${reason} Generated ${readyCount}/${targetQuestionCount} valid AI question${readyCount === 1 ? "" : "s"} from the selected source text. Retry starts a fresh session-only generation.`,
        );
      }

      return {
        ...validation,
        skipped: [
          ...validation.skipped,
          ...validationWarnings,
          {
            type: "server-time-budget",
            reason: `${reason} Generated ${readyCount}/${targetQuestionCount} valid question${readyCount === 1 ? "" : "s"}; ${remainingMissingQuestions} requested question${remainingMissingQuestions === 1 ? "" : "s"} could not be generated in time.`,
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
    skipped: [...validation.skipped, ...validationWarnings],
    replacedQuestions,
    remainingMissingQuestions,
    sourceBackedCompletedQuestions,
  };
}

function acquireInFlightGeneration(userId: number, idempotencyKey: string) {
  const now = Date.now();
  for (const [key, expiresAt] of Array.from(inFlightGenerationKeys.entries())) {
    if (expiresAt <= now) inFlightGenerationKeys.delete(key);
  }

  const key = `${userId}:${idempotencyKey}`;
  const activeUntil = inFlightGenerationKeys.get(key);
  if (activeUntil && activeUntil > now) return null;

  inFlightGenerationKeys.set(key, now + inFlightGenerationTtlMs);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    inFlightGenerationKeys.delete(key);
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
