import * as React from "react";
import { cn } from "@/lib/utils";

export function Slider({
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      type="range"
      className={cn("h-2 w-full cursor-pointer accent-blue-500", className)}
      {...props}
    />
  );
}
