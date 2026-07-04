import { z } from "zod";
import { marksPerType } from "@/lib/blueprint";
import {
  allowedDifficultiesForFormat,
  formatDifficultyCeilings,
} from "@/lib/difficulty-protocol";

/**
 * SECURITY FIX: Replace z.coerce.number() which silently accepts strings like
 * "100abc" → 100 or "-1" → -1 without validation.  This helper accepts only
 * proper numeric input:
 *   - A finite number  → passed through
 *   - A string that parses cleanly as an integer (no trailing non-numeric chars)  → parsed
 *   - Anything else  → rejected with a Zod validation error
 */
function strictInt(
  params: { min?: number; max?: number } = {},
): z.ZodType<number> {
  let s = z.number().int();
  if (params.min !== undefined) s = s.min(params.min);
  if (params.max !== undefined) s = s.max(params.max);
  return z.preprocess((val) => {
    if (typeof val === "number" && Number.isFinite(val)) return Math.floor(val);
    if (typeof val === "string") {
      const trimmed = val.trim();
      // Reject strings with trailing non-numeric characters
      if (!/^-?\d+$/.test(trimmed)) return NaN;
      const n = Number(trimmed);
      return Number.isInteger(n) ? n : NaN;
    }
    return NaN;
  }, s);
}

const _positiveInt = strictInt({ min: 1 });
const _nonNegInt = strictInt({ min: 0 });
const _boundedInt = (min: number, max: number) => strictInt({ min, max });

export const questionTypeValues = [
  "MCQ",
  "ASSERTION_REASON",
  "TRUE_FALSE",
  "ONE_WORD",
  "FILL_BLANK",
  "VERY_SHORT",
  "MATCH_FOLLOWING",
  "SHORT",
  "NUMERICAL",
  "SOURCE_BASED",
  "CASE_BASED",
  "PARAGRAPH",
  "HOTS",
  "COMPETENCY",
  "DIAGRAM",
  "PRACTICAL",
  "LONG",
  "NCERT_FORMAT",
] as const;

export const difficultyValues = ["EASY", "MEDIUM", "HARD", "ABSURD"] as const;
export const aiProviderValues = [
  "AUTO",
  "GEMINI",
  "GROQ",
  "GROK",
  "MISTRAL",
  "CEREBRAS",
  "DEEPSEEK",
  "MINIMAX",
  "OPENROUTER",
  "GITHUB_MODELS",
  "COHERE",
  "CLOUDFLARE",
  "OPENAI",
] as const;
export const sourceModeValues = ["curriculum", "pdf_upload"] as const;
export const questionGenerationModeValues = [
  "fresh",
  "source_exact",
  "source_insights",
  "hidden_gems",
] as const;
export const bloomLevelValues = [
  "REMEMBER",
  "UNDERSTAND",
  "APPLY",
  "ANALYZE",
  "EVALUATE",
  "CREATE",
] as const;

export const hiddenGemTypeValues = [
  "SCIENTIST_NAME",
  "DISCOVERY",
  "TIMELINE",
  "DID_YOU_KNOW",
  "ETYMOLOGY",
  "EXPERIMENT",
  "SIDE_NOTE",
  "COMPARISON",
  "HISTORICAL_CONTEXT",
  "FORGOTTEN_DETAIL",
] as const;

// New 3-axis style controls (verb / vocab / depth). UI defaults to MIXED /
// STANDARD / STANDARD if omitted. The legacy bloomDistribution is still
// accepted on the wire for storage compatibility; the UI no longer
// surfaces it.
export const questionVerbValues = [
  "MIXED",
  "WHAT",
  "WHICH",
  "HOW",
  "WHY",
  "WHEN",
  "WHERE",
  "NAME",
  "STATE",
  "DEFINE",
  "LIST",
  "EXPLAIN",
  "COMPARE",
  "DIFFERENTIATE",
  "PREDICT",
] as const;
export const vocabLevelValues = ["SIMPLE", "STANDARD", "ACADEMIC", "TECHNICAL"] as const;
export const reasoningDepthValues = ["DIRECT", "STANDARD", "DEEP", "EXTREME"] as const;

export const questionStyleSchema = z
  .object({
    verb: z.enum(questionVerbValues).default("MIXED"),
    vocab: z.enum(vocabLevelValues).default("STANDARD"),
    depth: z.enum(reasoningDepthValues).default("STANDARD"),
  })
  .default({ verb: "MIXED", vocab: "STANDARD", depth: "STANDARD" });

