import type { GeneratedQuestion, PaperConfig } from "@/types";

/**
 * Cross-paper dedup store.
 *
 * The goal is simple: every click of "Generate paper" must produce fresh
 * questions — never repeat a question stem (or its near-paraphrase) that
 * was emitted in a recent paper for the same class + subject + chapter.
 *
 * Two layers of storage:
 *
 * 1. **In-memory ring** — kept on globalThis so it survives across hot
 *    reloads inside a single Node process. Holds the last
 *    {@link maxInMemoryFingerprints} entries per configKey.
 * 2. **Persistence** — the DB-backed {@link persistFingerprintSnapshot}
 *    function writes a compact JSON snapshot alongside the paper so the
 *    fingerprint survives serverless cold starts.
 *
 * The in-memory ring is what the generation pipeline reads for dedup
 * during a session; the persisted snapshot is what gets loaded back when
 * the function cold-starts.
 */

const globalForFingerprints = globalThis as typeof globalThis & {
  __edutestFingerprints?: Map<string, PaperFingerprintEntry[]>;
  __edutestFingerprintSequences?: Map<string, number>;
  __edutestFingerprintPruneAt?: number; // last prune timestamp
};

/**
 * Fingerprint entries older than this are considered stale and pruned.
 * Default: 7 days.  Configurable via EDUTEST_FINGERPRINT_MAX_AGE_DAYS env var.
 */
function maxFingerprintAgeMs(): number {
  const days = Math.floor(
    Number(process.env["EDUTEST_FINGERPRINT_MAX_AGE_DAYS"] ?? "7"),
  );
  return Math.max(1, days) * 86_400_000;
}

export const MAX_IN_MEMORY_FINGERPRINTS = 50;
export const MAX_ANTI_REPEAT_STEMS_INJECTED = 80;

export type PaperFingerprintEntry = {
  paperId: number | string;
  createdAt: string;
  configKey: string;
  stems: string[];
  /** Lightweight type/subject/chapter tags for diagnostics. */
  tags: {
    classNum: number;
    subject: string;
    chapterIds: number[];
    difficulty: string;
  };
};

function fingerprintStore() {
  if (!globalForFingerprints.__edutestFingerprints) {
    globalForFingerprints.__edutestFingerprints = new Map();
  }
  return globalForFingerprints.__edutestFingerprints;
}

function fingerprintSequences() {
  if (!globalForFingerprints.__edutestFingerprintSequences) {
    globalForFingerprints.__edutestFingerprintSequences = new Map();
  }
  return globalForFingerprints.__edutestFingerprintSequences;
}

/**
 * Stable key for grouping fingerprints. Same subject + class + chapters +
 * difficulty + question-types = same "config" for dedup purposes.
 */
export function configFingerprintKey(config: PaperConfig): string {
  const classNum = config.classNum ?? 0;
  const subjects = (config.subjects ?? [config.subject]).join("|").toLowerCase();
  const chapters = (config.subjectSelections ?? [])
    .flatMap((selection) =>
      (selection.chapterIds ?? []).map((id) => `${selection.subject.toLowerCase()}:${id}`),
    )
    .concat((config.chapterIds ?? []).map((id) => `:${id}`))
    .sort()
    .join("|");
  const difficulty = (config.difficulty ?? "MEDIUM").toUpperCase();
  const types = (config.questionTypes ?? [])
    .map((type) => String(type).toUpperCase())
    .sort()
    .join("|");
  return `${classNum}|${subjects}|${chapters}|${difficulty}|${types}`;
}

/**
 * Extract the question stems + concept angles from a finished paper so we
 * can refuse to regenerate them later.
 */
export function fingerprintForPaper(
  paperId: number | string,
  config: PaperConfig,
  questions: GeneratedQuestion[],
): PaperFingerprintEntry {
  const seen = new Set<string>();
  const stems: string[] = [];
  for (const question of questions) {
    const raw = (question.text ?? "").replace(/\s+/g, " ").trim();
    if (!raw) continue;
    const key = raw.toLowerCase().slice(0, 80);
    if (seen.has(key)) continue;
    seen.add(key);
    const trimmed = raw.length > 160 ? `${raw.slice(0, 157)}...` : raw;
    stems.push(trimmed);
  }

  return {
    paperId,
    createdAt: new Date().toISOString(),
    configKey: configFingerprintKey(config),
    stems,
    tags: {
      classNum: config.classNum ?? 0,
      subject: config.subject ?? (config.subjects ?? []).join(" + "),
      chapterIds: (config.subjectSelections ?? []).flatMap(
        (selection) => selection.chapterIds ?? [],
      ).concat(config.chapterIds ?? []),
      difficulty: config.difficulty ?? "MEDIUM",
    },
  };
}

/**
 * Record a freshly-generated paper so subsequent generations can avoid
 * repeating its questions. Caps each config bucket at
 * {@link MAX_IN_MEMORY_FINGERPRINTS} entries and evicts entries older
 * than the configured TTL (default 7 days).
 */
