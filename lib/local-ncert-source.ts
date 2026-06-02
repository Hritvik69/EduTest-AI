import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import sql from "@/lib/db";
import { getCurriculumChapter, getCurriculumChapters } from "@/lib/curriculum-data";
import { getCachedNcertSourceConcepts } from "@/lib/ncert-source-cache";
import bundledNcertTextManifest from "@/data/ncert-extracted-text-manifest.json";
import type { ChapterTopic, ConceptData } from "@/types";

const pdfTextCache = new Map<string, Promise<string>>();
const chapterConceptCache = new Map<string, Promise<ConceptData[]>>();
const remoteTextCache = new Map<string, Promise<string>>();

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

const bundledTextManifest = bundledNcertTextManifest as BundledNcertTextEntry[];

export async function getLocalNcertChapterConcepts(
  classNum: number,
  subjects: string[],
  chapterId: number,
): Promise<ConceptData[]> {
  const resolved = await resolveNcertChapter(classNum, subjects, chapterId);
  if (!resolved) return [];

  const cacheKey = `${classNum}:${resolved.subject}:${resolved.selectedChapterId}:${resolved.sourceChapterId}:${resolved.chapterName}`;
  const cached = chapterConceptCache.get(cacheKey);
  if (cached) return cached;

  const promise = loadLocalOrCachedConcepts(
    classNum,
    resolved.subject,
    resolved.selectedChapterId,
    resolved.chapterName,
    resolved.chapterTopics,
  );
  chapterConceptCache.set(cacheKey, promise);
  return promise;
}

async function resolveNcertChapter(
  classNum: number,
  subjects: string[],
  selectedChapterId: number,
): Promise<ResolvedNcertChapter | null> {
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

  return null;
}

async function getImportedChapterMetadata(chapterId: number) {
  if (!sql) return null;

  try {
    const chapterRows = await sql`
      SELECT c.name AS chapter_name, s.name AS subject_name, s.class_num
      FROM chapters c
      JOIN subjects s ON s.id = c.subject_id
      WHERE c.id = ${chapterId}
      LIMIT 1
    `;
    const chapter = chapterRows[0];
    if (!chapter) return null;

    const topicRows = await sql`
      SELECT id, name
      FROM topics
      WHERE chapter_id = ${chapterId}
      ORDER BY id ASC
    `;

    return {
      chapterName: String(chapter.chapter_name),
      subject: String(chapter.subject_name),
      classNum: Number(chapter.class_num),
      topics: topicRows.map((row) => ({
        id: Number(row.id),
        name: String(row.name),
      })),
    };
  } catch {
    return null;
  }
}

async function loadLocalOrCachedConcepts(
  classNum: number,
  subject: string,
  chapterId: number,
  chapterName: string,
  chapterTopics: { id: number; name: string }[],
) {
  const fromExtractedText = await loadFromExtractedText(
    classNum,
    subject,
    chapterId,
    chapterName,
    chapterTopics,
  );
  if (fromExtractedText.length) return fromExtractedText;

  const fromLocalPdf = await loadFromLocalPdf(
    classNum,
    subject,
    chapterId,
    chapterName,
    chapterTopics,
  );
  if (fromLocalPdf.length) return fromLocalPdf;

  return withTopicIds(
    getCachedNcertSourceConcepts({
      classNum,
      subject,
      chapterId,
      chapterName,
    }),
    chapterTopics,
  );
}

