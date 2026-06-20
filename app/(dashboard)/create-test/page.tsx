import { PaperCreatorWizard } from "@/components/wizard/paper-creator-wizard";
import type { QuestionGenerationMode } from "@/types";

export default async function CreateTestPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string }>;
}) {
  const params = await searchParams;
  const isPdf = params.mode === "pdf";
  const isInsights = params.mode === "insights";
  return (
    <PaperCreatorWizard
      initialSourceMode={isPdf ? "pdf_upload" : "curriculum"}
      initialGenerationMode={
        isInsights ? ("source_insights" as QuestionGenerationMode) : undefined
      }
    />
  );
}
