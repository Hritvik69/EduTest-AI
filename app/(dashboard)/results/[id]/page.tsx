"use client";

import * as React from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  CheckCircle2,
  Download,
  FilePlus2,
  RotateCcw,
  Target,
  XCircle,
} from "lucide-react";
import { GenerationManifestSummary } from "@/components/paper/generation-manifest-summary";
import { BloomRadar } from "@/components/results/bloom-radar";
import { ScoreGauge } from "@/components/results/score-gauge";
import { TopicBars } from "@/components/results/topic-bars";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { fetchApiData } from "@/lib/api-client";
import type { StoredAttempt } from "@/types";

export default function ResultsPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const attemptId = params.id;
  const [attempt, setAttempt] = React.useState<StoredAttempt | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;
    const storedAttempt = readSessionAttempt(attemptId);
    if (storedAttempt) {
      queueMicrotask(() => {
        if (cancelled) return;
        setAttempt(storedAttempt);
        setLoading(false);
      });
      return () => {
        cancelled = true;
      };
    }

    fetchApiData<StoredAttempt>(
      `/api/attempts/${attemptId}`,
      undefined,
      "Could not load results.",
    )
      .then((data) => {
        if (!cancelled) setAttempt(data);
      })
      .catch(() => {
        if (!cancelled) setAttempt(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [attemptId]);

  function scrollToTopic(topic: string) {
    const target = document.querySelector(`[data-topic="${cssEscape(topic)}"]`);
    target?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-background p-6 text-slate-100">
        <div className="safe-container">Loading results...</div>
      </main>
    );
  }

  if (!attempt) {
    return (
      <main className="min-h-screen bg-background p-6 text-slate-100">
        <div className="safe-container">
          <Card className="p-6">
            <h1 className="text-2xl font-extrabold text-white">Results not found</h1>
            <Button asChild className="mt-5">
              <Link href="/dashboard">Back to Dashboard</Link>
            </Button>
          </Card>
        </div>
      </main>
    );
  }

  const topicAnalytics =
    attempt.topicAccuracy?.length
      ? attempt.topicAccuracy
      : [...attempt.weakTopics, ...attempt.strongTopics];
  const performance = performanceBand(attempt.percentage);
  const evaluationMethod = evaluationMethodLabel(attempt.questionResults);

  return (
    <main className="min-h-screen bg-background pb-12 text-slate-100">
      <header className="border-b border-white/10 bg-[#0a0e1a]/90 backdrop-blur">
        <div className="safe-container flex min-h-[72px] flex-wrap items-center justify-between gap-3 py-3">
          <Button asChild variant="ghost">
            <Link href="/dashboard">
              <ArrowLeft className="h-4 w-4" />
              Dashboard
            </Link>
          </Button>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => window.print()}>
              <Download className="h-4 w-4" />
              Download Result PDF
            </Button>
            {attempt.paperId ? (
              <Button variant="outline" onClick={() => router.push(`/test/${attempt.paperId}`)}>
                <RotateCcw className="h-4 w-4" />
                Reattempt
              </Button>
            ) : null}
            <Button asChild>
              <Link href="/create-test">
                <FilePlus2 className="h-4 w-4" />
                New Test
              </Link>
            </Button>
          </div>
        </div>
      </header>

      <div className="safe-container pt-8">
        <div className="mb-5">
          <GenerationManifestSummary
            manifest={attempt.generationManifest}
            compact
          />
        </div>
        <section className="grid gap-5 lg:grid-cols-[320px_minmax(0,1fr)]">
          <Card className="flex flex-col items-center p-6 text-center">
            <ScoreGauge percentage={attempt.percentage} />
            <h1 className="mt-5 text-3xl font-extrabold text-white">
              {attempt.totalScore} / {attempt.maxScore} marks
            </h1>
            <Badge className="mt-3 border-blue-300/30 bg-blue-500/10 px-4 py-1.5 text-blue-100">
              Grade {attempt.grade}
            </Badge>
            <div
              className="mt-4 rounded-lg border px-4 py-3"
              style={{
                borderColor: performance.border,
                backgroundColor: performance.background,
              }}
            >
              <div className="text-xs font-bold uppercase text-slate-400">
                Performance
              </div>
              <div className="mt-1 text-lg font-extrabold" style={{ color: performance.color }}>
                {performance.label}
              </div>
              <div className="mt-1 text-xs text-slate-400">{evaluationMethod}</div>
            </div>
            <p className="mt-3 text-sm text-slate-400">
              Finished in {formatDuration(attempt.timeTaken)}
            </p>
          </Card>

          <div className="grid gap-5">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {(attempt.sectionScores ?? []).map((section) => {
                const percent = section.max
                  ? Math.round((section.scored / section.max) * 100)
                  : 0;
                return (
                  <Card key={section.section} className="p-4">
                    <div className="flex items-center justify-between gap-3">
                      <h2 className="font-bold text-white">{section.section}</h2>
                      <span className="text-sm font-semibold text-slate-300">
                        {section.scored}/{section.max}
                      </span>
                    </div>
                    <div className="mt-3 h-2 rounded-full bg-white/10">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${percent}%`,
                          backgroundColor: scoreColor(percent),
                        }}
                      />
                    </div>
                  </Card>
                );
              })}
            </div>

            <div className="grid gap-5 xl:grid-cols-2">
              <Card className="overflow-x-auto p-5">
                <h2 className="mb-4 text-lg font-extrabold text-white">
                  Thinking Level Analysis
                </h2>
                <BloomRadar scores={attempt.bloomScores} />
              </Card>
              <Card className="overflow-x-auto p-5">
                <h2 className="mb-4 text-lg font-extrabold text-white">
                  Topic Accuracy
                </h2>
                <TopicBars topics={topicAnalytics} onTopicClick={scrollToTopic} />
              </Card>
            </div>
          </div>
        </section>

        <section className="mt-5 rounded-lg border border-blue-300/20 bg-blue-500/10 p-5">
          <div className="flex items-center gap-2">
            <Target className="h-5 w-5 text-blue-100" />
            <h2 className="text-lg font-extrabold text-white">
              Your Performance Summary
            </h2>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            {attempt.recommendations.map((item) => (
              <div
                key={item}
                className="rounded-lg border border-blue-200/15 bg-slate-950/35 p-3 text-sm leading-6 text-blue-50"
              >
                {item}
              </div>
            ))}
          </div>
        </section>

        <section className="mt-5">
          <h2 className="text-lg font-extrabold text-white">
            Focus Before Your Next Test
          </h2>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            {attempt.weakTopics.map((topic) => (
              <div
                key={topic.topic}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-300/20 bg-red-500/10 p-4"
              >
                <div>
                  <p className="font-bold text-white">{topic.topic}</p>
                  <p className="text-sm text-red-100">{topic.accuracy}% accuracy</p>
                </div>
                <Button asChild variant="outline" size="sm">
                  <Link href="/create-test">Create Practice Test</Link>
                </Button>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-6">
          <h2 className="text-xl font-extrabold text-white">Question Review</h2>
          <div className="mt-4 grid gap-3">
            {attempt.questionResults.map((result, index) => {
              const state =
                result.marksAwarded === result.maxMarks
                  ? "correct"
                  : result.marksAwarded > 0
                    ? "partial"
                    : "wrong";

              return (
                <details
                  key={result.questionId}
                  data-topic={result.topic ?? "General"}
                  className="scroll-mt-24 rounded-lg border border-white/10 bg-white/[0.035] p-4"
                >
                  <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3">
                    <span className="flex items-center gap-2 font-bold text-white">
                      {state === "correct" ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-300" />
                      ) : state === "partial" ? (
                        <Target className="h-4 w-4 text-amber-300" />
                      ) : (
                        <XCircle className="h-4 w-4 text-red-300" />
                      )}
                      Q{index + 1} [{result.questionType ?? "Question"}]
                    </span>
                    <Badge>
                      {result.marksAwarded}/{result.maxMarks} mark
                      {result.maxMarks === 1 ? "" : "s"}
                    </Badge>
                  </summary>

                  <div className="mt-4 space-y-4">
                    {result.questionText ? (
                      <p className="rounded-lg border border-white/10 bg-slate-950/40 p-3 text-sm leading-6 text-slate-200">
                        {result.questionText}
                      </p>
                    ) : null}
                    <ReviewBlock label="Your Answer" tone="muted" value={result.studentAnswer} />
                    <ReviewBlock
                      label="Correct Answer"
                      tone="success"
                      value={result.correctAnswer}
                    />
                    <ReviewBlock label="AI Feedback" tone="info" value={result.feedback} />
                    <PointList
                      title="Missing Points"
                      tone="red"
                      points={result.missingPoints ?? []}
                    />
                    <PointList
                      title="What You Got Right"
                      tone="green"
                      points={result.strongPoints ?? []}
                    />
                  </div>
                </details>
              );
            })}
          </div>
        </section>
      </div>
    </main>
  );
}

function readSessionAttempt(attemptId: string): StoredAttempt | null {
  const key = `edutest:attempt:${attemptId}`;
  try {
    const stored = window.sessionStorage.getItem(key);
    if (!stored) return null;
    return JSON.parse(stored) as StoredAttempt;
  } catch {
    try {
      window.sessionStorage.removeItem(key);
    } catch {
      // Ignore blocked sessionStorage.
    }
    return null;
  }
}

function ReviewBlock({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "muted" | "success" | "info";
}) {
  const colors = {
    muted: "border-white/10 bg-slate-950/40 text-slate-300",
    success: "border-emerald-300/20 bg-emerald-500/10 text-emerald-50",
    info: "border-blue-300/20 bg-blue-500/10 text-blue-50",
  };

  return (
    <div>
      <div className="mb-2 text-xs font-bold uppercase text-slate-400">{label}</div>
      <div className={`rounded-lg border p-3 text-sm leading-6 ${colors[tone]}`}>
        {value || "Not answered."}
      </div>
    </div>
  );
}

function PointList({
  title,
  points,
  tone,
}: {
  title: string;
  points: string[];
  tone: "red" | "green";
}) {
  if (!points.length) return null;
  const color = tone === "red" ? "text-red-100" : "text-emerald-100";

  return (
    <div>
      <div className="mb-2 text-xs font-bold uppercase text-slate-400">{title}</div>
      <ul className={`list-disc space-y-1 pl-5 text-sm ${color}`}>
        {points.map((point) => (
          <li key={point}>{point}</li>
        ))}
      </ul>
    </div>
  );
}

function formatDuration(seconds: number) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.round((seconds % 3600) / 60);
  if (hours) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function evaluationMethodLabel(results: StoredAttempt["questionResults"]) {
  const methods = new Set(results.map((result) => result.evaluationMethod));
  if (methods.has("AI")) return "Answer key + AI examiner";
  if (methods.has("LOCAL_FALLBACK")) return "Answer key + local rubric";
  if (
    results.some((result) =>
      result.questionType ? !objectiveQuestionTypes.has(result.questionType) : true,
    )
  ) {
    return "Answer key + local rubric";
  }
  return "Answer key checked";
}

function scoreColor(percent: number) {
  if (percent > 70) return "#34d399";
  if (percent >= 50) return "#fbbf24";
  return "#f87171";
}

function performanceBand(percent: number) {
  if (percent >= 85) {
    return {
      label: "Excellent",
      color: "#34d399",
      border: "rgba(52,211,153,0.28)",
      background: "rgba(16,185,129,0.1)",
    };
  }

  if (percent >= 70) {
    return {
      label: "Good",
      color: "#7dd3fc",
      border: "rgba(125,211,252,0.28)",
      background: "rgba(14,165,233,0.1)",
    };
  }

  if (percent >= 50) {
    return {
      label: "Ok",
      color: "#fbbf24",
      border: "rgba(251,191,36,0.28)",
      background: "rgba(245,158,11,0.1)",
    };
  }

  return {
    label: "Needs Practice",
    color: "#f87171",
    border: "rgba(248,113,113,0.28)",
    background: "rgba(239,68,68,0.1)",
  };
}

const objectiveQuestionTypes = new Set([
  "MCQ",
  "ASSERTION_REASON",
  "TRUE_FALSE",
  "ONE_WORD",
  "FILL_BLANK",
  "MATCH_FOLLOWING",
]);

function cssEscape(value: string) {
  return value.replace(/["\\]/g, "\\$&");
}
