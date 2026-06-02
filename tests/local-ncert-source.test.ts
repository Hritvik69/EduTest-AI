import { afterEach, describe, expect, it } from "vitest";
import { getCurriculumChapters } from "@/lib/curriculum-data";
import { getLocalNcertChapterConcepts } from "@/lib/local-ncert-source";

const originalDisableLocalPdf = process.env.EDUTEST_DISABLE_LOCAL_NCERT_PDF;

afterEach(() => {
  if (originalDisableLocalPdf === undefined) {
    delete process.env.EDUTEST_DISABLE_LOCAL_NCERT_PDF;
  } else {
    process.env.EDUTEST_DISABLE_LOCAL_NCERT_PDF = originalDisableLocalPdf;
  }
});

describe("local NCERT source bridge", () => {
  it("provides real source-backed concepts for normal Class 8 English generation", async () => {
    process.env.EDUTEST_DISABLE_LOCAL_NCERT_PDF = "1";
    const chapter = getCurriculumChapters(8, "English").find((item) =>
      item.name.includes("The Wit that Won Hearts"),
    );

    expect(chapter).toBeDefined();

    const concepts = await getLocalNcertChapterConcepts(8, ["English"], chapter!.id);

    expect(concepts.length).toBeGreaterThanOrEqual(6);
    expect(concepts.every((concept) => concept.source === "pdf")).toBe(true);
    expect(concepts.some((concept) => /Krishnadeva Raya|Tenali Rama/i.test(concept.text))).toBe(
      true,
    );
    expect(concepts.some((concept) => concept.topicId)).toBe(true);
  });
});
