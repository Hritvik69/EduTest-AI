import { validatePaperKeepingValidQuestions } from "@/lib/validator";
import type {
  Blueprint,
  BlueprintSection,
  GeneratedQuestion,
  PaperConfig,
  QuestionType,
} from "@/types";

export type GenerationStateStatus =
  | "IN_PROGRESS"
  | "NEEDS_CONTINUATION"
  | "READY"
  | "FAILED";

export type GenerationStatePhase =
  | "INITIAL_GENERATION"
  | "VALIDATION"
  | "REPAIR"
  | "FINALIZING";

export interface PaperGenerationState {
  version: 1;
  status: GenerationStateStatus;
  phase: GenerationStatePhase;
  generationJobId: string;
  idempotencyKey: string;
  sourceContextHash: string;
  config: PaperConfig;
  blueprint: Blueprint;
  candidateQuestions: GeneratedQuestion[];
  acceptedQuestions: GeneratedQuestion[];
  rejectedQuestions: ReturnType<typeof validatePaperKeepingValidOrEmpty>["rejectedQuestions"];
  duplicateGroups: string[][];
  missingSections: BlueprintSection[];
  rejectionReasons: ReturnType<typeof validatePaperKeepingValidOrEmpty>["rejectionReasons"];
  targetQuestionCount: number;
  readyQuestionCount: number;
  missingQuestionCount: number;
  attemptCount: number;
  createdAt: string;
  updatedAt: string;
  lastMessage?: string;
  lastError?: string;
}

export class QuestionCandidateBank {
  private candidates: GeneratedQuestion[];
  private validation: ReturnType<typeof validatePaperKeepingValidOrEmpty>;
  private readonly initialReadyCount: number;

  constructor(
    initialCandidates: GeneratedQuestion[],
    private readonly blueprint: Blueprint,
    private readonly config: PaperConfig,
    options: { initialReadyCount?: number } = {},
  ) {
    this.candidates = [...initialCandidates];
    this.validation = validatePaperKeepingValidOrEmpty(
      this.candidates,
      this.blueprint,
      this.config,
    );
    this.initialReadyCount = options.initialReadyCount ?? this.readyCount();
  }

  static fromGenerationState(
    state: PaperGenerationState,
    blueprint = state.blueprint,
    config = state.config,
  ) {
    return new QuestionCandidateBank(state.candidateQuestions, blueprint, config, {
      initialReadyCount: state.readyQuestionCount,
    });
  }

  add(candidates: GeneratedQuestion[]) {
    if (!candidates.length) return;
    this.candidates.push(...candidates);
    this.validation = validatePaperKeepingValidOrEmpty(
      this.candidates,
      this.blueprint,
      this.config,
    );
  }

  tryAdd(candidate: GeneratedQuestion) {
    const previousReady = this.readyCount();
    const previousMissing = this.missingCount();
    const nextCandidates = [...this.candidates, candidate];
    const nextValidation = validatePaperKeepingValidOrEmpty(
      nextCandidates,
      this.blueprint,
      this.config,
    );
    const nextReady = countQuestionsForBlueprint(
      nextValidation.questions,
      this.blueprint,
    );
    const nextMissing = missingSectionsForBlueprint(
      nextValidation.questions,
      this.blueprint,
    ).reduce((sum, section) => sum + section.count, 0);

    if (nextReady <= previousReady && nextMissing >= previousMissing) {
      return false;
    }

    this.candidates = nextCandidates;
    this.validation = nextValidation;
    return true;
  }

  result() {
    return this.validation;
  }

  allCandidates() {
    return [...this.candidates];
  }

  missingSections() {
    return missingSectionsForBlueprint(this.validation.questions, this.blueprint);
  }

  missingCount() {
    return this.missingSections().reduce((sum, section) => sum + section.count, 0);
  }

  readyCount() {
    return countQuestionsForBlueprint(this.validation.questions, this.blueprint);
  }

  replacedQuestions() {
    return Math.max(0, this.readyCount() - this.initialReadyCount);
  }

  repairFeedback(attempt: number) {
    const missingSections = this.missingSections();

    return {
      attempt,
      missingSections: missingSections.map((section) => ({
        type: section.questionType,
        count: section.count,
        marks: section.marksPerQuestion,
      })),
      rejectedQuestions: this.validation.rejectedQuestions
        .slice(-16)
        .map((item) => ({
          type: item.type,
          reason: item.reason,
          question: item.question,
          text: item.question?.text,
        })),
      duplicateGroups: this.validation.duplicateGroups.slice(-10),
    };
  }

