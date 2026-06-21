"use client";

import * as React from "react";
import {
  adjustQuestionCountDistribution,
  balancedQuestionCounts,
  marksForQuestionCounts,
  normalizeQuestionFormatsForDifficulty,
  normalizeQuestionCountDistribution,
} from "@/lib/blueprint";
import { defaultBloomDistribution } from "@/lib/edutest-data";
import {
  defaultQuestionStyle,
  deriveBloomMixFromStyle,
  normalizeQuestionStyle,
} from "@/lib/question-style-protocol";
import type { AIProvider, PaperConfig, PaperFocus, PaperSourceMode, QuestionGenerationMode, QuestionType } from "@/types";

const storageKey = "edutest:paper-config";

export const defaultPaperConfig: PaperConfig = {
  sourceMode: "curriculum",
  classNum: 10,
  subject: "Mathematics",
  subjects: ["Mathematics"],
  subjectSelections: [{ subject: "Mathematics", chapterIds: [], topicIds: [] }],
  chapterIds: [],
  topicIds: [],
  totalMarks: 40,
  duration: 90,
  examType: "School Test",
  difficulty: "MEDIUM",
  aiProvider: "AUTO",
  generationMode: "fresh",
  paperFocus: "mixed" as PaperFocus,
  integrationPrompt: "",
  questionTypes: ["MCQ", "CASE_BASED", "SHORT", "LONG", "HOTS"],
  typeDistribution: {
    MCQ: 24,
    CASE_BASED: 1,
    SHORT: 1,
    LONG: 1,
    HOTS: 1,
  },
  questionComposition: [],
  bloomDistribution: defaultBloomDistribution,
  questionStyle: defaultQuestionStyle,
  totalQuestions: 28,
  hiddenGems: {
    enabled: false,
    questionCount: 0,
    difficulty: "MEDIUM",
  },
};

interface PaperConfigContextValue {
  config: PaperConfig;
  setConfig: React.Dispatch<React.SetStateAction<PaperConfig>>;
  updateConfig: (patch: Partial<PaperConfig>) => void;
  resetConfig: () => void;
}

const PaperConfigContext = React.createContext<PaperConfigContextValue | null>(null);

export function PaperConfigProvider({
  children,
  initialSourceMode = "curriculum",
  initialGenerationMode,
}: {
  children: React.ReactNode;
  initialSourceMode?: PaperSourceMode;
  initialGenerationMode?: QuestionGenerationMode;
}) {
  const [config, setConfig] = React.useState<PaperConfig>(() =>
    configForEntry(defaultPaperConfig, initialSourceMode, initialGenerationMode),
  );
  const [hydrated, setHydrated] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    let nextConfig: PaperConfig | null = null;
    try {
      const stored = window.sessionStorage.getItem(storageKey);
      if (stored) {
        const parsed = JSON.parse(stored) as Partial<PaperConfig>;
        const selectedSubjects = parsed.subjectSelections?.length
          ? parsed.subjectSelections.map((selection) => selection.subject)
          : parsed.subjects?.length
            ? parsed.subjects
          : parsed.subject
            ? [parsed.subject]
            : defaultPaperConfig.subjects;
        const merged = configForEntry({
          ...defaultPaperConfig,
          ...parsed,
          sourceMode: parsed.sourceMode ?? "curriculum",
          aiProvider: normalizeAIProvider(parsed.aiProvider),
          subjects: selectedSubjects,
          subject: selectedSubjects?.join(" + ") ?? defaultPaperConfig.subject,
          subjectSelections:
            parsed.subjectSelections ??
            selectedSubjects?.map((subject) => ({
              subject,
              chapterIds: parsed.chapterIds ?? [],
              topicIds: parsed.topicIds ?? [],
            })),
        }, initialSourceMode, initialGenerationMode);
        nextConfig = normalizeQuestionFormatsForDifficulty(
          normalizeConfigQuestionCounts(
            normalizeLegacySourceModeQuestionType(merged),
          ),
        );
        nextConfig = applyQuestionStyleDerivation(nextConfig);
      }
    } catch {
      try {
        window.sessionStorage.removeItem(storageKey);
      } catch {
        // Ignore blocked sessionStorage.
      }
    }

    queueMicrotask(() => {
      if (cancelled) return;
      if (nextConfig) setConfig(nextConfig);
      setHydrated(true);
    });

    return () => {
      cancelled = true;
    };
  }, [initialSourceMode, initialGenerationMode]);

  React.useEffect(() => {
    if (!hydrated) return;
    try {
      window.sessionStorage.setItem(storageKey, JSON.stringify(config));
    } catch {
      // Configuration is still kept in React state when sessionStorage is full or blocked.
    }
  }, [config, hydrated]);

  const updateConfig = React.useCallback((patch: Partial<PaperConfig>) => {
    setConfig((current) => {
      const next = normalizeQuestionFormatsForDifficulty(
        normalizeLegacySourceModeQuestionType({ ...current, ...patch }),
      );
      const shapeChanged =
        "typeDistribution" in patch ||
        "totalQuestions" in patch ||
        "totalMarks" in patch ||
        "questionTypes" in patch;

      const normalized = shapeChanged
        ? normalizeQuestionFormatsForDifficulty(normalizeConfigQuestionCounts(next))
        : next;
      return applyQuestionStyleDerivation(normalized);
    });
  }, []);

  const resetConfig = React.useCallback(() => {
    setConfig(configForEntry(defaultPaperConfig, initialSourceMode, initialGenerationMode));
    try {
      window.sessionStorage.removeItem(storageKey);
    } catch {
      // Ignore blocked sessionStorage.
    }
  }, [initialSourceMode, initialGenerationMode]);

  return (
    <PaperConfigContext.Provider
      value={{ config, setConfig, updateConfig, resetConfig }}
    >
      {children}
    </PaperConfigContext.Provider>
  );
}