export const questionTypeSchema = z.enum(questionTypeValues);
export const difficultySchema = z.enum(difficultyValues);
export const hiddenGemsDifficultySchema = z.enum(["EASY", "MEDIUM", "HARD"]);
export const aiProviderSchema = z.enum(aiProviderValues);
export const sourceModeSchema = z.enum(sourceModeValues);
export const questionGenerationModeSchema = z.enum(questionGenerationModeValues);
export const paperFocusValues = ["mixed", "numerical", "concept"] as const;
export const paperFocusSchema = z.enum(paperFocusValues);
export const bloomLevelSchema = z.enum(bloomLevelValues);
export const hiddenGemTypeSchema = z.enum(hiddenGemTypeValues);

const boundedText = (max: number) =>
  z.string().trim().min(1).max(max);
const optionalBooleanSchema = z.preprocess((value) => {
  if (value === "true") return true;
  if (value === "false") return false;
  return value;
}, z.boolean().optional());

export const languageModeValues = ["grammar", "story", "auto"] as const;
export const languageModeSchema = z.enum(languageModeValues);

export const curiosityConfigSchema = z
  .object({
    enabled: z.boolean().default(false),
    minDifficulty: difficultySchema.optional(),
    maxQuestions: strictInt({ min: 0, max: 10 }).optional(),
    focus: z.array(hiddenGemTypeSchema).max(10).optional(),
  })
  .optional();

export const subjectSelectionSchema = z.object({
  subject: boundedText(100),
  chapterIds: z.array(_positiveInt).max(50),
  topicIds: z.array(_positiveInt).max(250).optional(),
  languageMode: languageModeSchema.optional(),
});

export const questionCompositionItemSchema = z.object({
  subject: boundedText(100),
  chapterId: _positiveInt.optional(),
  chapterName: z.string().trim().max(200).optional(),
  topicId: _positiveInt.optional(),
  topicName: z.string().trim().max(500).optional(),
  questionCount: strictInt({ min: 0, max: 100 }),
});

export const bloomDistributionSchema = z
  .object({
    REMEMBER: strictInt({ min: 0, max: 100 }),
    UNDERSTAND: strictInt({ min: 0, max: 100 }),
    APPLY: strictInt({ min: 0, max: 100 }),
    ANALYZE: strictInt({ min: 0, max: 100 }),
    EVALUATE: strictInt({ min: 0, max: 100 }),
    CREATE: strictInt({ min: 0, max: 100 }),
  })
  .superRefine((distribution, ctx) => {
    const total = Object.values(distribution).reduce((sum, value) => sum + value, 0);
    if (total !== 100) {
      ctx.addIssue({
        code: "custom",
        message: "Bloom distribution must add up to 100.",
      });
    }
  });

const questionCountSchema = z.coerce.number().int().min(0).max(100);
const typeDistributionShape = questionTypeValues.reduce(
  (shape, type) => {
    shape[type] = questionCountSchema.optional();
    return shape;
  },
  {} as Record<
    (typeof questionTypeValues)[number],
    z.ZodOptional<typeof questionCountSchema>
  >,
);

export const typeDistributionSchema = z.object(typeDistributionShape);

export const uploadedPdfSourceSummarySchema = z.object({
  id: _positiveInt,
  title: boundedText(300),
  subject: z.string().trim().max(100).optional(),
  classNum: strictInt({ min: 6, max: 12 }).optional(),
  fileName: z.string().trim().max(300).optional(),
  focusPrompt: z.string().trim().max(1000).optional(),
  contentHash: z.string().trim().max(128).optional(),
  extractionMethod: z
    .enum(["AI", "LOCAL_FALLBACK", "CACHED_AI", "CACHED_LOCAL_FALLBACK"])
    .optional(),
  wordCount: strictInt({ min: 0, max: 1_000_000 }),
  conceptsCount: strictInt({ min: 0, max: 10_000 }),
  topics: z.array(z.string().trim().min(1).max(500)).max(100),
  createdAt: z.string().optional(),
});

/**
 * Hidden Gems & Curiosity Questions mode — extra MCQ section that asks the AI
 * to mine side-notes / scientist names / dates / discoveries / historical
 * context from the chapter source instead of writing basic textbook
 * questions. Disabled by default; `questionCount` is 0-10 and `difficulty`
 * controls how challenging the curiosity questions should be (independent of
 * the paper's overall difficulty).
 */
export const hiddenGemsSchema = z
  .object({
    enabled: z.boolean().default(false),
    questionCount: strictInt({ min: 0, max: 10 }).default(0),
    difficulty: hiddenGemsDifficultySchema.default("MEDIUM"),
  })
  .default({ enabled: false, questionCount: 0, difficulty: "MEDIUM" });

