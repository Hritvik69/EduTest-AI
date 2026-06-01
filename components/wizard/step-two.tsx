"use client";

import { Slider } from "@/components/ui/slider";
import { cn, formatDuration } from "@/lib/utils";
import { usePaperConfig } from "./paper-config-context";

const examTypes = [
  "School Test",
  "Unit Test",
  "Half Yearly",
  "Final Exam",
  "Practice",
  "Competitive",
];

export function StepTwo() {
  const { config, updateConfig } = usePaperConfig();

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-extrabold text-white">
          Time & Exam Type
        </h2>
        <p className="mt-2 text-sm text-slate-400">
          Set the paper duration and assessment format.
        </p>
      </div>

      <div className="rounded-lg border border-white/10 bg-white/[0.035] p-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="mono-label text-xs uppercase text-slate-400">Time</div>
            <div className="mt-1 text-2xl font-extrabold text-white">
              {formatDuration(config.duration)}
            </div>
          </div>
          <span className="text-sm text-slate-400">30 to 240 minutes</span>
        </div>
        <Slider
          min={30}
          max={240}
          step={15}
          value={config.duration}
          onChange={(event) => updateConfig({ duration: Number(event.target.value) })}
          className="mt-5"
        />
      </div>

      <div>
        <div className="mono-label mb-3 text-xs uppercase text-slate-400">Exam Type</div>
        <div className="flex flex-wrap gap-2">
          {examTypes.map((examType) => (
            <button
              key={examType}
              onClick={() => updateConfig({ examType })}
              className={cn(
                "rounded-full border px-4 py-2 text-sm font-semibold transition",
                config.examType === examType
                  ? "border-blue-300 bg-primary text-white"
                  : "border-white/10 bg-white/[0.035] text-slate-300 hover:border-blue-300/40",
              )}
            >
              {examType}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
