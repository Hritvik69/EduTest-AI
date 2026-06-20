/**
 * Three-axis question style protocol — replaces the old Bloom distribution
 * sliders. The user picks (verb, vocab, depth); this file maps that triple
 * to:
 *   1. A concrete set of allowed question-stem openers the AI must use.
 *   2. A vocabulary / sentence-complexity hint.
 *   3. A reasoning-depth hint.
 *   4. A derived Bloom mix (so the rest of the pipeline keeps working).
 *
 * It also exposes a quality gate: `enforceQuestionStyle` rejects any
 * question whose stem does not actually use one of the allowed openers
 * (with a small set of absolute fallback openers for cases like
 * Assertion-Reason where the stem is a header).
 */

import type {
  BloomLevel,
  Difficulty,
  QuestionStyle,
  QuestionType,
  QuestionVerb,
  ReasoningDepth,
  VocabLevel,
} from "@/types";

export const questionVerbLabels: Record<QuestionVerb, string> = {
  MIXED: "Mixed (variety)",
  WHAT: "What…",
  WHICH: "Which…",
  HOW: "How…",
  WHY: "Why…",
  WHEN: "When…",
  WHERE: "Where…",
  NAME: "Name…",
  STATE: "State…",
  DEFINE: "Define…",
  LIST: "List…",
  EXPLAIN: "Explain…",
  COMPARE: "Compare…",
  DIFFERENTIATE: "Differentiate…",
  PREDICT: "Predict…",
};

export const questionVerbDescriptions: Record<QuestionVerb, string> = {
  MIXED: "Rotate between What / Which / How / Why / Name / State / Define so the paper feels varied.",
  WHAT: "Open every stem with 'What…' (direct recall or definition).",
  WHICH: "Open every stem with 'Which…' (MCQ-friendly identification).",
  HOW: "Open every stem with 'How…' (process / mechanism questions).",
  WHY: "Open every stem with 'Why…' (cause / reason questions).",
  WHEN: "Open every stem with 'When…' (timing / sequence questions).",
  WHERE: "Open every stem with 'Where…' (location / structure questions).",
  NAME: "Open every stem with 'Name…' (one-word factual recall).",
  STATE: "Open every stem with 'State…' (short direct statement).",
  DEFINE: "Open every stem with 'Define…' (formal definition questions).",
  LIST: "Open every stem with 'List…' (enumeration questions).",
  EXPLAIN: "Open every stem with 'Explain…' (short conceptual explanation).",
  COMPARE: "Open every stem with 'Compare…' (two-thing comparison).",
  DIFFERENTIATE: "Open every stem with 'Differentiate…' (distinguish two things).",
  PREDICT: "Open every stem with 'Predict…' (hypothetical outcome).",
};

export const vocabLabels: Record<VocabLevel, string> = {
  SIMPLE: "Simple (Class 6–7 vocabulary)",
  STANDARD: "Standard (NCERT textbook language)",
  ACADEMIC: "Academic (formal school register)",
  TECHNICAL: "Technical (subject-specific jargon allowed)",
};

export const vocabDescriptions: Record<VocabLevel, string> = {
  SIMPLE:
    "Use plain words, short sentences, no idioms. Aim for a Class 6–7 reader.",
  STANDARD:
    "Use NCERT textbook vocabulary. Complete sentences, no filler.",
  ACADEMIC:
    "Use formal academic register. Longer noun phrases, passive voice allowed.",
  TECHNICAL:
    "Use subject-specific terminology freely (e.g. lignin deposition, mosaic model, valence electron).",
};

export const depthLabels: Record<ReasoningDepth, string> = {
  DIRECT: "Direct (1 step, recall or recognition)",
  STANDARD: "Standard (2–3 steps, apply or analyse)",
  DEEP: "Deep (3–4 steps, evaluate / multi-concept)",
  EXTREME: "Extreme (4–5 steps, synthesis / Olympiad-style)",
};

export const depthDescriptions: Record<ReasoningDepth, string> = {
  DIRECT:
    "Single reasoning step. Student just needs to recognise or recall the right fact.",
  STANDARD:
    "2–3 reasoning steps. Student must apply the concept to a new but familiar situation.",
  DEEP:
    "3–4 reasoning steps. Student must combine multiple concepts or evaluate a trade-off.",
  EXTREME:
    "4–5 reasoning steps. Student must synthesise across concepts and predict an unfamiliar outcome.",
};

/**
 * Concrete list of acceptable stem openers per verb. Used both in the
 * generation prompt and the quality gate.
 */
