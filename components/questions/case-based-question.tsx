import type { GeneratedQuestion } from "@/types";
import { QuestionShell } from "./shared";

export function CaseBasedQuestion({ question }: { question: GeneratedQuestion }) {
  return <QuestionShell question={question} label="Case-Based" />;
}
