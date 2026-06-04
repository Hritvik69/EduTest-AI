import { GoogleGenerativeAI } from "@google/generative-ai";
import {
  classifyAIUsageError,
  recordAIUsage,
} from "@/lib/ai-usage-log";
import type { AIProvider, AITask } from "@/types";

export type DirectAIProvider = Exclude<AIProvider, "AUTO">;
type ProviderCooldown = {
  until: number;
  reason: string;
  errorClass: string;
};
type ChatCompletionProviderConfig = {
  url: string;
  apiKey: string;
  model: string;
  headers: Record<string, string>;
};

export type AIProviderHealthStatus = {
  provider: DirectAIProvider;
  configured: boolean;
  usable: boolean;
  model: string;
  triedModels?: string[];
  cooldownUntil: string | null;
  cooldownReason: string | null;
  cooldownErrorClass: string | null;
  lastFailureClass: string | null;
  lastFailure: string | null;
};

export type AIProviderHealthSnapshot = {
  checkedAt: string;
  task: AITask;
  providers: AIProviderHealthStatus[];
  configuredProviders: DirectAIProvider[];
  usableProviders: DirectAIProvider[];
  grokUsable: boolean;
};

const autoFallbackOrder: DirectAIProvider[] = [
  "GEMINI",
  "GROQ",
  "MISTRAL",
  "GITHUB_MODELS",
  "OPENROUTER",
  "CEREBRAS",
  "COHERE",
  "CLOUDFLARE",
  "GROK",
  "DEEPSEEK",
  "OPENAI",
];
const taskFallbackOrders: Record<AITask, DirectAIProvider[]> = {
  PDF_EXTRACTION: [
    "GEMINI",
    "MISTRAL",
    "CEREBRAS",
    "DEEPSEEK",
    "OPENROUTER",
    "GITHUB_MODELS",
    "COHERE",
    "CLOUDFLARE",
    "GROQ",
    "GROK",
    "OPENAI",
  ],
  QUESTION_GENERATION: [
    "GEMINI",
    "GROQ",
    "MISTRAL",
    "GITHUB_MODELS",
    "OPENROUTER",
    "CEREBRAS",
    "COHERE",
    "CLOUDFLARE",
    "GROK",
    "DEEPSEEK",
    "OPENAI",
  ],
  QUESTION_REPLACEMENT: [
    "GROQ",
    "CEREBRAS",
    "MISTRAL",
    "GEMINI",
    "OPENROUTER",
    "GITHUB_MODELS",
    "COHERE",
    "CLOUDFLARE",
    "DEEPSEEK",
    "GROK",
    "OPENAI",
  ],
  ANSWER_EVALUATION: [
    "GEMINI",
    "GROQ",
    "MISTRAL",
    "CEREBRAS",
    "DEEPSEEK",
    "OPENROUTER",
    "GITHUB_MODELS",
    "COHERE",
    "CLOUDFLARE",
    "GROK",
    "OPENAI",
  ],
};

const providerLabels: Record<DirectAIProvider, string> = {
  GEMINI: "Gemini",
  GROQ: "GroqCloud",
  GROK: "Grok",
  MISTRAL: "Mistral",
  CEREBRAS: "Cerebras",
  DEEPSEEK: "DeepSeek",
  OPENROUTER: "OpenRouter",
  GITHUB_MODELS: "GitHub Models",
  COHERE: "Cohere",
  CLOUDFLARE: "Cloudflare Workers AI",
  OPENAI: "OpenAI",
};

const globalForProviderCooldowns = globalThis as typeof globalThis & {
  __edutestProviderCooldowns?: Map<string, ProviderCooldown>;
};
const providerCooldowns =
  globalForProviderCooldowns.__edutestProviderCooldowns ??
  new Map<string, ProviderCooldown>();
globalForProviderCooldowns.__edutestProviderCooldowns = providerCooldowns;

let workingGeminiModelName: string | null = process.env.GEMINI_MODEL ?? null;

interface GenerateJSONOptions {
  systemInstruction?: string;
  temperature?: number;
  topP?: number;
  maxOutputTokens?: number;
  provider?: AIProvider;
  task?: AITask;
  cooldownScope?: string;
  generationJobId?: string;
  paperId?: number;
  cacheHit?: boolean;
  healthyProviders?: DirectAIProvider[];
  deadlineAt?: number;
  finalizationReserveMs?: number;
  maxProviderAttempts?: number;
  signal?: AbortSignal;
}

interface GenerateGeminiImageJSONOptions
  extends Pick<
    GenerateJSONOptions,
    "systemInstruction" | "temperature" | "topP" | "maxOutputTokens" | "signal"
  > {}

interface GeminiImagePartInput {
  mimeType: string;
  data: string;
}

const initialGeminiKey = normalizedKey(process.env.GEMINI_API_KEY);

export const geminiFlash = initialGeminiKey
  ? new GoogleGenerativeAI(initialGeminiKey).getGenerativeModel({
      model: workingGeminiModelName ?? candidateGeminiModels()[0],
      generationConfig: { responseMimeType: "application/json" },
    })
  : null;

