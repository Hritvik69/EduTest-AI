import { NextRequest } from "next/server";
import { createHash } from "node:crypto";
import {
  jsonError,
  jsonSuccess,
  rateLimit,
  requireAuthenticatedUser,
} from "@/lib/api-security";
import { friendlyPdfProcessingError } from "@/lib/error-classification";
import {
  cleanExtractedText,
  extractTextFromPdf,
  extractUploadedPdfConcepts,
} from "@/lib/extractor";
import {
  assertPdfBufferSize,
  assertPdfMagic,
  limitExtractedText,
  maxPdfBytes,
  maxPdfSizeLabel,
  pdfSizeErrorMessage,
} from "@/lib/pdf-security";
import {
  findUploadedPdfSourceByContentHash,
  storeUploadedPdfSource,
} from "@/lib/pdf-source-store";

type PdfUploadUser = { id: number };
type PdfUploadProgressSender = (progress: {
  progress: number;
  message: string;
}) => void;

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const auth = await requireAuthenticatedUser(request);
  if (auth.response) return auth.response;

  const limited = rateLimit(request, `pdf-source:${auth.user.id}`, 6, 60_000, {
    action: "PDF upload requests",
  });
  if (limited) return limited;

  if (request.nextUrl.searchParams.get("stream") === "1") {
    return streamPdfSourceUpload(request, auth.user);
  }

  try {
    const source = await processPdfSourceUpload(request, auth.user);
    return jsonSuccess({ source });
  } catch (error) {
    return jsonError(
      friendlyPdfProcessingError(error),
      error instanceof PdfUploadClientError ? error.status : 502,
    );
  }
}

function streamPdfSourceUpload(request: NextRequest, user: PdfUploadUser) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;
      const uploadController = new AbortController();
      const uploadSignal = uploadController.signal;
      const abortFromClient = () => {
        if (!uploadSignal.aborted) {
          uploadController.abort(new Error("PDF upload was cancelled."));
        }
      };
      const deadlineTimer = setTimeout(() => {
        if (!uploadSignal.aborted) {
          uploadController.abort(pdfUploadDeadlineError());
        }
      }, pdfUploadServerBudgetMs());
      let heartbeatProgress = 12;
      let heartbeatMessage = "Still understanding PDF. Large or scanned files can take longer.";
      let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

      const send = (event: string, data: object) => {
        if (closed || request.signal.aborted) return false;
        try {
          controller.enqueue(
            encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
          );
          return true;
        } catch {
          closed = true;
          return false;
        }
      };
      const close = () => {
        if (heartbeatTimer) {
          clearInterval(heartbeatTimer);
          heartbeatTimer = null;
        }
        clearTimeout(deadlineTimer);
        request.signal.removeEventListener("abort", abortFromClient);
        if (closed) return;
        closed = true;
        try {
          controller.close();
        } catch {
          // The browser may have disconnected while OCR or AI extraction was running.
        }
      };

      request.signal.addEventListener("abort", abortFromClient, { once: true });
      heartbeatTimer = setInterval(() => {
        send("progress", {
          progress: heartbeatProgress,
          message: heartbeatMessage,
        });
      }, pdfUploadHeartbeatMs());

      try {
        const source = await processPdfSourceUpload(request, user, (progress) => {
          heartbeatProgress = Math.max(heartbeatProgress, progress.progress);
          heartbeatMessage = progress.message;
          send("progress", progress);
        }, uploadSignal);
        send("progress", {
          progress: 100,
          message: "PDF ready for fresh question generation",
        });
        send("complete", { success: true, data: { source } });
      } catch (error) {
        send("error", {
          success: false,
          error: friendlyPdfUploadStreamError(error),
          code: pdfUploadErrorStatus(error),
        });
      } finally {
        close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}

