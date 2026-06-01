"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

const defaultStepLabels = [
  "Class & Chapters",
  "S/C/T Composition",
  "Time & Exam",
  "Difficulty",
  "Question Types",
  "AI Engine",
];

export function ProgressSteps({
  currentStep,
  firstLabel = "Class & Chapters",
  secondLabel = "S/C/T Composition",
}: {
  currentStep: number;
  firstLabel?: string;
  secondLabel?: string;
}) {
  const stepLabels = [firstLabel, secondLabel, ...defaultStepLabels.slice(2)];

  return (
    <div className="mx-auto w-full max-w-5xl">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-6 sm:items-start">
        {stepLabels.map((label, index) => {
          const step = index + 1;
          const done = currentStep > step;
          const active = currentStep === step;

          return (
            <div
              key={label}
              className="relative flex items-center gap-3 sm:flex-col sm:gap-2"
            >
              {index < stepLabels.length - 1 ? (
                <div className="absolute left-1/2 top-5 hidden h-1 w-full bg-white/10 sm:block">
                  <div
                    className={cn(
                      "h-full bg-primary transition-all duration-500",
                      currentStep > step ? "w-full" : active ? "w-1/2" : "w-0",
                    )}
                  />
                </div>
              ) : null}
              <div
                className={cn(
                  "relative z-10 flex h-10 w-10 items-center justify-center rounded-full border text-sm font-bold transition",
                  done && "border-emerald-300 bg-emerald-500 text-white",
                  active && "border-blue-300 bg-primary text-white shadow-glow",
                  !done && !active && "border-white/20 bg-slate-950 text-slate-400",
                )}
              >
                {done ? <Check className="h-5 w-5" /> : step}
              </div>
              <span
                className={cn(
                  "text-left text-xs font-semibold text-slate-400 sm:text-center",
                  active && "text-blue-100",
                )}
              >
                {label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
