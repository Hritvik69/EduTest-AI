import sql from "@/lib/db";
import { isGuestUserId } from "@/lib/api-security";
import type {
  ConceptData,
  ExtractedConceptTopic,
  UploadedPdfSourceSummary,
} from "@/types";

interface StoreUploadedPdfSourceInput {
  userId: number;
  fileName: string;
  title: string;
  subject?: string;
  classNum?: number;
  focusPrompt?: string;
  contentHash?: string;
  extractionMethod?: UploadedPdfSourceSummary["extractionMethod"];
  wordCount: number;
  importantTopics: string[];
  topics: ExtractedConceptTopic[];
}

interface UploadedPdfConceptRow {
  topic_name: string;
  importance: string;
  text: string;
  type: string;
  bloom_level: string;
  hots_potential: boolean;
  sort_order: number;
}

const globalForPdfSources = globalThis as typeof globalThis & {
  __edutestPdfSources?: Map<
    number,
    { source: UploadedPdfSourceSummary; concepts: ConceptData[] }
  >;
  __edutestPdfSourceOwners?: Map<number, number>;
  __edutestPdfSourceSequence?: number;
};

const memoryPdfSources =
  globalForPdfSources.__edutestPdfSources ??
  new Map<number, { source: UploadedPdfSourceSummary; concepts: ConceptData[] }>();
globalForPdfSources.__edutestPdfSources = memoryPdfSources;

const memoryPdfSourceOwners =
  globalForPdfSources.__edutestPdfSourceOwners ?? new Map<number, number>();
globalForPdfSources.__edutestPdfSourceOwners = memoryPdfSourceOwners;

const guestPdfSourceTtlMs = positiveEnvNumber(
  "EDUTEST_GUEST_DATA_TTL_MS",
  6 * 60 * 60 * 1000,
);
const maxGuestPdfSourcesPerSession = positiveEnvNumber(
  "EDUTEST_MAX_GUEST_PDF_SOURCES",
  10,
);

export async function storeUploadedPdfSource(
  input: StoreUploadedPdfSourceInput,
): Promise<UploadedPdfSourceSummary> {
  pruneGuestPdfSources();
  const conceptRows = flattenConceptRows(input.topics);
  if (!conceptRows.length) {
    throw new Error("Uploaded PDF did not produce enough valid concepts to store.");
  }
  const topicNames = unique([
    ...input.importantTopics,
    ...input.topics.map((topic) => topic.name),
  ]).slice(0, 24);

  if (isGuestUserId(input.userId) && !sql) {
    enforceGuestPdfSourceLimit(input.userId);
    const sourceId = nextMemoryPdfSourceId();
    const source: UploadedPdfSourceSummary = {
      id: sourceId,
      title: input.title,
      subject: input.subject || undefined,
      classNum: input.classNum,
      fileName: input.fileName,
      focusPrompt: input.focusPrompt || undefined,
      contentHash: input.contentHash || undefined,
      extractionMethod: input.extractionMethod,
      wordCount: input.wordCount,
      conceptsCount: conceptRows.length,
      topics: topicNames,
      createdAt: new Date().toISOString(),
    };
    memoryPdfSources.set(sourceId, {
      source,
      concepts: conceptRows.map((row) => ({
        text: row.text,
        type: row.type,
        bloomLevel: row.bloom_level,
        hotsPotential: row.hots_potential,
        hotsPoential: row.hots_potential,
        topicName: row.topic_name,
        chapterId: sourceId,
        source: "pdf",
      })),
    });
    memoryPdfSourceOwners.set(sourceId, input.userId);
    return source;
  }

  if (!sql) {
    throw new Error("Database is required to store uploaded PDF concepts.");
  }

  await ensureGuestDatabaseUser(input.userId);
  await pruneGuestDatabasePdfSources(input.userId, {
    keepNewest: Math.max(0, maxGuestPdfSourcesPerSession - 1),
  });

  const rows = await sql`
    WITH inserted_source AS (
      INSERT INTO uploaded_pdf_sources (
        user_id, file_name, title, subject, class_num, word_count,
        topics_summary, concepts_count, status
      )
      VALUES (
        ${input.userId}, ${input.fileName}, ${input.title},
        ${input.subject || null}, ${input.classNum ?? null}, ${input.wordCount},
        ${json(pdfSourceMetadata(topicNames, input))}, ${conceptRows.length}, 'READY'
      )
      RETURNING id, created_at
    ),
    inserted_concepts AS (
      INSERT INTO uploaded_pdf_concepts (
        source_id, topic_name, importance, text, type, bloom_level,
        hots_potential, sort_order
      )
      SELECT
        inserted_source.id,
        topic_name, importance, text, type, bloom_level,
        hots_potential, sort_order
      FROM inserted_source
      CROSS JOIN jsonb_to_recordset(${json(conceptRows)}::jsonb)
        AS item(
          topic_name text,
          importance text,
          text text,
          type text,
          bloom_level text,
          hots_potential boolean,
          sort_order int
        )
      RETURNING id
    )
    SELECT id, created_at FROM inserted_source
  `;
  const sourceRow = rows[0];
  const sourceId = Number(sourceRow.id);

  return {
    id: sourceId,
    title: input.title,
    subject: input.subject || undefined,
    classNum: input.classNum,
    fileName: input.fileName,
    focusPrompt: input.focusPrompt || undefined,
    contentHash: input.contentHash || undefined,
    extractionMethod: input.extractionMethod,
    wordCount: input.wordCount,
    conceptsCount: conceptRows.length,
    topics: topicNames,
    createdAt: new Date(sourceRow.created_at).toISOString(),
  };
}

