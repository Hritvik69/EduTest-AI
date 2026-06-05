const providerNames = [
  "GroqCloud",
  "Mistral",
  "Cerebras",
  "MiniMax",
  "Gemini",
  "OpenRouter",
  "GitHub Models",
  "Cohere",
  "Cloudflare Workers AI",
  "Grok",
  "DeepSeek",
  "OpenAI",
] as const;

type ProviderHealthStatusLike = {
  provider: string;
  configured: boolean;
  usable: boolean;
  model: string;
  cooldownUntil?: string | null;
  cooldownReason?: string | null;
  cooldownErrorClass?: string | null;
  lastFailureClass?: string | null;
  lastFailure?: string | null;
};

type ProviderHealthSnapshotLike = {
  checkedAt: string;
  task: string;
  providers: ProviderHealthStatusLike[];
  configuredProviders: string[];
  usableProviders: string[];
};

export type PublicAIProviderHealthStatus = {
  provider: string;
  label: string;
  model: string;
  configured: boolean;
  usable: boolean;
  failureClass: string | null;
  failure: string | null;
  cooldownUntil: string | null;
  cooldownReason: string | null;
  cooldownErrorClass: string | null;
};

export type PublicAIProviderHealthSnapshot = {
  checkedAt: string;
  task: string;
  configuredProviders: string[];
  usableProviders: string[];
  providers: PublicAIProviderHealthStatus[];
  summary: string;
  action: string;
};

export function compactAiProviderFailureMessage(message: string) {
  const clean = sanitizeErrorText(message);
  const providerStatuses = providerNames
    .map((provider) => providerFailureStatus(provider, clean))
    .filter((status): status is string => Boolean(status));

  if (providerStatuses.length) {
    return limitMessage(
      `Auto Fallback could not generate right now. ${providerStatuses.join(
        "; ",
      )}. Try again after a minute, lower the question count, or choose a provider with available quota.`,
    );
  }

  return limitMessage(clean);
}

export function publicAIProviderHealthSnapshot(
  snapshot: ProviderHealthSnapshotLike,
): PublicAIProviderHealthSnapshot {
  const providers = snapshot.providers.map((provider) => {
    const failureClass =
      provider.lastFailureClass ?? provider.cooldownErrorClass ?? null;
    const failure =
      provider.lastFailure ??
      provider.cooldownReason ??
      providerHealthFailureText(failureClass, provider.configured);

    return {
      provider: provider.provider,
      label: providerLabel(provider.provider),
      model: provider.model,
      configured: provider.configured,
      usable: provider.usable,
      failureClass,
      failure: failure ? limitMessage(sanitizeErrorText(failure), 180) : null,
      cooldownUntil: provider.cooldownUntil ?? null,
      cooldownReason: provider.cooldownReason
        ? limitMessage(sanitizeErrorText(provider.cooldownReason), 180)
        : null,
      cooldownErrorClass: provider.cooldownErrorClass ?? null,
    };
  });
  const publicSnapshot = {
    checkedAt: snapshot.checkedAt,
    task: snapshot.task,
    configuredProviders: snapshot.configuredProviders,
    usableProviders: snapshot.usableProviders,
    providers,
    summary: "",
    action: "",
  };

  return {
    ...publicSnapshot,
    summary: providerHealthSummary(publicSnapshot),
    action: providerHealthAction(publicSnapshot),
  };
}

export function providerHealthFailureMessage(
  snapshot: ProviderHealthSnapshotLike,
) {
  const publicSnapshot = publicAIProviderHealthSnapshot(snapshot);
  if (!publicSnapshot.configuredProviders.length) {
    return "Set at least one AI provider key before generating papers.";
  }

  const failedConfigured = publicSnapshot.providers.filter(
    (provider) => provider.configured && !provider.usable,
  );
  if (!failedConfigured.length) return publicSnapshot.summary;

  return `All configured AI providers failed. ${failedConfigured
    .map(
      (provider) =>
        `${provider.label}: ${providerHealthFailureLabel(provider)}`,
    )
    .join(" ")}`;
}

export function providerHealthSummary(
  snapshot: Pick<
    PublicAIProviderHealthSnapshot,
    "configuredProviders" | "usableProviders" | "providers"
  >,
) {
  if (!snapshot.configuredProviders.length) {
    return "No production AI provider key is configured.";
  }

  if (snapshot.usableProviders.length) {
    const usable = `Usable providers: ${snapshot.usableProviders
      .map(providerLabel)
      .join(", ")}.`;
    const unavailableConfigured = snapshot.providers
      .filter((provider) => provider.configured && !provider.usable)
      .map((provider) => `${provider.label}: ${providerHealthFailureLabel(provider)}`);

    return unavailableConfigured.length
      ? `${usable} Configured but not usable now: ${unavailableConfigured.join("; ")}.`
      : usable;
  }

  const failed = snapshot.providers
    .filter((provider) => provider.configured && !provider.usable)
    .map((provider) => `${provider.label}: ${providerHealthFailureLabel(provider)}`);

  return failed.length
    ? `No configured provider is usable right now. ${failed.join("; ")}.`
    : "No configured provider is usable right now.";
}

