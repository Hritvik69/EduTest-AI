"use client";

import * as React from "react";
import {
  PolarAngleAxis,
  PolarGrid,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { useIsClient } from "@/lib/use-is-client";
import type { BloomLevel } from "@/types";

export function BloomRadar({
  scores,
}: {
  scores: Partial<Record<BloomLevel, number>>;
}) {
  const mounted = useIsClient();
  const data = bloomLevels.map((level) => ({
    level: bloomLabels[level],
    student: scores[level] ?? 0,
    standard: idealScores[level],
  }));

  if (!mounted) {
    return <div className="h-72 min-w-[320px]" />;
  }

  return (
    <div className="h-72 min-w-[320px]">
      <ResponsiveContainer width="100%" height="100%">
        <RadarChart data={data}>
          <PolarGrid stroke="rgba(148,163,184,0.32)" />
          <PolarAngleAxis dataKey="level" tick={{ fill: "#cbd5e1", fontSize: 11 }} />
          <Tooltip
            contentStyle={{
              background: "#0f172a",
              border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: 8,
              color: "#e2e8f0",
            }}
          />
          <Radar
            name="Your Score"
            dataKey="student"
            stroke="#38bdf8"
            fill="#38bdf8"
            fillOpacity={0.28}
          />
          <Radar
            name="CBSE Standard"
            dataKey="standard"
            stroke="#fbbf24"
            fill="transparent"
            strokeDasharray="5 5"
          />
        </RadarChart>
      </ResponsiveContainer>
      <div className="mt-2 flex justify-center gap-4 text-xs text-slate-300">
        <span className="inline-flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-sky-400" /> Your Score
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-amber-300" /> CBSE Standard
        </span>
      </div>
    </div>
  );
}

const bloomLevels: BloomLevel[] = [
  "REMEMBER",
  "UNDERSTAND",
  "APPLY",
  "ANALYZE",
  "EVALUATE",
  "CREATE",
];

const bloomLabels: Record<BloomLevel, string> = {
  REMEMBER: "Remember",
  UNDERSTAND: "Understand",
  APPLY: "Apply",
  ANALYZE: "Analyze",
  EVALUATE: "Evaluate",
  CREATE: "Create",
};

const idealScores: Record<BloomLevel, number> = {
  REMEMBER: 15,
  UNDERSTAND: 20,
  APPLY: 30,
  ANALYZE: 20,
  EVALUATE: 10,
  CREATE: 5,
};
