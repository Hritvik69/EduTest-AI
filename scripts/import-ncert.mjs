#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { neon } from "@neondatabase/serverless";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { PDFParse } from "pdf-parse";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const ncertRoot = path.join(projectRoot, "NCERT_Books");
const artifactsDir = path.join(projectRoot, "artifacts");
const args = parseArgs(process.argv.slice(2));
const reportPath = args["report-path"]
  ? path.resolve(projectRoot, String(args["report-path"]))
  : path.join(artifactsDir, "ncert-import-report.json");
const dryRun = Boolean(args["dry-run"]);
const textOnlyImport = Boolean(args["text-only"]);
const writeTextFiles = Boolean(args["write-text"]);
const deactivateExisting = Boolean(args["deactivate-existing"]);
const allowFullBookFallback = Boolean(args["allow-full-book-fallback"]);
const maxPdfs = positiveInt(args["max-pdfs"]);
const maxChapters = positiveInt(args["max-chapters"]);
const textLimit = positiveInt(args["text-limit"]) ?? 18000;
const classFilter = positiveInt(args.class);
const subjectFilter = typeof args.subject === "string" ? normalizeSubjectName(args.subject) : "";
const chapterFilter = typeof args.chapter === "string" ? args.chapter.toLowerCase().trim() : "";

loadEnvFile(path.join(projectRoot, ".env.local"));

const expectedCoverage = {
  "6th": ["English", "Hindi", "Mathematics", "Science", "Social_Science", "Computer_IT"],
  "7th": ["English", "Hindi", "Mathematics", "Science", "Social_Science", "Computer_IT"],
  "8th": ["English", "Hindi", "Mathematics", "Science", "Social_Science", "Computer_IT"],
  "9th": ["English", "Hindi", "Mathematics", "Science", "Social_Science", "Computer_IT"],
  "10th": ["English", "Hindi", "Mathematics", "Science", "Social_Science", "Computer_IT"],
  "11th": [
    "English",
    "Hindi",
    "Mathematics",
    "Physics",
    "Chemistry",
    "Biology",
    "Social_Science",
    "Computer_IT",
  ],
  "12th": [
    "English",
    "Hindi",
    "Mathematics",
    "Physics",
    "Chemistry",
    "Biology",
    "Social_Science",
    "Computer_IT",
  ],
};