export const paperConfigSchema = z
  .object({
    sourceMode: sourceModeSchema.default("curriculum"),
    pdfSourceId: _positiveInt.optional(),
    pdfSource: uploadedPdfSourceSummarySchema.optional(),
    classNum: strictInt({ min: 6, max: 12 }),
    subject: boundedText(100),
    subjects: z.array(boundedText(100)).min(1).max(10).optional(),
    subjectSelections: z.array(subjectSelectionSchema).max(10).optional(),
    chapterIds: z.array(_positiveInt).max(100),
    topicIds: z.array(_positiveInt).max(500).optional(),
    totalMarks: strictInt({ min: 5, max: 500 }),
    duration: strictInt({ min: 30, max: 240 }),
    examType: boundedText(80),
    difficulty: difficultySchema,
    aiProvider: aiProviderSchema.default("AUTO"),
    generationMode: questionGenerationModeSchema.default("fresh"),
    paperFocus: paperFocusSchema.default("mixed"),
    integrationPrompt: z.string().trim().max(1200).optional(),
    questionTypes: z.array(questionTypeSchema).min(1).max(questionTypeValues.length),
    typeDistribution: typeDistributionSchema,
    questionComposition: z.array(questionCompositionItemSchema).max(100).optional(),
    bloomDistribution: bloomDistributionSchema,
    questionStyle: questionStyleSchema.optional(),
    curiosityConfig: curiosityConfigSchema,
    totalQuestions: strictInt({ min: 5, max: 100 }),
    hiddenGems: hiddenGemsSchema.optional(),
  })
  .superRefine((config, ctx) => {
    const uniqueTypes = new Set(config.questionTypes);
    if (uniqueTypes.size !== config.questionTypes.length) {
      ctx.addIssue({
        code: "custom",
        path: ["questionTypes"],
        message: "Question types must be unique.",
      });
    }

    config.questionTypes.forEach((type) => {
      const requestedCount = config.typeDistribution[type] ?? 0;
      if (
        requestedCount > 0 &&
        !allowedDifficultiesForFormat(config.difficulty, type).length
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["questionTypes"],
          message: `${type} cannot be generated for ${config.difficulty} difficulty because its format ceiling is ${formatDifficultyCeilings[type]}. Choose another format or lower the difficulty.`,
        });
      }
    });

    const distributionTotal = config.questionTypes.reduce(
      (sum, type) => sum + (config.typeDistribution[type] ?? 0),
      0,
    );
    if (distributionTotal !== config.totalQuestions) {
      ctx.addIssue({
        code: "custom",
        path: ["typeDistribution"],
        message: "Selected question type counts must add up to totalQuestions.",
      });
    }

    const distributionMarks = config.questionTypes.reduce(
      (sum, type) => sum + (config.typeDistribution[type] ?? 0) * marksPerType[type],
      0,
    );
    if (config.totalMarks !== distributionMarks) {
      ctx.addIssue({
        code: "custom",
        path: ["typeDistribution"],
        message: "Total marks must match the selected question type counts.",
      });
    }

    if (config.questionComposition?.length) {
      const compositionTotal = config.questionComposition.reduce(
        (sum, item) => sum + item.questionCount,
        0,
      );
      if (compositionTotal !== config.totalQuestions) {
        ctx.addIssue({
          code: "custom",
          path: ["questionComposition"],
          message: "S/C/T composition counts must add up to totalQuestions.",
        });
      }
    }

    if (config.sourceMode === "pdf_upload" && !config.pdfSourceId) {
      ctx.addIssue({
        code: "custom",
        path: ["pdfSourceId"],
        message: "Uploaded PDF source is required.",
      });
    }

    if (config.sourceMode !== "pdf_upload" && !config.chapterIds.length) {
      ctx.addIssue({
        code: "custom",
        path: ["chapterIds"],
        message: "Select at least one chapter.",
      });
    }

    if (config.sourceMode !== "pdf_upload" && config.subjectSelections?.length) {
      const selectedChapters = new Set(
        config.subjectSelections.flatMap((selection) => selection.chapterIds),
      );
      const missing = config.chapterIds.some((id) => !selectedChapters.has(id));
      if (missing) {
        ctx.addIssue({
          code: "custom",
          path: ["subjectSelections"],
          message: "Subject selections must include every selected chapter.",
        });
      }
    }
  });

export const generationRequestSchema = paperConfigSchema.extend({
  idempotencyKey: z.string().trim().min(8).max(128).optional(),
  resumePaperId: _positiveInt.optional(),
  demoMode: z.boolean().optional(),
  salvageInvalidQuestions: z.boolean().optional(),
});

const answerLeafSchema = z.string().max(4000);
export const answerValueSchema = z.union([
  answerLeafSchema,
  z.record(z.string().max(500), answerLeafSchema).refine(
    (value) => Object.keys(value).length <= 30,
    "Answer object has too many fields.",
  ),
]);

const mcqOptionSchema = z.object({
  id: boundedText(10),
  text: boundedText(1000),
  isCorrect: z.boolean().default(false),
});

const matchPairSchema = z.object({
  left: boundedText(500),
  right: boundedText(500),
});

