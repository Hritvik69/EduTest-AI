import { TestRunner } from "@/components/test/test-runner";

export default async function TestPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <TestRunner paperId={id} />;
}