async function main() {
  if (!fs.existsSync(ncertRoot)) {
    throw new Error(`NCERT_Books folder not found at ${ncertRoot}`);
  }

  const scanned = scanPdfs();
  const pdfs = maxPdfs ? scanned.pdfs.slice(0, maxPdfs) : scanned.pdfs;
  const filteredPdfs = pdfs.filter((pdf) => matchesImportFilters(pdf));
  const subjectBookCounts = countBooksBySubject(scanned.pdfs);
  const report = {
    mode: dryRun ? "dry-run" : "import",
    generatedAt: new Date().toISOString(),
    root: ncertRoot,
    scannedPdfCount: scanned.pdfs.length,
    filteredPdfCount: filteredPdfs.length,
    extractionMode: textOnlyImport ? "text-only" : "ai-concepts",
    importedPdfCount: 0,
    chapterCount: 0,
    conceptCount: 0,
    skippedDuplicates: scanned.skippedDuplicates,
    missingCoverage: scanned.missingCoverage,
    skipped: [],
    books: [],
  };

  const sql = dryRun ? null : await connectDatabase();
  if (sql) {
    await ensureImportSchema(sql);
    if (deactivateExisting) {
      await deactivateExistingCurriculum(sql);
    }
  }

  let importedChapters = 0;

  for (const pdf of filteredPdfs) {
    if (maxChapters && importedChapters >= maxChapters) break;

    const book = {
      classNum: pdf.classNum,
      subject: pdf.subjectDisplay,
      bookTitle: pdf.bookTitle,
      path: pdf.relativePath,
      chapters: [],
      skipped: [],
    };
    report.books.push(book);

    let parsed;
    try {
      parsed = dryRun
        ? await detectChapters(pdf.absolutePath)
        : await parsePdfWithChapters(pdf.absolutePath);
    } catch (error) {
      const reason = errorMessage(error);
      report.skipped.push({ path: pdf.relativePath, reason });
      book.skipped.push({ reason });
      continue;
    }

    if (!parsed.chapters.length) {
      if (!dryRun && allowFullBookFallback && parsed.pages?.length) {
        const reason =
          "No confident TOC chapter ranges detected; importing the whole book as one source-backed fallback chapter.";
        parsed.chapters = [
          {
            title: "Full Book Source",
            startPage: 1,
            endPage: parsed.total,
            printedPage: 1,
          },
        ];
        book.fallback = reason;
      } else {
        const reason = "No confident TOC chapter ranges detected.";
        report.skipped.push({ path: pdf.relativePath, reason });
        book.skipped.push({ reason });
        continue;
      }
    }

    const useBookPrefix = (subjectBookCounts.get(subjectKey(pdf)) ?? 0) > 1;
    const chapterFiltered = chapterFilter
      ? parsed.chapters.filter((chapter) =>
          chapter.title.toLowerCase().includes(chapterFilter),
        )
      : parsed.chapters;
    const selectedChapters = maxChapters
      ? chapterFiltered.slice(0, Math.max(0, maxChapters - importedChapters))
      : chapterFiltered;

    let subjectId;
    if (sql) {
      subjectId = await upsertSubject(sql, pdf.subjectDisplay, pdf.classNum);
    }

    for (const chapter of selectedChapters) {
      const chapterName = useBookPrefix
        ? `${pdf.bookTitle} - ${chapter.title}`
        : chapter.title;
      const chapterRecord = {
        name: chapterName,
        pageStart: chapter.startPage,
        pageEnd: chapter.endPage,
        printedPage: chapter.printedPage,
      };
      book.chapters.push(chapterRecord);
      report.chapterCount += 1;
      importedChapters += 1;

      if (dryRun) continue;

      const chapterText = extractPageRangeTextFromPages(
        parsed.pages,
        chapter.startPage,
        chapter.endPage,
        textLimit,
      );
      if (chapterText.length < 250) {
        const reason = "Chapter text extraction produced too little readable content.";
        report.skipped.push({ path: pdf.relativePath, chapter: chapterName, reason });
        book.skipped.push({ chapter: chapterName, reason });
        continue;
      }
      if (writeTextFiles) {
        chapterRecord.textPath = await writeChapterTextFile({
          pdf,
          chapter,
          chapterName,
          chapterText,
        });
      }

      const topics = textOnlyImport
        ? extractConceptsFromTextOnly(chapterText, chapterName, pdf.subjectDisplay)
        : await extractConceptsWithAI(
            chapterText,
            chapterName,
            pdf.subjectDisplay,
            pdf.classNum,
          );
      const chapterId = await upsertChapter(sql, {
        subjectId,
        chapterName,
        bookTitle: pdf.bookTitle,
        sourcePdfPath: pdf.relativePath,
        pageStart: chapter.startPage,
        pageEnd: chapter.endPage,
      });
      const conceptCount = await replaceChapterConcepts(sql, chapterId, topics);
      chapterRecord.conceptsCount = conceptCount;
      report.conceptCount += conceptCount;
    }

    if (!dryRun) report.importedPdfCount += 1;
  }

  await mkdir(artifactsDir, { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  console.log(`Mode: ${report.mode}`);
  console.log(`PDFs scanned: ${report.scannedPdfCount}`);
  console.log(`PDFs processed: ${filteredPdfs.length}`);
  console.log(`Chapters detected: ${report.chapterCount}`);
  console.log(`Concepts imported: ${report.conceptCount}`);
  console.log(`Extraction mode: ${report.extractionMode}`);
  console.log(`Report: ${reportPath}`);

  if (report.missingCoverage.length) {
    console.log("Missing PDF coverage:");
    report.missingCoverage.forEach((item) =>
      console.log(`- Class ${item.classNum} ${normalizeSubjectName(item.subject)}`),
    );
  }
}

function scanPdfs() {
  const pdfs = [];
  const skippedDuplicates = [];
  const missingCoverage = [];

  for (const classDirName of sortedDirNames(ncertRoot)) {
    const classNum = Number(classDirName.replace(/\D/g, ""));
    const classDir = path.join(ncertRoot, classDirName);
    if (!classNum || !fs.statSync(classDir).isDirectory()) continue;

    for (const entry of fs.readdirSync(classDir, { withFileTypes: true })) {
      const entryPath = path.join(classDir, entry.name);
      if (entry.isFile() && isPdf(entry.name)) {
        skippedDuplicates.push(path.relative(projectRoot, entryPath));
        continue;
      }

      if (!entry.isDirectory()) continue;

      const subjectFolder = entry.name;
      const subjectDisplay = normalizeSubjectName(subjectFolder);
      const subjectDir = entryPath;
      const files = fs
        .readdirSync(subjectDir, { withFileTypes: true })
        .filter((file) => file.isFile() && isPdf(file.name))
        .map((file) => path.join(subjectDir, file.name))
        .sort((left, right) => left.localeCompare(right));

      files.forEach((absolutePath) => {
        pdfs.push({
          classDirName,
          classNum,
          subjectFolder,
          subjectDisplay,
          bookTitle: bookTitleFromFile(absolutePath),
          absolutePath,
          relativePath: path.relative(projectRoot, absolutePath).replace(/\\/g, "/"),
        });
      });
    }
  }

  for (const [classDirName, subjects] of Object.entries(expectedCoverage)) {
    const classDir = path.join(ncertRoot, classDirName);
    for (const subject of subjects) {
      const subjectDir = path.join(classDir, subject);
      const count = fs.existsSync(subjectDir)
        ? fs.readdirSync(subjectDir).filter(isPdf).length
        : 0;
      if (!count) {
        missingCoverage.push({
          classNum: Number(classDirName.replace(/\D/g, "")),
          subject,
        });
      }
    }
  }

  return { pdfs, skippedDuplicates, missingCoverage };
}

function sortedDirNames(root) {
  return fs
    .readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((left, right) => Number(left.replace(/\D/g, "")) - Number(right.replace(/\D/g, "")));
}

function isPdf(value) {
  return value.toLowerCase().endsWith(".pdf");
}

function countBooksBySubject(pdfs) {
  const counts = new Map();
  pdfs.forEach((pdf) => {
    const key = subjectKey(pdf);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  });
  return counts;
}

function subjectKey(pdf) {
  return `${pdf.classNum}:${pdf.subjectDisplay}`;
}

function matchesImportFilters(pdf) {
  if (classFilter && pdf.classNum !== classFilter) return false;
  if (
    subjectFilter &&
    pdf.subjectDisplay.toLowerCase() !== subjectFilter.toLowerCase()
  ) {
    return false;
  }
  return true;
}

function normalizeSubjectName(folderName) {
  return folderName.replace(/_/g, " ").replace(/\s+/g, " ").trim();
}

function bookTitleFromFile(filePath) {
  return path
    .basename(filePath, ".pdf")
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function detectChapters(pdfPath) {
  const { pages, total } = await extractPages(pdfPath, { first: 1, last: 35 });
  return detectChaptersFromPages(pages, total);
}

async function parsePdfWithChapters(pdfPath) {
  const { pages, total } = await extractPages(pdfPath, {});
  return {
    ...detectChaptersFromPages(pages.slice(0, 35), total),
    pages,
  };
}

function detectChaptersFromPages(pages, total) {
  const tocPages = pages.filter((page) => looksLikeTocPage(page.text));
  const tocText = tocPages.map((page) => page.text).join("\n");
  const tocEntries = parseTocEntries(tocText);

  if (tocEntries.length < 1) {
    return { total, pages, chapters: [] };
  }

  const offset =
    inferPrintedPageOffset(pages, tocPages, tocEntries) ??
    fallbackOffset(tocPages, tocEntries);
  const chapters = tocEntries
    .map((entry, index) => {
      const startPage = clampPage(entry.printedPage + offset, total);
      const nextPrinted = tocEntries[index + 1]?.printedPage;
      const endPage = nextPrinted
        ? clampPage(nextPrinted + offset - 1, total)
        : total;
      return {
        title: entry.title,
        printedPage: entry.printedPage,
        startPage,
        endPage: Math.max(startPage, endPage),
      };
    })
    .filter((chapter) => chapter.endPage >= chapter.startPage);

  return { total, pages, chapters: dedupeChapters(chapters) };
}

async function extractPages(pdfPath, params) {
  const data = await readFile(pdfPath);
  const parser = new PDFParse({ data });
  try {
    const result = await parser.getText({
      ...params,
      pageJoiner: "",
      disableCombineTextItems: false,
    });
    return {
      total: result.total,
      pages: result.pages.map((page) => ({
        num: page.num,
        text: cleanExtractedText(page.text ?? ""),
      })),
    };
  } finally {
    await parser.destroy();
  }
}

function looksLikeTocPage(text) {
  const normalized = text.toLowerCase();
  const chapterMentions = (normalized.match(/\bchapter\b/g) ?? []).length;
  const numberedLines = text.split(/\n+/).filter((line) => parseTocLine(line)).length;
  return normalized.includes("contents") || chapterMentions >= 2 || numberedLines >= 4;
}

function parseTocEntries(text) {
  const entries = [];
  const seen = new Set();
  const lines = text
    .split(/\n+/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  let generatedNumber = 1;
  let pendingChapterNumber = null;
  let pendingTitle = "";

  for (const rawLine of lines) {
    const chapterOnly = rawLine.match(/^Chapter\s+(\d+)$/i);
    if (chapterOnly) {
      pendingChapterNumber = Number(chapterOnly[1]);
      pendingTitle = "";
      continue;
    }

    if (/^Unit\s+\d+/i.test(rawLine)) {
      pendingChapterNumber = null;
      pendingTitle = "";
      continue;
    }

    const lineEntries = extractTocEntriesFromLine(rawLine);
    if (lineEntries.length) {
      for (const entry of lineEntries) {
        addTocEntry(entries, seen, entry);
        generatedNumber = Math.max(generatedNumber, entry.number + 1);
      }
      pendingTitle = "";
      continue;
    }

    const titlePage = rawLine.match(/^(.+?)\s+(\d{1,4})$/);
    if (titlePage && !/foreword|about the book|learning material|answers/i.test(rawLine)) {
      const title = normalizeChapterTitle(
        `${pendingTitle ? `${pendingTitle} ` : ""}${titlePage[1]}`,
      );
      const entry = {
        number: pendingChapterNumber ?? generatedNumber,
        title,
        printedPage: Number(titlePage[2]),
      };
      if (title && entry.printedPage > 0) {
        addTocEntry(entries, seen, entry);
        generatedNumber = Math.max(generatedNumber + 1, entry.number + 1);
      }
      pendingChapterNumber = null;
      pendingTitle = "";
      continue;
    }

    if (
      !lineEntries.length &&
      !/contents|foreword|about the book|reprint/i.test(rawLine) &&
      rawLine.length >= 4 &&
      rawLine.length <= 90
    ) {
      pendingTitle = pendingTitle ? `${pendingTitle} ${rawLine}` : rawLine;
    }
  }

  return entries
    .filter((entry) => entry.printedPage > 0)
    .sort((left, right) => left.printedPage - right.printedPage || left.number - right.number);
}

function addTocEntry(entries, seen, entry) {
  const key = `${entry.number}:${entry.title.toLowerCase()}:${entry.printedPage}`;
  if (seen.has(key)) return;
  seen.add(key);
  entries.push(entry);
}

function extractTocEntriesFromLine(rawLine) {
  const direct = parseTocLine(rawLine);
  if (direct) return [direct];

  const line = rawLine.replace(/\s+/g, " ").replace(/\.{2,}/g, " ").trim();
  const entries = [];
  const chapterPattern = /Chapter\s+(\d+)\s+(.+?)\s+(\d{1,4})(?=\s+Chapter\s+\d+|$)/gi;
  let match;
  while ((match = chapterPattern.exec(line))) {
    const entry = tocEntryFromMatch(match);
    if (entry) entries.push(entry);
  }
  if (entries.length) return entries;

  const numberedPattern = /(?:^|\s)(\d+)[.)]\s+(.+?)\s+(\d{1,4})(?=\s+\d+[.)]\s+|$)/g;
  while ((match = numberedPattern.exec(line))) {
    const entry = tocEntryFromMatch(match);
    if (entry) entries.push(entry);
  }

  return entries;
}

function tocEntryFromMatch(match) {
  const number = Number(match[1]);
  const printedPage = Number(match[3]);
  const title = normalizeChapterTitle(match[2]);
  if (!number || !printedPage || !title || isSectionTitle(title)) return null;
  return { number, title, printedPage };
}

function parseTocLine(rawLine) {
  const line = rawLine
    .replace(/\s+/g, " ")
    .replace(/\.{2,}/g, " ")
    .trim();
  if (!line || /foreword|preface|acknowledg|rationalisation|answers/i.test(line)) {
    return null;
  }

  const patterns = [
    /^Chapter\s+(\d+)\s+(.+?)\s+(\d{1,4})$/i,
    /^(\d+)[.)]\s+(.+?)\s+(\d{1,4})$/,
    /^(?:Unit|Prose|Poem|Story)\s+(\d+)\s*[:.-]\s*(.+?)\s+(\d{1,4})$/i,
  ];

  for (const pattern of patterns) {
    const match = line.match(pattern);
    if (!match) continue;
    const number = Number(match[1]);
    const printedPage = Number(match[3]);
    const title = normalizeChapterTitle(match[2]);
    if (!number || !printedPage || !title || isSectionTitle(title)) continue;
    return { number, title, printedPage };
  }

  return null;
}

function normalizeChapterTitle(value) {
  return value
    .replace(/\bReprint\s+\d{4}-\d{2}\b/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\s+[-–]\s*$/, "");
}

function isSectionTitle(title) {
  return /^\d+\.\d+/.test(title) || /^contents$/i.test(title);
}

function inferPrintedPageOffset(pages, tocPages, entries) {
  const lastTocPage = tocPages.length ? tocPages[tocPages.length - 1].num : 0;
  const searchablePages = pages.filter((page) => page.num > lastTocPage);

  for (const entry of entries.slice(0, 3)) {
    const normalizedTitle = comparableText(entry.title);
    const match = searchablePages.find((page) =>
      comparableText(page.text).includes(normalizedTitle),
    );
    if (match) return match.num - entry.printedPage;
  }
  return null;
}

function fallbackOffset(tocPages, entries) {
  const lastTocPage = tocPages.length ? tocPages[tocPages.length - 1].num : 1;
  const firstPrinted = entries[0]?.printedPage ?? 1;
  return lastTocPage + 1 - firstPrinted;
}

function comparableText(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function clampPage(page, total) {
  return Math.max(1, Math.min(total, page));
}

function dedupeChapters(chapters) {
  const seen = new Set();
  return chapters.filter((chapter) => {
    const key = `${chapter.title.toLowerCase()}:${chapter.startPage}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function extractPageRangeText(pdfPath, first, last, limit) {
  const { pages } = await extractPages(pdfPath, { first, last });
  return extractPageRangeTextFromPages(pages, first, last, limit);
}

function extractPageRangeTextFromPages(pages, first, last, limit) {
  return cleanExtractedText(
    pages
      .filter((page) => page.num >= first && page.num <= last)
      .map((page) => page.text)
      .join("\n"),
  ).slice(0, limit);
}

async function writeChapterTextFile({ pdf, chapter, chapterName, chapterText }) {
  const outputPath = path.join(
    path.dirname(pdf.absolutePath),
    "_extracted_text",
    safePathSegment(pdf.bookTitle, 80),
    `${String(chapter.startPage).padStart(4, "0")}_${safePathSegment(chapterName, 120)}.txt`,
  );
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${chapterText.trim()}\n`, "utf8");
  return path.relative(projectRoot, outputPath).replace(/\\/g, "/");
}

function safePathSegment(value, maxLength) {
  return (
    cleanText(value)
      .replace(/[<>:"/\\|?*\u0000-\u001f]+/g, " ")
      .replace(/\s+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, maxLength) || "chapter"
  );
}

function cleanExtractedText(rawText) {
  const text = repairPdfMojibake(rawText);
  const cleanedLines = [];
  const lines = text
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line) => line && !/^\d+$/.test(line) && line.length >= 8);

  for (const line of lines) {
    if (cleanedLines[cleanedLines.length - 1] === line) continue;
    const previous = cleanedLines[cleanedLines.length - 1];
    if (previous && !/[.!?:;)]$/.test(previous) && /^[a-z(]/.test(line)) {
      cleanedLines[cleanedLines.length - 1] = `${previous} ${line}`.replace(/\s+/g, " ");
      continue;
    }
    cleanedLines.push(line);
  }

  return cleanedLines.join("\n").replace(/[ \t]+/g, " ").trim();
}

const cp1252Reverse = new Map([
  [0x20ac, 0x80],
  [0x201a, 0x82],
  [0x0192, 0x83],
  [0x201e, 0x84],
  [0x2026, 0x85],
  [0x2020, 0x86],
  [0x2021, 0x87],
  [0x02c6, 0x88],
  [0x2030, 0x89],
  [0x0160, 0x8a],
  [0x2039, 0x8b],
  [0x0152, 0x8c],
  [0x017d, 0x8e],
  [0x2018, 0x91],
  [0x2019, 0x92],
  [0x201c, 0x93],
  [0x201d, 0x94],
  [0x2022, 0x95],
  [0x2013, 0x96],
  [0x2014, 0x97],
  [0x02dc, 0x98],
  [0x2122, 0x99],
  [0x0161, 0x9a],
  [0x203a, 0x9b],
  [0x0153, 0x9c],
  [0x017e, 0x9e],
  [0x0178, 0x9f],
]);

function repairPdfMojibake(value) {
  if (!/[\u00c2\u00c3\u00e0\u00e2]/.test(value)) return value;

  const bytes = [];
  for (const character of value) {
    const codePoint = character.codePointAt(0);
    if (cp1252Reverse.has(codePoint)) {
      bytes.push(cp1252Reverse.get(codePoint));
    } else if (codePoint <= 255) {
      bytes.push(codePoint);
    } else {
      return value;
    }
  }

  const repaired = new TextDecoder("utf-8", { fatal: false }).decode(Uint8Array.from(bytes));
  if (mojibakeScore(repaired) >= mojibakeScore(value)) return value;
  if (replacementCount(repaired) > replacementCount(value)) return value;
  return repaired;
}

function mojibakeScore(value) {
  let score = 0;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code === 0x00c2 || code === 0x00c3 || code === 0x00e2 || code === 0xfffd) {
      score += 1;
    }
    if (
      code === 0x00e0 &&
      (value.charCodeAt(index + 1) === 0x00a4 || value.charCodeAt(index + 1) === 0x00a5)
    ) {
      score += 2;
    }
  }
  return score;
}

function replacementCount(value) {
  return (value.match(/\ufffd/g) ?? []).length;
}

async function connectDatabase() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl?.match(/^postgres(?:ql)?:\/\//)) {
    throw new Error("DATABASE_URL is required for real import. Use --dry-run to inspect only.");
  }
  return neon(databaseUrl);
}

