import type { GeneratedQuestion } from "@/types";
import { QuestionShell } from "./shared";

export function AssertionReasonQuestion({ question }: { question: GeneratedQuestion }) {
  return <QuestionShell question={question} label="Assertion-Reason" />;
}
