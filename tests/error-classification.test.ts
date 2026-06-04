import { describe, expect, it } from "vitest";
import {
  compactAiProviderFailureMessage,
  friendlyExportError,
  friendlyPdfProcessingError,
  isAIProviderUnavailableError,
  providerHealthFailureMessage,
  providerHealthAction,
  publicAIProviderHealthSnapshot,
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

  it("serializes provider health into safe, actionable deployment guidance", () => {
    const health = publicAIProviderHealthSnapshot({
      checkedAt: "2026-06-04T00:00:00.000Z",
      task: "QUESTION_GENERATION",
      configuredProviders: ["GEMINI", "GROQ"],
      usableProviders: [],
      providers: [
        {
          provider: "GEMINI",
          configured: true,
          usable: false,
          model: "gemini-2.5-flash",
          cooldownUntil: null,
          cooldownReason: null,
          cooldownErrorClass: null,
          lastFailureClass: "timeout",
          lastFailure: "Gemini request timed out after 10 seconds.",
        },
        {
          provider: "GROQ",
          configured: true,
          usable: false,
          model: "llama-3.3-70b-versatile",
          cooldownUntil: null,
          cooldownReason: null,
          cooldownErrorClass: null,
          lastFailureClass: "auth",
          lastFailure: "invalid api key sk-secretkeythatisverylongandbad",
        },
      ],
    });

    expect(health.summary).toContain("Gemini: timed out");
    expect(health.summary).toContain("GroqCloud: key missing, invalid, or not allowed");
    expect(health.providers[1].failure).toContain("[redacted-key]");
    expect(providerHealthAction(health)).toContain("Vercel Production");
    expect(providerHealthFailureMessage(health)).toContain(
      "All configured AI providers failed",
    );
  });

  it("classifies provider outages through the shared detector", () => {
    expect(
      isAIProviderUnavailableError(
        new Error(
          "All configured AI providers failed. GroqCloud: no credits. Gemini: provider timed out.",
        ),
      ),
    ).toBe(true);
    expect(isAIProviderUnavailableError(new Error("Duplicate question skipped"))).toBe(
      false,
    );
  });

  it("classifies screenshot-style provider health failures as recoverable outages", () => {
    const message = [
      "Cerebras: Cerebras question generation health preflight failed:",
      "Cerebras generation failed (429): We're experiencing high traffic right now! Please try again soon.",
      "OpenRouter: openrouter/auto: not enough provider credits for the requested output.",
      "Cohere: command-a-03-2025: API key is missing, invalid, or not allowed.",
    ].join(" ");

    expect(isAIProviderUnavailableError(new Error(message))).toBe(true);
    const compact = compactAiProviderFailureMessage(
      `All configured AI providers failed. ${message}`,
    );

    expect(compact).toContain("Cerebras: rate-limited");
    expect(compact).toContain("OpenRouter: no credits or quota");
    expect(compact).toContain("Cohere: key missing, invalid, or not allowed");
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
