import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

describe("paper creator wizard phase order", () => {
  it("shows Integration Prompt as phase 2 and shifts composition through AI Engine to phase 7", () => {
    const progressSteps = readFileSync(
      join(root, "components", "wizard", "progress-steps.tsx"),
      "utf8",
    );
    const wizard = readFileSync(
      join(root, "components", "wizard", "paper-creator-wizard.tsx"),
      "utf8",
    );

    expect(progressSteps).toMatch(
      /"Class & Chapters",\s*"Integration Prompt",\s*"S\/C\/T Composition",\s*"Time & Exam",\s*"Difficulty",\s*"Question Types",\s*"AI Engine"/,
    );
    expect(progressSteps).toMatch(/sm:grid-cols-7/);
    expect(wizard).toMatch(/step === 2 \? <StepIntegrationPrompt \/>/);
    expect(wizard).toMatch(/step === 3 \? <StepComposition \/>/);
    expect(wizard).toMatch(/step === 7 \? <StepFive \/>/);
    expect(wizard).toMatch(/step === 7 \? "Review Configuration" : "Continue"/);
  });
});
