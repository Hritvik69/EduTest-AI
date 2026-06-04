import { jsonSuccess } from "@/lib/api-security";
import { publicAIProviderHealthSnapshot } from "@/lib/error-classification";
import { checkAIProviderHealth } from "@/lib/gemini";

export const runtime = "nodejs";

export async function GET() {
  const health = await checkAIProviderHealth({
    task: "QUESTION_GENERATION",
  });

  return jsonSuccess(publicAIProviderHealthSnapshot(health));
}
