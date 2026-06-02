import { isDuplicateQuestion } from "@/lib/question-duplicates";
import { isSourceTextConcept } from "@/lib/source-types";
import type {
  BloomLevel,
  BlueprintSection,
  ConceptData,
  Difficulty,
  GeneratedQuestion,
  MCQOption,
  PaperConfig,
  QuestionType,
  SubQuestion,
} from "@/types";

type FallbackOptions = {
  existingQuestions?: GeneratedQuestion[];
  startIndex?: number;
};

export function generateSourceBackedFallbackQuestions(
  sections: BlueprintSection[],
  concepts: ConceptData[],
  config: PaperConfig,
  options: FallbackOptions = {},
) {
  const existing = [...(options.existingQuestions ?? [])];
  const conceptPool = normalizeConceptPool(concepts, config);
  if (!conceptPool.length) return [];

  let globalIndex = options.startIndex ?? existing.length;
  const generated: GeneratedQuestion[] = [];

  for (const section of sections) {
    let attempts = 0;
    while (
      generated.filter((question) => question.type === section.questionType).length <
        section.count &&
      attempts < section.count * Math.max(8, conceptPool.length)
    ) {
      const concept = conceptPool[globalIndex % conceptPool.length];
      const question = createSourceBackedQuestion(
        section.questionType,
        section,
        config,
        concept,
        globalIndex + 1,
      );

      attempts += 1;
      globalIndex += 1;

      if (
        [...existing, ...generated].some((item) =>
          isDuplicateQuestion(item, question),
        )
      ) {
        question.text = `${question.text} Use the ${variantFor(globalIndex)} perspective from ${concept.chapter}: ${trimToSentence(concept.summary, 90)}`;
      }

      generated.push(question);
    }
  }

  return generated;
}

export function hasSourceBackedFallbackConcepts(concepts: ConceptData[]) {
  return sourceBackedConcepts(concepts).length > 0;
}

function createSourceBackedQuestion(
  type: QuestionType,
  section: BlueprintSection,
  config: PaperConfig,
  concept: NormalizedConcept,
  index: number,
): GeneratedQuestion {
  const base = baseQuestion(type, concept, index, section.marksPerQuestion);

  const question: GeneratedQuestion = {
    ...base,
    text: base.text ?? `Explain ${concept.topic} from the selected chapter.`,
    type,
    marks: section.marksPerQuestion,
    correctAnswer: base.correctAnswer ?? concept.summary,
    difficulty: config.difficulty,
    bloomLevel: bloomFor(type, config.difficulty),
    competencyLevel: type === "MCQ" || type === "TRUE_FALSE" ? 2 : 3,
    reasoningSteps: reasoningStepsFor(config.difficulty),
    difficultyConfidence: 0.72,
    cognitiveComplexity: {
      conceptIntegration: complexityFor(config.difficulty),
      abstractionLevel: complexityFor(config.difficulty),
      inferenceLevel: Math.max(1, complexityFor(config.difficulty) - 1),
      ambiguityLevel: 1,
      cognitiveLoad: complexityFor(config.difficulty),
    },
    topic: concept.topic,
    chapterId: concept.chapterId,
    subject: concept.subject,
    classNum: concept.classNum,
    source: concept.source,
    explanation:
      base.explanation ||
      `The answer is grounded in the selected chapter concept: ${concept.summary}.`,
  };

  if (concept.topicId !== undefined) question.topicId = concept.topicId;
  return question;
}

