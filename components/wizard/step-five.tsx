"use client";

import * as React from "react";
import { Check, Cpu, Globe2, RefreshCw, Sparkles, Zap } from "lucide-react";
import { Card } from "@/components/ui/card";
import { fetchApiData } from "@/lib/api-client";
import {
  providerHealthAction,
  providerHealthSummary,
  type PublicAIProviderHealthSnapshot,
  type PublicAIProviderHealthStatus,
} from "@/lib/error-classification";
import { cn } from "@/lib/utils";
import type { AIProvider } from "@/types";
import { usePaperConfig } from "./paper-config-context";

type ProviderStatus = {
  gemini: boolean;
  groq: boolean;
  grok: boolean;
  mistral: boolean;
  deepseek: boolean;
  minimax: boolean;
  openrouter: boolean;
  githubModels: boolean;
  cohere: boolean;
  cloudflare: boolean;
  openai: boolean;
  cerebras: boolean;
  defaultProvider: string;
  geminiModel: string;
  groqModel: string;
  grokModel: string;
  mistralModel: string;
  cerebrasModel: string;
  deepseekModel: string;
  miniMaxModel: string;
  openRouterModel: string;
  githubModelsModel: string;
  cohereModel: string;
  cloudflareModel: string;
  openAIModel: string;
};

const providerCards: {
  provider: AIProvider;
  title: string;
  description: string;
  detail: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  {
    provider: "AUTO",
    title: "Auto Fallback",
    description:
      "Try healthy providers first, including MiniMax when it is configured, then continue the fallback chain.",
    detail: "Skips recently failed providers to reduce wasted API calls.",
    icon: RefreshCw,
  },
  {
    provider: "MINIMAX",
    title: "MiniMax Only",
    description: "Use MiniMax for every generated question.",
    detail: "OpenAI-compatible JSON path with thinking disabled.",
    icon: Sparkles,
  },
  {
    provider: "GROQ",
    title: "GroqCloud Only",
    description: "Use GroqCloud for every generated question.",
    detail: "Best free-speed choice for quick repair and final replacement calls.",
    icon: Zap,
  },
  {
    provider: "GEMINI",
    title: "Gemini Only",
    description: "Use Google Gemini for every generated question.",
    detail: "Good when you want the free Gemini path.",
    icon: Sparkles,
  },
  {
    provider: "MISTRAL",
    title: "Mistral Only",
    description: "Use Mistral AI for every generated question.",
    detail: "Good for fast structured JSON generation.",
    icon: Sparkles,
  },
  {
    provider: "CEREBRAS",
    title: "Cerebras Only",
    description: "Use Cerebras for every generated question.",
    detail: "Good for fast high-throughput structured generation.",
    icon: Cpu,
  },
  {
    provider: "GROK",
    title: "xAI Grok Only",
    description: "Use xAI Grok for every generated question.",
    detail: "Good for reasoning-heavy drafts when your xAI key is active.",
    icon: Zap,
  },
  {
    provider: "OPENROUTER",
    title: "OpenRouter Only",
    description: "Use OpenRouter model routing for every generated question.",
    detail: "Good when you want model routing flexibility.",
    icon: Globe2,
  },
  {
    provider: "GITHUB_MODELS",
    title: "GitHub Models",
    description: "Use GitHub Models for every generated question.",
    detail: "Good as another free API bucket when your token has models:read.",
    icon: Globe2,
  },
  {
    provider: "COHERE",
    title: "Cohere Only",
    description: "Use Cohere Chat V2 for every generated question.",
    detail: "Needs a real Cohere trial or production API key.",
    icon: Sparkles,
  },
  {
    provider: "CLOUDFLARE",
    title: "Cloudflare AI",
    description: "Use Cloudflare Workers AI for every generated question.",
    detail: "Needs both account ID and Workers AI token.",
    icon: Cpu,
  },
];

