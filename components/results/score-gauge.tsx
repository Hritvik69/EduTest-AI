"use client";

import * as React from "react";

export function ScoreGauge({ percentage }: { percentage: number }) {
  const [display, setDisplay] = React.useState(0);
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const color =
    percentage > 70 ? "#34d399" : percentage >= 50 ? "#fbbf24" : "#f87171";

  React.useEffect(() => {
    const frame = window.requestAnimationFrame(() => setDisplay(percentage));
    return () => window.cancelAnimationFrame(frame);
  }, [percentage]);

  return (
    <div className="relative flex h-40 w-40 items-center justify-center">
      <svg className="h-full w-full -rotate-90" viewBox="0 0 140 140" aria-hidden>
        <circle
          cx="70"
          cy="70"
          r={radius}
          fill="none"
          stroke="rgba(255,255,255,0.1)"
          strokeWidth="12"
        />
        <circle
          cx="70"
          cy="70"
          r={radius}
          fill="none"
          stroke={color}
          strokeLinecap="round"
          strokeWidth="12"
          strokeDasharray={circumference}
          strokeDashoffset={circumference - (circumference * display) / 100}
          className="transition-all duration-1000 ease-out"
        />
      </svg>
      <span className="absolute text-4xl font-extrabold text-white">{percentage}%</span>
    </div>
  );
}
