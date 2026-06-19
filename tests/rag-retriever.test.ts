import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// --- Test-level helpers (no vi.mock here; we use vi.doMock per test). ------

const state = {
  sqlMode: "null" as "null" | "callable",
  sqlResponse: null as null | (() => Promise<unknown[]>),
  sqlCalls: [] as unknown[][],
  embedMock: vi.fn(),
};

function installMocks() {
  vi.doMock("@/lib/db", () => {
    if (state.sqlMode === "null") {
      return { default: null };
    }
    const fn = (...args: unknown[]) => {
      state.sqlCalls.push(args);
      return state.sqlResponse
        ? state.sqlResponse()
        : Promise.resolve([]);
    };
    return { default: fn };
  });

  vi.doMock("@/lib/embeddings", () => ({
    generateEmbedding: state.embedMock,
  }));
}

beforeEach(() => {
  delete process.env.DATABASE_URL;
  delete process.env.GEMINI_API_KEY;
  state.sqlMode = "null";
  state.sqlResponse = null;
  state.sqlCalls = [];
  state.embedMock.mockReset();
  vi.resetModules();
});

afterEach(() => {
  vi.resetModules();
  vi.doUnmock("@/lib/db");
  vi.doUnmock("@/lib/embeddings");
});

async function loadRagRetriever() {
  installMocks();
  return await import("@/lib/rag-retriever");
}

function makeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    text: "Faraday discovered electromagnetic induction in 1831.",
    type: "FACT",
    bloom_level: "REMEMBER",
    hots_potential: false,
    source: "ncert_txt",
    chapter_id: 7,
    topic_id: 42,
    topic_name: "Electromagnetic Induction",
    chapter_name: "Magnetic Effects of Electric Current",
    rrf_score: 0.03,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------

