import { afterEach, describe, expect, it } from "vitest";
import {
  getCurriculumChapters,
  getCurriculumConceptsForChapters,
} from "@/lib/curriculum-data";
import {
  getLocalNcertChapterConcepts,
  getLocalNcertChapterSource,
} from "@/lib/local-ncert-source";
import { analyzeConceptSourceQuality } from "@/lib/retriever";
import { assertSourceGroundingForGeneration } from "@/lib/source-grounding";
import { defaultBloomDistribution } from "@/lib/edutest-data";

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
    expect(concepts.every((concept) => concept.source === "ncert_txt")).toBe(true);
    expect(concepts.every((concept) => concept.type === "NCERT_TXT_SOURCE")).toBe(true);
    expect(concepts.some((concept) => /Krishnadeva Raya|Tenali Rama/i.test(concept.text))).toBe(
      true,
    );
    expect(concepts.some((concept) => concept.topicId)).toBe(true);

    const sourceQuality = analyzeConceptSourceQuality(concepts);
    expect(sourceQuality.quality).toBe("strong");
    expect(() =>
      assertSourceGroundingForGeneration(
        {
          sourceMode: "curriculum",
          classNum: 8,
          subject: "English",
          subjects: ["English"],
          subjectSelections: [],
          chapterIds: [chapter!.id],
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
        },
        concepts,
      ),
    ).not.toThrow();
  });

  it("reports diagnostics when no matching local NCERT text is available", async () => {
    process.env.EDUTEST_DISABLE_LOCAL_NCERT_PDF = "1";
    const chapter = getCurriculumChapters(10, "English").find((item) =>
      item.name.includes("The Hack Driver"),
    );

    expect(chapter).toBeDefined();

    const result = await getLocalNcertChapterSource(10, ["English"], chapter!.id);

    expect(result.concepts).toEqual([]);
    expect(result.diagnostics.resolved?.chapterName).toBe(chapter!.name);
    expect(result.diagnostics.reason).toBe("no_matching_ncert_text");
    expect(result.diagnostics.conceptCount).toBe(0);
    expect(result.diagnostics.attemptedPdfPaths).toEqual([]);

    const outlineConcepts = getCurriculumConceptsForChapters(10, ["English"], [
      chapter!.id,
    ]);
    expect(outlineConcepts.length).toBeGreaterThan(0);
    expect(() =>
      assertSourceGroundingForGeneration(
        {
          sourceMode: "curriculum",
          classNum: 10,
          subject: "English",
          subjects: ["English"],
          subjectSelections: [],
          chapterIds: [chapter!.id],
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
        },
        outlineConcepts,
      ),
    ).toThrow(/only outline topics/i);
  });

  it("resolves the Class 9 Physics and Chemistry chapters from bundled NCERT TXT", async () => {
    process.env.EDUTEST_DISABLE_LOCAL_NCERT_PDF = "1";
    const physicsChapter = getCurriculumChapters(9, "Physics").find((item) =>
      item.name.includes("How Forces Affect Motion"),
    );
    const chemistryChapter = getCurriculumChapters(9, "Chemistry").find((item) =>
      item.name.includes("Exploring Mixtures and their Separation"),
    );

    expect(physicsChapter).toBeDefined();
    expect(chemistryChapter).toBeDefined();

    const physics = await getLocalNcertChapterSource(
      9,
      ["Physics", "Chemistry"],
      physicsChapter!.id,
    );
    const chemistry = await getLocalNcertChapterSource(
      9,
      ["Physics", "Chemistry"],
      chemistryChapter!.id,
    );
    const physicsText = physics.concepts.map((concept) => concept.text).join(" ");
    const chemistryText = chemistry.concepts.map((concept) => concept.text).join(" ");

    expect(physics.diagnostics.selectedSource).toBe("bundled_text");
    expect(chemistry.diagnostics.selectedSource).toBe("bundled_text");
    expect(physics.concepts.length).toBeGreaterThanOrEqual(6);
    expect(chemistry.concepts.length).toBeGreaterThanOrEqual(6);
    expect(physicsText).toMatch(/friction|net force|Newton/i);
    expect(chemistryText).toMatch(/solubility|crystallization|separation/i);
    expect(physics.concepts.every((concept) => concept.source === "ncert_txt")).toBe(true);
    expect(chemistry.concepts.every((concept) => concept.source === "ncert_txt")).toBe(true);
  });
});
