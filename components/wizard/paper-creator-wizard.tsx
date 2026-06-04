"use client";

import * as React from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  BrainCircuit,
  Check,
  Gauge,
  Rocket,
  ServerCog,
} from "lucide-react";
import { toast } from "sonner";
import { BrandLogo } from "@/components/brand-logo";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { fetchApiData } from "@/lib/api-client";
import { generateBlueprint } from "@/lib/blueprint";
import {
  bloomLabels,
  difficultyLabels,
  questionTypeMeta,
} from "@/lib/edutest-data";
import { buildGenerationContract } from "@/lib/generation-contract";
import type {
  BloomLevel,
  ChapterOption,
  GenerationContract,
  PaperSourceMode,
} from "@/types";
import { GenerationOverlay } from "./generation-overlay";
import { PaperConfigProvider, usePaperConfig } from "./paper-config-context";
import { PdfUploadStep } from "./pdf-upload-step";
import { ProgressSteps } from "./progress-steps";
import { StepComposition } from "./step-composition";
import { StepFour } from "./step-four";
import { StepFive } from "./step-five";
import { StepIntegrationPrompt } from "./step-integration-prompt";
import { StepOne } from "./step-one";
import { StepThree } from "./step-three";
import { StepTwo } from "./step-two";

export function PaperCreatorWizard({
  initialSourceMode = "curriculum",
}: {
  initialSourceMode?: PaperSourceMode;
}) {
  return (
    <PaperConfigProvider initialSourceMode={initialSourceMode}>
      <WizardInner />
    </PaperConfigProvider>
  );
}

function WizardInner() {
  const { config } = usePaperConfig();
  const [step, setStep] = React.useState(1);
  const [generating, setGenerating] = React.useState(false);

  const bloomTotal = Object.values(config.bloomDistribution).reduce(
    (sum, value) => sum + value,
    0,
  );

  function validateStep() {
    if (step === 1 && config.sourceMode === "pdf_upload" && !config.pdfSourceId) {
      toast.error("Upload and process a PDF before continuing.");
      return false;
    }

    if (step === 1 && config.sourceMode !== "pdf_upload" && (
      !config.classNum ||
      !config.subjects?.length ||
      !config.chapterIds.length
    )) {
      toast.error("Select at least one subject and one chapter.");
      return false;
    }

    if (step === 2) {
      const compositionTotal = (config.questionComposition ?? []).reduce(
        (sum, item) => sum + item.questionCount,
        0,
      );
      if (config.totalQuestions < 5 || compositionTotal !== config.totalQuestions) {
        toast.error("Set a valid S/C/T composition that matches total questions.");
        return false;
      }
    }

    if (step === 3 && config.duration < 30) {
      toast.error("Set at least 30 minutes.");
      return false;
    }

    if (step === 4 && bloomTotal !== 100) {
      toast.error("Bloom distribution must add up to 100%.");
      return false;
    }

    if (step === 5 && !config.questionTypes.length) {
      toast.error("Select at least one question format.");
      return false;
    }

    if (step === 5) {
      try {
        generateBlueprint(config);
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : "Selected question formats cannot create this paper shape.",
        );
        return false;
      }
    }

    return true;
  }

  function next() {
    if (!validateStep()) return;
    setStep((current) => Math.min(8, current + 1));
  }

  return (
    <main className="min-h-screen bg-background pb-16 text-slate-100">
      <header className="border-b border-white/10 bg-[#0a0e1a]/90 backdrop-blur">
        <div className="safe-container flex min-h-[72px] items-center justify-between gap-4">
          <BrandLogo />
          <Button asChild variant="ghost">
            <Link href="/">Back to Home</Link>
          </Button>
        </div>
      </header>

      <div className="safe-container pt-8">
        <ProgressSteps
          currentStep={Math.min(step, 7)}
          firstLabel={config.sourceMode === "pdf_upload" ? "Upload PDF" : "Class & Chapters"}
          secondLabel={config.sourceMode === "pdf_upload" ? "PDF Composition" : "S/C/T Composition"}
        />

        <Card className="mx-auto mt-8 max-w-5xl p-5 sm:p-7">
          <div key={step}>
            {step === 1 ? (
              config.sourceMode === "pdf_upload" ? <PdfUploadStep /> : <StepOne />
            ) : null}
            {step === 2 ? <StepComposition /> : null}
            {step === 3 ? <StepTwo /> : null}
            {step === 4 ? <StepFour /> : null}
            {step === 5 ? <StepThree /> : null}
            {step === 6 ? <StepFive /> : null}
            {step === 7 ? <StepIntegrationPrompt /> : null}
            {step === 8 ? (
              <ConfirmationScreen
                onEdit={() => setStep(1)}
                onGenerate={() => setGenerating(true)}
              />
            ) : null}
          </div>

          {step < 8 ? (
            <div className="mt-8 flex flex-col justify-between gap-3 border-t border-white/10 pt-5 sm:flex-row">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setStep((current) => Math.max(1, current - 1))}
                disabled={step === 1}
              >
                <ArrowLeft className="h-4 w-4" />
                Back
              </Button>
              <Button type="button" onClick={next}>
                {step === 7 ? "Review Configuration" : "Continue"}
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          ) : null}
        </Card>
      </div>

      <GenerationOverlay
        config={config}
        open={generating}
        onClose={() => setGenerating(false)}
      />
    </main>
  );
}