export async function generateJSON<T = unknown>(
  prompt: string,
  options: GenerateJSONOptions = {},
): Promise<T> {
  const requestedProvider = normalizeProvider(
    options.provider ?? process.env.AI_PROVIDER,
  );
  const hasHealthFilter = Array.isArray(options.healthyProviders);
  const healthyProviderSet = new Set(options.healthyProviders ?? []);
  const configuredProviders = getConfiguredProviders(options.task).filter(
    (provider) => !hasHealthFilter || healthyProviderSet.has(provider),
  );

  if (requestedProvider === "AUTO" && !configuredProviders.length) {
    throw new Error(
      hasHealthFilter
        ? healthPreflightFailureMessage(options.task)
        : "Set at least one AI provider key before generating papers.",
    );
  }

  if (
    requestedProvider !== "AUTO" &&
    hasHealthFilter &&
    !healthyProviderSet.has(requestedProvider)
  ) {
    throw new Error(
      `${providerLabels[requestedProvider]} is not currently usable for ${taskLabel(
        options.task,
      )}. Try Retry Auto, choose another provider, or check provider credits/key access.`,
    );
  }

  const cooldownFailures: Partial<Record<DirectAIProvider, Error>> = {};
  const providersToTry: DirectAIProvider[] =
    requestedProvider === "AUTO"
      ? configuredProviders.filter((provider) => {
          const cooldown = activeProviderCooldown(
            provider,
            options.task,
            options.cooldownScope,
          );
          if (!cooldown) return true;
          cooldownFailures[provider] = new Error(
            `Skipped due to recent failure: ${cooldown.reason}`,
          );
          return false;
        })
      : [requestedProvider];

  if (providersToTry.length === 0 && requestedProvider === "AUTO") {
    throw new Error(formatProviderFailures(cooldownFailures, options.task));
  }

  if (providersToTry.length === 0 || !isConfigured(requestedProvider)) {
    throw new Error(missingProviderKeyMessage(requestedProvider));
  }

  const failures: Partial<Record<DirectAIProvider, Error>> = {
    ...cooldownFailures,
  };
  const attemptLimit = providerAttemptLimit(
    requestedProvider,
    providersToTry.length,
    options.maxProviderAttempts,
  );

  for (const provider of providersToTry.slice(0, attemptLimit)) {
    const startedAt = Date.now();
    try {
      assertProviderAttemptBudget(provider, options);
      const result = await generateProviderJSON<T>(provider, prompt, options);
      await recordAIUsage({
        generationJobId: options.generationJobId,
        paperId: options.paperId,
        task: options.task,
        provider,
        model: modelNameForProvider(provider),
        status: "success",
        durationMs: Date.now() - startedAt,
        promptChars: prompt.length,
        responseChars: responseCharLength(result),
        maxOutputTokens: options.maxOutputTokens,
        cacheHit: options.cacheHit,
      });
      clearProviderCooldown(provider, options.task, options.cooldownScope);
      return result;
    } catch (error) {
      if (isGenerationBudgetError(error)) {
        throw error instanceof Error ? error : new Error(String(error));
      }

      const failureMessage = error instanceof Error ? error.message : String(error);
      await recordAIUsage({
        generationJobId: options.generationJobId,
        paperId: options.paperId,
        task: options.task,
        provider,
        model: modelNameForProvider(provider),
        status: "failure",
        errorClass: classifyAIUsageError(failureMessage),
        durationMs: Date.now() - startedAt,
        promptChars: prompt.length,
        responseChars: 0,
        maxOutputTokens: options.maxOutputTokens,
        cacheHit: options.cacheHit,
      });

      if (isCallerAbort(error, options.signal)) {
        throw error instanceof Error ? error : new Error(String(error));
      }

      failures[provider] =
        error instanceof Error ? error : new Error(String(error));
      rememberProviderFailure(
        provider,
        failures[provider],
        options.task,
        options.cooldownScope,
      );

      if (requestedProvider !== "AUTO") throw failures[provider];
    }
  }

  throw new Error(formatProviderFailures(failures, options.task));
}

export async function generateGeminiImageJSON<T = unknown>(
  prompt: string,
  images: GeminiImagePartInput[],
  options: GenerateGeminiImageJSONOptions = {},
): Promise<T> {
  const apiKey = normalizedKey(process.env.GEMINI_API_KEY);
  let geminiError: unknown;

  if (apiKey) {
    try {
      return await generateGeminiImageJSONDirect(prompt, images, options, apiKey);
    } catch (error) {
      geminiError = error;
    }
  } else {
    geminiError = new Error("GEMINI_API_KEY is not configured.");
  }

  try {
    return await generateOpenAIImageJSON(prompt, images, options);
  } catch (openAIError) {
    const geminiMessage =
      geminiError instanceof Error ? geminiError.message : String(geminiError);
    const openAIMessage =
      openAIError instanceof Error ? openAIError.message : String(openAIError);
    throw new Error(
      `Scanned PDF image OCR failed. Gemini: ${geminiMessage} OpenAI: ${openAIMessage}`,
    );
  }
}

async function generateGeminiImageJSONDirect<T = unknown>(
  prompt: string,
  images: GeminiImagePartInput[],
  options: GenerateGeminiImageJSONOptions,
  apiKey: string,
): Promise<T> {
  const client = new GoogleGenerativeAI(apiKey);
  let lastError: unknown;

  for (const modelName of orderedCandidateModels("GEMINI")) {
    try {
      throwIfAborted(options.signal);
      const model = client.getGenerativeModel({
        model: modelName,
        systemInstruction: options.systemInstruction,
        generationConfig: {
          responseMimeType: "application/json",
          temperature: options.temperature ?? 0.1,
          topP: options.topP ?? 0.8,
          maxOutputTokens: options.maxOutputTokens,
        },
      });
      const result = await withTimeoutAndSignal(
        model.generateContent({
          contents: [
            {
              role: "user",
              parts: [
                { text: prompt },
                ...images.map((image) => ({
                  inlineData: {
                    mimeType: image.mimeType,
                    data: image.data,
                  },
                })),
              ],
            },
          ],
        }),
        aiRequestTimeoutMs("GEMINI"),
        options.signal,
        "Gemini",
      );
      const text = result.response.text();
      workingGeminiModelName = modelName;
      return parseJSONResponse<T>(text);
    } catch (error) {
      lastError = error;
      if (!isRetryableGeminiError(error)) {
        throw error;
      }
    }
  }

  if (lastError instanceof Error) {
    throw new Error(`Gemini scanned PDF OCR failed. Last error: ${lastError.message}`);
  }

  throw new Error("Gemini scanned PDF OCR failed before any model could respond.");
}

async function generateOpenAIImageJSON<T = unknown>(
  prompt: string,
  images: GeminiImagePartInput[],
  options: GenerateGeminiImageJSONOptions,
): Promise<T> {
  const apiKey = normalizedKey(process.env.OPENAI_API_KEY);
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured.");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), aiRequestTimeoutMs("OPENAI"));
  const abortFromCaller = () => controller.abort();

  if (options.signal?.aborted) {
    controller.abort();
  } else {
    options.signal?.addEventListener("abort", abortFromCaller, { once: true });
  }

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.OPENAI_VISION_MODEL ?? process.env.OPENAI_MODEL ?? "gpt-4o-mini",
        temperature: options.temperature ?? 0.1,
        top_p: options.topP ?? 0.8,
        max_tokens: options.maxOutputTokens,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              options.systemInstruction ??
              "You are a strict JSON generator. Return only valid JSON.",
          },
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              ...images.map((image) => ({
                type: "image_url",
                image_url: {
                  url: `data:${image.mimeType};base64,${image.data}`,
                  detail: "high",
                },
              })),
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`OpenAI image OCR failed (${response.status}): ${body.slice(0, 500)}`);
    }

    const body = await response.json();
    const text = body?.choices?.[0]?.message?.content;
    if (typeof text !== "string") {
      throw new Error("OpenAI image OCR returned no text content.");
    }

    return parseJSONResponse<T>(text);
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener("abort", abortFromCaller);
  }
}

