import type {
  BloomLevel,
  Blueprint,
  ConceptData,
  Difficulty,
  PaperConfig,
  QuestionCompositionItem,
  QuestionType,
} from "@/types";
import {
  bloomDistributionForDifficulty as protocolBloomDistributionForDifficulty,
  targetBloomLevelsForDifficulty as protocolTargetBloomLevelsForDifficulty,
} from "@/lib/difficulty-protocol";

export type QuestionIntelligenceKey = "basic" | "important" | "conceptualTrap";

export interface GenerationArchitecturePlan {
  phases: string[];
  configuration: {
    class: number;
    subjects: string[];
    difficulty: Difficulty;
    examType: string;
    durationMinutes: number;
    questionTarget: number;
    questionFormats: Partial<Record<QuestionType, number>>;
  };
  syllabusIntelligence: {
    conceptCount: number;
    topics: string[];
    importantTopics: string[];
    sourceTypes: string[];
  };
  questionPlanning: {
    questionIntelligence: Record<
      QuestionIntelligenceKey,
      { percentage: number; count: number; goal: string }
    >;
    composition: QuestionCompositionItem[];
  };
  cognitiveDistribution: {
    difficulty: Difficulty;
    targetBloomLevels: BloomLevel[];
    bloomDistribution: Record<BloomLevel, number>;
  };
  conceptWeightage: {
    subject: string;
    chapterName?: string;
    topicName?: string;
    questionCount: number;
    conceptCount: number;
    priority: "HIGH" | "MEDIUM" | "LOW";
    reason: string;
  }[];
}

export const generationPhaseLabels = [
  "Phase 1 - Configuration Understanding",
  "Phase 2 - Syllabus Intelligence",
  "Phase 3 - Question Planning",
  "Phase 4 - Cognitive Distribution",
  "Phase 5 - Question Generation",
  "Phase 6 - Validation Engine",
  "Phase 7 - Final Paper Composition",
];

const questionIntelligencePercentages: Record<QuestionIntelligenceKey, number> = {
  basic: 40,
  important: 35,
  conceptualTrap: 25,
};

const questionIntelligenceGoals: Record<QuestionIntelligenceKey, string> = {
  basic: "Foundational understanding",
  important: "Board-weightage concepts",
  conceptualTrap: "Deep conceptual reasoning",
};

export function bloomDistributionForDifficulty(difficulty: Difficulty) {
  return protocolBloomDistributionForDifficulty(difficulty);
}

export function buildGenerationArchitecturePlan(
  config: PaperConfig,
  blueprint: Blueprint,
  concepts: ConceptData[],
  composition: QuestionCompositionItem[],
): GenerationArchitecturePlan {
  const questionFormats = blueprint.sections.reduce<
    Partial<Record<QuestionType, number>>
  >((acc, section) => {
    acc[section.questionType] = section.count;
    return acc;
  }, {});
  const intelligenceCounts = intelligenceCountsForTotal(blueprint.totalQuestions);
  const topics = unique(concepts.map((concept) => concept.topicName));
  const importantTopics = topConceptTopics(concepts);

  return {
    phases: generationPhaseLabels,
    configuration: {
      class: config.classNum,
      subjects: config.subjects ?? [config.subject],
      difficulty: config.difficulty,
      examType: config.examType,
      durationMinutes: config.duration,
      questionTarget: blueprint.totalQuestions,
      questionFormats,
    },
    syllabusIntelligence: {
      conceptCount: concepts.length,
      topics,
      importantTopics,
      sourceTypes: unique(
        concepts.map((concept) => concept.source ?? "unknown"),
      ),
    },
    questionPlanning: {
      questionIntelligence: {
        basic: {
          percentage: questionIntelligencePercentages.basic,
          count: intelligenceCounts.basic,
          goal: questionIntelligenceGoals.basic,
        },
        important: {
          percentage: questionIntelligencePercentages.important,
          count: intelligenceCounts.important,
          goal: questionIntelligenceGoals.important,
        },
        conceptualTrap: {
          percentage: questionIntelligencePercentages.conceptualTrap,
          count: intelligenceCounts.conceptualTrap,
          goal: questionIntelligenceGoals.conceptualTrap,
        },
      },
      composition,
    },
    cognitiveDistribution: {
      difficulty: config.difficulty,
      targetBloomLevels: targetBloomLevelsForDifficulty(config.difficulty),
      bloomDistribution:
        config.bloomDistribution ?? bloomDistributionForDifficulty(config.difficulty),
    },
    conceptWeightage: buildConceptWeightage(config, concepts, composition),
  };
}

export function intelligenceCountsForTotal(totalQuestions: number) {
  return countsFromPercentages(
    questionIntelligencePercentages,
    Math.max(0, Math.round(totalQuestions)),
  );
}

