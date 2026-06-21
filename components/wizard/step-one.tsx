"use client";

import * as React from "react";
import {
  Brain,
  Check,
  ChevronDown,
  ChevronUp,
  Loader2,
  Minus,
  Plus,
  Sparkles,
} from "lucide-react";
import { AccordionItem } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { fetchApiData } from "@/lib/api-client";
import { classes, subjects as staticSubjects } from "@/lib/edutest-data";
import { cn } from "@/lib/utils";
import type {
  ChapterOption,
  Difficulty,
  LanguageMode,
  PaperFocus,
  SubjectSelection,
} from "@/types";
import { usePaperConfig } from "./paper-config-context";

const HIDDEN_GEMS_DIFFICULTY_OPTIONS: {
  id: Difficulty;
  label: string;
  hint: string;
}[] = [
  { id: "EASY", label: "Easy", hint: "Light did-you-know facts" },
  { id: "MEDIUM", label: "Medium", hint: "Balanced mix of curiosity" },
  { id: "HARD", label: "Hard", hint: "Tough origins & timelines" },
];

const HIDDEN_GEMS_MIN_COUNT = 0;
const HIDDEN_GEMS_MAX_COUNT = 10;

interface SubjectOption {
  name: string;
  icon: string;
  classes: number[];
}

