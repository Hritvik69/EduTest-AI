import { PaperCreatorWizard } from "@/components/wizard/paper-creator-wizard";

export default async function CreateTestPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string }>;
}) {
  const params = await searchParams;
  return (
    <PaperCreatorWizard
      initialSourceMode={params.mode === "pdf" ? "pdf_upload" : "curriculum"}
    />
  );
}
