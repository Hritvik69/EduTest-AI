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
    expect(route).toMatch(/sourceContextHash/);
    expect(store).toMatch(/generationState/);
    expect(store).toMatch(/error_metadata/);
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
    expect(overlay).toMatch(/Continuing saved generation/);
    expect(overlay).toMatch(/retry continues it/);
  });
});