export function StepOne() {
  const { config, updateConfig } = usePaperConfig();
  const [chapterGroups, setChapterGroups] = React.useState<
    { subject: string; chapters: ChapterOption[] }[]
  >([]);
  const [subjectOptions, setSubjectOptions] =
    React.useState<SubjectOption[]>(staticSubjects);
  const [loading, setLoading] = React.useState(false);
  const [hiddenGemsOpen, setHiddenGemsOpen] = React.useState(() =>
    Boolean(config.hiddenGems?.enabled),
  );
  const hiddenGems = config.hiddenGems ?? {
    enabled: false,
    questionCount: 0,
    difficulty: "MEDIUM" as Difficulty,
  };

  function setHiddenGems(patch: Partial<typeof hiddenGems>) {
    const next = { ...hiddenGems, ...patch };
    const enabled = Boolean(next.enabled);
    const questionCount =
      patch.enabled === true && clampHiddenGemsCount(next.questionCount) === 0
        ? 5
        : clampHiddenGemsCount(next.questionCount);
    updateConfig({
      hiddenGems: {
        enabled,
        questionCount,
        difficulty: next.difficulty,
      },
    });
  }

  React.useEffect(() => {
    if (config.hiddenGems?.enabled) setHiddenGemsOpen(true);
  }, [config.hiddenGems?.enabled]);

  React.useEffect(() => {
    let cancelled = false;
    fetchApiData<{ subjects: SubjectOption[] }>(
      "/api/subjects",
      undefined,
      "Could not load subjects.",
    )
      .then((data) => {
        if (!cancelled && data.subjects?.length) setSubjectOptions(data.subjects);
      })
      .catch(() => {
        if (!cancelled) setSubjectOptions(staticSubjects);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const availableSubjects = React.useMemo(
    () => subjectOptions.filter((subject) => subject.classes.includes(config.classNum)),
    [config.classNum, subjectOptions],
  );
  const selectedSubjects = React.useMemo(() => {
    const configured = config.subjects?.length
      ? config.subjects
      : config.subject
        ? config.subject.split(" + ")
        : [];

    return configured.filter((name) =>
      availableSubjects.some((subject) => subject.name === name),
    );
  }, [availableSubjects, config.subject, config.subjects]);
  const selectedSubjectKey = selectedSubjects.join("|");
  const allChapters = chapterGroups.flatMap((group) => group.chapters);

  React.useEffect(() => {
    if (selectedSubjects.length || !availableSubjects.length) return;

    const firstSubject = availableSubjects[0].name;
    updateConfig({
      subject: firstSubject,
      subjects: [firstSubject],
      subjectSelections: [{ subject: firstSubject, chapterIds: [], topicIds: [] }],
      chapterIds: [],
      topicIds: [],
      questionComposition: [],
    });
  }, [availableSubjects, selectedSubjects.length, updateConfig]);

  React.useEffect(() => {
    const subjectsToLoad = selectedSubjectKey ? selectedSubjectKey.split("|") : [];

    if (!subjectsToLoad.length || !config.classNum) {
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
          `/api/chapters?class=${encodeURIComponent(
            config.classNum,
          )}&subject=${encodeURIComponent(subject)}`,
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
  }, [config.classNum, selectedSubjectKey]);

  function chooseClass(classNum: number) {
    const firstSubject =
      subjectOptions.find((subject) => subject.classes.includes(classNum))?.name ??
      "Mathematics";
    const nextSubjects = selectedSubjects.filter((name) =>
      subjectOptions
        .find((subject) => subject.name === name)
        ?.classes.includes(classNum),
    );
    const subjectsForClass = nextSubjects.length ? nextSubjects : [firstSubject];

    updateConfig({
      classNum,
      subject: subjectsForClass.join(" + "),
      subjects: subjectsForClass,
      subjectSelections: subjectsForClass.map((subject) => ({
        subject,
        chapterIds: [],
        topicIds: [],
      })),
      chapterIds: [],
      topicIds: [],
      questionComposition: [],
    });
  }

  function toggleSubject(subjectName: string) {
    const selected = selectedSubjects.includes(subjectName);
    const nextSubjects = selected
      ? selectedSubjects.filter((name) => name !== subjectName)
      : [...selectedSubjects, subjectName];
    const removedGroup = selected
      ? chapterGroups.find((group) => group.subject === subjectName)
      : undefined;
    const removedChapterIds = removedGroup?.chapters.map((chapter) => chapter.id) ?? [];
    const removedTopicIds =
      removedGroup?.chapters.flatMap((chapter) =>
        chapter.topics.map((topic) => topic.id),
      ) ?? [];

    const nextChapterIds = removedChapterIds.length
      ? config.chapterIds.filter((id) => !removedChapterIds.includes(id))
      : config.chapterIds;
    const nextTopicIds = removedTopicIds.length
      ? config.topicIds?.filter((id) => !removedTopicIds.includes(id))
      : config.topicIds;

    updateConfig({
      subjects: nextSubjects,
      subject: nextSubjects.join(" + "),
      subjectSelections: buildSubjectSelections(
        nextSubjects,
        nextChapterIds,
        nextTopicIds ?? [],
        chapterGroups,
        config.subjectSelections,
      ),
      chapterIds: nextChapterIds,
      topicIds: nextTopicIds,
      questionComposition: [],
    });
  }

  function setLanguageMode(subject: string, mode: LanguageMode) {
    const nextSelections = (config.subjectSelections ?? []).map((selection) =>
      selection.subject === subject ? { ...selection, languageMode: mode } : selection,
    );
    const ensuredSelections = nextSelections.some((s) => s.subject === subject)
      ? nextSelections
      : [
          ...nextSelections,
          { subject, chapterIds: [], topicIds: [], languageMode: mode },
        ];
    updateConfig({ subjectSelections: ensuredSelections });
  }

  function toggleChapter(chapter: ChapterOption) {
    const selected = config.chapterIds.includes(chapter.id);
    const nextChapterIds = selected
      ? config.chapterIds.filter((id) => id !== chapter.id)
      : [...config.chapterIds, chapter.id];
    const nextTopicIds = selected
      ? config.topicIds?.filter(
          (id) => !chapter.topics.some((topic) => topic.id === id),
        )
      : config.topicIds;

    updateConfig({
      chapterIds: nextChapterIds,
      topicIds: nextTopicIds,
      questionComposition: [],
      subjectSelections: buildSubjectSelections(
        selectedSubjects,
        nextChapterIds,
        nextTopicIds ?? [],
        chapterGroups,
        config.subjectSelections,
      ),
    });
  }

  function toggleTopic(topicId: number) {
    const selected = config.topicIds?.includes(topicId);
    const nextTopicIds = selected
      ? config.topicIds?.filter((id) => id !== topicId)
      : [...(config.topicIds ?? []), topicId];

    updateConfig({
      topicIds: nextTopicIds,
      questionComposition: [],
      subjectSelections: buildSubjectSelections(
        selectedSubjects,
        config.chapterIds,
        nextTopicIds ?? [],
        chapterGroups,
        config.subjectSelections,
      ),
    });
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-extrabold text-white">Class, Subject & Chapters</h2>
        <p className="mt-2 text-sm text-slate-400">
          Choose the exact NCERT coverage for this paper.
        </p>
      </div>

      <div>
        <div className="mono-label mb-3 text-xs uppercase text-slate-400">Class</div>
        <div className="flex flex-wrap gap-2">
          {classes.map((classNum) => (
            <button
              key={classNum}
              onClick={() => chooseClass(classNum)}
              className={cn(
                "h-11 min-w-12 rounded-lg border px-4 font-bold transition",
                config.classNum === classNum
                  ? "border-blue-300 bg-primary text-white shadow-glow"
                  : "border-white/10 bg-white/[0.035] text-slate-300 hover:border-blue-300/50",
              )}
            >
              {classNum}
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="mb-3 flex flex-col gap-1">
          <div className="mono-label text-xs uppercase text-slate-400">Subjects</div>
          <p className="text-sm text-slate-400">
            Select one or more subjects. Chapters and topics load for each selected
            subject.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {availableSubjects.map((subject) => {
            const selected = selectedSubjects.includes(subject.name);

            return (
              <Card
                key={subject.name}
                role="button"
                tabIndex={0}
                onClick={() => toggleSubject(subject.name)}
                className={cn(
                  "relative flex min-h-28 cursor-pointer flex-col items-center justify-center gap-2 p-4 text-center transition",
                  selected
                    ? "border-blue-300 bg-blue-500/10"
                    : "hover:border-blue-300/40",
                )}
              >
                {selected ? (
                  <span className="absolute right-3 top-3 rounded-full bg-primary p-1 text-white">
                    <Check className="h-3.5 w-3.5" />
                  </span>
                ) : null}
                <span className="text-3xl" aria-hidden>
                  {subject.icon}
                </span>
                <span className="text-sm font-semibold">{subject.name}</span>
              </Card>
            );
          })}
        </div>
      </div>

      {selectedSubjects.length ? (
        <div className="space-y-3">
          <div className="mono-label text-xs uppercase text-slate-400">
            Modes for selected subjects
          </div>
          <HiddenGemsCard
            open={hiddenGemsOpen}
            onToggleOpen={() => setHiddenGemsOpen((value) => !value)}
            enabled={hiddenGems.enabled}
            questionCount={hiddenGems.questionCount}
            difficulty={hiddenGems.difficulty}
            onChange={setHiddenGems}
            selectedSubjects={selectedSubjects}
          />
        </div>
      ) : null}

      {selectedSubjects.some((s) => isLanguageSubject(s)) ? (
        <div className="space-y-3">
          {selectedSubjects
            .filter((subject) => isLanguageSubject(subject))
            .map((subject) => {
              const selection = (config.subjectSelections ?? []).find(
                (s) => s.subject === subject,
              );
              const current: LanguageMode = selection?.languageMode ?? "auto";
              return (
                <div
                  key={`mode-${subject}`}
                  className="rounded-lg border border-blue-300/20 bg-blue-500/5 p-4"
                >
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <div className="text-sm font-semibold text-blue-50">
                        {subject} — language mode
                      </div>
<p className="mt-1 text-xs text-slate-400">
                          Choose how the AI should focus this paper. &ldquo;Auto&rdquo;
                          lets the AI decide from the chapter content.
                        </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {(
                        [
                          { id: "story", label: "📖 Story", hint: "Comprehension, character, moral" },
                          { id: "grammar", label: "✍️ Grammar", hint: "Rules, correction, analysis" },
                          { id: "auto", label: "🤖 Auto", hint: "AI decides" },
                        ] as const
                      ).map((option) => {
                        const active = current === option.id;
                        return (
                          <button
                            key={option.id}
                            type="button"
                            onClick={() => setLanguageMode(subject, option.id)}
                            title={option.hint}
                            className={cn(
                              "h-9 rounded-lg border px-3 text-xs font-bold transition",
                              active
                                ? "border-blue-300 bg-primary text-white shadow-glow"
                                : "border-white/10 bg-white/[0.035] text-slate-300 hover:border-blue-300/50",
                            )}
                          >
                            {option.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })}
        </div>
      ) : null}

      {selectedSubjects.some((s) => isScienceSubject(s)) ? (
        <div className="rounded-lg border border-blue-300/20 bg-blue-500/5 p-4">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-sm font-semibold text-blue-50">
                Paper Focus — Numerical / Concept / Mixed
              </div>
              <p className="mt-1 text-xs text-slate-400">
                Choose the type of questions. &ldquo;Numerical&rdquo; generates
                calculation/solve-type questions, &ldquo;Concept&rdquo; generates
                theory/reasoning questions, &ldquo;Mixed&rdquo; gives 50-50.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  { id: "numerical" as PaperFocus, label: "🔢 Numerical", hint: "Calculation, solve, derive" },
                  { id: "concept" as PaperFocus, label: "📖 Concept", hint: "Theory, reasoning, explain" },
                  { id: "mixed" as PaperFocus, label: "🔀 Mixed", hint: "50% Numerical + 50% Concept" },
                ] as const
              ).map((option) => {
                const active = (config.paperFocus ?? "mixed") === option.id;
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => updateConfig({ paperFocus: option.id })}
                    title={option.hint}
                    className={cn(
                      "h-9 rounded-lg border px-3 text-xs font-bold transition",
                      active
                        ? "border-blue-300 bg-primary text-white shadow-glow"
                        : "border-white/10 bg-white/[0.035] text-slate-300 hover:border-blue-300/50",
                    )}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}

      <div>
        <div className="mb-3 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <div>
            <div className="mono-label text-xs uppercase text-slate-400">Chapters</div>
            <p className="mt-1 text-sm text-slate-400">
              {config.chapterIds.length} chapters selected across{" "}
              {selectedSubjects.length || 0} subject
              {selectedSubjects.length === 1 ? "" : "s"}
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                updateConfig({
                  chapterIds: allChapters.map((chapter) => chapter.id),
                  questionComposition: [],
                  subjectSelections: buildSubjectSelections(
                    selectedSubjects,
                    allChapters.map((chapter) => chapter.id),
                    config.topicIds ?? [],
                    chapterGroups,
                    config.subjectSelections,
                  ),
                })
              }
              disabled={!allChapters.length}
            >
              Select All
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() =>
                updateConfig({
                  chapterIds: [],
                  topicIds: [],
                  questionComposition: [],
                  subjectSelections: buildSubjectSelections(
                    selectedSubjects,
                    [],
                    [],
                    chapterGroups,
                    config.subjectSelections,
                  ),
                })
              }
            >
              Clear All
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.035] p-4 text-sm text-slate-300">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading chapters...
          </div>
        ) : (
          <div className="grid gap-3">
            {!selectedSubjects.length ? (
              <div className="rounded-lg border border-white/10 bg-white/[0.035] p-4 text-sm text-slate-400">
                Select one or more subjects to load chapters.
              </div>
            ) : null}
            {chapterGroups.map((group) => (
              <div key={group.subject} className="space-y-3">
                <div className="flex items-center justify-between rounded-lg border border-blue-300/20 bg-blue-500/10 px-4 py-3">
                  <h3 className="font-bold text-blue-50">{group.subject}</h3>
                  <span className="mono-label text-xs text-blue-100/70">
                    {group.chapters.length} chapters
                  </span>
                </div>
                {group.chapters.map((chapter, index) => {
                  const selected = config.chapterIds.includes(chapter.id);

                  return (
                    <AccordionItem
                      key={`${group.subject}-${chapter.id}`}
                      title={
                        <label className="flex cursor-pointer items-center gap-3">
                          <Checkbox
                            checked={selected}
                            onChange={() => toggleChapter(chapter)}
                            onClick={(event) => event.stopPropagation()}
                          />
                          <span
                            className="min-w-0 text-sm font-semibold leading-5 text-slate-100"
                            title={chapter.name}
                          >
                            Chapter {index + 1}: {chapter.name}
                          </span>
                        </label>
                      }
                    >
                      <div className="grid gap-2 sm:grid-cols-2">
                        {chapter.topics.map((topic) => (
                          <label
                            key={topic.id}
                            className={cn(
                              "flex items-center gap-2 rounded-lg border border-white/10 bg-slate-950/40 p-3 text-sm text-slate-300",
                              !selected && "opacity-50",
                            )}
                          >
                            <Checkbox
                              checked={config.topicIds?.includes(topic.id) ?? false}
                              disabled={!selected}
                              onChange={() => toggleTopic(topic.id)}
                            />
                            <span className="min-w-0 break-words" title={topic.name}>
                              {topic.name}
                            </span>
                          </label>
                        ))}
                      </div>
                      <p className="mt-3 text-xs text-slate-500">
                        Leave topics unchecked to include all topics in this chapter.
                      </p>
                    </AccordionItem>
                  );
                })}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function HiddenGemsCard({
  open,
  onToggleOpen,
  enabled,
  questionCount,
  difficulty,
  onChange,
  selectedSubjects,
}: {
  open: boolean;
  onToggleOpen: () => void;
  enabled: boolean;
  questionCount: number;
  difficulty: Difficulty;
  onChange: (patch: {
    enabled?: boolean;
    questionCount?: number;
    difficulty?: Difficulty;
  }) => void;
  selectedSubjects: string[];
}) {
  const count = clampHiddenGemsCount(questionCount);
  const effectiveDifficulty =
    difficulty === "EASY" || difficulty === "MEDIUM" || difficulty === "HARD"
      ? difficulty
      : "MEDIUM";
  const subjectLabel =
    selectedSubjects.length > 3
      ? `${selectedSubjects.slice(0, 3).join(", ")} +${selectedSubjects.length - 3}`
      : selectedSubjects.join(", ");

  return (
    <Card
      className={cn(
        "overflow-hidden border-blue-300/20 bg-blue-500/[0.055]",
        enabled && "border-blue-300/50 bg-blue-500/10",
      )}
    >
      <button
        type="button"
        onClick={onToggleOpen}
        className="flex w-full items-start justify-between gap-3 p-4 text-left"
        aria-expanded={open}
      >
        <div className="flex min-w-0 gap-3">
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-blue-300/20 bg-slate-950/60 text-blue-100">
            <Brain className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-base font-extrabold text-white">
                Hidden Gems & Curiosity Questions
              </h3>
              {enabled ? (
                <span className="rounded-full border border-emerald-300/25 bg-emerald-400/10 px-2 py-0.5 text-[11px] font-bold uppercase text-emerald-100">
                  {count} included
                </span>
              ) : null}
            </div>
            <p className="mt-1 text-xs leading-5 text-slate-400">
              Mine overlooked facts and side notes from {subjectLabel || "the selected subjects"}.
            </p>
          </div>
        </div>
        {open ? (
          <ChevronUp className="mt-1 h-4 w-4 shrink-0 text-slate-400" />
        ) : (
          <ChevronDown className="mt-1 h-4 w-4 shrink-0 text-slate-400" />
        )}
      </button>

      {open ? (
        <div className="border-t border-white/10 p-4 pt-3">
          <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-white/10 bg-slate-950/40 p-3">
            <Checkbox
              checked={enabled}
              onChange={(event) => onChange({ enabled: event.target.checked })}
              className="mt-1"
            />
            <span>
              <span className="block text-sm font-bold text-slate-100">
                Include Hidden Facts
              </span>
              <span className="mt-1 block text-xs leading-5 text-slate-400">
                Generate from did-you-know facts, scientist names, discoveries,
                timelines, origins, experiments, rare comparisons, tables,
                footnotes, captions, and context students usually ignore.
              </span>
            </span>
          </label>

          <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_auto] lg:items-end">
            <div>
              <div className="mb-2 text-xs font-bold uppercase text-slate-400">
                Difficulty
              </div>
              <div className="flex flex-wrap gap-2">
                {HIDDEN_GEMS_DIFFICULTY_OPTIONS.map((option) => {
                  const active = effectiveDifficulty === option.id;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      title={option.hint}
                      onClick={() => onChange({ difficulty: option.id })}
                      disabled={!enabled}
                      className={cn(
                        "h-9 rounded-lg border px-3 text-xs font-bold transition disabled:cursor-not-allowed disabled:opacity-50",
                        active
                          ? "border-blue-300 bg-primary text-white shadow-glow"
                          : "border-white/10 bg-white/[0.035] text-slate-300 hover:border-blue-300/50",
                      )}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <div className="mb-2 text-xs font-bold uppercase text-slate-400">
                Questions
              </div>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  aria-label="Decrease hidden gems questions"
                  disabled={!enabled || count <= HIDDEN_GEMS_MIN_COUNT}
                  className="h-9 w-9"
                  onClick={() => onChange({ questionCount: count - 1 })}
                >
                  <Minus className="h-4 w-4" />
                </Button>
                <input
                  value={count}
                  type="number"
                  min={HIDDEN_GEMS_MIN_COUNT}
                  max={HIDDEN_GEMS_MAX_COUNT}
                  disabled={!enabled}
                  onChange={(event) =>
                    onChange({ questionCount: Number(event.target.value) })
                  }
                  className="h-9 w-16 rounded-lg border border-white/10 bg-slate-950 text-center text-sm font-bold text-white outline-none transition disabled:opacity-50 focus:border-blue-300/70"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  aria-label="Increase hidden gems questions"
                  disabled={!enabled || count >= HIDDEN_GEMS_MAX_COUNT}
                  className="h-9 w-9"
                  onClick={() => onChange({ questionCount: count + 1 })}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              <div className="mt-1 text-[11px] text-slate-500">
                0-{HIDDEN_GEMS_MAX_COUNT} extra questions
              </div>
            </div>
          </div>

          <div className="mt-4 rounded-lg border border-white/10 bg-slate-950/40 p-3 text-xs leading-5 text-slate-400">
            <div className="mb-1 flex items-center gap-2 font-bold text-blue-100">
              <Sparkles className="h-3.5 w-3.5" />
              Source-mining priority
            </div>
            Hidden slots avoid basic textbook definitions and prioritize names,
            dates, discoveries, origins, observations, instruments, timelines,
            side notes, forgotten tables, and unusual comparisons found in the
            selected chapter source.
          </div>
        </div>
      ) : null}
    </Card>
  );
}

function clampHiddenGemsCount(value: number | undefined) {
  const numberValue = Number(value ?? 0);
  if (!Number.isFinite(numberValue)) return 0;
  return Math.max(
    HIDDEN_GEMS_MIN_COUNT,
    Math.min(HIDDEN_GEMS_MAX_COUNT, Math.round(numberValue)),
  );
}

function buildSubjectSelections(
  selectedSubjects: string[],
  chapterIds: number[],
  topicIds: number[],
  chapterGroups: { subject: string; chapters: ChapterOption[] }[],
  existing: SubjectSelection[] = [],
): SubjectSelection[] {
  return selectedSubjects.map((subject) => {
    const group = chapterGroups.find((item) => item.subject === subject);
    const previous = existing.find((item) => item.subject === subject);

    if (!group) {
      return {
        subject,
        chapterIds: previous?.chapterIds ?? [],
        topicIds: previous?.topicIds ?? [],
        languageMode: previous?.languageMode,
      };
    }

    const groupChapterIds = new Set(group.chapters.map((chapter) => chapter.id));
    const groupTopicIds = new Set(
      group.chapters.flatMap((chapter) => chapter.topics.map((topic) => topic.id)),
    );

    return {
      subject,
      chapterIds: chapterIds.filter((id) => groupChapterIds.has(id)),
      topicIds: topicIds.filter((id) => groupTopicIds.has(id)),
      languageMode: previous?.languageMode,
    };
  });
}

function isLanguageSubject(subject: string): boolean {
  const normalized = subject.trim().toLowerCase();
  return normalized === "hindi" || normalized === "english";
}

function isScienceSubject(subject: string): boolean {
  const normalized = subject.trim().toLowerCase();
  return (
    normalized === "mathematics" ||
    normalized === "physics" ||
    normalized === "chemistry"
  );
}