async function loadFromExtractedText(
  classNum: number,
  subject: string,
  chapterId: number,
  chapterName: string,
  chapterTopics: { id: number; name: string }[],
) {
  const bundledEntry = candidateBundledTextEntries(classNum, subject, chapterName)[0];
  if (bundledEntry) {
    try {
      const chapterText = trimChapterText(
        cleanPdfText(await readBundledNcertText(bundledEntry.path)),
      );
      if (chapterText.length >= 900) {
        return conceptsFromChapterText({
          text: chapterText,
          classNum,
          subject,
          chapterName,
          chapterId,
          chapterTopics,
        });
      }
    } catch (error) {
      console.warn(
        `Could not load selected NCERT extracted text ${bundledEntry.path}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  const textPaths = await candidateExtractedTextPaths(classNum, subject, chapterName);
  for (const textPath of textPaths) {
    try {
      const chapterText = trimChapterText(cleanPdfText(await readFile(textPath, "utf8")));
      if (chapterText.length < 900) continue;

      return conceptsFromChapterText({
        text: chapterText,
        classNum,
        subject,
        chapterName,
        chapterId,
        chapterTopics,
      });
    } catch (error) {
      console.warn(
        `Could not load NCERT extracted text ${textPath}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  return [];
}

async function readBundledNcertText(relativePath: string) {
  const localPaths = candidateBundledNcertTextPaths(relativePath);
  for (const textPath of localPaths) {
    try {
      if (!existsSync(textPath)) continue;
      return await readFile(textPath, "utf8");
    } catch {
      // Try the next runtime path shape before falling back to the remote source.
    }
  }

  return readRemoteNcertText(relativePath);
}

function candidateBundledNcertTextPaths(relativePath: string) {
  const safeParts = relativePath
    .replace(/^NCERT_Books\//, "")
    .split("/")
    .filter((part) => part && part !== "." && part !== "..");
  const cwd = process.cwd();
  return unique([
    path.join(cwd, "NCERT_Books", ...safeParts),
    path.join(cwd, ".next", "server", "NCERT_Books", ...safeParts),
    path.join(cwd, "..", "NCERT_Books", ...safeParts),
    path.join(cwd, "..", "..", "NCERT_Books", ...safeParts),
  ]);
}

async function readRemoteNcertText(relativePath: string) {
  if (process.env.EDUTEST_DISABLE_REMOTE_NCERT_TEXT === "1") {
    throw new Error("Remote NCERT text fallback is disabled.");
  }

  const cached = remoteTextCache.get(relativePath);
  if (cached) return cached;

  const promise = (async () => {
    const url = remoteNcertTextUrl(relativePath);
    const response = await fetch(url, {
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) {
      throw new Error(`Remote NCERT text fetch failed with HTTP ${response.status}.`);
    }
    return response.text();
  })();
  remoteTextCache.set(relativePath, promise);
  return promise;
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
) {
  const pdfPaths = await candidatePdfPaths(classNum, subject);
  if (!pdfPaths.length) return [];

  const chapterNames = getCurriculumChapters(classNum, subject).map((chapter) => chapter.name);

  for (const pdfPath of pdfPaths) {
    try {
      const text = await readPdfText(pdfPath);
      const chapterText = extractChapterSlice(text, chapterName, chapterNames);
      if (chapterText.length < 900) continue;

      return conceptsFromChapterText({
        text: chapterText,
        classNum,
        subject,
        chapterName,
        chapterId,
        chapterTopics,
      });
    } catch (error) {
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
  const root = path.join(process.cwd(), "NCERT_Books");
  const classDir = path.join(root, `${classNum}th`);
  if (!existsSync(classDir)) return [];

  const extractedRoot = path.join(
    classDir,
    subjectFolderName(subject, classNum),
    "_extracted_text",
  );
  if (!existsSync(extractedRoot)) return [];

  const files = await listTextFiles(extractedRoot);
  return files
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

  const root = path.join(process.cwd(), "NCERT_Books");
  const classDir = path.join(root, `${classNum}th`);
  if (!existsSync(classDir)) return [];

  const subjectDir = path.join(classDir, subjectFolderName(subject, classNum));
  if (!existsSync(subjectDir)) return [];

  const entries = await readdir(subjectDir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".pdf"))
    .map((entry) => path.join(subjectDir, entry.name))
    .sort((left, right) => scorePdfName(right, subject) - scorePdfName(left, subject));
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
  })();
  pdfTextCache.set(pdfPath, promise);
  return promise;
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
      .filter((sentence) => sentence.length >= 55),
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
      type: "PDF_SOURCE_TEXT",
      bloomLevel: concepts.length < 3 ? "UNDERSTAND" : "APPLY",
      hotsPotential: concepts.length >= 3,
      hotsPoential: concepts.length >= 3,
      subject,
      classNum,
      chapterName,
      topicName,
      topicId,
      chapterId,
      source: "pdf",
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
