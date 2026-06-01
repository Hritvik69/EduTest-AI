"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export function Tabs({
  tabs,
  defaultValue,
}: {
  tabs: { value: string; label: string; content: React.ReactNode }[];
  defaultValue?: string;
}) {
  const [active, setActive] = React.useState(defaultValue ?? tabs[0]?.value);
  const current = tabs.find((tab) => tab.value === active) ?? tabs[0];

  return (
    <div>
      <div className="flex rounded-lg border border-white/10 bg-white/[0.04] p-1">
        {tabs.map((tab) => (
          <button
            key={tab.value}
            onClick={() => setActive(tab.value)}
            className={cn(
              "flex-1 rounded-md px-3 py-2 text-sm font-semibold transition",
              active === tab.value
                ? "bg-primary text-white"
                : "text-slate-400 hover:text-white",
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className="mt-4">{current?.content}</div>
    </div>
  );
}
