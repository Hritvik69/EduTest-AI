import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { createGuestUser } from "@/lib/api-security";
import { generateBlueprint } from "@/lib/blueprint";
import { defaultBloomDistribution } from "@/lib/edutest-data";
import {
  createSignedGuestSessionCookieValue,
  guestSessionCookieName,
} from "@/lib/guest-session";
import {
  createPaperInDB,
  getPaper,
  getPaperOwnerId,
  listPapersForUser,
  markPaperReady,
  persistGeneratedPaper,
  saveQuestionsAndLink,
  setPaperGenerationManifest,
} from "@/lib/paper-store";
import type {
  GeneratedQuestion,
  GenerationManifest,
  PaperConfig,
  StoredPaper,
} from "@/types";

const config: PaperConfig = {
  classNum: 10,
  subject: "Science",
  subjects: ["Science"],
  subjectSelections: [{ subject: "Science", chapterIds: [1], topicIds: [] }],
  chapterIds: [1],
  totalMarks: 1,
  duration: 30,
  examType: "Practice",
  difficulty: "MEDIUM",
  questionTypes: ["MCQ"],
  typeDistribution: { MCQ: 1 },
  bloomDistribution: defaultBloomDistribution,
  totalQuestions: 1,
};

const question: GeneratedQuestion = {
  text: "What is light?",
  type: "MCQ",
  difficulty: "MEDIUM",
  marks: 1,
  options: [
    { id: "A", text: "Energy", isCorrect: true },
    { id: "B", text: "Mass", isCorrect: false },
  ],
  correctAnswer: "A",
  explanation: "Light is a form of energy.",
  bloomLevel: "REMEMBER",
  competencyLevel: 1,
  section: "Section A",
};

