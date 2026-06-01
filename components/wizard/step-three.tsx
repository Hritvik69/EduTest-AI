"use client";

import * as React from "react";
import {
  BookOpenCheck,
  Check,
  ClipboardList,
  Flame,
  Layers3,
  ListChecks,
  Minus,
  PenLine,
  Plus,
  Target,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { generateBlueprint, marksPerType } from "@/lib/blueprint";
import {
  allowedDifficultiesForFormat,
  formatDifficultyCeilings,
} from "@/lib/difficulty-protocol";
import {
  difficultyLabels,
  presetQuestionTypes,
  questionTypeDetails,
  questionTypeMeta,
  selectableQuestionTypeMeta,
  sectionDotColors,
} from "@/lib/edutest-data";
import { cn } from "@/lib/utils";
import type { QuestionType } from "@/types";
import {
  adjustDistribution,
  questionCountDistribution,
  usePaperConfig,
} from "./paper-config-context";

const presetLabels = [
  { label: "Only MCQ", key: "Only MCQ", icon: Target },
  { label: "CBSE Standard", key: "CBSE Standard", icon: ClipboardList },
  { label: "Objective Mix", key: "Objective Mix", icon: ListChecks },
  { label: "Subjective", key: "Subjective", icon: PenLine },
  { label: "Full Mix", key: "Full Mix", icon: Flame },
  { label: "NCERT Books/PDF", key: "NCERT Books/PDF", icon: BookOpenCheck },
];

export function StepThree() {
  const { config, updateConfig } = usePaperConfig();
  const blueprint = React.useMemo(() => {
    try {
      return generateBlueprint(config);
    } catch {
      return null;
    }
  }, [config]);

  function setTypes(
    types: QuestionType[],
    preferredDistribution: Partial<Record<QuestionType, number>> = {},
  ) {
    updateConfig({
      questionTypes: types,
      typeDistribution: questionCountDistribution(
        types,
        config.totalQuestions,
        preferredDistribution,
      ),
    });
  }

  function toggleType(type: QuestionType) {
    const selected = config.questionTypes.includes(type);
    const next = selected
      ? config.questionTypes.filter((item) => item !== type)
      : [...config.questionTypes, type];

    if (!next.length) return;
    setTypes(
      next,
      selected
        ? {}
        : {
            [type]: Math.max(1, Math.round(config.totalQuestions / next.length)),
          },
    );
  }

  function updateTypeCount(type: QuestionType, value: number) {
    updateConfig({
      typeDistribution: adjustDistribution(
        config.typeDistribution,
        config.questionTypes,
        type,
        value,
        config.totalQuestions,
      ),
    });
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-extrabold text-white">Select Question Formats</h2>
        <p className="mt-2 text-sm text-slate-400">
          Pick one or more. Counts start with an equal split from S/C/T total.
        </p>
      </div>

      {config.questionComposition?.length ? (
        <div className="rounded-lg border border-blue-300/20 bg-blue-500/10 p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="flex items-center gap-2 text-sm font-bold text-blue-50">
                <Layers3 className="h-4 w-4" />
                S/C/T Composition Active
              </div>
              <p className="mt-1 text-sm text-blue-100/75">
                AI generation keeps this coverage split while using the question
                format counts below.
              </p>
            </div>
            <div className="text-sm font-bold text-white">
              {config.questionComposition.reduce(
                (sum, item) => sum + item.questionCount,
                0,
              )}{" "}
              questions
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {config.questionComposition.slice(0, 4).map((item) => (
              <span
                key={`${item.subject}-${item.chapterId ?? item.chapterName}-${item.topicId ?? item.topicName}`}
                className="rounded-full border border-white/10 bg-slate-950/40 px-3 py-1.5 text-xs font-semibold text-slate-200"
              >
                {item.topicName ?? item.chapterName ?? item.subject}:{" "}
                {item.questionCount}
              </span>
            ))}
            {config.questionComposition.length > 4 ? (
              <span className="rounded-full border border-white/10 bg-slate-950/40 px-3 py-1.5 text-xs font-semibold text-slate-400">
                +{config.questionComposition.length - 4} more
              </span>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {presetLabels.map((preset) => (
          <Button
            key={preset.key}
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              setTypes(presetQuestionTypes[preset.key], {})
            }
          >
            <preset.icon className="h-4 w-4" />
            {preset.label}
          </Button>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {selectableQuestionTypeMeta.map((item) => {
          const selected = config.questionTypes.includes(item.type);
          const unavailable =
            allowedDifficultiesForFormat(config.difficulty, item.type).length === 0;
          const maxDifficultyLabel =
            difficultyLabels[formatDifficultyCeilings[item.type]];
          const detail = questionTypeDetails[item.type];
          const section = blueprint?.sections.find(
            (blueprintSection) => blueprintSection.questionType === item.type,
          );

          return (
            <Card
              key={item.type}
              role="button"
              tabIndex={unavailable ? -1 : 0}
              aria-disabled={unavailable}
              onClick={() => {
                if (!unavailable) toggleType(item.type);
              }}
              onKeyDown={(event) => {
                if (unavailable) return;
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  toggleType(item.type);
                }
              }}
              className={cn(
                "relative min-h-44 cursor-pointer p-4 transition",
                unavailable
                  ? "cursor-not-allowed opacity-55"
                  : selected
                  ? "border-blue-300 bg-blue-500/10"
                  : "hover:border-blue-300/40",
              )}
            >
              {selected ? (
                <span className="absolute right-3 top-3 rounded-full bg-primary p-1 text-white">
                  <Check className="h-3.5 w-3.5" />
                </span>
              ) : unavailable ? (
                <span className="absolute right-3 top-3 rounded-full border border-amber-300/30 bg-amber-400/10 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-amber-100">
                  Max {maxDifficultyLabel}
                </span>
              ) : null}
              <div
                className={cn(
                  "mb-4 h-2.5 w-2.5 rounded-full",
                  sectionDotColors[item.section],
                )}
              />
              <div className="pr-7">
                <h3 className="font-bold text-white">{item.label}</h3>
                <p className="mt-1 text-xs font-semibold text-blue-100">
                  {item.marks === "Mixed"
                    ? "Mixed marks"
                    : `${item.marks} mark${item.marks === 1 ? "" : "s"}`}
                </p>
                <p className="mt-3 text-sm leading-6 text-slate-400">
                  {item.description}
                </p>
                {unavailable ? (
                  <p className="mt-2 text-xs font-semibold text-amber-100">
                    Not available for {difficultyLabels[config.difficulty]} papers.
                  </p>
                ) : null}
                {section ? (
                  <p className="mt-2 text-xs font-semibold text-emerald-200">
                    {section.count} question{section.count === 1 ? "" : "s"} |{" "}
                    {section.totalMarks} marks
                  </p>
                ) : null}
              </div>
              <details
                className="mt-4 rounded-lg border border-white/10 bg-slate-950/30"
                onClick={(event) => event.stopPropagation()}
              >
                <summary className="cursor-pointer list-none px-3 py-2 text-xs font-bold uppercase tracking-wide text-blue-100">
                  Structure
                </summary>
                <div className="space-y-3 border-t border-white/10 px-3 py-3 text-xs leading-5 text-slate-300">
                  <StructureLine label="Prompt goal" value={detail.goal} />
                  <StructureLine
                    label="JSON fields"
                    value={detail.expectedFields.join(", ")}
                  />
                  <StructureLine label="Answer" value={detail.answerFormat} />
                  <StructureLine label="Sample" value={detail.sample} />
                </div>
              </details>
            </Card>
          );
        })}
      </div>

      <div className="rounded-lg border border-white/10 bg-white/[0.035] p-5">
        <div className="mb-4">
          <h3 className="text-lg font-bold text-white">Exact Paper Shape</h3>
          <p className="mt-1 text-sm text-slate-400">
            Counts below follow the selected question target and marks together.
          </p>
        </div>
        {blueprint ? (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
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
          <p className="text-sm text-red-200">
            Selected question counts cannot exactly match the requested total marks.
          </p>
        )}
      </div>

      {config.questionTypes.length >= 2 ? (
        <div className="rounded-lg border border-white/10 bg-white/[0.035] p-5">
          <div className="mb-5">
            <h3 className="text-lg font-bold text-white">Distribution</h3>
            <p className="mt-1 text-sm text-slate-400">
              Allocate actual question numbers. Counts add to {config.totalQuestions}.
            </p>
          </div>
          <div className="grid gap-5">
            {config.questionTypes.map((type) => {
              const meta = questionTypeMeta.find((item) => item.type === type);
              const value = config.typeDistribution[type] ?? 0;
              const section = blueprint?.sections.find(
                (blueprintSection) => blueprintSection.questionType === type,
              );
              const totalMarks = section?.totalMarks ?? value * marksPerType[type];

              return (
                <div key={type}>
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <span className="text-sm font-semibold text-slate-200">
                      {meta?.label ?? type}
                    </span>
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        aria-label={`Decrease ${meta?.label ?? type} questions`}
                        className="h-9 w-9"
                        onClick={() => updateTypeCount(type, value - 1)}
                      >
                        <Minus className="h-4 w-4" />
                      </Button>
                      <input
                        value={value}
                        type="number"
                        min={0}
                        max={config.totalQuestions}
                        onChange={(event) =>
                          updateTypeCount(type, Number(event.target.value))
                        }
                        className="h-9 w-16 rounded-lg border border-white/10 bg-slate-950 text-center text-sm font-bold text-white outline-none focus:border-blue-300/70"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        aria-label={`Increase ${meta?.label ?? type} questions`}
                        className="h-9 w-9"
                        onClick={() => updateTypeCount(type, value + 1)}
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  <div className="mono-label text-xs text-slate-400">
                    {value} question{value === 1 ? "" : "s"} | {totalMarks} marks
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function StructureLine({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="font-semibold text-slate-100">{label}: </span>
      <span>{value}</span>
    </div>
  );
}
