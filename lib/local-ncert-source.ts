import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import sql from "@/lib/db";
import { getCurriculumChapter, getCurriculumChapters } from "@/lib/curriculum-data";
import { getCachedNcertSourceConcepts } from "@/lib/ncert-source-cache";
import {
  isSourceTextConcept,
  NCERT_TXT_SOURCE_TYPE,
} from "@/lib/source-types";
import bundledNcertTextManifest from "@/data/ncert-extracted-text-manifest.json";
import type { ChapterTopic, ConceptData } from "@/types";

const pdfTextCache = new Map<string, Promise<string>>();
const chapterConceptCache = new Map<string, Promise<LocalNcertChapterSourceResult>>();
const remoteTextCache = new Map<string, Promise<string>>();
const minimumChapterTextLength = 900;

interface ResolvedNcertChapter {
  selectedChapterId: number;
  sourceChapterId: number;
  subject: string;
  chapterName: string;
  chapterTopics: Pick<ChapterTopic, "id" | "name">[];
}

interface BundledNcertTextEntry {
  classNum: number;
  subjectFolder: string;
  book: string;
  title: string;
  path: string;
}

export interface LocalNcertSourceDiagnostics {
  classNum: number;
  subjects: string[];
  selectedChapterId: number;
  resolved?: {
    selectedChapterId: number;
    sourceChapterId: number;
    subject: string;
    chapterName: string;
    topicCount: number;
  };
  cacheHit?: boolean;
  selectedSource?: "bundled_text" | "local_extracted_text" | "local_pdf" | "static_cache";
  reason?: string;
  conceptCount: number;
  sourceTextChunks: number;
  manifestCandidates: Array<{
    title: string;
    book: string;
    path: string;
  }>;
  manifestMatch?: {
    title: string;
    book: string;
    path: string;
  };
  attemptedLocalPaths: string[];
  attemptedExtractedTextPaths: string[];
  attemptedPdfPaths: string[];
  remoteFallbacks: Array<{
    path: string;
    url: string;
    status: "disabled" | "cached" | "success" | "failed";
    statusCode?: number;
    length?: number;
    error?: string;
  }>;
  tooShortText: Array<{
    source: "bundled_text" | "local_extracted_text" | "local_pdf";
    path: string;
    length: number;
    minimum: number;
  }>;
  readErrors: Array<{
    source: "bundled_text" | "local_extracted_text" | "local_pdf";
    path: string;
    error: string;
  }>;
}

export interface LocalNcertChapterSourceResult {
  concepts: ConceptData[];
  diagnostics: LocalNcertSourceDiagnostics;
}

const bundledTextManifest = bundledNcertTextManifest as BundledNcertTextEntry[];

export async function getLocalNcertChapterConcepts(
  classNum: number,
  subjects: string[],
  chapterId: number,
): Promise<ConceptData[]> {
  return (await getLocalNcertChapterSource(classNum, subjects, chapterId)).concepts;
}

export async function getLocalNcertChapterSource(
  classNum: number,
  subjects: string[],
  chapterId: number,
): Promise<LocalNcertChapterSourceResult> {
  const diagnostics = createDiagnostics(classNum, subjects, chapterId);
  const resolved = await resolveNcertChapter(classNum, subjects, chapterId);
  if (!resolved) {
    diagnostics.reason = "chapter_not_resolved";
    return { concepts: [], diagnostics };
  }

  diagnostics.resolved = {
    selectedChapterId: resolved.selectedChapterId,
    sourceChapterId: resolved.sourceChapterId,
    subject: resolved.subject,
    chapterName: resolved.chapterName,
    topicCount: resolved.chapterTopics.length,
  };

  const cacheKey = `${classNum}:${resolved.subject}:${resolved.selectedChapterId}:${resolved.sourceChapterId}:${resolved.chapterName}`;
  const cached = chapterConceptCache.get(cacheKey);
  if (cached) {
    const result = await cached;
    return {
      concepts: result.concepts,
      diagnostics: {
        ...result.diagnostics,
        cacheHit: true,
      },
    };
  }

  const promise = loadLocalOrCachedConcepts(
    classNum,
    resolved.subject,
    resolved.selectedChapterId,
    resolved.chapterName,
    resolved.chapterTopics,
    diagnostics,
  ).catch((error) => {
    chapterConceptCache.delete(cacheKey);
    throw error;
  });
  chapterConceptCache.set(cacheKey, promise);
  enforcePromiseCacheLimit(chapterConceptCache, 120);
  return promise;
}

