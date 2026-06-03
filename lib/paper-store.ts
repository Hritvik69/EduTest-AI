import sql from "@/lib/db";
import { isGuestUserId } from "@/lib/api-security";
import { generationManifestFromMetadata } from "@/lib/generation-manifest";
import { withNormalizedQuestionOptions } from "@/lib/question-options";
import type { PaperGenerationState } from "@/lib/question-candidate-bank";
import type {
  AnalyticsReport,
  Blueprint,
  BlueprintSection,
  ContentSource,
  GeneratedQuestion,
  GenerationManifest,
  PaperConfig,
  StoredAttempt,
  StoredPaper,
} from "@/types";

const globalForPapers = globalThis as typeof globalThis & {
  __edutestPapers?: Map<number, StoredPaper>;
  __edutestPaperOwners?: Map<number, number>;
  __edutestPaperIdempotency?: Map<string, number>;
  __edutestAttempts?: Map<number, StoredAttempt>;
  __edutestAttemptOwners?: Map<number, number>;
  __edutestMemorySequence?: number;
};

export const memoryPapers =
  globalForPapers.__edutestPapers ?? new Map<number, StoredPaper>();
globalForPapers.__edutestPapers = memoryPapers;

export const memoryAttempts =
  globalForPapers.__edutestAttempts ?? new Map<number, StoredAttempt>();
globalForPapers.__edutestAttempts = memoryAttempts;

const memoryPaperOwners =
  globalForPapers.__edutestPaperOwners ?? new Map<number, number>();
globalForPapers.__edutestPaperOwners = memoryPaperOwners;

const memoryPaperIdempotency =
  globalForPapers.__edutestPaperIdempotency ?? new Map<string, number>();
globalForPapers.__edutestPaperIdempotency = memoryPaperIdempotency;

const memoryAttemptOwners =
  globalForPapers.__edutestAttemptOwners ?? new Map<number, number>();
globalForPapers.__edutestAttemptOwners = memoryAttemptOwners;

const maxDatabaseIntegerId = 2_147_483_647;
const maxGuestPapersPerSession = positiveEnvNumber("EDUTEST_MAX_GUEST_PAPERS", 25);
const maxGuestAttemptsPerSession = positiveEnvNumber("EDUTEST_MAX_GUEST_ATTEMPTS", 50);

interface PaperCreateOptions {
  userId?: number;
  generationJobId?: string;
  idempotencyKey?: string;
}

interface PaperCreationResult {
  paperId: number;
  status: StoredPaper["status"];
  reused: boolean;
}