const verbOpenerMap: Record<QuestionVerb, string[]> = {
  MIXED: [
    "What", "Which", "How", "Why", "When", "Where",
    "Name", "State", "Define", "List", "Explain",
    "Compare", "Differentiate", "Predict", "Identify", "Calculate",
  ],
  WHAT: ["What"],
  WHICH: ["Which"],
  HOW: ["How"],
  WHY: ["Why"],
  WHEN: ["When"],
  WHERE: ["Where"],
  NAME: ["Name"],
  STATE: ["State"],
  DEFINE: ["Define"],
  LIST: ["List"],
  EXPLAIN: ["Explain"],
  COMPARE: ["Compare"],
  DIFFERENTIATE: ["Differentiate"],
  PREDICT: ["Predict"],
};

/**
 * Stem formats that are ALWAYS allowed regardless of the verb choice —
 * because the question type forces them (e.g. Assertion-Reason, True/False,
 * Match the Column). The verb choice still applies to question types where
 * it makes sense (MCQ, SHORT, LONG, etc.).
 */
const alwaysAllowedFormatHeaders: Partial<Record<QuestionType, RegExp[]>> = {
  ASSERTION_REASON: [/^assertion\s*\(a\)/i, /^reason\s*\(r\)/i],
  TRUE_FALSE: [/^(true|false)\s*:/i, /^(state whether|given that)/i],
  MATCH_FOLLOWING: [/^match the following/i, /^match column/i, /^column a/i],
  FILL_BLANK: [/^.{0,80}\b_+\b.{0,80}\b_+\b/], // sentence with blanks
  ONE_WORD: [/^name\b/i, /^state\b/i, /^give\b/i, /^what\b/i, /^which\b/i],
  DIAGRAM: [/^(draw|label|observe|identify|what does .* show)/i],
  PRACTICAL: [/^(in the experiment|observe|state one precaution|what would you observe)/i],
};

export const defaultQuestionStyle: QuestionStyle = {
  verb: "MIXED",
  vocab: "STANDARD",
  depth: "STANDARD",
};

export function isValidVerb(value: unknown): value is QuestionVerb {
  return typeof value === "string" && value in verbOpenerMap;
}

export function isValidVocab(value: unknown): value is VocabLevel {
  return (
    value === "SIMPLE" ||
    value === "STANDARD" ||
    value === "ACADEMIC" ||
    value === "TECHNICAL"
  );
}

export function isValidDepth(value: unknown): value is ReasoningDepth {
  return (
    value === "DIRECT" ||
    value === "STANDARD" ||
    value === "DEEP" ||
    value === "EXTREME"
  );
}

export function normalizeQuestionStyle(input?: Partial<QuestionStyle> | null): QuestionStyle {
  if (!input) return { ...defaultQuestionStyle };
  return {
    verb: isValidVerb(input.verb) ? input.verb : defaultQuestionStyle.verb,
    vocab: isValidVocab(input.vocab) ? input.vocab : defaultQuestionStyle.vocab,
    depth: isValidDepth(input.depth) ? input.depth : defaultQuestionStyle.depth,
  };
}

/**
 * Returns the list of acceptable English openers the AI must start the
 * question stem with, given the chosen verb.
 */
export function allowedStemOpeners(style: QuestionStyle): string[] {
  return verbOpenerMap[style.verb] ?? verbOpenerMap.MIXED;
}

/**
 * Build the prompt instruction paragraph that tells the AI exactly which
 * stem openers and language register to use, based on the chosen style.
 * This is appended into the question-generation prompt so the AI is
 * forced to obey it.
 */
export function buildQuestionStylePrompt(style: QuestionStyle): string {
  const openers = allowedStemOpeners(style);
  const openerList = openers.map((opener) => `"${opener}"`).join(", ");
  const verbLine =
    style.verb === "MIXED"
      ? `STEM OPENER (rotate through): every question stem must START with one of these direct interrogatives or task verbs: ${openerList}. Do NOT start with "What does the detail about…", "What can be inferred from the detail about…", "According to the passage…", "The detail about…", "This gives…", "This supports…", or any meta reference to source chunks.`
      : `STEM OPENER (locked): every question stem must START with "${style.verb}" (or a direct variant of it like "${style.verb.toLowerCase()} of the following", "${style.verb.toLowerCase()} characteristic", etc.). Stems that start with any other word are FORBIDDEN and must be rewritten.`;

  const vocabLine = `LANGUAGE / VOCABULARY: ${vocabDescriptions[style.vocab]}`;
  const depthLine = `REASONING DEPTH: ${depthDescriptions[style.depth]}`;

  return [
    "========== QUESTION STYLE (user-controlled) ==========",
    verbLine,
    vocabLine,
    depthLine,
    "DO NOT use difficult English, long wording, or confusing tricks to fake difficulty. The verb/vocab/depth settings above are the ONLY way the user controls question style — respect them strictly.",
    "=======================================================",
  ].join("\n");
}

