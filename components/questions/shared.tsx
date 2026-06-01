import type { GeneratedQuestion } from "@/types";

export function QuestionShell({
  question,
  label,
}: {
  question: GeneratedQuestion;
  label: string;
}) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.035] p-4">
      <div className="mb-2 text-xs font-semibold uppercase text-blue-200">{label}</div>
      <p className="font-semibold text-slate-100">{question.text}</p>
    </div>
  );
}
