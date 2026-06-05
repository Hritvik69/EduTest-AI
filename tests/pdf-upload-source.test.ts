import { beforeEach, describe, expect, it, vi } from "vitest";
import { createGuestUser } from "@/lib/api-security";
import { storeUploadedPdfSource } from "@/lib/pdf-source-store";

const mocks = vi.hoisted(() => ({
  generateJSON: vi.fn(),
  generateGeminiImageJSON: vi.fn(),
  createScheduler: vi.fn(),
  createWorker: vi.fn(),
  getInfo: vi.fn(),
  getScreenshot: vi.fn(),
  getText: vi.fn(),
  destroy: vi.fn(),
}));

vi.mock("@/lib/gemini", () => ({
  generateJSON: mocks.generateJSON,
  generateGeminiImageJSON: mocks.generateGeminiImageJSON,
}));

vi.mock("tesseract.js", () => ({
  createScheduler: mocks.createScheduler,
  createWorker: mocks.createWorker,
}));

vi.mock("pdf-parse", () => ({
  PDFParse: class {
    getText() {
      return mocks.getText();
    }

    getInfo() {
      return mocks.getInfo();
    }

    getScreenshot(params: unknown) {
      return mocks.getScreenshot(params);
    }

    destroy() {
      return mocks.destroy();
    }
  },
}));

