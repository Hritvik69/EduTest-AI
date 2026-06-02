import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import sql from "@/lib/db";
import { getCurriculumConceptsForChapters } from "@/lib/curriculum-data";
import { getDemoChapters } from "@/lib/edutest-data";
import { generateGeminiImageJSON, generateJSON } from "@/lib/gemini";
import {
  getLocalNcertChapterSource,
  type LocalNcertSourceDiagnostics,
} from "@/lib/local-ncert-source";
import { limitExtractedText } from "@/lib/pdf-security";
import { analyzeConceptSourceQuality } from "@/lib/retriever";
import type {
  BloomLevel,
  ConceptData,
  ContentSource,
  ExtractedConceptTopic,
} from "@/types";

export interface ExtractedContent {
  title: string;
  text: string;
  wordCount: number;
  source: "pdf" | "demo";
}

export interface PdfTextExtractionProgress {
  progress: number;
  message: string;
}

interface PdfTextExtractionOptions {
  onProgress?: (progress: PdfTextExtractionProgress) => void;
}

interface ConceptExtractionResult {
  topics: ExtractedConceptTopic[];
}

interface UploadedPdfExtractionResult extends ConceptExtractionResult {
  title?: string;
  subject?: string;
  classNum?: number;
  importantTopics?: string[];
}

type UploadedPdfConceptAnalysis = {
  title: string;
  subject: string;
  classNum: number | undefined;
  importantTopics: string[];
  topics: ExtractedConceptTopic[];
  extractionMethod: "AI" | "LOCAL_FALLBACK";
  cached?: boolean;
};
type UploadedPdfExtractionMethod =
  | "AI"
  | "LOCAL_FALLBACK"
  | "CACHED_AI"
  | "CACHED_LOCAL_FALLBACK";

const conceptCacheTtlMs = 60 * 60 * 1000;
const uploadedPdfExtractionCacheTtlMs = 6 * 60 * 60 * 1000;
type ConceptCacheValue = {
  expiresAt: number;
  concepts: ConceptData[];
  localNcertDiagnostics?: LocalNcertSourceDiagnostics[];
};
const globalForConceptCache = globalThis as typeof globalThis & {
  __edutestConceptCache?: Map<string, ConceptCacheValue>;
  __edutestUploadedPdfExtractionCache?: Map<
    string,
    { expiresAt: number; result: UploadedPdfConceptAnalysis }
  >;
};
const conceptCache =
  globalForConceptCache.__edutestConceptCache ??
  new Map<string, ConceptCacheValue>();
globalForConceptCache.__edutestConceptCache = conceptCache;
const uploadedPdfExtractionCache =
  globalForConceptCache.__edutestUploadedPdfExtractionCache ??
  new Map<string, { expiresAt: number; result: UploadedPdfConceptAnalysis }>();
globalForConceptCache.__edutestUploadedPdfExtractionCache = uploadedPdfExtractionCache;

const scannedPdfOcrMaxPages = 12;
const scannedPdfOcrWidth = Number(process.env.PDF_OCR_WIDTH) || 700;
const scannedPdfOcrLang = process.env.PDF_OCR_LANGS || "eng";
const scannedPdfOcrWorkers = Math.max(
  1,
  Math.min(4, Number(process.env.PDF_OCR_WORKERS) || 3),
);
const uploadedPdfAiExtractionTimeoutMs = Math.max(
  5_000,
  Number(process.env.PDF_UPLOAD_AI_EXTRACTION_TIMEOUT_MS) || 25_000,
);
const scannedPdfOcrSubprocessTimeoutMs = Math.max(
  15_000,
  Number(process.env.PDF_OCR_SUBPROCESS_TIMEOUT_MS) || 90_000,
);

export async function extractTextFromPdf(
  buffer: Buffer,
  options: PdfTextExtractionOptions = {},
): Promise<ExtractedContent> {
  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data: buffer });

  try {
    options.onProgress?.({ progress: 10, message: "Reading PDF text layer" });
    const textResult = await parser.getText();
    const infoResult = await parser.getInfo();
    const rawText = textResult.text ?? "";
    const pageCount = Number(textResult.total ?? textResult.pages?.length ?? 0);
    const title = normalizeOptionalText(infoResult.info?.Title) || "Uploaded PDF";
    const text = shouldTryScannedPdfOcr(rawText, pageCount)
      ? await extractScannedPdfText(buffer, parser, pageCount, title, rawText, options)
      : rawText;
    options.onProgress?.({ progress: 68, message: "PDF text is ready" });

    return {
      title,
      text: limitExtractedText(text),
      wordCount: text.split(/\s+/).filter(Boolean).length,
      source: "pdf",
    };
  } finally {
    await parser.destroy();
  }
}

function shouldTryScannedPdfOcr(text: string, pageCount: number) {
  if (pageCount <= 0) return false;
  const readableText = text
    .replace(/---PAGE---/g, "\n")
    .split(/\n+/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line) => line && !isPdfNoiseLine(line))
    .join(" ")
    .trim();
  const wordCount = readableText.split(/\s+/).filter(Boolean).length;
  return readableText.length < 40 || (pageCount > 1 && wordCount < 25);
}

