import * as React from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export function AccordionItem({
  title,
  children,
  className,
}: {
  title: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <details
      className={cn(
        "group rounded-lg border border-white/10 bg-white/[0.03]",
        className,
      )}
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4">
        <div className="min-w-0 flex-1">{title}</div>
        <ChevronDown className="h-4 w-4 shrink-0 text-slate-400 transition group-open:rotate-180" />
      </summary>
      <div className="border-t border-white/10 p-4 pt-3">{children}</div>
    </details>
  );
}