  toGenerationState({
    status,
    phase,
    generationJobId,
    idempotencyKey,
    sourceContextHash,
    attemptCount,
    createdAt,
    lastMessage,
    lastError,
  }: {
    status: GenerationStateStatus;
    phase: GenerationStatePhase;
    generationJobId: string;
    idempotencyKey: string;
    sourceContextHash: string;
    attemptCount: number;
    createdAt?: string;
    lastMessage?: string;
    lastError?: string;
  }): PaperGenerationState {
    const missingSections = this.missingSections();
    const missingQuestionCount = missingSections.reduce(
      (sum, section) => sum + section.count,
      0,
    );

    return {
      version: 1,
      status,
      phase,
      generationJobId,
      idempotencyKey,
      sourceContextHash,
      config: this.config,
      blueprint: this.blueprint,
      candidateQuestions: this.allCandidates(),
      acceptedQuestions: this.validation.questions,
      rejectedQuestions: this.validation.rejectedQuestions,
      duplicateGroups: this.validation.duplicateGroups,
      missingSections,
      rejectionReasons: this.validation.rejectionReasons,
      targetQuestionCount: this.blueprint.totalQuestions,
      readyQuestionCount: this.readyCount(),
      missingQuestionCount,
      attemptCount,
      createdAt: createdAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      ...(lastMessage ? { lastMessage } : {}),
      ...(lastError ? { lastError } : {}),
    };
  }
}

export function validatePaperKeepingValidOrEmpty(
  questions: GeneratedQuestion[],
  blueprint: Blueprint,
  config: PaperConfig,
) {
  try {
    return validatePaperKeepingValidQuestions(questions, blueprint, config);
  } catch (error) {
    if (
      error instanceof Error &&
      /No valid generated questions were available/i.test(error.message)
    ) {
      return {
        questions: [],
        validQuestions: [],
        blueprint: {
          ...blueprint,
          sections: [],
          totalQuestions: 0,
          totalMarks: 0,
        },
        config: {
          ...config,
          questionTypes: [],
          typeDistribution: {},
          totalQuestions: 0,
          totalMarks: 0,
        },
        skipped: questions.map((question, index) => ({
          type: question.type,
          position: index + 1,
          reason: "invalid-structure",
        })),
        rejectedQuestions: questions.map((question, index) => ({
          question,
          type: question.type,
          position: index + 1,
          reason: "WRONG_FORMAT" as const,
        })),
        missingSections: blueprint.sections,
        rejectionReasons: { WRONG_FORMAT: questions.length },
        duplicateGroups: [],
        sourceMismatchWarnings: [],
      };
    }

    throw error;
  }
}

export function repairCandidateReserveCount(missingCount: number) {
  if (missingCount <= 1) return 5;
  return Math.min(8, Math.max(4, Math.ceil(missingCount * 1.5)));
}

export function stripGenerationMetadataFromQuestions(
  questions: GeneratedQuestion[],
) {
  return questions.map((question) => {
    const {
      noveltyAngle: _noveltyAngle,
      sourceChunkFocus: _sourceChunkFocus,
      answerPath: _answerPath,
      ...rest
    } = question;
    return rest;
  });
}

export function blueprintForSections(
  blueprint: Blueprint,
  sections: BlueprintSection[],
): Blueprint {
  return {
    ...blueprint,
    sections,
    totalQuestions: sections.reduce((sum, section) => sum + section.count, 0),
    totalMarks: sections.reduce((sum, section) => sum + section.totalMarks, 0),
  };
}

export function missingSectionsForBlueprint(
  questions: GeneratedQuestion[],
  blueprint: Blueprint,
) {
  const counts = questionCountsByType(questions);

  return blueprint.sections
    .map((section) => {
      const missing = Math.max(
        0,
        section.count - (counts.get(section.questionType) ?? 0),
      );

      if (!missing) return null;

      return {
        ...section,
        count: missing,
        totalMarks: missing * section.marksPerQuestion,
      };
    })
    .filter((section): section is BlueprintSection => Boolean(section));
}

export function countQuestionsForBlueprint(
  questions: GeneratedQuestion[],
  blueprint: Blueprint,
) {
  const counts = questionCountsByType(questions);

  return blueprint.sections.reduce(
    (sum, section) =>
      sum + Math.min(section.count, counts.get(section.questionType) ?? 0),
    0,
  );
}

function questionCountsByType(questions: GeneratedQuestion[]) {
  return questions.reduce((counts, question) => {
    counts.set(question.type, (counts.get(question.type) ?? 0) + 1);
    return counts;
  }, new Map<QuestionType, number>());
}
