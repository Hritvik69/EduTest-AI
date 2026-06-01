import { questionTypeMeta } from "@/lib/edutest-data";
import type { GeneratedQuestion, StoredPaper } from "@/types";
import { existsSync } from "node:fs";
import React from "react";
import {
  Document,
  Font,
  Page,
  StyleSheet,
  Text,
  View,
  renderToBuffer,
} from "@react-pdf/renderer";

interface PdfLine {
  text: string;
  size?: number;
  bold?: boolean;
  indent?: number;
  gapBefore?: number;
  pageBreakBefore?: boolean;
}

let fontsRegistered = false;
let activeExportFontFamily = "Helvetica";
let activeBoldExportFontFamily = "Helvetica-Bold";

export async function createPaperPdfBuffer(paper: StoredPaper, includeAnswers: boolean) {
  const lines = expandPageBreaks(buildPaperLines(paper, includeAnswers));

  try {
    return await createReactPdfFromLines(paper, lines);
  } catch (error) {
    console.error("[paper-pdf-export] react-pdf failed, using fallback writer", {
      message: error instanceof Error ? error.message : String(error),
    });
    return createPdfFromLines(lines);
  }
}

export function downloadPaperFileName(paper: StoredPaper) {
  const date = new Date().toISOString().slice(0, 10);
  const subject = safeFileName(paper.config.subject).replace(/-/g, "_");
  return `${subject}_Class${paper.config.classNum}_${date}_EduTestAI.pdf`;
}

export function paperExportTextSize(paper: StoredPaper) {
  return paper.questions.reduce(
    (sum, question) =>
      sum +
      question.text.length +
      (question.scenario?.length ?? 0) +
      question.correctAnswer.length +
      (question.options ?? []).reduce((optionSum, option) => optionSum + option.text.length, 0) +
      (question.subQuestions ?? []).reduce(
        (subSum, subQuestion) =>
          subSum + subQuestion.text.length + subQuestion.correctAnswer.length,
        0,
      ) +
      (question.matchPairs ?? []).reduce(
        (pairSum, pair) => pairSum + pair.left.length + pair.right.length,
        0,
      ),
    paper.title.length,
  );
}

function buildPaperLines(paper: StoredPaper, includeAnswers: boolean) {
  const lines: PdfLine[] = [];
  const config = paper.config;

  lines.push({ text: "School Name", size: 11, bold: true });
  lines.push({ text: new Date().toLocaleDateString("en-IN"), size: 9 });
  lines.push({ text: paper.title, size: 18, bold: true, gapBefore: 12 });
  lines.push({
    text: `Subject: ${config.subject}    Class: ${config.classNum}    Max Marks: ${config.totalMarks}    Duration: ${config.duration} min`,
    size: 10,
    bold: true,
    gapBefore: 8,
  });
  lines.push({ text: config.examType ?? "Generated Paper", size: 10, gapBefore: 4 });
  if (paper.manifest) {
    const source =
      paper.manifest.source.mode === "pdf_upload"
        ? `Uploaded PDF: ${paper.manifest.source.pdfTitle ?? "PDF"}`
        : `Source: ${paper.manifest.source.conceptSource}`;
    lines.push({
      text: `${source} | ${paper.manifest.validation.finalQuestions}/${paper.manifest.validation.targetQuestions} valid questions | ${paper.manifest.validation.replacedQuestions} replaced`,
      size: 8,
      gapBefore: 4,
    });
  }
  lines.push({ text: "General Instructions", size: 12, bold: true, gapBefore: 14 });
  lines.push({ text: "1. All questions are compulsory.", indent: 10 });
  lines.push({ text: "2. Marks for each question are indicated beside the question.", indent: 10 });
  lines.push({ text: "3. Draw neat labelled diagrams wherever necessary.", indent: 10 });
  lines.push({ text: "4. Read all questions carefully before attempting.", indent: 10 });

  let currentSection = "";
  paper.questions.forEach((question, index) => {
    if (question.section && question.section !== currentSection) {
      currentSection = question.section;
      lines.push({ text: currentSection, size: 14, bold: true, gapBefore: 18 });
    }
    pushQuestionLines(lines, question, index);
  });

  if (includeAnswers) {
    lines.push({ text: "Answer Key", size: 18, bold: true, gapBefore: 24 });
    paper.questions.forEach((question, index) => {
      lines.push({
        text: `Q${index + 1}. ${question.correctAnswer}`,
        size: 10,
        gapBefore: index === 0 ? 8 : 5,
      });
    });
  }

  return lines;
}