async function ensureImportSchema(sql) {
  await sql`ALTER TABLE subjects ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT TRUE`;
  await sql`ALTER TABLE chapters ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT TRUE`;
  await sql`ALTER TABLE chapters ADD COLUMN IF NOT EXISTS book_title VARCHAR(300)`;
  await sql`ALTER TABLE chapters ADD COLUMN IF NOT EXISTS source_pdf_path TEXT`;
  await sql`ALTER TABLE chapters ADD COLUMN IF NOT EXISTS page_start INTEGER`;
  await sql`ALTER TABLE chapters ADD COLUMN IF NOT EXISTS page_end INTEGER`;
  await sql`ALTER TABLE chapters ADD COLUMN IF NOT EXISTS import_source VARCHAR(30) DEFAULT 'curriculum'`;
}

async function deactivateExistingCurriculum(sql) {
  await sql`UPDATE subjects SET active = FALSE`;
  await sql`UPDATE chapters SET active = FALSE`;
}

async function upsertSubject(sql, name, classNum) {
  const rows = await sql`
    INSERT INTO subjects (name, board, class_num, active)
    VALUES (${limitDbText(name, 100)}, 'CBSE', ${classNum}, TRUE)
    ON CONFLICT (name, board, class_num)
    DO UPDATE SET active = TRUE
    RETURNING id
  `;
  return Number(rows[0].id);
}

