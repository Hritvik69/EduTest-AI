import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

describe("fresh question generation invariant", () => {
  it("does not use stored question rows as generation input", () => {
    const route = readFileSync(
      join(root, "app", "api", "generate-paper", "route.ts"),
      "utf8",
    );
    const generator = readFileSync(join(root, "lib", "generator.ts"), "utf8");

    expect(route).not.toMatch(/FROM\s+questions/i);
    expect(route).not.toMatch(/paper_questions/i);
    expect(generator).not.toMatch(/FROM\s+questions/i);
    expect(generator).not.toMatch(/paper_questions/i);
  });

  it("does not import NCERT PDFs into the reusable questions table", () => {
    const importer = readFileSync(
      join(root, "scripts", "import-ncert.mjs"),
      "utf8",
    );

    expect(importer).not.toMatch(/INSERT\s+INTO\s+questions/i);
    expect(importer).not.toMatch(/paper_questions/i);
    expect(importer).toMatch(/INSERT\s+INTO\s+concepts/i);
  });

  it("does not rely on currval for relational linking", () => {
    const storeFiles = ["lib/paper-store.ts", "lib/pdf-source-store.ts"].map((file) =>
      readFileSync(join(root, file), "utf8"),
    );

    storeFiles.forEach((content) => {
      expect(content).not.toMatch(/\bcurrval\s*\(/i);
    });
  });

  it("tells every provider to use only the selected NCERT/PDF chapter slice", () => {
    const promptFiles = ["lib/generator.ts", "lib/gemini-prompts.ts"].map((file) =>
      readFileSync(join(root, file), "utf8"),
    );

    promptFiles.forEach((content) => {
      expect(content).toMatch(/already (?:been )?sliced to the user's selected|already been sliced to the selected/i);
      expect(content).toMatch(/Never use the whole book\/PDF/i);
      expect(content).toMatch(/neighboring chapters, previous chapters, next chapters/i);
      expect(content).toMatch(/If the user selected one chapter, every question must come only from that chapter/i);
    });
  });

  it("does not save local template questions when source-text AI generation times out", () => {
    const route = readFileSync(
      join(root, "app", "api", "generate-paper", "route.ts"),
      "utf8",
    );
    const generator = readFileSync(join(root, "lib", "generator.ts"), "utf8");
    const finalCompletion = readFileSync(
      join(root, "lib", "final-generation-completion.ts"),
      "utf8",
    );

    expect(route).toMatch(/shouldStopForFinalization/);
    expect(route).toMatch(/partialFinalizationReason/);
    expect(route).toMatch(/session-only generation/);
    expect(route).toMatch(/!stoppedForServerBudget/);
    expect(route).toMatch(/Retry starts a fresh session-only generation/);
    expect(route).toMatch(/sourceTextNotEnoughForProviderOutage/);
    expect(route).toMatch(/generateBlueprintQuestions/);
    expect(route).toMatch(/repairAttempt <= 3/);
    expect(route).toMatch(/QuestionCandidateBank/);
    expect(route).toMatch(/candidateReserveCount/);
    expect(route).toMatch(/stripGenerationMetadataFromQuestions/);
    expect(route).toMatch(/completeQuestionBankWithFinalFallbacks/);
    expect(route).toMatch(/generateSourceBackedProviderOutageQuestions/);
    expect(route).toMatch(/hasSourceBackedFallbackConcepts/);
    expect(route).toMatch(/providers unavailable; generating from selected TXT\/PDF/);
    expect(route).not.toMatch(/completeWithSourceBackedGenerationFallback/);
    expect(finalCompletion).toMatch(/completeQuestionBankWithSourceBackedFallback/);
    expect(finalCompletion).toMatch(/completeQuestionBankWithSyllabusNearFallback/);
    expect(finalCompletion).toMatch(/sourceBackedCompletionMarker/);
    expect(generator).toMatch(/NCERT_BOOKS_TXT/);
    expect(generator).toMatch(/Do not copy source lines verbatim/);
    expect(generator).toMatch(/candidate_count/);
    expect(generator).toMatch(/noveltyAngle/);
    expect(generator).toMatch(/sourceChunkFocus/);
    expect(generator).toMatch(/answerPath/);
    expect(generator).toMatch(/Validator repair feedback/);
  });

  it("keeps shared final fallback completion before any validation failure", () => {
    const route = readFileSync(
      join(root, "app", "api", "generate-paper", "route.ts"),
      "utf8",
    );

    const finalCompletionIndex = route.indexOf(
      "completeQuestionBankWithFinalFallbacks({",
      route.indexOf("allowSourceBackedCompletion"),
    );
    const finalValidationBlockedIndex = route.indexOf(
      "throw finalRepairValidationBlockedError",
      finalCompletionIndex,
    );

    expect(finalCompletionIndex).toBeGreaterThan(0);
    expect(route).toMatch(/requireSyllabusComposition: true/);
    expect(finalValidationBlockedIndex).toBeGreaterThan(finalCompletionIndex);
    expect(route).not.toMatch(/throw sourceBackedCapacityError/);
  });

  it("validates admin chapter PDF mutations against class and subject scope", () => {
    const uploadRoute = readFileSync(
      join(root, "app", "api", "upload-pdf", "route.ts"),
      "utf8",
    );
    const extractionService = readFileSync(
      join(root, "lib", "pdf-extraction-service.ts"),
      "utf8",
    );

    expect(uploadRoute).toMatch(/s\.class_num\s*=\s*\$\{classNum\}/);
    expect(uploadRoute).toMatch(/lower\(s\.name\)\s*=\s*lower\(\$\{subject\}\)/);
    expect(extractionService).toMatch(/s\.class_num\s*=\s*\$\{input\.classNum\}/);
    expect(extractionService).toMatch(/lower\(s\.name\)\s*=\s*lower\(\$\{input\.subject\}\)/);
  });
});
