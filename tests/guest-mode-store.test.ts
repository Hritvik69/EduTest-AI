import { describe, expect, it } from "vitest";
import { createGuestUser } from "@/lib/api-security";
import { generateBlueprint } from "@/lib/blueprint";
import { defaultBloomDistribution } from "@/lib/edutest-data";
import {
  createPaperInDB,
  getPaper,
  getPaperOwnerId,
  listPapersForUser,
  markPaperReady,
  saveQuestionsAndLink,
  setPaperGenerationManifest,
} from "@/lib/paper-store";
import type { GeneratedQuestion, GenerationManifest, PaperConfig } from "@/types";

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

  it("isolates in-memory papers and idempotency by guest session", async () => {
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
    expect((await listPapersForUser(secondGuest.id)).map((paper) => paper.id)).not.toContain(
      first.paperId,
    );
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
});
