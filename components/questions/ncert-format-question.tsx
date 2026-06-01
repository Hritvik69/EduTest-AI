import type { GeneratedQuestion } from "@/types";
import { QuestionShell } from "./shared";

export function NCERTFormatQuestion({ question }: { question: GeneratedQuestion }) {
  return <QuestionShell question={question} label="NCERT Format" />;
}