describe("guest-mode paper storage", () => {
  it("treats expired guest timestamp ids as missing instead of querying integer DB ids", async () => {
    const expiredGuestId = 1_780_071_763_405_005;
    const guest = createGuestUser("guest-session-expired");

    expect(await getPaperOwnerId(expiredGuestId)).toBeNull();
    expect(await getPaper(expiredGuestId, guest.id)).toBeNull();
  });

  it("scopes dashboard paper listings to the current guest owner", async () => {
    const firstGuest = createGuestUser("guest-session-aaaaaaaa");
    const secondGuest = createGuestUser("guest-session-bbbbbbbb");
    const blueprint = generateBlueprint(config);

    const first = await createPaperInDB(config, blueprint, false, {
      userId: firstGuest.id,
      idempotencyKey: "same-generation",
    });
    await saveQuestionsAndLink([question], first.paperId, "curriculum");

    const firstAgain = await createPaperInDB(config, blueprint, false, {
      userId: firstGuest.id,
      idempotencyKey: "same-generation",
    });
    const second = await createPaperInDB(config, blueprint, false, {
      userId: secondGuest.id,
      idempotencyKey: "same-generation",
    });

    expect(firstAgain.reused).toBe(true);
    expect(firstAgain.paperId).toBe(first.paperId);
    expect(second.paperId).not.toBe(first.paperId);
    expect(await getPaperOwnerId(first.paperId)).toBe(firstGuest.id);
    expect(await getPaper(first.paperId, firstGuest.id)).not.toBeNull();
    expect(await getPaper(first.paperId, secondGuest.id)).toBeNull();
    expect(await getPaper(first.paperId)).not.toBeNull();

    const secondDashboard = await listPapersForUser(secondGuest.id);
    expect(secondDashboard.map((paper) => paper.id)).not.toContain(first.paperId);
    expect(secondDashboard.find((paper) => paper.id === second.paperId)).toMatchObject({
      isOwner: true,
    });
  });

  it("does not let another guest open or delete a ready paper", async () => {
    const firstGuest = createGuestUser("guest-session-sharedaa");
    const secondSessionId = "guest-session-sharedbb";
    const secondGuest = createGuestUser(secondSessionId);
    const blueprint = generateBlueprint(config);
    const created = await createPaperInDB(config, blueprint, false, {
      userId: firstGuest.id,
      idempotencyKey: "shared-ready-paper",
    });
    await saveQuestionsAndLink([question], created.paperId, "curriculum");

    const { GET, DELETE } = await import("@/app/api/papers/[id]/route");
    const cookieValue = await createSignedGuestSessionCookieValue(secondSessionId);
    const request = new NextRequest(`http://localhost/api/papers/${created.paperId}`, {
      headers: {
        cookie: `${guestSessionCookieName}=${cookieValue}`,
      },
    });

    const getResponse = await GET(request, {
      params: Promise.resolve({ id: String(created.paperId) }),
    });
    const getPayload = await getResponse.json();

    expect(getResponse.status).toBe(403);
    expect(getPayload.error).toContain("Paper access denied");

    const deleteResponse = await DELETE(request, {
      params: Promise.resolve({ id: String(created.paperId) }),
    });
    const deletePayload = await deleteResponse.json();

    expect(secondGuest.id).not.toBe(firstGuest.id);
    expect(deleteResponse.status).toBe(403);
    expect(deletePayload.error).toContain("Paper access denied");
    expect(await getPaper(created.paperId, firstGuest.id)).not.toBeNull();
  });

  it("does not allow an empty generated paper to become ready", async () => {
    const guest = createGuestUser("guest-session-emptyready");
    const blueprint = generateBlueprint(config);

    const created = await createPaperInDB(config, blueprint, false, {
      userId: guest.id,
      idempotencyKey: "empty-ready",
    });

    await expect(markPaperReady(created.paperId)).rejects.toThrow(
      "Cannot mark a paper READY before questions are saved.",
    );
  });

  it("does not create memory-only guest paper ids for production generation", async () => {
    const guest = createGuestUser("guest-session-production-db");
    const blueprint = generateBlueprint(config);
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VERCEL", "");

    try {
      await expect(
        createPaperInDB(config, blueprint, false, {
          userId: guest.id,
          idempotencyKey: "production-db-required",
        }),
      ).rejects.toThrow(/Database save failed.*persistence/);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("stores generation manifest metadata with guest papers", async () => {
    const guest = createGuestUser("guest-session-manifest");
    const blueprint = generateBlueprint(config);
    const created = await createPaperInDB(config, blueprint, false, {
      userId: guest.id,
      idempotencyKey: "manifest-paper",
    });
    const [storedQuestion] = await saveQuestionsAndLink(
      [question],
      created.paperId,
      "curriculum",
    );
    const manifest: GenerationManifest = {
      version: 1,
      generatedAt: new Date().toISOString(),
      generationJobId: "job-manifest",
      idempotencyKey: "manifest-paper",
      source: {
        mode: "curriculum",
        classNum: 10,
        subject: "Science",
        subjects: ["Science"],
        chapterIds: [1],
        conceptSource: "curriculum",
        conceptCount: 1,
        topicNames: ["Light"],
      },
      ai: {
        selectedProvider: "AUTO",
        taskProviderOrder: {
          QUESTION_GENERATION: ["GEMINI"],
        },
      },
      validation: {
        targetQuestions: 1,
        finalQuestions: 1,
        targetMarks: 1,
        finalMarks: storedQuestion.marks,
        skippedQuestions: 0,
        replacedQuestions: 0,
        warnings: [],
      },
      warnings: [],
    };

    await setPaperGenerationManifest(created.paperId, manifest, {
      ...config,
      sourceMode: "pdf_upload",
      pdfSourceId: 42,
      examType: "Practice",
    });

    const paper = await getPaper(created.paperId, guest.id);
    expect(paper?.manifest?.source.conceptSource).toBe("curriculum");
    expect(paper?.manifest?.validation.finalQuestions).toBe(1);
    expect(paper?.errorMetadata?.generationManifest).toEqual(manifest);
    expect(paper?.errorMetadata?.normalizedConfig).toMatchObject({
      sourceMode: "pdf_upload",
      pdfSourceId: 42,
      examType: "Practice",
    });
  });

  it("does not enforce an hourly guest paper generation cap", async () => {
    const guest = createGuestUser("guest-session-no-hourly-cap");
    const blueprint = generateBlueprint(config);

    const created = [];
    for (let index = 0; index < 6; index += 1) {
      created.push(
        await createPaperInDB(config, blueprint, false, {
          userId: guest.id,
          idempotencyKey: `no-hourly-cap-${index}`,
        }),
      );
    }

    expect(created).toHaveLength(6);
    expect(new Set(created.map((paper) => paper.paperId)).size).toBe(6);
    expect(created.every((paper) => paper.status === "GENERATING")).toBe(true);
  });

  it("still reuses idempotency keys after removing the hourly cap", async () => {
    const guest = createGuestUser("guest-session-idempotency-no-cap");
    const blueprint = generateBlueprint(config);
    const first = await createPaperInDB(config, blueprint, false, {
      userId: guest.id,
      idempotencyKey: "same-generation-key",
    });
    const second = await createPaperInDB(config, blueprint, false, {
        userId: guest.id,
      idempotencyKey: "same-generation-key",
    });

    expect(second).toMatchObject({
      paperId: first.paperId,
      reused: true,
    });
  });

  it("returns null from persistGeneratedPaper when the paper has no questions", async () => {
    const guest = createGuestUser("guest-session-persist-empty");
    const blueprint = generateBlueprint(config);
    const emptyPaper: StoredPaper = {
      id: 999_001,
      title: "Class 10 Science Practice",
      config,
      blueprint,
      questions: [],
      isDemoMode: false,
      status: "READY",
      createdAt: new Date().toISOString(),
    };

    const persisted = await persistGeneratedPaper(
      emptyPaper,
      guest.id,
      null,
      "empty-persist-key",
    );

    expect(persisted).toBeNull();
  });

  it("persists a ready paper to the dashboard listing in dev with no database", async () => {
    const guest = createGuestUser("guest-session-persist-happy");
    const blueprint = generateBlueprint(config);
    const readyPaper: StoredPaper = {
      id: 999_002,
      title: "Class 10 Science Practice",
      config,
      blueprint,
      questions: [question],
      isDemoMode: false,
      status: "READY",
      createdAt: new Date().toISOString(),
    };

    const persisted = await persistGeneratedPaper(
      readyPaper,
      guest.id,
      "job-persist-happy",
      "persist-happy-key",
    );

    expect(persisted).not.toBeNull();
    // persistGeneratedPaper returns the status captured from createPaperInDB
    // (GENERATING); saveQuestionsAndLink + markPaperReady then update the
    // memory row to READY before we read the dashboard listing below.
    expect(persisted?.status).toBe("GENERATING");
    expect(persisted?.reused).toBe(false);
    expect(typeof persisted?.paperId).toBe("number");

    const dashboard = await listPapersForUser(guest.id);
    const persistedRow = dashboard.find((row) => row.id === persisted?.paperId);
    expect(persistedRow).toMatchObject({
      isOwner: true,
      status: "READY",
      title: "Class 10 Science Practice",
    });
  });

  it("throws from persistGeneratedPaper in production when no database is configured", async () => {
    const guest = createGuestUser("guest-session-persist-prod");
    const blueprint = generateBlueprint(config);
    const readyPaper: StoredPaper = {
      id: 999_003,
      title: "Class 10 Science Practice",
      config,
      blueprint,
      questions: [question],
      isDemoMode: false,
      status: "READY",
      createdAt: new Date().toISOString(),
    };

    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VERCEL", "");

    try {
      await expect(
        persistGeneratedPaper(
          readyPaper,
          guest.id,
          "job-persist-prod",
          "persist-prod-key",
        ),
      ).rejects.toThrow(/Database save failed.*persistence/);
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

describe("listPapersForUser with database configured", () => {
  beforeEach(() => {
    vi.resetModules();
    delete process.env.DATABASE_URL;
    delete process.env.VERCEL;
  });

  afterEach(() => {
    vi.resetModules();
    vi.doUnmock("@/lib/db");
  });

  function dbRow(
    overrides: Partial<{
      id: number;
      title: string;
      created_at: string;
      user_id: number;
    }> = {},
  ) {
    return {
      id: 1,
      title: "DB Paper",
      subject: "Science",
      class_num: 10,
      total_marks: 100,
      duration: 60,
      status: "READY",
      is_demo_mode: false,
      error_metadata: null,
      created_at: new Date().toISOString(),
      user_id: -1,
      latest_attempt_id: null,
      latest_percentage: null,
      ...overrides,
    };
  }

  function installSqlMock(rows: unknown[]) {
    const sql: any = vi.fn();
    sql.mockResolvedValue(rows);
    sql.transaction = vi.fn();
    vi.doMock("@/lib/db", () => ({ default: sql }));
    return sql;
  }

  function installNullSql() {
    vi.doMock("@/lib/db", () => ({ default: null }));
  }

  function insertMemoryPaper(
    memoryPapers: Map<number, StoredPaper>,
    ownerId: number,
    paperId: number,
    overrides: Partial<StoredPaper> = {},
  ) {
    const blueprint = generateBlueprint(config);
    memoryPapers.set(paperId, {
      id: paperId,
      title: "Memory Paper",
      config,
      blueprint,
      questions: [],
      isDemoMode: false,
      status: "READY",
      createdAt: new Date().toISOString(),
      ...overrides,
    });
    // paper-store.ts keeps the owners map on globalThis.__edutestPaperOwners;
    // reach it via the same registration to stay in sync without exporting it.
    const owners = (globalThis as { __edutestPaperOwners?: Map<number, number> })
      .__edutestPaperOwners;
    if (!owners) {
      throw new Error("memoryPaperOwners registry is missing on globalThis");
    }
    owners.set(paperId, ownerId);
  }

  it("merges database rows with memory fallback papers for a guest user, sorted by createdAt desc", async () => {
    const guest = createGuestUser("guest-session-merge-rows");
    const now = Date.now();

    installSqlMock([
      dbRow({
        id: 100,
        title: "DB Paper",
        user_id: guest.id,
        created_at: new Date(now - 1_000).toISOString(),
      }),
    ]);

    const { listPapersForUser, memoryPapers } = await import("@/lib/paper-store");
    insertMemoryPaper(memoryPapers, guest.id, 2_147_483_648, {
      title: "Memory Fallback Paper",
      createdAt: new Date(now - 5_000).toISOString(),
    });

    const dashboard = await listPapersForUser(guest.id);

    expect(dashboard).toHaveLength(2);
    expect(dashboard.map((row) => row.id)).toEqual([100, 2_147_483_648]);
    expect(dashboard.map((row) => row.title)).toEqual([
      "DB Paper",
      "Memory Fallback Paper",
    ]);
    expect(dashboard.every((row) => row.isOwner)).toBe(true);
  });

  it("deduplicates papers that exist in both memory and database by id", async () => {
    const guest = createGuestUser("guest-session-merge-dedup");

    installSqlMock([
      dbRow({
        id: 200,
        title: "Shared Paper",
        user_id: guest.id,
      }),
    ]);

    const { listPapersForUser, memoryPapers } = await import("@/lib/paper-store");
    insertMemoryPaper(memoryPapers, guest.id, 200, {
      title: "Shared Paper",
    });

    const dashboard = await listPapersForUser(guest.id);

    expect(dashboard).toHaveLength(1);
    expect(dashboard[0].id).toBe(200);
  });

  it("returns only database rows when a guest has no memory fallback papers", async () => {
    const guest = createGuestUser("guest-session-merge-db-only");

    installSqlMock([
      dbRow({ id: 400, title: "DB Only", user_id: guest.id }),
    ]);

    const { listPapersForUser } = await import("@/lib/paper-store");

    const dashboard = await listPapersForUser(guest.id);

    expect(dashboard).toHaveLength(1);
    expect(dashboard[0]).toMatchObject({
      id: 400,
      title: "DB Only",
      isOwner: true,
    });
  });

  it("does not merge memory papers for non-guest users", async () => {
    const nonGuestId = 4242;

    installSqlMock([
      dbRow({ id: 500, title: "DB Paper", user_id: nonGuestId }),
    ]);

    const { listPapersForUser, memoryPapers } = await import("@/lib/paper-store");
    insertMemoryPaper(memoryPapers, nonGuestId, 501, {
      title: "Should Not Appear",
    });

    const dashboard = await listPapersForUser(nonGuestId);

    expect(dashboard).toHaveLength(1);
    expect(dashboard[0].id).toBe(500);
    expect(dashboard[0].title).toBe("DB Paper");
  });

  it("throws when database is required but not configured for a non-guest user", async () => {
    installNullSql();

    const { listPapersForUser } = await import("@/lib/paper-store");

    await expect(listPapersForUser(9999)).rejects.toThrow(
      "Database is required to list papers.",
    );
  });
});
