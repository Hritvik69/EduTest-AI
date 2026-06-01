import type { GeneratedQuestion } from "@/types";
import { QuestionShell } from "./shared";

export function PracticalQuestion({ question }: { question: GeneratedQuestion }) {
  return <QuestionShell question={question} label="Practical" />;
}