function baseQuestion(
  type: QuestionType,
  concept: NormalizedConcept,
  index: number,
  marks: number,
): Partial<GeneratedQuestion> {
  const topic = concept.topic;
  const summary = concept.summary;
  const excerpt = concept.excerpt;
  const options = conceptOptions(concept, index);
  const variant = variantFor(index);

  switch (type) {
    case "MCQ":
      return {
        text: `According to the selected chapter, which ${variant} statement best explains ${topic}?`,
        options,
        correctAnswer: "B",
      };
    case "ASSERTION_REASON":
      return {
        text: `Assertion (A): ${topic} is important in the selected chapter.\nReason (R): ${summary}`,
        assertion: `${topic} is important in the selected chapter.`,
        reason: summary,
        correctAnswer: "A",
      };
    case "TRUE_FALSE":
      return {
        text: `In the selected chapter, the ${variant} idea shows that ${summary}`,
        correctAnswer: "True",
      };
    case "ONE_WORD":
      return {
        text: `Which key term from the selected chapter is connected with this ${variant} idea: ${summary}?`,
        correctAnswer: oneWordAnswer(topic),
      };
    case "FILL_BLANK":
      return {
        text: `In the selected chapter, ________ is connected with this ${variant} idea: ${summary}`,
        correctAnswer: topic,
      };
    case "VERY_SHORT":
      return {
        text: `State one ${variant} point about ${topic} from the selected chapter.`,
        correctAnswer: summary,
        keyPoints: [summary],
      };
    case "MATCH_FOLLOWING":
      return matchQuestion(concept);
    case "SHORT":
      return {
        text: `Explain ${topic} using ${variant} evidence from the selected chapter.`,
        correctAnswer: `${summary} This point is important because it supports the chapter's main idea and helps answer related NCERT-style questions.`,
        keyPoints: [summary, `Connect the answer to ${topic}.`, "Use selected chapter evidence."],
      };
    case "NUMERICAL":
      return {
        text: `A learner identifies 3 examples of ${topic} from the selected chapter and then adds 2 more related examples. How many examples are there in total?`,
        correctAnswer: "5 examples",
        keyPoints: ["Add the two counts.", "3 + 2 = 5.", "Final answer: 5 examples."],
      };
    case "SOURCE_BASED":
      return sourceBasedQuestion(concept);
    case "CASE_BASED":
      return caseBasedQuestion(concept);
    case "PARAGRAPH":
      return {
        scenario: excerpt,
        text: `Based on the selected chapter extract, explain the role of ${topic}.`,
        correctAnswer: `${summary} The answer should refer to the selected extract and explain the idea in the student's own words.`,
        keyPoints: [summary, "Refer to the extract.", "Explain the idea clearly."],
      };
    case "HOTS":
      return {
        text: `How would the meaning of the selected chapter change if ${topic} were removed or misunderstood? Justify your answer.`,
        correctAnswer: `${topic} is needed because ${summary} Without it, the explanation or interpretation would become incomplete.`,
        keyPoints: [summary, "Explain the effect.", "Justify with selected chapter context."],
      };
    case "COMPETENCY":
      return {
        text: `Apply the selected chapter idea of ${topic} to a new classroom example and explain your reasoning.`,
        correctAnswer: `A correct answer applies this idea: ${summary} The example should stay connected to the selected chapter and include a clear reason.`,
        keyPoints: [summary, "Give a relevant example.", "Explain the reason."],
      };
    case "DIAGRAM":
      return {
        text: `Draw or label a simple concept map for ${topic} from the selected chapter.`,
        diagramDescription: `A concept map with ${topic} at the centre and connected points from the selected chapter.`,
        correctAnswer: `The diagram should show ${topic} and include this key idea: ${summary}`,
        keyPoints: [topic, summary],
      };
    case "PRACTICAL":
      return {
        text: `Design a short classroom activity to demonstrate ${topic} from the selected chapter.`,
        correctAnswer: `Use a simple activity or observation related to ${topic}. The conclusion should show: ${summary}`,
        keyPoints: ["Aim", "Procedure", "Observation", "Conclusion"],
      };
    case "LONG":
      return {
        text: `Write a detailed answer on ${topic} using only the selected chapter context.`,
        correctAnswer: `Introduction: ${topic} is a key idea in the selected chapter. Explanation: ${summary} Add supporting points from the chapter, connect them logically, and conclude with why this idea matters.`,
        keyPoints: ["Introduce the topic.", summary, "Add supporting selected-chapter points.", "Conclude clearly."],
      };
    case "NCERT_FORMAT":
      return {
        text: `Explain ${topic} in NCERT style using the selected chapter context.`,
        correctAnswer: summary,
        keyPoints: [summary],
      };
  }
}

function sourceBasedQuestion(concept: NormalizedConcept): Partial<GeneratedQuestion> {
  const subQuestions: SubQuestion[] = [
    shortSubQuestion(`Identify the main idea in the extract.`, concept.topic, 1),
    shortSubQuestion(`What does the extract suggest about ${concept.topic}?`, concept.summary, 1),
    shortSubQuestion(`Give one supporting point from the extract.`, concept.excerpt, 1),
    shortSubQuestion(`Why is this idea important in the chapter?`, concept.summary, 1),
  ];

  return {
    scenario: concept.excerpt,
    text: "Read the selected chapter extract and answer the questions.",
    subQuestions,
    correctAnswer: subQuestions
      .map((question, index) => `(${index + 1}) ${question.correctAnswer}`)
      .join("; "),
  };
}