function ConfirmationScreen({
  onEdit,
  onGenerate,
}: {
  onEdit: () => void;
  onGenerate: () => void;
}) {
  const { config } = usePaperConfig();
  const [chapters, setChapters] = React.useState<ChapterOption[]>([]);
  const selectedSubjects = React.useMemo(
    () =>
      config.subjects?.length
        ? config.subjects
        : config.subject
          ? config.subject.split(" + ")
          : [],
    [config.subject, config.subjects],
  );
  const selectedSubjectKey = selectedSubjects.join("|");
  const selectedTypes = config.questionTypes
    .map((type) => questionTypeMeta.find((item) => item.type === type))
    .filter(Boolean);
  const selectedChapters = chapters.filter((chapter) =>
    config.chapterIds.includes(chapter.id),
  );
  const blueprint = React.useMemo(() => {
    try {
      return generateBlueprint(config);
    } catch {
      return null;
    }
  }, [config]);
  const contract = React.useMemo(() => {
    if (!blueprint) return null;
    return buildGenerationContract(config, blueprint, {
      availableTopics: selectedChapters.flatMap((chapter) =>
        chapter.topics.map((topic) => topic.name),
      ),
    });
  }, [blueprint, config, selectedChapters]);
  const aiProviderLabel =
    config.aiProvider === "GEMINI"
      ? "Gemini Only"
      : config.aiProvider === "GROQ"
        ? "GroqCloud Only"
      : config.aiProvider === "GROK"
        ? "xAI Grok Only"
        : config.aiProvider === "MISTRAL"
          ? "Mistral Only"
          : config.aiProvider === "CEREBRAS"
            ? "Cerebras Only"
          : config.aiProvider === "DEEPSEEK"
            ? "DeepSeek Only"
        : config.aiProvider === "OPENROUTER"
          ? "OpenRouter Only"
      : config.aiProvider === "GITHUB_MODELS"
        ? "GitHub Models"
      : config.aiProvider === "COHERE"
        ? "Cohere Only"
      : config.aiProvider === "CLOUDFLARE"
        ? "Cloudflare AI"
      : config.aiProvider === "OPENAI"
        ? "OpenAI Only"
        : "Auto Fallback";

  React.useEffect(() => {
    if (config.sourceMode === "pdf_upload") {
      let cancelled = false;
      queueMicrotask(() => {
        if (!cancelled) setChapters([]);
      });
      return () => {
        cancelled = true;
      };
    }

    const subjectsToLoad = selectedSubjectKey ? selectedSubjectKey.split("|") : [];
    if (!subjectsToLoad.length) {
      let cancelled = false;
      queueMicrotask(() => {
        if (!cancelled) setChapters([]);
      });
      return () => {
        cancelled = true;
      };
    }

    let cancelled = false;
    Promise.all(
      subjectsToLoad.map((subject) =>
        fetchApiData<{ chapters: ChapterOption[] }>(
          `/api/chapters?class=${config.classNum}&subject=${encodeURIComponent(subject)}`,
          undefined,
          "Could not load chapters.",
        )
          .then((data) => data.chapters ?? []),
      ),
    )
      .then((groups) => {
        if (!cancelled) setChapters(groups.flat());
      })
      .catch(() => {
        if (!cancelled) setChapters([]);
      });

    return () => {
      cancelled = true;
    };
  }, [config.classNum, config.sourceMode, selectedSubjectKey]);

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-extrabold text-white">Confirm Your Paper</h2>
        <p className="mt-2 text-sm text-slate-400">
          Review the blueprint before generation starts.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {config.sourceMode === "pdf_upload" ? (
          <SummaryBlock title="PDF Source">
            <SummaryLine
              label="PDF"
              value={config.pdfSource?.fileName ?? config.pdfSource?.title ?? "Uploaded PDF"}
            />
            <SummaryLine
              label="Detected Title"
              value={config.pdfSource?.title ?? "Uploaded chapter"}
            />
            <SummaryLine
              label="Concepts"
              value={`${config.pdfSource?.conceptsCount ?? 0} extracted`}
            />
          </SummaryBlock>
        ) : (
          <SummaryBlock title="Coverage">
            <SummaryLine label="Class" value={String(config.classNum)} />
            <SummaryLine
              label="Subjects"
              value={selectedSubjects.length ? selectedSubjects.join(", ") : config.subject}
            />
            <SummaryLine
              label="Chapters"
              value={
                selectedChapters.length
                  ? `${selectedChapters
                      .slice(0, 2)
                      .map((chapter) => chapter.name)
                      .join(", ")}${
                      selectedChapters.length > 2
                        ? ` (+ ${selectedChapters.length - 2} more)`
                        : ""
                    }`
                  : `${config.chapterIds.length} selected`
              }
            />
          </SummaryBlock>
        )}

        <SummaryBlock title="Paper Shape">
          <SummaryLine label="Total Marks" value={`${blueprint?.totalMarks ?? config.totalMarks}`} />
          <SummaryLine label="Duration" value={`${config.duration} min`} />
          <SummaryLine label="Difficulty" value={difficultyLabels[config.difficulty]} />
          <SummaryLine label="AI Engine" value={aiProviderLabel} />
          <SummaryLine
            label="Exact Questions"
            value={`${blueprint?.totalQuestions ?? config.totalQuestions}`}
          />
        </SummaryBlock>
      </div>

      {contract ? (
        <PromptImpactPanel
          contract={contract}
          aiProviderLabel={aiProviderLabel}
          selectedChapters={selectedChapters}
        />
      ) : null}

      {config.questionComposition?.length ? (
        <SummaryBlock title="S/C/T Composition">
          <div className="grid gap-2 sm:grid-cols-2">
            {config.questionComposition.slice(0, 8).map((item) => (
              <div
                key={`${item.subject}-${item.chapterId ?? item.chapterName}-${item.topicId ?? item.topicName}`}
                className="rounded-lg border border-white/10 bg-slate-950/40 px-3 py-2 text-sm"
              >
                <div className="font-semibold text-slate-100">
                  {item.topicName ?? item.chapterName ?? item.subject}
                </div>
                <div className="mt-1 text-slate-400">
                  {item.questionCount} question{item.questionCount === 1 ? "" : "s"} |{" "}
                  {item.subject}
                </div>
              </div>
            ))}
          </div>
          {config.questionComposition.length > 8 ? (
            <p className="mt-3 text-sm text-slate-400">
              + {config.questionComposition.length - 8} more coverage rows
            </p>
          ) : null}
        </SummaryBlock>
      ) : null}

      <SummaryBlock title="Question Types">
        {blueprint ? (
          <div className="grid gap-2 sm:grid-cols-2">
            {blueprint.sections.map((section) => {
              const meta = questionTypeMeta.find(
                (item) => item.type === section.questionType,
              );

              return (
                <div
                  key={section.questionType}
                  className="rounded-lg border border-white/10 bg-slate-950/40 px-3 py-2 text-sm"
                >
                  <span className="font-semibold text-slate-100">
                    {meta?.label ?? section.questionType}
                  </span>
                  <span className="ml-2 text-slate-400">
                    {section.count} question{section.count === 1 ? "" : "s"} |{" "}
                    {section.totalMarks} marks
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {selectedTypes.map((type) => (
              <span
                key={type!.type}
                className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-sm text-slate-200"
              >
                {type!.label} {config.typeDistribution[type!.type] ?? 0} question
                {(config.typeDistribution[type!.type] ?? 0) === 1 ? "" : "s"}
              </span>
            ))}
          </div>
        )}
      </SummaryBlock>

      <SummaryBlock title="Bloom Distribution">
        <div className="grid gap-2 sm:grid-cols-3">
          {(Object.keys(config.bloomDistribution) as BloomLevel[]).map((level) => (
            <div
              key={level}
              className="flex items-center justify-between rounded-lg border border-white/10 bg-slate-950/40 px-3 py-2 text-sm"
            >
              <span className="text-slate-300">{bloomLabels[level]}</span>
              <span className="font-bold text-white">
                {config.bloomDistribution[level]}%
              </span>
            </div>
          ))}
        </div>
      </SummaryBlock>

      <div className="flex flex-col justify-between gap-3 border-t border-white/10 pt-5 sm:flex-row">
        <Button type="button" variant="ghost" onClick={onEdit}>
          <ArrowLeft className="h-4 w-4" />
          Edit Configuration
        </Button>
        <Button type="button" onClick={onGenerate}>
          <Rocket className="h-4 w-4" />
          Generate Paper
        </Button>
      </div>
    </div>
  );
}

function SummaryBlock({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.035] p-4">
      <h3 className="mb-3 flex items-center gap-2 font-bold text-white">
        <Check className="h-4 w-4 text-emerald-300" />
        {title}
      </h3>
      {children}
    </div>
  );
}

function PromptImpactPanel({
  contract,
  aiProviderLabel,
  selectedChapters,
}: {
  contract: GenerationContract;
  aiProviderLabel: string;
  selectedChapters: ChapterOption[];
}) {
  const sectionSummary = contract.sections
    .map((section) => `${section.label} ${section.count}`)
    .join(" | ");
  const bloomSummary = (Object.keys(contract.paper.bloomDistribution) as BloomLevel[])
    .filter((level) => contract.paper.bloomDistribution[level] > 0)
    .map((level) => `${bloomLabels[level]} ${contract.paper.bloomDistribution[level]}%`)
    .join(" | ");
  const scopeLabel =
    contract.source.mode === "pdf_upload"
      ? contract.source.pdfTitle || "Uploaded PDF"
      : selectedChapters.length
        ? selectedChapters
            .slice(0, 3)
            .map((chapter) => chapter.name)
            .join(", ")
        : `${contract.source.chapterIds.length} selected chapter${
            contract.source.chapterIds.length === 1 ? "" : "s"
          }`;
  const hiddenChapters = Math.max(0, selectedChapters.length - 3);
  const integrationPrompt = contract.paper.integrationPrompt;

  return (
    <div className="rounded-lg border border-blue-300/20 bg-blue-500/[0.055] p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h3 className="flex items-center gap-2 text-lg font-extrabold text-white">
            <BrainCircuit className="h-5 w-5 text-blue-200" />
            Prompt Impact
          </h3>
          <p className="mt-1 text-sm leading-6 text-slate-300">
            Every selected choice below is included in the backend generation
            contract sent to AI.
          </p>
        </div>
        <div className="rounded-lg border border-white/10 bg-slate-950/50 px-3 py-2 text-xs font-bold uppercase text-blue-100">
          Contract {contract.hash}
        </div>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-3">
        <PromptImpactTile
          icon={<BrainCircuit className="h-4 w-4 text-blue-200" />}
          title="AI Receives"
          lines={[
            `Class ${contract.source.classNum} | ${contract.source.subjects.join(", ")}`,
            scopeLabel + (hiddenChapters ? ` (+ ${hiddenChapters} more)` : ""),
            `${contract.paper.totalQuestions} questions | ${contract.paper.totalMarks} marks | ${contract.paper.durationMin} min`,
            `${difficultyLabels[contract.paper.difficulty]} difficulty | ${aiProviderLabel}`,
          ]}
        />
        <PromptImpactTile
          icon={<ServerCog className="h-4 w-4 text-emerald-200" />}
          title="API Estimate"
          lines={[
            `${contract.apiEstimate.plannedCalls} planned call${
              contract.apiEstimate.plannedCalls === 1 ? "" : "s"
            }`,
            `${contract.apiEstimate.repairAllowance} repair attempt allowance`,
            `Input ${formatTokenRange(contract.apiEstimate.estimatedInputTokens)} tokens`,
            `Output ${formatTokenRange(contract.apiEstimate.estimatedOutputTokens)} tokens`,
          ]}
        />
        <PromptImpactTile
          icon={<Gauge className="h-4 w-4 text-amber-200" />}
          title="Prompt Shape"
          lines={[
            sectionSummary || "No valid section shape yet",
            bloomSummary || "Bloom distribution pending",
            integrationPrompt
              ? `Integration: ${truncateText(integrationPrompt, 110)}`
              : "No extra integration prompt",
            contract.apiEstimate.providerFallbackNote,
          ]}
        />
      </div>

      <div
        className={[
          "mt-4 rounded-lg border p-3 text-sm leading-6",
          contract.apiEstimate.riskLevel === "high"
            ? "border-amber-300/30 bg-amber-500/10 text-amber-50"
            : contract.apiEstimate.riskLevel === "medium"
              ? "border-blue-300/20 bg-blue-500/10 text-blue-50"
              : "border-emerald-300/20 bg-emerald-500/10 text-emerald-50",
        ].join(" ")}
      >
        <div className="mb-1 flex items-center gap-2 font-bold">
          <AlertTriangle className="h-4 w-4" />
          {contract.apiEstimate.riskLevel.toUpperCase()} API risk
        </div>
        {contract.apiEstimate.riskReasons.join(" ")}
      </div>
    </div>
  );
}

function PromptImpactTile({
  icon,
  title,
  lines,
}: {
  icon: React.ReactNode;
  title: string;
  lines: string[];
}) {
  return (
    <div className="rounded-lg border border-white/10 bg-slate-950/40 p-3">
      <div className="flex items-center gap-2 text-xs font-bold uppercase text-slate-400">
        {icon}
        {title}
      </div>
      <div className="mt-3 space-y-2">
        {lines.map((line) => (
          <div key={line} className="text-sm leading-5 text-slate-100">
            {line}
          </div>
        ))}
      </div>
    </div>
  );
}

function formatTokenRange(range: { min: number; max: number }) {
  return `${compactNumber(range.min)}-${compactNumber(range.max)}`;
}

function compactNumber(value: number) {
  if (value >= 1000) return `${Math.round(value / 100) / 10}k`;
  return String(value);
}

function truncateText(value: string, maxLength: number) {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength - 3)}...`;
}

function SummaryLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 border-b border-white/10 py-2 last:border-0">
      <span className="text-sm text-slate-400">{label}</span>
      <span className="max-w-[70%] text-right text-sm font-semibold text-slate-100">
        {value}
      </span>
    </div>
  );
}
