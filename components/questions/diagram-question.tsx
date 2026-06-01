import type { GeneratedQuestion } from "@/types";
import { QuestionShell } from "./shared";

export function DiagramQuestion({ question }: { question: GeneratedQuestion }) {
  return <QuestionShell question={question} label="Diagram-Based" />;
}