async function upsertChapter(sql, input) {
  const chapterName = limitDbText(input.chapterName, 500);
  const bookTitle = limitDbText(input.bookTitle, 300);
  const rows = await sql`
    INSERT INTO chapters (
      subject_id, name, status, active, book_title, source_pdf_path,
      page_start, page_end, import_source, error_metadata
    )
    VALUES (
      ${input.subjectId}, ${chapterName}, 'READY', TRUE,
      ${bookTitle}, ${input.sourcePdfPath}, ${input.pageStart},
      ${input.pageEnd}, 'ncert_books', NULL
    )
    ON CONFLICT (subject_id, name)
    DO UPDATE SET
      status = 'READY',
      active = TRUE,
      book_title = EXCLUDED.book_title,
      source_pdf_path = EXCLUDED.source_pdf_path,
      page_start = EXCLUDED.page_start,
      page_end = EXCLUDED.page_end,
      import_source = 'ncert_books',
      error_metadata = NULL
    RETURNING id
  `;
  return Number(rows[0].id);
}

async function replaceChapterConcepts(sql, chapterId, topics) {
  await sql`DELETE FROM concepts WHERE chapter_id = ${chapterId}`;
  await sql`DELETE FROM topics WHERE chapter_id = ${chapterId}`;

  let conceptCount = 0;
  for (const topic of topics) {
    const topicRows = await sql`
      INSERT INTO topics (chapter_id, name, importance)
      VALUES (${chapterId}, ${limitDbText(topic.name, 500)}, ${topic.importance})
      RETURNING id
    `;
    const topicId = Number(topicRows[0].id);
    for (const concept of topic.concepts) {
      await sql`
        INSERT INTO concepts (
          topic_id, chapter_id, text, type, bloom_level, hots_potential, source
        )
        VALUES (
          ${topicId}, ${chapterId}, ${concept.text}, ${concept.type},
          ${concept.bloom_level}, ${concept.hots_potential}, 'ncert_txt'
        )
      `;
      conceptCount += 1;
    }
  }
  return conceptCount;
}

