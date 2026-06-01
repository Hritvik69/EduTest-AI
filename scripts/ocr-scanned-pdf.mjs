import fs from "node:fs";
import { PDFParse } from "pdf-parse";
import { createScheduler, createWorker } from "tesseract.js";

const args = parseArgs(process.argv.slice(2));
const input = args.input;
const maxPages = positiveInt(args["max-pages"]) ?? 12;
const width = positiveInt(args.width) ?? 700;
const workerCount = Math.max(1, Math.min(4, positiveInt(args.workers) ?? 3));
const lang = args.lang || "eng";

if (!input) {
  throw new Error("--input is required.");
}

function send(data) {
  process.stdout.write(`${JSON.stringify(data)}\n`);
}

async function main() {
  const data = await fs.promises.readFile(input);
  const parser = new PDFParse({ data });
  let scheduler = null;

  try {
    const info = await parser.getInfo().catch(() => null);
    const total = Number(info?.totalPages ?? info?.pages?.length ?? 0) || maxPages;
    const pageLimit = Math.min(total, maxPages);
    send({
      type: "progress",
      progress: 16,
      message: `Detected scanned PDF. Rendering ${pageLimit} pages for OCR`,
    });

    scheduler = createScheduler();
    const workers = Array.from({ length: Math.min(workerCount, pageLimit) }, async () => {
      const worker = await createWorker(lang);
      scheduler.addWorker(worker);
    });

    const renderedPages = [];
    const textByPage = new Map();
    const ocrJobs = [];
    let completedOcrPages = 0;
    let workerReadySent = false;
    const workerReady = Promise.all(workers).then(() => {
      workerReadySent = true;
      send({
        type: "progress",
        progress: 29,
        message: `OCR engine ready. Reading ${pageLimit} pages in parallel`,
      });
    });

    for (let page = 1; page <= pageLimit; page += 1) {
      const screenshot = await parser.getScreenshot({
        first: page,
        last: page,
        desiredWidth: width,
        imageDataUrl: false,
        imageBuffer: true,
      });
      const image = screenshot.pages[0]?.data
        ? Buffer.from(screenshot.pages[0].data)
        : null;
      renderedPages.push({ page, image });
      send({
        type: "progress",
        progress: Math.round(16 + (page / pageLimit) * 12),
        message: `Rendered page ${page} of ${pageLimit} for OCR`,
      });

      if (image) {
        ocrJobs.push(
          workerReady.then(async () => {
            const result = await scheduler.addJob("recognize", image);
            const text = normalizeOcrText(result.data?.text ?? "");
            if (text) textByPage.set(page, text);
            completedOcrPages += 1;
            send({
              type: "progress",
              progress: Math.round(30 + (completedOcrPages / pageLimit) * 35),
              message: `OCR read page ${page} of ${pageLimit}`,
            });
          }),
        );
      }
    }

    if (!workerReadySent) await workerReady;
    await Promise.all(ocrJobs);

    const text = renderedPages
      .map((renderedPage) => textByPage.get(renderedPage.page) ?? "")
      .filter(Boolean)
      .join("\n\n");

    send({
      type: "complete",
      text,
      wordCount: text.split(/\s+/).filter(Boolean).length,
    });
  } finally {
    await scheduler?.terminate();
    await parser.destroy();
  }
}

function parseArgs(values) {
  const parsed = {};
  for (const value of values) {
    const match = value.match(/^--([^=]+)=(.*)$/);
    if (match) parsed[match[1]] = match[2];
  }
  return parsed;
}

function positiveInt(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function normalizeOcrText(text) {
  return text
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n")
    .trim();
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  process.exit(1);
});
