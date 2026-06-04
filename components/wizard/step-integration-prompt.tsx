"use client";

import * as React from "react";
import { Eraser, PenLine, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePaperConfig } from "./paper-config-context";

const promptStarters = [
  {
    label: "Exam Polish",
    text: "Make the paper feel like a polished school exam. Use clear CBSE-style wording, balanced difficulty, and avoid vague questions.",
  },
  {
    label: "Local Examples",
    text: "Where suitable, use familiar Indian classroom or daily-life examples while staying strictly inside the selected source content.",
  },
  {
    label: "Application Focus",
    text: "Prefer application-based and reasoning-based questions over direct recall, but keep answers appropriate for the selected class level.",
  },
  {
    label: "Simple Language",
    text: "Use simple, student-friendly language. Avoid unnecessarily complex English while keeping the academic meaning precise.",
  },
];

export function StepIntegrationPrompt() {
  const { config, updateConfig } = usePaperConfig();
  const value = config.integrationPrompt ?? "";
  const remaining = Math.max(0, 1200 - value.length);

  function setPrompt(next: string) {
    updateConfig({ integrationPrompt: next.slice(0, 1200) });
  }

  function appendStarter(text: string) {
    const separator = value.trim() ? "\n" : "";
    setPrompt(`${value.trim()}${separator}${text}`);
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-extrabold text-white">Integration Prompt</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
          Add optional teacher instructions that should influence the generated
          paper. These instructions are sent to AI with the selected class,
          source, difficulty, question counts, and format contract.
        </p>
      </div>

      <div className="rounded-lg border border-blue-300/20 bg-blue-500/[0.055] p-4">
        <div className="mb-3 flex items-center gap-2 text-sm font-bold uppercase text-blue-100">
          <PenLine className="h-4 w-4" />
          Custom generation guidance
        </div>
        <textarea
          value={value}
          maxLength={1200}
          onChange={(event) => setPrompt(event.target.value)}
          placeholder="Example: Make questions more practical, use local examples where suitable, keep language simple, and avoid chapter/meta wording."
          className="min-h-44 w-full resize-y rounded-lg border border-white/10 bg-slate-950/70 p-4 text-sm leading-6 text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-blue-300/70"
        />
        <div className="mt-2 flex flex-col gap-2 text-xs text-slate-400 sm:flex-row sm:items-center sm:justify-between">
          <span>{remaining} characters left</span>
          <span>Counts, source scope, difficulty, and question formats still stay locked.</span>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {promptStarters.map((starter) => (
          <button
            type="button"
            key={starter.label}
            onClick={() => appendStarter(starter.text)}
            className="rounded-lg border border-white/10 bg-white/[0.035] p-4 text-left transition hover:border-blue-300/40 hover:bg-blue-500/10"
          >
            <div className="flex items-center gap-2 text-sm font-bold text-white">
              <Sparkles className="h-4 w-4 text-blue-200" />
              {starter.label}
            </div>
            <p className="mt-2 text-sm leading-6 text-slate-400">{starter.text}</p>
          </button>
        ))}
      </div>

      <div className="flex justify-end">
        <Button
          type="button"
          variant="outline"
          onClick={() => setPrompt("")}
          disabled={!value.trim()}
        >
          <Eraser className="h-4 w-4" />
          Clear Prompt
        </Button>
      </div>
    </div>
  );
}
