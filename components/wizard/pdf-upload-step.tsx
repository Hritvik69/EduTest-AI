"use client";

import * as React from "react";
import { AlertCircle, CheckCircle2, FileText, Loader2, UploadCloud } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { apiErrorMessage, unwrapApiData } from "@/lib/api-client";
import { maxPdfBytes, maxPdfSizeLabel, pdfSizeErrorMessage } from "@/lib/pdf-limits";
import { cn } from "@/lib/utils";
import type { UploadedPdfSourceSummary } from "@/types";
import { usePaperConfig } from "./paper-config-context";

interface UploadProgressState {
  fileName: string;
  startedAt: number;
  estimatedSeconds: number;
  percent: number;
  message: string;
  lastProgressAt: number;
}

export function PdfUploadStep() {
  const { config, updateConfig } = usePaperConfig();
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const uploadControllerRef = React.useRef<AbortController | null>(null);
  const [dragActive, setDragActive] = React.useState(false);
  const [uploading, setUploading] = React.useState(false);
  const [uploadProgress, setUploadProgress] = React.useState<UploadProgressState | null>(
    null,
  );
  const [progressNow, setProgressNow] = React.useState(() => Date.now());
  const [error, setError] = React.useState<string | null>(null);
  const [focusPrompt, setFocusPrompt] = React.useState("");
  const source = config.pdfSource;

  React.useEffect(() => {
    if (!uploading) return undefined;
    const interval = window.setInterval(() => setProgressNow(Date.now()), 500);
    return () => window.clearInterval(interval);
  }, [uploading]);

  React.useEffect(
    () => () => {
      uploadControllerRef.current?.abort();
    },
    [],
  );

  async function handleFile(file: File | null) {
    if (!file) return;
    setError(null);
    uploadControllerRef.current?.abort();

    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      setError("Only PDF files are allowed.");
      return;
    }

    if (file.size > maxPdfBytes) {
      setError(pdfSizeErrorMessage());
      return;
    }

    const startedAt = Date.now();
    setProgressNow(startedAt);
    setUploadProgress({
      fileName: file.name,
      startedAt,
      estimatedSeconds: estimatePdfUploadSeconds(file.size),
      percent: 2,
      message: "Preparing upload",
      lastProgressAt: startedAt,
    });
    setUploading(true);
    const controller = new AbortController();
    uploadControllerRef.current = controller;
    const formData = new FormData();
    formData.append("file", file);
    const trimmedFocusPrompt = focusPrompt.trim();
    if (trimmedFocusPrompt) {
      formData.append("focusPrompt", trimmedFocusPrompt.slice(0, 1000));
    }

    try {
      const response = await fetch("/api/pdf-sources?stream=1", {
        method: "POST",
        body: formData,
        signal: controller.signal,
      });
      const payload = await readUploadApiPayload(response, controller.signal, (progress) => {
        setUploadProgress((current) =>
          current
            ? {
                ...current,
                percent: Math.max(current.percent, progress.progress),
                message: progress.message,
                lastProgressAt:
                  progress.progress > current.percent ? Date.now() : current.lastProgressAt,
              }
            : current,
        );
      });

      if (!response.ok) {
        throw new Error(apiErrorMessage(payload, "PDF understanding failed."));
      }

      const data = unwrapApiData<{ source: UploadedPdfSourceSummary }>(payload);
      const subject = data.source.subject || "Uploaded PDF";
      updateConfig({
        sourceMode: "pdf_upload",
        pdfSourceId: data.source.id,
        pdfSource: data.source,
        subject,
        subjects: [subject],
        classNum: data.source.classNum ?? config.classNum,
        subjectSelections: [],
        chapterIds: [],
        topicIds: [],
        questionComposition: [],
      });
      toast.success("PDF understood. Continue to paper settings.");
    } catch (uploadError) {
      if (controller.signal.aborted) {
        return;
      }
      const message =
        uploadError instanceof Error ? uploadError.message : "PDF understanding failed.";
      setError(message);
      toast.error(message);
    } finally {
      if (uploadControllerRef.current === controller) {
        uploadControllerRef.current = null;
      }
      setUploading(false);
      setUploadProgress(null);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-extrabold text-white">Upload Chapter PDF</h2>
        <p className="mt-2 text-sm text-slate-400">
          The AI reads the PDF first, extracts exam concepts, and then uses that
          material for this paper.
        </p>
      </div>

      <label className="block">
        <span className="mb-2 block text-sm font-bold text-slate-200">
          PDF focus prompt
        </span>
        <textarea
          value={focusPrompt}
          onChange={(event) => setFocusPrompt(event.target.value.slice(0, 1000))}
          disabled={uploading}
          rows={3}
          className="w-full resize-y rounded-lg border border-white/10 bg-slate-950/70 p-3 text-sm leading-6 text-white outline-none transition focus:border-blue-300/70 disabled:cursor-wait disabled:opacity-60"
          placeholder="Example: Use only Chapter 1 from this PDF, especially coordinate geometry examples and exercises. Ignore other chapters."
        />
        <span className="mt-2 block text-xs text-slate-500">
          Optional. Use this when the PDF has many chapters or you want only one
          chapter, topic, page range, or exercise style.
        </span>
      </label>

      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,.pdf"
        className="hidden"
        onChange={(event) => void handleFile(event.target.files?.[0] ?? null)}
      />

      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragEnter={(event) => {
          event.preventDefault();
          setDragActive(true);
        }}
        onDragOver={(event) => {
          event.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragActive(false);
          void handleFile(event.dataTransfer.files?.[0] ?? null);
        }}
        disabled={uploading}
        className={cn(
          "flex min-h-72 w-full flex-col items-center justify-center rounded-lg border border-dashed p-8 text-center transition",
          dragActive
            ? "border-blue-300 bg-blue-500/10"
            : "border-white/15 bg-white/[0.035] hover:border-blue-300/50",
          uploading && "cursor-wait opacity-80",
        )}
      >
        <div className="flex h-16 w-16 items-center justify-center rounded-lg border border-blue-300/25 bg-blue-500/10 text-blue-100">
          {uploading ? (
            <Loader2 className="h-8 w-8 animate-spin" />
          ) : (
            <UploadCloud className="h-8 w-8" />
          )}
        </div>
        <div className="mt-5 text-xl font-extrabold text-white">
          {uploading ? "Understanding PDF..." : "Drop PDF here or click to upload"}
        </div>
        <p className="mt-2 max-w-xl text-sm leading-6 text-slate-400">
          PDF only, up to {maxPdfSizeLabel}. Scanned pages are OCR-read locally and
          can take a minute.
        </p>
      </button>

      {uploading ? (
        <UploadProgressCard progress={uploadProgress} now={progressNow} />
      ) : null}

      {error ? (
        <div className="flex items-start gap-3 rounded-lg border border-red-300/25 bg-red-500/10 p-4 text-sm text-red-100">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      ) : null}

      {source ? <ExtractionSummary source={source} /> : null}
    </div>
  );
}

