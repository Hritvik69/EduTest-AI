import { afterEach, describe, expect, it, vi } from "vitest";

const dbMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db", () => ({
  default: dbMock,
}));

import { getCurriculumChapters } from "@/lib/curriculum-data";
import { getChapterContent } from "@/lib/extractor";
import { assertSourceGroundingForGeneration } from "@/lib/source-grounding";
import { defaultBloomDistribution } from "@/lib/edutest-data";
import type { PaperConfig } from "@/types";

const originalDisableLocalPdf = process.env.EDUTEST_DISABLE_LOCAL_NCERT_PDF;

afterEach(() => {
  dbMock.mockReset();
  if (originalDisableLocalPdf === undefined) {
    delete process.env.EDUTEST_DISABLE_LOCAL_NCERT_PDF;
  } else {
    process.env.EDUTEST_DISABLE_LOCAL_NCERT_PDF = originalDisableLocalPdf;
  }
});

describe("NCERT source priority", () => {
  it("uses local source-backed NCERT content before outline DB concepts", async () => {
    process.env.EDUTEST_DISABLE_LOCAL_NCERT_PDF = "1";
    dbMock.mockImplementation(async () => {
      throw new Error("DB outline concepts are unavailable");
    });

    const chapter = getCurriculumChapters(8, "English").find((item) =>
      item.name.includes("The Wit that Won Hearts"),
    );
    expect(chapter).toBeDefined();

    const concepts = await getChapterContent([chapter!.id], "English", 8, {
      allowCurriculumFallback: true,
      requireKnownSource: true,
    });

    expect(dbMock).toHaveBeenCalled();
    expect(concepts.length).toBeGreaterThanOrEqual(6);
    expect(concepts.every((concept) => concept.source === "pdf")).toBe(true);
    expect(concepts.some((concept) => /Tenali Rama|Krishnadeva Raya/i.test(concept.text))).toBe(
      true,
    );
    expect(() => assertSourceGroundingForGeneration(config(chapter!.id), concepts)).not.toThrow();
  });

  it("does not accept outline-only DB concepts when matching local TXT exists", async () => {
    process.env.EDUTEST_DISABLE_LOCAL_NCERT_PDF = "1";
    const chapter = getCurriculumChapters(8, "English").find((item) =>
      item.name.includes("A Concrete Example"),
    );
    expect(chapter).toBeDefined();
    const diagnostics: unknown[] = [];

    dbMock.mockImplementation(async (strings: TemplateStringsArray) => {
      const query = strings.join(" ");

      if (query.includes("COUNT(*)::int AS count")) {
        return [{ count: 2 }];
      }

      if (query.includes("SELECT") && query.includes("c.text")) {
        return [
          {
            text: `Class 8 English chapter "The Wit that Won Hearts" includes the NCERT/CBSE topic "Poorvi: The Wit that Won Hearts". Generate questions only from this selected chapter-topic pair.`,
            type: "CURRICULUM_CORE_TOPIC",
            bloom_level: "UNDERSTAND",
            hots_potential: false,
            source: "curriculum",
            topic_id: chapter!.topics[0].id,
            topic_name: chapter!.topics[0].name,
            chapter_name: chapter!.name,
            subject_name: "English",
            class_num: 8,
          },
          {
            text: "Reading comprehension and inference",
            type: "CURRICULUM_TOPIC",
            bloom_level: "UNDERSTAND",
            hots_potential: false,
            source: "curriculum",
            topic_id: chapter!.topics[1].id,
            topic_name: chapter!.topics[1].name,
            chapter_name: chapter!.name,
            subject_name: "English",
            class_num: 8,
          },
        ];
      }

      return [];
    });

    const concepts = await getChapterContent([chapter!.id], "English", 8, {
      allowCurriculumFallback: true,
      requireKnownSource: true,
      onLocalNcertDiagnostics: (item) => diagnostics.push(item),
    });

    expect(concepts.length).toBeGreaterThanOrEqual(6);
    expect(concepts.every((concept) => concept.source === "pdf")).toBe(true);
    expect(concepts.some((concept) => /concrete|example/i.test(concept.text))).toBe(true);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]).toMatchObject({
      selectedSource: "bundled_text",
      conceptCount: expect.any(Number),
      sourceTextChunks: expect.any(Number),
    });
    expect(() => assertSourceGroundingForGeneration(config(chapter!.id), concepts)).not.toThrow();
  });

  it("maps imported database chapter IDs back to NCERT source text by chapter name", async () => {
    process.env.EDUTEST_DISABLE_LOCAL_NCERT_PDF = "1";
    const importedChapterId = 178001;
    dbMock.mockImplementation(async (strings: TemplateStringsArray) => {
      const query = strings.join(" ");

      if (query.includes("COUNT(*)::int AS count")) {
        return [{ count: 0 }];
      }

      if (query.includes("SELECT c.name AS chapter_name")) {
        return [
          {
            chapter_name: "The Wit that Won Hearts",
            subject_name: "English",
            class_num: 8,
          },
        ];
      }

      if (query.includes("SELECT id, name") && query.includes("FROM topics")) {
        return [
          { id: 801, name: "Poorvi: The Wit that Won Hearts" },
          { id: 802, name: "Theme, character, tone, and literary devices" },
        ];
      }

      return [];
    });

    const concepts = await getChapterContent([importedChapterId], "English", 8, {
      allowCurriculumFallback: true,
      requireKnownSource: true,
    });

    expect(concepts.length).toBeGreaterThanOrEqual(6);
    expect(concepts.every((concept) => concept.chapterId === importedChapterId)).toBe(true);
    expect(concepts.some((concept) => /Tenali Rama|Krishnadeva Raya/i.test(concept.text))).toBe(
      true,
    );
    expect(() => assertSourceGroundingForGeneration(config(importedChapterId), concepts)).not.toThrow();
  });
});

function config(chapterId: number): PaperConfig {
  return {
    sourceMode: "curriculum",
    classNum: 8,
    subject: "English",
    subjects: ["English"],
    subjectSelections: [{ subject: "English", chapterIds: [chapterId], topicIds: [] }],
    chapterIds: [chapterId],
    topicIds: [],
    totalMarks: 5,
    duration: 30,
    examType: "School Test",
    difficulty: "MEDIUM",
    aiProvider: "AUTO",
    questionTypes: ["MCQ"],
    typeDistribution: { MCQ: 5 },
    bloomDistribution: defaultBloomDistribution,
    totalQuestions: 5,
  };
}