async function extractConceptsWithAI(cleanedText, chapterName, subject, classNum) {
  const prompt = `You are an expert CBSE/NCERT curriculum analyst for Class ${classNum} ${subject}.

Extract exam-useful educational concepts from this NCERT chapter.

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
          "bloom_level": "UNDERSTAND",
          "hots_potential": false
        }
      ]
    }
  ]
}

importance must be LOW | MEDIUM | HIGH
type must be DEFINITION | FORMULA | EXPERIMENT | EXAMPLE | APPLICATION | ACTIVITY | FACT
bloom_level must be REMEMBER | UNDERSTAND | APPLY | ANALYZE | EVALUATE | CREATE`;

  const result = await generateJSON(prompt);
  return normalizeTopics(result, chapterName);
}

function extractConceptsFromTextOnly(cleanedText, chapterName, subject) {
  const sourceTextChunks = chapterSourceTextChunks(cleanedText);
  const sentences = uniqueText(
    cleanedText
      .split(/(?<=[.!?।])\s+/)
      .map(cleanText)
      .filter((sentence) => sentence.length >= 55),
  ).slice(0, 36);

  if (!sentences.length) {
    return normalizeTopics(
      {
        topics: [
          {
            name: chapterName,
            importance: "HIGH",
            concepts: sourceTextChunks.length
              ? sourceTextChunks.map((text, index) => sourceTextConcept(text, index))
              : [
                  {
                    text: cleanedText.slice(0, 8000),
                    type: "NCERT_TXT_SOURCE",
                    bloom_level: "UNDERSTAND",
                    hots_potential: false,
                  },
                ],
          },
        ],
      },
      chapterName,
    );
  }

  const topicCount = Math.min(8, Math.max(3, Math.ceil(sentences.length / 4)));
  const chunkSize = Math.max(2, Math.ceil(sentences.length / topicCount));
  const topics = sourceTextChunks.length
    ? [
        {
          name: chapterName,
          importance: "HIGH",
          concepts: sourceTextChunks.map((text, index) =>
            sourceTextConcept(text, index),
          ),
        },
      ]
    : [];

  for (let index = 0; index < topicCount; index += 1) {
    const chunk = sentences.slice(index * chunkSize, index * chunkSize + chunkSize);
    if (!chunk.length) continue;
    const topicName = textOnlyTopicName(chapterName, subject, index);
    topics.push({
      name: topicName,
      importance: index < 2 ? "HIGH" : "MEDIUM",
      concepts: chunk.map((sentence, sentenceIndex) => ({
        text: sentence.slice(0, 4000),
        type: textOnlyConceptType(subject, sentence),
        bloom_level: sentenceIndex === 0 ? "UNDERSTAND" : "APPLY",
        hots_potential: index >= 2,
      })),
    });
  }

  return normalizeTopics({ topics }, chapterName);
}