async function extractScannedPdfText(
  buffer: Buffer,
  parser: {
    getScreenshot: (params?: Record<string, unknown>) => Promise<{
      pages: Array<{ data?: Uint8Array; dataUrl?: string }>;
    }>;
  },
  pageCount: number,
  title: string,
  rawText: string,
  options: PdfTextExtractionOptions,
) {
  const subprocessText = await extractScannedPdfTextViaSubprocess(
    buffer,
    pageCount,
    options,
  );
  if (subprocessText && subprocessText.split(/\s+/).filter(Boolean).length > 25) {
    return subprocessText;
  }

  const pageLimit = Math.min(pageCount || scannedPdfOcrMaxPages, scannedPdfOcrMaxPages);
  const schedulerPromise = createLocalOcrScheduler(
    Math.min(scannedPdfOcrWorkers, Math.max(pageLimit, 1)),
  );
  const renderedPages: Array<{
    page: number;
    image?: Buffer;
    dataUrl?: string;
  }> = [];
  const localTexts = new Map<number, string>();
  const localTextJobs: Promise<void>[] = [];
  let completedOcrPages = 0;

  void schedulerPromise.then((scheduler) => {
    if (!scheduler) return;
    options.onProgress?.({
      progress: 29,
      message: `OCR engine ready. Reading ${pageLimit} pages in parallel`,
    });
  });

  options.onProgress?.({
    progress: 16,
    message: `Detected scanned PDF. Rendering ${pageLimit} pages for OCR`,
  });
  for (let page = 1; page <= pageLimit; page += 1) {
    const screenshot = await parser.getScreenshot({
      first: page,
      last: page,
      desiredWidth: scannedPdfOcrWidth,
      imageDataUrl: false,
      imageBuffer: true,
    });
    const renderedPage = screenshot.pages[0];
    renderedPages.push({
      page,
      image: renderedPage?.data ? Buffer.from(renderedPage.data) : undefined,
      dataUrl: renderedPage?.dataUrl,
    });
    if (renderedPage?.data) {
      const image = Buffer.from(renderedPage.data);
      localTextJobs.push(
        schedulerPromise
          .then(async (scheduler) => {
            if (!scheduler) return;
            const result = await scheduler.addJob("recognize", image);
            const text = normalizeOcrText(result.data?.text ?? "");
            if (text) localTexts.set(page, text);
            completedOcrPages += 1;
            options.onProgress?.({
              progress: Math.round(30 + (completedOcrPages / pageLimit) * 35),
              message: `OCR read page ${page} of ${pageLimit}`,
            });
          })
          .catch((error) => {
            console.warn(`Local scanned PDF OCR failed for page ${page}.`, error);
          }),
      );
    }
    options.onProgress?.({
      progress: Math.round(16 + (page / pageLimit) * 12),
      message: `Rendered page ${page} of ${pageLimit} for OCR`,
    });
  }

  await Promise.all(localTextJobs);
  const scheduler = await schedulerPromise;
  await scheduler?.terminate();
  const pageTexts: string[] = [];

  for (const renderedPage of renderedPages) {
    const localText = localTexts.get(renderedPage.page);
    if (localText) {
      pageTexts.push(localText);
      continue;
    }

    const dataUrl = renderedPage.dataUrl ?? (await renderPageDataUrl(parser, renderedPage.page));
    const image = dataUrl ? parseDataUrl(dataUrl) : null;
    if (!image) continue;

    try {
      const result = await generateGeminiImageJSON<{ text?: string }>(
        [
          "Read this scanned NCERT chapter PDF page and transcribe the educational text.",
          `PDF title: ${title}`,
          `Page ${renderedPage.page} of ${pageCount}.`,
          "Return JSON only in this exact shape: { \"text\": \"clean readable page text\" }.",
          "Preserve headings, textbook paragraphs, activities, examples, exercises, tables, and important labels.",
          "Do not describe the image. Do not invent missing text. If a page has no readable textbook content, return an empty string.",
        ].join("\n"),
        [image],
        {
          temperature: 0.1,
          maxOutputTokens: 4096,
        },
      );
      const pageText = normalizeOcrText(result.text ?? "");
      if (pageText) pageTexts.push(pageText);
    } catch (error) {
      console.warn("Vision OCR failed for a scanned PDF page.", error);
    }
  }

  const ocrText = pageTexts.join("\n\n");
  return ocrText.split(/\s+/).filter(Boolean).length > rawText.split(/\s+/).filter(Boolean).length
    ? ocrText
    : rawText;
}

async function extractScannedPdfTextViaSubprocess(
  buffer: Buffer,
  pageCount: number,
  options: PdfTextExtractionOptions,
) {
  if (process.env.PDF_OCR_SUBPROCESS === "0") return "";

  const tempPath = path.join(tmpdir(), `edutest-ocr-${randomUUID()}.pdf`);
  const scriptPath = path.join(process.cwd(), "scripts", "ocr-scanned-pdf.mjs");
  await fs.writeFile(tempPath, buffer);

  try {
    return await new Promise<string>((resolve) => {
      const child = spawn(
        process.execPath,
        [
          scriptPath,
          `--input=${tempPath}`,
          `--max-pages=${Math.min(pageCount || scannedPdfOcrMaxPages, scannedPdfOcrMaxPages)}`,
          `--width=${scannedPdfOcrWidth}`,
          `--workers=${scannedPdfOcrWorkers}`,
          `--lang=${scannedPdfOcrLang}`,
        ],
        {
          cwd: process.cwd(),
          windowsHide: true,
          stdio: ["ignore", "pipe", "pipe"],
        },
      );

      let stdoutBuffer = "";
      let stderr = "";
      let text = "";
      let settled = false;
      const timeout = setTimeout(() => {
        if (settled) return;
        settled = true;
        child.kill();
        console.warn("Scanned PDF OCR subprocess timed out.");
        resolve("");
      }, scannedPdfOcrSubprocessTimeoutMs);

      const finish = (value: string) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        resolve(value);
      };

      child.stdout.setEncoding("utf8");
      child.stdout.on("data", (chunk) => {
        stdoutBuffer += chunk;
        const lines = stdoutBuffer.split(/\r?\n/);
        stdoutBuffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const event = JSON.parse(line) as {
              type?: string;
              progress?: number;
              message?: string;
              text?: string;
            };
            if (event.type === "progress" && event.message) {
              options.onProgress?.({
                progress: clampProgress(event.progress),
                message: event.message,
              });
            }
            if (event.type === "complete") {
              text = event.text ?? "";
            }
          } catch {
            // Ignore non-JSON output from subprocess dependencies.
          }
        }
      });

      child.stderr.setEncoding("utf8");
      child.stderr.on("data", (chunk) => {
        stderr += chunk;
      });

      child.on("error", (error) => {
        console.warn("Could not start scanned PDF OCR subprocess.", error);
        finish("");
      });

      child.on("close", (code) => {
        if (code !== 0) {
          console.warn(
            `Scanned PDF OCR subprocess exited with code ${code}. ${stderr.slice(0, 500)}`,
          );
          finish("");
          return;
        }
        finish(text);
      });
    });
  } finally {
    await fs.rm(tempPath, { force: true }).catch(() => {});
  }
}

