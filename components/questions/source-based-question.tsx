import type { GeneratedQuestion } from "@/types";
import { QuestionShell } from "./shared";

export function SourceBasedQuestion({ question }: { question: GeneratedQuestion }) {
  return <QuestionShell question={question} label="Source-Based" />;
}
