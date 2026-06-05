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
    const lowCapacityText =
      "The selected source repeats one idea about tone and intention because one clue supports one answer.";

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
      expect((error as { sourceCapacity?: unknown }).sourceCapacity).toBeDefined();
    }
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

function configForCount(count: number): PaperConfig {
  return {
    ...baseConfig,
    totalQuestions: count,
    totalMarks: count,
    typeDistribution: { MCQ: count },
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
