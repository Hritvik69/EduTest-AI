import { describe, expect, it } from "vitest";
import {
  compactAiProviderFailureMessage,
  friendlyExportError,
  friendlyPdfProcessingError,
} from "@/lib/error-classification";

describe("error classification", () => {
  it("compresses noisy provider fallback failures into safe user guidance", () => {
    const message = compactAiProviderFailureMessage(
      [
        "All configured AI providers failed.",
        'Mistral: Mistral generation failed (429): {"object":"error","message":"Rate limit exceeded","code":"1300"}',
        "Cerebras: not enough provider credits for the requested output.",
        "Gemini: provider timed out.",
        "Grok: API key is missing, invalid, or not allowed.",
      ].join(" "),
    );

    expect(message).toContain("Mistral: rate-limited");
    expect(message).toContain("Cerebras: no credits or quota");
    expect(message).toContain("Gemini: timed out");
    expect(message).toContain("Grok: key missing, invalid, or not allowed");
    expect(message).not.toContain('"object"');
  });

  it("redacts accidental keys from surfaced provider errors", () => {
    const message = compactAiProviderFailureMessage(
      "Grok: xai-secretkeythatisverylongandbad should never be printed.",
    );

    expect(message).toContain("[redacted-key]");
    expect(message).not.toContain("xai-secretkey");
  });

  it("turns PDF and export failures into actionable messages", () => {
    expect(
      friendlyPdfProcessingError(new Error("Unexpected end of JSON input")),
    ).toMatch(/invalid output/i);
    expect(friendlyPdfProcessingError(new Error("429 rate limit exceeded"))).toMatch(
      /rate-limited/i,
    );
    expect(friendlyExportError(new Error("Cannot read properties"))).toMatch(
      /PDF export failed/i,
    );
  });
});
