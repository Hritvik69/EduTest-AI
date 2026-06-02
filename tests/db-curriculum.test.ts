import { describe, expect, it, vi } from "vitest";

const dbMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db", () => ({
  default: dbMock,
}));

import {
  getImportedChapters,
  getImportedSubjectOptions,
  hasImportedCurriculum,
} from "@/lib/db-curriculum";

describe("imported NCERT curriculum queries", () => {
  it("never exposes whole-book fallback rows as selectable chapters", async () => {
    dbMock.mockResolvedValue([]);

    await getImportedSubjectOptions();
    await hasImportedCurriculum();
    await getImportedChapters(8, "English");

    const queries = dbMock.mock.calls.map(([strings]) =>
      Array.from(strings as TemplateStringsArray).join("?"),
    );

    expect(queries).toHaveLength(3);
    queries.forEach((query) => {
      expect(query).toMatch(/Full Book Source/i);
      expect(query).toMatch(/NOT ILIKE/i);
    });
  });
});