async function generateGeminiJSON<T = unknown>(
  prompt: string,
  options: GenerateJSONOptions,
  client: GoogleGenerativeAI,
): Promise<T> {
  let lastError: unknown;
  const modelNames = orderedCandidateModels(options.provider ?? "AUTO");

  for (const modelName of modelNames) {
    for (let attempt = 0; attempt < attemptsForModel(modelName); attempt += 1) {
      try {
        throwIfAborted(options.signal);
        assertProviderAttemptBudget("GEMINI", options);
        if (attempt > 0) {
          await sleep(900 * attempt, options.signal);
        }

        const model = client.getGenerativeModel({
          model: modelName,
          systemInstruction: options.systemInstruction,
          generationConfig: {
            responseMimeType: "application/json",
            temperature: options.temperature ?? 0.4,
            topP: options.topP ?? 0.85,
            maxOutputTokens: options.maxOutputTokens,
          },
        });
        const result = await withTimeoutAndSignal(
          model.generateContent(prompt),
          aiRequestTimeoutMsForBudget("GEMINI", options),
          options.signal,
          "Gemini",
        );
        const text = result.response.text();
        workingGeminiModelName = modelName;

        return parseJSONResponse<T>(text);
      } catch (error) {
        lastError = error;
        if (!isRetryableGeminiError(error)) {
          throw error;
        }
      }
    }
  }

  if (lastError instanceof Error) {
    throw new Error(
      isTransientGeminiError(lastError)
        ? "Gemini is temporarily busy. I tried backup models too. Please retry in a minute."
        : `Gemini generation failed for models: ${modelNames.join(", ")}. Last error: ${lastError.message}`,
    );
  }

  throw new Error("Gemini generation failed before any model could respond.");
}

async function generateChatCompletionJSON<T = unknown>(
  provider: DirectAIProvider,
  prompt: string,
  options: GenerateJSONOptions,
): Promise<T> {
  const config = chatCompletionProviderConfig(provider);
  const models =
    provider === "GROK" ? candidateGrokModels() : [config.model];
  let lastError: unknown;

  for (const model of models) {
    try {
      assertProviderAttemptBudget(provider, options);
      return await generateChatCompletionJSONWithModel<T>(
        provider,
        prompt,
        options,
        { ...config, model },
      );
    } catch (error) {
      lastError = error;
      if (provider !== "GROK" || !isRetryableGrokModelError(error)) {
        throw error;
      }
    }
  }

  if (lastError instanceof Error) {
    throw new Error(
      `Grok generation failed for models: ${models.join(", ")}. Last error: ${lastError.message}`,
    );
  }

  throw new Error("Grok generation failed before any model could respond.");
}

async function generateChatCompletionJSONWithModel<T = unknown>(
  provider: DirectAIProvider,
  prompt: string,
  options: GenerateJSONOptions,
  config: ChatCompletionProviderConfig,
): Promise<T> {
  const controller = new AbortController();
  const requestTimeoutMs = aiRequestTimeoutMsForBudget(provider, options);
  const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);
  const abortFromCaller = () => controller.abort();

  if (options.signal?.aborted) {
    controller.abort();
  } else {
    options.signal?.addEventListener("abort", abortFromCaller, { once: true });
  }

  let response: Response;
  try {
    response = await fetch(config.url, {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
        ...config.headers,
      },
      body: JSON.stringify({
        model: config.model,
        temperature: options.temperature ?? 0.4,
        top_p: options.topP ?? 0.85,
        max_tokens: maxTokensForProvider(provider, options.maxOutputTokens),
        messages: [
          {
            role: "system",
            content: `${options.systemInstruction ?? "You are a strict JSON generator."}

Return ONLY valid JSON. If the requested output is a JSON array of questions,
return an object in this shape instead: { "questions": [...] }.`,
          },
          {
            role: "user",
            content: prompt,
          },
        ],
      }),
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      if (options.signal?.aborted) {
        throw abortSignalError(options.signal);
      }

      throw new Error(
        `${providerLabels[provider]} request timed out after ${Math.round(
          requestTimeoutMs / 1000,
        )} seconds.`,
      );
    }

    throw error;
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener("abort", abortFromCaller);
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `${providerLabels[provider]} generation failed (${response.status}): ${friendlyAIError(body)}`,
    );
  }

  const payload = (await response.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const text = payload.choices?.[0]?.message?.content;

  if (!text) throw new Error(`${providerLabels[provider]} returned an empty response.`);
  return parseJSONResponse<T>(text);
}

async function generateCohereJSON<T = unknown>(
  prompt: string,
  options: GenerateJSONOptions,
): Promise<T> {
  const provider: DirectAIProvider = "COHERE";
  const controller = new AbortController();
  const requestTimeoutMs = aiRequestTimeoutMsForBudget(provider, options);
  const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);
  const abortFromCaller = () => controller.abort();

  if (options.signal?.aborted) {
    controller.abort();
  } else {
    options.signal?.addEventListener("abort", abortFromCaller, { once: true });
  }

  let response: Response;
  try {
    response = await fetch("https://api.cohere.com/v2/chat", {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${requiredKey("COHERE_API_KEY", provider)}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.COHERE_MODEL ?? "command-a-03-2025",
        temperature: options.temperature ?? 0.4,
        p: options.topP ?? 0.85,
        max_tokens: options.maxOutputTokens,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: `${options.systemInstruction ?? "You are a strict JSON generator."}

Return ONLY valid JSON. If the requested output is a JSON array of questions,
return an object in this shape instead: { "questions": [...] }.`,
          },
          {
            role: "user",
            content: prompt,
          },
        ],
      }),
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      if (options.signal?.aborted) {
        throw abortSignalError(options.signal);
      }

      throw new Error(
        `Cohere request timed out after ${Math.round(
          requestTimeoutMs / 1000,
        )} seconds.`,
      );
    }

    throw error;
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener("abort", abortFromCaller);
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `Cohere generation failed (${response.status}): ${friendlyAIError(body)}`,
    );
  }

  const payload = (await response.json()) as {
    message?: { content?: Array<{ text?: string }> };
  };
  const text = payload.message?.content?.find((item) => item.text)?.text;

  if (!text) throw new Error("Cohere returned an empty response.");
  return parseJSONResponse<T>(text);
}

