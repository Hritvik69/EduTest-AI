"use client";

import * as React from "react";
import { Check, Loader2 } from "lucide-react";
import { AccordionItem } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { fetchApiData } from "@/lib/api-client";
import { classes, subjects as staticSubjects } from "@/lib/edutest-data";
import { cn } from "@/lib/utils";
import type { ChapterOption, SubjectSelection } from "@/types";
import { usePaperConfig } from "./paper-config-context";

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
                          <span className="text-sm font-semibold text-slate-100">
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
                            <span>{topic.name}</span>
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
    };
  });
}