export function providerHealthAction(
  snapshot: Pick<
    PublicAIProviderHealthSnapshot,
    "configuredProviders" | "usableProviders" | "providers"
  >,
) {
  if (snapshot.usableProviders.length) {
    return "Retry generation or keep Auto Fallback selected.";
  }

  if (!snapshot.configuredProviders.length) {
    return "Add GEMINI_API_KEY plus one backup provider key in Vercel Production, then redeploy.";
  }

  const classes = new Set(
    snapshot.providers
      .filter((provider) => provider.configured && !provider.usable)
      .map((provider) => provider.failureClass ?? provider.cooldownErrorClass),
  );

  if (classes.has("auth") || classes.has("missing_key")) {
    return "Fix the invalid or missing provider key in Vercel Production.";
  }
  if (classes.has("quota") || classes.has("rate_limit")) {
    return "Add credits, wait for rate limits, or switch Auto Fallback to a funded provider.";
  }
  if (classes.has("timeout") || classes.has("network") || classes.has("provider_busy")) {
    return "Retry in a minute, keep Auto Fallback enabled, or reduce question count/format variety.";
  }

  return "Check Vercel provider keys/credits, then retry with Auto Fallback.";
}

export function isAIProviderUnavailableError(error: unknown) {
  return isAIProviderUnavailableMessage(errorMessage(error));
}

export function isAIProviderUnavailableMessage(message: string) {
  return /No configured AI provider is currently usable|No AI provider passed health preflight|question generation health preflight failed|All configured AI providers failed|Set .*API_?KEY|Set at least one AI provider key|402|credit|quota|billing|can only afford|max_tokens|401|403|unauthorized|api[_\s-]?key|invalid key|not allowed|permission|429|rate.?limit|503|service unavailable|temporarily|busy|high demand|high traffic|try again soon|overloaded|timeout|timed out|network|fetch failed|ECONNRESET|ENOTFOUND|ETIMEDOUT/i.test(
    message,
  );
}

export function friendlyPdfProcessingError(error: unknown) {
  const message = sanitizeErrorText(errorMessage(error));

  if (/scanned pdf image ocr|ocr failed|local scanned pdf ocr/i.test(message)) {
    return "This scanned PDF needs OCR, but OCR could not finish. Try again, use a clearer scan, or use a text-based PDF if available.";
  }

  if (/too little readable content|scanned images|locked|blank|too short/i.test(message)) {
    return "PDF text extraction produced too little readable content. Use a text-based chapter PDF, or try a clearer file.";
  }

  if (/Unexpected end of JSON|malformed JSON|invalid JSON|empty response/i.test(message)) {
    return "The PDF extraction AI returned invalid output. Try uploading again, use a clearer PDF, or add a more specific PDF focus prompt.";
  }

  if (/rate.?limit|429/i.test(message)) {
    return "The PDF extraction provider is rate-limited right now. Wait a minute and try again.";
  }

  if (/credit|quota|billing|402|can only afford/i.test(message)) {
    return "The PDF extraction provider has no available credits or quota. Choose another configured provider or add credits.";
  }

  if (/api[_\s-]?key|unauthorized|invalid key|not allowed|permission|401|403/i.test(message)) {
    return "The PDF extraction provider key is missing, invalid, or not allowed. Add a valid key or use another provider.";
  }

  if (/timeout|timed out|network|fetch failed|ECONNRESET|ENOTFOUND|ETIMEDOUT/i.test(message)) {
    return "PDF understanding timed out or the provider could not be reached. Try again with a smaller PDF or a steadier connection.";
  }

  return limitMessage(message || "PDF understanding failed.");
}

export function friendlyExportError(error: unknown) {
  const message = sanitizeErrorText(errorMessage(error));

  if (/too large/i.test(message)) {
    return "This paper is too large to export as PDF. Lower the question count or export JSON instead.";
  }

  return "PDF export failed because the saved paper data could not be rendered safely. Try Print, export JSON, or regenerate the paper.";
}

function providerFailureStatus(provider: string, message: string) {
  const chunk = providerFailureChunk(provider, message);
  if (!chunk) return null;
  return `${provider}: ${classifyProviderFailure(chunk)}`;
}