/**
 * Map the (verb, depth) combination to a Bloom mix that the rest of the
 * pipeline (which still reads bloomDistribution) can consume. The vocab
 * axis does NOT change Bloom mix — it only changes wording.
 *
 * Verb influence:
 *   - NAME/STATE/DEFINE/LIST → heavy REMEMBER
 *   - WHAT/WHICH/WHEN/WHERE  → REMEMBER + UNDERSTAND
 *   - HOW/EXPLAIN            → APPLY
 *   - WHY/COMPARE/DIFFERENTIATE → ANALYZE
 *   - PREDICT                → EVALUATE + CREATE
 *
 * Depth influence (stronger shift than verb):
 *   DIRECT  → REMEMBER 70 / UNDERSTAND 30
 *   STANDARD → APPLY 50 / ANALYZE 30 / UNDERSTAND 20
 *   DEEP    → ANALYZE 40 / EVALUATE 40 / APPLY 20
 *   EXTREME → EVALUATE 50 / CREATE 40 / ANALYZE 10
 *
 * The mapping blends the two (depth weighted 2x) so the same verb at
 * different depths still feels meaningfully different.
 */
export function deriveBloomMixFromStyle(
  style: QuestionStyle,
): Record<BloomLevel, number> {
  const verbMix: Record<QuestionVerb, Record<BloomLevel, number>> = {
    MIXED: { REMEMBER: 15, UNDERSTAND: 20, APPLY: 30, ANALYZE: 20, EVALUATE: 10, CREATE: 5 },
    WHAT: { REMEMBER: 30, UNDERSTAND: 35, APPLY: 20, ANALYZE: 10, EVALUATE: 5, CREATE: 0 },
    WHICH: { REMEMBER: 25, UNDERSTAND: 35, APPLY: 25, ANALYZE: 10, EVALUATE: 5, CREATE: 0 },
    HOW: { REMEMBER: 10, UNDERSTAND: 20, APPLY: 50, ANALYZE: 15, EVALUATE: 5, CREATE: 0 },
    WHY: { REMEMBER: 5, UNDERSTAND: 20, APPLY: 30, ANALYZE: 35, EVALUATE: 10, CREATE: 0 },
    WHEN: { REMEMBER: 35, UNDERSTAND: 40, APPLY: 15, ANALYZE: 10, EVALUATE: 0, CREATE: 0 },
    WHERE: { REMEMBER: 35, UNDERSTAND: 40, APPLY: 15, ANALYZE: 10, EVALUATE: 0, CREATE: 0 },
    NAME: { REMEMBER: 70, UNDERSTAND: 25, APPLY: 5, ANALYZE: 0, EVALUATE: 0, CREATE: 0 },
    STATE: { REMEMBER: 55, UNDERSTAND: 35, APPLY: 10, ANALYZE: 0, EVALUATE: 0, CREATE: 0 },
    DEFINE: { REMEMBER: 60, UNDERSTAND: 35, APPLY: 5, ANALYZE: 0, EVALUATE: 0, CREATE: 0 },
    LIST: { REMEMBER: 60, UNDERSTAND: 30, APPLY: 10, ANALYZE: 0, EVALUATE: 0, CREATE: 0 },
    EXPLAIN: { REMEMBER: 5, UNDERSTAND: 25, APPLY: 50, ANALYZE: 15, EVALUATE: 5, CREATE: 0 },
    COMPARE: { REMEMBER: 5, UNDERSTAND: 15, APPLY: 25, ANALYZE: 50, EVALUATE: 5, CREATE: 0 },
    DIFFERENTIATE: { REMEMBER: 5, UNDERSTAND: 15, APPLY: 25, ANALYZE: 50, EVALUATE: 5, CREATE: 0 },
    PREDICT: { REMEMBER: 0, UNDERSTAND: 5, APPLY: 15, ANALYZE: 25, EVALUATE: 40, CREATE: 15 },
  };

  const depthMix: Record<ReasoningDepth, Record<BloomLevel, number>> = {
    DIRECT: { REMEMBER: 70, UNDERSTAND: 30, APPLY: 0, ANALYZE: 0, EVALUATE: 0, CREATE: 0 },
    STANDARD: { REMEMBER: 5, UNDERSTAND: 20, APPLY: 50, ANALYZE: 20, EVALUATE: 5, CREATE: 0 },
    DEEP: { REMEMBER: 0, UNDERSTAND: 5, APPLY: 15, ANALYZE: 40, EVALUATE: 35, CREATE: 5 },
    EXTREME: { REMEMBER: 0, UNDERSTAND: 0, APPLY: 10, ANALYZE: 20, EVALUATE: 40, CREATE: 30 },
  };

  const verb = verbMix[style.verb] ?? verbMix.MIXED;
  const depth = depthMix[style.depth] ?? depthMix.STANDARD;
  const combined: Record<BloomLevel, number> = {
    REMEMBER: 0,
    UNDERSTAND: 0,
    APPLY: 0,
    ANALYZE: 0,
    EVALUATE: 0,
    CREATE: 0,
  };
  (Object.keys(combined) as BloomLevel[]).forEach((level) => {
    combined[level] = verb[level] + depth[level] * 2;
  });

  const total = (Object.keys(combined) as BloomLevel[]).reduce(
    (sum, level) => sum + combined[level],
    0,
  );
  if (total <= 0) return { ...verbMix.MIXED };

  const normalized: Record<BloomLevel, number> = {
    REMEMBER: 0,
    UNDERSTAND: 0,
    APPLY: 0,
    ANALYZE: 0,
    EVALUATE: 0,
    CREATE: 0,
  };
  let assigned = 0;
  (Object.keys(combined) as BloomLevel[]).forEach((level) => {
    const exact = (combined[level] / total) * 100;
    normalized[level] = Math.floor(exact);
    assigned += normalized[level];
  });
  // Distribute the rounding remainder to the highest-fraction levels so the
  // sum is exactly 100.
  const fractions = (Object.keys(combined) as BloomLevel[])
    .map((level) => ({
      level,
      fraction: (combined[level] / total) * 100 - Math.floor((combined[level] / total) * 100),
    }))
    .sort((a, b) => b.fraction - a.fraction);
  let i = 0;
  while (assigned < 100 && i < fractions.length) {
    normalized[fractions[i].level] += 1;
    assigned += 1;
    i += 1;
  }

  return normalized;
}

