import { describe, expect, it, vi } from "vitest";
import { retrieveConcepts } from "@/lib/retriever";
import type { ConceptData } from "@/types";

vi.mock("@/lib/db", () => ({
  default: vi.fn(),
}));

describe("retriever source-text priority", () => {
  it("uses real source text instead of outline topics in generation context", async () => {
    const outlineConcept = concept({
      text: "Reading comprehension and inference",
      type: "CURRICULUM_TOPIC",
      source: "curriculum",
      topicName: "Reading comprehension and inference",
      hotsPotential: true,
    });
    const sourceText = concept({
      text:
        "King Krishnadeva Raya asked Tenali Ramakrishna to solve a difficult court problem. Tenali listened carefully, answered with wit, and helped the court understand the truth without insulting anyone.",
      type: "NCERT_TXT_SOURCE",
      source: "ncert_txt",
      topicName: "The Wit that Won Hearts",
      hotsPotential: false,
    });

    const context = await retrieveConcepts(
      [outlineConcept, sourceText],
      "ABSURD",
      { CREATE: 100 },
    );

    expect(context.indexOf("King Krishnadeva Raya")).toBeGreaterThanOrEqual(0);
    expect(context).not.toContain("Reading comprehension and inference");
  });
});

function concept(overrides: Partial<ConceptData>): ConceptData {
  return {
    text: "placeholder",
    type: "FACT",
    bloomLevel: "UNDERSTAND",
    hotsPotential: false,
    hotsPoential: false,
    topicName: "General",
    chapterId: 1,
    source: "curriculum",
    ...overrides,
  };
}