export function targetBloomLevelsForDifficulty(difficulty: Difficulty): BloomLevel[] {
  return protocolTargetBloomLevelsForDifficulty(difficulty);
}

function buildConceptWeightage(
  config: PaperConfig,
  concepts: ConceptData[],
  composition: QuestionCompositionItem[],
) {
  return composition.map((item) => {
    const matchingConcepts = conceptsForCompositionItem(concepts, item);
    const hotsCount = matchingConcepts.filter((concept) => concept.hotsPotential).length;
    const conceptCount = matchingConcepts.length;
    const priority = priorityFor(item.questionCount, conceptCount, hotsCount);

    return {
      subject: item.subject || config.subject,
      chapterName: item.chapterName,
      topicName: item.topicName,
      questionCount: item.questionCount,
      conceptCount,
      priority,
      reason: reasonForPriority(priority, conceptCount, hotsCount),
    };
  });
}

function conceptsForCompositionItem(
  concepts: ConceptData[],
  item: QuestionCompositionItem,
) {
  if (item.topicId) {
    const byTopicId = concepts.filter(
      (concept) =>
        concept.topicId === item.topicId &&
        conceptMatchesCompositionSubject(concept, item),
    );
    if (byTopicId.length) return byTopicId;
  }

  if (item.topicName) {
    const byTopicName = concepts.filter(
      (concept) =>
        conceptMatchesCompositionSubject(concept, item) &&
        concept.topicName.trim().toLowerCase() ===
        item.topicName?.trim().toLowerCase(),
    );
    if (byTopicName.length) return byTopicName;
  }

  if (item.chapterId) {
    const byChapter = concepts.filter(
      (concept) =>
        concept.chapterId === item.chapterId &&
        conceptMatchesCompositionSubject(concept, item),
    );
    if (byChapter.length) return byChapter;
  }

  return concepts;
}

function conceptMatchesCompositionSubject(
  concept: ConceptData,
  item: QuestionCompositionItem,
) {
  if (!item.subject || !concept.subject) return true;
  return concept.subject.trim().toLowerCase() === item.subject.trim().toLowerCase();
}

function priorityFor(
  questionCount: number,
  conceptCount: number,
  hotsCount: number,
): "HIGH" | "MEDIUM" | "LOW" {
  if (questionCount >= 5 || conceptCount >= 6 || hotsCount >= 2) return "HIGH";
  if (questionCount >= 2 || conceptCount >= 3 || hotsCount >= 1) return "MEDIUM";
  return "LOW";
}

function reasonForPriority(
  priority: "HIGH" | "MEDIUM" | "LOW",
  conceptCount: number,
  hotsCount: number,
) {
  if (priority === "HIGH") {
    return `High weightage due to ${conceptCount} available concepts and ${hotsCount} reasoning opportunities.`;
  }

  if (priority === "MEDIUM") {
    return `Balanced weightage with ${conceptCount} usable concepts and ${hotsCount} reasoning opportunities.`;
  }

  return `Light coverage because this area has ${conceptCount} currently available concepts.`;
}

function topConceptTopics(concepts: ConceptData[]) {
  const scores = new Map<string, number>();

  concepts.forEach((concept) => {
    const score =
      1 +
      Number(concept.hotsPotential) +
      (["FORMULA", "DEFINITION", "EXPERIMENT", "APPLICATION"].includes(
        String(concept.type),
      )
        ? 1
        : 0);
    scores.set(concept.topicName, (scores.get(concept.topicName) ?? 0) + score);
  });

  return Array.from(scores.entries())
    .sort((left, right) => right[1] - left[1])
    .slice(0, 8)
    .map(([topic]) => topic);
}

function countsFromPercentages<T extends string>(
  percentages: Record<T, number>,
  total: number,
) {
  const keys = Object.keys(percentages) as T[];
  const exactCounts = keys.map((key, index) => {
    const exact = (percentages[key] / 100) * total;
    return {
      key,
      index,
      floor: Math.floor(exact),
      fraction: exact - Math.floor(exact),
    };
  });
  const result = exactCounts.reduce<Record<T, number>>((acc, item) => {
    acc[item.key] = item.floor;
    return acc;
  }, {} as Record<T, number>);
  let assigned = keys.reduce((sum, key) => sum + result[key], 0);

  exactCounts
    .sort((left, right) => {
      if (right.fraction !== left.fraction) return right.fraction - left.fraction;
      return left.index - right.index;
    })
    .forEach((item) => {
      if (assigned >= total) return;
      result[item.key] += 1;
      assigned += 1;
    });

  return result;
}

function unique(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}