async function renderPageDataUrl(
  parser: {
    getScreenshot: (params?: Record<string, unknown>) => Promise<{
      pages: Array<{ dataUrl?: string }>;
    }>;
  },
  page: number,
) {
  const screenshot = await parser.getScreenshot({
    first: page,
    last: page,
    desiredWidth: scannedPdfOcrWidth,
    imageDataUrl: true,
    imageBuffer: false,
  });
  return screenshot.pages[0]?.dataUrl ?? "";
}

async function createLocalOcrScheduler(workerCount: number) {
  try {
    const { createScheduler, createWorker } = await import("tesseract.js");
    const scheduler = createScheduler();
    const workers = Array.from({ length: workerCount }, async () => {
      const worker = await createWorker(scannedPdfOcrLang);
      scheduler.addWorker(worker);
    });
    await Promise.all(workers);
    return scheduler;
  } catch (error) {
    console.warn(
      "Local scanned PDF OCR is unavailable; falling back to configured vision providers.",
      error,
    );
    return null;
  }
}

function parseDataUrl(dataUrl: string) {
  const match = dataUrl.match(/^data:([^;,]+);base64,(.+)$/);
  if (!match) return null;
  return {
    mimeType: match[1],
    data: match[2],
  };
}

function normalizeOcrText(text: string) {
  return text
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n")
    .trim();
}

function clampProgress(value: unknown) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(100, Math.round(number)));
}

export function cleanExtractedText(rawText: string) {
  const cleanedLines: string[] = [];
  const lines = rawText
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line) => line && !/^\d+$/.test(line) && line.length >= 15);

  for (const line of lines) {
    if (cleanedLines[cleanedLines.length - 1] === line) continue;

    const previous = cleanedLines[cleanedLines.length - 1];
    if (previous && !/[.!?:;)]$/.test(previous) && /^[a-z(]/.test(line)) {
      cleanedLines[cleanedLines.length - 1] = `${previous} ${line}`.replace(
        /\s+/g,
        " ",
      );
      continue;
    }

    cleanedLines.push(line);
  }

  return cleanedLines.join("\n").replace(/[ \t]+/g, " ").trim();
}

function isPdfNoiseLine(line: string) {
  return (
    /^\d+$/.test(line) ||
    /^[-–—\s]*\d+\s+(?:of|\/)\s+\d+[-–—\s]*$/i.test(line) ||
    /^page\s+\d+\s+(?:of|\/)\s+\d+$/i.test(line)
  );
}

export async function extractConceptsWithGemini(
  cleanedText: string,
  chapterName: string,
  subject: string,
  classNum: number,
) {
  const prompt = `You are an expert CBSE curriculum analyst for Class ${classNum} ${subject}.

Extract all educational content from this chapter:
CHAPTER NAME: ${chapterName}
CHAPTER TEXT:
${cleanedText}

Return ONLY valid JSON with no markdown:
{
  "topics": [
    {
      "name": "Topic Name",
      "importance": "HIGH",
      "concepts": [
        {
          "text": "Full concept explanation",
          "type": "DEFINITION",
          "bloom_level": "REMEMBER",
          "hots_potential": false,
          "learning_outcome": "Student will be able to..."
        }
      ],
      "key_formulas": ["formula text"],
      "key_experiments": ["experiment description"],
      "real_life_applications": ["application example"],
      "common_misconceptions": ["typical wrong belief"]
    }
  ]
}

type must be: DEFINITION | FORMULA | EXPERIMENT | EXAMPLE | APPLICATION | ACTIVITY | FACT
bloom_level must be: REMEMBER | UNDERSTAND | APPLY | ANALYZE | EVALUATE | CREATE`;

  const result = await generateJSON<ConceptExtractionResult>(prompt, {
    task: "PDF_EXTRACTION",
  });
  return normalizeExtractionResult(result, chapterName);
}

