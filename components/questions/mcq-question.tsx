import type { GeneratedQuestion } from "@/types";
import { QuestionShell } from "./shared";

export function MCQQuestion({ question }: { question: GeneratedQuestion }) {
  return <QuestionShell question={question} label="MCQ" />;
}
