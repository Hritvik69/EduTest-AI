#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { PDFParse } from "pdf-parse";

const ncertRoot = path.resolve("NCERT_Books");

const chapters = [
  {
    pdf: "NCERT_Books/9th/Social_Science/iest101.pdf",
    dest: "NCERT_Books/9th/Social_Science/_extracted_text/Social_Science/0001_Understanding_Social_Science.txt",
    chapter: "Understanding Social Science",
    classNum: 9,
    subject: "Social_Science",
  },
  {
    pdf: "NCERT_Books/9th/Social_Science/iest102.pdf",
    dest: "NCERT_Books/9th/Social_Science/_extracted_text/Social_Science/0002_Shaping_of_the_Earths_Surface.txt",
    chapter: "Shaping of the Earth's Surface",
    classNum: 9,
    subject: "Social_Science",
  },
  {
    pdf: "NCERT_Books/9th/Social_Science/iest103.pdf",
    dest: "NCERT_Books/9th/Social_Science/_extracted_text/Social_Science/0003_Atmosphere_and_Climate.txt",
    chapter: "Atmosphere and Climate",
    classNum: 9,
    subject: "Social_Science",
  },
  {
    pdf: "NCERT_Books/9th/Social_Science/iest104.pdf",
    dest: "NCERT_Books/9th/Social_Science/_extracted_text/Social_Science/0004_Early_Humans_and_Beginning_of_Civilisation.txt",
    chapter: "Early Humans and Beginning of Civilisation",
    classNum: 9,
    subject: "Social_Science",
  },
  {
    pdf: "NCERT_Books/9th/Social_Science/iest105.pdf",
    dest: "NCERT_Books/9th/Social_Science/_extracted_text/Social_Science/0005_State_and_Society_up_to_1000_CE.txt",
    chapter: "State and Society up to 1000 CE",
    classNum: 9,
    subject: "Social_Science",
  },
  {
    pdf: "NCERT_Books/9th/Social_Science/iest106.pdf",
    dest: "NCERT_Books/9th/Social_Science/_extracted_text/Social_Science/0006_Democracy.txt",
    chapter: "Democracy",
    classNum: 9,
    subject: "Social_Science",
  },
  {
    pdf: "NCERT_Books/9th/Social_Science/iest107.pdf",
    dest: "NCERT_Books/9th/Social_Science/_extracted_text/Social_Science/0007_Elections.txt",
    chapter: "Elections",
    classNum: 9,
    subject: "Social_Science",
  },
  {
    pdf: "NCERT_Books/9th/Social_Science/iest108.pdf",
    dest: "NCERT_Books/9th/Social_Science/_extracted_text/Social_Science/0008_Building_Blocks_in_Economics.txt",
    chapter: "Building Blocks in Economics: The Problem of Choice",
    classNum: 9,
    subject: "Social_Science",
  },
  {
    pdf: "NCERT_Books/9th/Social_Science/iest109.pdf",
    dest: "NCERT_Books/9th/Social_Science/_extracted_text/Social_Science/0009_The_Price_Puzzle.txt",
    chapter: "The Price Puzzle: What Drives the Market",
    classNum: 9,
    subject: "Social_Science",
  },
];

function cleanExtractedText(rawText) {
  const text = rawText.replace(/\u0008/g, "").replace(/\t/g, " ").replace(/\r/g, "\n");
  const cleanedLines = [];
  const lines = text
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

async function extractPdf(pdfPath) {
  const data = fs.readFileSync(pdfPath);
  const parser = new PDFParse({ data });
  try {
    const result = await parser.getText();
    return {
      text: cleanExtractedText(result.text ?? ""),
      pages: Number(result.total ?? 0),
    };
  } finally {
    await parser.destroy();
  }
}

async function main() {
  console.log(`Extracting 9th SST chapters...\n`);

  for (const item of chapters) {
    const pdfPath = path.resolve(ncertRoot, "..", item.pdf);
    const destPath = path.resolve(ncertRoot, "..", item.dest);

    if (!fs.existsSync(pdfPath)) {
      console.log(`[SKIP] ${item.chapter}: PDF not found at ${pdfPath}`);
      continue;
    }

    if (fs.existsSync(destPath)) {
      console.log(`[EXISTS] ${item.chapter}: already extracted`);
      continue;
    }

    try {
      const { text, pages } = await extractPdf(pdfPath);
      const wordCount = text.split(/\s+/).filter(Boolean).length;

      await fs.promises.mkdir(path.dirname(destPath), { recursive: true });
      await fs.promises.writeFile(destPath, `${text.trim()}\n`, "utf8");

      console.log(
        `[OK] ${item.chapter}: ${pages} pages, ${wordCount} words -> ${path.basename(destPath)}`
      );
    } catch (error) {
      console.log(
        `[ERROR] ${item.chapter}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  console.log("\nDone!");
}

main().catch(console.error);