async function generateProviderJSON<T = unknown>(
  provider: DirectAIProvider,
  prompt: string,
  options: GenerateJSONOptions,
) {
  if (provider === "GEMINI") {
    const key = normalizedKey(process.env.GEMINI_API_KEY);
    if (!key) throw new Error(missingProviderKeyMessage(provider));
    return generateGeminiJSON<T>(prompt, options, new GoogleGenerativeAI(key));
  }

  if (provider === "COHERE") {
    return generateCohereJSON<T>(prompt, options);
  }

  return generateChatCompletionJSON<T>(provider, prompt, options);
}

export function getAIProviderStatus() {
  return {
    gemini: isConfigured("GEMINI"),
    groq: isConfigured("GROQ"),
    grok: isConfigured("GROK"),
    mistral: isConfigured("MISTRAL"),
    cerebras: isConfigured("CEREBRAS"),
    deepseek: isConfigured("DEEPSEEK"),
    openrouter: isConfigured("OPENROUTER"),
    githubModels: isConfigured("GITHUB_MODELS"),
    cohere: isConfigured("COHERE"),
    cloudflare: isConfigured("CLOUDFLARE"),
    openai: isConfigured("OPENAI"),
    defaultProvider: normalizeProvider(process.env.AI_PROVIDER ?? "AUTO"),
    geminiModel: candidateGeminiModels()[0],
    groqModel: process.env.GROQ_MODEL ?? "llama-3.3-70b-versatile",
    grokModel: candidateGrokModels()[0],
    grokUsable: null,
    mistralModel: process.env.MISTRAL_MODEL ?? "mistral-small-latest",
    cerebrasModel: process.env.CEREBRAS_MODEL ?? "gpt-oss-120b",
    deepseekModel: process.env.DEEPSEEK_MODEL ?? "deepseek-v4-flash",
    openRouterModel: process.env.OPENROUTER_MODEL ?? "openrouter/auto",
    githubModelsModel: process.env.GITHUB_MODELS_MODEL ?? "openai/gpt-4.1",
    cohereModel: process.env.COHERE_MODEL ?? "command-a-03-2025",
    cloudflareModel:
      process.env.CLOUDFLARE_WORKERS_AI_MODEL ??
      "@cf/meta/llama-3.1-8b-instruct",
    openAIModel: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
    tasks: providerHealthByTask(),
  };
}

export async function checkAIProviderHealth({
  task = "QUESTION_GENERATION",
  providers,
  signal,
  cooldownScope,
  timeoutMs = providerHealthTimeoutMs(),
}: {
  task?: AITask;
  providers?: DirectAIProvider[];
  signal?: AbortSignal;
  cooldownScope?: string;
  timeoutMs?: number;
} = {}): Promise<AIProviderHealthSnapshot> {
  const ordered = providers?.length ? providers : fallbackOrderForTask(task);
  const statuses = await Promise.all(
    ordered.map((provider) =>
      checkSingleProviderHealth(provider, {
        task,
        signal,
        cooldownScope,
        timeoutMs,
      }),
    ),
  );
  const usableSet = new Set(
    statuses
      .filter((status) => status.usable)
      .map((status) => status.provider),
  );
  const configuredSet = new Set(
    statuses
      .filter((status) => status.configured)
      .map((status) => status.provider),
  );

  return {
    checkedAt: new Date().toISOString(),
    task,
    providers: statuses,
    configuredProviders: fallbackOrderForTask(task).filter((provider) =>
      configuredSet.has(provider),
    ),
    usableProviders: fallbackOrderForTask(task).filter((provider) =>
      usableSet.has(provider),
    ),
    grokUsable: Boolean(statuses.find((status) => status.provider === "GROK")?.usable),
  };
}

export function getConfiguredProviders(task?: AITask): DirectAIProvider[] {
  return fallbackOrderForTask(task).filter(isConfigured);
}

async function checkSingleProviderHealth(
  provider: DirectAIProvider,
  {
    task,
    signal,
    cooldownScope,
    timeoutMs,
  }: {
    task: AITask;
    signal?: AbortSignal;
    cooldownScope?: string;
    timeoutMs: number;
  },
): Promise<AIProviderHealthStatus> {
  const cooldown = activeProviderCooldown(provider, task, cooldownScope);
  const base = (): Omit<AIProviderHealthStatus, "usable" | "lastFailureClass" | "lastFailure"> => ({
    provider,
    configured: isConfigured(provider),
    model: modelNameForProvider(provider),
    triedModels: provider === "GROK" ? candidateGrokModels() : undefined,
    cooldownUntil: cooldown ? new Date(cooldown.until).toISOString() : null,
    cooldownReason: cooldown?.reason ?? null,
    cooldownErrorClass: cooldown?.errorClass ?? null,
  });

  if (!isConfigured(provider)) {
    return {
      ...base(),
      usable: false,
      lastFailureClass: "missing_key",
      lastFailure: missingProviderKeyMessage(provider),
    };
  }

  if (cooldown) {
    return {
      ...base(),
      usable: false,
      lastFailureClass: cooldown.errorClass,
      lastFailure: cooldown.reason,
    };
  }

  try {
    const probe = await withProviderHealthTimeout(
      provider,
      task,
      signal,
      timeoutMs,
      (probeSignal) =>
        generateProviderJSON<{ ok?: boolean }>(
          provider,
          "Return {\"ok\": true}",
          {
            provider,
            task,
            temperature: 0.1,
            topP: 1,
            maxOutputTokens: 128,
            cooldownScope,
            signal: probeSignal,
          },
        ),
    );

    if (probe?.ok !== true) {
      throw new Error(`${providerLabels[provider]} health probe returned invalid JSON.`);
    }

    clearProviderCooldown(provider, task, cooldownScope);
    return {
      ...base(),
      usable: true,
      lastFailureClass: null,
      lastFailure: null,
    };
  } catch (error) {
    const failure =
      error instanceof Error ? error : new Error(String(error));
    rememberProviderFailure(provider, failure, task, cooldownScope);
    return {
      ...base(),
      usable: false,
      lastFailureClass: providerFailureClass(failure.message),
      lastFailure: friendlyAIError(failure.message),
    };
  }
}

function fallbackOrderForTask(task?: AITask) {
  return task ? taskFallbackOrders[task] : autoFallbackOrder;
}

function candidateGrokModels() {
  return [
    process.env.XAI_MODEL,
    "grok-4.3",
    "grok-latest",
    "grok",
  ].filter(
    (value, index, array): value is string =>
      Boolean(value) && array.indexOf(value) === index,
  );
}

