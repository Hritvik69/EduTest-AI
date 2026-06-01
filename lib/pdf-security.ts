import { supabase } from "@/lib/supabase";
import {
  maxPdfBytes,
  pdfSizeErrorMessage,
} from "@/lib/pdf-limits";

export {
  maxPdfBytes,
  maxPdfMegabytes,
  maxPdfSizeLabel,
  pdfSizeErrorMessage,
} from "@/lib/pdf-limits";
export const maxExtractedTextChars = 200_000;
const fetchTimeoutMs = 10_000;

export function assertPdfMagic(buffer: Buffer) {
  if (buffer.length < 5 || buffer.subarray(0, 5).toString("ascii") !== "%PDF-") {
    throw new Error("Uploaded file is not a valid PDF.");
  }
}

export function sanitizeObjectPath(path: string) {
  const normalized = path.replace(/\\/g, "/").replace(/^\/+/, "");
  if (
    !normalized.startsWith("chapters/") ||
    normalized.includes("..") ||
    normalized.includes("//") ||
    normalized.length > 512
  ) {
    throw new Error("Invalid Supabase object path.");
  }

  return normalized;
}

export function validateSupabasePdfUrl(rawUrl: string) {
  const configured = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!configured) throw new Error("Supabase URL is not configured.");

  const url = new URL(rawUrl);
  const supabaseUrl = new URL(configured);

  if (url.protocol !== "https:" || url.hostname !== supabaseUrl.hostname) {
    throw new Error("Only Supabase-hosted PDF URLs are allowed.");
  }

  if (!url.pathname.includes("/storage/v1/object/")) {
    throw new Error("Only Supabase Storage object URLs are allowed.");
  }

  if (!url.pathname.includes("/chapter-pdfs/")) {
    throw new Error("PDF must come from the chapter-pdfs bucket.");
  }

  return url;
}

export async function fetchSupabasePdfByUrl(rawUrl: string) {
  const url = validateSupabasePdfUrl(rawUrl);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), fetchTimeoutMs);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: "application/pdf, application/octet-stream" },
    });

    if (!response.ok) {
      throw new Error("Could not download PDF for extraction.");
    }

    assertPdfResponseHeaders(response);
    return await readResponseWithLimit(response);
  } finally {
    clearTimeout(timeout);
  }
}

export async function downloadSupabasePdfByPath(objectPath: string) {
  if (!supabase) {
    throw new Error("Supabase storage is not configured.");
  }

  const path = sanitizeObjectPath(objectPath);
  const { data, error } = await supabase.storage.from("chapter-pdfs").download(path);

  if (error || !data) {
    throw new Error(error?.message ?? "Could not download PDF from storage.");
  }

  if (data.type && !isAllowedPdfContentType(data.type)) {
    throw new Error("Stored object is not a PDF.");
  }

  const buffer = Buffer.from(await data.arrayBuffer());
  assertPdfBufferSize(buffer);
  assertPdfMagic(buffer);
  return buffer;
}

export function assertPdfBufferSize(buffer: Buffer) {
  if (buffer.length > maxPdfBytes) {
    throw new Error(pdfSizeErrorMessage());
  }
}

export function limitExtractedText(text: string) {
  return text.slice(0, maxExtractedTextChars);
}

function assertPdfResponseHeaders(response: Response) {
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType && !isAllowedPdfContentType(contentType)) {
    throw new Error("Downloaded object is not a PDF.");
  }

  const contentLength = Number(response.headers.get("content-length") ?? 0);
  if (contentLength > maxPdfBytes) {
    throw new Error(pdfSizeErrorMessage());
  }
}

function isAllowedPdfContentType(value: string) {
  const normalized = value.toLowerCase();
  return (
    normalized.includes("application/pdf") ||
    normalized.includes("application/octet-stream")
  );
}

async function readResponseWithLimit(response: Response) {
  const reader = response.body?.getReader();
  if (!reader) {
    const buffer = Buffer.from(await response.arrayBuffer());
    assertPdfBufferSize(buffer);
    assertPdfMagic(buffer);
    return buffer;
  }

  const chunks: Uint8Array[] = [];
  let total = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;

    total += value.byteLength;
    if (total > maxPdfBytes) {
      throw new Error(pdfSizeErrorMessage());
    }

    chunks.push(value);
  }

  const buffer = Buffer.concat(chunks);
  assertPdfMagic(buffer);
  return buffer;
}