async function readApiPayload(response: Response) {
  try {
    return await response.json();
  } catch {
    return {
      success: false,
      error: response.ok
        ? "PDF upload returned an empty response."
        : `PDF upload failed with HTTP ${response.status}.`,
      code: response.status,
    };
  }
}

async function readUploadApiPayload(
  response: Response,
  signal: AbortSignal,
  onProgress: (progress: { progress: number; message: string }) => void,
) {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("text/event-stream") || !response.body) {
    return readApiPayload(response);
  }

  const reader = response.body.getReader();
  const abort = () => {
    void reader.cancel().catch(() => {});
  };
  signal.addEventListener("abort", abort, { once: true });
  const decoder = new TextDecoder();
  let buffer = "";
  let completePayload: unknown = null;

  try {
    while (true) {
      if (signal.aborted) throw new Error("PDF upload was cancelled.");
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const blocks = buffer.split("\n\n");
      buffer = blocks.pop() ?? "";

      for (const block of blocks) {
        const event = parseServerEventBlock(block);
        if (!event) continue;

        if (event.event === "progress") {
          onProgress({
            progress: clampProgress(Number(event.data.progress)),
            message: String(event.data.message ?? "Working on PDF"),
          });
        }

        if (event.event === "complete") {
          completePayload = event.data;
        }

        if (event.event === "error") {
          throw new Error(apiErrorMessage(event.data, "PDF understanding failed."));
        }
      }
    }
  } finally {
    signal.removeEventListener("abort", abort);
  }

  if (buffer.trim()) {
    const event = parseServerEventBlock(buffer);
    if (event?.event === "complete") completePayload = event.data;
  }

  return completePayload ?? {
    success: false,
    error: "PDF upload finished without a completion response.",
  };
}

