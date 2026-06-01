import { jsonSuccess } from "@/lib/api-security";
import { getAIProviderStatus } from "@/lib/gemini";

export async function GET() {
  return jsonSuccess(getAIProviderStatus());
}
