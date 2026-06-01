import type { GeneratedQuestion } from "@/types";
import { QuestionShell } from "./shared";

export function FillBlankQuestion({ question }: { question: GeneratedQuestion }) {
  return <QuestionShell question={question} label="Fill in Blanks" />;
}
