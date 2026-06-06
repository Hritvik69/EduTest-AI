import { describe, expect, it } from "vitest";
import { defaultBloomDistribution } from "@/lib/edutest-data";
import {
  generateSourceBackedFallbackQuestions,
  generateSyllabusNearFallbackQuestions,
  hasWeakOrNoisySourceForSyllabusFallback,
  hasSourceBackedFallbackConcepts,
} from "@/lib/source-backed-fallback";
import { validatePaperKeepingValidQuestions } from "@/lib/validator";
import type { Blueprint, ConceptData, GeneratedQuestion, PaperConfig } from "@/types";

const config: PaperConfig = {
  classNum: 8,
  subject: "English",
  subjects: ["English"],
  subjectSelections: [{ subject: "English", chapterIds: [1], topicIds: [] }],
  chapterIds: [1],
  totalMarks: 18,
  duration: 90,
  examType: "School Test",
  difficulty: "MEDIUM",
  aiProvider: "AUTO",
  questionTypes: ["MCQ", "CASE_BASED", "SHORT", "SOURCE_BASED", "LONG"],
  typeDistribution: { MCQ: 2, CASE_BASED: 1, SHORT: 1, SOURCE_BASED: 1, LONG: 1 },
  bloomDistribution: defaultBloomDistribution,
  totalQuestions: 6,
};

const concepts: ConceptData[] = [
  {
    text: "The selected chapter shows how wit can solve a difficult social situation through careful language and quick reasoning.",
    type: "NCERT_TXT_SOURCE",
    bloomLevel: "UNDERSTAND",
    hotsPotential: true,
    subject: "English",
    classNum: 8,
    chapterName: "The Wit that Won Hearts",
    topicName: "Reading comprehension and inference",
    chapterId: 1,
    topicId: 10,
    source: "ncert_txt",
  },
  {
    text: "Vocabulary and grammar in context help students infer tone, intention, and meaning from the selected chapter passage.",
    type: "NCERT_TXT_SOURCE",
    bloomLevel: "APPLY",
    hotsPotential: false,
    subject: "English",
    classNum: 8,
    chapterName: "The Wit that Won Hearts",
    topicName: "Vocabulary and grammar in context",
    chapterId: 1,
    topicId: 11,
    source: "ncert_txt",
  },
];

