import type { GeneratedQuestion } from "@/types";
import { QuestionShell } from "./shared";

export function OneWordQuestion({ question }: { question: GeneratedQuestion }) {
  return <QuestionShell question={question} label="One Word" />;
}