/**
 * Quality gate: does this question stem actually use one of the allowed
 * openers (or a format-specific header)? If not, return a reason string
 * the validator can show. Returns empty string when the stem is fine.
 */
export function questionStyleViolation(
  text: string,
  style: QuestionStyle,
  questionType?: QuestionType,
): string {
  if (!text || !text.trim()) return "empty-stem";
  const trimmed = text.trim();

  // Format-specific headers always allowed.
  if (questionType && alwaysAllowedFormatHeaders[questionType]) {
    const regexes = alwaysAllowedFormatHeaders[questionType]!;
    if (regexes.some((re) => re.test(trimmed))) return "";
  }

  const openers = allowedStemOpeners(style);
  const firstWord = trimmed.split(/\s+/)[0]?.replace(/[^A-Za-z]/g, "") ?? "";
  if (!firstWord) return "stem-missing-opener";

  const match = openers.find(
    (opener) => firstWord.toLowerCase() === opener.toLowerCase(),
  );
  if (match) return "";

  // Allow common direct openers even if not in the locked list — these
  // are still "direct interrogative" form, which is the actual goal.
  const whitelist = new Set([
    "What", "Which", "How", "Why", "When", "Where",
    "Name", "State", "Define", "List", "Explain",
    "Compare", "Differentiate", "Predict", "Identify", "Calculate",
    "Give", "Find", "Observe", "Mention", "Describe", "Illustrate",
    "Justify", "Prove", "Derive", "Evaluate", "Analyse", "Analyze",
    "Design", "Suggest", "Recommend", "Sketch", "Draw", "Label",
    "Observe", "Identify",
  ]);
  if (whitelist.has(firstWord)) return "";

  return `stem-must-start-with-direct-opener (current first word: "${firstWord}", allowed: ${openers.join(", ")})`;
}

/**
 * Convert a (verb, vocab, depth) tuple to a difficulty-band suggestion.
 * The user can still pick any difficulty in the UI; this is just a
 * pre-fill helper for "Reset to CBSE Standard" buttons.
 */
export function suggestedDifficultyForStyle(style: QuestionStyle): Difficulty {
  if (style.depth === "DIRECT" && (style.verb === "NAME" || style.verb === "DEFINE" || style.verb === "LIST")) {
    return "EASY";
  }
  if (style.depth === "EXTREME" || style.verb === "PREDICT") return "ABSURD";
  if (style.depth === "DEEP" || style.verb === "DIFFERENTIATE" || style.verb === "COMPARE") return "HARD";
  return "MEDIUM";
}