export async function findUploadedPdfSourceByContentHash(
  userId: number,
  contentHash: string,
  focusPrompt = "",
): Promise<UploadedPdfSourceSummary | null> {
  pruneGuestPdfSources();
  const normalizedFocusPrompt = focusPrompt.trim();

  if (isGuestUserId(userId) && !sql) {
    const stored = Array.from(memoryPdfSources.values())
      .filter((candidate) => memoryPdfSourceOwners.get(candidate.source.id) === userId)
      .find(
        (candidate) =>
          candidate.source.contentHash === contentHash &&
          (candidate.source.focusPrompt ?? "") === normalizedFocusPrompt,
      );
    return stored ? withCachedExtractionMethod(stored.source) : null;
  }

  if (!sql) return null;
  await pruneGuestDatabasePdfSources(userId);

  const rows = await sql`
    SELECT id, title, subject, class_num, file_name, word_count,
           concepts_count, topics_summary, created_at
    FROM uploaded_pdf_sources
    WHERE user_id = ${userId}
    AND status = 'READY'
    AND topics_summary->>'contentHash' = ${contentHash}
    AND COALESCE(topics_summary->>'focusPrompt', '') = ${normalizedFocusPrompt}
    ORDER BY created_at DESC
    LIMIT 1
  `;
  const source = rows[0];
  if (!source) return null;

  const metadata = parsePdfSourceMetadata(source.topics_summary);
  return withCachedExtractionMethod({
    id: Number(source.id),
    title: source.title,
    subject: source.subject ?? undefined,
    classNum: source.class_num ? Number(source.class_num) : undefined,
    fileName: source.file_name ?? undefined,
    focusPrompt: metadata.focusPrompt || undefined,
    contentHash: metadata.contentHash || undefined,
    extractionMethod: metadata.extractionMethod,
    wordCount: Number(source.word_count ?? 0),
    conceptsCount: Number(source.concepts_count ?? 0),
    topics: metadata.topics,
    createdAt: new Date(source.created_at).toISOString(),
  });
}