export async function extractUploadedPdfConcepts(
  cleanedText: string,
  fallbackTitle = "Uploaded Chapter PDF",
  focusPrompt = "",
) {
  const normalizedFocusPrompt = normalizePdfFocusPrompt(focusPrompt);
  const cacheKey = uploadedPdfExtractionCacheKey(
    cleanedText,
    fallbackTitle,
    normalizedFocusPrompt,
  );
  const cached = uploadedPdfExtractionCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cloneUploadedPdfConceptAnalysis({
      ...cached.result,
      cached: true,
    });
  }
  uploadedPdfExtractionCache.delete(cacheKey);

  const focusRules = normalizedFocusPrompt
    ? `
USER PDF FOCUS PROMPT:
${normalizedFocusPrompt}

Scope rules:
- Treat the user focus prompt as the exam scope for this upload.
- If the PDF contains many chapters, extract only the chapter/topic/page range/exercise scope requested by the user.
- Ignore unrelated chapters, topics, examples, and exercises unless they are necessary context for the requested scope.
- The returned title, importantTopics, and topics must reflect the requested scope, not the whole PDF.
- If the exact scope is not obvious, use the closest matching headings and concepts from the PDF text. Do not invent content outside the PDF.
`
    : "";

  const prompt = `You are an advanced educational paper generation AI.

The user uploaded a chapter PDF. First deeply understand the educational material.

Analyze and extract:
- chapter name or best title
- likely subject if detectable
- likely class/grade if explicitly detectable
- main topics and subtopics
- definitions, important concepts, formulas, theorems, diagrams, activities, examples, numerical ideas, exercises, keywords, repeated concepts, and highlighted/boxed/summary ideas
- exam importance based on repeated explanations, headings, examples, exercises, formulas, summaries, and boxed content
- realistic question possibilities for each topic

Do not randomly create questions. This extraction will be used later to generate a balanced school examination paper from this PDF only.

PDF TITLE HINT: ${fallbackTitle}
${focusRules}

PDF TEXT:
${cleanedText}

Return ONLY valid JSON with no markdown:
{
  "title": "Detected chapter title",
  "subject": "Detected subject or empty string",
  "classNum": 10,
  "importantTopics": ["Most exam-relevant topic"],
  "topics": [
    {
      "name": "Topic Name",
      "importance": "HIGH",
      "concepts": [
        {
          "text": "Full concept explanation including why it matters for exams",
          "type": "DEFINITION",
          "bloom_level": "UNDERSTAND",
          "hots_potential": false,
          "learning_outcome": "Student will be able to..."
        }
      ],
      "key_formulas": ["formula text"],
      "key_experiments": ["experiment/activity/diagram/exercise description"],
      "real_life_applications": ["application example"],
      "common_misconceptions": ["typical wrong belief"]
    }
  ]
}

type must be: DEFINITION | FORMULA | EXPERIMENT | EXAMPLE | APPLICATION | ACTIVITY | FACT
bloom_level must be: REMEMBER | UNDERSTAND | APPLY | ANALYZE | EVALUATE | CREATE
Use HIGH importance for repeated, exercise-heavy, formula-heavy, boxed, summary, or major heading concepts.`;

  let result: UploadedPdfExtractionResult;
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, uploadedPdfAiExtractionTimeoutMs);

  try {
    result = await generateJSON<UploadedPdfExtractionResult>(prompt, {
      task: "PDF_EXTRACTION",
      signal: controller.signal,
    });
  } catch (error) {
    console.warn(
      "AI PDF concept extraction failed; using local text fallback.",
      error instanceof Error ? error.message : error,
    );
    const local = extractUploadedPdfConceptsLocally(
      focusTextForLocalPdfExtraction(cleanedText, normalizedFocusPrompt),
      normalizedFocusPrompt || fallbackTitle,
    );
    return cloneUploadedPdfConceptAnalysis(local);
  } finally {
    clearTimeout(timeout);
  }

  const title = normalizeOptionalText(result.title) || fallbackTitle;
  const topics = normalizeExtractionResult(result, title);
  const importantTopics = Array.isArray(result.importantTopics)
    ? result.importantTopics.map(normalizeOptionalText).filter(Boolean).slice(0, 12)
    : topics
        .filter((topic) => topic.importance === "HIGH")
        .map((topic) => topic.name)
        .slice(0, 12);

  const analysis = {
    title,
    subject: normalizeOptionalText(result.subject),
    classNum: normalizeClassNum(result.classNum),
    importantTopics,
    topics,
    extractionMethod: "AI" as const,
  };
  uploadedPdfExtractionCache.set(cacheKey, {
    expiresAt: Date.now() + uploadedPdfExtractionCacheTtlMs,
    result: analysis,
  });

  return cloneUploadedPdfConceptAnalysis(analysis);
}

function extractUploadedPdfConceptsLocally(
  cleanedText: string,
  fallbackTitle = "Uploaded Chapter PDF",
): {
  title: string;
  subject: string;
  classNum: number | undefined;
  importantTopics: string[];
  topics: ExtractedConceptTopic[];
  extractionMethod: "LOCAL_FALLBACK";
} {
  const lines = cleanedText
    .split(/\n+/)
    .map((line) => normalizeOptionalText(line))
    .filter((line) => line.length >= 20);
  const paragraphs = lines.length
    ? lines
    : cleanedText
        .split(/(?<=[.!?])\s+/)
        .map((line) => normalizeOptionalText(line))
        .filter((line) => line.length >= 30);
  const title = inferLocalPdfTitle(paragraphs, fallbackTitle);
  const topicSeeds = inferLocalTopicSeeds(paragraphs, title);
  const chunks = chunkParagraphsForTopics(paragraphs, topicSeeds.length);

  const topics = topicSeeds.map((name, index) =>
    localTopicFromText(name, chunks[index] ?? paragraphs.slice(index, index + 4), index),
  );

  const safeTopics = topics.length
    ? topics
    : [
        localTopicFromText(
          title,
          paragraphs.slice(0, 6),
          0,
        ),
      ];

  return {
    title,
    subject: "",
    classNum: undefined,
    importantTopics: safeTopics.slice(0, 12).map((topic) => topic.name),
    topics: safeTopics,
    extractionMethod: "LOCAL_FALLBACK",
  };
}

function uploadedPdfExtractionCacheKey(
  cleanedText: string,
  fallbackTitle: string,
  focusPrompt: string,
) {
  return createHash("sha256")
    .update(fallbackTitle)
    .update("\0")
    .update(focusPrompt)
    .update("\0")
    .update(cleanedText)
    .digest("hex");
}

function normalizePdfFocusPrompt(value: string) {
  return normalizeOptionalText(value).slice(0, 1000);
}

function focusTextForLocalPdfExtraction(cleanedText: string, focusPrompt: string) {
  if (!focusPrompt) return cleanedText;

  const chapterNumber = chapterNumberFromFocus(focusPrompt);
  if (chapterNumber) {
    const chapterText = textForChapterNumber(cleanedText, chapterNumber);
    if (chapterText) return chapterText;
  }

  const focusWords = new Set(
    focusPrompt
      .toLowerCase()
      .replace(/[^a-z0-9 ]/g, " ")
      .split(/\s+/)
      .filter((word) => word.length >= 4 && !pdfFocusStopWords.has(word)),
  );
  if (!focusWords.size) return cleanedText;

  const paragraphs = cleanedText.split(/\n+/);
  const focused = paragraphs.filter((paragraph) => {
    const normalized = paragraph.toLowerCase();
    return Array.from(focusWords).some((word) => normalized.includes(word));
  });

  return focused.length >= 3 ? focused.join("\n") : cleanedText;
}