function configForSourceMode(config: PaperConfig, sourceMode: PaperSourceMode): PaperConfig {
  if (sourceMode === "pdf_upload") {
    return {
      ...config,
      sourceMode,
      subject: config.pdfSource?.subject || "Uploaded PDF",
      subjects: [config.pdfSource?.subject || "Uploaded PDF"],
      subjectSelections: [],
      chapterIds: [],
      topicIds: [],
    };
  }

  return {
    ...config,
    sourceMode,
    pdfSourceId: undefined,
    pdfSource: undefined,
  };
}

// Applies both the source mode (curriculum vs pdf_upload) and the optional
// entry-point generation mode (e.g. source_insights from the NCERT SOURCE +
// INSIGHTS button). The generation mode is only applied on the initial entry
// config; once the user edits anything, sessionStorage hydration preserves the
// stored value so a returning session keeps its chosen mode.
function configForEntry(
  config: PaperConfig,
  sourceMode: PaperSourceMode,
  generationMode?: QuestionGenerationMode,
): PaperConfig {
  const withSource = configForSourceMode(config, sourceMode);
  if (!generationMode) return withSource;
  return { ...withSource, generationMode };
}

export function usePaperConfig() {
  const value = React.useContext(PaperConfigContext);
  if (!value) {
    throw new Error("usePaperConfig must be used within PaperConfigProvider.");
  }
  return value;
}

export function evenDistribution(types: QuestionType[]) {
  return questionCountDistribution(
    types,
    defaultPaperConfig.totalQuestions,
  );
}

export function adjustDistribution(
  current: PaperConfig["typeDistribution"],
  types: QuestionType[],
  target: QuestionType,
  value: number,
  totalQuestions = defaultPaperConfig.totalQuestions,
) {
  return adjustQuestionCountDistribution(
    current,
    types,
    target,
    value,
    totalQuestions,
  );
}

export function questionCountDistribution(
  types: QuestionType[],
  totalQuestions: number,
  current: PaperConfig["typeDistribution"] = {},
) {
  try {
    return normalizeQuestionCountDistribution(
      types,
      current,
      totalQuestions,
    );
  } catch {
    return balancedQuestionCounts(types, current, totalQuestions);
  }
}

function normalizeConfigQuestionCounts(config: PaperConfig): PaperConfig {
  const typeDistribution = questionCountDistribution(
    config.questionTypes,
    config.totalQuestions,
    config.typeDistribution,
  );

  return {
    ...config,
    typeDistribution,
    totalMarks: marksForQuestionCounts(config.questionTypes, typeDistribution),
  };
}

/**
 * Whenever `questionStyle` is set, derive a fresh `bloomDistribution` from it
 * (so the rest of the pipeline that still reads the legacy bloomDistribution
 * field sees the right mix). When only `bloomDistribution` is set (legacy
 * configs from before the 3-axis UI shipped), seed a default `questionStyle`
 * so the user has something to edit on the wizard.
 *
 * Always normalises the style through `normalizeQuestionStyle` to defend
 * against stale sessionStorage values with unknown enum strings.
 */
function applyQuestionStyleDerivation(config: PaperConfig): PaperConfig {
  const normalizedStyle = normalizeQuestionStyle(config.questionStyle);
  return {
    ...config,
    questionStyle: normalizedStyle,
    bloomDistribution: deriveBloomMixFromStyle(normalizedStyle),
  };
}

function normalizeLegacySourceModeQuestionType(config: PaperConfig): PaperConfig {
  if (!config.questionTypes.includes("NCERT_FORMAT")) return config;

  const questionTypes = config.questionTypes.filter(
    (type) => type !== "NCERT_FORMAT",
  );
  const typeDistribution = { ...config.typeDistribution };
  delete typeDistribution.NCERT_FORMAT;

  return {
    ...config,
    generationMode: "source_exact",
    questionTypes: questionTypes.length ? questionTypes : defaultPaperConfig.questionTypes,
    typeDistribution,
  };
}

function normalizeAIProvider(value: unknown): AIProvider {
  if (
    value === "GEMINI" ||
    value === "GROQ" ||
    value === "GROK" ||
    value === "MISTRAL" ||
    value === "CEREBRAS" ||
    value === "DEEPSEEK" ||
    value === "MINIMAX" ||
    value === "OPENROUTER" ||
    value === "GITHUB_MODELS" ||
    value === "COHERE" ||
    value === "CLOUDFLARE" ||
    value === "OPENAI"
  ) {
    return value;
  }

  return "AUTO";
}
