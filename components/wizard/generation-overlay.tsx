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
import { generationPhaseLabels } from "@/lib/question-planning";
import { cn } from "@/lib/utils";
import type { AIProvider, PaperConfig } from "@/types";

const progressSteps = generationPhaseLabels;

type ProviderStatus = {
  gemini: boolean;
  grok: boolean;
  mistral: boolean;
  deepseek: boolean;
  openrouter: boolean;
  openai: boolean;
  cerebras: boolean;
  defaultProvider: string;
  geminiModel: string;
  grokModel: string;
  mistralModel: string;
  cerebrasModel: string;
  deepseekModel: string;
  openRouterModel: string;
  openAIModel: string;
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
  const [salvageInvalidQuestions, setSalvageInvalidQuestions] =
    React.useState(true);
  const [error, setError] = React.useState<{
    message: string;
    code?: string | number;
    auth?: boolean;
  } | null>(null);
  const [retryNonce, setRetryNonce] = React.useState(0);
  const started = React.useRef(false);
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
  const idempotencyKey = React.useMemo(
    () =>
      randomGenerationKey(
        `${open}:${retryNonce}:${requestConfig.aiProvider}:${requestConfig.classNum}:${requestConfig.subject}:${requestConfig.totalQuestions}:${salvageInvalidQuestions}`,
      ),
    [open, requestConfig, retryNonce, salvageInvalidQuestions],
  );

  React.useEffect(() => {
    if (open) return;
    let cancelled = false;
    started.current = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setActiveIndex(0);
      setProgress(8);
      setGenerationStartedAt(null);
      setGenerationNow(Date.now());
      setCurrentMessage("Preparing generation...");
      setProviderOverride(null);
      setSalvageInvalidQuestions(true);
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
    started.current = true;
    queueMicrotask(() => {
      if (cancelled) return;
      setError(null);
      setActiveIndex(0);
      setProgress(8);
      const startedAt = Date.now();
      setGenerationStartedAt(startedAt);
      setGenerationNow(startedAt);
      setCurrentMessage("Preparing generation...");
    });

    const inFlightKey = `edutest:generation:${idempotencyKey}`;
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

      try {
        const response = await fetch("/api/generate-paper", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            ...requestConfig,
            idempotencyKey,
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
              throw generationError(
                stringValue(data.msg) ?? "Paper generation failed.",
                stringValue(data.code) ?? numberValue(data.code),
              );
            }

            if (event === "done") {
              completed = true;
              setActiveIndex(progressSteps.length - 1);
              setProgress(100);
              const paperId = numberValue(data.paperId);
              if (!paperId) {
                throw generationError(
                  "Generation finished without a valid paper id. Please retry.",
                  "GENERATION_BAD_DONE_PAYLOAD",
                );
              }
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
                      paperConfig.sourceMode === "pdf_upload"
                        ? `${paperConfig.pdfSource?.title ?? "PDF-EDU-TEST"} Paper`
                        : `Class ${paperConfig.classNum} ${paperConfig.subject} ${paperConfig.examType}`,
                    config: paperConfig,
                    status: "READY",
                    sessionOnly: Boolean(data.sessionOnly),
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
              router.push(`/papers/${paperId}/preview`);
            }
          });
        }

        if (!completed) {
          throw new Error("Generation stopped before the paper was saved.");
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
        setError({
          message,
          code,
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
    started.current = false;
    setRetryNonce((value) => value + 1);
  }

  function retryWithAutoFallback() {
    safeSessionRemove(`edutest:generation:${idempotencyKey}`);
    setSalvageInvalidQuestions(true);
    setProviderOverride("AUTO");
    started.current = false;
    setRetryNonce((value) => value + 1);
  }

  function skipAndReplaceQuestions() {
    safeSessionRemove(`edutest:generation:${idempotencyKey}`);
    setSalvageInvalidQuestions(true);
    setCurrentMessage("Skipping broken questions and replacing what can be rebuilt...");
    started.current = false;
    setRetryNonce((value) => value + 1);
  }

  const provider = requestConfig.aiProvider ?? "AUTO";
  const providerModel = modelForProvider(provider, providerStatus);
  const canSkipAndReplace = isQuestionOutputError(error);
  const timing = generationTimingSnapshot(progress, generationStartedAt, generationNow);

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
            ? error.message
            : "Progress and ETA are based on live generation events."}
        </p>

        <div className="mt-4 rounded-lg border border-white/10 bg-white/[0.035] p-3 text-sm">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <span className="font-semibold text-slate-100">
              Engine: {providerLabel(provider)}
            </span>
            {providerModel ? (
              <span className="text-slate-400">Model: {providerModel}</span>
            ) : null}
          </div>
          <p className="mt-2 text-slate-300">{error ? error.message : currentMessage}</p>
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
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {provider !== "AUTO" ? (
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
            <Button type="button" className="flex-1" onClick={retry}>
              <RefreshCw className="h-4 w-4" />
              Retry
            </Button>
          </div>
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

function generationError(message: string, code?: string | number) {
  const error = new Error(message);
  (error as Error & { code?: string | number }).code = code;
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : undefined;
}

function numberValue(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function paperConfigFromStream(value: unknown, fallback: PaperConfig): PaperConfig {
  if (!isRecord(value)) return fallback;
  return {
    ...fallback,
    ...value,
  } as PaperConfig;
}

function getErrorCode(error: unknown) {
  return error && typeof error === "object" && "code" in error
    ? (error as { code?: string | number }).code
    : undefined;
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

function providerLabel(provider: AIProvider) {
  if (provider === "GEMINI") return "Gemini";
  if (provider === "GROK") return "xAI Grok";
  if (provider === "MISTRAL") return "Mistral";
  if (provider === "CEREBRAS") return "Cerebras";
  if (provider === "DEEPSEEK") return "DeepSeek";
  if (provider === "OPENROUTER") return "OpenRouter";
  if (provider === "OPENAI") return "OpenAI";
  return "Auto Fallback";
}

function modelForProvider(provider: AIProvider, status: ProviderStatus | null) {
  if (!status) return null;
  if (provider === "GEMINI") return status.geminiModel;
  if (provider === "GROK") return status.grokModel;
  if (provider === "MISTRAL") return status.mistralModel;
  if (provider === "CEREBRAS") return status.cerebrasModel;
  if (provider === "DEEPSEEK") return status.deepseekModel;
  if (provider === "OPENROUTER") return status.openRouterModel;
  if (provider === "OPENAI") return status.openAIModel;

  return [
    status.gemini ? `Gemini ${status.geminiModel}` : null,
    status.mistral ? `Mistral ${status.mistralModel}` : null,
    status.cerebras ? `Cerebras ${status.cerebrasModel}` : null,
    status.openrouter ? `OpenRouter ${status.openRouterModel}` : null,
    status.grok ? `xAI Grok ${status.grokModel}` : null,
    status.deepseek ? `DeepSeek ${status.deepseekModel}` : null,
    status.openai ? `OpenAI ${status.openAIModel}` : null,
  ]
    .filter(Boolean)
    .join(" -> ");
}