function chapterSourceTextChunks(cleanedText) {
  const paragraphs = cleanedText
    .split(/\n{2,}|(?=Let us read\b)|(?=Let us discuss\b)|(?=Let us think\b)|(?=Exercises?\b)/i)
    .map(cleanText)
    .filter((paragraph) => paragraph.length >= 120);
  const chunks = [];
  let current = "";

  for (const paragraph of paragraphs.length ? paragraphs : [cleanedText]) {
    const next = current ? `${current}\n${paragraph}` : paragraph;
    if (next.length <= 1800) {
      current = next;
      continue;
    }

    if (current) chunks.push(current);
    current = paragraph.length > 1800 ? paragraph.slice(0, 1800) : paragraph;
    if (chunks.length >= 10) break;
  }

  if (current && chunks.length < 10) chunks.push(current);
  return chunks.filter((chunk) => chunk.length >= 120).slice(0, 10);
}

function sourceTextConcept(text, index) {
  return {
    text: text.slice(0, 8000),
    type: "NCERT_TXT_SOURCE",
    bloom_level: index < 2 ? "UNDERSTAND" : "ANALYZE",
    hots_potential: index >= 2,
  };
}

function textOnlyTopicName(chapterName, subject, index) {
  if (/English|Hindi/i.test(subject)) {
    if (index === 0) return chapterName;
    if (index === 1) return "Reading comprehension and inference";
    if (index === 2) return "Theme, character, tone, and literary devices";
    return "Vocabulary and grammar in context";
  }

  if (index === 0) return chapterName;
  if (index === 1) return "Core concepts and definitions";
  if (index === 2) return "Textbook examples and exercises";
  return "Problem solving and application";
}