function chapterNumberFromFocus(focusPrompt: string) {
  const numeric = focusPrompt.match(/\bchapter\s*(?:no\.?|number)?\s*(\d{1,2})\b/i);
  if (numeric) return Number(numeric[1]);

  const word = focusPrompt.match(/\bchapter\s+(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\b/i);
  if (!word) return null;

  return chapterWordNumbers[word[1].toLowerCase() as keyof typeof chapterWordNumbers];
}

function textForChapterNumber(cleanedText: string, chapterNumber: number) {
  const lines = cleanedText.split(/\n+/);
  const chapterHeading = new RegExp(
    `\\b(?:chapter|unit)\\s*(?:no\\.?|number)?\\s*${chapterNumber}\\b|\\b${chapterNumber}\\s*[.:-]\\s+`,
    "i",
  );
  const nextChapterHeading = new RegExp(
    `\\b(?:chapter|unit)\\s*(?:no\\.?|number)?\\s*${chapterNumber + 1}\\b|\\b${chapterNumber + 1}\\s*[.:-]\\s+`,
    "i",
  );
  const startIndex = lines.findIndex((line) => chapterHeading.test(line));
  if (startIndex < 0) return "";
  const endIndex = lines.findIndex(
    (line, index) => index > startIndex && nextChapterHeading.test(line),
  );

  return lines.slice(startIndex, endIndex > startIndex ? endIndex : undefined).join("\n");
}

const chapterWordNumbers = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
};

const pdfFocusStopWords = new Set([
  "chapter",
  "topic",
  "topics",
  "question",
  "questions",
  "paper",
  "only",
  "from",
  "this",
  "that",
  "with",
  "make",
  "want",
  "please",
  "ignore",
]);

function cloneUploadedPdfConceptAnalysis(result: UploadedPdfConceptAnalysis) {
  const extractionMethod: UploadedPdfExtractionMethod = result.cached
    ? result.extractionMethod === "LOCAL_FALLBACK"
      ? "CACHED_LOCAL_FALLBACK"
      : "CACHED_AI"
    : result.extractionMethod;
  return {
    title: result.title,
    subject: result.subject,
    classNum: result.classNum,
    importantTopics: [...result.importantTopics],
    extractionMethod,
    cached: Boolean(result.cached),
    topics: result.topics.map((topic) => ({
      ...topic,
      concepts: topic.concepts.map((concept) => ({ ...concept })),
      key_formulas: [...(topic.key_formulas ?? [])],
      key_experiments: [...(topic.key_experiments ?? [])],
      real_life_applications: [...(topic.real_life_applications ?? [])],
      common_misconceptions: [...(topic.common_misconceptions ?? [])],
    })),
  };
}

export async function generateDemoContent(
  chapterName: string,
  subject: string,
  classNum: number,
) {
  const prompt = `You are an NCERT curriculum expert.

Generate comprehensive educational content for:
Class: ${classNum} | Subject: ${subject} | Chapter: ${chapterName}

Generate ALL major topics, concepts, formulas, definitions,
experiments, and real-life applications as they appear in the
official NCERT textbook for this chapter.

Return ONLY valid JSON:
{ "topics": [same structure as extraction schema] }`;

  try {
    const result = await generateJSON<ConceptExtractionResult>(prompt, {
      task: "PDF_EXTRACTION",
    });
    return normalizeExtractionResult(result, chapterName);
  } catch {
    return generateFallbackConceptTopics(chapterName, subject);
  }
}

export async function storeExtractedTopics(
  chapterId: number,
  topics: ExtractedConceptTopic[],
  source: Exclude<ContentSource, "unknown"> = "pdf",
) {
  const concepts: ConceptData[] = [];
  clearConceptCacheForChapter(chapterId);

  if (sql) {
    const topicsJson = JSON.stringify(topics);

    await sql.transaction((tx) => [
      tx`DELETE FROM concepts WHERE chapter_id = ${chapterId}`,
      tx`DELETE FROM topics WHERE chapter_id = ${chapterId}`,
      tx`
        WITH topic_input AS (
          SELECT *
          FROM jsonb_to_recordset(${topicsJson}::jsonb)
            AS topic(name text, importance text, concepts jsonb)
        ),
        inserted_topics AS (
          INSERT INTO topics (chapter_id, name, importance)
          SELECT ${chapterId}, name, importance
          FROM topic_input
          RETURNING id, name
        ),
        concept_input AS (
          SELECT
            inserted_topics.id AS topic_id,
            concept.text,
            concept.type,
            concept.bloom_level,
            concept.hots_potential
          FROM topic_input
          JOIN inserted_topics ON inserted_topics.name = topic_input.name
          CROSS JOIN LATERAL jsonb_to_recordset(topic_input.concepts)
            AS concept(
              text text,
              type text,
              bloom_level text,
              hots_potential boolean
            )
        )
        INSERT INTO concepts (
          topic_id, chapter_id, text, type, bloom_level, hots_potential, source
        )
        SELECT
          topic_id, ${chapterId}, text, type, bloom_level, hots_potential, ${source}
        FROM concept_input
      `,
    ]);

    topics.forEach((topic) =>
      topic.concepts.forEach((concept) =>
        concepts.push(toConceptData(chapterId, topic.name, concept, source)),
      ),
    );

    return concepts;
  }

  if (source !== "demo") {
    throw new Error("Database is not configured for PDF extraction.");
  }

  topics.forEach((topic) =>
    topic.concepts.forEach((concept) =>
      concepts.push(toConceptData(chapterId, topic.name, concept, source)),
    ),
  );

  return concepts;
}

interface GetChapterContentOptions {
  allowDemoFallback?: boolean;
  allowCurriculumFallback?: boolean;
  requireKnownSource?: boolean;
  onLocalNcertDiagnostics?: (diagnostics: LocalNcertSourceDiagnostics) => void;
}

