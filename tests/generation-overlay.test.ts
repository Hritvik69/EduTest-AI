import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
    warning: vi.fn(),
  },
}));

import {
  compactGenerationToastMessage,
  generationOverlayTitle,
  shouldOfferFreshQuestionRetry,
  successfulGenerationFallbackWarningFromDoneEvent,
} from "@/components/wizard/generation-overlay";

describe("generation overlay completion fallback UI", () => {
  it("keeps the fresh retry action above engine diagnostics", () => {
    const overlay = readFileSync(
      join(process.cwd(), "components", "wizard", "generation-overlay.tsx"),
      "utf8",
    );
    const topActionIndex = overlay.indexOf(
      "Starts a new AI attempt with a fresh candidate pool",
    );
    const engineDiagnosticsIndex = overlay.indexOf("Engine: {providerLabel(provider)}");

    expect(topActionIndex).toBeGreaterThan(0);
    expect(engineDiagnosticsIndex).toBeGreaterThan(topActionIndex);
  });

  it("treats low strict source capacity as a success warning when final fallback completes", () => {
    const donePayload = {
      paperId: "session-123",
      status: "READY",
      remainingMissingQuestions: 0,
      sourceCapacity: {
        requiredMissingCount: 15,
        rawAtomCapacity: 15,
        effectiveCapacity: 3,
        availableStrictCapacity: 3,
        sourceConceptCount: 2,
        atomCount: 15,
        consumedAtomTypeKeys: 8,
        enough: false,
      },
      validationWarnings: [
        {
          type: "syllabus-near-fallback",
          reason:
            "syllabus-near-fallback: completed 12 final replacement questions with chapter/topic-near coverage.",
        },
      ],
    };

    expect(generationOverlayTitle(false)).toBe("Generating Your Paper");
    expect(generationOverlayTitle(false)).not.toBe("Generation Needs Attention");
    expect(successfulGenerationFallbackWarningFromDoneEvent(donePayload)).toMatch(
      /chapter\/topic-near coverage/i,
    );
  });

  it("offers a fresh-question retry for strict replacement capacity failures", () => {
    const error = {
      code: "SOURCE_TEXT_NOT_ENOUGH",
      message:
        "Selected source text cannot produce enough 100% distinct questions for replacing invalid or duplicate questions. MCQ skipped 300 format-invalid candidates.",
      sourceCapacity: {
        requiredMissingCount: 13,
        rawAtomCapacity: 13,
        effectiveCapacity: 3,
        availableStrictCapacity: 3,
        sourceConceptCount: 8,
        atomCount: 89,
        consumedAtomTypeKeys: 12,
        enough: false,
      },
    };

    expect(shouldOfferFreshQuestionRetry(error)).toBe(true);
    expect(compactGenerationToastMessage(error)).toBe(
      "Generation needs attention: 3/13 strict replacements available. Try again with new questions.",
    );
    expect(compactGenerationToastMessage(error)).not.toMatch(/MCQ skipped 300/i);
  });
});