function orderedCandidateModels(requestedProvider: AIProvider) {
  const models = [
    workingGeminiModelName,
    ...candidateGeminiModels().filter(
      (modelName) => modelName !== workingGeminiModelName,
    ),
  ].filter((value, index, array): value is string => Boolean(value) && array.indexOf(value) === index);
  const configuredLimit = Number(
    requestedProvider === "AUTO"
      ? process.env.GEMINI_AUTO_MODEL_LIMIT
      : process.env.GEMINI_MODEL_LIMIT,
  );
  const defaultLimit = requestedProvider === "AUTO" ? 2 : 3;
  const limit =
    Number.isInteger(configuredLimit) && configuredLimit > 0
      ? Math.min(configuredLimit, models.length)
      : Math.min(defaultLimit, models.length);

  return models.slice(0, limit);
}

function isRetryableGeminiError(error: unknown) {
  if (!(error instanceof Error)) return false;
  if (/401|403|unauthorized|permission|api key|invalid key|not allowed/i.test(error.message)) {
    return false;
  }
  return /404|not found|not supported|503|service unavailable|temporarily|high demand|overloaded|rate.?limit|429|empty response|invalid JSON|malformed JSON|text instead of valid JSON/i.test(
    error.message,
  );
}

function isRetryableGrokModelError(error: unknown) {
  if (!(error instanceof Error)) return false;
  if (
    /401|403|unauthorized|permission|api key|invalid key|not allowed|402|credit|quota|billing/i.test(
      error.message,
    )
  ) {
    return false;
  }

  return /400|404|model|not found|not available|does not exist|unsupported/i.test(
    error.message,
  );
}

function isTransientGeminiError(error: Error) {
  return /503|service unavailable|temporarily|high demand|overloaded|rate.?limit|429/i.test(
    error.message,
  );
}

function attemptsForModel(_modelName: string) {
  const configured = Number(process.env.GEMINI_MODEL_ATTEMPTS);
  if (Number.isInteger(configured) && configured >= 1 && configured <= 3) {
    return configured;
  }

  return 1;
}

function sleep(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortSignalError(signal));
      return;
    }

    const timeout = setTimeout(() => {
      signal?.removeEventListener("abort", abort);
      resolve();
    }, ms);
    const abort = () => {
      clearTimeout(timeout);
      reject(abortSignalError(signal));
    };

    signal?.addEventListener("abort", abort, { once: true });
  });
}

function parseJSONResponse<T>(text: string): T {
  const raw = text.trim();
  if (!raw) {
    throw new Error("AI provider returned an empty response.");
  }

  const direct = tryParseJSON<T>(raw);
  if (direct.ok) return direct.value;

  const cleaned = raw.replace(/```(?:json)?/gi, "").replace(/```/g, "").trim();
  const unfenced = tryParseJSON<T>(cleaned);
  if (unfenced.ok) return unfenced.value;

  const embedded = extractFirstJSONValue(cleaned);
  if (!embedded) {
    throw new Error("AI provider returned text instead of valid JSON.");
  }

  const embeddedParsed = tryParseJSON<T>(embedded);
  if (embeddedParsed.ok) return embeddedParsed.value;

  throw new Error("AI provider returned malformed JSON.");
}

function tryParseJSON<T>(text: string):
  | { ok: true; value: T }
  | { ok: false } {
  try {
    return { ok: true, value: JSON.parse(text) as T };
  } catch {
    return { ok: false };
  }
}

function extractFirstJSONValue(text: string) {
  const start = text.search(/[\[{]/);
  if (start < 0) return null;

  const stack: string[] = [];
  let inString = false;
  let escaped = false;

  for (let index = start; index < text.length; index += 1) {
    const char = text[index];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === "\"") {
        inString = false;
      }
      continue;
    }

    if (char === "\"") {
      inString = true;
      continue;
    }

    if (char === "{" || char === "[") {
      stack.push(char === "{" ? "}" : "]");
      continue;
    }

    if (char === "}" || char === "]") {
      const expected = stack.pop();
      if (expected !== char) return null;
      if (!stack.length) return text.slice(start, index + 1);
    }
  }

  return null;
}

function friendlyAIError(message: string) {
  if (/abort|timeout|timed out|ETIMEDOUT/i.test(message)) {
    return "provider timed out.";
  }

  if (/503|service unavailable|high demand|high traffic|overloaded|busy|try again soon|temporarily/i.test(message)) {
    return "provider is temporarily busy.";
  }

  if (/401|403|unauthorized|permission|api key/i.test(message)) {
    return "API key is missing, invalid, or not allowed.";
  }

  if (/402|credit|quota|billing|can only afford|max_tokens/i.test(message)) {
    return "not enough provider credits for the requested output. Try Retry Auto, choose Mistral/Gemini/OpenRouter, lower the question count, or add provider credits.";
  }

  return message.slice(0, 500);
}

function activeProviderCooldown(
  provider: DirectAIProvider,
  task?: AITask,
  scope?: string,
) {
  const key = providerCooldownKey(provider, task, scope);
  const cooldown = providerCooldowns.get(key);
  if (!cooldown) return null;
  if (cooldown.until > Date.now()) return cooldown;
  providerCooldowns.delete(key);
  return null;
}

function clearProviderCooldown(
  provider: DirectAIProvider,
  task?: AITask,
  scope?: string,
) {
  providerCooldowns.delete(providerCooldownKey(provider, task, scope));
}

function rememberProviderFailure(
  provider: DirectAIProvider,
  error: Error,
  task?: AITask,
  scope?: string,
) {
  const duration = providerCooldownMs(error.message);
  if (!duration) return;
  providerCooldowns.set(providerCooldownKey(provider, task, scope), {
    until: Date.now() + duration,
    reason: friendlyAIError(error.message),
    errorClass: providerFailureClass(error.message),
  });
}

function providerCooldownKey(
  provider: DirectAIProvider,
  task?: AITask,
  scope?: string,
) {
  return `${normalizeCooldownScope(scope)}:${task ?? "GENERAL"}:${provider}`;
}

function normalizeCooldownScope(scope?: string) {
  const normalized = String(scope ?? "global").replace(/[^a-zA-Z0-9:_-]/g, "");
  return normalized.slice(0, 80) || "global";
}