function createDiagnostics(
  classNum: number,
  subjects: string[],
  selectedChapterId: number,
): LocalNcertSourceDiagnostics {
  return {
    classNum,
    subjects,
    selectedChapterId,
    conceptCount: 0,
    sourceTextChunks: 0,
    manifestCandidates: [],
    attemptedLocalPaths: [],
    attemptedExtractedTextPaths: [],
    attemptedPdfPaths: [],
    remoteFallbacks: [],
    tooShortText: [],
    readErrors: [],
  };
}

async function resolveNcertChapter(
  classNum: number,
  subjects: string[],
  selectedChapterId: number,
): Promise<ResolvedNcertChapter | null> {
  for (const subject of subjects) {
    const chapter = getCurriculumChapter(classNum, subject, selectedChapterId);
    if (chapter) {
      return {
        selectedChapterId,
        sourceChapterId: selectedChapterId,
        subject,
        chapterName: chapter.name,
        chapterTopics: chapter.topics,
      };
    }
  }

  const imported = await getImportedChapterMetadata(selectedChapterId);
  if (imported?.classNum === classNum) {
    const subject =
      subjects.find((item) => sameSubject(item, imported.subject)) ?? imported.subject;
    const staticChapter = getCurriculumChapters(classNum, subject).find((chapter) =>
      sameChapterName(chapter.name, imported.chapterName),
    );

    return {
      selectedChapterId,
      sourceChapterId: staticChapter?.id ?? selectedChapterId,
      subject,
      chapterName: staticChapter?.name ?? imported.chapterName,
      chapterTopics: imported.topics.length ? imported.topics : staticChapter?.topics ?? [],
    };
  }

  return null;
}

async function getImportedChapterMetadata(chapterId: number) {
  if (!sql) return null;

  try {
    const chapterRows = await withDatabaseLookupTimeout(sql`
      SELECT c.name AS chapter_name, s.name AS subject_name, s.class_num
      FROM chapters c
      JOIN subjects s ON s.id = c.subject_id
      WHERE c.id = ${chapterId}
      LIMIT 1
    `, "imported chapter metadata");
    const chapter = chapterRows[0];
    if (!chapter) return null;

    const topicRows = await withDatabaseLookupTimeout(sql`
      SELECT id, name
      FROM topics
      WHERE chapter_id = ${chapterId}
      ORDER BY id ASC
    `, "imported chapter topics");

    return {
      chapterName: String(chapter.chapter_name),
      subject: String(chapter.subject_name),
      classNum: Number(chapter.class_num),
      topics: topicRows.map((row) => ({
        id: Number(row.id),
        name: String(row.name),
      })),
    };
  } catch (error) {
    console.warn(
      `Skipping imported chapter metadata lookup for chapter ${chapterId}: ${safeErrorMessage(error)}`,
    );
    return null;
  }
}

async function loadLocalOrCachedConcepts(
  classNum: number,
  subject: string,
  chapterId: number,
  chapterName: string,
  chapterTopics: { id: number; name: string }[],
  diagnostics: LocalNcertSourceDiagnostics,
) {
  const fromExtractedText = await loadFromExtractedText(
    classNum,
    subject,
    chapterId,
    chapterName,
    chapterTopics,
    diagnostics,
  );
  if (fromExtractedText.length) {
    return sourceResult(fromExtractedText, diagnostics);
  }

  const cachedConcepts = withTopicIds(
    getCachedNcertSourceConcepts({
      classNum,
      subject,
      chapterId,
      chapterName,
    }),
    chapterTopics,
  );
  if (cachedConcepts.length) {
    diagnostics.selectedSource = "static_cache";
    diagnostics.reason = "static_source_cache_used";
  } else if (!diagnostics.reason) {
    diagnostics.reason = "no_matching_ncert_text";
  }
  return sourceResult(cachedConcepts, diagnostics);
}

