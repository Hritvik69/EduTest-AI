import { describe, expect, it } from "vitest";
import nextConfig from "@/next.config.mjs";

describe("Next.js server package config", () => {
  it("keeps PDF parsing packages external to avoid server bundle parser crashes", () => {
    expect(nextConfig.serverExternalPackages).toEqual(
      expect.arrayContaining(["pdf-parse", "pdfjs-dist"]),
    );
  });

  it("traces extracted NCERT text into the generate-paper server function", () => {
    expect(nextConfig.outputFileTracingIncludes?.["/api/generate-paper"]).toEqual(
      expect.arrayContaining(["./NCERT_Books/**/_extracted_text/**/*.txt"]),
    );
  });
});