function providerCooldownMs(message: string) {
  if (/401|403|unauthorized|permission|api key|invalid key|not allowed/i.test(message)) {
    return 30 * 60 * 1000;
  }

  if (/402|credit|quota|billing|can only afford|max_tokens/i.test(message)) {
    return 20 * 60 * 1000;
  }

  if (/429|rate.?limit/i.test(message)) {
    return 5 * 60 * 1000;
  }

  if (/abort|timeout|timed out|503|service unavailable|high demand|high traffic|overloaded|busy|try again soon|temporarily|network|fetch failed|ECONNRESET|ENOTFOUND|ETIMEDOUT/i.test(message)) {
    return 2 * 60 * 1000;
  }

  return 0;
}

function providerFailureClass(message: string) {
  if (/401|403|unauthorized|permission|api key|invalid key|not allowed/i.test(message)) {
    return "auth";
  }
  if (/402|credit|quota|billing|can only afford|max_tokens/i.test(message)) {
    return "quota";
  }
  if (/429|rate.?limit/i.test(message)) return "rate_limit";
  if (/abort|timeout|timed out|ETIMEDOUT/i.test(message)) return "timeout";
  if (/503|service unavailable|high demand|high traffic|overloaded|busy|try again soon|temporarily/i.test(message)) {
    return "provider_busy";
  }
  if (/network|fetch failed|ECONNRESET|ENOTFOUND|ETIMEDOUT/i.test(message)) {
    return "network";
  }
  return "unknown";
}

function maxTokensForProvider(
  provider: DirectAIProvider,
  requested: number | undefined,
) {
  if (provider !== "OPENROUTER" || !requested) return requested;

  return Math.min(requested, openRouterMaxOutputTokens());
}

function openRouterMaxOutputTokens() {
  const configured = Number(process.env.OPENROUTER_MAX_OUTPUT_TOKENS);
  if (Number.isInteger(configured) && configured >= 600 && configured <= 4096) {
    return configured;
  }

  return 1100;
}

function normalizeProvider(value: string | AIProvider | undefined): AIProvider {
  const normalized = String(value ?? "AUTO").toUpperCase();
  if (normalized === "GEMINI") return "GEMINI";
  if (normalized === "GROQ" || normalized === "GROQCLOUD") return "GROQ";
  if (normalized === "GROK" || normalized === "XAI") return "GROK";
  if (normalized === "MISTRAL") return "MISTRAL";
  if (normalized === "CEREBRAS") return "CEREBRAS";
  if (normalized === "DEEPSEEK" || normalized === "DEEP_SEEK") return "DEEPSEEK";
  if (normalized === "OPENROUTER" || normalized === "OPEN_ROUTER") {
    return "OPENROUTER";
  }
  if (normalized === "GITHUB_MODELS" || normalized === "GITHUB") {
    return "GITHUB_MODELS";
  }
  if (normalized === "COHERE") return "COHERE";
  if (normalized === "CLOUDFLARE" || normalized === "WORKERS_AI") {
    return "CLOUDFLARE";
  }
  if (normalized === "OPENAI") return "OPENAI";
  return "AUTO";
}

function candidateGeminiModels() {
  return [
    process.env.GEMINI_MODEL,
    "gemini-2.5-flash",
    "gemini-flash-latest",
    "gemini-2.0-flash",
    "gemini-2.0-flash-lite",
  ].filter(
    (value, index, array): value is string =>
      Boolean(value) && array.indexOf(value) === index,
  );
}

function chatCompletionProviderConfig(
  provider: DirectAIProvider,
): ChatCompletionProviderConfig {
  if (provider === "GROQ") {
    return {
      url: "https://api.groq.com/openai/v1/chat/completions",
      apiKey: requiredKey("GROQ_API_KEY", provider),
      model: process.env.GROQ_MODEL ?? "llama-3.3-70b-versatile",
      headers: {},
    };
  }

  if (provider === "GROK") {
    return {
      url: "https://api.x.ai/v1/chat/completions",
      apiKey: requiredKey("XAI_API_KEY", provider),
      model: process.env.XAI_MODEL ?? "grok-4.3",
      headers: {},
    };
  }

  if (provider === "MISTRAL") {
    return {
      url: "https://api.mistral.ai/v1/chat/completions",
      apiKey: requiredKey("MISTRAL_API_KEY", provider),
      model: process.env.MISTRAL_MODEL ?? "mistral-small-latest",
      headers: {},
    };
  }

  if (provider === "CEREBRAS") {
    return {
      url: "https://api.cerebras.ai/v1/chat/completions",
      apiKey: requiredKey("CEREBRAS_API_KEY", provider),
      model: process.env.CEREBRAS_MODEL ?? "gpt-oss-120b",
      headers: {},
    };
  }

  if (provider === "DEEPSEEK") {
    return {
      url: "https://api.deepseek.com/chat/completions",
      apiKey: requiredKey("DEEPSEEK_API_KEY", provider),
      model: process.env.DEEPSEEK_MODEL ?? "deepseek-v4-flash",
      headers: {},
    };
  }

  if (provider === "OPENROUTER") {
    return {
      url: "https://openrouter.ai/api/v1/chat/completions",
      apiKey: requiredKey("OPENROUTER_API_KEY", provider),
      model: process.env.OPENROUTER_MODEL ?? "openrouter/auto",
      headers: openRouterHeaders(),
    };
  }

  if (provider === "GITHUB_MODELS") {
    return {
      url: "https://models.github.ai/inference/chat/completions",
      apiKey: requiredKey("GITHUB_MODELS_TOKEN", provider),
      model: process.env.GITHUB_MODELS_MODEL ?? "openai/gpt-4.1",
      headers: {
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2026-03-10",
      },
    };
  }

  if (provider === "CLOUDFLARE") {
    const accountId = requiredEnvValue("CLOUDFLARE_ACCOUNT_ID", provider);
    return {
      url: `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/v1/chat/completions`,
      apiKey: requiredKey("CLOUDFLARE_API_TOKEN", provider),
      model:
        process.env.CLOUDFLARE_WORKERS_AI_MODEL ??
        "@cf/meta/llama-3.1-8b-instruct",
      headers: {},
    };
  }

  return {
    url: "https://api.openai.com/v1/chat/completions",
    apiKey: requiredKey("OPENAI_API_KEY", provider),
    model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
    headers: {},
  };
}

function openRouterHeaders() {
  const referer = process.env.NEXTAUTH_URL ?? process.env.NEXT_PUBLIC_APP_URL;
  return {
    ...(referer ? { "HTTP-Referer": referer } : {}),
    "X-Title": "EduTest.AI",
  };
}

