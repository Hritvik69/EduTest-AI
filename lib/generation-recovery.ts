import type { StoredPaper } from "@/types";

export type GenerationRecoveryDecision =
  | {
      kind: "ready";
      paperId: number;
      paper: StoredPaper;
    }
  | {
      kind: "recoverable";
      paperId: number;
      message: string;
      readyQuestionCount?: number;
      targetQuestionCount?: number;
      missingQuestionCount?: number;
      savedQuestionProgress: boolean;
    }
  | {
      kind: "ignored";
      message: string;
    };

type RecoveryGenerationState = {
  status?: string;
  readyQuestionCount?: number;
  targetQuestionCount?: number;
  missingQuestionCount?: number;
  lastMessage?: string;
  lastError?: string;
};

export function classifyRecoveredPaper(
  paper: StoredPaper | null | undefined,
  fallbackPaperId?: number,
): GenerationRecoveryDecision {
  const paperId = typeof paper?.id === "number" ? paper.id : fallbackPaperId;

  if (!paper) {
    return {
      kind: "ignored",
      message:
        "Generation stopped before a complete paper was saved. No finished paper was added to your dashboard.",
    };
  }

  if (paper.status === "READY" && paper.questions?.length) {
    return { kind: "ready", paperId: paperId ?? 0, paper };
  }

  const generationState = recoveryGenerationStateFromMetadata(paper.errorMetadata);
  const hasRecoverableGenerationState =
    Boolean(generationState) &&
    (paper.status === "GENERATING" ||
      generationState?.status === "NEEDS_CONTINUATION");
  if (generationState && hasRecoverableGenerationState) {
    const readyQuestionCount = generationState.readyQuestionCount ?? 0;
    const targetQuestionCount = generationState.targetQuestionCount;
    const missingQuestionCount =
      generationState.missingQuestionCount ??
      (targetQuestionCount ? Math.max(0, targetQuestionCount - readyQuestionCount) : undefined);
    const savedQuestionProgress = readyQuestionCount > 0;
    const defaultMessage = savedQuestionProgress
      ? `Generation paused after saving ${readyQuestionCount}/${targetQuestionCount ?? "?"} valid questions. Retry continues the same paper.`
      : "Generation stopped before any complete questions were saved. Retry continues the same paper setup without opening an incomplete dashboard paper.";

    return {
      kind: "recoverable",
      paperId: paperId ?? 0,
      readyQuestionCount,
      targetQuestionCount,
      missingQuestionCount,
      savedQuestionProgress,
      message: generationState.lastMessage ?? defaultMessage,
    };
  }

  return {
    kind: "ignored",
    message:
      paperId && paper.status === "FAILED"
        ? "Generation failed before a complete paper was saved. No finished paper was added to your dashboard."
        : "Generation stopped before a complete paper was saved. The incomplete paper shell was ignored.",
  };
}

export function recoveryGenerationStateFromMetadata(
  metadata: StoredPaper["errorMetadata"],
): RecoveryGenerationState | null {
  if (!metadata || typeof metadata !== "object") return null;
  const state = metadata.generationState;
  if (!state || typeof state !== "object" || Array.isArray(state)) return null;

  const record = state as Record<string, unknown>;
  const readyQuestionCount = numberValue(record.readyQuestionCount);
  const targetQuestionCount = numberValue(record.targetQuestionCount);
  const missingQuestionCount = numberValue(record.missingQuestionCount);

  if (readyQuestionCount === undefined && targetQuestionCount === undefined) {
    return null;
  }

  return {
    status: stringValue(record.status),
    readyQuestionCount,
    targetQuestionCount,
    missingQuestionCount,
    lastMessage: stringValue(record.lastMessage),
    lastError: stringValue(record.lastError),
  };
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value : undefined;
}
