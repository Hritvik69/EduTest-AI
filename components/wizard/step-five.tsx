"use client";

import * as React from "react";
import { Check, Cpu, Globe2, RefreshCw, Sparkles, Zap } from "lucide-react";
import { Card } from "@/components/ui/card";
import { fetchApiData } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import type { AIProvider } from "@/types";
import { usePaperConfig } from "./paper-config-context";

type ProviderStatus = {
  gemini: boolean;
  groq: boolean;
  grok: boolean;
  mistral: boolean;
  deepseek: boolean;
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
      "Try healthy free/fast providers first, then continue through the configured fallback chain.",
    detail: "Skips recently failed providers to reduce wasted API calls.",
    icon: RefreshCw,
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

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-extrabold text-white">AI Engine</h2>
        <p className="mt-2 text-sm text-slate-400">
          Choose which model should generate this paper. All engines use the same
          CBSE/NCERT JSON format and quality rules.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-7">
        {providerCards.map((card) => {
          const selected = selectedProvider === card.provider;
          const disabled = isUnavailable(card.provider);
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