function textOnlyConceptType(subject, sentence) {
  if (/formula|equation|calculate|solve|=|π|theta|sin|cos|tan/i.test(sentence)) {
    return "FORMULA";
  }
  if (/experiment|activity|observe|practical|apparatus/i.test(sentence)) {
    return "EXPERIMENT";
  }
  if (/English|Hindi/i.test(subject)) return "EXAMPLE";
  return "FACT";
}

async function generateJSON(prompt) {
  const providers = providerOrder();
  if (!providers.length) {
    throw new Error(
      "Set GEMINI_API_KEY, GROQ_API_KEY, XAI_API_KEY, OPENROUTER_API_KEY, or OPENAI_API_KEY before real import.",
    );
  }

  const failures = [];
  for (const provider of providers) {
    try {
      const text = provider === "GEMINI"
        ? await generateGemini(prompt)
        : await generateChatCompletion(provider, prompt);
      return parseJsonText(text);
    } catch (error) {
      failures.push(`${provider}: ${errorMessage(error)}`);
      if ((process.env.AI_PROVIDER ?? "AUTO").toUpperCase() !== "AUTO") break;
    }
  }

  throw new Error(`AI extraction failed. ${failures.join(" ")}`);
}

function providerOrder() {
  const requested = (process.env.AI_PROVIDER ?? "AUTO").toUpperCase();
  const order = ["GEMINI", "GROQ", "GROK", "OPENROUTER", "OPENAI"].filter(hasProviderKey);
  if (requested === "AUTO") return order;
  const normalized = requested === "XAI" ? "GROK" : requested;
  return hasProviderKey(normalized) ? [normalized] : [];
}

function hasProviderKey(provider) {
  if (provider === "GEMINI") return Boolean(validKey(process.env.GEMINI_API_KEY));
  if (provider === "GROQ") return Boolean(validKey(process.env.GROQ_API_KEY));
  if (provider === "GROK") return Boolean(validKey(process.env.XAI_API_KEY));
  if (provider === "OPENROUTER") return Boolean(validKey(process.env.OPENROUTER_API_KEY));
  if (provider === "OPENAI") return Boolean(validKey(process.env.OPENAI_API_KEY));
  return false;
}

function validKey(value) {
  const trimmed = value?.trim();
  if (!trimmed) return "";
  if (/^(your_|sk-your|xai-your|sk-or-your|placeholder)/i.test(trimmed)) return "";
  return trimmed;
}

async function generateGemini(prompt) {
  const key = validKey(process.env.GEMINI_API_KEY);
  const modelName = process.env.GEMINI_MODEL ?? "gemini-2.5-flash";
  const model = new GoogleGenerativeAI(key).getGenerativeModel({
    model: modelName,
    generationConfig: {
      responseMimeType: "application/json",
      temperature: 0.25,
      topP: 0.8,
      maxOutputTokens: 8192,
    },
  });
  const result = await model.generateContent(prompt);
  return result.response.text();
}

