import type { GeneratedQuestion } from "@/types";
import { QuestionShell } from "./shared";

export function ParagraphQuestion({ question }: { question: GeneratedQuestion }) {
  return <QuestionShell question={question} label="Paragraph" />;
}