function providerHealthFailureLabel(provider: PublicAIProviderHealthStatus) {
  const failureClass = provider.failureClass ?? provider.cooldownErrorClass;
  if (!provider.configured || failureClass === "missing_key") {
    return "key missing";
  }
  if (failureClass === "auth") return "key missing, invalid, or not allowed";
  if (failureClass === "quota") return "no credits or quota";
  if (failureClass === "rate_limit") return "rate-limited";
  if (failureClass === "timeout") return "timed out";
  if (failureClass === "network") return "network error";
  if (failureClass === "provider_busy") return "temporarily busy";
  return provider.failure ? classifyProviderFailure(provider.failure) : "failed";
}

function providerHealthFailureText(
  failureClass: string | null | undefined,
  configured: boolean,
) {
  if (!configured || failureClass === "missing_key") return "Provider key missing.";
  if (failureClass === "auth") return "Provider key missing, invalid, or not allowed.";
  if (failureClass === "quota") return "Provider has no credits or quota.";
  if (failureClass === "rate_limit") return "Provider is rate-limited.";
  if (failureClass === "timeout") return "Provider timed out.";
  if (failureClass === "network") return "Network error.";
  if (failureClass === "provider_busy") return "Provider is temporarily busy.";
  return null;
}

function providerLabel(provider: string) {
  const labels: Record<string, string> = {
    GEMINI: "Gemini",
    GROQ: "GroqCloud",
    GROK: "Grok",
    MISTRAL: "Mistral",
    CEREBRAS: "Cerebras",
    DEEPSEEK: "DeepSeek",
    MINIMAX: "MiniMax",
    OPENROUTER: "OpenRouter",
    GITHUB_MODELS: "GitHub Models",
    COHERE: "Cohere",
    CLOUDFLARE: "Cloudflare Workers AI",
    OPENAI: "OpenAI",
  };

  return labels[provider] ?? provider;
}

function providerFailureChunk(provider: string, message: string) {
  const start = message.search(new RegExp(`\\b${provider}\\s*:`, "i"));
  if (start < 0) return "";

  const rest = message.slice(start + provider.length + 1);
  const nextStarts = providerNames
    .filter((candidate) => candidate !== provider)
    .map((candidate) => rest.search(new RegExp(`\\b${candidate}\\s*:`, "i")))
    .filter((index) => index >= 0);
  const end = nextStarts.length ? Math.min(...nextStarts) : rest.length;
  return rest.slice(0, end).trim();
}

function classifyProviderFailure(chunk: string) {
  if (/Skipped due to recent failure/i.test(chunk)) {
    return classifyProviderFailure(chunk.replace(/Skipped due to recent failure:?\s*/i, ""));
  }

  if (/rate.?limit|429|Rate limit exceeded/i.test(chunk)) return "rate-limited";
  if (/timeout|timed out|ETIMEDOUT/i.test(chunk)) return "timed out";
  if (/credit|quota|billing|402|can only afford|max_tokens/i.test(chunk)) {
    return "no credits or quota";
  }
  if (/api[_\s-]?key|unauthorized|invalid key|not allowed|permission|401|403/i.test(chunk)) {
    return "key missing, invalid, or not allowed";
  }
  if (/503|service unavailable|temporarily|busy|high demand|high traffic|try again soon|overloaded/i.test(chunk)) {
    return "temporarily busy";
  }
  if (/empty response|invalid JSON|malformed JSON|Unexpected end/i.test(chunk)) {
    return "returned invalid output";
  }
  if (/network|fetch failed|ECONNRESET|ENOTFOUND/i.test(chunk)) {
    return "network error";
  }

  return limitMessage(chunk, 120);
}

function sanitizeErrorText(value: string) {
  return redactSecrets(replaceInlineJsonMessages(value))
    .replace(/\s+/g, " ")
    .trim();
}

function replaceInlineJsonMessages(value: string) {
  return value.replace(/\{[^{}]{2,1200}\}/g, (match) => {
    try {
      const parsed = JSON.parse(match) as { message?: unknown; error?: unknown };
      const message =
        typeof parsed.message === "string"
          ? parsed.message
          : typeof parsed.error === "string"
            ? parsed.error
            : "";
      return message ? `(${message})` : "(provider error)";
    } catch {
      return "(provider error)";
    }
  });
}

function redactSecrets(value: string) {
  return value
    .replace(/\bsk-[A-Za-z0-9_-]{12,}\b/g, "[redacted-key]")
    .replace(/\bxai-[A-Za-z0-9_-]{12,}\b/g, "[redacted-key]")
    .replace(/\bcsk-[A-Za-z0-9_-]{12,}\b/g, "[redacted-key]");
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error ?? "");
}

function limitMessage(value: string, max = 700) {
  return value.length > max ? `${value.slice(0, max - 3)}...` : value;
}
