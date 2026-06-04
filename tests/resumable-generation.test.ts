import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

describe("resumable paper generation wiring", () => {
  it("stores candidate-bank progress in paper error metadata", () => {
    const route = readFileSync(
      join(root, "app", "api", "generate-paper", "route.ts"),
      "utf8",
    );
    const store = readFileSync(join(root, "lib", "paper-store.ts"), "utf8");
    const bank = readFileSync(
      join(root, "lib", "question-candidate-bank.ts"),
      "utf8",
    );

    expect(route).toMatch(/getPaperGenerationState/);
    expect(route).toMatch(/setPaperGenerationState/);
    expect(route).toMatch(/GENERATION_CONTINUE_AVAILABLE/);
    expect(route).toMatch(/phase:\s*"INITIAL_GENERATION"/);
    expect(route).toMatch(/phase:\s*"QUESTION_GENERATION"/);
    expect(route).toMatch(/generationHeartbeatMs/);
    expect(route).toMatch(/recoveryPayload/);
    expect(route).toMatch(/contractPayload/);
    expect(route).toMatch(/generationStreamContractSummary/);
    expect(route).toMatch(/contractHash/);
    expect(route).toMatch(/plannedCalls/);
    expect(route).toMatch(/apiRiskLevel/);
    expect(route).toMatch(/onAcceptedBatch/);
    expect(route).toMatch(/shouldStopBeforeNextGenerationCall/);
    expect(route).toMatch(/providerAttemptLimitForGeneration/);
    expect(route).toMatch(/maxProviderAttempts/);
    expect(route).toMatch(/deadlineAt: generationDeadlineAt/);
    expect(route).toMatch(/isRecoverableGenerationRuntimeError/);
    expect(route).toMatch(/onStatePersisted/);
    expect(route).toMatch(/sourceContextHash/);
    expect(route).toMatch(/readyQuestionCount/);
    expect(route).toMatch(/targetQuestionCount/);
    expect(route).toMatch(/missingQuestionCount/);
    expect(route).toMatch(/resumeNeedsFinalCompletion/);
    expect(route).toMatch(/resolving .* saved duplicate\/missing question/);
    expect(route).toMatch(/Saved .* valid candidate.* for continuation/);
    expect(route).toMatch(/!stoppedForServerBudget/);
    expect(route).toMatch(/resume paper not found; starting fresh/);
    expect(route).toMatch(/Saved generation progress was no longer available/);
    expect(route).toMatch(/generationState: savedFailureState/);
    expect(route).not.toMatch(/deletePaperForUser/);
    expect(store).toMatch(/generationState/);
    expect(store).toMatch(/error_metadata/);
    expect(store).toMatch(/canUseMemoryPaperFallback/);
    expect(store).toMatch(/paperPersistenceRequiredError/);
    expect(bank).toMatch(/candidateQuestions/);
    expect(bank).toMatch(/acceptedQuestions/);
    expect(bank).toMatch(/missingSections/);
  });

  it("continues recoverable errors from the same paper instead of starting over", () => {
    const schema = readFileSync(join(root, "lib", "schemas.ts"), "utf8");
    const overlay = readFileSync(
      join(root, "components", "wizard", "generation-overlay.tsx"),
      "utf8",
    );

    expect(schema).toMatch(/resumePaperId/);
    expect(overlay).toMatch(/resumePaperId/);
    expect(overlay).toMatch(/GENERATION_CONTINUE_AVAILABLE/);
    expect(overlay).toMatch(/GENERATION_STREAM_RECOVERABLE/);
    expect(overlay).toMatch(/classifyRecoveredPaper/);
    expect(overlay).toMatch(/streamContractFromData/);
    expect(overlay).toMatch(/streamRecoverySnapshotFromData/);
    expect(overlay).toMatch(/lastRecoverySnapshot/);
    expect(overlay).toMatch(/recoverableStreamEndedErrorFromSnapshot/);
    expect(overlay).toMatch(/paperIdFromStreamRecoverySnapshot/);
    expect(overlay).toMatch(/matchingStreamRecoverySnapshot/);
    expect(overlay).toMatch(/streamContract \?\? clientContract/);
    expect(overlay).toMatch(/server confirmed/);
    expect(overlay).toMatch(/clearStaleGenerationSessionKeys/);
    expect(overlay).toMatch(/canAutoContinueGenerationError/);
    expect(overlay).toMatch(/zeroProgressAutoContinueAttempts/);
    expect(overlay).toMatch(/maxZeroProgressAutoContinueAttempts/);
    expect(overlay).toMatch(/zeroProgressAttempts < maxZeroProgressAutoContinueAttempts/);
    expect(overlay).not.toMatch(/is in your dashboard/);
    expect(overlay).toMatch(/Continuing saved generation/);
    expect(overlay).toMatch(/autoContinueAttempts/);
    expect(overlay).toMatch(/maxAutoContinueAttempts/);
    expect(overlay).toMatch(/setRetryNonce/);
  });

  it("does not auto-continue deterministic source-shortage finalization failures", () => {
    const route = readFileSync(
      join(root, "app", "api", "generate-paper", "route.ts"),
      "utf8",
    );
    const overlay = readFileSync(
      join(root, "components", "wizard", "generation-overlay.tsx"),
      "utf8",
    );

    expect(route).toMatch(/SOURCE_TEXT_NOT_ENOUGH/);
    expect(route).toMatch(/Selected source text cannot produce enough 100% distinct questions/);
    expect(overlay).toMatch(/isSourceTextShortageError/);
    expect(overlay).toMatch(/SOURCE_TEXT_NOT_ENOUGH/);
    expect(overlay).toMatch(/if \(isSourceTextShortageError\(error\)\) return false/);
  });
});