export async function createPaperInDB(
  config: PaperConfig,
  blueprint: Blueprint,
  isDemoMode: boolean,
  options: PaperCreateOptions = {},
): Promise<PaperCreationResult> {
  pruneGuestMemory();
  const paperConfig = { ...config, totalMarks: blueprint.totalMarks };
  const title = `Class ${paperConfig.classNum} ${displaySubject(paperConfig)} ${paperConfig.examType}`;
  const ownerId = options.userId ?? 0;
  const guestMode = isGuestUserId(options.userId);

  if (sql && options.userId) {
    try {
      if (!options.userId) throw new Error("Authenticated user is required.");
      await ensureGuestDatabaseUser(options.userId);

      const [, rows] = await sql.transaction((tx) => [
        tx`SELECT pg_advisory_xact_lock(${options.userId})`,
        tx`
          WITH recovered AS (
            UPDATE papers
            SET
              title = ${title},
              class_num = ${paperConfig.classNum},
              subject = ${displaySubject(paperConfig)},
              subject_selections = ${json(paperConfig.subjectSelections ?? null)},
              chapter_ids = ${paperConfig.chapterIds},
              total_marks = ${paperConfig.totalMarks},
              duration = ${paperConfig.duration},
              difficulty = ${paperConfig.difficulty},
              question_types = ${paperConfig.questionTypes},
              type_distribution = ${json(paperConfig.typeDistribution)},
              bloom_distribution = ${json(paperConfig.bloomDistribution)},
              blueprint = ${json(blueprint)},
              status = 'GENERATING',
              error_metadata = NULL,
              is_demo_mode = ${isDemoMode},
              generation_job_id = ${options.generationJobId ?? null},
              updated_at = NOW()
            WHERE user_id = ${options.userId}
            AND idempotency_key = ${options.idempotencyKey ?? null}
            AND (
              status = 'FAILED'
              OR (status = 'GENERATING' AND updated_at < NOW() - INTERVAL '10 minutes')
            )
            RETURNING id, status, false AS reused
          ),
          existing AS (
            SELECT id, status, true AS reused
            FROM papers
            WHERE user_id = ${options.userId}
            AND idempotency_key = ${options.idempotencyKey ?? null}
            AND NOT EXISTS (SELECT 1 FROM recovered)
            LIMIT 1
          ),
          inserted AS (
            INSERT INTO papers (
              user_id, title, class_num, subject, subject_selections, chapter_ids,
              total_marks, duration, difficulty, question_types, type_distribution,
              bloom_distribution, blueprint, status, error_metadata, is_demo_mode,
              generation_job_id, idempotency_key
            )
            SELECT
              ${options.userId}, ${title}, ${paperConfig.classNum}, ${displaySubject(paperConfig)},
              ${json(paperConfig.subjectSelections ?? null)}, ${paperConfig.chapterIds},
              ${paperConfig.totalMarks}, ${paperConfig.duration}, ${paperConfig.difficulty},
              ${paperConfig.questionTypes}, ${json(paperConfig.typeDistribution)},
              ${json(paperConfig.bloomDistribution)}, ${json(blueprint)}, 'GENERATING',
              NULL, ${isDemoMode}, ${options.generationJobId ?? null},
              ${options.idempotencyKey ?? null}
            WHERE NOT EXISTS (SELECT 1 FROM recovered)
            AND NOT EXISTS (SELECT 1 FROM existing)
            ON CONFLICT (user_id, idempotency_key)
            WHERE idempotency_key IS NOT NULL
            DO NOTHING
            RETURNING id, status, false AS reused
          )
          SELECT id, status, reused FROM recovered
          UNION ALL
          SELECT id, status, reused FROM inserted
          UNION ALL
          SELECT id, status, reused FROM existing
          LIMIT 1
        `,
      ]);

      if (!rows[0]?.id) throw new Error("PAPER_CREATION_FAILED");

      return {
        paperId: Number(rows[0].id),
        status: rows[0].status,
        reused: Boolean(rows[0].reused),
      };
    } catch (error) {
      if (!guestMode) throw error;
      console.warn("[paper-store] guest database create failed; using memory store", {
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  if (!isDemoMode && !guestMode) {
    throw new Error("Database is required outside explicit demo mode.");
  }

  const memoryKey = options.idempotencyKey
    ? memoryIdempotencyKey(ownerId, options.idempotencyKey)
    : null;
  const existingPaperId = memoryKey ? memoryPaperIdempotency.get(memoryKey) : undefined;
  const existingPaper = existingPaperId ? memoryPapers.get(existingPaperId) : null;
  const staleGenerating =
    existingPaper?.status === "GENERATING" &&
    Date.now() - Date.parse(existingPaper.createdAt) > 10 * 60 * 1000;

  if (existingPaper && existingPaper.status !== "FAILED" && !staleGenerating) {
    return {
      paperId: existingPaper.id,
      status: existingPaper.status,
      reused: true,
    };
  }

  const id = existingPaperId ?? nextMemoryId();
  enforceGuestPaperLimit(ownerId);
  memoryPapers.set(id, {
    id,
    title,
    config: paperConfig,
    blueprint,
    questions: [],
    isDemoMode,
    status: "GENERATING",
    createdAt: new Date().toISOString(),
    generationJobId: options.generationJobId ?? null,
    idempotencyKey: options.idempotencyKey ?? null,
  });
  memoryPaperOwners.set(id, ownerId);
  if (memoryKey) memoryPaperIdempotency.set(memoryKey, id);

  return { paperId: id, status: "GENERATING", reused: false };
}

export async function saveQuestionsAndLink(
  questions: GeneratedQuestion[],
  paperId: number,
  source: Exclude<ContentSource, "unknown"> = "pdf",
) {
  const normalized = questions.map((question, index) =>
    withNormalizedQuestionOptions({
      ...question,
      orderNum: index + 1,
    }),
  );
  if (!normalized.length) {
    throw new Error("Generated paper must contain at least one question.");
  }

  const existing = memoryPapers.get(paperId);
  if (existing) {
    const withIds = normalized.map((question, index) => ({
      ...question,
      id: question.id ?? paperId * 1000 + index + 1,
    }));

    memoryPapers.set(paperId, {
      ...existing,
      questions: withIds,
      status: "READY",
      errorMetadata: null,
    });

    return withIds;
  }

  if (sql) {
    const transactionResults = await sql.transaction((tx) => [
      tx`
        WITH removed AS (
          DELETE FROM paper_questions
          WHERE paper_id = ${paperId}
          RETURNING question_id
        )
        DELETE FROM questions
        WHERE id IN (SELECT question_id FROM removed)
      `,
      ...normalized.map((question, index) => tx`
        WITH inserted_question AS (
          INSERT INTO questions (
            text, type, difficulty, marks, options, correct_answer, explanation,
            key_points, bloom_level, competency_level, chapter_id, topic_id,
            subject, class_num, scenario, sub_questions, match_pairs,
            diagram_description, assertion, reason, source
          )
          VALUES (
            ${question.text},
            ${question.type},
            ${question.difficulty},
            ${question.marks},
            ${json(question.options ?? null)},
            ${question.correctAnswer},
            ${question.explanation ?? ""},
            ${json(question.keyPoints ?? null)},
            ${question.bloomLevel ?? null},
            ${question.competencyLevel ?? null},
            ${numericId(question.chapterId) ?? null},
            ${numericId(question.topicId) ?? null},
            ${question.subject ?? null},
            ${numericId(question.classNum) ?? null},
            ${question.scenario ?? null},
            ${json(question.subQuestions ?? null)},
            ${json(question.matchPairs ?? null)},
            ${question.diagramDescription ?? null},
            ${question.assertion ?? null},
            ${question.reason ?? null},
            ${source}
          )
          RETURNING id
        )
        INSERT INTO paper_questions (paper_id, question_id, section, order_num)
        SELECT
            ${paperId},
            id,
            ${question.section ?? null},
            ${question.orderNum ?? index + 1}
        FROM inserted_question
        RETURNING question_id AS id
      `),
      tx`
        UPDATE papers
        SET status = 'READY',
            error_metadata = CASE
              WHEN error_metadata IS NULL THEN NULL
              ELSE error_metadata - 'message' - 'error' - 'lastError'
            END,
            updated_at = NOW()
        WHERE id = ${paperId}
        AND EXISTS (
          SELECT 1 FROM paper_questions WHERE paper_id = ${paperId}
        )
        RETURNING id
      `,
    ]);

    const readyRows = transactionResults[transactionResults.length - 1];
    if (!readyRows[0]?.id) {
      throw new Error("Cannot mark a paper READY before questions are saved.");
    }

    const storedQuestions: GeneratedQuestion[] = normalized.map((question, index) => {
      const insertResultIndex = 1 + index;
      return {
        ...question,
        id: Number(transactionResults[insertResultIndex][0].id),
      };
    });

    return storedQuestions;
  }

  throw new Error("Database is required to save generated papers.");
}

export async function markPaperReady(paperId: number) {
  if (memoryPapers.has(paperId)) {
    const existing = memoryPapers.get(paperId);
    if (existing) {
      if (!existing.questions.length) {
        throw new Error("Cannot mark a paper READY before questions are saved.");
      }
      memoryPapers.set(paperId, {
        ...existing,
        status: "READY",
        errorMetadata: null,
      });
    }
    return;
  }

  if (sql) {
    const rows = await sql`
      UPDATE papers
      SET status = 'READY', error_metadata = NULL, updated_at = NOW()
      WHERE id = ${paperId}
      AND EXISTS (
        SELECT 1 FROM paper_questions WHERE paper_id = ${paperId}
      )
      RETURNING id
    `;
    if (!rows[0]?.id) {
      throw new Error("Cannot mark a paper READY before questions are saved.");
    }
    return;
  }

  const existing = memoryPapers.get(paperId);
  if (existing) {
    memoryPapers.set(paperId, {
      ...existing,
      status: "READY",
    });
  }
}

export async function markPaperDemoMode(paperId: number) {
  const existing = memoryPapers.get(paperId);
  if (existing) {
    memoryPapers.set(paperId, {
      ...existing,
      isDemoMode: true,
    });
    return;
  }

  if (sql) {
    await sql`
      UPDATE papers
      SET is_demo_mode = true, updated_at = NOW()
      WHERE id = ${paperId}
    `;
  }
}

export async function setPaperGenerationManifest(
  paperId: number,
  manifest: GenerationManifest,
  normalizedConfig?: PaperConfig,
) {
  const existing = memoryPapers.get(paperId);
  if (existing) {
    memoryPapers.set(paperId, {
      ...existing,
      manifest,
      errorMetadata: {
        ...(existing.errorMetadata ?? {}),
        generationManifest: manifest,
        ...(normalizedConfig ? { normalizedConfig } : {}),
      },
    });
    return;
  }

  if (sql) {
    await sql`
      UPDATE papers
      SET error_metadata = jsonb_strip_nulls(
        COALESCE(error_metadata, '{}'::jsonb) ||
        ${json({
          generationManifest: manifest,
          ...(normalizedConfig ? { normalizedConfig } : {}),
        })}::jsonb
      ),
          updated_at = NOW()
      WHERE id = ${paperId}
    `;
  }
}

export async function setPaperGenerationState(
  paperId: number,
  state: PaperGenerationState,
  normalizedConfig?: PaperConfig,
) {
  const existing = memoryPapers.get(paperId);
  const errorMetadata = {
    ...(existing?.errorMetadata ?? {}),
    generationState: state,
    ...(normalizedConfig ? { normalizedConfig } : {}),
  };

  if (existing) {
    memoryPapers.set(paperId, {
      ...existing,
      status: state.status === "FAILED" ? "FAILED" : "GENERATING",
      errorMetadata,
      generationJobId: state.generationJobId,
      idempotencyKey: state.idempotencyKey,
    });
    return;
  }

  if (sql) {
    await sql`
      UPDATE papers
      SET
        status = ${state.status === "FAILED" ? "FAILED" : "GENERATING"},
        generation_job_id = ${state.generationJobId},
        idempotency_key = COALESCE(idempotency_key, ${state.idempotencyKey}),
        error_metadata = jsonb_strip_nulls(
          COALESCE(error_metadata, '{}'::jsonb) ||
          ${json(errorMetadata)}::jsonb
        ),
        updated_at = NOW()
      WHERE id = ${paperId}
    `;
  }
}

export async function getPaperGenerationState(paperId: number, userId?: number) {
  const paper = await getPaper(paperId, userId);
  const state = paper?.errorMetadata?.generationState;
  return isPaperGenerationState(state) ? state : null;
}

export async function clearPaperGenerationState(paperId: number) {
  const existing = memoryPapers.get(paperId);
  if (existing) {
    const { generationState: _generationState, ...rest } =
      existing.errorMetadata ?? {};
    const nextMetadata = Object.keys(rest).length ? rest : null;
    memoryPapers.set(paperId, {
      ...existing,
      errorMetadata: nextMetadata,
    });
    return;
  }

  if (sql) {
    await sql`
      UPDATE papers
      SET error_metadata = NULLIF(error_metadata - 'generationState', '{}'::jsonb),
          updated_at = NOW()
      WHERE id = ${paperId}
    `;
  }
}

export async function updatePaperStatus(
  paperId: number,
  status: StoredPaper["status"],
  errorMetadata?: Record<string, unknown>,
) {
  const existing = memoryPapers.get(paperId);
  if (existing) {
    memoryPapers.set(paperId, {
      ...existing,
      status,
      errorMetadata: errorMetadata ?? null,
    });
    return;
  }

  if (sql) {
    await sql`
      UPDATE papers
      SET status = ${status}, error_metadata = ${json(errorMetadata ?? null)},
          updated_at = NOW()
      WHERE id = ${paperId}
    `;
    return;
  }

}

export async function updatePaperDefinition(
  paperId: number,
  config: PaperConfig,
  blueprint: Blueprint,
) {
  const existing = memoryPapers.get(paperId);
  if (existing) {
    memoryPapers.set(paperId, {
      ...existing,
      config,
      blueprint,
      title: `Class ${config.classNum} ${displaySubject(config)} ${config.examType}`,
    });
    return;
  }

  if (sql) {
    await sql`
      UPDATE papers
      SET
        subject = ${displaySubject(config)},
        subject_selections = ${json(config.subjectSelections ?? null)},
        chapter_ids = ${config.chapterIds},
        total_marks = ${config.totalMarks},
        question_types = ${config.questionTypes},
        type_distribution = ${json(config.typeDistribution)},
        bloom_distribution = ${json(config.bloomDistribution)},
        blueprint = ${json(blueprint)},
        updated_at = NOW()
      WHERE id = ${paperId}
    `;
  }
}

export async function getPaper(paperId: number, userId?: number) {
  pruneGuestMemory();
  const memoryPaper = memoryPapers.get(paperId);
  if (memoryPaper) {
    const ownerId = memoryPaperOwners.get(paperId);
    if (userId !== undefined && ownerId !== userId) return null;
    return memoryPaper;
  }

  if (!canQueryDatabaseId(paperId)) return null;

  if (sql) {
    const rows = userId
      ? await sql`
        SELECT
          p.id, p.user_id, p.title, p.class_num, p.subject, p.subject_selections,
          p.chapter_ids, p.total_marks, p.duration, p.difficulty, p.question_types,
          p.type_distribution, p.bloom_distribution, p.blueprint, p.status,
          p.error_metadata, p.is_demo_mode, p.generation_job_id, p.idempotency_key,
          p.created_at,
          q.id AS question_id, q.text, q.type, q.difficulty AS q_difficulty,
          q.marks, q.options, q.correct_answer, q.explanation, q.key_points,
          q.bloom_level, q.competency_level, q.chapter_id, q.topic_id,
          q.scenario, q.sub_questions, q.match_pairs, q.diagram_description,
          q.assertion, q.reason,
          pq.section, pq.order_num
        FROM papers p
        LEFT JOIN paper_questions pq ON pq.paper_id = p.id
        LEFT JOIN questions q ON q.id = pq.question_id
        WHERE p.id = ${paperId}
        AND p.user_id = ${userId}
        ORDER BY pq.order_num ASC
      `
      : await sql`
        SELECT
          p.id, p.user_id, p.title, p.class_num, p.subject, p.subject_selections,
          p.chapter_ids, p.total_marks, p.duration, p.difficulty, p.question_types,
          p.type_distribution, p.bloom_distribution, p.blueprint, p.status,
          p.error_metadata, p.is_demo_mode, p.generation_job_id, p.idempotency_key,
          p.created_at,
          q.id AS question_id, q.text, q.type, q.difficulty AS q_difficulty,
          q.marks, q.options, q.correct_answer, q.explanation, q.key_points,
          q.bloom_level, q.competency_level, q.chapter_id, q.topic_id,
          q.scenario, q.sub_questions, q.match_pairs, q.diagram_description,
          q.assertion, q.reason,
          pq.section, pq.order_num
        FROM papers p
        LEFT JOIN paper_questions pq ON pq.paper_id = p.id
        LEFT JOIN questions q ON q.id = pq.question_id
        WHERE p.id = ${paperId}
        ORDER BY pq.order_num ASC
      `;

    if (!rows.length) return null;
    return paperFromRows(rows);
  }

  return memoryPapers.get(paperId) ?? null;
}

export async function getPaperOwnerId(paperId: number) {
  pruneGuestMemory();
  if (memoryPapers.has(paperId)) return memoryPaperOwners.get(paperId) ?? null;

  if (!canQueryDatabaseId(paperId)) return null;

  if (sql) {
    const rows = await sql`
      SELECT user_id
      FROM papers
      WHERE id = ${paperId}
      LIMIT 1
    `;
    return rows[0]?.user_id ? Number(rows[0].user_id) : null;
  }

  const paper = memoryPapers.get(paperId);
  return paper ? (memoryPaperOwners.get(paperId) ?? null) : null;
}

export async function listPapersForUser(userId: number) {
  pruneGuestMemory();
  if (isGuestUserId(userId) && !sql) {
    return Array.from(memoryPapers.values())
      .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))
      .slice(0, 100)
      .map((paper) => ({
        id: paper.id,
        title: paper.title,
        subject: paper.config.subject,
        classNum: paper.config.classNum,
        totalMarks: paper.config.totalMarks,
        duration: paper.config.duration,
        status: paper.status,
        latestAttemptId: null,
        latestPercentage: null,
        isDemoMode: paper.isDemoMode,
        isOwner: memoryPaperOwners.get(paper.id) === userId,
        errorMetadata: paper.errorMetadata ?? null,
        createdAt: paper.createdAt,
      }));
  }

  if (!sql) throw new Error("Database is required to list papers.");

  const rows = await sql`
    SELECT p.id, p.title, p.subject, p.class_num, p.total_marks, p.duration,
           p.status, p.is_demo_mode, p.error_metadata, p.created_at,
           p.user_id,
           latest_attempt.id AS latest_attempt_id,
           latest_attempt.percentage AS latest_percentage
    FROM papers p
    LEFT JOIN LATERAL (
      SELECT id, percentage
      FROM attempts
      WHERE paper_id = p.id
      AND user_id = ${userId}
      AND completed_at IS NOT NULL
      ORDER BY completed_at DESC
      LIMIT 1
    ) latest_attempt ON TRUE
    ORDER BY p.created_at DESC
    LIMIT 100
  `;

  return rows.map((row) => ({
    id: Number(row.id),
    title: row.title,
    subject: row.subject,
    classNum: row.class_num,
    totalMarks: row.total_marks,
    duration: row.duration,
    status: row.status,
    latestAttemptId: row.latest_attempt_id ? Number(row.latest_attempt_id) : null,
    latestPercentage:
      row.latest_percentage === null || row.latest_percentage === undefined
        ? null
        : Math.round(Number(row.latest_percentage)),
    isDemoMode: Boolean(row.is_demo_mode),
    isOwner: Number(row.user_id) === userId,
    errorMetadata: row.error_metadata ?? null,
    createdAt: row.created_at,
  }));
}

export async function deletePaperForUser(paperId: number, userId: number) {
  pruneGuestMemory();
  const memoryPaper = memoryPapers.get(paperId);
  if (memoryPaper) {
    if (memoryPaperOwners.get(paperId) !== userId) return false;
    deleteGuestPaper(paperId);
    return true;
  }

  if (!canQueryDatabaseId(paperId) || !sql) return false;

  const ownerRows = await sql`
    SELECT id
    FROM papers
    WHERE id = ${paperId}
    AND user_id = ${userId}
    LIMIT 1
  `;
  if (!ownerRows[0]?.id) return false;

  await sql.transaction((tx) => [
    tx`DELETE FROM analytics WHERE paper_id = ${paperId}`,
    tx`DELETE FROM attempts WHERE paper_id = ${paperId}`,
    tx`
      WITH removed AS (
        DELETE FROM paper_questions
        WHERE paper_id = ${paperId}
        RETURNING question_id
      )
      DELETE FROM questions
      WHERE id IN (SELECT question_id FROM removed)
    `,
    tx`DELETE FROM papers WHERE id = ${paperId} AND user_id = ${userId}`,
  ]);

  return true;
}

export async function getReusableQuestionsForSection(
  _section: BlueprintSection,
  _config: PaperConfig,
  _options: { source?: Exclude<ContentSource, "unknown"> } = {},
) {
  return [] satisfies GeneratedQuestion[];
}

export async function saveAttemptForUser(
  userId: number,
  paperId: number,
  report: StoredAttempt,
  answers: Record<string, unknown>,
) {
  pruneGuestMemory();
  if (isGuestUserId(userId) && !sql) {
    enforceGuestAttemptLimit(userId);
    const attemptId = nextMemoryId();
    const saved = {
      ...report,
      attemptId,
      createdAt: new Date().toISOString(),
    };
    memoryAttempts.set(attemptId, saved);
    memoryAttemptOwners.set(attemptId, userId);
    return saved;
  }

  if (!sql) throw new Error("Database is required to save attempts.");

  const storedReport = sanitizeAttemptForStorage(report);
  const rows = await sql`
    WITH inserted_attempt AS (
      INSERT INTO attempts (
        paper_id, user_id, answers, score, max_score, percentage, feedback,
        time_taken, completed_at, status, is_demo_mode
      )
      VALUES (
        ${paperId}, ${userId}, ${json(answers)}, ${report.totalScore},
        ${report.maxScore}, ${report.percentage}, ${json(storedReport)},
        ${report.timeTaken}, NOW(), 'COMPLETED', ${report.isDemoMode ?? false}
      )
      RETURNING id, completed_at
    ),
    inserted_analytics AS (
      INSERT INTO analytics (
        user_id, paper_id, attempt_id, weak_topics, strong_topics,
        bloom_scores, competency_score
      )
      SELECT
        ${userId}, ${paperId},
        inserted_attempt.id,
        ${report.weakTopics.map((topic) => topic.topic)},
        ${report.strongTopics.map((topic) => topic.topic)},
        ${json(report.bloomScores)}, ${report.competencyScore}
      FROM inserted_attempt
      RETURNING id
    )
    SELECT id, completed_at FROM inserted_attempt
  `;

  const attempt = rows[0];
  return {
    ...report,
    attemptId: Number(attempt.id),
    createdAt: new Date(attempt.completed_at).toISOString(),
  };
}

export async function saveProgressForUser(
  userId: number,
  paperId: number,
  answers: Record<string, unknown>,
  clientSavedAt?: string,
) {
  const progressAt = normalizedClientSavedAt(clientSavedAt);
  if (isGuestUserId(userId) && !sql) {
    return {
      attemptId: paperId,
      savedAt: progressAt.toISOString(),
    };
  }

  if (!sql) throw new Error("Database is required to save progress.");

  const rows = await sql`
    INSERT INTO attempts (paper_id, user_id, answers, status)
    VALUES (${paperId}, ${userId}, ${json(answers)}, 'IN_PROGRESS')
    ON CONFLICT (paper_id, user_id)
    WHERE status = 'IN_PROGRESS'
    DO UPDATE SET
      answers = CASE
        WHEN attempts.created_at <= ${progressAt.toISOString()}::timestamp
        THEN EXCLUDED.answers
        ELSE attempts.answers
      END,
      created_at = GREATEST(attempts.created_at, ${progressAt.toISOString()}::timestamp)
    RETURNING id, created_at
  `;

  return {
    attemptId: Number(rows[0].id),
    savedAt: new Date(rows[0].created_at).toISOString(),
  };
}

export async function getAttemptForUser(attemptId: number, userId: number) {
  pruneGuestMemory();
  const memoryAttempt = memoryAttempts.get(attemptId);
  if (memoryAttempt) {
    return memoryAttemptOwners.get(attemptId) === userId ? memoryAttempt : null;
  }

  if (!canQueryDatabaseId(attemptId)) return null;

  if (sql) {
    const rows = await sql`
      SELECT id, paper_id, feedback, score, max_score, percentage, time_taken,
             completed_at, is_demo_mode
      FROM attempts
      WHERE id = ${attemptId}
      AND user_id = ${userId}
      AND completed_at IS NOT NULL
      LIMIT 1
    `;

    if (!rows[0]) return null;

    const feedback = (rows[0].feedback as Partial<StoredAttempt> | null) ?? {};
    return {
      ...feedback,
      attemptId: Number(rows[0].id),
      paperId: Number(rows[0].paper_id),
      totalScore: Number(rows[0].score ?? feedback?.totalScore ?? 0),
      maxScore: Number(rows[0].max_score ?? feedback?.maxScore ?? 0),
      percentage: Number(rows[0].percentage ?? feedback?.percentage ?? 0),
      grade: feedback.grade ?? "Needs Practice",
      timeTaken: Number(rows[0].time_taken ?? feedback?.timeTaken ?? 0),
      questionResults: feedback.questionResults ?? [],
      bloomScores: feedback.bloomScores ?? {},
      weakTopics: feedback.weakTopics ?? [],
      strongTopics: feedback.strongTopics ?? [],
      competencyScore: feedback.competencyScore ?? 0,
      recommendations: feedback.recommendations ?? [],
      createdAt: new Date(rows[0].completed_at).toISOString(),
      isDemoMode: Boolean(rows[0].is_demo_mode),
    } satisfies StoredAttempt;
  }

  return null;
}

export async function analyticsSummaryForUser(userId: number) {
  pruneGuestMemory();
  if (isGuestUserId(userId) && !sql) {
    const attempts = Array.from(memoryAttempts.values()).filter(
      (attempt) => memoryAttemptOwners.get(attempt.attemptId) === userId,
    );
    const papers = Array.from(memoryPapers.values()).filter(
      (paper) => memoryPaperOwners.get(paper.id) === userId,
    );
    return {
      papersCreated: papers.length,
      attemptsCompleted: attempts.length,
      averageScore: attempts.length
        ? Math.round(
            attempts.reduce((sum, attempt) => sum + attempt.percentage, 0) /
              attempts.length,
          )
        : 0,
      competencyScore: attempts[0]?.competencyScore ?? 0,
      dayStreak: attempts.length ? 1 : 0,
      recentAttempts: attempts.slice(-10).map((attempt) => ({
        attemptId: attempt.attemptId,
        paperId: attempt.paperId ?? 0,
        title: attempt.paperTitle ?? "Guest paper",
        subject: attempt.subject ?? "Subject",
        classNum: attempt.classNum ?? 10,
        percentage: attempt.percentage,
        completedAt: attempt.createdAt,
      })),
      weakTopicDetails: [],
      subjectCards: [],
      weakTopics: attempts[0]?.weakTopics.map((topic) => topic.topic) ?? [],
      strongTopics: attempts[0]?.strongTopics.map((topic) => topic.topic) ?? [],
      bloomScores: attempts[0]?.bloomScores ?? {},
    };
  }

  if (!sql) throw new Error("Database is required for analytics.");

  const [paperRows, attemptRows, analyticsRows, recentAttemptRows] = await sql.transaction((tx) => [
    tx`
      SELECT COUNT(*)::int AS count
      FROM papers
      WHERE user_id = ${userId}
    `,
    tx`
      SELECT COUNT(*)::int AS count,
             COALESCE(AVG(percentage), 0)::float AS average_score
      FROM attempts
      WHERE user_id = ${userId}
      AND completed_at IS NOT NULL
    `,
    tx`
      SELECT weak_topics, strong_topics, bloom_scores, competency_score
      FROM analytics
      WHERE user_id = ${userId}
      ORDER BY created_at DESC
      LIMIT 50
    `,
    tx`
      SELECT a.id, a.paper_id, a.percentage, a.completed_at,
             p.subject, p.class_num, p.title
      FROM attempts a
      JOIN papers p ON p.id = a.paper_id
      WHERE a.user_id = ${userId}
      AND a.completed_at IS NOT NULL
      ORDER BY a.completed_at DESC
      LIMIT 50
    `,
  ]);

  const latest = analyticsRows[0];
  const weakTopicCounts = new Map<string, { count: number; accuracy: number }>();
  analyticsRows.forEach((row) => {
    (row.weak_topics ?? []).forEach((topic: string, index: number) => {
      const current = weakTopicCounts.get(topic) ?? { count: 0, accuracy: 35 + index * 7 };
      current.count += 1;
      weakTopicCounts.set(topic, current);
    });
  });

  const subjectMap = new Map<string, { scores: number[]; tests: number }>();
  recentAttemptRows.forEach((row) => {
    const subject = row.subject ?? "Subject";
    const current = subjectMap.get(subject) ?? { scores: [], tests: 0 };
    current.tests += 1;
    current.scores.push(Math.round(Number(row.percentage ?? 0)));
    subjectMap.set(subject, current);
  });

  return {
    papersCreated: Number(paperRows[0]?.count ?? 0),
    attemptsCompleted: Number(attemptRows[0]?.count ?? 0),
    averageScore: Math.round(Number(attemptRows[0]?.average_score ?? 0)),
    competencyScore: Math.round(Number(latest?.competency_score ?? 0)),
    dayStreak: Number(attemptRows[0]?.count ?? 0) ? 1 : 0,
    recentAttempts: recentAttemptRows
      .slice(0, 10)
      .reverse()
      .map((row) => ({
        attemptId: Number(row.id),
        paperId: Number(row.paper_id),
        title: row.title,
        subject: row.subject,
        classNum: row.class_num,
        percentage: Math.round(Number(row.percentage ?? 0)),
        completedAt: new Date(row.completed_at).toISOString(),
      })),
    weakTopicDetails: Array.from(weakTopicCounts.entries())
      .map(([topic, value]) => ({
        topic,
        accuracy: Math.max(20, Math.min(49, value.accuracy)),
        attempts: value.count,
      }))
      .sort((left, right) => right.attempts - left.attempts)
      .slice(0, 6),
    subjectCards: Array.from(subjectMap.entries()).map(([subject, value]) => ({
      subject,
      tests: value.tests,
      average: Math.round(
        value.scores.reduce((sum, score) => sum + score, 0) /
          Math.max(1, value.scores.length),
      ),
      scores: value.scores.slice(0, 5).reverse(),
    })),
    weakTopics: latest?.weak_topics ?? [],
    strongTopics: latest?.strong_topics ?? [],
    bloomScores: latest?.bloom_scores ?? {},
  };
}

function paperFromRows(rows: any[]): StoredPaper {
  const first = rows[0];
  const errorMetadata = first.error_metadata ?? null;
  const persistedConfig = normalizedConfigFromMetadata(errorMetadata);
  const subjectSelections = first.subject_selections ?? undefined;
  const subjects =
    Array.isArray(subjectSelections) && subjectSelections.length
      ? subjectSelections.map((selection) => selection.subject)
      : String(first.subject).split(" + ");
  const questionRows = rows.filter((row) => row.question_id);
  const fallbackConfig: PaperConfig = {
    classNum: first.class_num,
    subject: first.subject,
    subjects,
    subjectSelections,
    chapterIds: first.chapter_ids ?? [],
    totalMarks: first.total_marks,
    duration: first.duration,
    examType: "Generated",
    difficulty: first.difficulty,
    questionTypes: first.question_types ?? [],
    typeDistribution: first.type_distribution ?? {},
    bloomDistribution: first.bloom_distribution ?? {},
    totalQuestions: questionRows.length,
  };
  const config: PaperConfig = persistedConfig
    ? {
        ...fallbackConfig,
        ...persistedConfig,
        totalMarks: first.total_marks,
        totalQuestions: questionRows.length || persistedConfig.totalQuestions,
      }
    : fallbackConfig;

  return {
    id: Number(first.id),
    title: first.title,
    config,
    blueprint: first.blueprint,
    isDemoMode: Boolean(first.is_demo_mode),
    status: first.status,
    createdAt: new Date(first.created_at).toISOString(),
    errorMetadata,
    manifest: generationManifestFromMetadata(errorMetadata),
    generationJobId: first.generation_job_id ?? null,
    idempotencyKey: first.idempotency_key ?? null,
    questions: questionRows.map((row) =>
      withNormalizedQuestionOptions({
        id: Number(row.question_id),
        text: row.text,
        type: row.type,
        difficulty: row.q_difficulty,
        marks: row.marks,
        options: row.options ?? undefined,
        correctAnswer: row.correct_answer,
        explanation: row.explanation,
        keyPoints: row.key_points ?? undefined,
        bloomLevel: row.bloom_level,
        competencyLevel: row.competency_level,
        chapterId: row.chapter_id ? Number(row.chapter_id) : undefined,
        topicId: row.topic_id ? Number(row.topic_id) : undefined,
        scenario: row.scenario ?? undefined,
        subQuestions: row.sub_questions ?? undefined,
        matchPairs: row.match_pairs ?? undefined,
        diagramDescription: row.diagram_description ?? undefined,
        assertion: row.assertion ?? undefined,
        reason: row.reason ?? undefined,
        section: row.section,
        orderNum: row.order_num,
      }),
    ),
  };
}

function isPaperGenerationState(value: unknown): value is PaperGenerationState {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Partial<PaperGenerationState>;
  return (
    record.version === 1 &&
    typeof record.sourceContextHash === "string" &&
    Array.isArray(record.candidateQuestions) &&
    Array.isArray(record.acceptedQuestions) &&
    Array.isArray(record.missingSections) &&
    typeof record.readyQuestionCount === "number" &&
    typeof record.targetQuestionCount === "number"
  );
}

function displaySubject(config: PaperConfig) {
  return config.subjects?.length ? config.subjects.join(" + ") : config.subject;
}

function normalizedConfigFromMetadata(metadata: unknown): PaperConfig | null {
  if (!metadata || typeof metadata !== "object") return null;
  const config = (metadata as { normalizedConfig?: unknown }).normalizedConfig;
  if (!config || typeof config !== "object") return null;
  const record = config as Partial<PaperConfig>;
  if (
    typeof record.classNum !== "number" ||
    typeof record.subject !== "string" ||
    !Array.isArray(record.chapterIds) ||
    typeof record.totalMarks !== "number" ||
    typeof record.duration !== "number" ||
    typeof record.examType !== "string" ||
    typeof record.difficulty !== "string" ||
    !Array.isArray(record.questionTypes) ||
    typeof record.typeDistribution !== "object" ||
    typeof record.bloomDistribution !== "object" ||
    typeof record.totalQuestions !== "number"
  ) {
    return null;
  }

  return record as PaperConfig;
}

function json(value: unknown) {
  return JSON.stringify(value);
}

function numericId(value: unknown) {
  const numberValue = Number(value);
  return Number.isInteger(numberValue) && numberValue > 0 ? numberValue : undefined;
}

function nextMemoryId() {
  const next = (globalForPapers.__edutestMemorySequence ?? 0) + 1;
  globalForPapers.__edutestMemorySequence = next;
  return Date.now() * 1000 + (next % 1000);
}

function canQueryDatabaseId(id: number) {
  return Number.isInteger(id) && id > 0 && id <= maxDatabaseIntegerId;
}

function memoryIdempotencyKey(userId: number, idempotencyKey: string) {
  return `${userId}:${idempotencyKey}`;
}

function pruneGuestMemory() {}

async function ensureGuestDatabaseUser(userId: number) {
  if (!sql || !isGuestUserId(userId)) return;

  await sql`
    INSERT INTO users (id, email, name)
    VALUES (${userId}, ${guestEmail(userId)}, 'Guest')
    ON CONFLICT (id) DO UPDATE
    SET name = COALESCE(users.name, EXCLUDED.name)
  `;
}

function guestEmail(userId: number) {
  return `guest-${Math.abs(userId)}@edutest.local`;
}

function enforceGuestPaperLimit(ownerId: number) {
  if (!isGuestUserId(ownerId)) return;
  const owned = Array.from(memoryPapers.values())
    .filter((paper) => memoryPaperOwners.get(paper.id) === ownerId)
    .sort((left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt));

  while (owned.length >= maxGuestPapersPerSession) {
    const oldest = owned.shift();
    if (!oldest) break;
    deleteGuestPaper(oldest.id);
  }
}

function enforceGuestAttemptLimit(ownerId: number) {
  if (!isGuestUserId(ownerId)) return;
  const owned = Array.from(memoryAttempts.values())
    .filter((attempt) => memoryAttemptOwners.get(attempt.attemptId) === ownerId)
    .sort((left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt));

  while (owned.length >= maxGuestAttemptsPerSession) {
    const oldest = owned.shift();
    if (!oldest) break;
    memoryAttempts.delete(oldest.attemptId);
    memoryAttemptOwners.delete(oldest.attemptId);
  }
}

function deleteGuestPaper(paperId: number) {
  const ownerId = memoryPaperOwners.get(paperId);
  const paper = memoryPapers.get(paperId);
  memoryPapers.delete(paperId);
  memoryPaperOwners.delete(paperId);

  if (paper?.idempotencyKey && ownerId !== undefined) {
    memoryPaperIdempotency.delete(memoryIdempotencyKey(ownerId, paper.idempotencyKey));
  }
}

function positiveEnvNumber(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function normalizedClientSavedAt(value?: string) {
  const now = Date.now();
  const parsed = value ? Date.parse(value) : now;
  const min = now - 24 * 60 * 60 * 1000;
  const max = now + 5 * 60 * 1000;

  if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
    return new Date(now);
  }

  return new Date(parsed);
}

function sanitizeAttemptForStorage(report: StoredAttempt): StoredAttempt {
  return {
    ...report,
    questionResults: report.questionResults.map((result) => ({
      ...result,
      questionText: undefined,
      correctAnswer: "",
    })),
  };
}
