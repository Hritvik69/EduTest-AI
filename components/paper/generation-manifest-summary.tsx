"use client";

import type React from "react";
import { BrainCircuit, FileText, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import type { GenerationManifest } from "@/types";

export function GenerationManifestSummary({
  manifest,
  compact = false,
}: {
  manifest?: GenerationManifest;
  compact?: boolean;
}) {
  if (!manifest) return null;

  const sourceLabel =
    manifest.source.mode === "pdf_upload"
      ? manifest.source.pdfTitle || "Uploaded PDF"
      : `${manifest.source.subject} source`;
  const providerOrder = manifest.ai.taskProviderOrder.QUESTION_GENERATION ?? [];
  const warnings = manifest.warnings.slice(0, compact ? 2 : 4);
  const usage = manifest.ai.usageSummary;
  const contract = manifest.ai.promptContract;
  const promptMode = contract
    ? contract.paper.generationMode === "source_exact"
      ? "NCERT/PDF Source"
      : "Fresh Questions"
    : null;

  return (
    <Card className="print:hidden p-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm font-bold text-white">
            <ShieldCheck className="h-4 w-4 text-emerald-300" />
            Paper source manifest
          </div>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">
            {sourceLabel} using {manifest.source.conceptCount} concepts
            {manifest.source.pdfFocusPrompt
              ? ` with focus: "${manifest.source.pdfFocusPrompt}"`
              : ""}
            {promptMode ? `; mode: ${promptMode}` : ""}
          </p>
        </div>
        <Badge className="border-blue-300/25 bg-blue-500/10 text-blue-100">
          {manifest.validation.finalQuestions}/{manifest.validation.targetQuestions} valid
        </Badge>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-4">
        <SummaryTile
          icon={<FileText className="h-4 w-4 text-blue-200" />}
          label="Source"
          value={sourceDescription(manifest)}
        />
        <SummaryTile
          icon={<BrainCircuit className="h-4 w-4 text-purple-200" />}
          label="Question AI"
          value={
            providerOrder.length
              ? providerOrder.join(" -> ")
              : manifest.ai.selectedProvider
          }
        />
        <SummaryTile
          icon={<ShieldCheck className="h-4 w-4 text-emerald-200" />}
          label="Validation"
          value={`${manifest.validation.replacedQuestions} replaced, ${manifest.validation.skippedQuestions} skipped`}
        />
        <SummaryTile
          icon={<BrainCircuit className="h-4 w-4 text-purple-200" />}
          label="API Usage"
          value={
            usage
              ? `${usage.totalCalls} calls, ${usage.failureCalls} failed, ${compactNumber(
                  usage.estimatedInputTokens + usage.estimatedOutputTokens,
                )} est. tokens`
              : contract
                ? `${contract.apiEstimate.plannedCalls} planned calls, ${contract.apiEstimate.riskLevel} risk`
                : "Usage unavailable"
          }
        />
      </div>

      {manifest.source.topicNames.length && !compact ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {manifest.source.topicNames.slice(0, 10).map((topic) => (
            <span
              key={topic}
              className="rounded-full border border-white/10 bg-slate-950/40 px-3 py-1 text-xs font-semibold text-slate-200"
            >
              {topic}
            </span>
          ))}
        </div>
      ) : null}

      {warnings.length ? (
        <div className="mt-4 rounded-lg border border-amber-300/20 bg-amber-500/10 p-3 text-sm leading-6 text-amber-50">
          {warnings.join(" ")}
        </div>
      ) : null}
    </Card>
  );
}

function SummaryTile({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-lg border border-white/10 bg-slate-950/40 p-3">
      <div className="flex items-center gap-2 text-xs font-bold uppercase text-slate-400">
        {icon}
        {label}
      </div>
      <div className="mt-2 text-sm font-semibold leading-6 text-slate-100">
        {value}
      </div>
    </div>
  );
}

function sourceDescription(manifest: GenerationManifest) {
  if (manifest.source.mode === "pdf_upload") {
    const method = manifest.source.extractionMethod
      ? `, ${manifest.source.extractionMethod.replace(/_/g, " ").toLowerCase()}`
      : "";
    return `PDF upload${method}`;
  }

  if (manifest.source.conceptSource === "curriculum") {
    return "Curriculum concepts";
  }
  if (manifest.source.conceptSource === "demo") {
    return "Demo fallback content";
  }
  if (manifest.source.conceptSource === "pdf") {
    return "NCERT_Books PDF concepts";
  }

  return "Unknown source";
}

function compactNumber(value: number) {
  if (value >= 1000) return `${Math.round(value / 100) / 10}k`;
  return String(value);
}
