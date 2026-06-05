"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  Circle,
  ListRestart,
  Loader2,
  RefreshCw,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { fetchApiData } from "@/lib/api-client";
import { generateBlueprint } from "@/lib/blueprint";
import {
  providerHealthAction,
  providerHealthSummary,
  type PublicAIProviderHealthSnapshot,
} from "@/lib/error-classification";
import { buildGenerationContract } from "@/lib/generation-contract";
import {
  classifyRecoveredPaper,
  type GenerationRecoveryDecision,
} from "@/lib/generation-recovery";
import { generationPhaseLabels } from "@/lib/question-planning";
import { cn } from "@/lib/utils";
import type {
  AIProvider,
  GenerationRiskLevel,
  PaperConfig,
  StoredPaper,
} from "@/types";

const progressSteps = generationPhaseLabels;

type ProviderStatus = {
  gemini: boolean;
  groq: boolean;
  grok: boolean;
  mistral: boolean;
  deepseek: boolean;
  minimax: boolean;
  openrouter: boolean;
  githubModels: boolean;
  cohere: boolean;
  cloudflare: boolean;
  openai: boolean;
  cerebras: boolean;
  defaultProvider: string;
  geminiModel: string;
  groqModel: string;
  grokModel: string;
  mistralModel: string;
  cerebrasModel: string;
  deepseekModel: string;
  miniMaxModel: string;
  openRouterModel: string;
  githubModelsModel: string;
  cohereModel: string;
  cloudflareModel: string;
  openAIModel: string;
};

type GenerationStreamContractSummary = {
  contractHash: string;
  generationModeLabel: string;
  plannedCalls: number;
  riskLevel: GenerationRiskLevel;
  chunkingNote?: string;
  source: "server" | "client";
};

type GenerationStreamRecoverySnapshot = {
  paperId: string;
  status?: string;
  generationPhase?: string;
  readyQuestionCount?: number;
  targetQuestionCount?: number;
  missingQuestionCount?: number;
  recoveryReason?: string;
};
type ProviderRecoveryMode = "source_backed_provider_outage";
type SourceCapacityDiagnostics = {
  requiredMissingCount: number;
  rawAtomCapacity?: number;
  effectiveCapacity?: number;
  effectiveMissingCount?: number;
  availableStrictCapacity: number;
  sourceConceptCount: number;
  atomCount: number;
  consumedAtomTypeKeys: number;
  enough: boolean;
  byType?: Record<
    string,
    {
      required: number;
      available: number;
      rawAvailable?: number;
      effectiveAvailable?: number;
      consumed: number;
      missing?: number;
      skipped?: {
        duplicate: number;
        repeatedSourceKey: number;
        validation: number;
      };
      blockerReasons?: string[];
    }
  >;
  duplicatePressure?: {
    duplicateRejections: number;
    duplicateGroups: number;
    sourceBackedCandidates: number;
  };
};