async function processPdfSourceUpload(
  request: NextRequest,
  user: PdfUploadUser,
  onProgress?: PdfUploadProgressSender,
  signal: AbortSignal = request.signal,
) {
  throwIfUploadAborted(signal);
  onProgress?.({ progress: 3, message: "Receiving PDF upload" });

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    throw new PdfUploadClientError(
      `PDF upload was incomplete or too large. Please upload a valid PDF up to ${maxPdfSizeLabel}.`,
      413,
    );
  }

  const file = formData.get("file");
  const focusPrompt = sanitizeFocusPrompt(formData.get("focusPrompt"));
  throwIfUploadAborted(signal);

  if (!(file instanceof File)) {
    throw new PdfUploadClientError(
      "PDF file is required. Choose a chapter PDF before continuing.",
      400,
    );
  }

  if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
    throw new PdfUploadClientError("Only PDF files are allowed.", 400);
  }

  if (file.size > maxPdfBytes) {
    throw new PdfUploadClientError(pdfSizeErrorMessage(), 400);
  }

  onProgress?.({ progress: 6, message: "Validating PDF file" });
  const buffer = Buffer.from(await file.arrayBuffer());
  throwIfUploadAborted(signal);
  try {
    assertPdfBufferSize(buffer);
    assertPdfMagic(buffer);
  } catch (error) {
    throw new PdfUploadClientError(
      error instanceof Error ? error.message : "Invalid PDF upload.",
      400,
    );
  }
  const contentHash = createHash("sha256").update(buffer).digest("hex");

  onProgress?.({ progress: 8, message: "Checking recent PDF extraction cache" });
  const cachedSource = await findUploadedPdfSourceByContentHash(
    user.id,
    contentHash,
    focusPrompt,
  );
  if (cachedSource) {
    onProgress?.({ progress: 100, message: "Reusing already extracted PDF concepts" });
    return cachedSource;
  }

  const extracted = await extractTextFromPdf(buffer, {
    onProgress,
    signal,
  });
  throwIfUploadAborted(signal);
  const cleanedText = limitExtractedText(cleanExtractedText(extracted.text));

  if (!cleanedText || cleanedText.length < 250) {
    throw new PdfUploadClientError(
      "PDF text extraction produced too little readable content. The file may be scanned images, locked, blank, or too short. Try a text-based chapter PDF.",
      400,
    );
  }

  onProgress?.({ progress: 72, message: "Detecting important topics" });
  const analysis = await extractUploadedPdfConcepts(
    cleanedText,
    extracted.title || file.name.replace(/\.pdf$/i, ""),
    focusPrompt,
    { signal },
  );
  throwIfUploadAborted(signal);
  onProgress?.({ progress: 92, message: "Saving extracted concepts" });

  return storeUploadedPdfSource({
    userId: user.id,
    fileName: sanitizeFilename(file.name),
    title: analysis.title,
    subject: analysis.subject,
    classNum: analysis.classNum,
    focusPrompt,
    contentHash,
    extractionMethod: analysis.extractionMethod,
    wordCount: cleanedText.split(/\s+/).filter(Boolean).length || extracted.wordCount,
    importantTopics: analysis.importantTopics,
    topics: analysis.topics,
  });
}

function throwIfUploadAborted(signal: AbortSignal) {
  if (signal.aborted) {
    const reason = signal.reason as unknown;
    if (reason instanceof Error) {
      if (reason instanceof PdfUploadClientError) throw reason;
      if (reason.name !== "AbortError" && !/operation was aborted/i.test(reason.message)) {
        throw reason;
      }
    }
    throw new PdfUploadClientError("PDF upload was cancelled.", 499);
  }
}

class PdfUploadClientError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = "PdfUploadClientError";
  }
}

class PdfUploadServerBudgetError extends Error {
  status = 504;

  constructor() {
    super(
      "PDF_UPLOAD_TIME_BUDGET_EXCEEDED: PDF understanding reached the deployment time limit.",
    );
    this.name = "PdfUploadServerBudgetError";
  }
}

function pdfUploadDeadlineError() {
  return new PdfUploadServerBudgetError();
}

function friendlyPdfUploadStreamError(error: unknown) {
  if (error instanceof PdfUploadServerBudgetError) {
    return "PDF understanding reached the deployment time limit. Try a smaller or text-based PDF, or narrow the PDF focus prompt.";
  }

  return friendlyPdfProcessingError(error);
}

function pdfUploadErrorStatus(error: unknown) {
  if (error instanceof PdfUploadClientError) return error.status;
  if (error instanceof PdfUploadServerBudgetError) return error.status;
  return 502;
}

function pdfUploadServerBudgetMs() {
  const configured = Number(process.env.EDUTEST_PDF_UPLOAD_SERVER_BUDGET_MS);
  if (Number.isFinite(configured) && configured >= 15_000 && configured <= 55_000) {
    return Math.floor(configured);
  }

  return 52_000;
}

function pdfUploadHeartbeatMs() {
  const configured = Number(process.env.EDUTEST_PDF_UPLOAD_HEARTBEAT_MS);
  if (Number.isFinite(configured) && configured >= 3_000 && configured <= 20_000) {
    return Math.floor(configured);
  }

  return 8_000;
}

function sanitizeFilename(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 300);
}

function sanitizeFocusPrompt(value: FormDataEntryValue | null) {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, 1000);
}
