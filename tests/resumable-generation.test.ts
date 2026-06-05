import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

describe("session-only paper generation wiring", () => {
  it("does not create or finalize generated papers through the paper database", () => {
    const route = readFileSync(
      join(root, "app", "api", "generate-paper", "route.ts"),
      "utf8",
    );

    expect(route).not.toMatch(/from\s+"@\/lib\/paper-store"/);
    expect(route).not.toMatch(/createPaperInDB/);
    expect(route).not.toMatch(/setPaperGenerationState/);
    expect(route).not.toMatch(/saveQuestionsAndLink/);
    expect(route).not.toMatch(/markPaperReady/);
    expect(route).not.toMatch(/setPaperGenerationManifest/);
    expect(route).not.toMatch(/updatePaperDefinition/);
    expect(route).not.toMatch(/updatePaperStatus/);
    expect(route).toMatch(/createSessionPaperId/);
    expect(route).toMatch(/session-\$\{Date\.now\(\)\}-\$\{random\}/);
    expect(route).toMatch(/paperSnapshot: readyPaper/);
    expect(route).toMatch(/paperSnapshotToken/);
    expect(route).toMatch(/guestPaperToken: paperSnapshotToken/);
    expect(route).toMatch(/sessionOnly: true/);
  });

  it("keeps provider-outage recovery source-backed and reports source shortages clearly", () => {
    const route = readFileSync(
      join(root, "app", "api", "generate-paper", "route.ts"),
      "utf8",
    );
    const providerRecovery = readFileSync(
      join(root, "lib", "provider-outage-recovery.ts"),
      "utf8",
    );

    expect(route).toMatch(/sourceBackedProviderRecoveryMode/);
    expect(route).toMatch(/sourceBackedProviderRecoveryWarning/);
    expect(route).toMatch(/generateSourceBackedProviderOutageQuestions/);
    expect(route).toMatch(/hasSourceBackedFallbackConcepts\(scopedConcepts\)/);
    expect(route).toMatch(/refreshProviderHealthAfterRuntimeFailure/);
    expect(route).toMatch(/runtimeProviderHealthTimeoutMs/);
    expect(route).toMatch(/onProviderUnavailable/);
    expect(route).toMatch(/SOURCE_TEXT_NOT_ENOUGH/);
    expect(route).toMatch(/sourceTextNotEnoughForProviderOutage/);
    expect(route).toMatch(/analyzeSourceBackedCompletionCapacity/);
    expect(route).toMatch(/sourceCapacityFromError/);
    expect(route).toMatch(/sourceCapacity/);
    expect(route).toMatch(/Retry starts a fresh session-only generation/);
    expect(route).toMatch(/FINAL_REPAIR_VALIDATION_BLOCKED/);
    expect(route).toMatch(/finalRepairValidationBlockedError/);
    expect(route).toMatch(/if \(!sourceCapacity\.enough\)/);
    expect(providerRecovery).toMatch(/source_backed_provider_outage/);
    expect(providerRecovery).toMatch(/provider-recovery/);
  });

  it("stores generated snapshots in sessionStorage and keeps recovery UI visible", () => {
    const overlay = readFileSync(
      join(root, "components", "wizard", "generation-overlay.tsx"),
      "utf8",
    );
    const preview = readFileSync(
      join(root, "app", "(dashboard)", "papers", "[id]", "preview", "page.tsx"),
      "utf8",
    );
    const runner = readFileSync(
      join(root, "components", "test", "test-runner.tsx"),
      "utf8",
    );

    expect(overlay).toMatch(/paperIdValue/);
    expect(overlay).toMatch(/edutest:paper:\$\{paperId\}/);
    expect(overlay).toMatch(/paperSnapshotToken/);
    expect(overlay).toMatch(/visibleProviderRecoveryMode/);
    expect(overlay).toMatch(/Finishing from selected source text/);
    expect(overlay).toMatch(/sourceTextShortage \|\| finalRepairValidationBlocked/);
    expect(overlay).toMatch(/sourceCapacityGuidance/);
    expect(overlay).toMatch(/finalRepairValidationGuidance/);
    expect(overlay).toMatch(/Effective source capacity/);
    expect(overlay).toMatch(/!finalRepairValidationBlocked[\s\S]*isQuestionOutputError/);
    expect(overlay).toMatch(/sourceTextShortage && realSourceCapacityFailure && error\.sourceCapacity/);
    expect(overlay).toMatch(/Generation stopped before the session paper snapshot was completed/);
    expect(preview).toMatch(/readSessionPaper/);
    expect(preview).toMatch(/\/api\/session-paper\/export/);
    expect(runner).toMatch(/readSessionPaper/);
    expect(runner).toMatch(/paperSnapshotToken/);
    expect(runner).toMatch(/!sessionOnly/);
  });

  it("uses a session result store instead of attempts for session papers", () => {
    const migration = readFileSync(
      join(root, "database", "20260605_session_paper_results.sql"),
      "utf8",
    );
    const store = readFileSync(join(root, "lib", "paper-store.ts"), "utf8");
    const evaluateRoute = readFileSync(
      join(root, "app", "api", "evaluate-answers", "route.ts"),
      "utf8",
    );
    const attemptsRoute = readFileSync(
      join(root, "app", "api", "attempts", "[id]", "route.ts"),
      "utf8",
    );

    expect(migration).toMatch(/CREATE TABLE IF NOT EXISTS session_paper_results/);
    expect(migration).not.toMatch(/REFERENCES papers/);
    expect(store).toMatch(/saveSessionPaperResultForUser/);
    expect(store).toMatch(/session_paper_results/);
    expect(store).toMatch(/studentAnswer: ""/);
    expect(evaluateRoute).toMatch(/saveSessionPaperResultForUser/);
    expect(evaluateRoute).toMatch(/paperSnapshotToken \?\? body\.guestPaperToken/);
    expect(attemptsRoute).toMatch(/session-result-/);
  });
});