export async function getChapterContent(
  chapterIds: number[],
  subject: string,
  classNum: number,
  options: GetChapterContentOptions = {},
) {
  const subjects = subject.split(" + ").map((item) => item.trim()).filter(Boolean);
  const cacheKey = conceptCacheKey(chapterIds, subjects, classNum, options);
  const cached = conceptCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    cached.localNcertDiagnostics?.forEach((diagnostics) =>
      options.onLocalNcertDiagnostics?.({
        ...diagnostics,
        cacheHit: true,
      }),
    );
    return cached.concepts;
  }

  const concepts: ConceptData[] = [];
  const localNcertDiagnostics: LocalNcertSourceDiagnostics[] = [];

  for (const chapterId of chapterIds) {
    const fromDb = await getConceptsFromDB(chapterId);
    if (hasRealSourceTextConcepts(fromDb)) {
      concepts.push(...fromDb);
      continue;
    }

    const fromLocalNcert = await getLocalNcertChapterSource(
      classNum,
      subjects,
      chapterId,
    );
    options.onLocalNcertDiagnostics?.(fromLocalNcert.diagnostics);
    localNcertDiagnostics.push(fromLocalNcert.diagnostics);
    if (fromLocalNcert.concepts.length) {
      concepts.push(...fromLocalNcert.concepts);
      continue;
    }

    if (fromDb.length && (!options.requireKnownSource || hasKnownBackedConcepts(fromDb))) {
      concepts.push(...fromDb);
      continue;
    }

    const fromCurriculum = options.allowCurriculumFallback
      ? await getCurriculumConceptsFromDB(chapterId)
      : [];
    if (fromCurriculum.length) {
      concepts.push(...fromCurriculum);
      continue;
    }

    const fromStaticCurriculum = options.allowCurriculumFallback
      ? getCurriculumConceptsForChapters(classNum, subjects, [chapterId])
      : [];
    if (fromStaticCurriculum.length) {
      concepts.push(...fromStaticCurriculum);
      continue;
    }

    if (!options.allowDemoFallback) {
      throw new Error(
        options.requireKnownSource
          ? await buildStrictSourceErrorMessage(chapterId, subjects, classNum)
          : `No extracted concepts found for chapter ${chapterId}.`,
      );
    }

    const chapterName = await getChapterName(chapterId, subjects, classNum);
    const subjectForChapter =
      subjects.find((item) => chapterName.startsWith(item)) ?? subjects[0] ?? subject;
    const topics = await generateDemoContent(chapterName, subjectForChapter, classNum);
    concepts.push(...(await storeExtractedTopics(chapterId, topics, "demo")));
  }

  conceptCache.set(cacheKey, {
    concepts,
    localNcertDiagnostics,
    expiresAt: Date.now() + conceptCacheTtlMs,
  });

  return concepts;
}

function conceptCacheKey(
  chapterIds: number[],
  subjects: string[],
  classNum: number,
  options: GetChapterContentOptions,
) {
  return JSON.stringify({
    classNum,
    subjects: subjects.map((item) => item.toLowerCase()).sort(),
    chapterIds: chapterIds.slice().sort((left, right) => left - right),
    allowDemoFallback: Boolean(options.allowDemoFallback),
    allowCurriculumFallback: Boolean(options.allowCurriculumFallback),
    requireKnownSource: Boolean(options.requireKnownSource),
  });
}

function clearConceptCacheForChapter(_chapterId: number) {
  conceptCache.clear();
}

function hasRealSourceTextConcepts(concepts: ConceptData[]) {
  return concepts.some(
    (concept) =>
      String(concept.type).toUpperCase() === "PDF_SOURCE_TEXT" &&
      concept.text.replace(/\s+/g, " ").trim().length >= 450,
  );
}

function hasKnownBackedConcepts(concepts: ConceptData[]) {
  if (!concepts.length) return false;
  if (hasRealSourceTextConcepts(concepts)) return true;

  const sourceQuality = analyzeConceptSourceQuality(concepts);
  if (sourceQuality.quality !== "strong") return false;

  return concepts.some((concept) => concept.source === "pdf");
}

async function getConceptsFromDB(chapterId: number) {
  if (!sql) return [];

  try {
    const countRows = await sql`
      SELECT COUNT(*)::int AS count
      FROM concepts c
      JOIN chapters ch ON ch.id = c.chapter_id
      WHERE c.chapter_id = ${chapterId}
      AND ch.name NOT ILIKE '%Full Book Source%'
    `;
    if (!Number(countRows[0].count)) return [];

    const rows = await sql`
      SELECT
        c.text,
        c.type,
        c.bloom_level,
        c.hots_potential,
        c.source,
        t.id AS topic_id,
        t.name AS topic_name,
        ch.name AS chapter_name,
        s.name AS subject_name,
        s.class_num
      FROM concepts c
      LEFT JOIN topics t ON t.id = c.topic_id
      LEFT JOIN chapters ch ON ch.id = c.chapter_id
      LEFT JOIN subjects s ON s.id = ch.subject_id
      WHERE c.chapter_id = ${chapterId}
      AND ch.name NOT ILIKE '%Full Book Source%'
      ORDER BY c.id ASC
    `;

    return rows.map((row) => ({
      text: row.text,
      type: row.type,
      bloomLevel: row.bloom_level,
      hotsPotential: Boolean(row.hots_potential),
      hotsPoential: Boolean(row.hots_potential),
      topicName: row.topic_name ?? "General",
      topicId: row.topic_id ? Number(row.topic_id) : undefined,
      chapterId,
      chapterName: row.chapter_name ?? undefined,
      subject: row.subject_name ?? undefined,
      classNum: row.class_num ? Number(row.class_num) : undefined,
      source: normalizeStoredSource(row.source),
    })) satisfies ConceptData[];
  } catch (error) {
    console.warn(
      `Skipping stored concept lookup for chapter ${chapterId}: ${safeErrorMessage(error)}`,
    );
    return [];
  }
}

