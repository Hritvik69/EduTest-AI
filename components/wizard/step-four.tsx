"use client";

import * as React from "react";
import { Check, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { difficultyLabels } from "@/lib/edutest-data";
import {
  defaultQuestionStyle,
  depthDescriptions,
  depthLabels,
  questionVerbDescriptions,
  questionVerbLabels,
  vocabDescriptions,
  vocabLabels,
} from "@/lib/question-style-protocol";
import { cn } from "@/lib/utils";
import type { Difficulty, QuestionStyle, QuestionVerb, ReasoningDepth, VocabLevel } from "@/types";
import { usePaperConfig } from "./paper-config-context";

const difficultyCards: {
  difficulty: Difficulty;
  title: string;
  border: string;
  description: string;
  bestFor: string;
}[] = [
  {
    difficulty: "EASY",
    title: "EASY",
    border: "border-emerald-300/50",
    description: "Direct concepts, simple definitions.",
    bestFor: "Revision, new topics, beginners",
  },
  {
    difficulty: "MEDIUM",
    title: "MEDIUM",
    border: "border-amber-300/50",
    description: "Application and multi-step reasoning.",
    bestFor: "Regular exam practice, CBSE standard",
  },
  {
    difficulty: "HARD",
    title: "HARD",
    border: "border-orange-300/50",
    description: "Complex scenarios, HOTS, integrated concepts.",
    bestFor: "Advanced prep, competitive mindset",
  },
  {
    difficulty: "ABSURD",
    title: "ABSURD 🔥",
    border: "border-red-300/60",
    description: "Extreme. Unfamiliar scenarios. Even toppers struggle.",
    bestFor: "Pure challenge, not exam prep",
  },
];

const verbOptions: QuestionVerb[] = [
  "MIXED",
  "WHAT",
  "WHICH",
  "HOW",
  "WHY",
  "EXPLAIN",
  "COMPARE",
  "DIFFERENTIATE",
  "PREDICT",
];

const vocabOptions: VocabLevel[] = ["SIMPLE", "STANDARD", "ACADEMIC", "TECHNICAL"];

const depthOptions: ReasoningDepth[] = ["DIRECT", "STANDARD", "DEEP", "EXTREME"];

export function StepFour() {
  const { config, updateConfig } = usePaperConfig();
  const [absurdOpen, setAbsurdOpen] = React.useState(false);

  const style: QuestionStyle = config.questionStyle ?? defaultQuestionStyle;

  function setVerb(verb: QuestionVerb) {
    updateConfig({
      questionStyle: { ...style, verb },
    });
  }

  function setVocab(vocab: VocabLevel) {
    updateConfig({
      questionStyle: { ...style, vocab },
    });
  }

  function setDepth(depth: ReasoningDepth) {
    updateConfig({
      questionStyle: { ...style, depth },
    });
  }

  function reset() {
    updateConfig({ questionStyle: defaultQuestionStyle });
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-extrabold text-white">Difficulty</h2>
        <p className="mt-2 text-sm text-slate-400">
          Pick a difficulty band, then fine-tune how each question is written
          using three independent style controls.
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {difficultyCards.map((card) => {
          const selected = config.difficulty === card.difficulty;

          return (
            <Card
              key={card.difficulty}
              role="button"
              tabIndex={0}
              onClick={() => {
                if (card.difficulty === "ABSURD") {
                  setAbsurdOpen(true);
                  return;
                }
                updateConfig({ difficulty: card.difficulty });
              }}
              className={cn(
                "relative cursor-pointer p-5 transition",
                selected
                  ? cn(card.border, "bg-white/[0.055] shadow-glow")
                  : "hover:border-blue-300/40",
                card.difficulty === "ABSURD" && "bg-red-950/20",
              )}
            >
              {selected ? (
                <span className="absolute right-4 top-4 rounded-full bg-primary p-1 text-white">
                  <Check className="h-4 w-4" />
                </span>
              ) : null}
              <h3 className="text-xl font-extrabold text-white">
                {card.difficulty === "ABSURD" ? "ABSURD" : card.title}
              </h3>
              <p className="mt-3 text-sm leading-6 text-slate-300">
                {card.description}
              </p>
              <p className="mt-3 text-sm text-slate-400">
                <span className="font-semibold text-slate-200">Best for:</span>{" "}
                {card.bestFor}
              </p>
            </Card>
          );
        })}
      </div>

      <div className="rounded-lg border border-blue-300/20 bg-blue-500/[0.06] p-5">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h3 className="text-lg font-extrabold text-white">
              Question Style — Verb / Vocab / Depth
            </h3>
            <p className="mt-1 text-sm text-slate-300">
              The old Bloom-distribution sliders are gone. These three axes
              directly control how every question stem is written — no more
              &quot;force everything to HARD just to get one challenging
              HOTS&quot;.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={reset}
            className="shrink-0"
          >
            <RefreshCw className="h-4 w-4" />
            Reset to CBSE Standard
          </Button>
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-3">
          <StyleColumn
            axis="verb"
            title="Stem Opener (Verb)"
            subtitle="Which interrogative / task word opens each question"
            options={verbOptions.map((value) => ({
              value,
              label: questionVerbLabels[value],
              description: questionVerbDescriptions[value],
            }))}
            selected={style.verb}
            onSelect={setVerb}
            accent="emerald"
          />
          <StyleColumn
            axis="vocab"
            title="Language Register (Vocab)"
            subtitle="How academic the wording should be"
            options={vocabOptions.map((value) => ({
              value,
              label: vocabLabels[value],
              description: vocabDescriptions[value],
            }))}
            selected={style.vocab}
            onSelect={setVocab}
            accent="blue"
          />
          <StyleColumn
            axis="depth"
            title="Reasoning Depth"
            subtitle="How many reasoning steps the question demands"
            options={depthOptions.map((value) => ({
              value,
              label: depthLabels[value],
              description: depthDescriptions[value],
            }))}
            selected={style.depth}
            onSelect={setDepth}
            accent="amber"
          />
        </div>

        <div className="mt-5 grid gap-2 rounded-lg border border-white/10 bg-slate-950/40 p-3 text-xs sm:grid-cols-3">
          <SummaryLine
            label="Verb"
            value={questionVerbLabels[style.verb]}
            hint={questionVerbDescriptions[style.verb]}
          />
          <SummaryLine
            label="Vocab"
            value={vocabLabels[style.vocab]}
            hint={vocabDescriptions[style.vocab]}
          />
          <SummaryLine
            label="Depth"
            value={depthLabels[style.depth]}
            hint={depthDescriptions[style.depth]}
          />
        </div>
      </div>

      <Dialog
        open={absurdOpen}
        tone="danger"
        title="Are you sure?"
        description="This mode generates extremely difficult questions that require university-level reasoning applied to CBSE syllabus. Not recommended for exam preparation."
        cancelLabel="Cancel"
        confirmLabel="Yes, Extreme Mode"
        onClose={() => setAbsurdOpen(false)}
        onConfirm={() => {
          updateConfig({ difficulty: "ABSURD" });
          setAbsurdOpen(false);
        }}
      />

      <div className="rounded-lg border border-white/10 bg-white/[0.035] p-4 text-sm text-slate-400">
        Selected difficulty:{" "}
        <span className="font-bold text-white">
          {difficultyLabels[config.difficulty]}
        </span>
      </div>
    </div>
  );
}

type AxisOption<V extends string> = {
  value: V;
  label: string;
  description: string;
};

function StyleColumn<V extends string>({
  axis,
  title,
  subtitle,
  options,
  selected,
  onSelect,
  accent,
}: {
  axis: "verb" | "vocab" | "depth";
  title: string;
  subtitle: string;
  options: AxisOption<V>[];
  selected: V;
  onSelect: (value: V) => void;
  accent: "emerald" | "blue" | "amber";
}) {
  const accentRing: Record<typeof accent, string> = {
    emerald: "ring-emerald-300/50 bg-emerald-500/15 text-emerald-50",
    blue: "ring-blue-300/50 bg-blue-500/15 text-blue-50",
    amber: "ring-amber-300/50 bg-amber-500/15 text-amber-50",
  };
  const accentBorder: Record<typeof accent, string> = {
    emerald: "border-emerald-300/30",
    blue: "border-blue-300/30",
    amber: "border-amber-300/30",
  };

  return (
    <div
      data-axis={axis}
      className={cn(
        "rounded-xl border bg-slate-950/40 p-4",
        accentBorder[accent],
      )}
    >
      <div className="flex items-baseline justify-between gap-2">
        <h4 className="text-sm font-extrabold uppercase tracking-wide text-white">
          {title}
        </h4>
      </div>
      <p className="mt-1 text-xs text-slate-400">{subtitle}</p>

      <div className="mt-4 grid gap-2">
        {options.map((option) => {
          const isActive = option.value === selected;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onSelect(option.value)}
              aria-pressed={isActive}
              className={cn(
                "group rounded-lg border px-3 py-2 text-left transition focus:outline-none focus:ring-2",
                isActive
                  ? cn("ring-1", accentRing[accent])
                  : "border-white/10 bg-white/[0.03] hover:border-white/30 hover:bg-white/[0.06]",
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span
                  className={cn(
                    "text-sm font-semibold",
                    isActive ? "text-white" : "text-slate-100",
                  )}
                >
                  {option.label}
                </span>
                {isActive ? (
                  <Check className="h-4 w-4 text-emerald-200" />
                ) : null}
              </div>
              <p className="mt-1 text-[11px] leading-snug text-slate-400">
                {option.description}
              </p>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function SummaryLine({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div>
      <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
        {label}
      </div>
      <div className="mt-0.5 text-sm font-semibold text-white">{value}</div>
      <div className="mt-0.5 text-[11px] leading-snug text-slate-400">{hint}</div>
    </div>
  );
}