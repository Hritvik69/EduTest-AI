import { afterEach, describe, expect, it, vi } from "vitest";
import { apiErrorMessage, fetchApiData } from "@/lib/api-client";

describe("apiErrorMessage", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("surfaces API validation details when the top-level error is generic", () => {
    expect(
      apiErrorMessage(
        {
          success: false,
          error: "Invalid request payload.",
          code: 400,
          details: {
            issues: [
              {
                path: "typeDistribution",
                message: "Selected question type counts must add up to totalQuestions.",
              },
            ],
          },
        },
        "Request failed.",
      ),
    ).toContain(
      "typeDistribution: Selected question type counts must add up to totalQuestions.",
    );
  });

  it("turns empty API responses into readable errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response("", {
          status: 200,
        }),
      ),
    );

    await expect(
      fetchApiData("/api/chapters", undefined, "Could not load chapters."),
    ).rejects.toThrow(/Empty response received/);
  });
});