export function recordPaperFingerprint(entry: PaperFingerprintEntry): void {
  pruneExpiredFingerprints(); // lazy, rate-limited to once per minute
  const store = fingerprintStore();
  const cutoff = Date.now() - maxFingerprintAgeMs();
  let list = store.get(entry.configKey) ?? [];

  // Prune entries older than the TTL
  if (list.length > 0) {
    const before = list.length;
    list = list.filter((e) => Date.parse(e.createdAt) > cutoff);
    if (list.length < before) {
      if (list.length === 0) {
        store.delete(entry.configKey);
        return;
      } else {
        store.set(entry.configKey, list);
      }
    }
  }

  list.push(entry);
  while (list.length > MAX_IN_MEMORY_FINGERPRINTS) {
    list.shift();
  }
  store.set(entry.configKey, list);
}

/**
 * Merge a persisted fingerprint snapshot (e.g. recovered from
 * error_metadata.generationFingerprints) into the in-memory ring.
 */
export function loadFingerprintSnapshot(snapshot: unknown): void {
  if (!snapshot || typeof snapshot !== "object") return;
  const entries = (snapshot as { entries?: unknown }).entries;
  if (!Array.isArray(entries)) return;
  for (const raw of entries) {
    if (!raw || typeof raw !== "object") continue;
    const candidate = raw as Partial<PaperFingerprintEntry>;
    if (
      typeof candidate.configKey !== "string" ||
      !Array.isArray(candidate.stems) ||
      typeof candidate.createdAt !== "string"
    ) {
      continue;
    }
    const stems = candidate.stems.filter(
      (value): value is string => typeof value === "string" && value.trim().length > 0,
    );
    if (!stems.length) continue;
    recordPaperFingerprint({
      paperId: candidate.paperId ?? `snapshot-${stems.length}`,
      createdAt: candidate.createdAt,
      configKey: candidate.configKey,
      stems,
      tags: candidate.tags ?? {
        classNum: 0,
        subject: "",
        chapterIds: [],
        difficulty: "MEDIUM",
      },
    });
  }
}

/**
 * Return anti-repeat stems for the next generation request. Pass the
 * candidate config so we only block stems from recent papers with the
 * same config fingerprint.
 */
export function getAntiRepeatStemsForConfig(
  config: PaperConfig,
  limit = MAX_ANTI_REPEAT_STEMS_INJECTED,
): string[] {
  const key = configFingerprintKey(config);
  const store = fingerprintStore();
  const entries = store.get(key) ?? [];
  if (!entries.length) return [];

  // Walk newest-first so the most recent paper's stems get priority
  const collected: string[] = [];
  const seen = new Set<string>();
  for (let i = entries.length - 1; i >= 0 && collected.length < limit; i--) {
    const stems = entries[i]?.stems ?? [];
    for (const stem of stems) {
      if (collected.length >= limit) break;
      const fingerprint = stem.toLowerCase().slice(0, 80);
      if (seen.has(fingerprint)) continue;
      seen.add(fingerprint);
      collected.push(stem);
    }
  }
  // Restore oldest-first chronological order for readability
  return collected.reverse();
}

/**
 * Convenience wrapper: feed a fingerprint snapshot into the store at the
 * start of generation so the next batch is aware of past papers.
 */
export function primeFingerprintStoreFromSnapshots(
  snapshots: Array<unknown | null | undefined>,
): void {
  for (const snapshot of snapshots) {
    if (snapshot) loadFingerprintSnapshot(snapshot);
  }
}

/**
 * Produce a JSON-serialisable snapshot of the in-memory fingerprint
 * store. Caller persists this alongside the paper so cold-starts can
 * recover dedup history.
 */
export function exportFingerprintSnapshot(): {
  version: 1;
  capturedAt: string;
  entries: PaperFingerprintEntry[];
} {
  const store = fingerprintStore();
  const entries: PaperFingerprintEntry[] = [];
  store.forEach((bucket) => {
    for (const entry of bucket) entries.push(entry);
  });
  return {
    version: 1,
    capturedAt: new Date().toISOString(),
    entries,
  };
}

export function nextFingerprintSequence(configKey: string): number {
  const sequences = fingerprintSequences();
  const next = (sequences.get(configKey) ?? 0) + 1;
  sequences.set(configKey, next);
  return next;
}

/**
 * Prune all fingerprint buckets of entries older than the configured TTL.
 * Called lazily from recordPaperFingerprint to avoid scanning on every read.
 */
function pruneExpiredFingerprints(): void {
  const lastPruneAt = globalForFingerprints.__edutestFingerprintPruneAt ?? 0;
  const now = Date.now();
  // Only prune once per minute
  if (now - lastPruneAt < 60_000) return;

  const cutoff = now - maxFingerprintAgeMs();
  const store = fingerprintStore();
  for (const [key, entries] of Array.from(store.entries())) {
    const pruned = entries.filter((e: { createdAt: string }) => Date.parse(e.createdAt) > cutoff);
    if (pruned.length === 0) {
      store.delete(key);
    } else if (pruned.length < entries.length) {
      store.set(key, pruned);
    }
  }
  globalForFingerprints.__edutestFingerprintPruneAt = now;
}

export function clearFingerprintStoreForTests(): void {
  fingerprintStore().clear();
  fingerprintSequences().clear();
}