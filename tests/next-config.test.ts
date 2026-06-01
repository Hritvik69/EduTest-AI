import { describe, expect, it } from "vitest";
import nextConfig from "@/next.config.mjs";

describe("Next.js server package config", () => {
  it("keeps PDF parsing packages external to avoid server bundle parser crashes", () => {
    expect(nextConfig.serverExternalPackages).toEqual(
      expect.arrayContaining(["pdf-parse", "pdfjs-dist"]),
    );
  });
});
