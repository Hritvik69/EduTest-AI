import { formatDuration } from "@/lib/utils";

export function Timer({ minutes }: { minutes: number }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.035] px-3 py-2 text-sm font-bold text-white">
      {formatDuration(minutes)}
    </div>
  );
}