export async function getUploadedPdfSourceConcepts(
  sourceId: number,
  userId: number,
) {
  pruneGuestPdfSources();
  if (isGuestUserId(userId) && !sql) {
    return memoryPdfSourceOwners.get(sourceId) === userId
      ? (memoryPdfSources.get(sourceId) ?? null)
      : null;
  }

  if (!sql) {
    throw new Error("Database is required to load uploaded PDF concepts.");
  }
  await pruneGuestDatabasePdfSources(userId);

  const sourceRows = await sql`
    SELECT id, title, subject, class_num, file_name, word_count,
           concepts_count, topics_summary, created_at
    FROM uploaded_pdf_sources
    WHERE id = ${sourceId}
    AND user_id = ${userId}
    AND status = 'READY'
    LIMIT 1
  `;
  const source = sourceRows[0];
  if (!source) return null;

  const conceptRows = await sql`
    SELECT topic_name, text, type, bloom_level, hots_potential
    FROM uploaded_pdf_concepts
    WHERE source_id = ${sourceId}
    ORDER BY sort_order ASC, id ASC
  `;

  const metadata = parsePdfSourceMetadata(source.topics_summary);
  const topics = metadata.topics.length
    ? metadata.topics
    : unique(conceptRows.map((row) => String(row.topic_name || "General")));

  const summary: UploadedPdfSourceSummary = {
    id: Number(source.id),
    title: source.title,
    subject: source.subject ?? undefined,
    classNum: source.class_num ? Number(source.class_num) : undefined,
    fileName: source.file_name ?? undefined,
    focusPrompt: metadata.focusPrompt || undefined,
    contentHash: metadata.contentHash || undefined,
    extractionMethod: metadata.extractionMethod,
    wordCount: Number(source.word_count ?? 0),
    conceptsCount: Number(source.concepts_count ?? conceptRows.length),
    topics,
    createdAt: new Date(source.created_at).toISOString(),
  };

  const concepts = conceptRows.map((row) => ({
    text: row.text,
    type: row.type ?? "FACT",
    bloomLevel: row.bloom_level ?? "UNDERSTAND",
    hotsPotential: Boolean(row.hots_potential),
    hotsPoential: Boolean(row.hots_potential),
    topicName: row.topic_name ?? "General",
    chapterId: sourceId,
    source: "pdf",
  })) satisfies ConceptData[];

  return { source: summary, concepts };
}

function flattenConceptRows(topics: ExtractedConceptTopic[]) {
  const rows: UploadedPdfConceptRow[] = [];
  const seen = new Set<string>();

  topics.slice(0, 40).forEach((topic) => {
    topic.concepts.slice(0, 80).forEach((concept) => {
      if (!concept.text?.trim() || rows.length >= 1000) return;
      const key = conceptKey(topic.name, concept.text);
      if (seen.has(key)) return;
      seen.add(key);
      rows.push({
        topic_name: topic.name.slice(0, 500),
        importance: normalizedImportance(topic.importance),
        text: concept.text.slice(0, 8000),
        type: normalizedConceptType(concept.type),
        bloom_level: normalizedBloomLevel(concept.bloom_level),
        hots_potential: concept.hots_potential,
        sort_order: rows.length,
      });
    });

    [
      ...(topic.key_formulas ?? []).map((text) => ({ text, type: "FORMULA" })),
      ...(topic.key_experiments ?? []).map((text) => ({ text, type: "EXPERIMENT" })),
      ...(topic.real_life_applications ?? []).map((text) => ({
        text,
        type: "APPLICATION",
      })),
      ...(topic.common_misconceptions ?? []).map((text) => ({ text, type: "FACT" })),
    ].forEach((item) => {
      if (!item.text?.trim() || rows.length >= 1000) return;
      const key = conceptKey(topic.name, item.text);
      if (seen.has(key)) return;
      seen.add(key);
      rows.push({
        topic_name: topic.name.slice(0, 500),
        importance: normalizedImportance(topic.importance),
        text: item.text.slice(0, 8000),
        type: normalizedConceptType(item.type),
        bloom_level: item.type === "APPLICATION" ? "APPLY" : "UNDERSTAND",
        hots_potential: item.type === "APPLICATION",
        sort_order: rows.length,
      });
    });
  });

  return rows;
}

