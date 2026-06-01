import type { GeneratedQuestion } from "@/types";
import { QuestionShell } from "./shared";

export function HOTSQuestion({ question }: { question: GeneratedQuestion }) {
  return <QuestionShell question={question} label="HOTS" />;
}
