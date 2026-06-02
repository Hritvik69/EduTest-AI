import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { getCurriculumChapter, getCurriculumChapters } from "@/lib/curriculum-data";
import { getCachedNcertSourceConcepts } from "@/lib/ncert-source-cache";
import type { ConceptData } from "@/types";

const pdfTextCache = new Map<string, Promise<string>>();
const chapterConceptCache = new Map<string, Promise<ConceptData[]>>();

export async function getLocalNcertChapterConcepts(
  classNum: number,
  subjects: string[],
  chapterId: number,
): Promise<ConceptData[]> {
  const subject = subjects.find((item) =>
    getCurriculumChapter(classNum, item, chapterId),
  );
  if (!subject) return [];

  const chapter = getCurriculumChapter(classNum, subject, chapterId);
  if (!chapter) return [];

  const cacheKey = `${classNum}:${subject}:${chapterId}`;
  const cached = chapterConceptCache.get(cacheKey);
  if (cached) return cached;

  const promise = loadLocalOrCachedConcepts(
    classNum,
    subject,
    chapterId,
    chapter.name,
    chapter.topics,
  );
  chapterConceptCache.set(cacheKey, promise);
  return promise;
}

async function loadLocalOrCachedConcepts(
  classNum: number,
  subject: string,
  chapterId: number,
  chapterName: string,
  chapterTopics: { id: number; name: string }[],
) {
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
