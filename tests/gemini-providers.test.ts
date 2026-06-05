import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const originalEnv = { ...process.env };

describe("multi-provider JSON generation", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
    process.env = { ...originalEnv };
    delete process.env.GEMINI_API_KEY;
    delete process.env.GROQ_API_KEY;
    delete process.env.GROQ_MODEL;
    delete process.env.XAI_API_KEY;
    delete process.env.MISTRAL_API_KEY;
    delete process.env.MISTRAL_MODEL;
    delete process.env.CEREBRAS_API_KEY;
    delete process.env.CEREBRAS_MODEL;
    delete process.env.DEEPSEEK_API_KEY;
    delete process.env.DEEPSEEK_MODEL;
    delete process.env.MINIMAX_API_KEY;
    delete process.env.MINIMAX_MODEL;
    delete process.env.MINIMAX_BASE_URL;
    delete process.env.MINIMAX_CHAT_COMPLETIONS_URL;
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.GITHUB_MODELS_TOKEN;
    delete process.env.GITHUB_MODELS_MODEL;
    delete process.env.COHERE_API_KEY;
    delete process.env.COHERE_MODEL;
    delete process.env.CLOUDFLARE_API_TOKEN;
    delete process.env.CLOUDFLARE_ACCOUNT_ID;
    delete process.env.CLOUDFLARE_WORKERS_AI_MODEL;
    delete process.env.OPENAI_API_KEY;
    delete process.env.AI_PROVIDER;
    delete (globalThis as typeof globalThis & {
      __edutestProviderCooldowns?: unknown;
    }).__edutestProviderCooldowns;
    delete (globalThis as typeof globalThis & {
      __edutestAIUsageLogs?: unknown;
    }).__edutestAIUsageLogs;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    process.env = { ...originalEnv };
  });

  it("sends Grok requests through the xAI chat-completions endpoint", async () => {
    process.env.XAI_API_KEY = "xai-test-key";
    process.env.XAI_MODEL = "grok-4.3";
    const fetchMock = mockJSONFetch({ ok: true });
    const { generateJSON } = await import("@/lib/gemini");

    const result = await generateJSON<{ ok: boolean }>("Return { ok: true }", {
      provider: "GROK",
      systemInstruction: "System rules",
      maxOutputTokens: 1234,
    });

    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.x.ai/v1/chat/completions");
    expect((init?.headers as Record<string, string>).Authorization).toBe(
      "Bearer xai-test-key",
    );
    const body = JSON.parse(String(init?.body));
    expect(body.model).toBe("grok-4.3");
    expect(body.max_tokens).toBe(1234);
    expect(body.messages[0].content).toContain("System rules");
    expect(body.messages[1].content).toBe("Return { ok: true }");
  });

  it("sends GroqCloud requests through the Groq OpenAI-compatible endpoint", async () => {
    process.env.GROQ_API_KEY = "gsk-test-key";
    process.env.GROQ_MODEL = "llama-3.3-70b-versatile";
    const fetchMock = mockJSONFetch({ ok: true });
    const { generateJSON } = await import("@/lib/gemini");

    const result = await generateJSON<{ ok: boolean }>("Return JSON", {
      provider: "GROQ",
      maxOutputTokens: 456,
    });

    expect(result.ok).toBe(true);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.groq.com/openai/v1/chat/completions");
    expect((init?.headers as Record<string, string>).Authorization).toBe(
      "Bearer gsk-test-key",
    );
    const body = JSON.parse(String(init?.body));
    expect(body.model).toBe("llama-3.3-70b-versatile");
    expect(body.max_tokens).toBe(456);
  });

  it("sends OpenRouter requests through the OpenRouter chat-completions endpoint", async () => {
    process.env.OPENROUTER_API_KEY = "sk-or-test-key";
    process.env.OPENROUTER_MODEL = "openrouter/auto";
    process.env.NEXTAUTH_URL = "http://localhost:3000";
    const fetchMock = mockJSONFetch({ routed: true });
    const { generateJSON } = await import("@/lib/gemini");

    const result = await generateJSON<{ routed: boolean }>("Return JSON", {
      provider: "OPENROUTER",
    });

    expect(result.routed).toBe(true);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect((init?.headers as Record<string, string>).Authorization).toBe(
      "Bearer sk-or-test-key",
    );
    expect((init?.headers as Record<string, string>)["HTTP-Referer"]).toBe(
      "http://localhost:3000",
    );
    expect(JSON.parse(String(init?.body)).model).toBe("openrouter/auto");
  });

  it("sends Mistral requests through the Mistral chat-completions endpoint", async () => {
    process.env.MISTRAL_API_KEY = "mistral-test-key";
    process.env.MISTRAL_MODEL = "mistral-small-latest";
    const fetchMock = mockJSONFetch({ ok: true });
    const { generateJSON } = await import("@/lib/gemini");

    const result = await generateJSON<{ ok: boolean }>("Return JSON", {
      provider: "MISTRAL",
      systemInstruction: "System rules",
      maxOutputTokens: 1400,
    });

    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.mistral.ai/v1/chat/completions");
    expect((init?.headers as Record<string, string>).Authorization).toBe(
      "Bearer mistral-test-key",
    );
    const body = JSON.parse(String(init?.body));
    expect(body.model).toBe("mistral-small-latest");
    expect(body.max_tokens).toBe(1400);
    expect(body.messages[0].content).toContain("System rules");
    expect(body.messages[1].content).toBe("Return JSON");
  });

  it("sends Cerebras requests through the Cerebras chat-completions endpoint", async () => {
    process.env.CEREBRAS_API_KEY = "csk-test-key";
    process.env.CEREBRAS_MODEL = "gpt-oss-120b";
    const fetchMock = mockJSONFetch({ ok: true });
    const { generateJSON } = await import("@/lib/gemini");

    const result = await generateJSON<{ ok: boolean }>("Return JSON", {
      provider: "CEREBRAS",
      systemInstruction: "System rules",
      maxOutputTokens: 1500,
    });

    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.cerebras.ai/v1/chat/completions");
    expect((init?.headers as Record<string, string>).Authorization).toBe(
      "Bearer csk-test-key",
    );
    const body = JSON.parse(String(init?.body));
    expect(body.model).toBe("gpt-oss-120b");
    expect(body.max_tokens).toBe(1500);
    expect(body.messages[0].content).toContain("System rules");
    expect(body.messages[1].content).toBe("Return JSON");
  });

  it("sends DeepSeek requests through the DeepSeek chat-completions endpoint", async () => {
    process.env.DEEPSEEK_API_KEY = "deepseek-test-key";
    process.env.DEEPSEEK_MODEL = "deepseek-v4-flash";
    const fetchMock = mockJSONFetch({ ok: true });
    const { generateJSON } = await import("@/lib/gemini");

    const result = await generateJSON<{ ok: boolean }>("Return JSON", {
      provider: "DEEPSEEK",
      systemInstruction: "System rules",
      maxOutputTokens: 1500,
    });

    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.deepseek.com/chat/completions");
    expect((init?.headers as Record<string, string>).Authorization).toBe(
      "Bearer deepseek-test-key",
    );
    const body = JSON.parse(String(init?.body));
    expect(body.model).toBe("deepseek-v4-flash");
    expect(body.max_tokens).toBe(1500);
    expect(body.messages[0].content).toContain("System rules");
    expect(body.messages[1].content).toBe("Return JSON");
  });

  it("sends MiniMax requests through the OpenAI-compatible endpoint", async () => {
    process.env.MINIMAX_API_KEY = "minimax-test-key";
    process.env.MINIMAX_MODEL = "MiniMax-M3";
    const fetchMock = mockJSONFetch({ ok: true });
    const { generateJSON } = await import("@/lib/gemini");

    const result = await generateJSON<{ ok: boolean }>("Return JSON", {
      provider: "MINIMAX",
      systemInstruction: "System rules",
      maxOutputTokens: 1600,
    });

    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.minimax.io/v1/chat/completions");
    expect((init?.headers as Record<string, string>).Authorization).toBe(
      "Bearer minimax-test-key",
    );
    const body = JSON.parse(String(init?.body));
    expect(body.model).toBe("MiniMax-M3");
    expect(body.max_completion_tokens).toBe(1600);
    expect(body.max_tokens).toBeUndefined();
    expect(body.thinking).toEqual({ type: "disabled" });
    expect(body.messages[0].content).toContain("System rules");
    expect(body.messages[1].content).toBe("Return JSON");
  });

  it("sends GitHub Models requests through the GitHub inference endpoint", async () => {
    process.env.GITHUB_MODELS_TOKEN = "github-token-test";
    process.env.GITHUB_MODELS_MODEL = "openai/gpt-4.1";
    const fetchMock = mockJSONFetch({ ok: true });
    const { generateJSON } = await import("@/lib/gemini");

    const result = await generateJSON<{ ok: boolean }>("Return JSON", {
      provider: "GITHUB_MODELS",
    });

    expect(result.ok).toBe(true);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://models.github.ai/inference/chat/completions");
    expect((init?.headers as Record<string, string>).Authorization).toBe(
      "Bearer github-token-test",
    );
    expect((init?.headers as Record<string, string>)["X-GitHub-Api-Version"]).toBe(
      "2026-03-10",
    );
    expect(JSON.parse(String(init?.body)).model).toBe("openai/gpt-4.1");
  });

  it("sends Cloudflare Workers AI requests through the OpenAI-compatible endpoint", async () => {
    process.env.CLOUDFLARE_API_TOKEN = "cf-test-token";
    process.env.CLOUDFLARE_ACCOUNT_ID = "account123";
    process.env.CLOUDFLARE_WORKERS_AI_MODEL = "@cf/meta/llama-3.1-8b-instruct";
    const fetchMock = mockJSONFetch({ ok: true });
    const { generateJSON } = await import("@/lib/gemini");

    const result = await generateJSON<{ ok: boolean }>("Return JSON", {
      provider: "CLOUDFLARE",
    });

    expect(result.ok).toBe(true);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(
      "https://api.cloudflare.com/client/v4/accounts/account123/ai/v1/chat/completions",
    );
    expect((init?.headers as Record<string, string>).Authorization).toBe(
      "Bearer cf-test-token",
    );
    expect(JSON.parse(String(init?.body)).model).toBe(
      "@cf/meta/llama-3.1-8b-instruct",
    );
  });

  it("sends Cohere requests through Chat V2 and parses JSON content", async () => {
    process.env.COHERE_API_KEY = "cohere-test-key";
    process.env.COHERE_MODEL = "command-a-03-2025";
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          message: {
            content: [{ text: JSON.stringify({ ok: true }) }],
          },
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { generateJSON } = await import("@/lib/gemini");

    const result = await generateJSON<{ ok: boolean }>("Return JSON", {
      provider: "COHERE",
    });

    expect(result.ok).toBe(true);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.cohere.com/v2/chat");
    expect((init?.headers as Record<string, string>).Authorization).toBe(
      "Bearer cohere-test-key",
    );
    const body = JSON.parse(String(init?.body));
    expect(body.model).toBe("command-a-03-2025");
    expect(body.response_format).toEqual({ type: "json_object" });
  });

  it("caps OpenRouter max_tokens to a low-cost default", async () => {
    process.env.OPENROUTER_API_KEY = "sk-or-test-key";
    const fetchMock = mockJSONFetch({ routed: true });
    const { generateJSON } = await import("@/lib/gemini");

    await generateJSON<{ routed: boolean }>("Return JSON", {
      provider: "OPENROUTER",
      maxOutputTokens: 5800,
    });

    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(body.max_tokens).toBe(1100);
  });

  it("uses Auto fallback order after skipping unconfigured providers", async () => {
    process.env.MISTRAL_API_KEY = "mistral-test-key";
    process.env.CEREBRAS_API_KEY = "csk-test-key";
    process.env.XAI_API_KEY = "xai-test-key";
    process.env.DEEPSEEK_API_KEY = "deepseek-test-key";
    process.env.OPENROUTER_API_KEY = "sk-or-test-key";
    process.env.OPENAI_API_KEY = "sk-test-key";
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response("busy", {
          status: 503,
        }),
      )
      .mockResolvedValueOnce(chatResponse({ fallback: "openrouter" }));
    vi.stubGlobal("fetch", fetchMock);
    const { generateJSON } = await import("@/lib/gemini");

    const result = await generateJSON<{ fallback: string }>("Return JSON", {
      provider: "AUTO",
    });

    expect(result.fallback).toBe("openrouter");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][0]).toBe("https://api.mistral.ai/v1/chat/completions");
    expect(fetchMock.mock.calls[1][0]).toBe(
      "https://openrouter.ai/api/v1/chat/completions",
    );
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body)).messages[1].content).toBe(
      "Return JSON",
    );
    expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body)).messages[1].content).toBe(
      "Return JSON",
    );
  });

  it("prefers GitHub Models before optional outage-prone providers for question generation", async () => {
    process.env.GITHUB_MODELS_TOKEN = "github-token-test";
    process.env.OPENROUTER_API_KEY = "sk-or-test-key";
    process.env.CEREBRAS_API_KEY = "csk-test-key";
    const fetchMock = mockJSONFetch({ fallback: "github" });
    const { generateJSON } = await import("@/lib/gemini");

    const result = await generateJSON<{ fallback: string }>("Return JSON", {
      provider: "AUTO",
      task: "QUESTION_GENERATION",
    });

    expect(result.fallback).toBe("github");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://models.github.ai/inference/chat/completions",
    );
  });

  it("uses task-specific Auto fallback order for question generation", async () => {
    process.env.GROQ_API_KEY = "gsk-test-key";
    process.env.MISTRAL_API_KEY = "mistral-test-key";
    process.env.CEREBRAS_API_KEY = "csk-test-key";
    process.env.XAI_API_KEY = "xai-test-key";
    process.env.DEEPSEEK_API_KEY = "deepseek-test-key";
    process.env.OPENROUTER_API_KEY = "sk-or-test-key";
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response("busy", {
          status: 503,
        }),
      )
      .mockResolvedValueOnce(
        new Response("busy", {
          status: 503,
        }),
      )
      .mockResolvedValueOnce(chatResponse({ fallback: "openrouter" }));
    vi.stubGlobal("fetch", fetchMock);
    const { generateJSON } = await import("@/lib/gemini");

    const result = await generateJSON<{ fallback: string }>("Return JSON", {
      provider: "AUTO",
      task: "QUESTION_GENERATION",
    });

    expect(result.fallback).toBe("openrouter");
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://api.groq.com/openai/v1/chat/completions",
    );
    expect(fetchMock.mock.calls[1][0]).toBe("https://api.mistral.ai/v1/chat/completions");
    expect(fetchMock.mock.calls[2][0]).toBe("https://openrouter.ai/api/v1/chat/completions");
  });

  it("caps Auto provider attempts when a generation batch is high risk", async () => {
    process.env.GROQ_API_KEY = "gsk-test-key";
    process.env.MISTRAL_API_KEY = "mistral-test-key";
    process.env.CEREBRAS_API_KEY = "csk-test-key";
    const fetchMock = vi.fn().mockResolvedValue(
      new Response("busy", {
        status: 503,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { generateJSON } = await import("@/lib/gemini");

    await expect(
      generateJSON("Return JSON", {
        provider: "AUTO",
        task: "QUESTION_GENERATION",
        maxProviderAttempts: 1,
      }),
    ).rejects.toThrow(/GroqCloud/);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://api.groq.com/openai/v1/chat/completions",
    );
  });

  it("skips provider calls when the server deadline cannot fit an AI attempt", async () => {
    process.env.GROQ_API_KEY = "gsk-test-key";
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { generateJSON } = await import("@/lib/gemini");

    await expect(
      generateJSON("Return JSON", {
        provider: "GROQ",
        deadlineAt: Date.now() + 4_000,
        finalizationReserveMs: 2_500,
      }),
    ).rejects.toThrow(/SERVER_GENERATION_TIME_BUDGET_EXCEEDED/);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reports Grok as configured when XAI_API_KEY exists", async () => {
    process.env.XAI_API_KEY = "xai-test-key";
    const { getAIProviderStatus } = await import("@/lib/gemini");

    expect(getAIProviderStatus()).toMatchObject({
      grok: true,
      grokModel: "grok-4.3",
    });
  });

  it("reports Grok as configured but unusable when xAI rejects the key", async () => {
    process.env.XAI_API_KEY = "xai-test-key";
    const fetchMock = vi.fn().mockResolvedValue(
      new Response("invalid api key", {
        status: 401,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { checkAIProviderHealth } = await import("@/lib/gemini");

    const health = await checkAIProviderHealth({
      task: "QUESTION_GENERATION",
      providers: ["GROK"],
      timeoutMs: 2_000,
    });

    expect(health.providers[0]).toMatchObject({
      provider: "GROK",
      configured: true,
      usable: false,
      lastFailureClass: "auth",
    });
    expect(health.grokUsable).toBe(false);
    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(body.temperature).toBe(0.1);
    expect(body.top_p).toBe(1);
    expect(body.max_tokens).toBe(128);
  });

  it("tries Grok model aliases when the configured xAI model is unavailable", async () => {
    process.env.XAI_API_KEY = "xai-test-key";
    process.env.XAI_MODEL = "unavailable-grok-model";
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response("model not found", {
          status: 404,
        }),
      )
      .mockResolvedValueOnce(chatResponse({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);
    const { generateJSON } = await import("@/lib/gemini");

    await expect(
      generateJSON<{ ok: boolean }>("Return JSON", {
        provider: "GROK",
      }),
    ).resolves.toEqual({ ok: true });

    const firstBody = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    const secondBody = JSON.parse(String(fetchMock.mock.calls[1][1]?.body));
    expect(firstBody.model).toBe("unavailable-grok-model");
    expect(secondBody.model).toBe("grok-4.3");
  });

  it("uses only healthy providers supplied to Auto fallback", async () => {
    process.env.MISTRAL_API_KEY = "mistral-test-key";
    process.env.CEREBRAS_API_KEY = "csk-test-key";
    const fetchMock = mockJSONFetch({ fallback: "cerebras" });
    const { generateJSON } = await import("@/lib/gemini");

    const result = await generateJSON<{ fallback: string }>("Return JSON", {
      provider: "AUTO",
      task: "QUESTION_REPLACEMENT",
      healthyProviders: ["CEREBRAS"],
    });

    expect(result.fallback).toBe("cerebras");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://api.cerebras.ai/v1/chat/completions",
    );
  });

  it("records safe AI usage metadata without storing prompts", async () => {
    process.env.MISTRAL_API_KEY = "mistral-test-key";
    const fetchMock = mockJSONFetch({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
    const { generateJSON } = await import("@/lib/gemini");
    const { summarizeAIUsage } = await import("@/lib/ai-usage-log");

    await generateJSON<{ ok: boolean }>("Return private prompt text", {
      provider: "MISTRAL",
      task: "QUESTION_GENERATION",
      generationJobId: "job-usage-test",
      maxOutputTokens: 500,
    });

    const summary = summarizeAIUsage("job-usage-test");
    expect(summary).toMatchObject({
      totalCalls: 1,
      successCalls: 1,
      failureCalls: 0,
      providersUsed: ["MISTRAL"],
      tasksUsed: ["QUESTION_GENERATION"],
    });
    expect(JSON.stringify(summary)).not.toContain("private prompt text");
  });

  it("keeps provider cooldowns scoped to the failing task", async () => {
    process.env.MISTRAL_API_KEY = "mistral-test-key";
    process.env.CEREBRAS_API_KEY = "csk-test-key";
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response("rate limit exceeded", {
          status: 429,
        }),
      )
      .mockResolvedValueOnce(chatResponse({ fallback: "cerebras" }))
      .mockResolvedValueOnce(chatResponse({ extraction: "mistral" }));
    vi.stubGlobal("fetch", fetchMock);
    const { generateJSON } = await import("@/lib/gemini");

    await expect(
      generateJSON<{ fallback: string }>("Return JSON", {
        provider: "AUTO",
        task: "QUESTION_GENERATION",
      }),
    ).resolves.toEqual({ fallback: "cerebras" });

    await expect(
      generateJSON<{ extraction: string }>("Return JSON", {
        provider: "AUTO",
        task: "PDF_EXTRACTION",
      }),
    ).resolves.toEqual({ extraction: "mistral" });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[2][0]).toBe("https://api.mistral.ai/v1/chat/completions");
  });

  it("keeps provider cooldowns scoped to the requesting user context", async () => {
    process.env.MISTRAL_API_KEY = "mistral-test-key";
    process.env.CEREBRAS_API_KEY = "csk-test-key";
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response("rate limit exceeded", {
          status: 429,
        }),
      )
      .mockResolvedValueOnce(chatResponse({ fallback: "cerebras" }))
      .mockResolvedValueOnce(chatResponse({ fallback: "mistral-user-b" }));
    vi.stubGlobal("fetch", fetchMock);
    const { generateJSON } = await import("@/lib/gemini");

    await expect(
      generateJSON<{ fallback: string }>("Return JSON", {
        provider: "AUTO",
        task: "QUESTION_GENERATION",
        cooldownScope: "user-a",
      }),
    ).resolves.toEqual({ fallback: "cerebras" });

    await expect(
      generateJSON<{ fallback: string }>("Return JSON", {
        provider: "AUTO",
        task: "QUESTION_GENERATION",
        cooldownScope: "user-b",
      }),
    ).resolves.toEqual({ fallback: "mistral-user-b" });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[2][0]).toBe("https://api.mistral.ai/v1/chat/completions");
  });

  it("temporarily skips providers after auth or quota failures in Auto fallback", async () => {
    process.env.MISTRAL_API_KEY = "mistral-test-key";
    process.env.CEREBRAS_API_KEY = "csk-test-key";
    process.env.OPENROUTER_API_KEY = "sk-or-test-key";
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response("not enough credits", {
          status: 402,
        }),
      )
      .mockResolvedValueOnce(chatResponse({ fallback: "openrouter" }))
      .mockResolvedValueOnce(chatResponse({ fallback: "openrouter-second" }));
    vi.stubGlobal("fetch", fetchMock);
    const { generateJSON } = await import("@/lib/gemini");

    await expect(generateJSON<{ fallback: string }>("Return JSON", { provider: "AUTO" }))
      .resolves.toEqual({ fallback: "openrouter" });
    await expect(generateJSON<{ fallback: string }>("Return JSON", { provider: "AUTO" }))
      .resolves.toEqual({ fallback: "openrouter-second" });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[0][0]).toBe("https://api.mistral.ai/v1/chat/completions");
    expect(fetchMock.mock.calls[1][0]).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect(fetchMock.mock.calls[2][0]).toBe("https://openrouter.ai/api/v1/chat/completions");
  });

  it("reports cooldown providers as unhealthy without probing them again", async () => {
    process.env.MISTRAL_API_KEY = "mistral-test-key";
    process.env.CEREBRAS_API_KEY = "csk-test-key";
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response("rate limit exceeded", {
          status: 429,
        }),
      )
      .mockResolvedValueOnce(chatResponse({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);
    const { checkAIProviderHealth, generateJSON } = await import("@/lib/gemini");

    await expect(
      generateJSON("Return JSON", {
        provider: "MISTRAL",
        task: "QUESTION_GENERATION",
        cooldownScope: "user-cooldown",
      }),
    ).rejects.toThrow(/Mistral/);

    const health = await checkAIProviderHealth({
      task: "QUESTION_GENERATION",
      providers: ["MISTRAL", "CEREBRAS"],
      cooldownScope: "user-cooldown",
      timeoutMs: 2_000,
    });

    expect(health.providers[0]).toMatchObject({
      provider: "MISTRAL",
      usable: false,
      lastFailureClass: "rate_limit",
    });
    expect(health.providers[1]).toMatchObject({
      provider: "CEREBRAS",
      usable: true,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][0]).toBe("https://api.mistral.ai/v1/chat/completions");
    expect(fetchMock.mock.calls[1][0]).toBe(
      "https://api.cerebras.ai/v1/chat/completions",
    );
  });

  it("parses valid JSON embedded in provider wrapper text", async () => {
    process.env.OPENAI_API_KEY = "sk-test-key";
    const fetchMock = vi
      .fn()
      .mockResolvedValue(chatResponseText("Here is the JSON:\n[{\"ok\":true}]"));
    vi.stubGlobal("fetch", fetchMock);
    const { generateJSON } = await import("@/lib/gemini");

    const result = await generateJSON<Array<{ ok: boolean }>>("Return JSON", {
      provider: "OPENAI",
    });

    expect(result).toEqual([{ ok: true }]);
  });

  it("reports plain text provider output as invalid JSON", async () => {
    process.env.OPENAI_API_KEY = "sk-test-key";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(chatResponseText("I cannot return JSON.")),
    );
    const { generateJSON } = await import("@/lib/gemini");

    await expect(
      generateJSON("Return JSON", { provider: "OPENAI" }),
    ).rejects.toThrow(/text instead of valid JSON/);
  });

  it("cancels chat-completion requests with the provided signal", async () => {
    process.env.OPENROUTER_API_KEY = "sk-or-test-key";
    const controller = new AbortController();
    controller.abort();
    const abortError = new Error("aborted");
    abortError.name = "AbortError";
    const fetchMock = vi.fn().mockRejectedValue(abortError);
    vi.stubGlobal("fetch", fetchMock);
    const { generateJSON } = await import("@/lib/gemini");

    await expect(
      generateJSON("Return JSON", {
        provider: "OPENROUTER",
        signal: controller.signal,
      }),
    ).rejects.toThrow(/cancelled/);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect((fetchMock.mock.calls[0][1]?.signal as AbortSignal).aborted).toBe(true);
  });

  it("reports provider status without exposing API keys", async () => {
    process.env.XAI_API_KEY = "xai-test-key";
    process.env.GROQ_API_KEY = "gsk-test-key";
    process.env.MISTRAL_API_KEY = "mistral-test-key";
    process.env.CEREBRAS_API_KEY = "csk-test-key";
    process.env.DEEPSEEK_API_KEY = "deepseek-test-key";
    process.env.MINIMAX_API_KEY = "minimax-test-key";
    process.env.OPENROUTER_API_KEY = "sk-or-test-key";
    process.env.GITHUB_MODELS_TOKEN = "github-token-test";
    process.env.COHERE_API_KEY = "cohere-test-key";
    process.env.CLOUDFLARE_API_TOKEN = "cf-test-token";
    process.env.CLOUDFLARE_ACCOUNT_ID = "account123";
    process.env.AI_PROVIDER = "openrouter";
    const { GET } = await import("@/app/api/ai/providers/route");

    const response = await GET();
    const payload = await response.json();

    expect(payload.data.grok).toBe(true);
    expect(payload.data.groq).toBe(true);
    expect(payload.data.mistral).toBe(true);
    expect(payload.data.cerebras).toBe(true);
    expect(payload.data.deepseek).toBe(true);
    expect(payload.data.minimax).toBe(true);
    expect(payload.data.openrouter).toBe(true);
    expect(payload.data.githubModels).toBe(true);
    expect(payload.data.cohere).toBe(true);
    expect(payload.data.cloudflare).toBe(true);
    expect(payload.data.defaultProvider).toBe("OPENROUTER");
    expect(JSON.stringify(payload)).not.toContain("gsk-test-key");
    expect(JSON.stringify(payload)).not.toContain("github-token-test");
    expect(JSON.stringify(payload)).not.toContain("cohere-test-key");
    expect(JSON.stringify(payload)).not.toContain("cf-test-token");
    expect(JSON.stringify(payload)).not.toContain("account123");
    expect(JSON.stringify(payload)).not.toContain("mistral-test-key");
    expect(JSON.stringify(payload)).not.toContain("csk-test-key");
    expect(JSON.stringify(payload)).not.toContain("deepseek-test-key");
    expect(JSON.stringify(payload)).not.toContain("minimax-test-key");
    expect(JSON.stringify(payload)).not.toContain("xai-test-key");
    expect(JSON.stringify(payload)).not.toContain("sk-or-test-key");
  }, 20_000);
});

function mockJSONFetch(content: unknown) {
  const fetchMock = vi.fn().mockResolvedValue(chatResponse(content));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function chatResponse(content: unknown) {
  return chatResponseText(JSON.stringify(content));
}

function chatResponseText(content: string) {
  return new Response(
    JSON.stringify({
      choices: [
        {
          message: {
            content,
          },
        },
      ],
    }),
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    },
  );
}