describe("rag-retriever hybridSearch", () => {
  it("returns [] when sql is unavailable (no DATABASE_URL)", async () => {
    // sqlMode defaults to "null"
    const { hybridSearch } = await loadRagRetriever();
    const result = await hybridSearch([1], "Faraday");
    expect(result).toEqual([]);
    expect(state.embedMock).not.toHaveBeenCalled();
  });

  it("returns [] when chapterIds is empty", async () => {
    const { hybridSearch } = await loadRagRetriever();
    const result = await hybridSearch([], "Faraday");
    expect(result).toEqual([]);
    expect(state.embedMock).not.toHaveBeenCalled();
  });

  it("returns [] when the query is empty/whitespace", async () => {
    const { hybridSearch } = await loadRagRetriever();
    const result = await hybridSearch([1], "   ");
    expect(result).toEqual([]);
    expect(state.embedMock).not.toHaveBeenCalled();
  });

  it("returns ConceptData[] from a successful hybrid query", async () => {
    state.sqlMode = "callable";
    state.sqlResponse = () =>
      Promise.resolve([
        makeRow({ id: 1, rrf_score: 0.05 }),
        makeRow({
          id: 2,
          text: "Ohm's law relates voltage and current.",
          topic_name: "Ohm's Law",
          rrf_score: 0.02,
        }),
      ]);
    state.embedMock.mockResolvedValueOnce(
      new Array(768).fill(0).map((_, i) => i / 768),
    );

    const { hybridSearch } = await loadRagRetriever();
    const result = await hybridSearch([7, 8], "electromagnetic induction", 12);

    expect(result).toHaveLength(2);
    expect(result[0].text).toContain("Faraday");
    expect(result[0].topicName).toBe("Electromagnetic Induction");
    expect(result[0].chapterName).toBe(
      "Magnetic Effects of Electric Current",
    );
    expect(result[0].chapterId).toBe(7);
    expect(result[1].text).toContain("Ohm");
    expect(state.embedMock).toHaveBeenCalledTimes(1);
    expect(state.embedMock).toHaveBeenCalledWith("electromagnetic induction");
    expect(state.sqlCalls).toHaveLength(1);
  });

  it("serializes the embedding as a pgvector literal in the SQL", async () => {
    state.sqlMode = "callable";
    state.sqlResponse = () => Promise.resolve([makeRow()]);
    state.embedMock.mockResolvedValueOnce(
      new Array(768).fill(0).map((_, i) => i / 768),
    );

    const { hybridSearch } = await loadRagRetriever();
    await hybridSearch([1], "test query");

    expect(state.sqlCalls).toHaveLength(1);
    const flat = state.sqlCalls[0].flat(Infinity) as unknown[];
    const vectorArg = flat.find(
      (a) =>
        typeof a === "string" &&
        a.startsWith("[0,") &&
        a.endsWith(",0.9986979166666666]"),
    );
    expect(typeof vectorArg).toBe("string");
    const parsed = JSON.parse(vectorArg as string) as number[];
    expect(parsed).toHaveLength(768);
  });

  it("falls back to [] on embedding error", async () => {
    state.sqlMode = "callable";
    state.sqlResponse = () => Promise.resolve([makeRow()]);
    state.embedMock.mockRejectedValueOnce(new Error("upstream timeout"));

    const { hybridSearch } = await loadRagRetriever();
    const result = await hybridSearch([1], "Faraday");
    expect(result).toEqual([]);
  });

  it("falls back to [] when SQL throws", async () => {
    state.sqlMode = "callable";
    state.sqlResponse = () =>
      Promise.reject(new Error("connection terminated"));
    state.embedMock.mockResolvedValueOnce(
      new Array(768).fill(0).map((_, i) => i / 768),
    );

    const { hybridSearch } = await loadRagRetriever();
    const result = await hybridSearch([1], "Faraday");
    expect(result).toEqual([]);
  });

  it("normalizes pdf_source_text type via normalizeNcertTxtConceptType", async () => {
    state.sqlMode = "callable";
    state.sqlResponse = () =>
      Promise.resolve([makeRow({ type: "pdf_source_text", id: 1 })]);
    state.embedMock.mockResolvedValueOnce(
      new Array(768).fill(0).map((_, i) => i / 768),
    );

    const { hybridSearch } = await loadRagRetriever();
    const result = await hybridSearch([1], "Faraday");
    expect(result[0].type).toBe("NCERT_TXT_SOURCE");
  });

  it("defaults missing topic/chapter/source fields", async () => {
    state.sqlMode = "callable";
    state.sqlResponse = () =>
      Promise.resolve([
        makeRow({
          topic_id: null,
          topic_name: null,
          chapter_name: null,
          source: null,
        }),
      ]);
    state.embedMock.mockResolvedValueOnce(
      new Array(768).fill(0).map((_, i) => i / 768),
    );

    const { hybridSearch } = await loadRagRetriever();
    const [concept] = await hybridSearch([1], "Faraday");
    expect(concept.topicName).toBe("General");
    expect(concept.topicId).toBeUndefined();
    expect(concept.chapterName).toBeUndefined();
    expect(concept.source).toBe("unknown");
  });

  it("coerces chapterId / topicId to numbers", async () => {
    state.sqlMode = "callable";
    state.sqlResponse = () =>
      Promise.resolve([makeRow({ chapter_id: "7", topic_id: "42" })]);
    state.embedMock.mockResolvedValueOnce(
      new Array(768).fill(0).map((_, i) => i / 768),
    );

    const { hybridSearch } = await loadRagRetriever();
    const [concept] = await hybridSearch([1], "Faraday");
    expect(concept.chapterId).toBe(7);
    expect(typeof concept.chapterId).toBe("number");
    expect(concept.topicId).toBe(42);
  });

  it("passes the requested limit through to the SQL template", async () => {
    state.sqlMode = "callable";
    state.sqlResponse = () => Promise.resolve([]);
    state.embedMock.mockResolvedValueOnce(
      new Array(768).fill(0).map((_, i) => i / 768),
    );

    const { hybridSearch } = await loadRagRetriever();
    await hybridSearch([1], "Faraday", 5);

    const flat = state.sqlCalls[0].flat(Infinity) as unknown[];
    expect(flat).toContain(5);
  });
});
