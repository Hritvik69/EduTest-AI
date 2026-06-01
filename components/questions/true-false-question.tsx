import type { GeneratedQuestion } from "@/types";
import { QuestionShell } from "./shared";

export function TrueFalseQuestion({ question }: { question: GeneratedQuestion }) {
  return <QuestionShell question={question} label="True/False" />;
}