async function generateChatCompletion(provider, prompt) {
  const config = chatProviderConfig(provider);
  const response = await fetch(config.url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
      ...config.headers,
    },
    body: JSON.stringify({
      model: config.model,
      temperature: 0.25,
      top_p: 0.8,
      max_tokens: provider === "OPENROUTER" ? 2500 : 8192,
      messages: [
        {
          role: "system",
          content: "Return only valid JSON. No markdown.",
        },
        { role: "user", content: prompt },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`${response.status}: ${(await response.text()).slice(0, 500)}`);
  }

  const payload = await response.json();
  const text = payload.choices?.[0]?.message?.content;
  if (!text) throw new Error("AI provider returned an empty response.");
  return text;
}

function chatProviderConfig(provider) {
  if (provider === "GROQ") {
    return {
      url: "https://api.groq.com/openai/v1/chat/completions",
      apiKey: validKey(process.env.GROQ_API_KEY),
      model: process.env.GROQ_MODEL ?? "llama-3.3-70b-versatile",
      headers: {},
    };
  }
  if (provider === "GROK") {
    return {
      url: "https://api.x.ai/v1/chat/completions",
      apiKey: validKey(process.env.XAI_API_KEY),
      model: process.env.XAI_MODEL ?? "grok-4.3",
      headers: {},
    };
  }
  if (provider === "OPENROUTER") {
    return {
      url: "https://openrouter.ai/api/v1/chat/completions",
      apiKey: validKey(process.env.OPENROUTER_API_KEY),
      model: process.env.OPENROUTER_MODEL ?? "openrouter/auto",
      headers: { "X-Title": "EduTest.AI NCERT Importer" },
    };
  }
  return {
    url: "https://api.openai.com/v1/chat/completions",
    apiKey: validKey(process.env.OPENAI_API_KEY),
    model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
    headers: {},
  };
}

function parseJsonText(text) {
  return JSON.parse(text.replace(/```json|```/g, "").trim());
}

function normalizeTopics(result, chapterName) {
  const topics = Array.isArray(result?.topics) ? result.topics : [];
  const normalized = topics
    .map((topic) => ({
      name: cleanText(topic.name).slice(0, 500) || chapterName,
      importance: normalizeImportance(topic.importance),
      concepts: Array.isArray(topic.concepts)
        ? topic.concepts
            .map((concept) => ({
              text: cleanText(concept.text).slice(0, 8000),
              type: normalizeConceptType(concept.type),
              bloom_level: normalizeBloom(concept.bloom_level),
              hots_potential: Boolean(concept.hots_potential),
            }))
            .filter((concept) => concept.text)
        : [],
    }))
    .filter((topic) => topic.concepts.length);

  const merged = mergeDuplicateTopics(normalized);
  if (merged.length) return merged;

  return [
    {
      name: chapterName,
      importance: "HIGH",
      concepts: [
        {
          text: `${chapterName} contains important NCERT concepts for board-style questions.`,
          type: "FACT",
          bloom_level: "UNDERSTAND",
          hots_potential: false,
        },
      ],
    },
  ];
}

function mergeDuplicateTopics(topics) {
  const byName = new Map();

  for (const topic of topics) {
    const key = cleanText(topic.name).toLowerCase();
    if (!key) continue;

    const existing = byName.get(key);
    if (!existing) {
      byName.set(key, {
        ...topic,
        concepts: uniqueConcepts(topic.concepts),
      });
      continue;
    }

    existing.importance = higherImportance(existing.importance, topic.importance);
    existing.concepts = uniqueConcepts([...existing.concepts, ...topic.concepts]);
  }

  return Array.from(byName.values());
}

function uniqueConcepts(concepts) {
  const seen = new Set();
  const uniqueConcepts = [];

  for (const concept of concepts) {
    const key = cleanText(concept.text).toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    uniqueConcepts.push(concept);
  }

  return uniqueConcepts;
}

function higherImportance(left, right) {
  const rank = { LOW: 1, MEDIUM: 2, HIGH: 3 };
  return (rank[right] ?? 0) > (rank[left] ?? 0) ? right : left;
}

function cleanText(value) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function limitDbText(value, maxLength) {
  return cleanText(value).slice(0, maxLength);
}

function uniqueText(values) {
  const seen = new Set();
  const uniqueValues = [];
  for (const value of values) {
    const normalized = cleanText(value);
    const key = normalized.toLowerCase();
    if (!normalized || seen.has(key)) continue;
    seen.add(key);
    uniqueValues.push(normalized);
  }
  return uniqueValues;
}

function normalizeImportance(value) {
  return ["LOW", "MEDIUM", "HIGH"].includes(String(value)) ? String(value) : "MEDIUM";
}

function normalizeConceptType(value) {
  if (String(value).toUpperCase() === "PDF_SOURCE_TEXT") {
    return "NCERT_TXT_SOURCE";
  }

  const allowed = [
    "DEFINITION",
    "FORMULA",
    "EXPERIMENT",
    "EXAMPLE",
    "APPLICATION",
    "ACTIVITY",
    "FACT",
    "NCERT_TXT_SOURCE",
  ];
  return allowed.includes(String(value)) ? String(value) : "FACT";
}

function normalizeBloom(value) {
  const allowed = ["REMEMBER", "UNDERSTAND", "APPLY", "ANALYZE", "EVALUATE", "CREATE"];
  return allowed.includes(String(value)) ? String(value) : "UNDERSTAND";
}

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) continue;
    const [key, inlineValue] = arg.slice(2).split("=");
    if (inlineValue !== undefined) {
      parsed[key] = inlineValue;
    } else if (argv[index + 1] && !argv[index + 1].startsWith("--")) {
      parsed[key] = argv[index + 1];
      index += 1;
    } else {
      parsed[key] = true;
    }
  }
  return parsed;
}

function positiveInt(value) {
  const numberValue = Number(value);
  return Number.isInteger(numberValue) && numberValue > 0 ? numberValue : undefined;
}

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match || process.env[match[1]]) continue;
    let value = match[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[match[1]] = value;
  }
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

main().catch(async (error) => {
  await mkdir(artifactsDir, { recursive: true }).catch(() => {});
  console.error(errorMessage(error));
  process.exitCode = 1;
});
