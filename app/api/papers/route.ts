import { NextRequest } from "next/server";
import {
  jsonSuccess,
  parseJsonWithSchema,
  rateLimit,
  requireAuthenticatedUser,
} from "@/lib/api-security";
import { buildBlueprint } from "@/lib/blueprint";
import { listPapersForUser } from "@/lib/paper-store";
import { paperConfigSchema } from "@/lib/schemas";

export async function GET(request: NextRequest) {
  const auth = await requireAuthenticatedUser(request);
  if (auth.response) return auth.response;

  const limited = rateLimit(request, `papers:${auth.user.id}`, 60, 60_000, {
    action: "paper list requests",
  });
  if (limited) return limited;

  const papers = await listPapersForUser(auth.user.id);
  return jsonSuccess({ papers });
}

export async function POST(request: NextRequest) {
  const auth = await requireAuthenticatedUser(request);
  if (auth.response) return auth.response;

  const limited = rateLimit(request, `paper-blueprint:${auth.user.id}`, 30, 60_000, {
    action: "paper setup validation requests",
  });
  if (limited) return limited;

  const parsed = await parseJsonWithSchema(request, paperConfigSchema);
  if (parsed.response) return parsed.response;

  return jsonSuccess({
    status: "VALID",
    blueprint: buildBlueprint(parsed.data),
  });
}