export function GenerationOverlay({
  config,
  open,
  onClose,
}: {
  config: PaperConfig;
  open: boolean;
  onClose?: () => void;
}) {
  const router = useRouter();
  const [activeIndex, setActiveIndex] = React.useState(0);
  const [progress, setProgress] = React.useState(8);
  const [generationStartedAt, setGenerationStartedAt] = React.useState<number | null>(
    null,
  );
  const [generationNow, setGenerationNow] = React.useState(() => Date.now());
  const [currentMessage, setCurrentMessage] = React.useState(
    "Preparing generation...",
  );
  const [providerOverride, setProviderOverride] = React.useState<AIProvider | null>(
    null,
  );
  const [providerStatus, setProviderStatus] = React.useState<ProviderStatus | null>(
    null,
  );
  const [streamContract, setStreamContract] =
    React.useState<GenerationStreamContractSummary | null>(null);
  const [providerRecoveryMode, setProviderRecoveryMode] =
    React.useState<ProviderRecoveryMode | null>(null);
  const [salvageInvalidQuestions, setSalvageInvalidQuestions] =
    React.useState(true);
  const [error, setError] = React.useState<{
    message: string;
    code?: string | number;
    auth?: boolean;
    paperId?: number;
    recoverable?: boolean;
    readyQuestionCount?: number;
    targetQuestionCount?: number;
    missingQuestionCount?: number;
    providerHealth?: PublicAIProviderHealthSnapshot;
    providerRecoveryMode?: ProviderRecoveryMode;
    sourceCapacity?: SourceCapacityDiagnostics;
    activeOperation?: string;
    failureSource?: string;
    errorClass?: string;
  } | null>(null);
  const [resumePaperId, setResumePaperId] = React.useState<number | null>(null);
  const [retryNonce, setRetryNonce] = React.useState(0);
  const started = React.useRef(false);
  const autoContinueAttempts = React.useRef(0);
  const zeroProgressAutoContinueAttempts = React.useRef(0);
  const autoContinueTimer = React.useRef<number | null>(null);
  const resumePaperIdRef = React.useRef<number | null>(null);
  const requestConfig = React.useMemo(
    () =>
      providerOverride
        ? {
            ...config,
            aiProvider: providerOverride,
          }
        : config,
    [config, providerOverride],
  );
  const generationContract = React.useMemo(() => {
    try {
      return buildGenerationContract(requestConfig, generateBlueprint(requestConfig));
    } catch {
      return null;
    }
  }, [requestConfig]);
  const clientContract = React.useMemo<GenerationStreamContractSummary | null>(() => {
    if (!generationContract) return null;
    const chunkingNote = generationContract.apiEstimate.riskReasons.find((reason) =>
      /chunked focused batches/i.test(reason),
    );
    return {
      contractHash: generationContract.hash,
      generationModeLabel:
        generationContract.paper.generationMode === "source_exact"
          ? "NCERT/PDF Source"
          : "Fresh Questions",
      plannedCalls: generationContract.apiEstimate.plannedCalls,
      riskLevel: generationContract.apiEstimate.riskLevel,
      source: "client",
      ...(chunkingNote ? { chunkingNote } : {}),
    };
  }, [generationContract]);
  const idempotencyKey = React.useMemo(
    () =>
      randomGenerationKey(
        `${open}:${retryNonce}:${requestConfig.aiProvider}:${requestConfig.classNum}:${requestConfig.subject}:${requestConfig.totalQuestions}:${salvageInvalidQuestions}`,
      ),
    [open, requestConfig, retryNonce, salvageInvalidQuestions],
  );

  React.useEffect(() => {
    resumePaperIdRef.current = resumePaperId;
  }, [resumePaperId]);

  React.useEffect(() => {
    if (open) return;
    let cancelled = false;
    started.current = false;
    clearAutoContinueTimer(autoContinueTimer);
    autoContinueAttempts.current = 0;
    zeroProgressAutoContinueAttempts.current = 0;
    queueMicrotask(() => {
      if (cancelled) return;
      setActiveIndex(0);
      setProgress(8);
      setGenerationStartedAt(null);
      setGenerationNow(Date.now());
      setCurrentMessage("Preparing generation...");
      setProviderOverride(null);
      setStreamContract(null);
      setProviderRecoveryMode(null);
      setSalvageInvalidQuestions(true);
      setResumePaperId(null);
      setError(null);
    });

    return () => {
      cancelled = true;
    };
  }, [open]);

  React.useEffect(() => {
    if (!open) return;
    let cancelled = false;

    fetchApiData<ProviderStatus>(
      "/api/ai/providers",
      undefined,
      "Could not load AI provider status.",
    )
      .then((payload) => {
        if (!cancelled) setProviderStatus(payload);
      })
      .catch(() => {
        if (!cancelled) setProviderStatus(null);
      });

    return () => {
      cancelled = true;
    };
  }, [open]);

  React.useEffect(() => {
    if (!open || started.current) return;
    let cancelled = false;
    const requestedResumePaperId = resumePaperIdRef.current;
    started.current = true;
    queueMicrotask(() => {
      if (cancelled) return;
      setError(null);
      setActiveIndex(0);
      setProgress(8);
      const startedAt = Date.now();
      setGenerationStartedAt(startedAt);
      setGenerationNow(startedAt);
      setStreamContract(null);
      setProviderRecoveryMode(null);
      setCurrentMessage(
        requestedResumePaperId
          ? `Continuing saved generation from paper #${requestedResumePaperId}...`
          : "Preparing generation...",
      );
    });

    const inFlightKey = `edutest:generation:${idempotencyKey}`;
    clearStaleGenerationSessionKeys();
    const existingStartedAt = safeSessionGet(inFlightKey);
    if (existingStartedAt && !isStaleGeneration(existingStartedAt)) {
      queueMicrotask(() => {
        if (cancelled) return;
        setError({
          code: "GENERATION_IN_PROGRESS",
          message:
            "This exact paper is already being generated. Wait a little, or retry if the previous run was interrupted.",
        });
      });
      started.current = false;
      return () => {
        cancelled = true;
      };
    }

    safeSessionSet(inFlightKey, new Date().toISOString());
    const controller = new AbortController();
    const slowTimer = window.setTimeout(() => {
      if (cancelled) return;
      setCurrentMessage(
        "Still working. Slow providers are being skipped faster now; use Retry Auto if this keeps waiting.",
      );
    }, generationSlowWarningMs());
    const hardTimer = window.setTimeout(() => {
      if (cancelled || controller.signal.aborted) return;
      started.current = false;
      safeSessionRemove(inFlightKey);
      const message =
        "Generation is taking too long. Retry Auto, use Skip & Replace, or lower the question count.";
      setError({
        code: "GENERATION_TIMEOUT",
        message,
      });
      toast.error(message);
      controller.abort();
    }, generationHardTimeoutMs());

    async function run() {
      let completed = false;
      let savedPaperId: string | null = null;
      let lastRecoverySnapshot: GenerationStreamRecoverySnapshot | null = null;
      let observedProviderRecoveryMode: ProviderRecoveryMode | null = null;

      try {
        const response = await fetch("/api/generate-paper", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            ...requestConfig,
            idempotencyKey,
            resumePaperId: requestedResumePaperId ?? undefined,
            salvageInvalidQuestions,
          }),
        });

        if (!response.ok) {
          const payload = await response.json().catch(() => null);
          throw generationError(
            payload?.error ?? "Paper generation failed.",
            payload?.code ?? response.status,
          );
        }

        if (!response.body) throw new Error("Generation stream did not start.");

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const chunks = buffer.split("\n\n");
          buffer = chunks.pop() ?? "";

          chunks.forEach((chunk) => {
            const eventLine = chunk
              .split("\n")
              .find((line) => line.startsWith("event:"));
            const dataLine = chunk
              .split("\n")
              .find((line) => line.startsWith("data:"));

            if (!eventLine || !dataLine) return;

            const event = eventLine.replace("event:", "").trim();
            const data = parseStreamData(dataLine.replace("data:", "").trim());
            const contractFromStream = streamContractFromData(data);
            if (contractFromStream) setStreamContract(contractFromStream);
            const recoveryMode = providerRecoveryModeFromData(data);
            if (recoveryMode) {
              observedProviderRecoveryMode = recoveryMode;
              setProviderRecoveryMode(recoveryMode);
            }
            const streamedPaperId = paperIdValue(data.paperId);
            if (streamedPaperId) savedPaperId = streamedPaperId;
            const recoverySnapshot = streamRecoverySnapshotFromData(
              data,
              savedPaperId ?? undefined,
            );
            if (recoverySnapshot) lastRecoverySnapshot = recoverySnapshot;

            if (event === "progress") {
              const step = numberValue(data.step) ?? 1;
              const nextProgress =
                numberValue(data.progress) ?? numberValue(data.pct) ?? 0;
              setActiveIndex(Math.max(0, step - 1));
              setProgress(nextProgress);
              const message = stringValue(data.msg);
              if (message) setCurrentMessage(message);
            }

            if (event === "error") {
              const status = stringValue(data.status);
              throw generationError(
                stringValue(data.msg) ?? "Paper generation failed.",
                stringValue(data.code) ?? numberValue(data.code),
                undefined,
                {
                  recoverable: status === "CONTINUING",
                  readyQuestionCount: numberValue(data.readyQuestionCount),
                  targetQuestionCount: numberValue(data.targetQuestionCount),
                  missingQuestionCount: numberValue(data.missingQuestionCount),
                  providerHealth: providerHealthFromStreamData(data),
                  providerRecoveryMode: recoveryMode ?? undefined,
                  sourceCapacity: sourceCapacityFromStreamData(data),
                  activeOperation: stringValue(data.activeOperation),
                  failureSource: stringValue(data.failureSource),
                  errorClass: stringValue(data.errorClass),
                },
              );
            }

            if (event === "done") {
              completed = true;
              setActiveIndex(progressSteps.length - 1);
              setProgress(100);
              const paperId = paperIdValue(data.paperId);
              if (!paperId) {
                throw generationError(
                  "Generation finished without a valid paper id. Please retry.",
                  "GENERATION_BAD_DONE_PAYLOAD",
                );
              }
              savedPaperId = paperId;
              const paperConfig = paperConfigFromStream(data.config, requestConfig);
              const skippedQuestions = numberValue(data.skippedQuestions) ?? 0;
              const replacedQuestions = numberValue(data.replacedQuestions) ?? 0;
              if (
                !safeSessionSet(
                  `edutest:paper:${paperId}`,
                  JSON.stringify({
                    ...data,
                    id: paperId,
                    title:
                      stringValue(data.title) ??
                      (paperConfig.sourceMode === "pdf_upload"
                        ? `${paperConfig.pdfSource?.title ?? "PDF-EDU-TEST"} Paper`
                        : `Class ${paperConfig.classNum} ${paperConfig.subject} ${paperConfig.examType}`),
                    config: paperConfig,
                    status: "READY",
                    sessionOnly: data.sessionOnly !== false,
                    paperSnapshotToken: stringValue(data.paperSnapshotToken),
                    guestPaperToken:
                      stringValue(data.guestPaperToken) ??
                      stringValue(data.paperSnapshotToken),
                  }),
                )
              ) {
                toast.warning("Paper is ready, but browser session storage is full.");
              }
              if (skippedQuestions > 0) {
                toast.warning(
                  `Skipped ${skippedQuestions} invalid or duplicate question${
                    skippedQuestions === 1 ? "" : "s"
                  } and rebuilt the paper with valid replacements where available.`,
                );
              }
              if (replacedQuestions > 0) {
                toast.success(
                  `Replaced ${replacedQuestions} invalid or duplicate question${
                    replacedQuestions === 1 ? "" : "s"
                  } with valid alternatives.`,
                );
              }
              safeSessionRemove(inFlightKey);
              setResumePaperId(null);
              autoContinueAttempts.current = 0;
              zeroProgressAutoContinueAttempts.current = 0;
              clearAutoContinueTimer(autoContinueTimer);
              router.push(`/papers/${encodeURIComponent(paperId)}/preview`);
            }
          });
        }

        if (!completed) {
          const recoveryPaperId =
            savedPaperId ?? paperIdFromStreamRecoverySnapshot(lastRecoverySnapshot);
          if (recoveryPaperId && !isSessionPaperId(recoveryPaperId)) {
            const numericRecoveryPaperId = Number(recoveryPaperId);
            if (!Number.isInteger(numericRecoveryPaperId) || numericRecoveryPaperId <= 0) {
              return;
            }
            const recovery = await recoverSavedPaper(
              numericRecoveryPaperId,
              requestConfig,
            );
            if (recovery.kind === "ready") {
              safeSessionRemove(inFlightKey);
              router.push(`/papers/${numericRecoveryPaperId}/preview`);
              return;
            }
            if (recovery.kind === "recoverable") {
              throw generationError(
                recovery.message,
                "GENERATION_STREAM_RECOVERABLE",
                recovery.paperId,
                {
                  recoverable: true,
                  readyQuestionCount: recovery.readyQuestionCount,
                  targetQuestionCount: recovery.targetQuestionCount,
                  missingQuestionCount: recovery.missingQuestionCount,
                },
              );
            }

            const streamRecoverySnapshot = matchingStreamRecoverySnapshot(
              lastRecoverySnapshot,
              recoveryPaperId,
            );
            if (streamRecoverySnapshot) {
              throw recoverableStreamEndedErrorFromSnapshot(
                streamRecoverySnapshot,
                recovery.message,
              );
            }

            throw generationError(recovery.message, "GENERATION_STREAM_ENDED");
          }

          throw generationError(
            observedProviderRecoveryMode
              ? "Server time budget ended while finishing from selected source text. Retry starts a fresh session-only generation; lower the question count or format variety if this repeats."
              : "Generation stopped before the session paper snapshot was completed.",
            "GENERATION_STREAM_ENDED",
            undefined,
            {
              providerRecoveryMode: observedProviderRecoveryMode ?? undefined,
            },
          );
        }
      } catch (error) {
        started.current = false;
        safeSessionRemove(inFlightKey);
        if (controller.signal.aborted || cancelled) return;
        const message =
          error instanceof Error
            ? error.message
            : "Paper generation failed. Please try again.";
        const code = getErrorCode(error);
        const recoverable = isRecoverableGenerationError(error);
        const explicitPaperId = getErrorPaperId(error);
        const recoverablePaperId = explicitPaperId ?? null;
        const continuation = continuationProgressFromError(error);
        const providerHealth = getErrorProviderHealth(error);
        const errorProviderRecoveryMode = getErrorProviderRecoveryMode(error);
        const sourceCapacity = getErrorSourceCapacity(error);
        const activeOperation = getErrorStringField(error, "activeOperation");
        const failureSource = getErrorStringField(error, "failureSource");
        const errorClass = getErrorStringField(error, "errorClass");
        if (errorProviderRecoveryMode) {
          setProviderRecoveryMode(errorProviderRecoveryMode);
        }
        const hasSavedQuestionProgress =
          (continuation.readyQuestionCount ?? 0) > 0;
        if (
          recoverable &&
          recoverablePaperId &&
          canAutoContinueGenerationError(
            error,
            zeroProgressAutoContinueAttempts.current,
          ) &&
          autoContinueAttempts.current < maxAutoContinueAttempts()
        ) {
          autoContinueAttempts.current += 1;
          if (isProviderRecoverableError(error)) {
            setProviderOverride("AUTO");
          }
          if (hasSavedQuestionProgress) {
            zeroProgressAutoContinueAttempts.current = 0;
          } else {
            zeroProgressAutoContinueAttempts.current += 1;
          }
          setResumePaperId(recoverablePaperId);
          setError(null);
          setActiveIndex(5);
          setProgress((value) => Math.max(value, 92));
          setCurrentMessage(
            continuationMessage(
              continuation,
              autoContinueAttempts.current,
              recoverablePaperId,
            ),
          );
          autoContinueTimer.current = window.setTimeout(() => {
            if (cancelled) return;
            started.current = false;
            setRetryNonce((value) => value + 1);
          }, autoContinueDelayMs());
          return;
        }
        setResumePaperId(recoverable ? recoverablePaperId : null);
        setError({
          message,
          code,
          paperId: recoverablePaperId ?? undefined,
          recoverable,
          providerHealth,
          providerRecoveryMode: errorProviderRecoveryMode ?? undefined,
          sourceCapacity,
          activeOperation,
          failureSource,
          errorClass,
          ...continuation,
        });
        toast.error(message);
      } finally {
        window.clearTimeout(slowTimer);
        window.clearTimeout(hardTimer);
      }
    }

    void run();
    return () => {
      cancelled = true;
      controller.abort();
      window.clearTimeout(slowTimer);
      window.clearTimeout(hardTimer);
      clearAutoContinueTimer(autoContinueTimer);
      safeSessionRemove(inFlightKey);
    };
  }, [
    idempotencyKey,
    open,
    requestConfig,
    retryNonce,
    router,
    salvageInvalidQuestions,
  ]);

  React.useEffect(() => {
    if (!open || error || progress >= 100) return undefined;
    const interval = window.setInterval(() => setGenerationNow(Date.now()), 500);
    return () => window.clearInterval(interval);
  }, [error, open, progress]);

  if (!open) return null;

  function retry() {
    safeSessionRemove(`edutest:generation:${idempotencyKey}`);
    setSalvageInvalidQuestions(true);
    autoContinueAttempts.current = 0;
    zeroProgressAutoContinueAttempts.current = 0;
    clearAutoContinueTimer(autoContinueTimer);
    setResumePaperId(error?.recoverable ? error.paperId ?? resumePaperId : null);
    started.current = false;
    setRetryNonce((value) => value + 1);
  }

  function retryWithAutoFallback() {
    safeSessionRemove(`edutest:generation:${idempotencyKey}`);
    setSalvageInvalidQuestions(true);
    autoContinueAttempts.current = 0;
    zeroProgressAutoContinueAttempts.current = 0;
    clearAutoContinueTimer(autoContinueTimer);
    setResumePaperId(error?.recoverable ? error.paperId ?? resumePaperId : null);
    setProviderOverride("AUTO");
    started.current = false;
    setRetryNonce((value) => value + 1);
  }

  function skipAndReplaceQuestions() {
    safeSessionRemove(`edutest:generation:${idempotencyKey}`);
    setSalvageInvalidQuestions(true);
    autoContinueAttempts.current = 0;
    zeroProgressAutoContinueAttempts.current = 0;
    clearAutoContinueTimer(autoContinueTimer);
    setResumePaperId(error?.recoverable ? error.paperId ?? resumePaperId : null);
    setCurrentMessage("Skipping broken questions and replacing what can be rebuilt...");
    started.current = false;
    setRetryNonce((value) => value + 1);
  }

  const provider = requestConfig.aiProvider ?? "AUTO";
  const providerModel = modelForProvider(provider, providerStatus);
  const sourceTextShortage = isSourceTextShortageError(error);
  const realSourceCapacityFailure = isRealSourceCapacityFailure(error);
  const canSkipAndReplace =
    !realSourceCapacityFailure && isQuestionOutputError(error);
  const canRetry = !realSourceCapacityFailure;
  const timing = generationTimingSnapshot(progress, generationStartedAt, generationNow);
  const displayedContract = streamContract ?? clientContract;
  const visibleProviderRecoveryMode =
    sourceTextShortage ? null : error?.providerRecoveryMode ?? providerRecoveryMode;
  const errorGuidance =
    sourceTextShortage
      ? realSourceCapacityFailure
        ? sourceCapacityGuidance(error?.sourceCapacity)
        : "Source-backed validation stopped even though effective source capacity appears sufficient. Retry this updated generation; provider retry is not required."
      : visibleProviderRecoveryMode === "source_backed_provider_outage"
      ? "Finishing from selected source text. Provider retry is not required for this run."
      : generationErrorGuidance(error, provider);
  const displayedErrorMessage = error
    ? generationDisplayErrorMessage(error, sourceTextShortage)
    : "";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0a0e1a]/95 p-2 backdrop-blur-xl sm:p-4">
      <div className="max-h-[calc(100vh-24px)] w-full max-w-lg overflow-y-auto rounded-lg border border-white/10 bg-card p-4 shadow-2xl sm:p-5">
        {error ? (
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-red-300/30 bg-red-500/10 text-red-100 shadow-glow">
            <AlertTriangle className="h-6 w-6" />
          </div>
        ) : (
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-blue-300/30 bg-blue-500/10 text-blue-100 shadow-glow">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        )}
        <h2 className="mt-3 text-center text-xl font-extrabold text-white sm:text-2xl">
          {error ? "Generation Needs Attention" : "Generating Your Paper"}
        </h2>
          <p className="mt-1 text-center text-sm text-slate-400">
            {error
              ? displayedErrorMessage
              : "Progress and ETA are based on live generation events."}
          </p>
          {error?.paperId && error.recoverable ? (
            <p className="mt-2 text-center text-xs text-blue-100">
              {questionProgressLabel(error)
                ? `Saved progress in paper #${error.paperId}; ${questionProgressLabel(error)}.`
                : `Paper #${error.paperId} setup was saved; retry continues it.`}
            </p>
          ) : null}

        <div className="mt-4 rounded-lg border border-white/10 bg-white/[0.035] p-3 text-sm">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <span className="font-semibold text-slate-100">
              Engine: {providerLabel(provider)}
            </span>
            {providerModel ? (
              <span className="text-slate-400">Model: {providerModel}</span>
            ) : null}
          </div>
          <p className="mt-2 text-slate-300">{error ? displayedErrorMessage : currentMessage}</p>
          {!error && providerRecoveryMode === "source_backed_provider_outage" ? (
            <p className="mt-2 text-xs font-semibold text-emerald-200">
              Finishing from selected TXT/PDF source text because provider fallback could not complete.
            </p>
          ) : null}
          {displayedContract ? (
            <div className="mt-3 rounded-lg border border-white/10 bg-slate-950/45 px-3 py-2 text-xs leading-5 text-slate-300">
              Contract {displayedContract.contractHash} |{" "}
              {displayedContract.generationModeLabel} |{" "}
              {displayedContract.plannedCalls} planned AI call
              {displayedContract.plannedCalls === 1 ? "" : "s"} |{" "}
              {displayedContract.riskLevel} API risk
              {displayedContract.source === "server" ? " | server confirmed" : ""}
              {displayedContract.chunkingNote ? (
                <span className="block pt-1 text-blue-200">
                  {displayedContract.chunkingNote}
                </span>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="mt-4 space-y-2">
          {progressSteps.map((step, index) => {
            const done = index < activeIndex || progress === 100;
            const active = index === activeIndex && progress < 100;

            return (
              <div
                key={step}
                className="flex min-h-11 items-center gap-3 rounded-lg border border-white/10 bg-white/[0.035] px-3 py-2"
              >
                {done ? (
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-300" />
                ) : active ? (
                  <Loader2 className="h-4 w-4 shrink-0 animate-spin text-blue-200" />
                ) : (
                  <Circle className="h-4 w-4 shrink-0 text-slate-600" />
                )}
                <span
                  className={cn(
                    "text-sm",
                    done && "text-emerald-100",
                    active && "text-blue-100",
                    !done && !active && "text-slate-500",
                  )}
                >
                  {step}
                </span>
              </div>
            );
          })}
        </div>

        <div className="mt-4 rounded-lg border border-white/10 bg-white/[0.035] p-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="text-sm font-bold text-white">
                {Math.round(progress)}% complete
              </div>
              <div className="mt-1 text-xs text-slate-400">
                elapsed {timing.elapsedLabel}
              </div>
            </div>
            <div className="text-sm font-semibold text-blue-100">
              {timing.remainingLabel}
            </div>
          </div>
          <Progress value={progress} className="mt-3" />
        </div>

        {error ? (
          <>
          {errorGuidance ? (
            <div className="mt-4 rounded-lg border border-amber-300/20 bg-amber-500/10 p-3 text-sm leading-6 text-amber-50">
              {errorGuidance}
            </div>
          ) : null}
          {sourceTextShortage && error.sourceCapacity ? (
            <div className="mt-4 rounded-lg border border-red-300/20 bg-red-500/10 p-3 text-sm leading-6 text-red-50">
              <div className="font-semibold text-red-100">
                Effective source capacity: {error.sourceCapacity.effectiveCapacity ?? error.sourceCapacity.availableStrictCapacity}/
                {error.sourceCapacity.requiredMissingCount} replacement question
                {error.sourceCapacity.requiredMissingCount === 1 ? "" : "s"} available.
              </div>
              <div className="mt-1 text-red-100/90">
                Raw source slots {error.sourceCapacity.rawAtomCapacity ?? error.sourceCapacity.availableStrictCapacity}; source concepts{" "}
                {error.sourceCapacity.sourceConceptCount}; source atoms{" "}
                {error.sourceCapacity.atomCount}; used atom/type keys{" "}
                {error.sourceCapacity.consumedAtomTypeKeys}.
              </div>
              {sourceCapacityTypeSummary(error.sourceCapacity) ? (
                <div className="mt-2 rounded-md border border-white/10 bg-slate-950/35 px-2 py-1 text-xs text-red-100/90">
                  {sourceCapacityTypeSummary(error.sourceCapacity)}
                </div>
              ) : null}
            </div>
          ) : null}
          {visibleProviderRecoveryMode === "source_backed_provider_outage" ? (
            <div className="mt-4 rounded-lg border border-emerald-300/20 bg-emerald-500/10 p-3 text-sm font-semibold leading-6 text-emerald-50">
              Finishing from selected TXT/PDF source text because provider fallback could not complete.
            </div>
          ) : null}
          {error.providerHealth ? (
            <div className="mt-4 rounded-lg border border-red-300/20 bg-red-500/10 p-3 text-sm leading-6 text-red-50">
              <div className="font-semibold text-red-100">
                {providerHealthSummary(error.providerHealth)}
              </div>
              <div className="mt-1 text-red-100/90">
                {sourceTextShortage
                  ? realSourceCapacityFailure
                    ? "Selected source effective capacity is the blocker; provider retry is not required for this run."
                    : "Effective source capacity appears sufficient; retry this updated generation before changing provider settings."
                  : visibleProviderRecoveryMode === "source_backed_provider_outage"
                  ? "Finishing from selected source text; provider retry is not required for this run."
                  : providerHealthAction(error.providerHealth)}
              </div>
              <div className="mt-2 grid gap-2">
                {error.providerHealth.providers
                  .filter((item) => item.configured && !item.usable)
                  .slice(0, 4)
                  .map((item) => (
                    <div
                      key={item.provider}
                      className="rounded-md border border-white/10 bg-slate-950/35 px-2 py-1 text-xs text-red-100/90"
                    >
                      <span className="font-semibold text-white">{item.label}</span>
                      {item.model ? ` ${item.model}` : ""}:{" "}
                      {item.failure ?? item.failureClass ?? "not usable"}
                    </div>
                  ))}
              </div>
            </div>
          ) : null}
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {error.paperId && error.recoverable ? (
              <Button
                type="button"
                variant="outline"
                className="flex-1 sm:col-span-2"
                onClick={() => router.push("/dashboard")}
              >
                Open Dashboard
              </Button>
            ) : null}
            {visibleProviderRecoveryMode !== "source_backed_provider_outage" && provider !== "AUTO" && canRetry ? (
              <Button
                type="button"
                className="flex-1 sm:col-span-2"
                onClick={retryWithAutoFallback}
              >
                <RefreshCw className="h-4 w-4" />
                Retry Auto Fallback
              </Button>
            ) : null}
            {canSkipAndReplace ? (
              <Button
                type="button"
                variant="gold"
                className="flex-1"
                onClick={skipAndReplaceQuestions}
              >
                <ListRestart className="h-4 w-4" />
                Skip & Replace
              </Button>
            ) : null}
            {canRetry ? (
              <Button type="button" className="flex-1" onClick={retry}>
                <RefreshCw className="h-4 w-4" />
                Retry
              </Button>
            ) : null}
          </div>
          </>
        ) : onClose ? (
          <div className="mt-4 flex justify-center">
            <Button type="button" variant="outline" onClick={onClose}>
              <X className="h-4 w-4" />
              Cancel Generation
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function randomGenerationKey(seed: string) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `paper:${crypto.randomUUID()}`;
  }

  return `paper:${seed}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function isStaleGeneration(value: string) {
  const startedAt = Date.parse(value);
  if (!Number.isFinite(startedAt)) return true;
  return Date.now() - startedAt > 10 * 60 * 1000;
}

function generationError(
  message: string,
  code?: string | number,
  paperId?: number,
  options: {
    recoverable?: boolean;
    readyQuestionCount?: number;
    targetQuestionCount?: number;
    missingQuestionCount?: number;
    providerHealth?: PublicAIProviderHealthSnapshot;
    providerRecoveryMode?: ProviderRecoveryMode;
    sourceCapacity?: SourceCapacityDiagnostics;
    activeOperation?: string;
    failureSource?: string;
    errorClass?: string;
  } = {},
) {
  const error = new Error(message);
  (error as Error & { code?: string | number }).code = code;
  (error as Error & { paperId?: number }).paperId = paperId;
  (
    error as Error & {
      recoverable?: boolean;
      readyQuestionCount?: number;
      targetQuestionCount?: number;
      missingQuestionCount?: number;
    }
  ).recoverable = options.recoverable || code === "GENERATION_CONTINUE_AVAILABLE";
  (
    error as Error & {
      readyQuestionCount?: number;
      targetQuestionCount?: number;
      missingQuestionCount?: number;
    }
  ).readyQuestionCount = options.readyQuestionCount;
  (
    error as Error & {
      readyQuestionCount?: number;
      targetQuestionCount?: number;
      missingQuestionCount?: number;
    }
  ).targetQuestionCount = options.targetQuestionCount;
  (
    error as Error & {
      readyQuestionCount?: number;
      targetQuestionCount?: number;
      missingQuestionCount?: number;
      providerHealth?: PublicAIProviderHealthSnapshot;
    }
  ).missingQuestionCount = options.missingQuestionCount;
  (
    error as Error & {
      providerHealth?: PublicAIProviderHealthSnapshot;
      providerRecoveryMode?: ProviderRecoveryMode;
      activeOperation?: string;
      failureSource?: string;
      errorClass?: string;
    }
  ).providerHealth = options.providerHealth;
  (
    error as Error & {
      providerRecoveryMode?: ProviderRecoveryMode;
    }
  ).providerRecoveryMode = options.providerRecoveryMode;
  (
    error as Error & {
      sourceCapacity?: SourceCapacityDiagnostics;
    }
  ).sourceCapacity = options.sourceCapacity;
  (
    error as Error & {
      activeOperation?: string;
      failureSource?: string;
      errorClass?: string;
    }
  ).activeOperation = options.activeOperation;
  (
    error as Error & {
      failureSource?: string;
    }
  ).failureSource = options.failureSource;
  (
    error as Error & {
      errorClass?: string;
    }
  ).errorClass = options.errorClass;
  return error;
}

function parseStreamData(raw: string) {
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    throw generationError(
      "Generation stream returned incomplete data. Please retry.",
      "GENERATION_STREAM_PARSE_FAILED",
    );
  }
}

function streamContractFromData(
  data: Record<string, unknown>,
): GenerationStreamContractSummary | null {
  const nested = isRecord(data.promptContract) ? data.promptContract : data;
  const contractHash = stringValue(nested.contractHash);
  const generationModeLabel = stringValue(nested.generationModeLabel);
  const plannedCalls = numberValue(nested.plannedCalls);
  const riskLevel = generationRiskLevelValue(
    nested.riskLevel ?? nested.apiRiskLevel,
  );

  if (!contractHash || !generationModeLabel || !plannedCalls || !riskLevel) {
    return null;
  }

  return {
    contractHash,
    generationModeLabel,
    plannedCalls,
    riskLevel,
    source: "server",
    ...(stringValue(nested.chunkingNote)
      ? { chunkingNote: stringValue(nested.chunkingNote) }
      : {}),
  };
}

function streamRecoverySnapshotFromData(
  data: Record<string, unknown>,
  fallbackPaperId?: string,
): GenerationStreamRecoverySnapshot | null {
  const paperId = paperIdValue(data.paperId) ?? fallbackPaperId;
  if (!paperId) return null;

  const readyQuestionCount = numberValue(data.readyQuestionCount);
  const targetQuestionCount = numberValue(data.targetQuestionCount);
  const missingQuestionCount = numberValue(data.missingQuestionCount);
  const status = stringValue(data.status);
  const generationPhase = stringValue(data.generationPhase);
  const recoveryReason =
    stringValue(data.recoveryReason) ?? stringValue(data.msg);
  const hasRecoveryData =
    Boolean(status) ||
    Boolean(generationPhase) ||
    readyQuestionCount !== undefined ||
    targetQuestionCount !== undefined ||
    missingQuestionCount !== undefined ||
    Boolean(recoveryReason);

  if (!hasRecoveryData) return null;

  return {
    paperId,
    status,
    generationPhase,
    readyQuestionCount,
    targetQuestionCount,
    missingQuestionCount,
    recoveryReason,
  };
}

function providerHealthFromStreamData(
  data: Record<string, unknown>,
): PublicAIProviderHealthSnapshot | undefined {
  if (!isRecord(data.providerHealth)) return undefined;
  const providers = Array.isArray(data.providerHealth.providers)
    ? data.providerHealth.providers.filter(isRecord).map((provider) => ({
        provider: stringValue(provider.provider) ?? "",
        label: stringValue(provider.label) ?? stringValue(provider.provider) ?? "",
        model: stringValue(provider.model) ?? "",
        configured: Boolean(provider.configured),
        usable: Boolean(provider.usable),
        failureClass: stringValue(provider.failureClass) ?? null,
        failure: stringValue(provider.failure) ?? null,
        cooldownUntil: stringValue(provider.cooldownUntil) ?? null,
        cooldownReason: stringValue(provider.cooldownReason) ?? null,
        cooldownErrorClass: stringValue(provider.cooldownErrorClass) ?? null,
      }))
    : [];

  return {
    checkedAt: stringValue(data.providerHealth.checkedAt) ?? "",
    task: stringValue(data.providerHealth.task) ?? "QUESTION_GENERATION",
    configuredProviders: stringArrayValue(data.providerHealth.configuredProviders),
    usableProviders: stringArrayValue(data.providerHealth.usableProviders),
    providers,
    summary:
      stringValue(data.providerHealth.summary) ??
      "No configured provider is usable right now.",
    action:
      stringValue(data.providerHealth.action) ??
      "Check Vercel provider keys/credits, then retry with Auto Fallback.",
  };
}

function providerRecoveryModeFromData(
  data: Record<string, unknown>,
): ProviderRecoveryMode | null {
  return data.providerRecoveryMode === "source_backed_provider_outage"
    ? "source_backed_provider_outage"
    : null;
}

function sourceCapacityFromStreamData(
  data: Record<string, unknown>,
): SourceCapacityDiagnostics | undefined {
  return sourceCapacityFromUnknown(data.sourceCapacity);
}

function recoverableStreamEndedErrorFromSnapshot(
  snapshot: GenerationStreamRecoverySnapshot,
  fallbackMessage?: string,
) {
  return generationError(
    snapshot.recoveryReason ??
      fallbackMessage ??
      "Generation stream ended after saving the paper setup. Retrying continues the same paper.",
    "GENERATION_STREAM_RECOVERABLE",
    undefined,
    {
      recoverable: true,
      readyQuestionCount: snapshot.readyQuestionCount,
      targetQuestionCount: snapshot.targetQuestionCount,
      missingQuestionCount: snapshot.missingQuestionCount,
    },
  );
}

function paperIdFromStreamRecoverySnapshot(
  snapshot: GenerationStreamRecoverySnapshot | null,
) {
  return snapshot?.paperId;
}

function matchingStreamRecoverySnapshot(
  snapshot: GenerationStreamRecoverySnapshot | null,
  paperId: string,
) {
  return snapshot?.paperId === paperId ? snapshot : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : undefined;
}

function stringArrayValue(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function numberValue(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function paperIdValue(value: unknown) {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) {
    return String(value);
  }
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (/^[1-9]\d*$/.test(trimmed) || isSessionPaperId(trimmed)) return trimmed;
  return undefined;
}

function isSessionPaperId(value: string) {
  return /^session-\d{10,17}-[a-z0-9]{8,32}$/i.test(value);
}

function generationRiskLevelValue(value: unknown): GenerationRiskLevel | undefined {
  if (value === "low" || value === "medium" || value === "high") return value;
  return undefined;
}

function paperConfigFromStream(value: unknown, fallback: PaperConfig): PaperConfig {
  if (!isRecord(value)) return fallback;
  return {
    ...fallback,
    ...value,
  } as PaperConfig;
}

async function recoverSavedPaper(
  paperId: number,
  fallbackConfig: PaperConfig,
): Promise<GenerationRecoveryDecision> {
  let lastDecision: GenerationRecoveryDecision | null = null;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    if (attempt > 0) await wait(1000);

    try {
      const paper = await fetchApiData<StoredPaper>(
        `/api/papers/${paperId}`,
        undefined,
        "Could not verify saved paper.",
      );
      const decision = classifyRecoveredPaper(paper, paperId);
      lastDecision = decision;
      if (decision.kind === "ready") {
        safeSessionSet(
          `edutest:paper:${paperId}`,
          JSON.stringify({
            ...decision.paper,
            id: paperId,
            paperId,
            config: decision.paper.config ?? fallbackConfig,
            status: decision.paper.status ?? "READY",
            sessionOnly: true,
          }),
        );
        return decision;
      }
      if (decision.kind === "recoverable") {
        return decision;
      }
    } catch {
      // A just-finished serverless write can take a moment to become visible.
    }
  }

  return (
    lastDecision ?? {
      kind: "ignored",
      message:
        "Generation stopped before a complete paper was saved. No finished paper was added to your dashboard.",
    }
  );
}

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function getErrorCode(error: unknown) {
  return error && typeof error === "object" && "code" in error
    ? (error as { code?: string | number }).code
    : undefined;
}

function getErrorPaperId(error: unknown) {
  if (!error || typeof error !== "object" || !("paperId" in error)) return undefined;
  const paperId = (error as { paperId?: unknown }).paperId;
  return typeof paperId === "number" && Number.isFinite(paperId)
    ? paperId
    : undefined;
}

function getErrorProviderHealth(error: unknown) {
  if (!error || typeof error !== "object" || !("providerHealth" in error)) {
    return undefined;
  }
  const providerHealth = (error as { providerHealth?: unknown }).providerHealth;
  return isPublicProviderHealthSnapshot(providerHealth) ? providerHealth : undefined;
}

function getErrorProviderRecoveryMode(error: unknown) {
  if (!error || typeof error !== "object" || !("providerRecoveryMode" in error)) {
    return undefined;
  }
  const value = (error as { providerRecoveryMode?: unknown }).providerRecoveryMode;
  return value === "source_backed_provider_outage" ? value : undefined;
}

function getErrorSourceCapacity(error: unknown) {
  if (!error || typeof error !== "object" || !("sourceCapacity" in error)) {
    return undefined;
  }

  return sourceCapacityFromUnknown(
    (error as { sourceCapacity?: unknown }).sourceCapacity,
  );
}

function sourceCapacityFromUnknown(
  value: unknown,
): SourceCapacityDiagnostics | undefined {
  if (!isRecord(value)) return undefined;
  const requiredMissingCount = numberValue(value.requiredMissingCount);
  const availableStrictCapacity = numberValue(value.availableStrictCapacity);
  const rawAtomCapacity = numberValue(value.rawAtomCapacity);
  const effectiveCapacity =
    numberValue(value.effectiveCapacity) ?? availableStrictCapacity;
  const effectiveMissingCount = numberValue(value.effectiveMissingCount);
  const sourceConceptCount = numberValue(value.sourceConceptCount);
  const atomCount = numberValue(value.atomCount);
  const consumedAtomTypeKeys = numberValue(value.consumedAtomTypeKeys);

  if (
    requiredMissingCount === undefined ||
    availableStrictCapacity === undefined ||
    sourceConceptCount === undefined ||
    atomCount === undefined ||
    consumedAtomTypeKeys === undefined
  ) {
    return undefined;
  }

  return {
    requiredMissingCount,
    rawAtomCapacity,
    effectiveCapacity,
    effectiveMissingCount,
    availableStrictCapacity,
    sourceConceptCount,
    atomCount,
    consumedAtomTypeKeys,
    enough: value.enough === true,
    byType: sourceCapacityByTypeFromUnknown(value.byType),
    duplicatePressure: sourceCapacityDuplicatePressureFromUnknown(
      value.duplicatePressure,
    ),
  };
}

function sourceCapacityByTypeFromUnknown(
  value: unknown,
): SourceCapacityDiagnostics["byType"] {
  if (!isRecord(value)) return undefined;

  return Object.entries(value).reduce<
    NonNullable<SourceCapacityDiagnostics["byType"]>
  >((items, [type, item]) => {
    if (!isRecord(item)) return items;
    const required = numberValue(item.required);
    const available = numberValue(item.available);
    const rawAvailable = numberValue(item.rawAvailable);
    const effectiveAvailable = numberValue(item.effectiveAvailable);
    const consumed = numberValue(item.consumed);
    const missing = numberValue(item.missing);
    if (
      required === undefined ||
      available === undefined ||
      consumed === undefined
    ) {
      return items;
    }
    items[type] = {
      required,
      available,
      rawAvailable,
      effectiveAvailable,
      consumed,
      missing,
      skipped: sourceCapacitySkippedFromUnknown(item.skipped),
      blockerReasons: stringArrayValue(item.blockerReasons),
    };
    return items;
  }, {});
}

function sourceCapacitySkippedFromUnknown(
  value: unknown,
): NonNullable<
  NonNullable<SourceCapacityDiagnostics["byType"]>[string]["skipped"]
> | undefined {
  if (!isRecord(value)) return undefined;
  const duplicate = numberValue(value.duplicate);
  const repeatedSourceKey = numberValue(value.repeatedSourceKey);
  const validation = numberValue(value.validation);
  if (
    duplicate === undefined ||
    repeatedSourceKey === undefined ||
    validation === undefined
  ) {
    return undefined;
  }

  return {
    duplicate,
    repeatedSourceKey,
    validation,
  };
}

function sourceCapacityDuplicatePressureFromUnknown(
  value: unknown,
): SourceCapacityDiagnostics["duplicatePressure"] {
  if (!isRecord(value)) return undefined;
  const duplicateRejections = numberValue(value.duplicateRejections);
  const duplicateGroups = numberValue(value.duplicateGroups);
  const sourceBackedCandidates = numberValue(value.sourceBackedCandidates);
  if (
    duplicateRejections === undefined ||
    duplicateGroups === undefined ||
    sourceBackedCandidates === undefined
  ) {
    return undefined;
  }

  return {
    duplicateRejections,
    duplicateGroups,
    sourceBackedCandidates,
  };
}

function getErrorStringField(
  error: unknown,
  field: "activeOperation" | "failureSource" | "errorClass",
) {
  if (!error || typeof error !== "object" || !(field in error)) return undefined;
  const value = (error as Record<string, unknown>)[field];
  return typeof value === "string" && value.trim() ? value : undefined;
}

function isPublicProviderHealthSnapshot(
  value: unknown,
): value is PublicAIProviderHealthSnapshot {
  return (
    isRecord(value) &&
    Array.isArray(value.providers) &&
    Array.isArray(value.configuredProviders) &&
    Array.isArray(value.usableProviders)
  );
}

function isRecoverableGenerationError(error: unknown) {
  if (isSourceTextShortageError(error)) return false;
  if (error && typeof error === "object" && "recoverable" in error) {
    return Boolean((error as { recoverable?: unknown }).recoverable);
  }
  return getErrorCode(error) === "GENERATION_CONTINUE_AVAILABLE";
}

function canAutoContinueGenerationError(
  error: unknown,
  zeroProgressAttempts = 0,
) {
  if (!isRecoverableGenerationError(error)) return false;
  const progress = continuationProgressFromError(error);
  if ((progress.readyQuestionCount ?? 0) > 0) return true;
  return zeroProgressAttempts < maxZeroProgressAutoContinueAttempts();
}

function isProviderRecoverableError(error: unknown) {
  const code = getErrorCode(error);
  const message = error instanceof Error ? error.message : String(error ?? "");
  if (
    code === "PAPER_PERSISTENCE_TIMEOUT" ||
    code === "PAPER_PERSISTENCE_FAILED" ||
    /paper persistence|database reachability|Neon connectivity/i.test(message)
  ) {
    return false;
  }
  return (
    code === "PROVIDER_NETWORK_ERROR" ||
    code === "PROVIDER_AUTO_FAILED" ||
    code === "PROVIDER_QUOTA_ERROR" ||
    /AI provider|Auto Fallback|provider health|quota|credit|billing|402|429|rate.?limit|timeout|timed out|network|fetch failed|temporarily busy|high traffic|try again soon/i.test(
      message,
    )
  );
}

function isSourceTextShortageError(
  error: { message?: string; code?: string | number } | unknown,
) {
  if (!error || typeof error !== "object") return false;
  const code = "code" in error ? (error as { code?: unknown }).code : undefined;
  const message = "message" in error ? (error as { message?: unknown }).message : undefined;
  return (
    code === "SOURCE_TEXT_NOT_ENOUGH" ||
    (typeof message === "string" &&
      /Selected source text (?:is not enough|did not provide enough distinct material|cannot produce enough 100% distinct questions)/i.test(
        message,
    ))
  );
}

function isRealSourceCapacityFailure(
  error:
    | {
        message?: string;
        code?: string | number;
        sourceCapacity?: SourceCapacityDiagnostics;
      }
    | null,
) {
  if (!isSourceTextShortageError(error)) return false;
  const capacity = error?.sourceCapacity;
  if (!capacity) return true;
  const effectiveCapacity =
    capacity.effectiveCapacity ?? capacity.availableStrictCapacity;
  return effectiveCapacity < capacity.requiredMissingCount;
}

function generationDisplayErrorMessage(
  error: { message: string; sourceCapacity?: SourceCapacityDiagnostics },
  sourceTextShortage: boolean,
) {
  if (!sourceTextShortage || !error.sourceCapacity) return error.message;

  const capacity = error.sourceCapacity;
  const effectiveCapacity =
    capacity.effectiveCapacity ?? capacity.availableStrictCapacity;
  const rawCapacity = capacity.rawAtomCapacity ?? capacity.availableStrictCapacity;

  return `Selected source text can create ${effectiveCapacity}/${capacity.requiredMissingCount} strict replacement question${capacity.requiredMissingCount === 1 ? "" : "s"} from ${rawCapacity} raw source slot${rawCapacity === 1 ? "" : "s"}.`;
}

function sourceCapacityGuidance(capacity: SourceCapacityDiagnostics | undefined) {
  if (!capacity) {
    return "Selected TXT/PDF source text does not have enough distinct material for the requested replacements. Select more chapters/topics, upload more source text, or lower the question count.";
  }
  const effectiveCapacity =
    capacity.effectiveCapacity ?? capacity.availableStrictCapacity;
  const rawCapacity = capacity.rawAtomCapacity ?? capacity.availableStrictCapacity;

  return `Selected TXT/PDF source text has effective capacity for ${effectiveCapacity}/${capacity.requiredMissingCount} missing replacement question${capacity.requiredMissingCount === 1 ? "" : "s"} (${rawCapacity} raw source slot${rawCapacity === 1 ? "" : "s"}). Select more chapters/topics, upload more source text, or lower the question count.`;
}

function sourceCapacityTypeSummary(capacity: SourceCapacityDiagnostics) {
  const entries = Object.entries(capacity.byType ?? {});
  if (!entries.length) return "";

  return entries
    .map(([type, item]) => {
      const skipped = sourceCapacitySkippedSummary(item.skipped);
      const blocker = item.blockerReasons?.[0];

      return [
        `${type}: ${item.effectiveAvailable ?? item.available}/${item.required} effective${item.rawAvailable !== undefined ? ` (${item.rawAvailable} raw)` : ""}`,
        skipped,
        blocker,
      ]
        .filter(Boolean)
        .join("; ");
    })
    .join(" | ");
}

function sourceCapacitySkippedSummary(
  skipped: NonNullable<
    NonNullable<SourceCapacityDiagnostics["byType"]>[string]["skipped"]
  > | undefined,
) {
  if (!skipped) return "";
  const parts = [
    skipped.repeatedSourceKey
      ? `${skipped.repeatedSourceKey} reused key${skipped.repeatedSourceKey === 1 ? "" : "s"}`
      : "",
    skipped.duplicate
      ? `${skipped.duplicate} duplicate${skipped.duplicate === 1 ? "" : "s"}`
      : "",
    skipped.validation
      ? `${skipped.validation} invalid`
      : "",
  ].filter(Boolean);

  return parts.length ? `skipped ${parts.join(", ")}` : "";
}

function continuationProgressFromError(error: unknown) {
  if (!error || typeof error !== "object") return {};
  const record = error as {
    readyQuestionCount?: unknown;
    targetQuestionCount?: unknown;
    missingQuestionCount?: unknown;
  };
  return {
    readyQuestionCount: numberValue(record.readyQuestionCount),
    targetQuestionCount: numberValue(record.targetQuestionCount),
    missingQuestionCount: numberValue(record.missingQuestionCount),
  };
}

function continuationMessage(
  progress: {
    readyQuestionCount?: number;
    targetQuestionCount?: number;
    missingQuestionCount?: number;
  },
  attempt: number,
  paperId: number,
) {
  const countLabel =
    progress.readyQuestionCount && progress.targetQuestionCount
      ? `${progress.readyQuestionCount}/${progress.targetQuestionCount}`
      : "saved";
  const missingLabel = progress.missingQuestionCount
    ? ` ${progress.missingQuestionCount} missing question${
        progress.missingQuestionCount === 1 ? "" : "s"
      } remain.`
    : "";

  return `Continuing from ${countLabel} valid questions in paper #${paperId}.${missingLabel} Auto-continue ${attempt}/${maxAutoContinueAttempts()}...`;
}

function questionProgressLabel(progress: {
  readyQuestionCount?: number;
  targetQuestionCount?: number;
}) {
  if (!progress.readyQuestionCount || progress.readyQuestionCount <= 0) return "";
  return progress.targetQuestionCount
    ? `${progress.readyQuestionCount}/${progress.targetQuestionCount} valid questions saved`
    : `${progress.readyQuestionCount} valid questions saved`;
}

function maxAutoContinueAttempts() {
  return 6;
}

function maxZeroProgressAutoContinueAttempts() {
  return 2;
}

function autoContinueDelayMs() {
  return 900;
}

function clearAutoContinueTimer(timerRef: React.MutableRefObject<number | null>) {
  if (timerRef.current === null) return;
  window.clearTimeout(timerRef.current);
  timerRef.current = null;
}

function isQuestionOutputError(
  error: { message: string; code?: string | number; auth?: boolean } | null,
) {
  if (!error) return false;
  if (error.code === "GENERATION_CAN_SKIP_INVALID") return true;

  return /Invalid .* question|No valid generated questions|no usable .* questions|generated \d+\/\d+ unique|Duplicate question|empty response|text instead of valid JSON|malformed JSON/i.test(
    error.message,
  );
}

function generationErrorGuidance(
  error: {
    message: string;
    code?: string | number;
    paperId?: number;
    recoverable?: boolean;
    readyQuestionCount?: number;
    targetQuestionCount?: number;
    providerHealth?: PublicAIProviderHealthSnapshot;
    providerRecoveryMode?: ProviderRecoveryMode;
    sourceCapacity?: SourceCapacityDiagnostics;
    activeOperation?: string;
    failureSource?: string;
    errorClass?: string;
  } | null,
  provider: AIProvider,
) {
  if (!error) return "";
  if (isSourceTextShortageError(error)) {
    return sourceCapacityGuidance(error.sourceCapacity);
  }
  if (error.providerRecoveryMode === "source_backed_provider_outage") {
    return "Finishing from selected TXT/PDF source text because provider fallback could not complete.";
  }
  if (error.providerHealth && !error.providerHealth.usableProviders.length) {
    return providerHealthAction(error.providerHealth);
  }
  if (/provider diagnostics were available|deployment health|Vercel runtime log/i.test(error.message)) {
    return "The server stopped before AI provider health could be checked. Verify /api/deployment-health, then /api/ai/provider-health; if deployment health still returns 500, the first Vercel runtime log is the blocker.";
  }
  if (/quota|credit|billing|402|max_tokens/i.test(error.message)) {
    return provider === "AUTO"
      ? "Provider quota blocked the request. Lower the question count or add credits to the configured provider."
      : "Provider quota blocked the request. Use Retry Auto Fallback, lower the question count, or add credits to that provider.";
  }
  if (/timeout|timed out|network|fetch failed|ECONNRESET|ENOTFOUND|ETIMEDOUT/i.test(error.message)) {
    return error.providerHealth
      ? "The AI provider timed out after health preflight. Retry once, use Auto Fallback, or reduce question count/format variety for a faster run."
      : "A deployment or source-loading request timed out before provider diagnostics were available. Retry once, then check deployment health and Vercel runtime logs.";
  }
  if (isQuestionOutputError(error)) {
    return "The AI returned invalid or duplicate output. Skip & Replace keeps valid questions and rebuilds the broken parts where possible.";
  }
  if (error.recoverable) {
    const progress = questionProgressLabel(error);
    return progress
      ? `Valid progress was saved (${progress}). Retry continues the same paper instead of starting from zero.`
      : "No valid questions were saved yet. Lower question formats/count, switch to source-backed mode, or use Retry Auto Fallback before trying again.";
  }
  return "Check the selected provider, source coverage, and question count before retrying.";
}

function generationTimingSnapshot(
  progress: number,
  startedAt: number | null,
  now: number,
) {
  if (!startedAt) {
    return {
      elapsedLabel: "0s",
      remainingLabel: "Estimating time...",
    };
  }

  const elapsedSeconds = Math.max(0, (now - startedAt) / 1000);
  const safeProgress = Math.max(0, Math.min(100, progress));
  const remainingSeconds =
    safeProgress > 5 && safeProgress < 100
      ? Math.ceil((elapsedSeconds / safeProgress) * (100 - safeProgress))
      : null;

  return {
    elapsedLabel: formatGenerationDuration(elapsedSeconds),
    remainingLabel:
      safeProgress >= 100
        ? "Done"
        : remainingSeconds && Number.isFinite(remainingSeconds)
          ? `Estimated ${formatGenerationDuration(remainingSeconds)} left`
          : "Estimating time...",
  };
}

function formatGenerationDuration(seconds: number) {
  const rounded = Math.max(0, Math.round(seconds));
  if (rounded < 60) return `${rounded}s`;
  const minutes = Math.floor(rounded / 60);
  const remainder = rounded % 60;
  return remainder ? `${minutes}m ${remainder}s` : `${minutes}m`;
}

function generationSlowWarningMs() {
  return 60_000;
}

function generationHardTimeoutMs() {
  return 150_000;
}

function safeSessionGet(key: string) {
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSessionSet(key: string, value: string) {
  try {
    window.sessionStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

function safeSessionRemove(key: string) {
  try {
    window.sessionStorage.removeItem(key);
  } catch {
    // Ignore blocked sessionStorage during cleanup.
  }
}

function clearStaleGenerationSessionKeys() {
  try {
    const keys = Array.from({ length: window.sessionStorage.length }, (_, index) =>
      window.sessionStorage.key(index),
    ).filter((key): key is string => Boolean(key));

    keys.forEach((key) => {
      if (!key.startsWith("edutest:generation:")) return;
      const value = window.sessionStorage.getItem(key);
      if (!value || isStaleGeneration(value)) {
        window.sessionStorage.removeItem(key);
      }
    });
  } catch {
    // Ignore blocked sessionStorage; generation still works without cleanup.
  }
}

function providerLabel(provider: AIProvider) {
  if (provider === "GEMINI") return "Gemini";
  if (provider === "GROQ") return "GroqCloud";
  if (provider === "GROK") return "xAI Grok";
  if (provider === "MISTRAL") return "Mistral";
  if (provider === "CEREBRAS") return "Cerebras";
  if (provider === "DEEPSEEK") return "DeepSeek";
  if (provider === "MINIMAX") return "MiniMax";
  if (provider === "OPENROUTER") return "OpenRouter";
  if (provider === "GITHUB_MODELS") return "GitHub Models";
  if (provider === "COHERE") return "Cohere";
  if (provider === "CLOUDFLARE") return "Cloudflare AI";
  if (provider === "OPENAI") return "OpenAI";
  return "Auto Fallback";
}

function modelForProvider(provider: AIProvider, status: ProviderStatus | null) {
  if (!status) return null;
  if (provider === "GEMINI") return status.geminiModel;
  if (provider === "GROQ") return status.groqModel;
  if (provider === "GROK") return status.grokModel;
  if (provider === "MISTRAL") return status.mistralModel;
  if (provider === "CEREBRAS") return status.cerebrasModel;
  if (provider === "DEEPSEEK") return status.deepseekModel;
  if (provider === "MINIMAX") return status.miniMaxModel;
  if (provider === "OPENROUTER") return status.openRouterModel;
  if (provider === "GITHUB_MODELS") return status.githubModelsModel;
  if (provider === "COHERE") return status.cohereModel;
  if (provider === "CLOUDFLARE") return status.cloudflareModel;
  if (provider === "OPENAI") return status.openAIModel;

  return [
    status.gemini ? `Gemini ${status.geminiModel}` : null,
    status.groq ? `GroqCloud ${status.groqModel}` : null,
    status.mistral ? `Mistral ${status.mistralModel}` : null,
    status.minimax ? `MiniMax ${status.miniMaxModel}` : null,
    status.cerebras ? `Cerebras ${status.cerebrasModel}` : null,
    status.openrouter ? `OpenRouter ${status.openRouterModel}` : null,
    status.githubModels ? `GitHub Models ${status.githubModelsModel}` : null,
    status.cohere ? `Cohere ${status.cohereModel}` : null,
    status.cloudflare ? `Cloudflare ${status.cloudflareModel}` : null,
    status.grok ? `xAI Grok ${status.grokModel}` : null,
    status.deepseek ? `DeepSeek ${status.deepseekModel}` : null,
    status.openai ? `OpenAI ${status.openAIModel}` : null,
  ]
    .filter(Boolean)
    .join(" -> ");
}