async function loadFromExtractedText(
  classNum: number,
  subject: string,
  chapterId: number,
  chapterName: string,
  chapterTopics: { id: number; name: string }[],
  diagnostics: LocalNcertSourceDiagnostics,
) {
  const bundledEntries = candidateBundledTextEntries(classNum, subject, chapterName);
  diagnostics.manifestCandidates = bundledEntries.slice(0, 5).map((entry) => ({
    title: entry.title,
    book: entry.book,
    path: entry.path,
  }));

  for (const bundledEntry of bundledEntries) {
    diagnostics.manifestMatch ??= {
      title: bundledEntry.title,
      book: bundledEntry.book,
      path: bundledEntry.path,
    };

    try {
      const chapterText = trimChapterText(
        cleanPdfText(await readBundledNcertText(bundledEntry.path, diagnostics)),
      );
      if (chapterText.length >= minimumChapterTextLength) {
        diagnostics.selectedSource = "bundled_text";
        return conceptsFromChapterText({
          text: chapterText,
          classNum,
          subject,
          chapterName,
          chapterId,
          chapterTopics,
        });
      }
      diagnostics.tooShortText.push({
        source: "bundled_text",
        path: bundledEntry.path,
        length: chapterText.length,
        minimum: minimumChapterTextLength,
      });
    } catch (error) {
      diagnostics.readErrors.push({
        source: "bundled_text",
        path: bundledEntry.path,
        error: safeErrorMessage(error),
      });
      console.warn(
        `Could not load selected NCERT extracted text ${bundledEntry.path}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  const textPaths = await candidateExtractedTextPaths(classNum, subject, chapterName);
  for (const textPath of textPaths) {
    diagnostics.attemptedExtractedTextPaths.push(textPath);
    try {
      const chapterText = trimChapterText(cleanPdfText(await readFile(textPath, "utf8")));
      if (chapterText.length < minimumChapterTextLength) {
        diagnostics.tooShortText.push({
          source: "local_extracted_text",
          path: textPath,
          length: chapterText.length,
          minimum: minimumChapterTextLength,
        });
        continue;
      }

      diagnostics.selectedSource = "local_extracted_text";
      return conceptsFromChapterText({
        text: chapterText,
        classNum,
        subject,
        chapterName,
        chapterId,
        chapterTopics,
      });
    } catch (error) {
      diagnostics.readErrors.push({
        source: "local_extracted_text",
        path: textPath,
        error: safeErrorMessage(error),
      });
      console.warn(
        `Could not load NCERT extracted text ${textPath}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  return [];
}

function sourceResult(
  concepts: ConceptData[],
  diagnostics: LocalNcertSourceDiagnostics,
): LocalNcertChapterSourceResult {
  diagnostics.conceptCount = concepts.length;
  diagnostics.sourceTextChunks = concepts.filter(isSourceTextConcept).length;
  return { concepts, diagnostics };
}

async function readBundledNcertText(
  relativePath: string,
  diagnostics: LocalNcertSourceDiagnostics,
) {
  const localPaths = candidateBundledNcertTextPaths(relativePath);
  for (const textPath of localPaths) {
    diagnostics.attemptedLocalPaths.push(textPath);
    try {
      if (!existsSync(textPath)) continue;
      return await readFile(textPath, "utf8");
    } catch (error) {
      diagnostics.readErrors.push({
        source: "bundled_text",
        path: textPath,
        error: safeErrorMessage(error),
      });
      // Try the next runtime path shape before falling back to the remote source.
    }
  }

  return readRemoteNcertText(relativePath, diagnostics);
}

function candidateBundledNcertTextPaths(relativePath: string) {
  const safeParts = relativePath
    .replace(/^NCERT_Books\//, "")
    .split("/")
    .filter((part) => part && part !== "." && part !== "..");
  const cwd = process.cwd();
  const configuredRoot = process.env.EDUTEST_NCERT_TEXT_ROOT?.trim();
  const lambdaTaskRoot = process.env.LAMBDA_TASK_ROOT?.trim();
  const configuredPaths = configuredRoot
    ? [
        path.join(configuredRoot, ...safeParts),
        path.join(configuredRoot, "NCERT_Books", ...safeParts),
      ]
    : [];
  const lambdaPaths = lambdaTaskRoot
    ? [
        path.join(lambdaTaskRoot, "NCERT_Books", ...safeParts),
        path.join(lambdaTaskRoot, ".next", "server", "NCERT_Books", ...safeParts),
      ]
    : [];
  return unique([
    ...configuredPaths,
    ...lambdaPaths,
    path.join(cwd, "NCERT_Books", ...safeParts),
    path.join(cwd, ".next", "server", "NCERT_Books", ...safeParts),
    path.join(cwd, "..", "NCERT_Books", ...safeParts),
    path.join(cwd, "..", "..", "NCERT_Books", ...safeParts),
  ]);
}

async function readRemoteNcertText(
  relativePath: string,
  diagnostics: LocalNcertSourceDiagnostics,
) {
  const url = remoteNcertTextUrl(relativePath);
  if (process.env.EDUTEST_DISABLE_REMOTE_NCERT_TEXT === "1") {
    diagnostics.remoteFallbacks.push({
      path: relativePath,
      url,
      status: "disabled",
      error: "Remote NCERT text fallback is disabled.",
    });
    throw new Error("Remote NCERT text fallback is disabled.");
  }

  const cached = remoteTextCache.get(relativePath);
  if (cached) {
    const attempt: LocalNcertSourceDiagnostics["remoteFallbacks"][number] = {
      path: relativePath,
      url,
      status: "cached",
    };
    diagnostics.remoteFallbacks.push(attempt);
    try {
      const text = await cached;
      attempt.length = text.length;
      return text;
    } catch (error) {
      attempt.status = "failed";
      attempt.error = safeErrorMessage(error);
      throw error;
    }
  }

  const promise = (async () => {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) {
      throw new Error(`Remote NCERT text fetch failed with HTTP ${response.status}.`);
    }
    return response.text();
  })().catch((error) => {
    remoteTextCache.delete(relativePath);
    throw error;
  });
  remoteTextCache.set(relativePath, promise);
  enforcePromiseCacheLimit(remoteTextCache, 80);
  const attempt: LocalNcertSourceDiagnostics["remoteFallbacks"][number] = {
    path: relativePath,
    url,
    status: "success",
  };
  diagnostics.remoteFallbacks.push(attempt);
  try {
    const text = await promise;
    attempt.length = text.length;
    return text;
  } catch (error) {
    attempt.status = "failed";
    attempt.error = safeErrorMessage(error);
    const status = attempt.error.match(/HTTP\s+(\d+)/i)?.[1];
    if (status) attempt.statusCode = Number(status);
    throw error;
  }
}

function remoteNcertTextUrl(relativePath: string) {
  const base =
    process.env.EDUTEST_NCERT_TEXT_BASE_URL ??
    "https://raw.githubusercontent.com/Hritvik69/EduTest-AI/main";
  const encodedPath = relativePath
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
  return `${base.replace(/\/$/, "")}/${encodedPath}`;
}

function candidateBundledTextEntries(
  classNum: number,
  subject: string,
  chapterName: string,
) {
  const folder = subjectFolderName(subject, classNum);
  return bundledTextManifest
    .filter(
      (entry) =>
        entry.classNum === classNum &&
        normalizeTopicName(entry.subjectFolder) === normalizeTopicName(folder),
    )
    .map((entry) => ({
      entry,
      score: Math.max(
        scoreExtractedTextTitle(entry.title, chapterName),
        scoreExtractedTextTitle(`${entry.book} ${entry.title}`, chapterName),
      ),
    }))
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score)
    .map((item) => item.entry);
}

async function loadFromLocalPdf(
  classNum: number,
  subject: string,
  chapterId: number,
  chapterName: string,
  chapterTopics: { id: number; name: string }[],
  diagnostics: LocalNcertSourceDiagnostics,
) {
  const pdfPaths = await candidatePdfPaths(classNum, subject);
  if (!pdfPaths.length) return [];

  const chapterNames = getCurriculumChapters(classNum, subject).map((chapter) => chapter.name);

  for (const pdfPath of pdfPaths) {
    diagnostics.attemptedPdfPaths.push(pdfPath);
    try {
      const text = await readPdfText(pdfPath);
      const chapterText = extractChapterSlice(text, chapterName, chapterNames);
      if (chapterText.length < minimumChapterTextLength) {
        diagnostics.tooShortText.push({
          source: "local_pdf",
          path: pdfPath,
          length: chapterText.length,
          minimum: minimumChapterTextLength,
        });
        continue;
      }

      diagnostics.selectedSource = "local_pdf";
      return conceptsFromChapterText({
        text: chapterText,
        classNum,
        subject,
        chapterName,
        chapterId,
        chapterTopics,
      });
    } catch (error) {
      diagnostics.readErrors.push({
        source: "local_pdf",
        path: pdfPath,
        error: safeErrorMessage(error),
      });
      console.warn(
        `Could not load NCERT source PDF ${pdfPath}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  return [];
}

async function candidateExtractedTextPaths(
  classNum: number,
  subject: string,
  chapterName: string,
) {
  const files: string[] = [];
  for (const root of ncertRootCandidates()) {
    const classDir = path.join(root, `${classNum}th`);
    if (!existsSync(classDir)) continue;

    const extractedRoot = path.join(
      classDir,
      subjectFolderName(subject, classNum),
      "_extracted_text",
    );
    if (!existsSync(extractedRoot)) continue;

    files.push(...(await listTextFiles(extractedRoot)));
  }

  return unique(files)
    .map((filePath) => ({
      filePath,
      score: scoreExtractedTextPath(filePath, chapterName),
    }))
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score)
    .map((item) => item.filePath);
}

async function listTextFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(root, entry.name);
      if (entry.isDirectory()) return listTextFiles(entryPath);
      return entry.isFile() && entry.name.toLowerCase().endsWith(".txt")
        ? [entryPath]
        : [];
    }),
  );
  return files.flat();
}

async function candidatePdfPaths(classNum: number, subject: string) {
  if (process.env.EDUTEST_DISABLE_LOCAL_NCERT_PDF === "1") return [];

  const pdfPaths: string[] = [];
  for (const root of ncertRootCandidates()) {
    const classDir = path.join(root, `${classNum}th`);
    if (!existsSync(classDir)) continue;

    const subjectDir = path.join(classDir, subjectFolderName(subject, classNum));
    if (!existsSync(subjectDir)) continue;

    const entries = await readdir(subjectDir, { withFileTypes: true });
    pdfPaths.push(
      ...entries
        .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".pdf"))
        .map((entry) => path.join(subjectDir, entry.name)),
    );
  }

  return unique(pdfPaths)
    .sort((left, right) => scorePdfName(right, subject) - scorePdfName(left, subject));
}

function ncertRootCandidates() {
  const cwd = process.cwd();
  const configuredRoot = process.env.EDUTEST_NCERT_TEXT_ROOT?.trim();
  const lambdaTaskRoot = process.env.LAMBDA_TASK_ROOT?.trim();
  const candidates = [
    configuredRoot,
    configuredRoot ? path.join(configuredRoot, "NCERT_Books") : "",
    lambdaTaskRoot ? path.join(lambdaTaskRoot, "NCERT_Books") : "",
    lambdaTaskRoot ? path.join(lambdaTaskRoot, ".next", "server", "NCERT_Books") : "",
    path.join(cwd, "NCERT_Books"),
    path.join(cwd, ".next", "server", "NCERT_Books"),
    path.join(cwd, "..", "NCERT_Books"),
    path.join(cwd, "..", "..", "NCERT_Books"),
  ];
  return unique(candidates.filter((candidate): candidate is string => Boolean(candidate)));
}

function subjectFolderName(subject: string, classNum: number) {
  if (classNum <= 10 && /^(Physics|Chemistry|Biology)$/i.test(subject)) return "Science";
  if (
    classNum <= 10 &&
    /^(History|Geography|Civics|Economics)$/i.test(subject)
  ) {
    return "Social_Science";
  }
  if (/Computer/i.test(subject)) return "Computer_IT";
  return subject;
}

function scorePdfName(pdfPath: string, subject: string) {
  const name = path.basename(pdfPath).replace(/[_-]/g, " ").toLowerCase();
  let score = 0;
  if (name.includes(subject.toLowerCase())) score += 2;
  if (/poorvi|mathematics|science|first flight|honeydew|honeysuckle/i.test(name)) {
    score += 1;
  }
  return score;
}

function scoreExtractedTextPath(filePath: string, chapterName: string) {
  const fileTitle = path
    .basename(filePath, ".txt")
    .replace(/^\d+_/, "")
    .replace(/_/g, " ");
  return scoreExtractedTextTitle(fileTitle, chapterName);
}

function scoreExtractedTextTitle(title: string, chapterName: string) {
  const normalizedChapter = normalizeChapterName(chapterName);
  const fileTitle = title.replace(/^\d+_/, "").replace(/_/g, " ");
  const normalizedFile = normalizeChapterName(fileTitle);

  if (normalizedFile === normalizedChapter) return 100;
  if (normalizedFile.includes(normalizedChapter)) return 80;
  if (normalizedChapter.includes(normalizedFile)) return 70;

  const chapterWords = new Set(normalizedChapter.split(/\s+/).filter((word) => word.length > 3));
  const fileWords = new Set(normalizedFile.split(/\s+/).filter((word) => word.length > 3));
  const overlap = Array.from(chapterWords).filter((word) => fileWords.has(word)).length;
  return overlap >= Math.min(3, chapterWords.size) ? overlap * 10 : 0;
}

async function readPdfText(pdfPath: string) {
  const cached = pdfTextCache.get(pdfPath);
  if (cached) return cached;

  const promise = (async () => {
    const { PDFParse } = await import("pdf-parse");
    const data = await readFile(pdfPath);
    const parser = new PDFParse({ data });
    try {
      const result = await parser.getText();
      return cleanPdfText(result.text ?? "");
    } finally {
      await parser.destroy();
    }
  })().catch((error) => {
    pdfTextCache.delete(pdfPath);
    throw error;
  });
  pdfTextCache.set(pdfPath, promise);
  enforcePromiseCacheLimit(pdfTextCache, 60);
  return promise;
}

function enforcePromiseCacheLimit<T>(cache: Map<string, Promise<T>>, maxEntries: number) {
  while (cache.size > maxEntries) {
    const oldestKey = cache.keys().next().value;
    if (!oldestKey) break;
    cache.delete(oldestKey);
  }
}

function extractChapterSlice(text: string, chapterName: string, chapterNames: string[]) {
  const lower = text.toLowerCase();
  const needle = chapterName.toLowerCase();
  const hits = allIndexes(lower, needle);
  if (!hits.length) return "";

  const otherNames = chapterNames
    .filter((name) => name.toLowerCase() !== needle)
    .map((name) => name.toLowerCase());
  const candidates = hits
    .map((start) => {
      const end = nextChapterBoundary(lower, otherNames, start + needle.length + 800);
      return {
        start,
        end,
        length: end - start,
        score: chapterStartScore(text, start),
      };
    })
    .filter((candidate) => candidate.length >= 1200)
    .filter((candidate) => candidate.score > 0)
    .sort((left, right) => right.score - left.score || right.length - left.length);

  const selected = candidates[0] ?? { start: hits[hits.length - 1], end: text.length };
  return trimChapterText(text.slice(selected.start, selected.end));
}

function chapterStartScore(text: string, start: number) {
  const window = text.slice(Math.max(0, start - 800), start + 1400).toLowerCase();
  let score = 1;
  if (/contents|about the book|transcripts/.test(window)) score -= 3;
  if (/let us read|let us do these activities before we read/.test(window)) score += 4;
  if (/reprint\s+\d{4}-\d{2}/i.test(window)) score += 1;
  if (/page\s+\d+|chapter\s+\d+/.test(window)) score += 1;
  return score;
}

function nextChapterBoundary(lowerText: string, chapterNames: string[], fromIndex: number) {
  let boundary = lowerText.length;
  for (const name of chapterNames) {
    const index = lowerText.indexOf(name, fromIndex);
    if (index !== -1 && index < boundary) boundary = index;
  }
  return boundary;
}

function allIndexes(text: string, needle: string) {
  const indexes: number[] = [];
  let index = -1;
  while ((index = text.indexOf(needle, index + 1)) !== -1) {
    indexes.push(index);
  }
  return indexes;
}

function trimChapterText(text: string) {
  return text
    .replace(/Reprint\s+\d{4}-\d{2}/gi, " ")
    .replace(/--\s*\d+\s+of\s+\d+\s*--/gi, " ")
    .replace(/\bPoorvi\b\s*\d+\b/gi, " ")
    .replace(/\bWit and Wisdom\b\s*\d+\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 18_000);
}

function conceptsFromChapterText({
  text,
  classNum,
  subject,
  chapterName,
  chapterId,
  chapterTopics,
}: {
  text: string;
  classNum: number;
  subject: string;
  chapterName: string;
  chapterId: number;
  chapterTopics: { id: number; name: string }[];
}) {
  const sentences = unique(
    text
      .split(/(?<=[.!?।])\s+/)
      .map((sentence) => sentence.trim())
      .filter((sentence) => sentence.length >= 55)
      .filter((sentence) => !isExtractedExercisePrompt(sentence)),
  ).slice(0, 24);
  const chunkSize = Math.max(2, Math.ceil(sentences.length / 8));
  const concepts: ConceptData[] = [];

  for (let index = 0; index < sentences.length && concepts.length < 10; index += chunkSize) {
    const chunk = sentences.slice(index, index + chunkSize).join(" ").slice(0, 1100);
    if (chunk.length < 80) continue;

    const topicName = topicNameForChunk(chapterName, concepts.length);
    const topicId = topicIdForName(topicName, chapterTopics);
    concepts.push({
      text: chunk,
      type: NCERT_TXT_SOURCE_TYPE,
      bloomLevel: concepts.length < 3 ? "UNDERSTAND" : "APPLY",
      hotsPotential: concepts.length >= 3,
      hotsPoential: concepts.length >= 3,
      subject,
      classNum,
      chapterName,
      topicName,
      topicId,
      chapterId,
      source: "ncert_txt",
    });
  }

  return concepts;
}

function withTopicIds(
  concepts: ConceptData[],
  chapterTopics: { id: number; name: string }[],
) {
  return concepts.map((concept) => ({
    ...concept,
    topicId: concept.topicId ?? topicIdForName(concept.topicName, chapterTopics),
  }));
}

function topicIdForName(
  topicName: string,
  chapterTopics: { id: number; name: string }[],
) {
  const normalized = normalizeTopicName(topicName);
  const match = chapterTopics.find((topic) => {
    const candidate = normalizeTopicName(topic.name);
    return (
      candidate === normalized ||
      candidate.includes(normalized) ||
      normalized.includes(candidate)
    );
  });
  return match?.id;
}

function normalizeTopicName(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function sameSubject(left: string, right: string) {
  return normalizeTopicName(left) === normalizeTopicName(right);
}

function sameChapterName(left: string, right: string) {
  const normalizedLeft = normalizeChapterName(left);
  const normalizedRight = normalizeChapterName(right);
  return (
    normalizedLeft === normalizedRight ||
    normalizedLeft.includes(normalizedRight) ||
    normalizedRight.includes(normalizedLeft)
  );
}

function normalizeChapterName(value: string) {
  return normalizeTopicName(value)
    .replace(/^chapter \d+ /, "")
    .replace(/^(poorvi|kaveri|ganita prakash|honeydew|honeysuckle|first flight) /, "")
    .trim();
}

function topicNameForChunk(chapterName: string, index: number) {
  if (index === 0) return chapterName;
  if (index <= 2) return "Reading comprehension and inference";
  if (index <= 5) return "Theme, character, tone, and literary devices";
  return "Vocabulary and grammar in context";
}

function unique(values: string[]) {
  return Array.from(new Set(values));
}

function cleanPdfText(text: string) {
  return text.replace(/\u0008/g, "").replace(/\t/g, " ").replace(/\r/g, "\n");
}

function isExtractedExercisePrompt(value: string) {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) return false;

  return (
    /^(?:exercise|exercises|questions?|question\s+bank|worksheet|practice\s+questions?|review\s+questions?|multiple\s+choice\s+questions?|very\s+short\s+answer|short\s+answer|long\s+answer)\s*[:.-]?$/i.test(
      normalized,
    ) ||
    /^(?:q(?:uestion)?\.?\s*)?\d{1,3}[.)]\s*(?:what|why|how|when|where|which|who|whom|whose|explain|describe|define|state|list|name|choose|tick|fill|match|answer|give|write|discuss|differentiate|calculate|find|prove|show)\b/i.test(
      normalized,
    ) ||
    /^(?:what|why|how|when|where|which|who|whom|whose)\b.{12,}\?/i.test(
      normalized,
    ) ||
    /^(?:explain|describe|define|state|list|name|choose|tick|fill|match|answer|give|write|discuss|differentiate|calculate|find|prove|show)\b.{12,}[.?]?$/i.test(
      normalized,
    ) ||
    /\b(?:answer\s+the\s+following|answer\s+these\s+questions|choose\s+the\s+correct|tick\s+the\s+correct|fill\s+in\s+the\s+blanks?|match\s+the\s+following|true\s+or\s+false|assertion\s+and\s+reason|give\s+reasons?|very\s+short\s+answer|short\s+answer|long\s+answer)\b/i.test(
      normalized,
    )
  );
}

function safeErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error ?? "unknown error");
}

function databaseLookupTimeoutMs() {
  const configured = Number(
    process.env.EDUTEST_DB_SOURCE_LOOKUP_TIMEOUT_MS ??
      process.env.EDUTEST_DB_LOOKUP_TIMEOUT_MS,
  );
  if (Number.isFinite(configured) && configured >= 250 && configured <= 3_000) {
    return Math.floor(configured);
  }

  return 1_200;
}

function withDatabaseLookupTimeout<T>(promise: Promise<T>, label: string) {
  const timeoutMs = databaseLookupTimeoutMs();
  let timeout: ReturnType<typeof setTimeout> | undefined;

  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      timeout = setTimeout(() => {
        reject(
          new Error(
            `DATABASE_LOOKUP_TIMEOUT: ${label} exceeded ${timeoutMs}ms`,
          ),
        );
      }, timeoutMs);
    }),
  ]).finally(() => {
    if (timeout) clearTimeout(timeout);
  });
}
