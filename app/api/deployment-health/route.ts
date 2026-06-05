import { neon } from "@neondatabase/serverless";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const providerEnvKeys = {
  GEMINI: "GEMINI_API_KEY",
  GROQ: "GROQ_API_KEY",
  GROK: "XAI_API_KEY",
  MISTRAL: "MISTRAL_API_KEY",
  CEREBRAS: "CEREBRAS_API_KEY",
  DEEPSEEK: "DEEPSEEK_API_KEY",
  MINIMAX: "MINIMAX_API_KEY",
  OPENROUTER: "OPENROUTER_API_KEY",
  GITHUB_MODELS: "GITHUB_MODELS_TOKEN",
  COHERE: "COHERE_API_KEY",
  CLOUDFLARE: "CLOUDFLARE_ACCOUNT_ID+CLOUDFLARE_API_TOKEN",
  OPENAI: "OPENAI_API_KEY",
} as const;

export async function GET() {
  const configuredProviderKeys = Object.entries(providerEnvKeys)
    .filter(([provider]) => isProviderConfigured(provider))
    .map(([provider, envKey]) => ({ provider, envKey }));
  const database = await checkDatabaseReachability();

  return Response.json(
    {
      success: true,
      data: {
        ok: true,
        checkedAt: new Date().toISOString(),
        runtime,
        nodeEnv: process.env.NODE_ENV ?? null,
        vercel: {
          env: process.env.VERCEL_ENV ?? null,
          region: process.env.VERCEL_REGION ?? null,
          commitSha:
            process.env.VERCEL_GIT_COMMIT_SHA ??
            process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA ??
            null,
          commitRef: process.env.VERCEL_GIT_COMMIT_REF ?? null,
        },
        env: {
          databaseConfigured: Boolean(process.env.DATABASE_URL),
          databaseReachable: database.reachable,
          databaseErrorClass: database.errorClass,
          guestSecretConfigured: Boolean(
            process.env.EDUTEST_GUEST_SECRET ?? process.env.NEXTAUTH_SECRET,
          ),
          aiProvider: process.env.AI_PROVIDER ?? "AUTO",
          configuredProviderKeys,
          providerHealthPath: "/api/ai/provider-health",
        },
      },
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}

function isProviderConfigured(provider: string) {
  if (provider === "CLOUDFLARE") {
    return Boolean(
      process.env.CLOUDFLARE_ACCOUNT_ID && process.env.CLOUDFLARE_API_TOKEN,
    );
  }

  const envKey = providerEnvKeys[provider as keyof typeof providerEnvKeys];
  return Boolean(envKey && process.env[envKey]);
}

async function checkDatabaseReachability() {
  const databaseUrl = process.env.DATABASE_URL;
  if (
    !databaseUrl ||
    (!databaseUrl.startsWith("postgres://") &&
      !databaseUrl.startsWith("postgresql://"))
  ) {
    return { reachable: false, errorClass: "not_configured" };
  }

  try {
    const sql = neon(databaseUrl);
    await withTimeout(sql`SELECT 1 AS ok`, 2_500);
    return { reachable: true, errorClass: null };
  } catch (error) {
    return {
      reachable: false,
      errorClass: classifyDatabaseHealthError(error),
    };
  }
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number) {
  return new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error("database health check timed out"));
    }, timeoutMs);

    promise.then(
      (value) => {
        clearTimeout(timeout);
        resolve(value);
      },
      (error) => {
        clearTimeout(timeout);
        reject(error);
      },
    );
  });
}

function classifyDatabaseHealthError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  if (/timeout|timed out|ETIMEDOUT/i.test(message)) return "timeout";
  if (/ECONNRESET|ENOTFOUND|network|fetch failed/i.test(message)) return "network";
  if (/auth|password|permission|not allowed|invalid/i.test(message)) return "auth";
  return "database_error";
}