function caseBasedQuestion(concept: NormalizedConcept): Partial<GeneratedQuestion> {
  const options = conceptOptions(concept, 1);
  const subQuestions: SubQuestion[] = [
    {
      text: `Which option best explains the case using ${concept.topic}?`,
      type: "MCQ",
      options,
      correctAnswer: "B",
      marks: 2,
    },
    {
      text: `Explain the reason using the selected chapter context.`,
      type: "SHORT",
      correctAnswer: concept.summary,
      marks: 2,
    },
  ];

  return {
    scenario: `A student studies this selected chapter idea: ${concept.summary} The student now has to apply it to explain ${concept.topic}.`,
    text: "Read the case and answer the questions.",
    subQuestions,
    correctAnswer: `(1) B; (2) ${concept.summary}`,
  };
}

function matchQuestion(concept: NormalizedConcept): Partial<GeneratedQuestion> {
  const pairs = [
    { left: concept.topic, right: "Main selected concept" },
    { left: "Chapter evidence", right: concept.summary },
    { left: "Application", right: "Use the idea in a new answer" },
    { left: "Conclusion", right: "Connect back to the chapter" },
  ];

  return {
    text: `Match Column A with Column B for ${concept.topic}.`,
    matchPairs: pairs,
    correctAnswer: "A1-B1, A2-B2, A3-B3, A4-B4",
  };
}

function shortSubQuestion(text: string, correctAnswer: string, marks: number): SubQuestion {
  return {
    text,
    type: "VERY_SHORT",
    correctAnswer: trimToSentence(correctAnswer, 180),
    marks,
  };
}

function conceptOptions(concept: NormalizedConcept, index: number): MCQOption[] {
  return [
    { id: "A", text: "An unrelated idea from another chapter", isCorrect: false },
    { id: "B", text: trimToSentence(concept.summary, 140), isCorrect: true },
    { id: "C", text: `Only the title ${concept.topic} without explanation`, isCorrect: false },
    { id: "D", text: `A general answer not grounded in the selected source ${index}`, isCorrect: false },
  ];
}

type NormalizedConcept = {
  summary: string;
  excerpt: string;
  topic: string;
  chapter: string;
  topicId?: number;
  chapterId: number;
  subject?: string;
  classNum?: number;
  source: Exclude<ConceptData["source"], "unknown">;
};

function normalizeConceptPool(
  concepts: ConceptData[],
  config: PaperConfig,
): NormalizedConcept[] {
  const pool = sourceBackedConcepts(concepts)
    .map((concept): NormalizedConcept | null => {
      const summary = trimToSentence(concept.text, 220);
      if (!summary) return null;

      const normalized: NormalizedConcept = {
        summary,
        excerpt: trimToSentence(concept.text, 520),
        topic: concept.topicName?.trim() || concept.chapterName || config.subject,
        chapter: concept.chapterName || `Chapter ${concept.chapterId}`,
        chapterId: concept.chapterId,
        subject: concept.subject ?? config.subject,
        classNum: concept.classNum ?? config.classNum,
        source:
          concept.source === "pdf" || concept.source === "ncert_txt"
            ? concept.source
            : "curriculum",
      };

      if (concept.topicId !== undefined) normalized.topicId = concept.topicId;
      return normalized;
    })
    .filter((concept): concept is NormalizedConcept => Boolean(concept));

  return pool;
}

function sourceBackedConcepts(concepts: ConceptData[]) {
  return concepts.filter((concept) => {
    const text = concept.text.replace(/\s+/g, " ").trim();
    return isSourceTextConcept(concept) && text.length >= 80;
  });
}

function trimToSentence(value: string, maxLength: number) {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) return normalized;

  const sliced = normalized.slice(0, maxLength).trim();
  return `${sliced.replace(/[,.!?;:]+$/, "")}.`;
}

function oneWordAnswer(topic: string) {
  return topic.split(/\s+/).filter(Boolean).slice(0, 2).join(" ") || "Concept";
}

function variantFor(index: number) {
  const variants = [
    "evidence",
    "application",
    "inference",
    "contrast",
    "context",
    "reasoning",
    "theme",
    "example",
  ];

  return variants[index % variants.length];
}

function bloomFor(type: QuestionType, difficulty: Difficulty): BloomLevel {
  if (type === "HOTS" || difficulty === "ABSURD") return "EVALUATE";
  if (type === "COMPETENCY" || type === "CASE_BASED") return "APPLY";
  if (difficulty === "HARD") return "ANALYZE";
  if (difficulty === "EASY") return "UNDERSTAND";
  return "UNDERSTAND";
}

function reasoningStepsFor(difficulty: Difficulty) {
  if (difficulty === "ABSURD") return 5;
  if (difficulty === "HARD") return 4;
  if (difficulty === "MEDIUM") return 3;
  return 2;
}

function complexityFor(difficulty: Difficulty) {
  if (difficulty === "ABSURD") return 5;
  if (difficulty === "HARD") return 4;
  if (difficulty === "MEDIUM") return 3;
  return 2;
}
