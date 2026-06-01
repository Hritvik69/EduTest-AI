"use client";

import * as React from "react";
import { Layers3, Minus, Plus, RefreshCw, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { fetchApiData } from "@/lib/api-client";
import {
  adjustQuestionComposition,
  compositionKey,
  normalizeQuestionComposition,
  type QuestionCompositionUnit,
} from "@/lib/composition";
import { cn } from "@/lib/utils";
import type { ChapterOption, QuestionCompositionItem } from "@/types";
import {
  questionCountDistribution,
  usePaperConfig,
} from "./paper-config-context";

export function StepComposition() {
  const { config, updateConfig } = usePaperConfig();
  const [chapterGroups, setChapterGroups] = React.useState<
    { subject: string; chapters: ChapterOption[] }[]
  >([]);
  const [loading, setLoading] = React.useState(false);
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

  React.useEffect(() => {
    if (config.sourceMode === "pdf_upload") {
      let cancelled = false;
      queueMicrotask(() => {
        if (!cancelled) {
          setChapterGroups([]);
          setLoading(false);
        }
      });
      return () => {
        cancelled = true;
      };
    }

    const subjectsToLoad = selectedSubjectKey ? selectedSubjectKey.split("|") : [];
    if (!subjectsToLoad.length) {
      let cancelled = false;
      queueMicrotask(() => {
        if (!cancelled) {
          setChapterGroups([]);
          setLoading(false);
        }
      });
      return () => {
        cancelled = true;
      };
    }

    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) setLoading(true);
    });
    Promise.all(
      subjectsToLoad.map((subject) =>
        fetchApiData<{ chapters: ChapterOption[] }>(
          `/api/chapters?class=${config.classNum}&subject=${encodeURIComponent(subject)}`,
          undefined,
          "Could not load chapters.",
        )
          .then((data) => ({ subject, chapters: data.chapters ?? [] })),
      ),
    )
      .then((groups) => {
        if (!cancelled) setChapterGroups(groups);
      })
      .catch(() => {
        if (!cancelled) setChapterGroups([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [config.classNum, config.sourceMode, selectedSubjectKey]);

  const units = React.useMemo(
    () => buildCompositionUnits(config, chapterGroups, selectedSubjects),
    [chapterGroups, config, selectedSubjects],
  );
  const normalizedComposition = React.useMemo(
    () =>
      normalizeQuestionComposition(
        units,
        config.questionComposition ?? [],
        config.totalQuestions,
      ),
    [config.questionComposition, config.totalQuestions, units],
  );
  const equalTypeDistribution = React.useMemo(
    () => questionCountDistribution(config.questionTypes, config.totalQuestions, {}),
    [config.questionTypes, config.totalQuestions],
  );

  React.useEffect(() => {
    const compositionChanged = !sameComposition(
      config.questionComposition ?? [],
      normalizedComposition,
    );
    const typeDistributionChanged = !sameTypeDistribution(
      config.typeDistribution,
      equalTypeDistribution,
      config.questionTypes,
    );

    if (compositionChanged || typeDistributionChanged) {
      updateConfig({
        questionComposition: normalizedComposition,
        typeDistribution: equalTypeDistribution,
      });
    }
  }, [
    config.questionComposition,
    config.questionTypes,
    config.typeDistribution,
    equalTypeDistribution,
    normalizedComposition,
    updateConfig,
  ]);

  const activeComposition = config.questionComposition?.length
    ? config.questionComposition
    : normalizedComposition;
  const totalAssigned = activeComposition.reduce(
    (sum, item) => sum + item.questionCount,
    0,
  );

  function setTotalQuestions(value: number) {
    const totalQuestions = Math.max(5, Math.min(80, Math.round(value)));
    updateConfig({
      totalQuestions,
      questionComposition: normalizeQuestionComposition(
        units,
        activeComposition,
        totalQuestions,
      ),
      typeDistribution: questionCountDistribution(
        config.questionTypes,
        totalQuestions,
        {},
      ),
    });
  }

  function setCompositionCount(item: QuestionCompositionItem, value: number) {
    updateConfig({
      questionComposition: adjustQuestionComposition(
        activeComposition,
        compositionKey(item),
        value,
        config.totalQuestions,
      ),
    });
  }

  function resetEqual() {
    updateConfig({
      questionComposition: normalizeQuestionComposition(
        units,
        [],
        config.totalQuestions,
      ),
    });
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-extrabold text-white">S/C/T Composition</h2>
        <p className="mt-2 text-sm text-slate-400">
          Set the exact AI coverage plan before choosing question formats.
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <SummaryTile
          label="Total Questions"
          value={String(config.totalQuestions)}
          icon={Sparkles}
        />
        <SummaryTile
          label="Coverage Rows"
          value={String(activeComposition.length)}
          icon={Layers3}
        />
        <SummaryTile
          label="Assigned"
          value={`${totalAssigned}/${config.totalQuestions}`}
          icon={RefreshCw}
          warning={totalAssigned !== config.totalQuestions}
        />
      </div>

      <div className="rounded-lg border border-white/10 bg-white/[0.035] p-5">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <div className="mono-label text-xs uppercase text-slate-400">
              Question Count Target
            </div>
            <p className="mt-2 text-sm text-slate-400">
              AI generation and question-format distribution use this exact number.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label="Decrease question count"
              onClick={() => setTotalQuestions(config.totalQuestions - 1)}
            >
              <Minus className="h-4 w-4" />
            </Button>
            <input
              value={config.totalQuestions}
              type="number"
              min={5}
              max={80}
              onChange={(event) => setTotalQuestions(Number(event.target.value))}
              className="h-11 w-20 rounded-lg border border-white/10 bg-slate-950 text-center text-lg font-bold text-white outline-none focus:border-blue-300/70"
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label="Increase question count"
              onClick={() => setTotalQuestions(config.totalQuestions + 1)}
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      <div>
        <div className="mb-4 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <div>
            <h3 className="text-lg font-bold text-white">AI Coverage Split</h3>
            <p className="mt-1 text-sm text-slate-400">
              Counts below are sent to the generation API.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={resetEqual}
            disabled={!activeComposition.length}
          >
            <RefreshCw className="h-4 w-4" />
            Equal Split
          </Button>
        </div>

        {loading ? (
          <div className="rounded-lg border border-white/10 bg-white/[0.035] p-4 text-sm text-slate-300">
            Loading selected chapters...
          </div>
        ) : null}

        {!loading && !activeComposition.length ? (
          <div className="rounded-lg border border-white/10 bg-white/[0.035] p-4 text-sm text-slate-400">
            Select chapters or upload a PDF to build the composition.
          </div>
        ) : null}

        <div className="grid gap-3">
          {activeComposition.map((item) => {
            const key = compositionKey(item);
            const percent = config.totalQuestions
              ? Math.round((item.questionCount / config.totalQuestions) * 100)
              : 0;

            return (
              <Card key={key} className="p-4">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full border border-blue-300/20 bg-blue-500/10 px-2.5 py-1 text-xs font-bold text-blue-100">
                        {item.subject}
                      </span>
                      <span className="text-xs font-semibold text-slate-500">
                        {percent}%
                      </span>
                    </div>
                    <h4 className="mt-3 text-base font-bold text-white">
                      {item.chapterName ?? "Selected chapter"}
                    </h4>
                    <p className="mt-1 text-sm text-slate-400">
                      {item.topicName ? `Topic: ${item.topicName}` : "All selected topics"}
                    </p>
                  </div>

                  <div className="flex items-center gap-3">
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      aria-label="Decrease composition questions"
                      onClick={() => setCompositionCount(item, item.questionCount - 1)}
                    >
                      <Minus className="h-4 w-4" />
                    </Button>
                    <input
                      value={item.questionCount}
                      type="number"
                      min={0}
                      max={config.totalQuestions}
                      onChange={(event) =>
                        setCompositionCount(item, Number(event.target.value))
                      }
                      className="h-10 w-16 rounded-lg border border-white/10 bg-slate-950 text-center text-sm font-bold text-white outline-none focus:border-blue-300/70"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      aria-label="Increase composition questions"
                      onClick={() => setCompositionCount(item, item.questionCount + 1)}
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <div className="mt-4 h-2 rounded-full bg-slate-950">
                  <div
                    className="h-full rounded-full bg-primary transition-all"
                    style={{ width: `${Math.min(100, percent)}%` }}
                  />
                </div>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function SummaryTile({
  label,
  value,
  icon: Icon,
  warning = false,
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  warning?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border bg-white/[0.035] p-4",
        warning ? "border-amber-300/40" : "border-white/10",
      )}
    >
      <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-400">
        <Icon className={cn("h-4 w-4", warning ? "text-amber-200" : "text-blue-200")} />
        {label}
      </div>
      <div className="mt-2 text-2xl font-extrabold text-white">{value}</div>
    </div>
  );
}

function buildCompositionUnits(
  config: ReturnType<typeof usePaperConfig>["config"],
  chapterGroups: { subject: string; chapters: ChapterOption[] }[],
  selectedSubjects: string[],
): QuestionCompositionUnit[] {
  if (config.sourceMode === "pdf_upload") {
    const source = config.pdfSource;
    if (!source) return [];
    const subject = source.subject || "Uploaded PDF";
    const topics = source.topics.length ? source.topics : [source.title];

    return topics.map((topic) => ({
      subject,
      chapterId: source.id,
      chapterName: source.title,
      topicName: topic,
    }));
  }

  const selectedChapterIds = new Set(config.chapterIds);
  const selectedTopicIds = new Set(config.topicIds ?? []);
  const units = chapterGroups.flatMap((group) =>
    group.chapters
      .filter((chapter) => selectedChapterIds.has(chapter.id))
      .flatMap((chapter) => {
        const selectedTopics = chapter.topics.filter((topic) =>
          selectedTopicIds.has(topic.id),
        );

        if (selectedTopics.length) {
          return selectedTopics.map((topic) => ({
            subject: group.subject,
            chapterId: chapter.id,
            chapterName: chapter.name,
            topicId: topic.id,
            topicName: topic.name,
          }));
        }

        return [
          {
            subject: group.subject,
            chapterId: chapter.id,
            chapterName: chapter.name,
          },
        ];
      }),
  );

  if (units.length) return units;

  return (config.subjectSelections ?? []).flatMap((selection) =>
    selection.chapterIds.map((chapterId) => ({
      subject: selection.subject,
      chapterId,
      chapterName: `${selection.subject} chapter ${chapterId}`,
    })),
  ).filter((unit) => selectedSubjects.includes(unit.subject));
}

function sameComposition(
  left: QuestionCompositionItem[],
  right: QuestionCompositionItem[],
) {
  if (left.length !== right.length) return false;

  return left.every((item, index) => {
    const next = right[index];
    return (
      next &&
      compositionKey(item) === compositionKey(next) &&
      item.questionCount === next.questionCount
    );
  });
}

function sameTypeDistribution(
  left: Record<string, number | undefined>,
  right: Record<string, number | undefined>,
  types: string[],
) {
  return types.every((type) => (left[type] ?? 0) === (right[type] ?? 0));
}