async function getCurriculumConceptsFromDB(chapterId: number) {
  if (!sql) return [];

  try {
    const rows = await sql`
      SELECT
        c.name AS chapter_name,
        s.name AS subject_name,
        s.class_num,
        t.id AS topic_id,
        t.name AS topic_name,
        t.importance
      FROM chapters c
      JOIN subjects s ON s.id = c.subject_id
      LEFT JOIN topics t ON t.chapter_id = c.id
      WHERE c.id = ${chapterId}
      AND c.name NOT ILIKE '%Full Book Source%'
      ORDER BY t.id ASC
    `;

    if (!rows.length) return [];
    const chapterName = rows[0].chapter_name ?? `Chapter ${chapterId}`;
    const subjectName = rows[0].subject_name ?? "CBSE";
    const classNum = rows[0].class_num ?? "";
    const topicRows = rows.filter((row) => row.topic_name);

    if (!topicRows.length) {
        return [
          {
            text: `Class ${classNum} ${subjectName} chapter "${chapterName}" is available in the curriculum. Generate questions only from this chapter title and do not invent unsupported textbook details.`,
            type: "CURRICULUM_CHAPTER",
            bloomLevel: "UNDERSTAND",
            hotsPotential: false,
            hotsPoential: false,
            subject: subjectName,
            classNum: Number(classNum) || undefined,
            chapterName,
            topicName: chapterName,
            topicId: undefined,
            chapterId,
          source: "curriculum",
        },
      ] satisfies ConceptData[];
    }

    return topicRows.map((row) => ({
      text: `Class ${classNum} ${subjectName} chapter "${chapterName}" includes the curriculum topic "${row.topic_name}". Generate fresh CBSE-style questions only within this chapter and topic.`,
      type: row.importance === "HIGH" ? "CURRICULUM_CORE_TOPIC" : "CURRICULUM_TOPIC",
      bloomLevel: row.importance === "HIGH" ? "APPLY" : "UNDERSTAND",
      hotsPotential: row.importance === "HIGH",
      hotsPoential: row.importance === "HIGH",
      subject: subjectName,
      classNum: Number(classNum) || undefined,
      chapterName,
      topicName: row.topic_name,
      topicId: row.topic_id ? Number(row.topic_id) : undefined,
      chapterId,
      source: "curriculum",
    })) satisfies ConceptData[];
  } catch (error) {
    console.warn(
      `Skipping curriculum DB lookup for chapter ${chapterId}: ${safeErrorMessage(error)}`,
    );
    return [];
  }
}

async function getChapterName(
  chapterId: number,
  selectedSubjects: string[],
  classNum: number,
) {
  if (sql) {
    try {
      const rows = await sql`SELECT name FROM chapters WHERE id = ${chapterId} LIMIT 1`;
      if (rows[0]?.name) return String(rows[0].name);
    } catch {
      // Demo lookup below.
    }
  }

  for (const subject of selectedSubjects) {
    const match = getDemoChapters(classNum, subject).find(
      (chapter) => chapter.id === chapterId,
    );
    if (match) return match.name;
  }

  return `${selectedSubjects[0] ?? "NCERT"} Chapter ${chapterId}`;
}

function normalizeExtractionResult(
  result: ConceptExtractionResult,
  chapterName: string,
): ExtractedConceptTopic[] {
  const topics = Array.isArray(result?.topics) ? result.topics : [];
  if (!topics.length) return generateFallbackConceptTopics(chapterName, "NCERT");

  return topics.map((topic) => ({
    name: topic.name || chapterName,
    importance: normalizeImportance(topic.importance),
    concepts: Array.isArray(topic.concepts)
      ? topic.concepts
          .filter((concept) => concept?.text)
          .map((concept) => ({
            text: concept.text,
            type: normalizeConceptType(concept.type),
            bloom_level: normalizeBloom(concept.bloom_level),
            hots_potential: Boolean(concept.hots_potential),
            learning_outcome: concept.learning_outcome,
          }))
      : [],
    key_formulas: topic.key_formulas ?? [],
    key_experiments: topic.key_experiments ?? [],
    real_life_applications: topic.real_life_applications ?? [],
    common_misconceptions: topic.common_misconceptions ?? [],
  }));
}

function generateFallbackConceptTopics(
  chapterName: string,
  subject: string,
): ExtractedConceptTopic[] {
  return [
    {
      name: `${chapterName} Core Ideas`,
      importance: "HIGH",
      concepts: [
        {
          text: `${chapterName} introduces the central NCERT ideas of ${subject}, including key terms, definitions, relationships, and examples used in board-style questions.`,
          type: "DEFINITION",
          bloom_level: "UNDERSTAND",
          hots_potential: false,
        },
        {
          text: `Students apply ${chapterName} concepts to familiar Indian daily-life situations, explaining cause-effect links rather than repeating isolated facts.`,
          type: "APPLICATION",
          bloom_level: "APPLY",
          hots_potential: true,
        },
        {
          text: `A common misconception in ${chapterName} is confusing the visible example with the underlying principle, so answers must mention the principle and evidence.`,
          type: "FACT",
          bloom_level: "ANALYZE",
          hots_potential: true,
        },
      ],
      key_formulas: [],
      key_experiments: [],
      real_life_applications: [`Use ${chapterName} concepts in household or school observations.`],
      common_misconceptions: ["Memorising terms without explaining the reason."],
    },
  ];
}

function toConceptData(
  chapterId: number,
  topicName: string,
  concept: ExtractedConceptTopic["concepts"][number],
  source: Exclude<ContentSource, "unknown">,
): ConceptData {
  return {
    text: concept.text,
    type: concept.type,
    bloomLevel: concept.bloom_level,
    hotsPotential: concept.hots_potential,
    hotsPoential: concept.hots_potential,
    topicName,
    chapterId,
    source,
  };
}

function assertKnownBackedConcepts(concepts: ConceptData[], errorMessage?: string) {
  if (!hasKnownBackedConcepts(concepts)) {
    throw new Error(
      errorMessage ??
        "This chapter does not have PDF or curriculum-backed content yet.",
    );
  }
}

async function buildStrictSourceErrorMessage(
  chapterId: number,
  selectedSubjects: string[],
  classNum: number,
) {
  const chapterName = await getChapterName(chapterId, selectedSubjects, classNum);
  return `Chapter "${chapterName}" does not have usable NCERT PDF extraction or curriculum topic data yet. Add it to the curriculum data or upload the chapter PDF before generating a paper.`;
}

function normalizeStoredSource(value: unknown): ContentSource {
  return value === "pdf" || value === "curriculum" || value === "demo"
    ? value
    : "unknown";
}

function safeErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error ?? "unknown error");
}

