import type { GeneratedQuestion } from "@/types";
import { QuestionShell } from "./shared";

export function LongAnswerQuestion({ question }: { question: GeneratedQuestion }) {
  return <QuestionShell question={question} label="Long Answer" />;
}
