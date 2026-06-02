import sql from "@/lib/db";
import type { AIProvider, AITask, GenerationManifest } from "@/types";

type AIUsageStatus = "success" | "failure";

export interface AIUsageLogInput {
  generationJobId?: string;
  paperId?: number;
  task?: AITask;
  provider: Exclude<AIProvider, "AUTO">;
  model?: string;
  status: AIUsageStatus;
  errorClass?: string;
  durationMs: number;
  promptChars: number;
  responseChars?: number;
  maxOutputTokens?: number;
  cacheHit?: boolean;
  cooldownApplied?: boolean;
}

interface AIUsageLogEntry extends AIUsageLogInput {
  task: AITask;
  estimatedInputTokens: number;
  estimatedOutputTokens: number;
  createdAt: string;
}

const globalForUsageLogs = globalThis as typeof globalThis & {
  __edutestAIUsageLogs?: AIUsageLogEntry[];
};

const memoryUsageLogs = globalForUsageLogs.__edutestAIUsageLogs ?? [];
globalForUsageLogs.__edutestAIUsageLogs = memoryUsageLogs;

export async function recordAIUsage(input: AIUsageLogInput) {
  const entry: AIUsageLogEntry = {
    ...input,
    task: input.task ?? "QUESTION_GENERATION",
    responseChars: input.responseChars ?? 0,
    estimatedInputTokens: estimateTokens(input.promptChars),
    estimatedOutputTokens: estimateTokens(input.responseChars ?? 0),
    cacheHit: Boolean(input.cacheHit),
    cooldownApplied: Boolean(input.cooldownApplied),
    createdAt: new Date().toISOString(),
  };

  memoryUsageLogs.push(entry);
  if (memoryUsageLogs.length > 500) {
    memoryUsageLogs.splice(0, memoryUsageLogs.length - 500);
  }

  if (!sql) return;

  try {
    await sql`
      INSERT INTO ai_usage_logs (
        generation_job_id,
        paper_id,
        task,
        provider,
        model,
        status,
        error_class,
        duration_ms,
        prompt_chars,
        response_chars,
        max_output_tokens,
        estimated_input_tokens,
        estimated_output_tokens,
        cache_hit,
        cooldown_applied
      )
      VALUES (
        ${entry.generationJobId ?? null},
        ${entry.paperId ?? null},
        ${entry.task},
        ${entry.provider},
        ${entry.model ?? null},
        ${entry.status},
        ${entry.errorClass ?? null},
        ${Math.round(entry.durationMs)},
        ${entry.promptChars},
        ${entry.responseChars ?? 0},
        ${entry.maxOutputTokens ?? null},
        ${entry.estimatedInputTokens},
        ${entry.estimatedOutputTokens},
        ${entry.cacheHit ?? false},
        ${entry.cooldownApplied ?? false}
      )
    `;
  } catch {
    // Usage logging must never break generation or evaluation.
  }
}

export function summarizeAIUsage(
  generationJobId?: string,
): GenerationManifest["ai"]["usageSummary"] | undefined {
  if (!generationJobId) return undefined;

  const entries = memoryUsageLogs.filter(
    (entry) => entry.generationJobId === generationJobId,
  );
  if (!entries.length) return undefined;

  return {
    totalCalls: entries.length,
    successCalls: entries.filter((entry) => entry.status === "success").length,
    failureCalls: entries.filter((entry) => entry.status === "failure").length,
    providersUsed: unique(entries.map((entry) => entry.provider)),
    tasksUsed: unique(entries.map((entry) => entry.task)),
    totalDurationMs: Math.round(
      entries.reduce((sum, entry) => sum + entry.durationMs, 0),
    ),
    estimatedInputTokens: entries.reduce(
      (sum, entry) => sum + entry.estimatedInputTokens,
      0,
    ),
    estimatedOutputTokens: entries.reduce(
      (sum, entry) => sum + entry.estimatedOutputTokens,
      0,
    ),
    cacheHits: entries.filter((entry) => entry.cacheHit).length,
    errorClasses: unique(
      entries.map((entry) => entry.errorClass).filter(Boolean) as string[],
    ),
  };
}

export function classifyAIUsageError(message: string) {
  if (/401|403|unauthorized|permission|api key|invalid key|not allowed/i.test(message)) {
    return "auth";
  }
  if (/402|credit|quota|billing|can only afford|max_tokens/i.test(message)) {
    return "quota";
  }
  if (/429|rate.?limit/i.test(message)) return "rate_limit";
  if (/abort|timeout|timed out/i.test(message)) return "timeout";
  if (/503|service unavailable|high demand|overloaded/i.test(message)) {
    return "provider_busy";
  }
  if (/network|fetch failed|ECONNRESET|ENOTFOUND|ETIMEDOUT/i.test(message)) {
    return "network";
  }
  if (/empty response|valid JSON|malformed JSON/i.test(message)) {
    return "invalid_output";
  }
  return "unknown";
}

function estimateTokens(chars: number) {
  return Math.max(0, Math.ceil(chars / 4));
}

function unique<T>(values: T[]) {
  return Array.from(new Set(values));
}