describe("generateSourceBackedFallbackQuestions", () => {
  it("fills every missing section with locally valid selected-source questions", () => {
    const blueprint: Blueprint = {
      sections: [
        {
          name: "Section A",
          questionType: "MCQ",
          count: 2,
          marksPerQuestion: 1,
          totalMarks: 2,
          difficulty: "MEDIUM",
          difficultyBreakdown: { MEDIUM: 100 },
          bloomBreakdown: defaultBloomDistribution,
        },
        {
          name: "Section D",
          questionType: "CASE_BASED",
          count: 1,
          marksPerQuestion: 4,
          totalMarks: 4,
          difficulty: "MEDIUM",
          difficultyBreakdown: { MEDIUM: 100 },
          bloomBreakdown: defaultBloomDistribution,
        },
        {
          name: "Section B/C",
          questionType: "SHORT",
          count: 1,
          marksPerQuestion: 3,
          totalMarks: 3,
          difficulty: "MEDIUM",
          difficultyBreakdown: { MEDIUM: 100 },
          bloomBreakdown: defaultBloomDistribution,
        },
        {
          name: "Section E",
          questionType: "SOURCE_BASED",
          count: 1,
          marksPerQuestion: 4,
          totalMarks: 4,
          difficulty: "MEDIUM",
          difficultyBreakdown: { MEDIUM: 100 },
          bloomBreakdown: defaultBloomDistribution,
        },
        {
          name: "Section F",
          questionType: "LONG",
          count: 1,
          marksPerQuestion: 5,
          totalMarks: 5,
          difficulty: "MEDIUM",
          difficultyBreakdown: { MEDIUM: 100 },
          bloomBreakdown: defaultBloomDistribution,
        },
      ],
      totalQuestions: 6,
      totalMarks: 18,
      estimatedTime: 30,
      competencyPercentage: 60,
    };

    const questions = generateSourceBackedFallbackQuestions(
      blueprint.sections,
      concepts,
      config,
    );
    const validation = validatePaperKeepingValidQuestions(questions, blueprint, config);

    expect(validation.skipped).toEqual([]);
    expect(validation.questions).toHaveLength(6);
    expect(validation.blueprint.totalQuestions).toBe(6);
    expect(validation.blueprint.totalMarks).toBe(18);
    expect(validation.questions.every((question) => question.chapterId === 1)).toBe(true);
    expect(
      validation.questions.find((question) => question.type === "SOURCE_BASED")
        ?.subQuestions,
    ).toHaveLength(4);
    expect(
      validation.questions.find((question) => question.type === "LONG")
        ?.correctAnswer,
    ).toContain("Introduction:");
  });

  it("does not generate fallback questions from outline-only concepts", () => {
    const outlineOnly: ConceptData[] = [
      {
        text: "Reading comprehension and inference",
        type: "CURRICULUM_TOPIC",
        bloomLevel: "UNDERSTAND",
        hotsPotential: false,
        subject: "English",
        classNum: 8,
        chapterName: "Outline Chapter",
        topicName: "Reading comprehension and inference",
        chapterId: 1,
        topicId: 10,
        source: "curriculum",
      },
    ];

    expect(hasSourceBackedFallbackConcepts(outlineOnly)).toBe(false);
    expect(
      generateSourceBackedFallbackQuestions(
        [
          {
            name: "Section A",
            questionType: "MCQ",
            count: 1,
            marksPerQuestion: 1,
            totalMarks: 1,
            difficulty: "MEDIUM",
            difficultyBreakdown: { MEDIUM: 100 },
            bloomBreakdown: defaultBloomDistribution,
          },
        ],
        outlineOnly,
        config,
      ),
    ).toEqual([]);
  });

  it("creates natural Class 9 Physics questions without source metadata leakage", () => {
    const physicsConfig: PaperConfig = {
      classNum: 9,
      subject: "Physics",
      subjects: ["Physics"],
      subjectSelections: [{ subject: "Physics", chapterIds: [2], topicIds: [] }],
      chapterIds: [2],
      totalMarks: 10,
      duration: 90,
      examType: "School Test",
      difficulty: "MEDIUM",
      aiProvider: "AUTO",
      questionTypes: ["MCQ", "TRUE_FALSE", "SHORT", "MATCH_FOLLOWING"],
      typeDistribution: { MCQ: 2, TRUE_FALSE: 2, SHORT: 1, MATCH_FOLLOWING: 1 },
      bloomDistribution: defaultBloomDistribution,
      totalQuestions: 6,
    };
    const physicsBlueprint: Blueprint = {
      sections: [
        {
          name: "Section A",
          questionType: "MCQ",
          count: 2,
          marksPerQuestion: 1,
          totalMarks: 2,
          difficulty: "MEDIUM",
          difficultyBreakdown: { MEDIUM: 100 },
          bloomBreakdown: defaultBloomDistribution,
        },
        {
          name: "Section A",
          questionType: "TRUE_FALSE",
          count: 2,
          marksPerQuestion: 1,
          totalMarks: 2,
          difficulty: "MEDIUM",
          difficultyBreakdown: { MEDIUM: 100 },
          bloomBreakdown: defaultBloomDistribution,
        },
        {
          name: "Section B/C",
          questionType: "SHORT",
          count: 1,
          marksPerQuestion: 3,
          totalMarks: 3,
          difficulty: "MEDIUM",
          difficultyBreakdown: { MEDIUM: 100 },
          bloomBreakdown: defaultBloomDistribution,
        },
        {
          name: "Section B/C",
          questionType: "MATCH_FOLLOWING",
          count: 1,
          marksPerQuestion: 3,
          totalMarks: 3,
          difficulty: "MEDIUM",
          difficultyBreakdown: { MEDIUM: 100 },
          bloomBreakdown: defaultBloomDistribution,
        },
      ],
      totalQuestions: 6,
      totalMarks: 10,
      estimatedTime: 20,
      competencyPercentage: 60,
    };
    const physicsConcepts: ConceptData[] = [
      {
        text:
          "When force of friction becomes smaller, the stack of coins travels a larger distance before coming to rest. A thought experiment compares motion on a horizontal floor with smoother surfaces and helps students understand how friction affects motion.",
        type: "NCERT_TXT_SOURCE",
        bloomLevel: "UNDERSTAND",
        hotsPotential: true,
        subject: "Physics",
        classNum: 9,
        chapterName: "How Forces Affect Motion",
        topicName: "Vocabulary and grammar in context",
        chapterId: 2,
        topicId: 8,
        source: "ncert_txt",
      },
    ];

    const questions = generateSourceBackedFallbackQuestions(
      physicsBlueprint.sections,
      physicsConcepts,
      physicsConfig,
    );
    const validation = validatePaperKeepingValidQuestions(
      questions,
      physicsBlueprint,
      physicsConfig,
    );
    const visibleText = studentVisibleText(validation.questions);

    expect(validation.skipped).toEqual([]);
    expect(validation.questions).toHaveLength(6);
    expect(visibleText).not.toMatch(
      /source detail|selected source|exact source|detail lens|noveltyAngle|sourceChunkFocus|answerPath|physics-c|txt-a|Vocabulary and grammar/i,
    );
    expect(visibleText).not.toMatch(
      /in How Forces Affect Motion|from How Forces Affect Motion|idea described in the chapter|chapter idea|question focus|according to the chapter|ideas from/i,
    );
    expect(visibleText).not.toContain("How Forces Affect Motion");
    expect(visibleText).toMatch(/friction|motion|coins|surface/i);

    const trueFalseAnswers = validation.questions
      .filter((question) => question.type === "TRUE_FALSE")
      .map((question) => question.correctAnswer.trim().toLowerCase());
    expect(new Set(trueFalseAnswers)).toEqual(new Set(["true", "false"]));

    const shortQuestion = validation.questions.find(
      (question) => question.type === "SHORT",
    );
    expect(shortQuestion?.text).not.toMatch(/evidence point|inference point/i);
    expect(shortQuestion?.correctAnswer).not.toMatch(
      /Explain the concept clearly/i,
    );

    const matchQuestion = validation.questions.find(
      (question) => question.type === "MATCH_FOLLOWING",
    );
    const matchText = (matchQuestion?.matchPairs ?? [])
      .flatMap((pair) => [pair.left, pair.right])
      .join(" ");

    expect(matchText).toMatch(/Smooth surface|Rough surface|Smaller frictional force/i);
    expect(matchText).toMatch(/Less friction|More friction|Object travels farther/i);
    expect(matchText).not.toMatch(/Chapter idea|Question focus|Conclusion|Evidence/i);
    expect(matchQuestion?.correctAnswer).not.toBe(
      "A1-B1, A2-B2, A3-B3, A4-B4",
    );
  });

  it("replaces noisy Communication Skills fragments with clean syllabus-near questions", () => {
    const communicationItem = {
      subject: "Advanced Computer",
      chapterId: 1,
      chapterName: "Communication Skills",
      questionCount: 6,
    };
    const communicationConfig: PaperConfig = {
      classNum: 9,
      subject: "English",
      subjects: ["English", "Advanced Computer"],
      subjectSelections: [
        { subject: "English", chapterIds: [1], topicIds: [] },
        { subject: "Advanced Computer", chapterIds: [1], topicIds: [] },
      ],
      chapterIds: [1],
      totalMarks: 11,
      duration: 60,
      examType: "School Test",
      difficulty: "MEDIUM",
      aiProvider: "AUTO",
      questionTypes: [
        "MCQ",
        "TRUE_FALSE",
        "ONE_WORD",
        "ASSERTION_REASON",
        "MATCH_FOLLOWING",
        "SHORT",
      ],
      typeDistribution: {
        MCQ: 1,
        TRUE_FALSE: 1,
        ONE_WORD: 1,
        ASSERTION_REASON: 1,
        MATCH_FOLLOWING: 1,
        SHORT: 1,
      },
      questionComposition: [communicationItem],
      bloomDistribution: defaultBloomDistribution,
      totalQuestions: 6,
    };
    const communicationBlueprint: Blueprint = {
      sections: [
        sectionFor("MCQ", 1, 1),
        sectionFor("TRUE_FALSE", 1, 1),
        sectionFor("ONE_WORD", 1, 1),
        sectionFor("ASSERTION_REASON", 1, 2),
        sectionFor("MATCH_FOLLOWING", 1, 3),
        sectionFor("SHORT", 1, 3),
      ],
      totalQuestions: 6,
      totalMarks: 11,
      estimatedTime: 20,
      competencyPercentage: 60,
    };
    const noisyCommunicationConcepts: ConceptData[] = [
      {
        text:
          "Unit 1.indd 2 24-08-2018 15:24:21 S eSSIon 1 Communication Skills Employability SkillS - ClaSS iX",
        type: "NCERT_TXT_SOURCE",
        bloomLevel: "UNDERSTAND",
        hotsPotential: true,
        subject: "Advanced Computer",
        classNum: 9,
        chapterName: "Communication Skills",
        topicName: "Communication Skills",
        chapterId: 1,
        topicId: 1,
        source: "ncert_txt",
      },
    ];

    expect(
      hasWeakOrNoisySourceForSyllabusFallback(
        noisyCommunicationConcepts,
        communicationItem,
      ),
    ).toBe(true);

    const questions = generateSyllabusNearFallbackQuestions(
      communicationBlueprint.sections,
      communicationItem,
      communicationConfig,
      { concepts: noisyCommunicationConcepts },
    );
    const validation = validatePaperKeepingValidQuestions(
      questions,
      communicationBlueprint,
      communicationConfig,
    );
    const visibleText = studentVisibleText(validation.questions);

    expect(validation.skipped).toEqual([]);
    expect(validation.questions).toHaveLength(6);
    expect(validation.questions.every((question) => question.subject === "Advanced Computer")).toBe(true);
    expect(visibleText).toMatch(/sender|receiver|message|communication|feedback/i);
    expect(visibleText).not.toMatch(
      /Unit\s+1\.indd|24-08-2018|S\s*eSSIon|evidence clue|case reasoning clue|Employability SkillS|IntroductIon to communIcatIon|Explain the concept clearly/i,
    );

    const matchQuestion = validation.questions.find(
      (question) => question.type === "MATCH_FOLLOWING",
    );
    expect(matchQuestion?.correctAnswer).not.toBe(
      "A1-B1, A2-B2, A3-B3, A4-B4",
    );
    expect(
      (matchQuestion?.matchPairs ?? [])
        .flatMap((pair) => [pair.left, pair.right])
        .join(" "),
    ).not.toMatch(/\b(?:Context|Inference|Correct use|Application|Reason)\b/i);
  });

  it("diversifies Assertion-Reason answer keys in source-backed fallback", () => {
    const assertionBlueprint: Blueprint = {
      sections: [sectionFor("ASSERTION_REASON", 2, 1)],
      totalQuestions: 2,
      totalMarks: 2,
      estimatedTime: 6,
      competencyPercentage: 60,
    };
    const assertionConfig: PaperConfig = {
      ...config,
      questionTypes: ["ASSERTION_REASON"],
      typeDistribution: { ASSERTION_REASON: 2 },
      totalQuestions: 2,
      totalMarks: 2,
    };

    const questions = generateSourceBackedFallbackQuestions(
      assertionBlueprint.sections,
      concepts,
      assertionConfig,
    );
    const validation = validatePaperKeepingValidQuestions(
      questions,
      assertionBlueprint,
      assertionConfig,
    );
    const answers = validation.questions.map((question) => question.correctAnswer);
    const visibleText = studentVisibleText(validation.questions);

    expect(validation.questions).toHaveLength(2);
    expect(new Set(answers).size).toBeGreaterThan(1);
    expect(visibleText).not.toMatch(/can be understood through|supports the .* reasoning/i);
  });

  it("diversifies Assertion-Reason answer keys in syllabus-near fallback", () => {
    const communicationItem = {
      subject: "Advanced Computer",
      chapterId: 1,
      chapterName: "Communication Skills",
      questionCount: 4,
    };
    const assertionBlueprint: Blueprint = {
      sections: [sectionFor("ASSERTION_REASON", 4, 1)],
      totalQuestions: 4,
      totalMarks: 4,
      estimatedTime: 8,
      competencyPercentage: 60,
    };
    const assertionConfig: PaperConfig = {
      ...config,
      subject: "Advanced Computer",
      subjects: ["Advanced Computer"],
      subjectSelections: [
        { subject: "Advanced Computer", chapterIds: [1], topicIds: [] },
      ],
      questionTypes: ["ASSERTION_REASON"],
      typeDistribution: { ASSERTION_REASON: 4 },
      totalQuestions: 4,
      totalMarks: 4,
    };

    const questions = generateSyllabusNearFallbackQuestions(
      assertionBlueprint.sections,
      communicationItem,
      assertionConfig,
      { concepts: [] },
    );
    const validation = validatePaperKeepingValidQuestions(
      questions,
      assertionBlueprint,
      assertionConfig,
    );
    const answers = validation.questions.map((question) => question.correctAnswer);

    expect(validation.questions).toHaveLength(4);
    expect(new Set(answers).size).toBeGreaterThan(1);
    expect(studentVisibleText(validation.questions)).not.toMatch(
      /can be understood through|supports the .* reasoning/i,
    );
  });
});

function sectionFor(
  questionType: Blueprint["sections"][number]["questionType"],
  count: number,
  marksPerQuestion: number,
): Blueprint["sections"][number] {
  return {
    name: `Section ${questionType}`,
    questionType,
    count,
    marksPerQuestion,
    totalMarks: count * marksPerQuestion,
    difficulty: "MEDIUM",
    difficultyBreakdown: { MEDIUM: 100 },
    bloomBreakdown: defaultBloomDistribution,
  };
}

function studentVisibleText(questions: GeneratedQuestion[]) {
  const values: string[] = [];

  questions.forEach((question) => {
    values.push(
      question.text,
      question.correctAnswer,
      question.explanation,
      question.scenario ?? "",
      question.assertion ?? "",
      question.reason ?? "",
      question.diagramDescription ?? "",
      ...(question.keyPoints ?? []),
    );
    question.options?.forEach((option) => values.push(option.text));
    question.matchPairs?.forEach((pair) => values.push(pair.left, pair.right));
    question.subQuestions?.forEach((subQuestion) => {
      values.push(subQuestion.text, subQuestion.correctAnswer);
      subQuestion.options?.forEach((option) => values.push(option.text));
    });
  });

  return values.join(" ");
}
