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
      throw new Error("DB outline concepts should not be queried first");
    });

    const chapter = getCurriculumChapters(8, "English").find((item) =>
      item.name.includes("The Wit that Won Hearts"),
    );
    expect(chapter).toBeDefined();

    const concepts = await getChapterContent([chapter!.id], "English", 8, {
      allowCurriculumFallback: true,
      requireKnownSource: true,
    });

    expect(dbMock).not.toHaveBeenCalled();
    expect(concepts.length).toBeGreaterThanOrEqual(6);
    expect(concepts.every((concept) => concept.source === "pdf")).toBe(true);
    expect(concepts.some((concept) => /Tenali Rama|Krishnadeva Raya/i.test(concept.text))).toBe(
      true,
    );
    expect(() => assertSourceGroundingForGeneration(config(chapter!.id), concepts)).not.toThrow();
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
