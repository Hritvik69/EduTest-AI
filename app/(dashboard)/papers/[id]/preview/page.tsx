"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Download, Eye, EyeOff, Play, Printer } from "lucide-react";
import { GenerationManifestSummary } from "@/components/paper/generation-manifest-summary";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { fetchApiData } from "@/lib/api-client";
import { questionTypeMeta } from "@/lib/edutest-data";
import type { GeneratedQuestion, StoredPaper } from "@/types";

export default function PaperPreviewPage() {
  const params = useParams<{ id: string }>();
  const paperId = params.id;
  const [paper, setPaper] = React.useState<StoredPaper | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [teacherView, setTeacherView] = React.useState(false);
  const [exporting, setExporting] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    const parsed = readSessionPaper(paperId);
    if (parsed) {
      queueMicrotask(() => {
        if (cancelled) return;
        setPaper({
          ...parsed,
          id: parsed.id ?? parsed.paperId ?? paperId,
          sessionOnly: parsed.sessionOnly ?? true,
        });
        setLoading(false);
      });
      return () => {
        cancelled = true;
      };
    }

    fetchApiData<StoredPaper>(
      `/api/papers/${paperId}`,
      undefined,
      "Could not load paper preview.",
    )
      .then((data) => {
        if (cancelled) return;
        setPaper({ ...data, id: data.id ?? Number(paperId) });
      })
      .catch(() => {
        if (!cancelled) setPaper(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [paperId]);

  if (loading) {
    return (
      <main className="min-h-screen bg-[#111827] p-6 text-slate-100">
        <div className="safe-container">Loading preview...</div>
      </main>
    );
  }

  if (!paper) {
    return (
      <main className="min-h-screen bg-[#111827] p-6 text-slate-100">
        <div className="safe-container">Paper not found.</div>
      </main>
    );
  }

  const grouped = groupQuestions(paper.questions);
  const isSessionPaper =
    Boolean(paper.sessionOnly) || String(paper.id).startsWith("session-");

  return (
    <main className="min-h-screen bg-[#111827] pb-14 text-slate-100">
      <header className="sticky top-0 z-20 border-b border-white/10 bg-[#111827]/95 backdrop-blur">
        <div className="safe-container flex min-h-[72px] flex-wrap items-center justify-between gap-3 py-3">
          <Button asChild variant="ghost">
            <Link href="/dashboard">
              <ArrowLeft className="h-4 w-4" />
              Dashboard
            </Link>
          </Button>
          <div className="flex flex-wrap gap-2">
            <Button
              variant={teacherView ? "gold" : "outline"}
              onClick={() => setTeacherView((current) => !current)}
            >
              {teacherView ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              {teacherView ? "Teacher View" : "Student View"}
            </Button>
            <Button variant="outline" onClick={() => window.print()}>
              <Printer className="h-4 w-4" />
              Print
            </Button>
            {isSessionPaper ? (
              <Button
                type="button"
                variant="outline"
                disabled={exporting}
                onClick={() =>
                  void downloadSessionPaper({
                    paper,
                    includeAnswers: teacherView,
                    setExporting,
                  })
                }
              >
                <Download className="h-4 w-4" />
                {exporting ? "Exporting" : "Download PDF"}
              </Button>
            ) : (
              <Button asChild variant="outline">
                <Link
                  href={`/api/papers/${paperId}/export?format=pdf${
                    teacherView ? "&includeAnswers=true" : ""
                  }`}
                >
                  <Download className="h-4 w-4" />
                  Download PDF
                </Link>
              </Button>
            )}
            <Button asChild>
              <Link href={`/test/${paperId}`}>
                <Play className="h-4 w-4" />
                Start Test
              </Link>
            </Button>
          </div>
        </div>
      </header>

      <div className="safe-container pt-8">
        <div className="mx-auto mb-5 max-w-4xl">
          <GenerationManifestSummary manifest={paper.manifest} />
        </div>
        <article className="mx-auto max-w-3xl bg-white p-8 text-slate-950 shadow-2xl sm:p-12 print:shadow-none">
          <PaperHeader paper={paper} />

          <section className="mt-6 rounded border border-slate-300 p-4 text-sm leading-6">
            <h2 className="mb-2 font-bold">General Instructions</h2>
            <p>1. All questions are compulsory.</p>
            <p>2. Marks for each question are indicated beside the question.</p>
            <p>3. Draw neat labelled diagrams wherever necessary.</p>
            <p>4. Read all questions carefully before attempting.</p>
          </section>

          <div className="mt-8 space-y-8">
            {grouped.map((section) => (
              <section key={section.name}>
                <h2 className="border-b border-slate-300 pb-2 text-lg font-extrabold">
                  {section.name}
                </h2>
                <div className="mt-4 space-y-5">
                  {section.questions.map(({ question, index }) => (
                    <QuestionPreview
                      key={question.id ?? `${question.type}-${index}`}
                      question={question}
                      index={index}
                      teacherView={teacherView}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        </article>
      </div>
    </main>
  );
}

function readSessionPaper(paperId: string) {
  const key = `edutest:paper:${paperId}`;
  try {
    const stored =
      window.sessionStorage.getItem(key) ?? window.localStorage.getItem(key);
    if (!stored) return null;
    return JSON.parse(stored);
  } catch {
    try {
      window.sessionStorage.removeItem(key);
      window.localStorage.removeItem(key);
    } catch {
      // Ignore blocked browser storage.
    }
    return null;
  }
}

async function downloadSessionPaper({
  paper,
  includeAnswers,
  setExporting,
}: {
  paper: StoredPaper;
  includeAnswers: boolean;
  setExporting: (value: boolean) => void;
}) {
  const token = paper.paperSnapshotToken ?? paper.guestPaperToken;
  if (!token) {
    window.alert("This session paper cannot be exported without its signed token.");
    return;
  }

  setExporting(true);
  try {
    const response = await fetch("/api/session-paper/export", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        paperSnapshot: serializablePaperSnapshot(paper),
        paperSnapshotToken: token,
        includeAnswers,
        format: "pdf",
      }),
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      throw new Error(payload?.error ?? "Could not export session paper.");
    }

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = exportFileName(response, paper);
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  } catch (error) {
    console.error(error);
    window.alert(error instanceof Error ? error.message : "Could not export session paper.");
  } finally {
    setExporting(false);
  }
}

function serializablePaperSnapshot(paper: StoredPaper) {
  return {
    id: paper.id,
    title: paper.title,
    config: paper.config,
    blueprint: paper.blueprint,
    questions: paper.questions,
    isDemoMode: paper.isDemoMode,
    status: paper.status,
    createdAt: paper.createdAt,
    manifest: paper.manifest,
    generationJobId: paper.generationJobId,
    idempotencyKey: paper.idempotencyKey,
  };
}

function exportFileName(response: Response, paper: StoredPaper) {
  const disposition = response.headers.get("Content-Disposition") ?? "";
  const match = disposition.match(/filename="?([^"]+)"?/i);
  return match?.[1] ?? `${String(paper.id)}.pdf`;
}

function PaperHeader({ paper }: { paper: StoredPaper }) {
  const config = paper.config;
  const pdfMode = config.sourceMode === "pdf_upload";
  return (
    <header>
      <div className="grid grid-cols-3 items-start gap-4 text-sm">
        <input
          defaultValue="School Name"
          className="border-b border-slate-300 bg-transparent pb-1 font-semibold outline-none"
        />
        <div className="text-center text-xs font-bold uppercase tracking-wide text-slate-400">
          EduTest AI
        </div>
        <div className="text-right">{new Date().toLocaleDateString("en-IN")}</div>
      </div>

      <h1 className="mt-6 text-center text-2xl font-extrabold">
        {pdfMode
          ? config.pdfSource?.title ?? "PDF-EDU-TEST Paper"
          : `Class ${config.classNum} ${config.subject}`}
      </h1>
      <div className="mt-4 grid gap-2 border-y border-slate-300 py-3 text-sm sm:grid-cols-4">
        <Meta label="Subject" value={config.subject} />
        <Meta
          label="Class"
          value={
            pdfMode && !config.pdfSource?.classNum
              ? "Detected from PDF"
              : String(config.classNum)
          }
        />
        <Meta label="Max Marks" value={String(config.totalMarks)} />
        <Meta label="Duration" value={`${config.duration} min`} />
      </div>
      <div className="mt-2 text-center text-sm font-semibold">{config.examType}</div>
    </header>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="font-bold">{label}:</span> {value}
    </div>
  );
}

function QuestionPreview({
  question,
  index,
  teacherView,
}: {
  question: GeneratedQuestion;
  index: number;
  teacherView: boolean;
}) {
  const meta = questionTypeMeta.find((item) => item.type === question.type);

  return (
    <div className="break-inside-avoid text-sm leading-6">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <Badge className="mb-2 border-slate-300 bg-slate-100 text-slate-800">
            {meta?.label ?? question.type}
          </Badge>
          {question.scenario ? (
            <div className="mb-3 rounded border border-slate-300 bg-slate-50 p-3">
              {question.scenario}
            </div>
          ) : null}
          <p>
            <span className="font-bold">Q{index + 1}.</span>{" "}
            {formatQuestionText(question)}
          </p>
        </div>
        <span className="shrink-0 font-bold">[{question.marks}]</span>
      </div>

      {question.options ? (
        <div className="mt-2 grid gap-x-4 gap-y-1 sm:grid-cols-2">
          {question.options.map((option) => (
            <div key={option.id}>
              ({option.id}) {option.text}
            </div>
          ))}
        </div>
      ) : null}

      {question.matchPairs ? (
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {question.matchPairs.map((pair, pairIndex) => (
            <React.Fragment key={`${pair.left}-${pairIndex}`}>
              <div>{pairIndex + 1}. {pair.left}</div>
              <div>{String.fromCharCode(65 + pairIndex)}. {pair.right}</div>
            </React.Fragment>
          ))}
        </div>
      ) : null}

      {question.subQuestions ? (
        <div className="mt-3 space-y-2 pl-4">
          {question.subQuestions.map((subQuestion, subIndex) => (
            <div key={`${subQuestion.text}-${subIndex}`} className="flex gap-2">
              <span>({String.fromCharCode(97 + subIndex)})</span>
              <span className="flex-1">{subQuestion.text}</span>
              <span>[{subQuestion.marks}]</span>
            </div>
          ))}
        </div>
      ) : null}

      {teacherView ? (
        <div className="mt-2 rounded border border-emerald-300 bg-emerald-50 p-2 text-emerald-800">
          <span className="font-bold">Answer:</span> {question.correctAnswer}
        </div>
      ) : null}
    </div>
  );
}

function formatQuestionText(question: GeneratedQuestion) {
  if (question.type === "ASSERTION_REASON" && question.assertion && question.reason) {
    return `Assertion (A): ${question.assertion} Reason (R): ${question.reason}`;
  }

  return question.text;
}

function groupQuestions(questions: GeneratedQuestion[]) {
  const groups = new Map<string, { question: GeneratedQuestion; index: number }[]>();
  questions.forEach((question, index) => {
    const section = question.section ?? "Section A";
    groups.set(section, [...(groups.get(section) ?? []), { question, index }]);
  });

  return Array.from(groups.entries()).map(([name, groupedQuestions]) => ({
    name,
    questions: groupedQuestions,
  }));
}
