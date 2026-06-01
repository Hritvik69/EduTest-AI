import type {
  Blueprint,
  BlueprintSection,
  GeneratedQuestion,
  PaperConfig,
  QuestionType,
} from "@/types";
import {
  normalizeQuestionDifficulty,
  validateFinalDifficultyDistribution,
} from "@/lib/difficulty-protocol";
import { isDuplicateQuestionText } from "@/lib/question-duplicates";
import {
  normalizeQuestionStructure,
  summarizeSubQuestionAnswers,
} from "@/lib/question-structure";
import { isUsableGeneratedQuestion } from "@/lib/question-validation";

export async function validatePaper(
  questions: GeneratedQuestion[],
  blueprint: Blueprint,
  config: PaperConfig,
) {
  const cleaned: GeneratedQuestion[] = [];

  for (const section of blueprint.sections) {
    const sectionQuestions = questions.filter(
      (question) => question.type === section.questionType,
    );

    for (let index = 0; index < section.count; index += 1) {
      const question = sectionQuestions[index];
      const normalizedQuestion = question ? normalizeQuestion(question, section) : null;
      const difficultyChecked = normalizedQuestion
        ? normalizeQuestionDifficulty(
            normalizedQuestion,
            config.difficulty,
            section.questionType,
          )
        : null;
      if (
        difficultyChecked?.valid &&
        isValidQuestion(difficultyChecked.question, section)
      ) {
        cleaned.push(difficultyChecked.question);
        continue;
      }

      throw new Error(
        `Invalid ${section.questionType} question at position ${index + 1}.`,
      );
    }
  }

  const deduped = removeDuplicates(cleaned);
  const totalMarks = deduped.reduce((sum, question) => sum + question.marks, 0);
  if (totalMarks !== blueprint.totalMarks) {
    throw new Error(
      `Validated paper has ${totalMarks} marks, expected ${blueprint.totalMarks}.`,
    );
  }
  validateFinalDifficultyDistribution(deduped, config.difficulty);

  return deduped.map((question, index) => ({
    ...question,
    id: question.id ?? index + 1,
    orderNum: index + 1,
  }));
}

export function validatePaperKeepingValidQuestions(
  questions: GeneratedQuestion[],
  blueprint: Blueprint,
  config: PaperConfig,
) {
  const cleaned: GeneratedQuestion[] = [];
  const skipped: Array<{ type: QuestionType; position: number; reason: string }> = [];

  for (const section of blueprint.sections) {
    const sectionQuestions = questions.filter(
      (question) => question.type === section.questionType,
    );
    let acceptedInSection = 0;

    for (
      let index = 0;
      index < sectionQuestions.length && acceptedInSection < section.count;
      index += 1
    ) {
      const question = sectionQuestions[index];
      let normalizedQuestion: GeneratedQuestion;
      let difficultyChecked: ReturnType<typeof normalizeQuestionDifficulty>;

      try {
        normalizedQuestion = normalizeQuestion(question, section);
        difficultyChecked = normalizeQuestionDifficulty(
          normalizedQuestion,
          config.difficulty,
          section.questionType,
        );
      } catch {
        skipped.push({
          type: section.questionType,
          position: index + 1,
          reason: "invalid-structure",
        });
        continue;
      }

      if (!isValidQuestion(normalizedQuestion, section)) {
        skipped.push({
          type: section.questionType,
          position: index + 1,
          reason: "invalid-structure",
        });
        continue;
      }

      if (!difficultyChecked.valid) {
        skipped.push({
          type: section.questionType,
          position: index + 1,
          reason: "difficulty-governance",
        });
        continue;
      }

      if (
        cleaned.some((existing) =>
          isDuplicateQuestionText(existing.text, difficultyChecked.question.text),
        )
      ) {
        skipped.push({
          type: section.questionType,
          position: index + 1,
          reason: "duplicate",
        });
        continue;
      }

      cleaned.push(difficultyChecked.question);
      acceptedInSection += 1;
    }
  }

  if (!cleaned.length) {
    throw new Error("No valid generated questions were available for this paper.");
  }

  const finalQuestions = cleaned.map((question, index) => ({
    ...question,
    id: question.id ?? index + 1,
    orderNum: index + 1,
  }));
  const finalBlueprint = blueprintForValidatedQuestions(blueprint, finalQuestions);

  return {
    questions: finalQuestions,
    blueprint: finalBlueprint,
    config: configForValidatedQuestions(config, finalBlueprint),
    skipped,
  };
}

function isValidQuestion(question: GeneratedQuestion, section: BlueprintSection) {
  return isUsableGeneratedQuestion(question, section);
}

function normalizeQuestion(question: GeneratedQuestion, section: BlueprintSection) {
  const normalizedQuestion = normalizeQuestionStructure(question, section);
  const correctAnswer =
    normalizedQuestion.correctAnswer || summarizeSubQuestionAnswers(normalizedQuestion);

  return {
    ...normalizedQuestion,
    correctAnswer,
    marks: section.marksPerQuestion,
    section: section.name,
    bloomLevel: normalizedQuestion.bloomLevel ?? "UNDERSTAND",
    competencyLevel: normalizedQuestion.competencyLevel ?? 2,
    explanation:
      normalizedQuestion.explanation ||
      defaultExplanation(normalizedQuestion, correctAnswer) ||
      "The answer follows the selected NCERT concept.",
  };
}

function removeDuplicates(questions: GeneratedQuestion[]) {
  return questions.map((question, index) => {
    const duplicate = questions
      .slice(0, index)
      .some((existing) => isDuplicateQuestionText(existing.text, question.text));

    if (!duplicate) return question;

    throw new Error(
      `Duplicate question detected near position ${index + 1}: ${question.type}.`,
    );
  });
}

function defaultExplanation(question: GeneratedQuestion, correctAnswer: string) {
  if (question.subQuestions?.length) {
    return "Marks are awarded according to the correctness of each sub-question answer.";
  }

  if (question.keyPoints?.length) {
    return `A complete answer should include: ${question.keyPoints.join(", ")}.`;
  }

  if (correctAnswer) {
    return "The answer is accepted when it matches the expected NCERT concept and reasoning.";
  }

  return "";
}

function blueprintForValidatedQuestions(
  blueprint: Blueprint,
  questions: GeneratedQuestion[],
): Blueprint {
  const sections = blueprint.sections
    .map((section) => {
      const count = questions.filter(
        (question) => question.type === section.questionType,
      ).length;
      if (!count) return null;

      return {
        ...section,
        count,
        totalMarks: count * section.marksPerQuestion,
      };
    })
    .filter((section): section is BlueprintSection => section !== null);

  return {
    ...blueprint,
    sections,
    totalQuestions: questions.length,
    totalMarks: sections.reduce((sum, section) => sum + section.totalMarks, 0),
  };
}

function configForValidatedQuestions(
  config: PaperConfig,
  blueprint: Blueprint,
): PaperConfig {
  const typeDistribution = blueprint.sections.reduce<
    Partial<Record<QuestionType, number>>
  >((acc, section) => {
    acc[section.questionType] = section.count;
    return acc;
  }, {});

  return {
    ...config,
    questionTypes: blueprint.sections.map((section) => section.questionType),
    typeDistribution,
    totalQuestions: blueprint.totalQuestions,
    totalMarks: blueprint.totalMarks,
  };
}