function unique(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function json(value: unknown) {
  return JSON.stringify(value);
}

function pdfSourceMetadata(
  topics: string[],
  input: Pick<
    StoreUploadedPdfSourceInput,
    "focusPrompt" | "contentHash" | "extractionMethod"
  >,
) {
  return {
    topics,
    focusPrompt: input.focusPrompt || "",
    contentHash: input.contentHash || "",
    extractionMethod: input.extractionMethod || "AI",
  };
}

function parsePdfSourceMetadata(value: unknown) {
  if (Array.isArray(value)) {
    return {
      topics: value.map(String).filter(Boolean),
      focusPrompt: "",
      contentHash: "",
      extractionMethod: undefined,
    };
  }

  if (!value || typeof value !== "object") {
    return {
      topics: [] as string[],
      focusPrompt: "",
      contentHash: "",
      extractionMethod: undefined,
    };
  }

  const record = value as Record<string, unknown>;
  return {
    topics: Array.isArray(record.topics)
      ? record.topics.map(String).filter(Boolean)
      : [],
    focusPrompt:
      typeof record.focusPrompt === "string" ? record.focusPrompt : "",
    contentHash:
      typeof record.contentHash === "string" ? record.contentHash : "",
    extractionMethod: normalizedExtractionMethod(record.extractionMethod),
  };
}

function normalizedExtractionMethod(
  value: unknown,
): UploadedPdfSourceSummary["extractionMethod"] {
  return value === "AI" ||
    value === "LOCAL_FALLBACK" ||
    value === "CACHED_AI" ||
    value === "CACHED_LOCAL_FALLBACK"
    ? value
    : undefined;
}

function withCachedExtractionMethod(
  source: UploadedPdfSourceSummary,
): UploadedPdfSourceSummary {
  const extractionMethod =
    source.extractionMethod === "LOCAL_FALLBACK" ||
    source.extractionMethod === "CACHED_LOCAL_FALLBACK"
      ? "CACHED_LOCAL_FALLBACK"
      : "CACHED_AI";

  return {
    ...source,
    extractionMethod,
  };
}

function nextMemoryPdfSourceId() {
  const next = (globalForPdfSources.__edutestPdfSourceSequence ?? 0) + 1;
  globalForPdfSources.__edutestPdfSourceSequence = next;
  return Date.now() * 1000 + (next % 1000);
}

function conceptKey(topicName: string, text: string) {
  return `${topicName.trim().toLowerCase()}:${text.trim().toLowerCase()}`;
}

function normalizedImportance(value: string) {
  return value === "LOW" || value === "MEDIUM" || value === "HIGH" ? value : "MEDIUM";
}

function normalizedConceptType(value: string) {
  return [
    "DEFINITION",
    "FORMULA",
    "EXPERIMENT",
    "EXAMPLE",
    "APPLICATION",
    "ACTIVITY",
    "FACT",
  ].includes(value)
    ? value
    : "FACT";
}

function normalizedBloomLevel(value: string) {
  return [
    "REMEMBER",
    "UNDERSTAND",
    "APPLY",
    "ANALYZE",
    "EVALUATE",
    "CREATE",
  ].includes(value)
    ? value
    : "UNDERSTAND";
}

function pruneGuestPdfSources(now = Date.now()) {
  for (const [sourceId, stored] of Array.from(memoryPdfSources.entries())) {
    const ownerId = memoryPdfSourceOwners.get(sourceId);
    if (!isGuestUserId(ownerId)) continue;
    if (now - Date.parse(stored.source.createdAt ?? "") <= guestPdfSourceTtlMs) {
      continue;
    }
    memoryPdfSources.delete(sourceId);
    memoryPdfSourceOwners.delete(sourceId);
  }
}

function enforceGuestPdfSourceLimit(ownerId: number) {
  if (!isGuestUserId(ownerId)) return;
  const owned = Array.from(memoryPdfSources.values())
    .filter((stored) => memoryPdfSourceOwners.get(stored.source.id) === ownerId)
    .sort(
      (left, right) =>
        Date.parse(left.source.createdAt ?? "") -
        Date.parse(right.source.createdAt ?? ""),
    );

  while (owned.length >= maxGuestPdfSourcesPerSession) {
    const oldest = owned.shift();
    if (!oldest) break;
    memoryPdfSources.delete(oldest.source.id);
    memoryPdfSourceOwners.delete(oldest.source.id);
  }
}

function positiveEnvNumber(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

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

async function pruneGuestDatabasePdfSources(
  userId: number,
  options: { keepNewest?: number } = {},
) {
  if (!sql || !isGuestUserId(userId)) return;

  const cutoff = new Date(Date.now() - guestPdfSourceTtlMs).toISOString();
  await sql`
    DELETE FROM uploaded_pdf_sources
    WHERE user_id = ${userId}
    AND created_at < ${cutoff}::timestamp
  `;

  const keepNewest = options.keepNewest ?? maxGuestPdfSourcesPerSession;
  if (keepNewest < 0) return;
  await sql`
    DELETE FROM uploaded_pdf_sources
    WHERE id IN (
      SELECT id
      FROM uploaded_pdf_sources
      WHERE user_id = ${userId}
      ORDER BY created_at DESC, id DESC
      OFFSET ${keepNewest}
    )
  `;
}