function parseServerEventBlock(block: string) {
  const lines = block.split(/\n/);
  const event = lines
    .find((line) => line.startsWith("event:"))
    ?.replace(/^event:\s*/, "")
    .trim();
  const data = lines
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.replace(/^data:\s*/, ""))
    .join("\n");

  if (!event || !data) return null;

  try {
    return {
      event,
      data: JSON.parse(data) as Record<string, unknown>,
    };
  } catch {
    return null;
  }
}

function clampProgress(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function UploadProgressCard({
  progress,
  now,
}: {
  progress: UploadProgressState | null;
  now: number;
}) {
  const snapshot = uploadProgressSnapshot(progress, now);

  return (
    <Card className="p-4">
      <div className="space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="text-sm font-bold text-white">
              {snapshot.percent}% complete
            </div>
            <div className="mt-1 text-xs text-slate-400">
              {snapshot.fileName ? `${snapshot.fileName} - ` : ""}
              elapsed {snapshot.elapsedLabel}
            </div>
          </div>
          <div className="text-sm font-semibold text-blue-100">
            {snapshot.remainingLabel}
          </div>
        </div>

        <Progress value={snapshot.percent} />

        <div className="rounded-lg border border-blue-300/15 bg-blue-500/10 px-3 py-2 text-sm font-medium text-blue-100">
          {snapshot.message}
          {snapshot.stalled ? (
            <span className="mt-1 block text-xs text-blue-200/70">
              OCR can pause between page updates while the local engine is reading text.
            </span>
          ) : null}
        </div>

        <div className="grid gap-3 text-sm text-slate-300">
          {uploadStages.map((stage, index) => (
            <ProgressLine
              key={stage.label}
              label={stage.label}
              status={stageStatus(snapshot.percent, index)}
            />
          ))}
        </div>
      </div>
    </Card>
  );
}

function ProgressLine({
  label,
  status,
}: {
  label: string;
  status: "done" | "active" | "pending";
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-2",
        status === "pending" && "text-slate-500",
      )}
    >
      {status === "active" ? (
        <Loader2 className="h-4 w-4 animate-spin text-blue-200" />
      ) : status === "done" ? (
        <CheckCircle2 className="h-4 w-4 text-emerald-300" />
      ) : (
        <span className="h-4 w-4 rounded-full border border-white/15" />
      )}
      <span>{label}</span>
    </div>
  );
}

const uploadStages = [
  { label: "Reading PDF text", threshold: 0 },
  { label: "Running OCR if pages are scanned", threshold: 18 },
  { label: "Detecting important topics", threshold: 68 },
  {
    label: "Extracting formulas, examples, activities, and exercises",
    threshold: 84,
  },
];

function stageStatus(percent: number, index: number) {
  const current = uploadStages[index];
  const next = uploadStages[index + 1];
  if (next && percent >= next.threshold) return "done";
  if (percent >= current.threshold) return "active";
  return "pending";
}

