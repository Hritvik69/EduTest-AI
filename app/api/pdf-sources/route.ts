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

      try {
        const source = await processPdfSourceUpload(request, user, (progress) => {
          send("progress", progress);
        });
        send("progress", {
          progress: 100,
          message: "PDF ready for fresh question generation",
        });
        send("complete", { success: true, data: { source } });
      } catch (error) {
        send("error", {
          success: false,
          error: friendlyPdfProcessingError(error),
          code: error instanceof PdfUploadClientError ? error.status : 502,
        });
      } finally {
        if (!closed) {
          closed = true;
          try {
            controller.close();
          } catch {
            // The browser may have disconnected while OCR or AI extraction was running.
          }
        }
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
) {
  throwIfUploadAborted(request.signal);
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
  throwIfUploadAborted(request.signal);

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
  throwIfUploadAborted(request.signal);
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
    signal: request.signal,
  });
  throwIfUploadAborted(request.signal);
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
    { signal: request.signal },
  );
  throwIfUploadAborted(request.signal);
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

function sanitizeFilename(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 300);
}

function sanitizeFocusPrompt(value: FormDataEntryValue | null) {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, 1000);
}
