import { describe, expect, it } from "vitest";
import {
  assertPdfMagic,
  sanitizeObjectPath,
  validateSupabasePdfUrl,
} from "@/lib/pdf-security";
import { generationRequestSchema, evaluationRequestSchema } from "@/lib/schemas";

const validGeneration = {
  classNum: 10,
  subject: "Science",
  subjects: ["Science"],
  subjectSelections: [{ subject: "Science", chapterIds: [1], topicIds: [] }],
  chapterIds: [1],
  totalMarks: 40,
  duration: 90,
  examType: "Practice",
  difficulty: "MEDIUM",
  questionTypes: ["MCQ", "SHORT"],
  typeDistribution: { MCQ: 10, SHORT: 10 },
  bloomDistribution: {
    REMEMBER: 15,
    UNDERSTAND: 20,
    APPLY: 30,
    ANALYZE: 20,
    EVALUATE: 10,
    CREATE: 5,
  },
  totalQuestions: 20,
  idempotencyKey: "stable-key-1",
};

describe("request schemas", () => {
  it("accepts a bounded generation request", () => {
    expect(generationRequestSchema.parse(validGeneration).chapterIds).toEqual([1]);
  });

  it("accepts configured generation providers and rejects removed Groq", () => {
    expect(
      generationRequestSchema.parse({
        ...validGeneration,
        aiProvider: "GROK",
      }).aiProvider,
    ).toBe("GROK");

    expect(
      generationRequestSchema.parse({
        ...validGeneration,
        aiProvider: "MISTRAL",
      }).aiProvider,
    ).toBe("MISTRAL");

    expect(
      generationRequestSchema.parse({
        ...validGeneration,
        aiProvider: "CEREBRAS",
      }).aiProvider,
    ).toBe("CEREBRAS");

    expect(
      generationRequestSchema.parse({
        ...validGeneration,
        aiProvider: "DEEPSEEK",
      }).aiProvider,
    ).toBe("DEEPSEEK");

    expect(
      generationRequestSchema.parse({
        ...validGeneration,
        aiProvider: "OPENROUTER",
      }).aiProvider,
    ).toBe("OPENROUTER");

    expect(() =>
      generationRequestSchema.parse({
        ...validGeneration,
        aiProvider: "GROQ",
      }),
    ).toThrow();
  });

  it("accepts uploaded-PDF generation without class chapter selection", () => {
    const parsed = generationRequestSchema.parse({
      ...validGeneration,
      sourceMode: "pdf_upload",
      pdfSourceId: 42,
      subject: "Uploaded PDF",
      subjects: ["Uploaded PDF"],
      subjectSelections: [],
      chapterIds: [],
    });

    expect(parsed.sourceMode).toBe("pdf_upload");
    expect(parsed.pdfSourceId).toBe(42);
    expect(parsed.chapterIds).toEqual([]);
  });

  it("rejects uploaded-PDF generation without a PDF source", () => {
    expect(() =>
      generationRequestSchema.parse({
        ...validGeneration,
        sourceMode: "pdf_upload",
        subjectSelections: [],
        chapterIds: [],
      }),
    ).toThrow(/Uploaded PDF source is required/);
  });

  it("rejects incompatible question formats before AI generation", () => {
    expect(() =>
      generationRequestSchema.parse({
        ...validGeneration,
        difficulty: "ABSURD",
        questionTypes: ["FILL_BLANK", "SHORT"],
        typeDistribution: { FILL_BLANK: 5, SHORT: 5 },
        totalQuestions: 10,
        totalMarks: 20,
      }),
    ).toThrow(/FILL_BLANK cannot be generated for ABSURD difficulty/);
  });

  it("rejects invalid distributions and oversized answers", () => {
    expect(() =>
      generationRequestSchema.parse({
        ...validGeneration,
        bloomDistribution: { ...validGeneration.bloomDistribution, CREATE: 10 },
      }),
    ).toThrow();

    expect(() =>
      evaluationRequestSchema.parse({
        paperId: 1,
        answers: { "1": "x".repeat(5000) },
      }),
    ).toThrow();
  });

  it("ignores client-supplied questions and accepts generated match-pair keys", () => {
    const longMatchKey = "A".repeat(420);

    expect(
      evaluationRequestSchema.parse({
        paperId: 1,
        questions: [{ invalid: "client questions must not be trusted" }],
        answers: {
          "1780069688366002001": {
            [longMatchKey]: "matched answer",
          },
        },
        timeTaken: 12,
      }),
    ).toEqual({
      paperId: 1,
      answers: {
        "1780069688366002001": {
          [longMatchKey]: "matched answer",
        },
      },
      timeTaken: 12,
    });
  });
});

describe("PDF SSRF guards", () => {
  it("rejects arbitrary and internal PDF URLs", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";

    expect(() => validateSupabasePdfUrl("http://127.0.0.1/private.pdf")).toThrow();
    expect(() => validateSupabasePdfUrl("https://evil.test/file.pdf")).toThrow();
  });

  it("accepts only chapter-pdfs object paths and PDF magic bytes", () => {
    expect(sanitizeObjectPath("chapters/1/file.pdf")).toBe("chapters/1/file.pdf");
    expect(() => sanitizeObjectPath("../secrets.pdf")).toThrow();
    expect(() => assertPdfMagic(Buffer.from("not-pdf"))).toThrow();
    expect(() => assertPdfMagic(Buffer.from("%PDF-1.7"))).not.toThrow();
  });
});
