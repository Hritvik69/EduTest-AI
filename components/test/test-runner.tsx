"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Bookmark, ChevronLeft, ChevronRight, Send } from "lucide-react";
import { toast } from "sonner";
import { QuestionRenderer, type AnswerValue } from "@/components/questions/interactive-question";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { apiErrorMessage, unwrapApiData } from "@/lib/api-client";
import type { GeneratedQuestion, StoredPaper } from "@/types";
import { cn } from "@/lib/utils";

type Answers = Record<string, AnswerValue>;

export function TestRunner({ paperId }: { paperId: string }) {
  const router = useRouter();
  const [paper, setPaper] = React.useState<StoredPaper | null>(null);
  const [currentIndex, setCurrentIndex] = React.useState(0);
  const [answers, setAnswers] = React.useState<Answers>({});
  const [visited, setVisited] = React.useState<Set<number>>(new Set([0]));
  const [marked, setMarked] = React.useState<Set<number>>(new Set());
  const [lastSaved, setLastSaved] = React.useState<Date | null>(null);
  const [showSubmit, setShowSubmit] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [timeLeft, setTimeLeft] = React.useState(0);
  const [timeUpCountdown, setTimeUpCountdown] = React.useState<number | null>(null);
  const warningShown = React.useRef(false);

  const storageKey = `edutest-answers-${paperId}`;
  const startedAt = React.useRef(Date.now());
  const answersRef = React.useRef(answers);
  const visitedRef = React.useRef(visited);
  const markedRef = React.useRef(marked);
  const paperRef = React.useRef(paper);
  const saveControllerRef = React.useRef<AbortController | null>(null);

  React.useEffect(() => {
    answersRef.current = answers;
  }, [answers]);

  React.useEffect(() => {
    visitedRef.current = visited;
  }, [visited]);

  React.useEffect(() => {
    markedRef.current = marked;
  }, [marked]);

  React.useEffect(() => {
    paperRef.current = paper;
  }, [paper]);

  const saveProgress = React.useCallback(() => {
    const savedAt = new Date().toISOString();
    const currentPaper = paperRef.current;
    const sessionOnly =
      Boolean(currentPaper?.sessionOnly) || String(paperId).startsWith("session-");
    const payload = {
      paperId,
      answers: answersRef.current,
      visited: Array.from(visitedRef.current),
      marked: Array.from(markedRef.current),
      savedAt,
      clientSavedAt: savedAt,
    };

    try {
      window.sessionStorage.setItem(storageKey, JSON.stringify(payload));
      setLastSaved(new Date(payload.savedAt));
    } catch {
      toast.error("Could not save progress for this session.");
      return false;
    }

    if (currentPaper && !sessionOnly) {
      saveControllerRef.current?.abort();
      const controller = new AbortController();
      saveControllerRef.current = controller;
      fetch("/api/attempts/save-progress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify(payload),
      })
        .then((response) => {
          if (!response.ok) throw new Error("Cloud progress save failed.");
        })
        .catch((error) => {
          if (controller.signal.aborted) return;
          console.warn(error);
        })
        .finally(() => {
          if (saveControllerRef.current === controller) {
            saveControllerRef.current = null;
          }
        });
    }

    return true;
  }, [paperId, storageKey]);

  React.useEffect(() => {
    let cancelled = false;
    const storedPaper = readSessionPaper(paperId);

    if (storedPaper) {
      queueMicrotask(() => {
        if (cancelled) return;
        setPaper(storedPaper);
        setTimeLeft((storedPaper.config?.duration ?? 90) * 60);
        restoreLocalProgress();
      });
      return () => {
        cancelled = true;
      };
    }

    fetch(`/api/papers/${paperId}`)
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) {
          throw new Error(apiErrorMessage(data, "Could not load paper."));
        }
        return unwrapApiData<StoredPaper>(data);
      })
      .then((data) => {
        if (cancelled) return;
        setPaper(data);
        setTimeLeft((data.config?.duration ?? 90) * 60);
        restoreLocalProgress();
      })
      .catch((error) => {
        if (!cancelled) {
          toast.error(error instanceof Error ? error.message : "Could not load paper.");
        }
      });

    return () => {
      cancelled = true;
    };
    function restoreLocalProgress() {
      clearLegacyLocalProgress(storageKey);
      try {
        const stored = window.sessionStorage.getItem(storageKey);
        if (stored) {
          const parsed = JSON.parse(stored);
          setAnswers(parsed.answers ?? {});
          setVisited(new Set(Array.isArray(parsed.visited) ? parsed.visited : [0]));
          setMarked(new Set(Array.isArray(parsed.marked) ? parsed.marked : []));
          setLastSaved(parsed.savedAt ? new Date(parsed.savedAt) : null);
          toast.success("Previous progress restored");
        }
      } catch {
        try {
          window.sessionStorage.removeItem(storageKey);
        } catch {
          // Ignore blocked sessionStorage.
        }
      }
    }
  }, [paperId, storageKey]);

  React.useEffect(() => {
    if (!paper || timeUpCountdown !== null) return;
    const timer = window.setInterval(() => {
      setTimeLeft((current) => {
        if (current <= 1) {
          window.clearInterval(timer);
          setTimeUpCountdown(5);
          return 0;
        }
        if (current <= 300 && !warningShown.current) {
          warningShown.current = true;
          toast.warning("Less than 5 minutes remaining");
        }
        return current - 1;
      });
    }, 1000);

    return () => window.clearInterval(timer);
  }, [paper, timeUpCountdown]);

  React.useEffect(() => {
    if (timeUpCountdown === null) return;
    if (timeUpCountdown <= 0) {
      void submitPaper();
      return;
    }
    const timer = window.setTimeout(
      () => setTimeUpCountdown((value) => (value ?? 1) - 1),
      1000,
    );
    return () => window.clearTimeout(timer);
    // submitPaper reads the latest state when the timeout completes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeUpCountdown]);

  React.useEffect(() => {
    if (!paper) return;
    const interval = window.setInterval(saveProgress, 30000);
    const onBlur = () => {
      if (saveProgress()) toast.success("Progress saved");
    };
    window.addEventListener("blur", onBlur);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("blur", onBlur);
      saveControllerRef.current?.abort();
    };
  }, [paper, saveProgress]);

  React.useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target)) return;
      if (event.key === "ArrowLeft") previousQuestion();
      if (event.key === "ArrowRight") saveAndNext();
      if (event.key.toLowerCase() === "m") toggleMarked(currentIndex);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!paper) {
    return (
      <main className="min-h-screen bg-background p-6 text-slate-100">
        <div className="safe-container">Loading test...</div>
      </main>
    );
  }

  const questions = paper.questions;
  if (!questions.length) {
    return (
      <main className="min-h-screen bg-background p-6 text-slate-100">
        <div className="safe-container">
          <Card className="p-6">
            <h1 className="text-2xl font-extrabold text-white">
              This paper is no longer available
            </h1>
            <p className="mt-3 text-slate-300">
              Generated questions are kept only in the current browser session.
              Please create a fresh paper.
            </p>
            <Button
              type="button"
              className="mt-5"
              onClick={() => router.push("/create-test")}
            >
              Create New Test
            </Button>
          </Card>
        </div>
      </main>
    );
  }

  const current = questions[currentIndex];
  const stats = answerStats(questions, answers, marked);
  const lowTime = timeLeft <= 600;
  const criticalTime = timeLeft <= 300;

  function questionKey(question: GeneratedQuestion, index: number) {
    return String(question.id ?? index + 1);
  }

  function updateAnswer(value: AnswerValue) {
    setAnswers((currentAnswers) => ({
      ...currentAnswers,
      [questionKey(current, currentIndex)]: value,
    }));
  }

  function visit(index: number) {
    setCurrentIndex(index);
    setVisited((currentVisited) => new Set([...Array.from(currentVisited), index]));
  }

  function previousQuestion() {
    visit(Math.max(0, currentIndex - 1));
  }

  function saveAndNext() {
    saveProgress();
    visit(Math.min(questions.length - 1, currentIndex + 1));
  }

  function toggleMarked(index: number) {
    setMarked((currentMarked) => {
      const next = new Set(Array.from(currentMarked));
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  async function submitPaper() {
    if (submitting || !paper) return;
    setSubmitting(true);
    const toastId = toast.loading("AI is evaluating your paper...");
    const durationSeconds = paper.config.duration * 60;
    const timeTaken = Math.min(durationSeconds, Math.round((Date.now() - startedAt.current) / 1000));
    const latestAnswers = { ...answersRef.current };

    try {
      saveProgress();
      const response = await fetch("/api/evaluate-answers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          paperId,
          answers: latestAnswers,
          timeTaken,
          paperSnapshot: serializablePaperSnapshot(paper),
          paperSnapshotToken: paper.paperSnapshotToken ?? paper.guestPaperToken,
          guestPaperToken: paper.guestPaperToken,
        }),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(apiErrorMessage(result, "Evaluation failed."));
      }
      const attempt = unwrapApiData<typeof result>(result);
      try {
        window.sessionStorage.removeItem(storageKey);
        window.sessionStorage.setItem(
          `edutest:attempt:${attempt.attemptId}`,
          JSON.stringify(attempt),
        );
      } catch {
        toast.warning("Results are saved for this session, but browser storage is full.");
      }
      toast.dismiss(toastId);
      router.push(`/results/${attempt.attemptId}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Evaluation failed.", {
        id: toastId,
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-background text-slate-100">
      <header className="sticky top-0 z-30 border-b border-white/10 bg-[#0a0e1a]/90 backdrop-blur-xl">
        <div className="safe-container flex min-h-[72px] flex-wrap items-center justify-between gap-3 py-3">
          <div className="flex flex-wrap gap-2">
            <Badge>{paper.config.subject}</Badge>
            {paper.config.sourceMode === "pdf_upload" && !paper.config.pdfSource?.classNum ? (
              <Badge>{paper.config.pdfSource?.title ?? "PDF-EDU-TEST"}</Badge>
            ) : (
              <Badge>Class {paper.config.classNum}</Badge>
            )}
          </div>
          <div
            className={cn(
              "rounded-lg border border-white/10 px-4 py-2 text-xl font-extrabold text-white",
              lowTime && "animate-pulse border-red-300/40 text-red-200",
              criticalTime && "animate-bounce bg-red-500/10",
            )}
          >
            {formatClock(timeLeft)}
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold text-slate-300">
              {stats.answered} / {questions.length} Answered
            </span>
            <Button
              type="button"
              variant="danger"
              onClick={() => setShowSubmit(true)}
            >
              <Send className="h-4 w-4" />
              Submit Paper
            </Button>
          </div>
        </div>
      </header>

      <div className="safe-container grid gap-5 pb-32 pt-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:pb-6">
        <Card className="p-5">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
            <div>
              <Badge>{current.section ?? "Section"}</Badge>
              <h1 className="mt-3 text-xl font-extrabold text-white">
                Question {currentIndex + 1} of {questions.length}
              </h1>
            </div>
            <Badge>{current.marks} marks</Badge>
          </div>

          <QuestionRenderer
            question={current}
            value={answers[questionKey(current, currentIndex)]}
            onChange={updateAnswer}
          />

          <div className="mt-8 flex flex-col justify-between gap-3 border-t border-white/10 pt-5 sm:flex-row">
            <Button type="button" variant="ghost" onClick={previousQuestion}>
              <ChevronLeft className="h-4 w-4" />
              Previous
            </Button>
            <Button
              type="button"
              variant={marked.has(currentIndex) ? "gold" : "outline"}
              onClick={() => toggleMarked(currentIndex)}
            >
              <Bookmark className="h-4 w-4" />
              Mark for Review
            </Button>
            <Button type="button" onClick={saveAndNext}>
              Save & Next
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          <p className="mt-4 text-xs text-slate-500">
            Last saved: {lastSaved ? relativeTime(lastSaved) : "not yet"}
          </p>
        </Card>

        <aside className="hidden lg:sticky lg:top-24 lg:block lg:self-start">
          <QuestionPalette
            questions={questions}
            currentIndex={currentIndex}
            answers={answers}
            visited={visited}
            marked={marked}
            onVisit={visit}
          />
        </aside>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-[#0a0e1a]/95 p-3 shadow-2xl backdrop-blur-xl lg:hidden">
        <details className="safe-container group">
          <summary className="flex cursor-pointer list-none items-center justify-between rounded-lg border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-bold text-white">
            Question Palette
            <span className="text-xs text-slate-400">
              {stats.answered}/{questions.length} answered
            </span>
          </summary>
          <div className="max-h-[46vh] overflow-y-auto pt-3">
            <QuestionPalette
              questions={questions}
              currentIndex={currentIndex}
              answers={answers}
              visited={visited}
              marked={marked}
              onVisit={visit}
            />
          </div>
        </details>
      </div>

      {showSubmit ? (
        <SubmitModal
          stats={stats}
          submitting={submitting}
          onClose={() => setShowSubmit(false)}
          onSubmit={() => void submitPaper()}
        />
      ) : null}

      {timeUpCountdown !== null ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur">
          <Card className="max-w-md p-6 text-center">
            <AlertTriangle className="mx-auto h-10 w-10 text-red-300" />
            <h2 className="mt-4 text-2xl font-extrabold text-white">Time&apos;s up!</h2>
            <p className="mt-3 text-slate-300">
              Auto-submitting in {Math.max(0, timeUpCountdown)}...
            </p>
          </Card>
        </div>
      ) : null}
    </main>
  );
}

function clearLegacyLocalProgress(storageKey: string) {
  try {
    window.localStorage.removeItem(storageKey);
  } catch {
    // Ignore blocked localStorage; guest mode does not rely on persistent browser storage.
  }
}

function readSessionPaper(paperId: string): StoredPaper | null {
  try {
    const stored = window.sessionStorage.getItem(`edutest:paper:${paperId}`);
    if (!stored) return null;
    const parsed = JSON.parse(stored);
    return {
      ...parsed,
      id: parsed.id ?? parsed.paperId ?? paperId,
      sessionOnly: parsed.sessionOnly ?? String(paperId).startsWith("session-"),
      status: parsed.status ?? "READY",
      questions: Array.isArray(parsed.questions) ? parsed.questions : [],
    };
  } catch {
    try {
      window.sessionStorage.removeItem(`edutest:paper:${paperId}`);
    } catch {
      // Ignore blocked sessionStorage.
    }
    return null;
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

function QuestionPalette({
  questions,
  currentIndex,
  answers,
  visited,
  marked,
  onVisit,
}: {
  questions: GeneratedQuestion[];
  currentIndex: number;
  answers: Answers;
  visited: Set<number>;
  marked: Set<number>;
  onVisit: (index: number) => void;
}) {
  const stats = answerStats(questions, answers, marked);
  const paletteSections = groupQuestionsBySection(questions);

  return (
    <Card className="p-4">
      <h2 className="mb-4 text-lg font-extrabold text-white">Question Palette</h2>
      <div className="grid grid-cols-5 gap-2">
        {paletteSections.map((section) => (
          <React.Fragment key={section.name}>
            <div className="col-span-5 mt-2 text-xs font-bold uppercase text-slate-400">
              {section.name}
            </div>
            {section.items.map(({ question, index }) => (
              <button
                key={question.id ?? index}
                onClick={() => onVisit(index)}
                className={cn(
                  "h-10 rounded-lg border text-sm font-bold transition",
                  paletteState(index, question, answers, visited, marked),
                  currentIndex === index && "ring-2 ring-blue-200",
                )}
              >
                {index + 1}
              </button>
            ))}
          </React.Fragment>
        ))}
      </div>
      <div className="mt-5 grid grid-cols-3 gap-2 text-center text-xs text-slate-400">
        <div>Answered: {stats.answered}</div>
        <div>Unanswered: {stats.unanswered}</div>
        <div>Marked: {stats.marked}</div>
      </div>
    </Card>
  );
}

function groupQuestionsBySection(questions: GeneratedQuestion[]) {
  const groups = new Map<
    string,
    { name: string; firstIndex: number; items: Array<{ question: GeneratedQuestion; index: number }> }
  >();

  questions.forEach((question, index) => {
    const name = normalizeSectionLabel(question.section);
    const group = groups.get(name);
    if (group) {
      group.items.push({ question, index });
      return;
    }

    groups.set(name, {
      name,
      firstIndex: index,
      items: [{ question, index }],
    });
  });

  return Array.from(groups.values()).sort((left, right) => {
    const sectionOrder = sectionRank(left.name) - sectionRank(right.name);
    return sectionOrder || left.firstIndex - right.firstIndex;
  });
}

function normalizeSectionLabel(section?: string) {
  const trimmed = section?.trim();
  return trimmed?.length ? trimmed : "Section";
}

function sectionRank(section: string) {
  const normalized = section.toUpperCase();
  if (normalized.includes("SECTION A")) return 1;
  if (normalized.includes("SECTION B/C")) return 2;
  if (normalized.includes("SECTION B")) return 2;
  if (normalized.includes("SECTION C")) return 3;
  if (normalized.includes("SECTION D")) return 4;
  if (normalized.includes("SECTION E")) return 5;
  return 99;
}

function SubmitModal({
  stats,
  submitting,
  onClose,
  onSubmit,
}: {
  stats: ReturnType<typeof answerStats>;
  submitting: boolean;
  onClose: () => void;
  onSubmit: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur">
      <Card className="w-full max-w-md p-6">
        <h2 className="text-2xl font-extrabold text-white">Submit Exam?</h2>
        <div className="mt-5 grid gap-2 text-sm text-slate-300">
          <div>Answered: {stats.answered}</div>
          <div>Not Answered: {stats.unanswered}</div>
          <div>Marked: {stats.marked}</div>
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" variant="danger" onClick={onSubmit} disabled={submitting}>
            Submit & Get Results
          </Button>
        </div>
      </Card>
    </div>
  );
}

function answerStats(
  questions: GeneratedQuestion[],
  answers: Answers,
  marked: Set<number>,
) {
  const answered = questions.filter((question, index) =>
    isAnswered(answers[String(question.id ?? index + 1)]),
  ).length;

  return {
    answered,
    unanswered: questions.length - answered,
    marked: marked.size,
  };
}

function paletteState(
  index: number,
  question: GeneratedQuestion,
  answers: Answers,
  visited: Set<number>,
  marked: Set<number>,
) {
  if (marked.has(index)) return "border-yellow-300 bg-yellow-500 text-slate-950";
  if (isAnswered(answers[String(question.id ?? index + 1)])) {
    return "border-blue-400 bg-blue-600 text-white";
  }
  if (visited.has(index)) return "border-red-500 bg-transparent text-red-100";
  return "border-white/10 bg-gray-700 text-slate-100";
}

function isAnswered(value: AnswerValue) {
  if (typeof value === "string") return value.trim().length > 0;
  if (value && typeof value === "object") {
    return Object.values(value).some((item) => String(item).trim().length > 0);
  }
  return false;
}

function formatClock(seconds: number) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

function relativeTime(date: Date) {
  const diff = Math.max(0, Math.round((Date.now() - date.getTime()) / 60000));
  if (diff === 0) return "just now";
  if (diff === 1) return "1 min ago";
  return `${diff} min ago`;
}

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  const tagName = target.tagName.toLowerCase();
  return (
    tagName === "input" ||
    tagName === "textarea" ||
    tagName === "select" ||
    target.isContentEditable
  );
}
