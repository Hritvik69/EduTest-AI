import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildGenerationManifest } from "@/lib/generation-manifest";
import {
  buildSourceBackedProviderRecoveryBank,
  sourceBackedProviderRecoveryMode,
  sourceBackedProviderRecoveryWarning,
} from "@/lib/provider-outage-recovery";
import { defaultBloomDistribution } from "@/lib/edutest-data";
import type {
  Blueprint,
  BlueprintSection,
  ConceptData,
  PaperConfig,
  QuestionType,
} from "@/types";

const root = process.cwd();

const mcqSection: BlueprintSection = {
  name: "Section A",
  questionType: "MCQ",
  count: 1,
  marksPerQuestion: 1,
  totalMarks: 1,
  difficulty: "MEDIUM",
  difficultyBreakdown: { MEDIUM: 100 },
  bloomBreakdown: defaultBloomDistribution,
};

const baseConfig: PaperConfig = {
  sourceMode: "curriculum",
  classNum: 8,
  subject: "English",
  subjects: ["English"],
  subjectSelections: [{ subject: "English", chapterIds: [1], topicIds: [10] }],
  chapterIds: [1],
  topicIds: [10],
  totalMarks: 1,
  duration: 30,
  examType: "School Test",
  difficulty: "MEDIUM",
  aiProvider: "AUTO",
  generationMode: "fresh",
  questionTypes: ["MCQ"],
  typeDistribution: { MCQ: 1 },
  bloomDistribution: defaultBloomDistribution,
  totalQuestions: 1,
};

describe("provider outage source-backed recovery", () => {
  it("finishes a full paper from selected source when runtime Auto providers fail", () => {
    const totalQuestions = 8;
    const config = configForCount(totalQuestions);
    const recovery = buildSourceBackedProviderRecoveryBank({
      blueprint: blueprintForCount(totalQuestions),
      concepts,
      config,
      scope: "runtime provider timeout",
    });

    expect(recovery.readyQuestionCount).toBe(totalQuestions);
    expect(recovery.missingQuestionCount).toBe(0);
    expect(recovery.generatedQuestions).toHaveLength(totalQuestions);
    expect(recovery.candidateQuestions.every((question) => question.source === "ncert_txt")).toBe(true);
  });

  it("fails clearly when selected TXT/PDF source cannot support recovery", () => {
    const totalQuestions = 20;
    const lowCapacityText = "Tone needs context clues.";

    expect(() =>
      buildSourceBackedProviderRecoveryBank({
        blueprint: blueprintForCount(totalQuestions),
        concepts: [
          {
            ...concepts[0],
            text: lowCapacityText,
          },
        ],
        config: configForCount(totalQuestions),
        scope: "provider preflight outage",
      }),
    ).toThrow(/SOURCE_TEXT_NOT_ENOUGH: Selected source text cannot produce enough/);

    try {
      buildSourceBackedProviderRecoveryBank({
        blueprint: blueprintForCount(totalQuestions),
        concepts: [
          {
            ...concepts[0],
            text: lowCapacityText,
          },
        ],
        config: configForCount(totalQuestions),
        scope: "provider preflight outage",
      });
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toContain("Source concepts: 0");
    }
  });

  it("completes a provider-outage paper with the screenshot fragile format mix", () => {
    const blueprint = mixedBlueprint([
      sectionFor("MCQ", 5, 1),
      sectionFor("SHORT", 2, 3),
      sectionFor("MATCH_FOLLOWING", 2, 3),
      sectionFor("VERY_SHORT", 1, 2),
      sectionFor("TRUE_FALSE", 3, 1),
      sectionFor("ASSERTION_REASON", 2, 1),
    ]);
    const config = configForBlueprint(blueprint, {
      difficulty: "ABSURD",
      subjects: ["English"],
      subject: "English",
    });

    const recovery = buildSourceBackedProviderRecoveryBank({
      blueprint,
      concepts: richProviderConcepts(),
      config,
      scope: "provider outage fragile mix",
    });

    expect(recovery.readyQuestionCount).toBe(15);
    expect(recovery.missingQuestionCount).toBe(0);
    expect(recovery.blueprint.totalQuestions).toBe(15);
    expect(recovery.blueprint.totalMarks).toBe(24);
    expect(recovery.config.totalQuestions).toBe(15);
    expect(recovery.generatedQuestions).toHaveLength(15);
  });

  it("uses chapter/topic-near fallback when strict provider recovery capacity is too low", () => {
    const blueprint = mixedBlueprint([
      sectionFor("MCQ", 2, 1),
      sectionFor("SHORT", 2, 3),
      sectionFor("MATCH_FOLLOWING", 2, 3),
      sectionFor("TRUE_FALSE", 2, 1),
      sectionFor("ASSERTION_REASON", 2, 1),
      sectionFor("VERY_SHORT", 2, 2),
    ]);
    const config = configForBlueprint(blueprint, {
      subject: "Advanced Computer",
      subjects: ["Advanced Computer"],
      questionComposition: [
        {
          subject: "Advanced Computer",
          chapterId: 1,
          chapterName: "Communication Skills",
          questionCount: blueprint.totalQuestions,
        },
      ],
    });

    const recovery = buildSourceBackedProviderRecoveryBank({
      blueprint,
      concepts: [lowCapacityCommunicationConcept()],
      config,
      scope: "provider outage low strict capacity",
    });

    expect(recovery.readyQuestionCount).toBe(12);
    expect(recovery.missingQuestionCount).toBe(0);
    expect(recovery.warnings.some((warning) =>
      /syllabus-near-fallback|chapter\/topic-near/i.test(warning.reason),
    )).toBe(true);
  });

  it("puts provider recovery into the final manifest warnings", () => {
    const totalQuestions = 4;
    const config = configForCount(totalQuestions);
    const blueprint = blueprintForCount(totalQuestions);
    const recovery = buildSourceBackedProviderRecoveryBank({
      blueprint,
      concepts,
      config,
      scope: "manifest recovery",
    });
    const validation = recovery.bank.result();
    const manifest = buildGenerationManifest({
      config,
      blueprint: validation.blueprint,
      concepts,
      finalQuestions: validation.questions,
      skippedQuestions: 0,
      replacedQuestions: 0,
      validationWarnings: [sourceBackedProviderRecoveryWarning()],
      generationJobId: "provider-recovery-test",
      idempotencyKey: "provider-recovery-test-key",
      taskProviderOrder: { QUESTION_GENERATION: ["AUTO"] },
    });

    expect(manifest.validation.warnings.join(" ")).toContain(
      sourceBackedProviderRecoveryMode,
    );
    expect(manifest.warnings.join(" ")).toContain(sourceBackedProviderRecoveryMode);
  });

  it("wires the route to shared recovery for provider and budget failures", () => {
    const route = readFileSync(
      join(root, "app", "api", "generate-paper", "route.ts"),
      "utf8",
    );

    expect(route).toMatch(/buildSourceBackedProviderRecoveryBank/);
    expect(route).toMatch(/isProviderOutageRecoverableForSource/);
    expect(route).toMatch(/canUseSourceBackedProviderRecovery/);
    expect(route).toMatch(/AI time budget is low; completing from selected TXT\/PDF source text/);
    expect(route).toMatch(/sourceBackedProviderRecoveryWarning/);
    expect(readFileSync(
      join(root, "lib", "provider-outage-recovery.ts"),
      "utf8",
    )).toMatch(/completeQuestionBankWithFinalFallbacks/);
  });
});