function uploadProgressSnapshot(
  progress: UploadProgressState | null,
  now: number,
) {
  if (!progress) {
    return {
      percent: 8,
      elapsedLabel: "0s",
      remainingLabel: "Estimating time...",
      fileName: "",
      message: "Preparing upload",
      stalled: false,
    };
  }

  const elapsedSeconds = Math.max(0, (now - progress.startedAt) / 1000);
  const secondsSinceProgress = Math.max(0, (now - progress.lastProgressAt) / 1000);
  const percent = Math.min(100, Math.max(2, Math.round(progress.percent)));
  const remainingSeconds =
    percent > 5 && percent < 100
      ? Math.ceil((elapsedSeconds / percent) * (100 - percent))
      : Math.max(0, Math.ceil(progress.estimatedSeconds - elapsedSeconds));
  const stalled = secondsSinceProgress > 30 && percent < 90;

  return {
    percent,
    elapsedLabel: formatDuration(elapsedSeconds),
    remainingLabel:
      percent >= 100
        ? "Done"
        : stalled
        ? "Still working. ETA updates at the next progress step."
        : remainingSeconds > 0
        ? `Estimated ${formatDuration(remainingSeconds)} left`
        : "Almost done...",
    fileName: progress.fileName,
    message: progress.message,
    stalled,
  };
}

function estimatePdfUploadSeconds(size: number) {
  const sizeMb = size / (1024 * 1024);
  if (sizeMb <= 3) return 35;
  if (sizeMb <= 10) return 45;
  if (sizeMb <= 25) return 75;
  return 100;
}

function formatDuration(seconds: number) {
  const rounded = Math.max(0, Math.round(seconds));
  if (rounded < 60) return `${rounded}s`;
  const minutes = Math.floor(rounded / 60);
  const remainder = rounded % 60;
  return remainder ? `${minutes}m ${remainder}s` : `${minutes}m`;
}

function ExtractionSummary({ source }: { source: UploadedPdfSourceSummary }) {
  return (
    <Card className="p-5">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-emerald-300" />
            <h3 className="font-extrabold text-white">PDF Ready</h3>
          </div>
          <p className="mt-2 text-sm text-slate-400">{source.fileName}</p>
        </div>
        <Badge className="border-emerald-300/25 bg-emerald-500/10 text-emerald-100">
          {source.conceptsCount} concepts
        </Badge>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-3">
        <SummaryTile label="Detected Title" value={source.title} />
        <SummaryTile label="Subject" value={source.subject || "Detected from PDF"} />
        <SummaryTile
          label="Reading Size"
          value={`${source.wordCount.toLocaleString("en-IN")} words`}
        />
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <SummaryTile
          label="Extraction"
          value={source.extractionMethod ? extractionLabel(source.extractionMethod) : "AI"}
        />
        <SummaryTile
          label="Focus"
          value={source.focusPrompt || "Whole readable PDF"}
        />
      </div>

      <div className="mt-5">
        <div className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-200">
          <FileText className="h-4 w-4 text-blue-200" />
          Important Topics
        </div>
        <div className="flex flex-wrap gap-2">
          {source.topics.slice(0, 12).map((topic) => (
            <span
              key={topic}
              className="rounded-full border border-white/10 bg-slate-950/40 px-3 py-1.5 text-xs font-semibold text-slate-200"
            >
              {topic}
            </span>
          ))}
        </div>
      </div>
    </Card>
  );
}

function SummaryTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-slate-950/40 p-3">
      <div className="mono-label text-xs uppercase text-slate-500">{label}</div>
      <div className="mt-1 text-sm font-semibold text-slate-100">{value}</div>
    </div>
  );
}

function extractionLabel(value: NonNullable<UploadedPdfSourceSummary["extractionMethod"]>) {
  return value.replace(/_/g, " ").toLowerCase();
}
