import type { GeneratedQuestion } from "@/types";
import { QuestionShell } from "./shared";

export function VeryShortQuestion({ question }: { question: GeneratedQuestion }) {
  return <QuestionShell question={question} label="Very Short Answer" />;
}