const cognitiveComplexitySchema = z.object({
  conceptIntegration: z.coerce.number().int().min(1).max(5),
  abstractionLevel: z.coerce.number().int().min(1).max(5),
  inferenceLevel: z.coerce.number().int().min(1).max(5),
  ambiguityLevel: z.coerce.number().int().min(1).max(5),
  cognitiveLoad: z.coerce.number().int().min(1).max(5),
});

const subQuestionSchema = z
  .object({
    text: boundedText(2000),
    type: questionTypeSchema,
    options: z.array(mcqOptionSchema).max(8).optional(),
    correctAnswer: boundedText(4000),
    marks: strictInt({ min: 1, max: 20 }),
  })
  .passthrough();

export const generatedQuestionPayloadSchema = z
  .object({
    id: _positiveInt.optional(),
    text: boundedText(4000),
    type: questionTypeSchema,
    difficulty: difficultySchema,
    marks: strictInt({ min: 1, max: 20 }),
    options: z.array(mcqOptionSchema).max(8).optional(),
    correctAnswer: boundedText(6000),
    explanation: z.string().max(6000).default(""),
    keyPoints: z.array(boundedText(1000)).max(30).optional(),
    bloomLevel: bloomLevelSchema.default("UNDERSTAND"),
    competencyLevel: strictInt({ min: 1, max: 5 }).default(2),
    reasoningSteps: strictInt({ min: 1, max: 5 }).optional(),
    difficultyConfidence: z.preprocess(
      (val) => (typeof val === "number" ? val : typeof val === "string" ? Number(val) : NaN),
      z.number().min(0).max(1),
    ).optional(),
    cognitiveComplexity: cognitiveComplexitySchema.optional(),
    validatedDifficulty: difficultySchema.optional(),
    scenario: z.string().max(6000).optional(),
    assertion: z.string().max(2000).optional(),
    reason: z.string().max(2000).optional(),
    matchPairs: z.array(matchPairSchema).max(10).optional(),
    subQuestions: z.array(subQuestionSchema).max(10).optional(),
    diagramDescription: z.string().max(3000).optional(),
    topic: z.string().max(500).optional(),
    section: z.string().max(100).optional(),
    subject: z.string().max(100).optional(),
    classNum: strictInt({ min: 6, max: 12 }).optional(),
  })
  .passthrough();

export const paperRequestIdSchema = z.union([
  _positiveInt,
  z
    .string()
    .trim()
    .regex(/^session-\d{10,17}-[a-z0-9]{8,32}$/i, "Invalid session paper id."),
]);

export const evaluationRequestSchema = z.object({
  paperId: paperRequestIdSchema,
  answers: z
    .record(z.string().max(64), answerValueSchema)
    .refine((value) => Object.keys(value).length <= 150, "Too many answers."),
  timeTaken: strictInt({ min: 0, max: 86400 }).optional(),
  paperSnapshot: z.unknown().optional(),
  paperSnapshotToken: z.string().min(32).max(256).optional(),
  guestPaperToken: z.string().min(32).max(256).optional(),
});

export const sessionPaperExportRequestSchema = z.object({
  paperSnapshot: z.unknown(),
  paperSnapshotToken: z.string().min(32).max(256).optional(),
  guestPaperToken: z.string().min(32).max(256).optional(),
  includeAnswers: z.boolean().optional(),
  format: z.enum(["pdf", "json"]).optional(),
});

export const savePaperRequestSchema = z.object({
  paperId: paperRequestIdSchema,
  paperSnapshot: z.unknown(),
  paperSnapshotToken: z.string().min(32).max(256).optional(),
  guestPaperToken: z.string().min(32).max(256).optional(),
});

export const saveProgressSchema = z.object({
  paperId: _positiveInt,
  attemptId: _positiveInt.optional(),
  answers: z.record(z.string().max(64), answerValueSchema).default({}),
  visited: z.array(strictInt({ min: 0 })).max(200).optional(),
  marked: z.array(strictInt({ min: 0 })).max(200).optional(),
  clientSavedAt: z.string().datetime().optional(),
  savedAt: z.string().datetime().optional(),
});

export const uploadFieldsSchema = z.object({
  chapterId: _positiveInt,
  classNum: strictInt({ min: 6, max: 12 }),
  chapterName: boundedText(200),
  subject: boundedText(100),
  demoMode: optionalBooleanSchema,
});

export const extractionRequestSchema = z.object({
  chapterId: _positiveInt,
  objectPath: z.string().trim().min(1).max(512).optional(),
  pdfUrl: z.string().url().max(2048).optional(),
  chapterName: boundedText(200),
  subject: boundedText(100),
  classNum: strictInt({ min: 6, max: 12 }),
  demoMode: z.boolean().optional(),
});

export const pdfSourceIdSchema = _positiveInt;
export const idParamSchema = _positiveInt;