function isConfigured(provider: AIProvider) {
  if (provider === "AUTO") return getConfiguredProviders().length > 0;
  return Boolean(providerKey(provider));
}

function providerKey(provider: DirectAIProvider) {
  if (provider === "GEMINI") return normalizedKey(process.env.GEMINI_API_KEY);
  if (provider === "GROQ") return normalizedKey(process.env.GROQ_API_KEY);
  if (provider === "GROK") return normalizedKey(process.env.XAI_API_KEY);
  if (provider === "MISTRAL") return normalizedKey(process.env.MISTRAL_API_KEY);
  if (provider === "CEREBRAS") {
    return normalizedKey(process.env.CEREBRAS_API_KEY);
  }
  if (provider === "DEEPSEEK") {
    return normalizedKey(process.env.DEEPSEEK_API_KEY);
  }
  if (provider === "OPENROUTER") {
    return normalizedKey(process.env.OPENROUTER_API_KEY);
  }
  if (provider === "GITHUB_MODELS") {
    return normalizedKey(process.env.GITHUB_MODELS_TOKEN);
  }
  if (provider === "COHERE") return normalizedKey(process.env.COHERE_API_KEY);
  if (provider === "CLOUDFLARE") {
    return normalizedKey(process.env.CLOUDFLARE_API_TOKEN) &&
      process.env.CLOUDFLARE_ACCOUNT_ID?.trim()
      ? normalizedKey(process.env.CLOUDFLARE_API_TOKEN)
      : null;
  }
  return normalizedKey(process.env.OPENAI_API_KEY);
}

function requiredKey(envName: string, provider: DirectAIProvider) {
  const key = normalizedKey(process.env[envName]);
  if (!key) throw new Error(missingProviderKeyMessage(provider));
  return key;
}

function requiredEnvValue(envName: string, provider: DirectAIProvider) {
  const value = process.env[envName]?.trim();
  if (!value) throw new Error(missingProviderKeyMessage(provider));
  return value;
}

function normalizedKey(value: string | undefined) {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  if (/^(your_|sk-your|xai-your|sk-or-your|placeholder)/i.test(trimmed)) {
    return null;
  }
  return trimmed;
}

function aiRequestTimeoutMs(provider?: DirectAIProvider | "GEMINI") {
  const providerSpecific = provider
    ? Number(process.env[`${provider}_REQUEST_TIMEOUT_MS`])
    : NaN;
  if (Number.isFinite(providerSpecific) && providerSpecific >= 5_000) {
    return providerSpecific;
  }

  const configured = Number(process.env.AI_REQUEST_TIMEOUT_MS);
  if (Number.isFinite(configured) && configured >= 5_000) return configured;

  if (provider === "MISTRAL" || provider === "CEREBRAS") return 14_000;
  if (
    provider === "OPENROUTER" ||
    provider === "OPENAI" ||
    provider === "GITHUB_MODELS" ||
    provider === "COHERE" ||
    provider === "CLOUDFLARE"
  ) {
    return 12_000;
  }
  if (provider === "GROQ") return 10_000;
  if (provider === "DEEPSEEK") return 10_000;

  return 10_000;
}

function aiRequestTimeoutMsForBudget(
  provider: DirectAIProvider | "GEMINI",
  options: Pick<GenerateJSONOptions, "deadlineAt" | "finalizationReserveMs">,
) {
  const baseTimeout = aiRequestTimeoutMs(provider);
  const remainingForProvider = remainingProviderAttemptMs(options);
  if (remainingForProvider === undefined) return baseTimeout;

  return Math.max(2_000, Math.min(baseTimeout, remainingForProvider));
}

function assertProviderAttemptBudget(
  provider: DirectAIProvider | "GEMINI",
  options: Pick<GenerateJSONOptions, "deadlineAt" | "finalizationReserveMs">,
) {
  const remainingForProvider = remainingProviderAttemptMs(options);
  if (remainingForProvider === undefined) return;

  const requiredMs = Math.min(
    aiRequestTimeoutMs(provider),
    providerAttemptReserveMs(),
  );
  if (remainingForProvider < requiredMs) {
    throw generationBudgetError(
      `only ${Math.max(0, Math.round(remainingForProvider / 1000))}s remain for AI work`,
    );
  }
}

function remainingProviderAttemptMs({
  deadlineAt,
  finalizationReserveMs,
}: Pick<GenerateJSONOptions, "deadlineAt" | "finalizationReserveMs">) {
  if (!deadlineAt || !Number.isFinite(deadlineAt)) return undefined;
  const reserve = Math.max(0, finalizationReserveMs ?? 0);
  return deadlineAt - Date.now() - reserve - 1_000;
}

function providerAttemptReserveMs() {
  const configured = Number(process.env.EDUTEST_PROVIDER_ATTEMPT_RESERVE_MS);
  if (Number.isFinite(configured) && configured >= 3_000 && configured <= 14_000) {
    return configured;
  }

  return 6_500;
}

function providerAttemptLimit(
  requestedProvider: AIProvider,
  providerCount: number,
  configured?: number,
) {
  if (requestedProvider !== "AUTO") return providerCount;
  if (typeof configured !== "number" || !Number.isFinite(configured)) {
    return providerCount;
  }
  return Math.max(1, Math.min(providerCount, Math.floor(configured)));
}

function generationBudgetError(detail?: string) {
  return new Error(
    `SERVER_GENERATION_TIME_BUDGET_EXCEEDED: Server time budget is too low to start another AI provider attempt${detail ? ` (${detail})` : ""}.`,
  );
}

function isGenerationBudgetError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /SERVER_GENERATION_TIME_BUDGET_EXCEEDED|server time budget is too low/i.test(
    message,
  );
}

function isCallerAbort(error: unknown, signal?: AbortSignal) {
  if (!signal?.aborted) return false;
  if (error instanceof Error && error.name === "AbortError") return true;
  const message = error instanceof Error ? error.message : String(error);
  return /Generation cancelled by client|SERVER_GENERATION_TIME_BUDGET_EXCEEDED|Vercel function time budget/i.test(
    message,
  );
}

function abortSignalError(signal?: AbortSignal) {
  const reason = signal?.reason as unknown;
  if (reason instanceof Error) {
    if (reason.name === "AbortError" || /operation was aborted/i.test(reason.message)) {
      return new Error("Generation cancelled by client.");
    }
    return reason;
  }
  if (typeof reason === "string" && reason.trim()) {
    return new Error(reason);
  }
  return new Error("Generation cancelled by client.");
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw abortSignalError(signal);
  }
}

