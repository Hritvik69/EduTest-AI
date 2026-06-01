import type { GeneratedQuestion } from "@/types";
import { QuestionShell } from "./shared";

export function MatchFollowingQuestion({ question }: { question: GeneratedQuestion }) {
  return <QuestionShell question={question} label="Match the Column" />;
}
