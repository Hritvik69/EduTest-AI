export type QuestionType =
  | "MCQ"
  | "ASSERTION_REASON"
  | "TRUE_FALSE"
  | "ONE_WORD"
  | "FILL_BLANK"
  | "VERY_SHORT"
  | "MATCH_FOLLOWING"
  | "SHORT"
  | "NUMERICAL"
  | "SOURCE_BASED"
  | "CASE_BASED"
  | "PARAGRAPH"
  | "HOTS"
  | "COMPETENCY"
  | "DIAGRAM"
  | "PRACTICAL"
  | "LONG"
  | "NCERT_FORMAT";

export type Difficulty = "EASY" | "MEDIUM" | "HARD" | "ABSURD";

export type AIProvider =
  | "AUTO"
  | "GEMINI"
  | "GROQ"
  | "GROK"
  | "MISTRAL"
  | "CEREBRAS"
  | "DEEPSEEK"
  | "OPENROUTER"
  | "GITHUB_MODELS"
  | "COHERE"
  | "CLOUDFLARE"
  | "OPENAI";

export type BloomLevel =
  | "REMEMBER"
  | "UNDERSTAND"
  | "APPLY"
  | "ANALYZE"
  | "EVALUATE"
  | "CREATE";

export type ContentSource = "pdf" | "ncert_txt" | "curriculum" | "demo" | "unknown";
export type PaperSourceMode = "curriculum" | "pdf_upload";
export type AITask =
  | "PDF_EXTRACTION"
  | "QUESTION_GENERATION"
  | "QUESTION_REPLACEMENT"
  | "ANSWER_EVALUATION";

export interface GenerationManifest {
  version: 1;
  generatedAt: string;
  generationJobId?: string;
  idempotencyKey?: string;
  source: {
    mode: PaperSourceMode;
    classNum?: number;
    subject: string;
    subjects?: string[];
    chapterIds: number[];
    topicIds?: number[];
    pdfSourceId?: number;
    pdfTitle?: string;
    pdfFileName?: string;
    pdfFocusPrompt?: string;
    pdfContentHash?: string;
    conceptSource: ContentSource;
    conceptCount: number;
    topicNames: string[];
    sourceQuality?: "strong" | "weak" | "outline_only" | "missing";
    sourceTextChunks?: number;
    extractionMethod?: "AI" | "LOCAL_FALLBACK" | "CACHED_AI" | "CACHED_LOCAL_FALLBACK";
  };
  ai: {
    selectedProvider: AIProvider;
    taskProviderOrder: Partial<Record<AITask, AIProvider[]>>;
    usageSummary?: {
      totalCalls: number;
      successCalls: number;
      failureCalls: number;
      providersUsed: AIProvider[];
      tasksUsed: AITask[];
      totalDurationMs: number;
      estimatedInputTokens: number;
      estimatedOutputTokens: number;
      cacheHits: number;
      errorClasses: string[];
    };
  };
  validation: {
    targetQuestions: number;
    finalQuestions: number;
    targetMarks: number;
    finalMarks: number;
    skippedQuestions: number;
    replacedQuestions: number;
    warnings: string[];
  };
  coverage?: {
    strict: boolean;
    generated: Array<{
      subject: string;
      chapterId?: number;
      chapterName?: string;
      topicId?: number;
      topicName?: string;
      questionType: string;
      requestedQuestions: number;
      generatedQuestions: number;
      generationMode: "ai" | "source_backed_provider_outage";
      sourceConcepts: number;
      sourceTextChunks: number;
      sourceQuality: "strong" | "weak" | "outline_only" | "missing";
    }>;
    planned: Array<{
      subject: string;
      chapterId?: number;
      chapterName?: string;
      topicId?: number;
      topicName?: string;
      questionType: string;
      requestedQuestions: number;
      finalQuestions: number;
    }>;
  };
  warnings: string[];
}

export interface MCQOption {
  id: string;
  text: string;
  isCorrect: boolean;
}

export interface MatchPair {
  left: string;
  right: string;
}

export interface SubQuestion {
  text: string;
  type: QuestionType;
  options?: MCQOption[];
  correctAnswer: string;
  marks: number;
}

export interface CognitiveComplexityMetadata {
  conceptIntegration: number;
  abstractionLevel: number;
  inferenceLevel: number;
  ambiguityLevel: number;
  cognitiveLoad: number;
}

export interface GeneratedQuestion {
  id?: number;
  text: string;
  type: QuestionType;
  difficulty: Difficulty;
  marks: number;
  options?: MCQOption[];
  correctAnswer: string;
  explanation: string;
  keyPoints?: string[];
  bloomLevel: BloomLevel;
  competencyLevel: number;
  reasoningSteps?: number;
  difficultyConfidence?: number;
  cognitiveComplexity?: CognitiveComplexityMetadata;
  validatedDifficulty?: Difficulty;
  scenario?: string;
  assertion?: string;
  reason?: string;
  matchPairs?: MatchPair[];
  subQuestions?: SubQuestion[];
  diagramDescription?: string;
  topic?: string;
  chapterId?: number;
  topicId?: number;
  reused?: boolean;
  section?: string;
  orderNum?: number;
  subject?: string;
  classNum?: number;
  class_num?: number;
  source?: Exclude<ContentSource, "unknown">;
  noveltyAngle?: string;
  sourceChunkFocus?: string;
  answerPath?: string;
}

export interface QuestionCompositionItem {
  subject: string;
  chapterId?: number;
  chapterName?: string;
  topicId?: number;
  topicName?: string;
  questionCount: number;
}