function blueprintForCount(count: number): Blueprint {
  return {
    sections: [
      {
        ...mcqSection,
        count,
        totalMarks: count,
      },
    ],
    totalQuestions: count,
    totalMarks: count,
    estimatedTime: count,
    competencyPercentage: 60,
  };
}

function mixedBlueprint(sections: BlueprintSection[]): Blueprint {
  return {
    sections,
    totalQuestions: sections.reduce((sum, section) => sum + section.count, 0),
    totalMarks: sections.reduce((sum, section) => sum + section.totalMarks, 0),
    estimatedTime: sections.reduce((sum, section) => sum + section.count * 2, 0),
    competencyPercentage: 60,
  };
}

function sectionFor(
  questionType: QuestionType,
  count: number,
  marksPerQuestion: number,
): BlueprintSection {
  return {
    ...mcqSection,
    name: `Section ${questionType}`,
    questionType,
    count,
    marksPerQuestion,
    totalMarks: count * marksPerQuestion,
  };
}

function configForCount(count: number): PaperConfig {
  return {
    ...baseConfig,
    totalQuestions: count,
    totalMarks: count,
    typeDistribution: { MCQ: count },
  };
}

function configForBlueprint(
  blueprint: Blueprint,
  overrides: Partial<PaperConfig> = {},
): PaperConfig {
  const typeDistribution = blueprint.sections.reduce<
    Partial<Record<QuestionType, number>>
  >((items, section) => {
    items[section.questionType] = section.count;
    return items;
  }, {});

  return {
    ...baseConfig,
    ...overrides,
    totalQuestions: blueprint.totalQuestions,
    totalMarks: blueprint.totalMarks,
    questionTypes: blueprint.sections.map((section) => section.questionType),
    typeDistribution,
  };
}

function concept(topicId: number, topicName: string, text: string): ConceptData {
  return {
    text,
    type: "NCERT_TXT_SOURCE",
    bloomLevel: "UNDERSTAND",
    hotsPotential: true,
    subject: "English",
    classNum: 8,
    chapterName: "A Dialogue in Context",
    topicName,
    chapterId: 1,
    topicId,
    source: "ncert_txt",
  };
}

function richProviderConcepts(): ConceptData[] {
  return Array.from({ length: 16 }, (_, index) =>
    concept(
      100 + index,
      `Provider recovery clue ${index + 1}`,
      `The selected source explains dialogue recovery clue ${index + 1}: careful reading connects word choice, context, speaker intention, evidence, and feedback so a learner can infer meaning, compare alternatives, avoid unsupported guesses, and justify an answer with a clear classroom reason.`,
    ),
  );
}

function lowCapacityCommunicationConcept(): ConceptData {
  return {
    ...concepts[0],
    subject: "Advanced Computer",
    classNum: 9,
    chapterName: "Communication Skills",
    topicName: "Communication Skills",
    text:
      "Communication needs a sender, receiver, message, and feedback so students can check whether meaning is understood in class.",
  };
}

const concepts: ConceptData[] = [
  concept(
    10,
    "Dialogue inference",
    "The selected NCERT chapter explains that careful reading of dialogue helps students infer a speaker's intention, tone, and hidden meaning from word choice and social context.",
  ),
  concept(
    11,
    "Tone and intention",
    "The selected source explains how tone and intention are recognised through word choice, pauses, and context so students can connect clues to a supported interpretation.",
  ),
  concept(
    12,
    "Context clues",
    "The selected source shows that context clues guide interpretation when meaning is not directly stated, including surrounding details, behaviour, and situation.",
  ),
  concept(
    13,
    "Source-supported conclusion",
    "The selected source teaches that conclusions should be supported by evidence from the passage, avoiding unsupported guesses and linking each answer to a textual clue.",
  ),
];
