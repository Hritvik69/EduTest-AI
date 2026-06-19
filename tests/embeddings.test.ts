import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// We want the embeddings module to be reloaded for each "missing API key"
// test because it captures process.env.GEMINI_API_KEY at import time.
// Using vi.resetModules + dynamic import gives us a fresh module per case.

const embedContentMock = vi.fn();
const batchEmbedContentsMock = vi.fn();

vi.mock("@google/generative-ai", () => {
  return {
    GoogleGenerativeAI: class {
      getGenerativeModel() {
        return {
          embedContent: embedContentMock,
          batchEmbedContents: batchEmbedContentsMock,
        };
      }
    },
  };
});

describe("embeddings helpers", () => {
  beforeEach(() => {
    embedContentMock.mockReset();
    batchEmbedContentsMock.mockReset();
  });

  afterEach(() => {
    delete process.env.GEMINI_API_KEY;
    vi.resetModules();
  });

  async function loadEmbeddingsModule() {
    return await import("@/lib/embeddings");
  }

  describe("generateEmbedding", () => {
    it("returns the embedding values array from Gemini", async () => {
      process.env.GEMINI_API_KEY = "test-key";
      const { generateEmbedding } = await loadEmbeddingsModule();

      const fakeVector = new Array(768).fill(0).map((_, i) => i / 768);
      embedContentMock.mockResolvedValueOnce({
        embedding: { values: fakeVector },
      });

      const result = await generateEmbedding("Faraday's law of induction");

      expect(result).toHaveLength(768);
      expect(result[0]).toBeCloseTo(0);
      expect(result[767]).toBeCloseTo(767 / 768);
      expect(embedContentMock).toHaveBeenCalledTimes(1);
      expect(embedContentMock).toHaveBeenCalledWith("Faraday's law of induction");
    });

    it("throws a descriptive error when GEMINI_API_KEY is missing", async () => {
      // GEMINI_API_KEY is unset for this module load (afterEach cleared it).
      const { generateEmbedding } = await loadEmbeddingsModule();
      await expect(generateEmbedding("anything")).rejects.toThrow(
        /GEMINI_API_KEY is not configured/,
      );
    });

    it("propagates upstream errors from the Gemini client", async () => {
      process.env.GEMINI_API_KEY = "test-key";
      const { generateEmbedding } = await loadEmbeddingsModule();
      embedContentMock.mockRejectedValueOnce(new Error("rate limited"));
      await expect(generateEmbedding("abc")).rejects.toThrow("rate limited");
    });
  });

  describe("generateEmbeddingsBatch", () => {
    it("calls batchEmbedContents once and returns parallel arrays", async () => {
      process.env.GEMINI_API_KEY = "test-key";
      const { generateEmbeddingsBatch } = await loadEmbeddingsModule();

      const v1 = new Array(768).fill(0.1);
      const v2 = new Array(768).fill(0.2);
      batchEmbedContentsMock.mockResolvedValueOnce({
        embeddings: [{ values: v1 }, { values: v2 }],
      });

      const result = await generateEmbeddingsBatch(["alpha", "beta"]);

      expect(result).toHaveLength(2);
      expect(result[0]).toBe(v1);
      expect(result[1]).toBe(v2);
      expect(batchEmbedContentsMock).toHaveBeenCalledTimes(1);

      const arg = batchEmbedContentsMock.mock.calls[0][0];
      expect(arg.requests).toHaveLength(2);
      expect(arg.requests[0].model).toBe("models/text-embedding-004");
      expect(arg.requests[0].content.parts[0].text).toBe("alpha");
      expect(arg.requests[1].content.parts[0].text).toBe("beta");
    });

    it("throws when GEMINI_API_KEY is missing", async () => {
      const { generateEmbeddingsBatch } = await loadEmbeddingsModule();
      await expect(generateEmbeddingsBatch(["x"])).rejects.toThrow(
        /GEMINI_API_KEY is not configured/,
      );
    });

    it("returns an empty array when called with no inputs", async () => {
      process.env.GEMINI_API_KEY = "test-key";
      const { generateEmbeddingsBatch } = await loadEmbeddingsModule();
      batchEmbedContentsMock.mockResolvedValueOnce({ embeddings: [] });
      const result = await generateEmbeddingsBatch([]);
      expect(result).toEqual([]);
    });
  });

  describe("semanticChunking", () => {
    // semanticChunking is a pure function with no env capture, so we can
    // import it once at the top of the suite without resetting modules.
    let semanticChunking: (text: string, maxChars?: number) => string[];
    beforeEach(async () => {
      process.env.GEMINI_API_KEY = "test-key";
      const mod = await loadEmbeddingsModule();
      semanticChunking = mod.semanticChunking;
    });

    it("splits on double newlines and joins short paragraphs", () => {
      const text = "Para A line 1.\n\nPara B line 1.\n\nPara C line 1.";
      const chunks = semanticChunking(text, 1500);
      expect(chunks).toHaveLength(1);
      expect(chunks[0]).toContain("Para A line 1.");
      expect(chunks[0]).toContain("Para B line 1.");
      expect(chunks[0]).toContain("Para C line 1.");
    });

    it("respects the maxChars budget and starts a new chunk when full", () => {
      const para = "x".repeat(40);
      const text = [para, para, para, para, para].join("\n\n");
      const chunks = semanticChunking(text, 100);

      expect(chunks.length).toBeGreaterThan(1);
      // Each chunk may carry one extra paragraph that pushes it just past
      // the budget; that's the documented behaviour. We just assert none
      // got wildly out of control.
      chunks.forEach((chunk) => {
        expect(chunk.length).toBeLessThanOrEqual(100 + para.length);
      });
    });

    it("skips empty paragraphs and trims whitespace", () => {
      const text = "Real paragraph.\n\n   \n\n\n   Another one.   \n\n";
      const chunks = semanticChunking(text, 1500);
      expect(chunks).toHaveLength(1);
      expect(chunks[0]).toBe("Real paragraph.\n\nAnother one.");
    });

    it("returns an empty array for empty input", () => {
      expect(semanticChunking("")).toEqual([]);
      expect(semanticChunking("\n\n\n   \n")).toEqual([]);
    });
  });
});
