import type { GeneratedQuestion } from "@/types";
import { QuestionShell } from "./shared";

export function CompetencyQuestion({ question }: { question: GeneratedQuestion }) {
  return <QuestionShell question={question} label="Competency-Based" />;
}
