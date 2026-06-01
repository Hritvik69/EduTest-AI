"use client";

import * as React from "react";
import { Check } from "lucide-react";
import { AccordionItem } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Slider } from "@/components/ui/slider";
import {
  bloomLabels,
  defaultBloomDistribution,
  difficultyLabels,
} from "@/lib/edutest-data";
import { bloomDistributionForDifficulty } from "@/lib/question-planning";
import { cn } from "@/lib/utils";
import type { BloomLevel, Difficulty } from "@/types";
import { usePaperConfig } from "./paper-config-context";

const difficultyCards: {
  difficulty: Difficulty;
  title: string;
  border: string;
  description: string;
  bestFor: string;
  bloom: string;
}[] = [
  {
    difficulty: "EASY",
    title: "EASY",
    border: "border-emerald-300/50",
    description: "Direct concepts, simple definitions.",
    bestFor: "Revision, new topics, beginners",
    bloom: "Remember + Understand (85%)",
  },
  {
    difficulty: "MEDIUM",
    title: "MEDIUM",
    border: "border-amber-300/50",
    description: "Application and multi-step reasoning.",
    bestFor: "Regular exam practice, CBSE standard",
    bloom: "Apply + Analyze (65%)",
  },
  {
    difficulty: "HARD",
    title: "HARD",
    border: "border-orange-300/50",
    description: "Complex scenarios, HOTS, integrated concepts.",
    bestFor: "Advanced prep, competitive mindset",
    bloom: "Analyze + Evaluate (70%)",
  },
  {
    difficulty: "ABSURD",
    title: "ABSURD 🔥",
    border: "border-red-300/60",
    description: "Extreme. Unfamiliar scenarios. Even toppers struggle.",
    bestFor: "Pure challenge, not exam prep",
    bloom: "Evaluate + Create (70%)",
  },
];

const bloomLevels: BloomLevel[] = [
  "REMEMBER",
  "UNDERSTAND",
  "APPLY",
  "ANALYZE",
  "EVALUATE",
  "CREATE",
];

export function StepFour() {
  const { config, updateConfig } = usePaperConfig();
  const [absurdOpen, setAbsurdOpen] = React.useState(false);
  const bloomTotal = bloomLevels.reduce(
    (sum, level) => sum + config.bloomDistribution[level],
    0,
  );

  function chooseDifficulty(difficulty: Difficulty) {
    if (difficulty === "ABSURD") {
      setAbsurdOpen(true);
      return;
    }

    updateConfig({
      difficulty,
      bloomDistribution: { ...bloomDistributionForDifficulty(difficulty) },
    });
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-extrabold text-white">Difficulty</h2>
        <p className="mt-2 text-sm text-slate-400">
          Choose the reasoning level and optionally tune Bloom&apos;s distribution.
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
              onClick={() => chooseDifficulty(card.difficulty)}
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
              <p className="mt-2 text-sm text-slate-400">
                <span className="font-semibold text-slate-200">Bloom&apos;s focus:</span>{" "}
                {card.bloom}
              </p>
            </Card>
          );
        })}
      </div>

      <AccordionItem
        title={
          <div>
            <h3 className="font-bold text-white">
              Advanced: Customize Bloom&apos;s Distribution
            </h3>
            <p
              className={cn(
                "mt-1 text-sm",
                bloomTotal === 100 ? "text-slate-400" : "text-red-200",
              )}
            >
              Current sum: {bloomTotal}%
            </p>
          </div>
        }
      >
        <div className="space-y-5">
          {bloomLevels.map((level) => (
            <div key={level}>
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm font-semibold text-slate-200">
                  {bloomLabels[level]}
                </span>
                <span className="mono-label text-xs text-slate-400">
                  {config.bloomDistribution[level]}%
                </span>
              </div>
              <Slider
                min={0}
                max={100}
                step={5}
                value={config.bloomDistribution[level]}
                onChange={(event) =>
                  updateConfig({
                    bloomDistribution: {
                      ...config.bloomDistribution,
                      [level]: Number(event.target.value),
                    },
                  })
                }
              />
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            onClick={() =>
              updateConfig({ bloomDistribution: defaultBloomDistribution })
            }
          >
            Reset to CBSE Standard
          </Button>
        </div>
      </AccordionItem>

      <Dialog
        open={absurdOpen}
        tone="danger"
        title="Are you sure?"
        description="This mode generates extremely difficult questions that require university-level reasoning applied to CBSE syllabus. Not recommended for exam preparation."
        cancelLabel="Cancel"
        confirmLabel="Yes, Extreme Mode"
        onClose={() => setAbsurdOpen(false)}
        onConfirm={() => {
          updateConfig({
            difficulty: "ABSURD",
            bloomDistribution: { ...bloomDistributionForDifficulty("ABSURD") },
          });
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
