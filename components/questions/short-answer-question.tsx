import type { GeneratedQuestion } from "@/types";
import { QuestionShell } from "./shared";

export function ShortAnswerQuestion({ question }: { question: GeneratedQuestion }) {
  return <QuestionShell question={question} label="Short Answer" />;
}