export interface PaperConfig {
  sourceMode?: PaperSourceMode;
  pdfSourceId?: number;
  pdfSource?: UploadedPdfSourceSummary;
  classNum: number;
  subject: string;
  subjects?: string[];
  subjectSelections?: SubjectSelection[];
  chapterIds: number[];
  topicIds?: number[];
  totalMarks: number;
  duration: number;
  examType: string;
  difficulty: Difficulty;
  aiProvider?: AIProvider;
  questionTypes: QuestionType[];
  /** Number of questions requested for each selected question type. */
  typeDistribution: Partial<Record<QuestionType, number>>;
  questionComposition?: QuestionCompositionItem[];
  bloomDistribution: Record<BloomLevel, number>;
  totalQuestions: number;
}

export interface UploadedPdfSourceSummary {
  id: number;
  title: string;
  subject?: string;
  classNum?: number;
  fileName?: string;
  focusPrompt?: string;
  contentHash?: string;
  extractionMethod?: "AI" | "LOCAL_FALLBACK" | "CACHED_AI" | "CACHED_LOCAL_FALLBACK";
  wordCount: number;
  conceptsCount: number;
  topics: string[];
  createdAt?: string;
}

export interface SubjectSelection {
  subject: string;
  chapterIds: number[];
  topicIds?: number[];
}

export interface BlueprintSection {
  name: string;
  questionType: QuestionType;
  count: number;
  marksPerQuestion: number;
  totalMarks: number;
  difficulty: Difficulty;
  difficultyBreakdown: Partial<Record<Difficulty, number>>;
  bloomBreakdown: Partial<Record<BloomLevel, number>>;
}

export interface Blueprint {
  sections: BlueprintSection[];
  totalQuestions: number;
  totalMarks: number;
  estimatedTime: number;
  competencyPercentage: number;
}

export interface EvaluationResult {
  questionId: number;
  questionText?: string;
  questionType?: QuestionType;
  section?: string;
  topic?: string;
  bloomLevel?: BloomLevel;
  marksAwarded: number;
  maxMarks: number;
  isCorrect?: boolean;
  feedback: string;
  missingPoints?: string[];
  strongPoints?: string[];
  studentAnswer: string;
  correctAnswer: string;
  evaluationMethod?: "OBJECTIVE_KEY" | "AI" | "LOCAL_FALLBACK";
}

export interface AnalyticsReport {
  attemptId: number;
  totalScore: number;
  maxScore: number;
  percentage: number;
  grade: string;
  timeTaken: number;
  sectionScores: { section: string; scored: number; max: number }[];
  bloomScores: Partial<Record<BloomLevel, number>>;
  topicAccuracy?: { topic: string; accuracy: number }[];
  weakTopics: { topic: string; accuracy: number }[];
  strongTopics: { topic: string; accuracy: number }[];
  competencyScore: number;
  recommendations: string[];
  questionResults: EvaluationResult[];
}

export interface ChapterTopic {
  id: number;
  name: string;
  importance: "LOW" | "MEDIUM" | "HIGH";
}

export interface ChapterOption {
  id: number;
  name: string;
  status:
    | "NO_PDF"
    | "CURRICULUM_READY"
    | "PDF_READY"
    | "PDF_UPLOADED"
    | "READY"
    | "EXTRACTED";
  difficultyScore: number;
  topics: ChapterTopic[];
  topicsCount?: number;
}

export interface ExtractedConceptTopic {
  name: string;
  importance: "LOW" | "MEDIUM" | "HIGH";
  concepts: {
    text: string;
    type:
      | "DEFINITION"
      | "FORMULA"
      | "EXPERIMENT"
      | "EXAMPLE"
      | "APPLICATION"
      | "ACTIVITY"
      | "FACT";
    bloom_level: BloomLevel;
    hots_potential: boolean;
    learning_outcome?: string;
  }[];
  key_formulas?: string[];
  key_experiments?: string[];
  real_life_applications?: string[];
  common_misconceptions?: string[];
}

export interface ConceptData {
  text: string;
  type: string;
  bloomLevel: BloomLevel | string;
  hotsPotential: boolean;
  hotsPoential?: boolean;
  subject?: string;
  classNum?: number;
  chapterName?: string;
  topicName: string;
  topicId?: number;
  chapterId: number;
  source?: ContentSource;
}

export interface StoredPaper {
  id: number;
  title: string;
  config: PaperConfig;
  blueprint: Blueprint;
  questions: GeneratedQuestion[];
  isDemoMode: boolean;
  status: "GENERATING" | "READY" | "FAILED";
  createdAt: string;
  errorMetadata?: Record<string, unknown> | null;
  manifest?: GenerationManifest;
  generationJobId?: string | null;
  idempotencyKey?: string | null;
  guestPaperToken?: string;
}

export interface StoredAttempt {
  attemptId: number;
  paperId?: number;
  totalScore: number;
  maxScore: number;
  percentage: number;
  grade: string;
  timeTaken: number;
  sectionScores?: { section: string; scored: number; max: number }[];
  topicAccuracy?: { topic: string; accuracy: number }[];
  questionResults: EvaluationResult[];
  bloomScores: Partial<Record<BloomLevel, number>>;
  weakTopics: { topic: string; accuracy: number }[];
  strongTopics: { topic: string; accuracy: number }[];
  competencyScore: number;
  recommendations: string[];
  createdAt: string;
  isDemoMode?: boolean;
  generationManifest?: GenerationManifest;
  paperTitle?: string;
  subject?: string;
  classNum?: number;
}