export function StepFive() {
  const { config, updateConfig } = usePaperConfig();
  const [status, setStatus] = React.useState<ProviderStatus | null>(null);
  const [health, setHealth] =
    React.useState<PublicAIProviderHealthSnapshot | null>(null);
  const [healthLoading, setHealthLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;

    fetchApiData<ProviderStatus>(
      "/api/ai/providers",
      undefined,
      "Could not load AI provider status.",
    )
      .then((payload) => {
        if (cancelled) return;
        setStatus(payload);
      })
      .catch(() => {
        if (!cancelled) setStatus(null);
      });

    fetchApiData<PublicAIProviderHealthSnapshot>(
      "/api/ai/provider-health",
      undefined,
      "Could not load AI provider health.",
    )
      .then((payload) => {
        if (cancelled) return;
        setHealth(payload);
      })
      .catch(() => {
        if (!cancelled) setHealth(null);
      })
      .finally(() => {
        if (!cancelled) setHealthLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const selectedProvider = config.aiProvider ?? "AUTO";

  function isUnavailable(provider: AIProvider) {
    if (!status) return false;
    if (provider === "GEMINI") return !status.gemini;
    if (provider === "GROQ") return !status.groq;
    if (provider === "MISTRAL") return !status.mistral;
    if (provider === "MINIMAX") return !status.minimax;
    if (provider === "CEREBRAS") return !status.cerebras;
    if (provider === "GROK") return !status.grok;
    if (provider === "OPENROUTER") return !status.openrouter;
    if (provider === "GITHUB_MODELS") return !status.githubModels;
    if (provider === "COHERE") return !status.cohere;
    if (provider === "CLOUDFLARE") return !status.cloudflare;
    if (provider === "OPENAI") return !status.openai;
    return (
      !status.gemini &&
      !status.groq &&
      !status.mistral &&
      !status.minimax &&
      !status.cerebras &&
      !status.grok &&
      !status.openrouter &&
      !status.githubModels &&
      !status.cohere &&
      !status.cloudflare &&
      !status.openai
    );
  }

  function selectedModelLabel() {
    if (!status) return null;
    if (selectedProvider === "GEMINI") return status.geminiModel;
    if (selectedProvider === "GROQ") return status.groqModel;
    if (selectedProvider === "MISTRAL") return status.mistralModel;
    if (selectedProvider === "MINIMAX") return status.miniMaxModel;
    if (selectedProvider === "CEREBRAS") return status.cerebrasModel;
    if (selectedProvider === "GROK") return status.grokModel;
    if (selectedProvider === "OPENROUTER") return status.openRouterModel;
    if (selectedProvider === "GITHUB_MODELS") return status.githubModelsModel;
    if (selectedProvider === "COHERE") return status.cohereModel;
    if (selectedProvider === "CLOUDFLARE") return status.cloudflareModel;
    if (selectedProvider === "OPENAI") return status.openAIModel;
    return [
      status.gemini ? `Gemini: ${status.geminiModel}` : null,
      status.groq ? `GroqCloud: ${status.groqModel}` : null,
      status.mistral ? `Mistral: ${status.mistralModel}` : null,
      status.minimax ? `MiniMax: ${status.miniMaxModel}` : null,
      status.cerebras ? `Cerebras: ${status.cerebrasModel}` : null,
      status.openrouter ? `OpenRouter: ${status.openRouterModel}` : null,
      status.githubModels ? `GitHub Models: ${status.githubModelsModel}` : null,
      status.cohere ? `Cohere: ${status.cohereModel}` : null,
      status.cloudflare ? `Cloudflare: ${status.cloudflareModel}` : null,
      status.grok ? `xAI Grok: ${status.grokModel}` : null,
      status.deepseek ? `DeepSeek: ${status.deepseekModel}` : null,
      status.openai ? `OpenAI: ${status.openAIModel}` : null,
    ]
      .filter(Boolean)
      .join(" -> ");
  }

  function healthForProvider(
    provider: AIProvider,
  ): PublicAIProviderHealthStatus | null {
    if (!health || provider === "AUTO") return null;
    return (
      health.providers.find((item) => item.provider === provider) ?? null
    );
  }

  function providerHealthNote(provider: AIProvider) {
    if (!health) return "";
    if (provider === "AUTO") {
      const miniMaxConfigured = health.configuredProviders.includes("MINIMAX");
      const miniMaxUsable = health.usableProviders.includes("MINIMAX");
      const miniMaxNote = miniMaxConfigured
        ? miniMaxUsable
          ? "MiniMax usable in fallback. "
          : "MiniMax in fallback, health check not usable now. "
        : "";
      return health.usableProviders.length
        ? `${miniMaxNote}${health.usableProviders.length} usable provider${
            health.usableProviders.length === 1 ? "" : "s"
          } now.`
        : "No usable provider in production.";
    }
    const item = healthForProvider(provider);
    if (!item || !item.configured) return "";
    if (item.usable) return "Usable now.";
    return item.failure ?? item.failureClass ?? "Not usable right now.";
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-extrabold text-white">AI Engine</h2>
        <p className="mt-2 text-sm text-slate-400">
          Choose which model should generate this paper. All engines use the same
          CBSE/NCERT JSON format and quality rules.
        </p>
      </div>

      <div className="rounded-lg border border-white/10 bg-white/[0.035] p-4 text-sm leading-6 text-slate-300">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="font-semibold text-white">Production provider health</div>
            <div className="mt-1 text-slate-300">
              {healthLoading
                ? "Checking deployed AI providers..."
                : health
                  ? providerHealthSummary(health)
                  : "Provider health could not be checked."}
            </div>
            {health ? (
              <div className="mt-1 text-xs text-slate-400">
                {providerHealthAction(health)}
              </div>
            ) : null}
          </div>
          {health?.usableProviders.length ? (
            <span className="rounded-md border border-emerald-300/20 bg-emerald-500/10 px-2 py-1 text-xs font-semibold text-emerald-100">
              {health.usableProviders.length} usable
            </span>
          ) : (
            <span className="rounded-md border border-red-300/20 bg-red-500/10 px-2 py-1 text-xs font-semibold text-red-100">
              Needs provider
            </span>
          )}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-7">
        {providerCards.map((card) => {
          const selected = selectedProvider === card.provider;
          const disabled = isUnavailable(card.provider);
          const healthNote = providerHealthNote(card.provider);
          const unhealthy =
            card.provider === "AUTO"
              ? Boolean(health && !health.usableProviders.length)
              : Boolean(healthForProvider(card.provider)?.configured &&
                  !healthForProvider(card.provider)?.usable);
          const Icon = card.icon;

          return (
            <Card
              key={card.provider}
              role="button"
              tabIndex={disabled ? -1 : 0}
              onClick={() => {
                if (!disabled) updateConfig({ aiProvider: card.provider });
              }}
              className={cn(
                "relative min-h-[230px] p-5 transition",
                disabled
                  ? "cursor-not-allowed opacity-50"
                  : "cursor-pointer hover:border-blue-300/40",
                selected && "border-blue-300/60 bg-white/[0.055] shadow-glow",
              )}
            >
              {selected ? (
                <span className="absolute right-4 top-4 rounded-full bg-primary p-1 text-white">
                  <Check className="h-4 w-4" />
                </span>
              ) : null}
              <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-blue-500/10 text-blue-200">
                <Icon className="h-5 w-5" />
              </div>
              <h3 className="mt-4 text-lg font-extrabold text-white">{card.title}</h3>
              <p className="mt-3 text-sm leading-6 text-slate-300">
                {card.description}
              </p>
              <p className="mt-3 text-sm text-slate-400">{card.detail}</p>
              {disabled ? (
                <p className="mt-3 text-xs font-semibold text-red-200">
                  API key not configured.
                </p>
              ) : null}
              {!disabled && healthNote ? (
                <p
                  className={cn(
                    "mt-3 text-xs font-semibold",
                    unhealthy ? "text-red-200" : "text-emerald-200",
                  )}
                >
                  {healthNote}
                </p>
              ) : null}
            </Card>
          );
        })}
      </div>

      <div className="rounded-lg border border-white/10 bg-white/[0.035] p-4 text-sm text-slate-400">
        Selected engine:{" "}
        <span className="font-bold text-white">
          {providerCards.find((card) => card.provider === selectedProvider)?.title ??
            "Auto Fallback"}
        </span>
        {selectedModelLabel() ? (
          <span className="ml-2 text-slate-500">Model: {selectedModelLabel()}</span>
        ) : null}
      </div>
    </div>
  );
}
