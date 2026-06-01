import { describe, expect, it } from "vitest";
import {
  getCurriculumChapters,
  getCurriculumConceptsForChapters,
  getCurriculumSubjects,
} from "@/lib/curriculum-data";
import { retrieveConcepts } from "@/lib/retriever";

describe("curriculum data", () => {
  it("uses the NCERT class 9 integrated and split science curricula", () => {
    const subjects = getCurriculumSubjects()
      .filter((subject) => subject.classes.includes(9))
      .map((subject) => subject.name);

    expect(subjects).not.toContain("Science");
    expect(subjects).toContain("Physics");
    expect(subjects).toContain("Chemistry");
    expect(subjects).toContain("Biology");
    expect(subjects).toContain("History");
    expect(subjects).toContain("Geography");
    expect(subjects).toContain("Civics");
    expect(subjects).toContain("Economics");
    expect(subjects).toContain("Basic Computer");
    expect(subjects).toContain("Advanced Computer");
    expect(subjects).not.toContain("Social Science");
    expect(subjects).not.toContain("Political Science");
    expect(subjects).not.toContain("Computer Science");
  });

  it("returns workbook chapters and topics for generation context", () => {
    const [motion] = getCurriculumChapters(9, "Physics");
    const concepts = getCurriculumConceptsForChapters(9, ["Physics"], [motion.id]);

    expect(motion.name).toBe("Describing Motion Around Us");
    expect(motion.topics.map((topic) => topic.name)).toContain(
      "Distance and Displacement",
    );
    expect(concepts[0]).toMatchObject({
      chapterId: motion.id,
      topicName: "Distance and Displacement",
      source: "curriculum",
    });
    expect(concepts[0].text).toContain(
      "Class 9 Physics chapter \"Describing Motion Around Us\"",
    );
  });

  it("separates basic and advanced computer curricula", () => {
    const class6Subjects = getCurriculumSubjects()
      .filter((subject) => subject.classes.includes(6))
      .map((subject) => subject.name);
    const class9BasicComputer = getCurriculumChapters(9, "Basic Computer");
    const class9AdvancedComputer = getCurriculumChapters(9, "Advanced Computer");
    const communicationSkills = class9AdvancedComputer.find((chapter) =>
      chapter.name.includes("Communication Skills"),
    );
    const class9BasicNames = class9BasicComputer.map((chapter) => chapter.name);
    const class9AdvancedNames = class9AdvancedComputer.map((chapter) => chapter.name);

    expect(class6Subjects).toContain("Basic Computer");
    expect(class6Subjects).not.toContain("Information Technology");
    expect(class9BasicNames).toContain("Basics of Python");
    expect(class9BasicNames).toContain("Database Management - SQL");
    expect(class9BasicNames).not.toContain("Communication Skills - IT");
    expect(class9AdvancedNames).toEqual(
      expect.arrayContaining([
        "Communication Skills - IT",
        "Self-Management Skills",
        "Basic ICT Skills",
        "Digital Spreadsheets",
      ]),
    );
    expect(class9AdvancedNames).not.toContain("Basics of Python");
    expect(communicationSkills?.topics.map((topic) => topic.name)).toEqual(
      expect.arrayContaining(["Professional Communication", "Non-verbal Cues"]),
    );
  });

  it("classifies SST chapters into history, geography, civics, and economics", () => {
    const class6Subjects = getCurriculumSubjects()
      .filter((subject) => subject.classes.includes(6))
      .map((subject) => subject.name);
    const class9Subjects = getCurriculumSubjects()
      .filter((subject) => subject.classes.includes(9))
      .map((subject) => subject.name);
    const class11Subjects = getCurriculumSubjects()
      .filter((subject) => subject.classes.includes(11))
      .map((subject) => subject.name);

    expect(class6Subjects).toEqual(
      expect.arrayContaining(["History", "Geography", "Civics"]),
    );
    expect(class6Subjects).not.toContain("Social Science");
    expect(class9Subjects).toEqual(
      expect.arrayContaining(["History", "Geography", "Civics", "Economics"]),
    );
    expect(class11Subjects).toEqual(
      expect.arrayContaining(["History", "Geography", "Civics", "Economics"]),
    );
    expect(class11Subjects).not.toContain("Humanities");
    expect(getCurriculumChapters(6, "History").map((chapter) => chapter.name)).toContain(
      "What, Where, How and When?",
    );
    expect(getCurriculumChapters(6, "Geography").map((chapter) => chapter.name)).toContain(
      "The Earth in the Solar System",
    );
    expect(getCurriculumChapters(6, "Civics").map((chapter) => chapter.name)).toContain(
      "Government",
    );
  });

  it("carries selected subjects into the AI concept context", async () => {
    const [history] = getCurriculumChapters(9, "History");
    const [geography] = getCurriculumChapters(9, "Geography");
    const concepts = getCurriculumConceptsForChapters(
      9,
      ["History", "Geography"],
      [history.id, geography.id],
    );
    const context = await retrieveConcepts(concepts, "MEDIUM", {});

    expect(concepts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          subject: "History",
          chapterName: "The French Revolution",
        }),
        expect.objectContaining({
          subject: "Geography",
          chapterName: "India - Size and Location",
        }),
      ]),
    );
    expect(context).toContain("[Subject: History]");
    expect(context).toContain("[Subject: Geography]");
    expect(context).toContain("[Chapter: The French Revolution]");
    expect(context).toContain("[Chapter: India - Size and Location]");
  });
});
