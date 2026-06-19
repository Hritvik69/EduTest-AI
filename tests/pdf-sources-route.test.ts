import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  extractTextFromPdf: vi.fn(),
  extractUploadedPdfConcepts: vi.fn(),
  findUploadedPdfSourceByContentHash: vi.fn(),
  storeUploadedPdfSource: vi.fn(),
}));

vi.mock("@/lib/api-security", () => ({
  jsonError: (error: string, status = 500, details?: unknown) =>
    Response.json({ success: false, error, code: status, details }, { status }),
  jsonSuccess: (data: unknown) => Response.json({ success: true, data }),
  rateLimit: vi.fn(() => null),
  requireAuthenticatedUser: vi.fn(async () => ({ user: { id: 123 } })),
}));

vi.mock("@/lib/error-classification", () => ({
  friendlyPdfProcessingError: (error: unknown) =>
    error instanceof Error ? error.message : "PDF understanding failed.",
}));

vi.mock("@/lib/extractor", () => ({
  cleanExtractedText: (text: string) => text,
  extractTextFromPdf: mocks.extractTextFromPdf,
  extractUploadedPdfConcepts: mocks.extractUploadedPdfConcepts,
}));

vi.mock("@/lib/pdf-security", () => ({
  assertPdfBufferSize: vi.fn(),
  assertPdfMagic: (buffer: Buffer) => {
    if (buffer.subarray(0, 5).toString("ascii") !== "%PDF-") {
      throw new Error("Uploaded file is not a valid PDF.");
    }
  },
  limitExtractedText: (text: string) => text.slice(0, 200_000),
  maxPdfBytes: 50 * 1024 * 1024,
  maxPdfSizeLabel: "50MB",
  pdfSizeErrorMessage: () => "PDF must be 50MB or smaller.",
}));

vi.mock("@/lib/pdf-source-store", () => ({
  findUploadedPdfSourceByContentHash: mocks.findUploadedPdfSourceByContentHash,
  storeUploadedPdfSource: mocks.storeUploadedPdfSource,
}));

describe("PDF sources upload route stream", () => {
  const previousBudget = process.env.EDUTEST_PDF_UPLOAD_SERVER_BUDGET_MS;

  beforeEach(() => {
    vi.useRealTimers();
    delete process.env.EDUTEST_PDF_UPLOAD_SERVER_BUDGET_MS;
    mocks.extractTextFromPdf.mockReset();
    mocks.extractUploadedPdfConcepts.mockReset();
    mocks.findUploadedPdfSourceByContentHash.mockReset();
    mocks.storeUploadedPdfSource.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
    if (previousBudget === undefined) {
      delete process.env.EDUTEST_PDF_UPLOAD_SERVER_BUDGET_MS;
    } else {
      process.env.EDUTEST_PDF_UPLOAD_SERVER_BUDGET_MS = previousBudget;
    }
  });

  it("emits progress and a final complete event for a successful upload", async () => {
    const source = uploadedPdfSource({ id: 11 });
    mocks.findUploadedPdfSourceByContentHash.mockResolvedValue(null);
    mocks.extractTextFromPdf.mockResolvedValue({
      title: "Motion",
      text: "Motion and force chapter text. ".repeat(20),
      wordCount: 100,
      source: "pdf",
    });
    mocks.extractUploadedPdfConcepts.mockResolvedValue(pdfAnalysis());
    mocks.storeUploadedPdfSource.mockResolvedValue(source);

    const { POST } = await import("@/app/api/pdf-sources/route");
    const response = await POST(uploadRequest());
    const events = parseSseEvents(await response.text());

    expect(events.some((event) => event.event === "progress")).toBe(true);
    expect(events.at(-1)).toEqual({
      event: "complete",
      data: { success: true, data: { source } },
    });
  });

  it("emits a final complete event when reusing a cached extraction", async () => {
    const source = uploadedPdfSource({ id: 12, extractionMethod: "CACHED_AI" });
    mocks.findUploadedPdfSourceByContentHash.mockResolvedValue(source);

    const { POST } = await import("@/app/api/pdf-sources/route");
    const response = await POST(uploadRequest());
    const events = parseSseEvents(await response.text());

    expect(mocks.extractTextFromPdf).not.toHaveBeenCalled();
    expect(events.at(-1)).toEqual({
      event: "complete",
      data: { success: true, data: { source } },
    });
  });

  it("emits a final error event before the server budget expires", async () => {
    vi.useFakeTimers();
    process.env.EDUTEST_PDF_UPLOAD_SERVER_BUDGET_MS = "15000";
    mocks.findUploadedPdfSourceByContentHash.mockResolvedValue(null);
    mocks.extractTextFromPdf.mockImplementation(
      (_buffer: Buffer, options: { signal?: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          options.signal?.addEventListener("abort", () => {
            reject(options.signal?.reason ?? new Error("aborted"));
          });
        }),
    );

    const { POST } = await import("@/app/api/pdf-sources/route");
    const response = await POST(uploadRequest());
    const textPromise = response.text();

    await vi.advanceTimersByTimeAsync(15_001);
    const events = parseSseEvents(await textPromise);
    const last = events.at(-1);

    expect(last?.event).toBe("error");
    expect(last?.data).toMatchObject({
      success: false,
      code: 504,
    });
    expect(String(last?.data.error)).toContain("deployment time limit");
  });
});

function uploadRequest() {
  const formData = new FormData();
  formData.append(
    "file",
    new File([Buffer.from("%PDF-1.7\nfake chapter pdf")], "chapter.pdf", {
      type: "application/pdf",
    }),
  );

  return new NextRequest("http://localhost/api/pdf-sources?stream=1", {
    method: "POST",
    body: formData,
  });
}

function uploadedPdfSource(overrides: Record<string, unknown> = {}) {
  return {
    id: 10,
    title: "Motion",
    subject: "Science",
    classNum: 9,
    fileName: "chapter.pdf",
    wordCount: 100,
    conceptsCount: 1,
    topics: ["Motion"],
    createdAt: "2026-06-10T00:00:00.000Z",
    ...overrides,
  };
}

function pdfAnalysis() {
  return {
    title: "Motion",
    subject: "Science",
    classNum: 9,
    importantTopics: ["Motion"],
    extractionMethod: "AI",
    topics: [
      {
        name: "Motion",
        importance: "HIGH",
        concepts: [
          {
            text: "Motion is a change in position over time.",
            type: "FACT",
            bloom_level: "UNDERSTAND",
            hots_potential: false,
          },
        ],
      },
    ],
  };
}

function parseSseEvents(text: string) {
  return text
    .trim()
    .split(/\r?\n\r?\n/)
    .filter(Boolean)
    .map((block) => {
      const lines = block.split(/\r?\n/);
      const event = lines
        .find((line) => line.startsWith("event:"))
        ?.replace(/^event:\s*/, "")
        .trim();
      const data = lines
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.replace(/^data:\s*/, ""))
        .join("\n");

      return {
        event,
        data: JSON.parse(data),
      };
    });
}
