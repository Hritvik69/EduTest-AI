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
  generationOverlayTitle,
  successfulGenerationFallbackWarningFromDoneEvent,
} from "@/components/wizard/generation-overlay";

describe("generation overlay completion fallback UI", () => {
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
});