function normalizeImportance(value: unknown): "LOW" | "MEDIUM" | "HIGH" {
  return value === "LOW" || value === "HIGH" || value === "MEDIUM"
    ? value
    : "MEDIUM";
}

function normalizeConceptType(
  value: unknown,
): ExtractedConceptTopic["concepts"][number]["type"] {
  const allowed = [
    "DEFINITION",
    "FORMULA",
    "EXPERIMENT",
    "EXAMPLE",
    "APPLICATION",
    "ACTIVITY",
    "FACT",
  ];
  return allowed.includes(String(value))
    ? (String(value) as ExtractedConceptTopic["concepts"][number]["type"])
    : "FACT";
}

function normalizeBloom(value: unknown): BloomLevel {
  const allowed = ["REMEMBER", "UNDERSTAND", "APPLY", "ANALYZE", "EVALUATE", "CREATE"];
  return allowed.includes(String(value)) ? (String(value) as BloomLevel) : "UNDERSTAND";
}

function inferLocalPdfTitle(paragraphs: string[], fallbackTitle: string) {
  const fallback = normalizeOptionalText(fallbackTitle).replace(/\.pdf$/i, "");
  const heading = paragraphs.find((line) => looksLikeHeading(line));
  return heading ? topicNameFromText(heading, 90) : fallback || "Uploaded Chapter PDF";
}

function inferLocalTopicSeeds(paragraphs: string[], title: string) {
  const headingSeeds = paragraphs
    .filter((line) => looksLikeHeading(line))
    .map((line) => topicNameFromText(line, 80));
  const sentenceSeeds = paragraphs
    .flatMap((paragraph) => paragraph.split(/(?<=[.!?])\s+/))
    .filter((sentence) => sentence.split(/\s+/).length >= 6)
    .map((sentence) => topicNameFromText(sentence, 72));

  const seeds = uniqueText([title, ...headingSeeds, ...sentenceSeeds])
    .filter((seed) => seed.length >= 8)
    .slice(0, 10);

  return seeds.length ? seeds : ["Core Ideas"];
}

function chunkParagraphsForTopics(paragraphs: string[], topicCount: number) {
  const count = Math.max(1, topicCount);
  const chunkSize = Math.max(3, Math.ceil(paragraphs.length / count));
  const chunks: string[][] = [];

  for (let index = 0; index < count; index += 1) {
    const start = index * chunkSize;
    const chunk = paragraphs.slice(start, start + chunkSize);
    chunks.push(chunk.length ? chunk : paragraphs.slice(0, chunkSize));
  }

  return chunks;
}

function localTopicFromText(
  name: string,
  paragraphs: string[],
  index: number,
): ExtractedConceptTopic {
  const conceptTexts = uniqueText(
    paragraphs
      .flatMap((paragraph) => paragraph.split(/(?<=[.!?])\s+/))
      .map((sentence) => normalizeOptionalText(sentence))
      .filter((sentence) => sentence.length >= 45),
  ).slice(0, 6);
  const fallbackText =
    conceptTexts.length > 0
      ? conceptTexts
      : [
          normalizeOptionalText(paragraphs.join(" ")).slice(0, 700) ||
            `${name} is an important concept from the uploaded PDF.`,
        ];

  return {
    name: topicNameFromText(name, 90),
    importance: index < 3 ? "HIGH" : "MEDIUM",
    concepts: fallbackText.map((text, conceptIndex) => ({
      text: text.slice(0, 900),
      type: inferConceptType(text),
      bloom_level: conceptIndex % 3 === 0 ? "UNDERSTAND" : "APPLY",
      hots_potential: conceptIndex % 3 === 2,
      learning_outcome: `Student will understand ${topicNameFromText(name, 70)} from the uploaded PDF.`,
    })),
    key_formulas: paragraphs.filter((line) => /[=+\-*/^]|formula|equation/i.test(line)).slice(0, 6),
    key_experiments: paragraphs
      .filter((line) => /experiment|activity|observe|diagram|figure|practical/i.test(line))
      .slice(0, 6),
    real_life_applications: paragraphs
      .filter((line) => /daily life|application|example|used|useful|real/i.test(line))
      .slice(0, 6),
    common_misconceptions: [],
  };
}

function looksLikeHeading(line: string) {
  const words = line.split(/\s+/).filter(Boolean);
  if (words.length < 2 || words.length > 14) return false;
  if (line.length > 100) return false;
  if (/[.!?]$/.test(line) && words.length > 6) return false;
  return /^[\d.\sA-Za-z()[\]:-]+$/.test(line);
}

function topicNameFromText(value: string, maxLength: number) {
  const cleaned = value
    .replace(/^\s*(chapter|unit|topic|section)?\s*\d+[\s.:-]*/i, "")
    .replace(/\s+/g, " ")
    .trim();

  if (cleaned.length <= maxLength) return cleaned || "Core Ideas";

  const clipped = cleaned.slice(0, maxLength).replace(/\s+\S*$/, "").trim();
  return clipped || cleaned.slice(0, maxLength).trim();
}

function inferConceptType(text: string): ExtractedConceptTopic["concepts"][number]["type"] {
  if (/[=+\-*/^]|formula|equation/i.test(text)) return "FORMULA";
  if (/experiment|activity|observe|practical/i.test(text)) return "EXPERIMENT";
  if (/for example|example|such as/i.test(text)) return "EXAMPLE";
  if (/used|application|daily life|real/i.test(text)) return "APPLICATION";
  if (/is called|defined as|definition|means/i.test(text)) return "DEFINITION";
  return "FACT";
}

function uniqueText(values: string[]) {
  const seen = new Set<string>();
  const output: string[] = [];

  for (const value of values) {
    const cleaned = normalizeOptionalText(value);
    const key = cleaned.toLowerCase();
    if (!cleaned || seen.has(key)) continue;
    seen.add(key);
    output.push(cleaned);
  }

  return output;
}

function normalizeOptionalText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeClassNum(value: unknown) {
  const numberValue = Number(value);
  return Number.isInteger(numberValue) && numberValue >= 6 && numberValue <= 12
    ? numberValue
    : undefined;
}