describe("uploaded PDF concept extraction", () => {
  beforeEach(() => {
    mocks.generateJSON.mockReset();
    mocks.generateGeminiImageJSON.mockReset();
    mocks.createScheduler.mockReset();
    mocks.createWorker.mockReset();
    mocks.getText.mockReset();
    mocks.getInfo.mockReset();
    mocks.getScreenshot.mockReset();
    mocks.destroy.mockReset();
  });

  it(
    "uses the current pdf-parse v2 API and releases parser resources",
    async () => {
      mocks.getText.mockResolvedValue({
        text: "Photosynthesis converts light energy into chemical energy.",
      });
      mocks.getInfo.mockResolvedValue({
        info: { Title: "Life Processes" },
      });

      const { extractTextFromPdf } = await import("@/lib/extractor");
      const result = await extractTextFromPdf(Buffer.from("%PDF-1.7 fake"));

      expect(result.title).toBe("Life Processes");
      expect(result.text).toContain("Photosynthesis converts");
      expect(result.wordCount).toBe(7);
      expect(mocks.getText).toHaveBeenCalledOnce();
      expect(mocks.getInfo).toHaveBeenCalledOnce();
      expect(mocks.destroy).toHaveBeenCalledOnce();
    },
    15_000,
  );

  it("uses local OCR when an uploaded PDF has scanned pages without text", async () => {
    const addJob = vi
      .fn()
      .mockResolvedValueOnce({
        data: {
          text: "Nationalism in India introduces civil disobedience and mass movements.",
        },
      })
      .mockResolvedValueOnce({
        data: {
          text: "The chapter explains salt satyagraha, peasant struggles, and symbols.",
        },
      });
    const addWorker = vi.fn();
    const terminate = vi.fn();
    mocks.createScheduler.mockReturnValue({ addJob, addWorker, terminate });
    mocks.createWorker.mockResolvedValue({ terminate: vi.fn() });
    mocks.getText.mockResolvedValue({
      total: 2,
      pages: [{}, {}],
      text: "\n\n",
    });
    mocks.getInfo.mockResolvedValue({
      info: { Title: "Scanned Social Science Chapter" },
    });
    mocks.getScreenshot
      .mockResolvedValueOnce({
        pages: [{ data: new Uint8Array([1, 2, 3]), dataUrl: "data:image/png;base64,page-one" }],
      })
      .mockResolvedValueOnce({
        pages: [{ data: new Uint8Array([4, 5, 6]), dataUrl: "data:image/png;base64,page-two" }],
      });
    mocks.generateGeminiImageJSON
      .mockResolvedValueOnce({
        text: "Nationalism in India introduces civil disobedience and mass movements.",
      })
      .mockResolvedValueOnce({
        text: "The chapter explains salt satyagraha, peasant struggles, and symbols.",
      });

    const { extractTextFromPdf } = await import("@/lib/extractor");
    const result = await extractTextFromPdf(Buffer.from("%PDF-1.7 fake scanned"));

    expect(result.title).toBe("Scanned Social Science Chapter");
    expect(result.text).toContain("Nationalism in India");
    expect(result.text).toContain("salt satyagraha");
    expect(result.wordCount).toBeGreaterThan(10);
    expect(mocks.getScreenshot).toHaveBeenCalledTimes(2);
    expect(mocks.createWorker).toHaveBeenCalledTimes(2);
    expect(addWorker).toHaveBeenCalledTimes(2);
    expect(addJob).toHaveBeenCalledTimes(2);
    expect(terminate).toHaveBeenCalledOnce();
    expect(mocks.generateGeminiImageJSON).not.toHaveBeenCalled();
  });

  it("extracts metadata and exam-weighted topics from uploaded PDF text", async () => {
    mocks.generateJSON.mockResolvedValue({
      title: "Light Reflection and Refraction",
      subject: "Science",
      classNum: 10,
      importantTopics: ["Laws of reflection"],
      topics: [
        {
          name: "Laws of reflection",
          importance: "HIGH",
          concepts: [
            {
              text: "The incident ray, reflected ray, and normal lie in one plane.",
              type: "FACT",
              bloom_level: "UNDERSTAND",
              hots_potential: true,
            },
          ],
          key_formulas: [],
          key_experiments: [],
          real_life_applications: [],
          common_misconceptions: [],
        },
      ],
    });

    const { extractUploadedPdfConcepts } = await import("@/lib/extractor");
    const result = await extractUploadedPdfConcepts(
      "Long educational PDF text about reflection. ".repeat(40),
      "chapter.pdf",
    );

    expect(result.title).toBe("Light Reflection and Refraction");
    expect(result.subject).toBe("Science");
    expect(result.classNum).toBe(10);
    expect(result.importantTopics).toEqual(["Laws of reflection"]);
    expect(result.topics[0].importance).toBe("HIGH");
    expect(mocks.generateJSON.mock.calls[0][0]).toContain(
      "The user uploaded a chapter PDF",
    );
  });

  it("passes the user PDF focus prompt into extraction and caches by focus", async () => {
    mocks.generateJSON
      .mockResolvedValueOnce({
        title: "Chapter 1 Focus",
        subject: "Mathematics",
        classNum: 9,
        importantTopics: ["Coordinate Geometry"],
        topics: [
          {
            name: "Coordinate Geometry",
            importance: "HIGH",
            concepts: [
              {
                text: "Coordinate geometry uses ordered pairs to locate points.",
                type: "FACT",
                bloom_level: "UNDERSTAND",
                hots_potential: false,
              },
            ],
            key_formulas: [],
            key_experiments: [],
            real_life_applications: [],
            common_misconceptions: [],
          },
        ],
      })
      .mockResolvedValueOnce({
        title: "Chapter 2 Focus",
        subject: "Mathematics",
        classNum: 9,
        importantTopics: ["Linear Equations"],
        topics: [
          {
            name: "Linear Equations",
            importance: "HIGH",
            concepts: [
              {
                text: "Linear equations represent relationships between variables.",
                type: "FACT",
                bloom_level: "UNDERSTAND",
                hots_potential: false,
              },
            ],
            key_formulas: [],
            key_experiments: [],
            real_life_applications: [],
            common_misconceptions: [],
          },
        ],
      });

    const { extractUploadedPdfConcepts } = await import("@/lib/extractor");
    const text = "Unique focus uploaded PDF text about coordinates and equations. ".repeat(50);
    await extractUploadedPdfConcepts(text, "maths.pdf", "Use only Chapter 1.");
    await extractUploadedPdfConcepts(text, "maths.pdf", "Use only Chapter 2.");

    expect(mocks.generateJSON).toHaveBeenCalledTimes(2);
    expect(mocks.generateJSON.mock.calls[0][0]).toContain("USER PDF FOCUS PROMPT");
    expect(mocks.generateJSON.mock.calls[0][0]).toContain("Use only Chapter 1.");
    expect(mocks.generateJSON.mock.calls[1][0]).toContain("Use only Chapter 2.");
  });

  it("reuses cached concept analysis for the same uploaded PDF text", async () => {
    mocks.generateJSON.mockResolvedValue({
      title: "Cached Chapter",
      subject: "Science",
      classNum: 9,
      importantTopics: ["Cached Topic"],
      topics: [
        {
          name: "Cached Topic",
          importance: "HIGH",
          concepts: [
            {
              text: "Cached concept for repeated PDF uploads.",
              type: "FACT",
              bloom_level: "UNDERSTAND",
              hots_potential: false,
            },
          ],
          key_formulas: [],
          key_experiments: [],
          real_life_applications: [],
          common_misconceptions: [],
        },
      ],
    });

    const { extractUploadedPdfConcepts } = await import("@/lib/extractor");
    const text = "Unique cached uploaded PDF text about motion and force. ".repeat(40);
    const first = await extractUploadedPdfConcepts(text, "cached-chapter.pdf");
    first.topics[0].name = "mutated copy";
    const second = await extractUploadedPdfConcepts(text, "cached-chapter.pdf");

    expect(second.title).toBe("Cached Chapter");
    expect(second.topics[0].name).toBe("Cached Topic");
    expect(second.extractionMethod).toBe("CACHED_AI");
    expect(mocks.generateJSON).toHaveBeenCalledTimes(1);
  });

  it("falls back to local PDF concepts when every AI provider fails", async () => {
    mocks.generateJSON.mockRejectedValue(
      new Error("All configured AI providers failed."),
    );

    const { extractUploadedPdfConcepts } = await import("@/lib/extractor");
    const text = [
        "Cell Structure and Function",
        "The cell membrane controls movement of substances in and out of cells.",
        "The nucleus contains genetic material and controls cellular activities.",
        "For example, mitochondria release energy from food during respiration.",
        "This chapter includes diagrams, observations, and examples from daily life.",
      ].join("\n");
    const result = await extractUploadedPdfConcepts(
      text,
      "cells.pdf",
    );
    const cached = await extractUploadedPdfConcepts(text, "cells.pdf");

    expect(result.title).toBe("Cell Structure and Function");
    expect(cached.extractionMethod).toBe("CACHED_LOCAL_FALLBACK");
    expect(result.topics.length).toBeGreaterThan(0);
    expect(result.importantTopics.length).toBeGreaterThan(0);
    expect(result.topics[0].concepts.length).toBeGreaterThan(0);
    expect(result.extractionMethod).toBe("LOCAL_FALLBACK");
    expect(mocks.generateJSON).toHaveBeenCalledTimes(1);
  });

  it("stores PDF provenance metadata with guest PDF sources", async () => {
    const guest = createGuestUser("guest-session-pdf-provenance");

    const source = await storeUploadedPdfSource({
      userId: guest.id,
      fileName: "chapter-1.pdf",
      title: "Coordinate Geometry",
      subject: "Mathematics",
      classNum: 9,
      focusPrompt: "Use only Chapter 1.",
      contentHash: "abc123",
      extractionMethod: "AI",
      wordCount: 1200,
      importantTopics: ["Coordinates"],
      topics: [
        {
          name: "Coordinates",
          importance: "HIGH",
          concepts: [
            {
              text: "Coordinates locate a point on a plane.",
              type: "FACT",
              bloom_level: "UNDERSTAND",
              hots_potential: false,
            },
          ],
        },
      ],
    });

    expect(source.focusPrompt).toBe("Use only Chapter 1.");
    expect(source.contentHash).toBe("abc123");
    expect(source.extractionMethod).toBe("AI");
  });

  it("rejects uploaded PDF sources with no valid concepts instead of storing READY shells", async () => {
    const guest = createGuestUser("guest-session-empty-pdf");

    await expect(
      storeUploadedPdfSource({
        userId: guest.id,
        fileName: "empty.pdf",
        title: "Empty",
        wordCount: 120,
        importantTopics: [],
        topics: [],
      }),
    ).rejects.toThrow("Uploaded PDF did not produce enough valid concepts to store.");
  });
});
