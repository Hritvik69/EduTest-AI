import type { GeneratedQuestion } from "@/types";
import { QuestionShell } from "./shared";

export function NumericalQuestion({ question }: { question: GeneratedQuestion }) {
  return <QuestionShell question={question} label="Numerical" />;
}