function withTimeoutAndSignal<T>(
  promise: Promise<T>,
  timeoutMs: number,
  signal: AbortSignal | undefined,
  providerName: string,
) {
  return new Promise<T>((resolve, reject) => {
    throwIfAborted(signal);

    const timeout = setTimeout(() => {
      cleanup();
      reject(
        new Error(
          `${providerName} request timed out after ${Math.round(timeoutMs / 1000)} seconds.`,
        ),
      );
    }, timeoutMs);
    const abort = () => {
      cleanup();
      reject(abortSignalError(signal));
    };
    const cleanup = () => {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", abort);
    };

    signal?.addEventListener("abort", abort, { once: true });
    promise.then(
      (value) => {
        cleanup();
        resolve(value);
      },
      (error) => {
        cleanup();
        reject(error);
      },
    );
  });
}

function withProviderHealthTimeout<T>(
  provider: DirectAIProvider,
  task: AITask,
  signal: AbortSignal | undefined,
  timeoutMs: number,
  run: (signal: AbortSignal) => Promise<T>,
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort(
      new Error(
        `${providerLabels[provider]} health preflight timed out after ${Math.round(
          timeoutMs / 1000,
        )} seconds.`,
      ),
    );
  }, timeoutMs);
  const abortFromCaller = () => controller.abort(abortSignalError(signal));

  if (signal?.aborted) {
    controller.abort(abortSignalError(signal));
  } else {
    signal?.addEventListener("abort", abortFromCaller, { once: true });
  }

  return run(controller.signal).finally(() => {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", abortFromCaller);
  }).catch((error) => {
    if (
      error instanceof Error &&
      /Generation cancelled by client|SERVER_GENERATION_TIME_BUDGET_EXCEEDED|Vercel function time budget/i.test(
        error.message,
      )
    ) {
      throw error;
    }
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `${providerLabels[provider]} ${taskLabel(task)} health preflight failed: ${message}`,
    );
  });
}

function providerHealthTimeoutMs() {
  const configured = Number(process.env.AI_PROVIDER_HEALTH_TIMEOUT_MS);
  if (Number.isInteger(configured) && configured >= 1_500 && configured <= 15_000) {
    return configured;
  }

  return 8_500;
}

function healthPreflightFailureMessage(task?: AITask) {
  return `No configured AI provider is currently usable for ${taskLabel(
    task,
  )}. Check provider keys/credits, wait for timeout cooldowns, or choose a provider with available quota.`;
}

function taskLabel(task?: AITask) {
  if (task === "QUESTION_REPLACEMENT") return "question repair";
  if (task === "QUESTION_GENERATION") return "question generation";
  if (task === "PDF_EXTRACTION") return "PDF extraction";
  if (task === "ANSWER_EVALUATION") return "answer evaluation";
  return "this task";
}

function missingProviderKeyMessage(provider: AIProvider) {
  if (provider === "AUTO") {
    return "Set at least one AI provider key before generating papers.";
  }

  const envNames: Record<DirectAIProvider, string> = {
    GEMINI: "GEMINI_API_KEY",
    GROQ: "GROQ_API_KEY",
    GROK: "XAI_API_KEY",
    MISTRAL: "MISTRAL_API_KEY",
    CEREBRAS: "CEREBRAS_API_KEY",
    DEEPSEEK: "DEEPSEEK_API_KEY",
    OPENROUTER: "OPENROUTER_API_KEY",
    GITHUB_MODELS: "GITHUB_MODELS_TOKEN",
    COHERE: "COHERE_API_KEY",
    CLOUDFLARE: "CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID",
    OPENAI: "OPENAI_API_KEY",
  };

  return `Set ${envNames[provider]} before using ${providerLabels[provider]}.`;
}

function formatProviderFailures(
  failures: Partial<Record<DirectAIProvider, Error>>,
  task?: AITask,
) {
  const parts = fallbackOrderForTask(task)
    .filter((provider) => failures[provider])
    .map(
      (provider) =>
        `${providerLabels[provider]}: ${friendlyAIError(
          failures[provider]?.message ?? "failed",
        )}`,
    );

  return `All configured AI providers failed. ${parts.join(" ")}`;
}

function responseCharLength(value: unknown) {
  try {
    return JSON.stringify(value)?.length ?? 0;
  } catch {
    return 0;
  }
}

function providerHealthByTask() {
  const tasks: AITask[] = [
    "PDF_EXTRACTION",
    "QUESTION_GENERATION",
    "QUESTION_REPLACEMENT",
    "ANSWER_EVALUATION",
  ];

  return Object.fromEntries(
    tasks.map((task) => [
      task,
      fallbackOrderForTask(task).map((provider) => {
        const cooldown = activeProviderCooldown(provider, task);
        return {
          provider,
          configured: isConfigured(provider),
          model: modelNameForProvider(provider),
          cooldownUntil: cooldown ? new Date(cooldown.until).toISOString() : null,
          cooldownReason: cooldown?.reason ?? null,
          cooldownErrorClass: cooldown?.errorClass ?? null,
        };
      }),
    ]),
  );
}

function modelNameForProvider(provider: DirectAIProvider) {
  if (provider === "GEMINI") return candidateGeminiModels()[0];
  if (provider === "GROQ") {
    return process.env.GROQ_MODEL ?? "llama-3.3-70b-versatile";
  }
  if (provider === "GROK") return candidateGrokModels()[0];
  if (provider === "MISTRAL") {
    return process.env.MISTRAL_MODEL ?? "mistral-small-latest";
  }
  if (provider === "CEREBRAS") {
    return process.env.CEREBRAS_MODEL ?? "gpt-oss-120b";
  }
  if (provider === "DEEPSEEK") {
    return process.env.DEEPSEEK_MODEL ?? "deepseek-v4-flash";
  }
  if (provider === "OPENROUTER") {
    return process.env.OPENROUTER_MODEL ?? "openrouter/auto";
  }
  if (provider === "GITHUB_MODELS") {
    return process.env.GITHUB_MODELS_MODEL ?? "openai/gpt-4.1";
  }
  if (provider === "COHERE") return process.env.COHERE_MODEL ?? "command-a-03-2025";
  if (provider === "CLOUDFLARE") {
    return (
      process.env.CLOUDFLARE_WORKERS_AI_MODEL ??
      "@cf/meta/llama-3.1-8b-instruct"
    );
  }
  return process.env.OPENAI_MODEL ?? "gpt-4o-mini";
}
