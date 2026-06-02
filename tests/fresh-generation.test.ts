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