function pushQuestionLines(
  lines: PdfLine[],
  question: GeneratedQuestion,
  index: number,
) {
  const metaInfo = questionTypeMeta.find((item) => item.type === question.type);
  lines.push({
    text: `Q${index + 1}. ${metaInfo?.label ?? question.type} | ${question.marks} mark${
      question.marks === 1 ? "" : "s"
    }`,
    size: 9,
    bold: true,
    gapBefore: 10,
  });

  if (question.scenario) {
    lines.push({ text: `Passage: ${question.scenario}`, indent: 10 });
  }

  lines.push({ text: question.text, size: 11, bold: true });

  question.options?.forEach((option) => {
    lines.push({ text: `${option.id}. ${option.text}`, indent: 14 });
  });

  question.matchPairs?.forEach((pair, pairIndex) => {
    lines.push({
      text: `${pairIndex + 1}. ${pair.left}  -  ${pair.right}`,
      indent: 14,
    });
  });

  question.subQuestions?.forEach((subQuestion, subIndex) => {
    lines.push({
      text: `(${String.fromCharCode(97 + subIndex)}) ${subQuestion.text} [${subQuestion.marks}]`,
      indent: 14,
    });
  });
}

function createPdfFromLines(lines: PdfLine[]) {
  const objects: string[] = [];
  const catalogId = reserveObject(objects);
  const pagesId = reserveObject(objects);
  const fontId = addObject(
    objects,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  );
  const boldFontId = addObject(
    objects,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>",
  );
  const pageIds: number[] = [];
  let commands = "";
  let pageNumber = 1;
  let y = 800;

  const addPage = () => {
    commands += textCommand(270, 24, `Page ${pageNumber}`, 9, false);
    const contentId = addObject(
      objects,
      `<< /Length ${Buffer.byteLength(commands, "latin1")} >>\nstream\n${commands}endstream`,
    );
    const pageId = addObject(
      objects,
      `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${fontId} 0 R /F2 ${boldFontId} 0 R >> >> /Contents ${contentId} 0 R >>`,
    );
    pageIds.push(pageId);
    pageNumber += 1;
    commands = "";
    y = 800;
  };

  lines.forEach((line) => {
    const size = line.size ?? 10;
    const lineHeight = Math.max(12, Math.round(size * 1.45));
    const x = 50 + (line.indent ?? 0);
    const gapBefore = line.gapBefore ?? 0;
    if (line.pageBreakBefore && commands) addPage();
    if (gapBefore) y -= gapBefore;

    wrapText(line.text, size, line.indent ?? 0).forEach((wrappedLine) => {
      if (y < 56) addPage();
      commands += textCommand(x, y, wrappedLine, size, Boolean(line.bold));
      y -= lineHeight;
    });
  });

  if (commands) addPage();

  objects[catalogId - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`;
  objects[pagesId - 1] = `<< /Type /Pages /Kids [${pageIds
    .map((id) => `${id} 0 R`)
    .join(" ")}] /Count ${pageIds.length} >>`;

  return buildPdf(objects);
}

async function createReactPdfFromLines(paper: StoredPaper, lines: PdfLine[]) {
  registerExportFonts();
  return renderToBuffer(
    React.createElement(PaperPdfDocument, {
      title: paper.title,
      lines,
    }),
  );
}

function PaperPdfDocument({
  title,
  lines,
}: {
  title: string;
  lines: PdfLine[];
}) {
  return React.createElement(
    Document,
    {
      title,
      author: "EduTest-AI",
      creator: "EduTest-AI",
      producer: "EduTest-AI",
    },
    React.createElement(
      Page,
      {
        size: "A4",
        style: [pdfStyles.page, { fontFamily: activeExportFontFamily }],
        wrap: true,
      },
      React.createElement(
        View,
        { style: pdfStyles.body },
        lines.map((line, index) =>
          React.createElement(
            Text,
            {
              key: `${index}-${line.text.slice(0, 18)}`,
              break: line.pageBreakBefore || undefined,
              style: pdfLineStyle(line),
            },
            safePdfDisplayText(line.text),
          ),
        ),
      ),
      React.createElement(Text, {
        fixed: true,
        render: ({ pageNumber, totalPages }: { pageNumber: number; totalPages: number }) =>
          `Page ${pageNumber} of ${totalPages}`,
        style: [pdfStyles.pageNumber, { fontFamily: activeExportFontFamily }],
      }),
    ),
  );
}

const exportFontFamily = "EduTestExport";
const boldExportFontFamily = "EduTestExportBold";

const pdfStyles = StyleSheet.create({
  page: {
    paddingTop: 42,
    paddingBottom: 44,
    paddingHorizontal: 44,
    color: "#111827",
    backgroundColor: "#ffffff",
  },
  body: {
    flexDirection: "column",
  },
  line: {
    lineHeight: 1.35,
    marginBottom: 3,
  },
  bold: {
    fontWeight: 700,
  },
  pageNumber: {
    position: "absolute",
    bottom: 22,
    left: 0,
    right: 0,
    textAlign: "center",
    color: "#6b7280",
    fontSize: 8,
  },
});

function registerExportFonts() {
  if (fontsRegistered) return;
  fontsRegistered = true;

  const regularFont = firstExistingFont([
    "C:\\Windows\\Fonts\\mangal.ttf",
    "C:\\Windows\\Fonts\\arial.ttf",
  ]);
  const boldFont = firstExistingFont([
    "C:\\Windows\\Fonts\\mangalb.ttf",
    "C:\\Windows\\Fonts\\arialbd.ttf",
  ]);

  if (regularFont) {
    Font.register({ family: exportFontFamily, src: regularFont });
    activeExportFontFamily = exportFontFamily;
  }
  if (boldFont) {
    Font.register({ family: boldExportFontFamily, src: boldFont });
    activeBoldExportFontFamily = boldExportFontFamily;
  } else if (regularFont) {
    Font.register({ family: boldExportFontFamily, src: regularFont });
    activeBoldExportFontFamily = boldExportFontFamily;
  }
}

function firstExistingFont(paths: string[]) {
  return paths.find((path) => existsSync(path));
}

function expandPageBreaks(lines: PdfLine[]) {
  const expanded: PdfLine[] = [];

  lines.forEach((line) => {
    const parts = String(line.text).split(/\s*---\s*Page\s+Break\s*---\s*/i);
    if (parts.length === 1) {
      expanded.push(line);
      return;
    }

    parts.forEach((part, index) => {
      const text = part.trim();
      if (!text) return;
      expanded.push({
        ...line,
        text,
        pageBreakBefore: Boolean(line.pageBreakBefore || index > 0),
      });
    });
  });

  return expanded;
}

function safePdfDisplayText(value: unknown) {
  return String(value ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, " ")
    .replace(/[ \t]+/g, " ")
    .trim();
}

function pdfLineStyle(line: PdfLine) {
  const dynamicStyle = {
    fontSize: line.size ?? 10,
    marginLeft: line.indent ?? 0,
    marginTop: line.gapBefore ?? 0,
  };

  return line.bold
    ? [
        pdfStyles.line,
        pdfStyles.bold,
        { fontFamily: activeBoldExportFontFamily },
        dynamicStyle,
      ]
    : [pdfStyles.line, dynamicStyle];
}

function textCommand(
  x: number,
  y: number,
  text: string,
  size: number,
  bold: boolean,
) {
  return `BT /${bold ? "F2" : "F1"} ${size} Tf ${x} ${y} Td (${escapePdfText(
    text,
  )}) Tj ET\n`;
}

function buildPdf(objects: string[]) {
  let output = "%PDF-1.4\n";
  const offsets = [0];

  objects.forEach((object, index) => {
    offsets[index + 1] = Buffer.byteLength(output, "latin1");
    output += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });

  const xrefOffset = Buffer.byteLength(output, "latin1");
  output += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let index = 1; index <= objects.length; index += 1) {
    output += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
  }
  output += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  return Buffer.from(output, "latin1");
}

function reserveObject(objects: string[]) {
  objects.push("");
  return objects.length;
}

function addObject(objects: string[], object: string) {
  objects.push(object);
  return objects.length;
}

function wrapText(text: string, size: number, indent: number) {
  const safeText = sanitizePdfText(text);
  const maxChars = Math.max(24, Math.floor((495 - indent) / (size * 0.52)));
  const words = safeText.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";

  words.forEach((word) => {
    if (!current) {
      current = word;
      return;
    }
    if (`${current} ${word}`.length <= maxChars) {
      current = `${current} ${word}`;
      return;
    }
    lines.push(current);
    current = word;
  });

  if (current) lines.push(current);
  return lines.length ? lines : [""];
}

function sanitizePdfText(value: unknown) {
  return String(value ?? "")
    .replace(/\r?\n/g, " ")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[–—]/g, "-")
    .replace(/→/g, "->")
    .replace(/≤/g, "<=")
    .replace(/≥/g, ">=")
    .replace(/×/g, "x")
    .replace(/÷/g, "/")
    .replace(/[^\x09\x0A\x0D\x20-\x7E]/g, "?")
    .replace(/\s+/g, " ")
    .trim();
}

function escapePdfText(value: string) {
  return sanitizePdfText(value).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function safeFileName(name: string) {
  return name.replace(/[^a-z0-9-]+/gi, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
}
