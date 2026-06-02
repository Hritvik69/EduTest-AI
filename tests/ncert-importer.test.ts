import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("NCERT importer dry run", () => {
  it("scans local PDFs and writes a missing coverage report without AI calls", () => {
    const reportPath = join(mkdtempSync(join(tmpdir(), "edutest-ncert-")), "report.json");
    execFileSync(
      process.execPath,
      ["scripts/import-ncert.mjs", "--dry-run", "--max-pdfs=1", `--report-path=${reportPath}`],
      {
        cwd: process.cwd(),
        stdio: "pipe",
      },
    );

    const report = JSON.parse(
      readFileSync(reportPath, "utf8"),
    ) as {
      mode: string;
      scannedPdfCount: number;
      missingCoverage: Array<{ classNum: number; subject: string }>;
    };

    expect(report.mode).toBe("dry-run");
    expect(report.scannedPdfCount).toBeGreaterThan(0);
    expect(report.missingCoverage).toEqual(
      expect.arrayContaining([
        { classNum: 6, subject: "Computer_IT" },
        { classNum: 7, subject: "Computer_IT" },
        { classNum: 8, subject: "Computer_IT" },
        { classNum: 9, subject: "Social_Science" },
      ]),
    );
  }, 30000);
});
