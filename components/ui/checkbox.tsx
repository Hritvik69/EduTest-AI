import * as React from "react";
import { cn } from "@/lib/utils";

export function Checkbox({
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      type="checkbox"
      className={cn(
        "h-4 w-4 rounded border-white/20 bg-slate-950 text-primary accent-blue-500",
        className,
      )}
      {...props}
    />
  );
}
