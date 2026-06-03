import { isDuplicateQuestion } from "@/lib/question-duplicates";
import { QuestionCandidateBank } from "@/lib/question-candidate-bank";
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

export const sourceBackedCompletionMarker = "SOURCE_BACKED_COMPLETION";

export function completeQuestionBankWithSourceBackedFallback({
  bank,
  concepts,
  config,
  startIndex,
  maxCandidatesPerMissing = 96,
}: {
  bank: QuestionCandidateBank;
  concepts: ConceptData[];
  config: PaperConfig;
  startIndex?: number;
  maxCandidatesPerMissing?: number;
}) {
  const missingBefore = bank.missingCount();
  if (missingBefore <= 0) return [] satisfies GeneratedQuestion[];

  const conceptPool = normalizeConceptPool(concepts, config);
  if (!conceptPool.length) return [] satisfies GeneratedQuestion[];

  const accepted: GeneratedQuestion[] = [];
  const candidateSpace = sourceBackedCandidateSpaceSize(conceptPool);
  const maxAttempts = Math.min(
    candidateSpace,
    Math.max(missingBefore * Math.max(1, Math.floor(maxCandidatesPerMissing)), candidateSpace),
  );
  const startSequence = startIndex ?? bank.allCandidates().length + 101;
  const comparisonQuestions = bank.allCandidates();
  let attempts = 0;

  while (bank.missingCount() > 0 && attempts < maxAttempts) {
    const missingSections = bank.missingSections();
    const section = missingSections[attempts % Math.max(1, missingSections.length)];
    if (!section) break;
    const candidate = sourceBackedQuestionForSequence(
      section,
      config,
      conceptPool,
      startSequence + attempts,
    );

    attempts += 1;
    if (
      comparisonQuestions.some((item) =>
        isDuplicateQuestion(item, candidate),
      )
    ) {
      continue;
    }

    if (bank.tryAdd(candidate)) {
      comparisonQuestions.push(candidate);
      accepted.push(candidate);
      continue;
    }
  }

  return accepted;
}

export function generateSourceBackedFallbackQuestions(
  sections: BlueprintSection[],
  concepts: ConceptData[],
  config: PaperConfig,
  options: FallbackOptions = {},
) {
  const existing = [...(options.existingQuestions ?? [])];
  const conceptPool = normalizeConceptPool(concepts, config);
  if (!conceptPool.length) return [];

  let globalIndex = options.startIndex ?? existing.length + 1;
  const generated: GeneratedQuestion[] = [];

  for (const section of sections) {
    let acceptedInSection = 0;
    let attempts = 0;
    const maxAttempts = sourceBackedCandidateSpaceSize(conceptPool);

    while (
      acceptedInSection < section.count &&
      attempts < maxAttempts
    ) {
      const question = sourceBackedQuestionForSequence(
        section,
        config,
        conceptPool,
        globalIndex,
      );

      attempts += 1;
      globalIndex += 1;

      if (
        [...existing, ...generated].some((item) =>
          isDuplicateQuestion(item, question),
        )
      ) {
        continue;
      }

      generated.push(question);
      acceptedInSection += 1;
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
  const variant = variantRecipeFor(index);
  const base = baseQuestion(type, concept, index, section.marksPerQuestion, variant);
  const sourceFocus = `${variant.sourceFocus} ${concept.atomId}: ${trimToSentence(concept.summary, 150)} Lens: ${variant.label}.`;
  const answerPath = `${variant.answerPath} ${topicSentence(concept.topic)} Use source detail ${concept.atomId} (${concept.atomLabel}) through the ${variant.label} lens to ${variant.answerVerb} the selected ${concept.source === "pdf" ? "PDF" : "NCERT TXT"} idea.`;

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
    noveltyAngle: `${sourceBackedCompletionMarker}:${type}:${variant.id}:${concept.atomId}:${index}`,
    sourceChunkFocus: sourceFocus,
    answerPath,
    explanation:
      base.explanation ||
      `${variant.explanationLead}: ${concept.summary}`,
  };

  if (concept.topicId !== undefined) question.topicId = concept.topicId;
  return question;
}

function sourceBackedQuestionForSequence(
  section: BlueprintSection,
  config: PaperConfig,
  conceptPool: NormalizedConcept[],
  sequence: number,
) {
  const normalizedSequence = Math.max(0, Math.floor(sequence));
  const slotCount = variantSlotCount();
  const concept =
    conceptPool[
      Math.floor(normalizedSequence / slotCount) % conceptPool.length
    ];

  return createSourceBackedQuestion(
    section.questionType,
    section,
    config,
    concept,
    normalizedSequence + 1,
  );
}

function sourceBackedCandidateSpaceSize(conceptPool: NormalizedConcept[]) {
  return Math.max(1, conceptPool.length * variantSlotCount());
}

function baseQuestion(
  type: QuestionType,
  concept: NormalizedConcept,
  index: number,
  marks: number,
  variant: VariantRecipe,
): Partial<GeneratedQuestion> {
  const topic = concept.topic;
  const summary = concept.summary;
  const excerpt = concept.excerpt;
  const options = conceptOptions(concept, index, variant);
  const stemTopic = `${topic} in ${concept.chapter}`;
  const atomPrompt = `source detail ${concept.atomId} on ${concept.atomLabel}`;

  switch (type) {
    case "MCQ":
      return {
        text: `${variant.mcqStem} the selected detail "${concept.atomLabel}" for ${stemTopic}? Focus: ${variant.keyPoint}`,
        options,
        correctAnswer: "B",
      };
    case "ASSERTION_REASON":
      return {
        text: `Assertion (A): ${variant.assertion(topic)}\nReason (R): ${variant.reason(summary)}`,
        assertion: variant.assertion(topic),
        reason: variant.reason(summary),
        correctAnswer: "A",
      };
    case "TRUE_FALSE":
      return {
        text: `${variant.trueFalseLead} ${summary}`,
        correctAnswer: "True",
      };
    case "ONE_WORD":
      return {
        text: `Which key term names the ${variant.label} idea in ${atomPrompt}?`,
        correctAnswer: oneWordAnswer(topic),
      };
    case "FILL_BLANK":
      return {
        text: `In ${atomPrompt}, ________ is the topic connected with this ${variant.label} clue: ${summary}`,
        correctAnswer: topic,
      };
    case "VERY_SHORT":
      return {
        text: `State one ${variant.label} point about ${topic} from ${atomPrompt}; focus on ${variant.keyPoint}`,
        correctAnswer: summary,
        keyPoints: [summary],
      };
    case "MATCH_FOLLOWING":
      return matchQuestion(concept, variant);
    case "SHORT":
      return {
        text: `${variant.shortStem} ${topic} using ${atomPrompt}; focus on ${variant.keyPoint}`,
        correctAnswer: `${summary} ${variant.shortAnswer}`,
        keyPoints: [summary, variant.keyPoint, `Connect the answer to ${topic}.`],
      };
    case "NUMERICAL":
      return {
        text: `A learner lists ${variant.firstCount} ${variant.label} points about ${topic} from the source and then adds ${variant.secondCount} more linked points. How many points are listed in total?`,
        correctAnswer: `${variant.firstCount + variant.secondCount} points`,
        keyPoints: [
          "Add the two counts.",
          `${variant.firstCount} + ${variant.secondCount} = ${variant.firstCount + variant.secondCount}.`,
          `Final answer: ${variant.firstCount + variant.secondCount} points.`,
        ],
      };
    case "SOURCE_BASED":
      return sourceBasedQuestion(concept, variant);
    case "CASE_BASED":
      return caseBasedQuestion(concept, variant);
    case "PARAGRAPH":
      return {
        scenario: `${variant.paragraphLead} ${excerpt}`,
        text: `${variant.paragraphQuestion} ${topic} using ${atomPrompt}.`,
        correctAnswer: `${summary} The answer should refer to the selected extract and explain the idea in the student's own words.`,
        keyPoints: [summary, "Refer to the extract.", variant.keyPoint],
      };
    case "HOTS":
      return {
        text: `${variant.hotsStem} ${topic} were misunderstood in ${atomPrompt}? Justify your answer using the selected source.`,
        correctAnswer: `${topic} is needed because ${summary} ${variant.hotsAnswer}`,
        keyPoints: [summary, "Explain the effect.", variant.keyPoint],
      };
    case "COMPETENCY":
      return {
        text: `${variant.competencyStem} ${topic} from ${atomPrompt} and explain your reasoning.`,
        correctAnswer: `A correct answer applies this idea: ${summary} The example should stay connected to the selected source and include a clear reason.`,
        keyPoints: [summary, variant.keyPoint, "Explain the reason."],
      };
    case "DIAGRAM":
      return {
        text: `${variant.diagramStem} ${topic} from ${atomPrompt}.`,
        diagramDescription: `A concept map with ${topic} at the centre and ${variant.label} points from ${concept.atomLabel}.`,
        correctAnswer: `The diagram should show ${topic} and include this key idea: ${summary}`,
        keyPoints: [topic, summary, variant.keyPoint],
      };
    case "PRACTICAL":
      return {
        text: `${variant.practicalStem} ${topic} from ${atomPrompt}.`,
        correctAnswer: `Use a simple activity or observation related to ${topic}. The conclusion should show: ${summary}`,
        keyPoints: ["Aim", "Procedure", variant.keyPoint, "Conclusion"],
      };
    case "LONG":
      return {
        text: `${variant.longStem} ${topic} using only ${atomPrompt}.`,
        correctAnswer: `Introduction: ${topic} is a key idea in the selected source. Explanation: ${summary} Add supporting points, connect them logically, and conclude with why this idea matters.`,
        keyPoints: ["Introduce the topic.", summary, variant.keyPoint, "Conclude clearly."],
      };
    case "NCERT_FORMAT":
      return {
        text: `${variant.ncertStem} ${topic} using ${atomPrompt}.`,
        correctAnswer: summary,
        keyPoints: [summary, variant.keyPoint],
      };
  }
}

function sourceBasedQuestion(
  concept: NormalizedConcept,
  variant: VariantRecipe,
): Partial<GeneratedQuestion> {
  const subQuestions: SubQuestion[] = [
    shortSubQuestion(`Identify the ${variant.label} idea in source detail ${concept.atomId}.`, concept.topic, 1),
    shortSubQuestion(`What does ${concept.atomLabel} suggest about ${concept.topic}?`, concept.summary, 1),
    shortSubQuestion(`Give one ${variant.label} supporting point from source detail ${concept.atomId}.`, concept.excerpt, 1),
    shortSubQuestion(`Why is ${concept.atomLabel} important in the selected source?`, concept.summary, 1),
  ];

  return {
    scenario: `${variant.sourceLead} Source detail ${concept.atomId}: ${concept.excerpt}`,
    text: `Read source detail ${concept.atomId} and answer the ${variant.label} questions about ${concept.atomLabel}.`,
    subQuestions,
    correctAnswer: subQuestions
      .map((question, index) => `(${index + 1}) ${question.correctAnswer}`)
      .join("; "),
  };
}

function caseBasedQuestion(
  concept: NormalizedConcept,
  variant: VariantRecipe,
): Partial<GeneratedQuestion> {
  const options = conceptOptions(concept, concept.atomNumericId + 1, variant);
  const subQuestions: SubQuestion[] = [
    {
      text: `Which option best explains the ${variant.label} case using source detail ${concept.atomId}?`,
      type: "MCQ",
      options,
      correctAnswer: "B",
      marks: 2,
    },
    {
      text: `Explain the reason using ${concept.atomLabel} from the selected source.`,
      type: "SHORT",
      correctAnswer: concept.summary,
      marks: 2,
    },
  ];

  return {
    scenario: `${variant.caseLead} Source detail ${concept.atomId} says: ${concept.summary} The learner now has to explain ${concept.topic}.`,
    text: `Read the ${variant.label} case for ${concept.atomLabel} and answer the questions.`,
    subQuestions,
    correctAnswer: `(1) B; (2) ${concept.summary}`,
  };
}

function matchQuestion(
  concept: NormalizedConcept,
  variant: VariantRecipe,
): Partial<GeneratedQuestion> {
  const pairs = [
    { left: concept.topic, right: `${variant.label} source concept ${concept.atomId}` },
    { left: "Source evidence", right: concept.summary },
    { left: variant.label, right: variant.keyPoint },
    { left: "Conclusion", right: `Connect back to ${concept.atomLabel}` },
  ];

  return {
    text: `Match Column A with Column B for the ${variant.label} view of ${concept.topic} in source detail ${concept.atomId}.`,
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

function conceptOptions(
  concept: NormalizedConcept,
  index: number,
  variant: VariantRecipe,
): MCQOption[] {
  const distractors = [
    `A point from another source that ignores ${concept.atomLabel}`,
    `Only naming ${concept.topic} without explaining the ${variant.label} link in detail ${concept.atomId}`,
    `A general claim with no selected-source support ${index}`,
    `A partial detail that misses the ${variant.label} reasoning for ${concept.atomLabel}`,
    `An unrelated definition not supported by ${concept.chapter}`,
  ];

  return [
    { id: "A", text: distractors[index % distractors.length], isCorrect: false },
    { id: "B", text: trimToSentence(`${variant.optionLead} ${concept.atomId}: ${concept.summary}`, 140), isCorrect: true },
    { id: "C", text: distractors[(index + 1) % distractors.length], isCorrect: false },
    { id: "D", text: distractors[(index + 2) % distractors.length], isCorrect: false },
  ];
}

type NormalizedConcept = {
  summary: string;
  excerpt: string;
  topic: string;
  chapter: string;
  atomId: string;
  atomLabel: string;
  atomNumericId: number;
  topicId?: number;
  chapterId: number;
  subject?: string;
  classNum?: number;
  source: "ncert_txt" | "pdf";
};

type VariantRecipe = {
  id: string;
  label: string;
  mcqStem: string;
  optionLead: string;
  sourceFocus: string;
  sourceLead: string;
  caseLead: string;
  assertion: (topic: string) => string;
  reason: (summary: string) => string;
  trueFalseLead: string;
  shortStem: string;
  shortAnswer: string;
  paragraphLead: string;
  paragraphQuestion: string;
  hotsStem: string;
  hotsAnswer: string;
  competencyStem: string;
  diagramStem: string;
  practicalStem: string;
  longStem: string;
  ncertStem: string;
  keyPoint: string;
  explanationLead: string;
  answerPath: string;
  answerVerb: string;
  firstCount: number;
  secondCount: number;
};

type VariantLens = {
  id: string;
  label: string;
  stemFocus: string;
  optionLead: string;
  sourceFocus: string;
  contextLead: string;
  answerPath: string;
  keyPoint: string;
  answerVerb: string;
};

const variantLenses: VariantLens[] = [
  {
    id: "detail",
    label: "detail",
    stemFocus: "focus on one precise source detail",
    optionLead: "precise detail",
    sourceFocus: "Detail lens",
    contextLead: "Focus on the exact source detail before generalising.",
    answerPath: "isolate the precise detail, quote its role, and",
    keyPoint: "Name the exact source detail.",
    answerVerb: "identify",
  },
  {
    id: "support",
    label: "support",
    stemFocus: "show how the source supports the answer",
    optionLead: "supporting clue",
    sourceFocus: "Support lens",
    contextLead: "Use the source clue as support for the answer.",
    answerPath: "locate the supporting clue, link it to the answer, and",
    keyPoint: "Use a supporting clue from the source.",
    answerVerb: "support",
  },
  {
    id: "consequence",
    label: "consequence",
    stemFocus: "trace the consequence of the source idea",
    optionLead: "consequence",
    sourceFocus: "Consequence lens",
    contextLead: "Follow what the source idea leads to.",
    answerPath: "find the source idea, trace its consequence, and",
    keyPoint: "State the consequence of the source idea.",
    answerVerb: "trace",
  },
  {
    id: "example",
    label: "example",
    stemFocus: "connect the source idea to a grounded example",
    optionLead: "grounded example",
    sourceFocus: "Example lens",
    contextLead: "Use a concrete example that remains inside the selected source.",
    answerPath: "choose the source idea, build the example, and",
    keyPoint: "Give a source-grounded example.",
    answerVerb: "apply",
  },
  {
    id: "misconception",
    label: "misconception",
    stemFocus: "separate the source idea from a likely misconception",
    optionLead: "misconception check",
    sourceFocus: "Misconception lens",
    contextLead: "Avoid the tempting but unsupported reading.",
    answerPath: "spot the misconception, compare it with the source, and",
    keyPoint: "Correct a likely misconception.",
    answerVerb: "correct",
  },
  {
    id: "boundary",
    label: "boundary",
    stemFocus: "define the boundary of the source idea",
    optionLead: "boundary condition",
    sourceFocus: "Boundary lens",
    contextLead: "Show what the source idea includes and excludes.",
    answerPath: "define the boundary, separate included and excluded points, and",
    keyPoint: "Explain the boundary of the idea.",
    answerVerb: "define",
  },
  {
    id: "process-step",
    label: "process step",
    stemFocus: "identify the step or order in the source idea",
    optionLead: "process step",
    sourceFocus: "Process-step lens",
    contextLead: "Read the source idea as an ordered step.",
    answerPath: "identify the step, place it in order, and",
    keyPoint: "Use the relevant process step.",
    answerVerb: "sequence",
  },
  {
    id: "contrast",
    label: "contrast",
    stemFocus: "contrast the source idea with a nearby alternative",
    optionLead: "contrast clue",
    sourceFocus: "Contrast lens",
    contextLead: "Contrast the selected source idea with a nearby alternative.",
    answerPath: "find the source contrast, separate the alternatives, and",
    keyPoint: "Show the contrast in the source.",
    answerVerb: "contrast",
  },
];

const variantRecipes: VariantRecipe[] = [
  {
    id: "evidence",
    label: "evidence",
    mcqStem: "Which evidence-based statement best explains",
    optionLead: "Evidence from the selected source",
    sourceFocus: "Evidence focus",
    sourceLead: "This extract gives evidence from the selected source.",
    caseLead: "A learner uses source evidence to interpret this idea:",
    assertion: (topic) => `${topic} can be explained through evidence in the selected source.`,
    reason: (summary) => `The source states that ${summary}`,
    trueFalseLead: "The evidence in the selected source shows that",
    shortStem: "Explain the evidence for",
    shortAnswer: "This evidence supports the answer because it is directly tied to the selected source.",
    paragraphLead: "The paragraph highlights source evidence.",
    paragraphQuestion: "Using the evidence in the paragraph, explain",
    hotsStem: "What conclusion would become weak if the evidence for",
    hotsAnswer: "Without the evidence, the explanation would be unsupported.",
    competencyStem: "Use a classroom evidence example to apply",
    diagramStem: "Draw an evidence map for",
    practicalStem: "Design an evidence-gathering activity for",
    longStem: "Write a detailed evidence-based answer on",
    ncertStem: "Give an NCERT-style evidence answer on",
    keyPoint: "Use evidence from the selected source.",
    explanationLead: "The answer is supported by source evidence",
    answerPath: "Identify source evidence, connect it to the concept, and",
    answerVerb: "support",
    firstCount: 3,
    secondCount: 2,
  },
  {
    id: "inference",
    label: "inference",
    mcqStem: "Which inference most accurately follows from",
    optionLead: "Inference from the selected source",
    sourceFocus: "Inference focus",
    sourceLead: "This extract supports an inference from the selected source.",
    caseLead: "A learner infers meaning from this selected-source idea:",
    assertion: (topic) => `${topic} requires inference from the selected source.`,
    reason: (summary) => `The idea implies that ${summary}`,
    trueFalseLead: "A reasonable inference from the selected source is that",
    shortStem: "Infer the meaning of",
    shortAnswer: "This inference follows when the source detail is connected to the topic.",
    paragraphLead: "The paragraph invites an inference.",
    paragraphQuestion: "Using the paragraph, infer the role of",
    hotsStem: "How would an incorrect inference about",
    hotsAnswer: "A wrong inference would distort the selected-source meaning.",
    competencyStem: "Apply an inference from the selected source to",
    diagramStem: "Draw an inference chain for",
    practicalStem: "Plan an activity that helps learners infer",
    longStem: "Write a detailed inferential answer on",
    ncertStem: "Give an NCERT-style inference answer on",
    keyPoint: "Explain the inference, not only the fact.",
    explanationLead: "The answer follows by inference",
    answerPath: "Read the source detail, infer the relationship, and",
    answerVerb: "explain",
    firstCount: 4,
    secondCount: 3,
  },
  {
    id: "application",
    label: "application",
    mcqStem: "Which application best uses",
    optionLead: "Application of the selected source",
    sourceFocus: "Application focus",
    sourceLead: "This extract can be applied to a new situation.",
    caseLead: "A learner applies this selected-source idea:",
    assertion: (topic) => `${topic} can be applied beyond direct recall.`,
    reason: (summary) => `Application is possible because ${summary}`,
    trueFalseLead: "The selected source can be applied to show that",
    shortStem: "Apply the idea of",
    shortAnswer: "The application should stay within the selected-source meaning.",
    paragraphLead: "The paragraph shows how the idea may be applied.",
    paragraphQuestion: "Using the application in the paragraph, explain",
    hotsStem: "What would happen if the application of",
    hotsAnswer: "The application would fail unless the source idea is used correctly.",
    competencyStem: "Use a practical example to apply",
    diagramStem: "Draw an application flow for",
    practicalStem: "Design a short application activity for",
    longStem: "Write a detailed application-based answer on",
    ncertStem: "Give an NCERT-style application answer on",
    keyPoint: "Apply the source idea to a new but relevant situation.",
    explanationLead: "The answer applies the selected source",
    answerPath: "Choose the source idea, transfer it to the example, and",
    answerVerb: "apply",
    firstCount: 2,
    secondCount: 5,
  },
  {
    id: "comparison",
    label: "comparison",
    mcqStem: "Which comparison best clarifies",
    optionLead: "Comparison using the selected source",
    sourceFocus: "Comparison focus",
    sourceLead: "This extract helps compare related ideas.",
    caseLead: "A learner compares this source idea with a related point:",
    assertion: (topic) => `${topic} becomes clearer when compared with related source details.`,
    reason: (summary) => `The comparison is meaningful because ${summary}`,
    trueFalseLead: "A comparison from the selected source shows that",
    shortStem: "Compare the selected-source role of",
    shortAnswer: "The comparison should show both the shared idea and the difference.",
    paragraphLead: "The paragraph sets up a comparison.",
    paragraphQuestion: "Using the comparison in the paragraph, explain",
    hotsStem: "How would the comparison change if",
    hotsAnswer: "The comparison would become incomplete without the source distinction.",
    competencyStem: "Use a comparison example to explain",
    diagramStem: "Draw a comparison chart for",
    practicalStem: "Design a comparison activity for",
    longStem: "Write a detailed comparative answer on",
    ncertStem: "Give an NCERT-style comparison answer on",
    keyPoint: "Show a clear comparison using source details.",
    explanationLead: "The answer uses comparison",
    answerPath: "Identify the two linked ideas, compare them, and",
    answerVerb: "clarify",
    firstCount: 5,
    secondCount: 2,
  },
  {
    id: "cause-effect",
    label: "cause-effect",
    mcqStem: "Which cause-effect statement best explains",
    optionLead: "Cause-effect link from the selected source",
    sourceFocus: "Cause-effect focus",
    sourceLead: "This extract shows a cause-effect relationship.",
    caseLead: "A learner traces a cause-effect link in this source idea:",
    assertion: (topic) => `${topic} can be understood through a cause-effect link.`,
    reason: (summary) => `The effect follows because ${summary}`,
    trueFalseLead: "The selected source shows the cause-effect idea that",
    shortStem: "Explain the cause-effect link in",
    shortAnswer: "The answer should connect the cause to its effect in the selected source.",
    paragraphLead: "The paragraph describes a cause-effect link.",
    paragraphQuestion: "Using the cause-effect relation, explain",
    hotsStem: "What effect would follow if",
    hotsAnswer: "The effect must be justified through the selected-source relationship.",
    competencyStem: "Use a cause-effect example to explain",
    diagramStem: "Draw a cause-effect chain for",
    practicalStem: "Design a cause-effect activity for",
    longStem: "Write a detailed cause-effect answer on",
    ncertStem: "Give an NCERT-style cause-effect answer on",
    keyPoint: "Connect cause and effect clearly.",
    explanationLead: "The answer explains cause and effect",
    answerPath: "Find the cause, link the effect, and",
    answerVerb: "justify",
    firstCount: 6,
    secondCount: 3,
  },
  {
    id: "example",
    label: "example",
    mcqStem: "Which example best represents",
    optionLead: "Example grounded in the selected source",
    sourceFocus: "Example focus",
    sourceLead: "This extract can be represented through an example.",
    caseLead: "A learner builds an example from this source idea:",
    assertion: (topic) => `${topic} can be represented through a selected-source example.`,
    reason: (summary) => `The example is valid because ${summary}`,
    trueFalseLead: "An example based on the selected source shows that",
    shortStem: "Give and explain an example of",
    shortAnswer: "The example should remain grounded in the selected-source idea.",
    paragraphLead: "The paragraph develops an example.",
    paragraphQuestion: "Using the example in the paragraph, explain",
    hotsStem: "Why would a weak example of",
    hotsAnswer: "A weak example would miss the selected-source point.",
    competencyStem: "Use a real-life example to explain",
    diagramStem: "Draw an example-based concept map for",
    practicalStem: "Design an example-based activity for",
    longStem: "Write a detailed example-based answer on",
    ncertStem: "Give an NCERT-style example answer on",
    keyPoint: "Use a relevant example from the source idea.",
    explanationLead: "The answer uses a grounded example",
    answerPath: "Choose a relevant example, connect it to the topic, and",
    answerVerb: "demonstrate",
    firstCount: 2,
    secondCount: 4,
  },
  {
    id: "reasoning",
    label: "reasoning",
    mcqStem: "Which reasoning statement best explains",
    optionLead: "Reasoning from the selected source",
    sourceFocus: "Reasoning focus",
    sourceLead: "This extract requires reasoning from the selected source.",
    caseLead: "A learner reasons through this selected-source idea:",
    assertion: (topic) => `${topic} should be explained through reasoning, not memorisation alone.`,
    reason: (summary) => `The reasoning is valid because ${summary}`,
    trueFalseLead: "Reasoning from the selected source shows that",
    shortStem: "Explain the reasoning behind",
    shortAnswer: "The answer should show the reasoning path, not just the final point.",
    paragraphLead: "The paragraph presents a reasoning path.",
    paragraphQuestion: "Using this reasoning path, explain",
    hotsStem: "How would the reasoning fail if",
    hotsAnswer: "The reasoning would fail if the selected-source link is broken.",
    competencyStem: "Use stepwise reasoning to apply",
    diagramStem: "Draw a reasoning chain for",
    practicalStem: "Design a reasoning activity for",
    longStem: "Write a detailed reasoning-based answer on",
    ncertStem: "Give an NCERT-style reasoning answer on",
    keyPoint: "Show the reasoning steps clearly.",
    explanationLead: "The answer follows a reasoning path",
    answerPath: "Trace the source idea, state the reasoning, and",
    answerVerb: "conclude",
    firstCount: 4,
    secondCount: 4,
  },
  {
    id: "conclusion",
    label: "conclusion",
    mcqStem: "Which conclusion is best supported by",
    optionLead: "Conclusion supported by the selected source",
    sourceFocus: "Conclusion focus",
    sourceLead: "This extract supports a conclusion.",
    caseLead: "A learner draws a conclusion from this source idea:",
    assertion: (topic) => `${topic} supports a conclusion from the selected source.`,
    reason: (summary) => `The conclusion is supported because ${summary}`,
    trueFalseLead: "The conclusion supported by the selected source is that",
    shortStem: "Draw a conclusion about",
    shortAnswer: "The conclusion should follow directly from the selected-source detail.",
    paragraphLead: "The paragraph leads to a conclusion.",
    paragraphQuestion: "Using the paragraph, conclude the role of",
    hotsStem: "What conclusion would change if",
    hotsAnswer: "The conclusion should change only when the source reasoning changes.",
    competencyStem: "Draw a practical conclusion about",
    diagramStem: "Draw a conclusion map for",
    practicalStem: "Design an activity to reach a conclusion about",
    longStem: "Write a detailed conclusion-based answer on",
    ncertStem: "Give an NCERT-style conclusion answer on",
    keyPoint: "End with a source-supported conclusion.",
    explanationLead: "The answer draws a conclusion",
    answerPath: "Read the source idea, identify support, and",
    answerVerb: "conclude",
    firstCount: 5,
    secondCount: 4,
  },
  {
    id: "definition",
    label: "definition",
    mcqStem: "Which definition-focused statement best captures",
    optionLead: "Definition grounded in the selected source",
    sourceFocus: "Definition focus",
    sourceLead: "This extract defines or clarifies a source idea.",
    caseLead: "A learner defines a key source idea:",
    assertion: (topic) => `${topic} can be defined using selected-source clues.`,
    reason: (summary) => `The definition is supported because ${summary}`,
    trueFalseLead: "The selected source defines the idea by showing that",
    shortStem: "Define the source-supported meaning of",
    shortAnswer: "The definition should use the selected-source clue and not a generic memory answer.",
    paragraphLead: "The paragraph clarifies a definition.",
    paragraphQuestion: "Using this definition clue, explain",
    hotsStem: "Why would a generic definition of",
    hotsAnswer: "A generic definition would miss the selected-source clue.",
    competencyStem: "Use a precise definition to explain",
    diagramStem: "Draw a definition map for",
    practicalStem: "Design a definition-check activity for",
    longStem: "Write a detailed definition-focused answer on",
    ncertStem: "Give an NCERT-style definition answer on",
    keyPoint: "Define the idea using source wording and context.",
    explanationLead: "The answer defines the idea from the source",
    answerPath: "Locate the defining clue, state the meaning, and",
    answerVerb: "define",
    firstCount: 3,
    secondCount: 4,
  },
  {
    id: "process",
    label: "process",
    mcqStem: "Which process-based statement best explains",
    optionLead: "Process shown by the selected source",
    sourceFocus: "Process focus",
    sourceLead: "This extract shows a process or sequence.",
    caseLead: "A learner traces a source process:",
    assertion: (topic) => `${topic} can be understood as a process in the selected source.`,
    reason: (summary) => `The sequence is clear because ${summary}`,
    trueFalseLead: "The selected source shows the process idea that",
    shortStem: "Explain the process connected with",
    shortAnswer: "The answer should show ordered steps or linked movement in the source idea.",
    paragraphLead: "The paragraph presents a process.",
    paragraphQuestion: "Using this process, explain",
    hotsStem: "What step would fail if",
    hotsAnswer: "The process would become incomplete if the source link is skipped.",
    competencyStem: "Apply the process of",
    diagramStem: "Draw a process flow for",
    practicalStem: "Design a process activity for",
    longStem: "Write a detailed process-based answer on",
    ncertStem: "Give an NCERT-style process answer on",
    keyPoint: "Show the ordered source process.",
    explanationLead: "The answer follows the source process",
    answerPath: "Identify the first idea, connect the next step, and",
    answerVerb: "sequence",
    firstCount: 4,
    secondCount: 5,
  },
  {
    id: "exception",
    label: "exception",
    mcqStem: "Which exception-aware statement best explains",
    optionLead: "Exception handled by the selected source",
    sourceFocus: "Exception focus",
    sourceLead: "This extract helps separate the main idea from an exception.",
    caseLead: "A learner checks whether a source idea has an exception:",
    assertion: (topic) => `${topic} should be understood with its limits in mind.`,
    reason: (summary) => `The limit is visible because ${summary}`,
    trueFalseLead: "The selected source limits the idea by showing that",
    shortStem: "Explain one limit or exception related to",
    shortAnswer: "The answer should state the source idea and the condition where it changes.",
    paragraphLead: "The paragraph highlights a limit.",
    paragraphQuestion: "Using this limit, explain",
    hotsStem: "How would the answer change if the exception to",
    hotsAnswer: "The answer changes only when the source condition changes.",
    competencyStem: "Use an exception-aware example to explain",
    diagramStem: "Draw a limit-and-exception chart for",
    practicalStem: "Design an activity to test the exception in",
    longStem: "Write a detailed answer on the limits of",
    ncertStem: "Give an NCERT-style exception answer on",
    keyPoint: "Mention the condition, limit, or exception.",
    explanationLead: "The answer recognises the source limit",
    answerPath: "State the main idea, identify the limit, and",
    answerVerb: "qualify",
    firstCount: 5,
    secondCount: 3,
  },
  {
    id: "misconception",
    label: "misconception",
    mcqStem: "Which correction best removes a misconception about",
    optionLead: "Misconception corrected by the selected source",
    sourceFocus: "Misconception focus",
    sourceLead: "This extract corrects a possible misunderstanding.",
    caseLead: "A learner corrects a misunderstanding using the source:",
    assertion: (topic) => `${topic} can be misunderstood without the selected-source clue.`,
    reason: (summary) => `The correction is needed because ${summary}`,
    trueFalseLead: "A misconception corrected by the selected source is that",
    shortStem: "Correct a misconception about",
    shortAnswer: "The answer should name the mistaken idea and correct it with source support.",
    paragraphLead: "The paragraph corrects a misunderstanding.",
    paragraphQuestion: "Using this correction, explain",
    hotsStem: "What wrong conclusion would appear if",
    hotsAnswer: "The wrong conclusion is avoided by using the selected-source clue.",
    competencyStem: "Use a misconception-correction example to explain",
    diagramStem: "Draw a misconception-correction map for",
    practicalStem: "Design a misconception-check activity for",
    longStem: "Write a detailed misconception-correction answer on",
    ncertStem: "Give an NCERT-style misconception answer on",
    keyPoint: "Correct the mistaken idea with source evidence.",
    explanationLead: "The answer corrects a misconception",
    answerPath: "Name the misconception, cite the source clue, and",
    answerVerb: "correct",
    firstCount: 6,
    secondCount: 2,
  },
  {
    id: "diagram-angle",
    label: "diagram",
    mcqStem: "Which diagram-based interpretation best represents",
    optionLead: "Diagram interpretation from the selected source",
    sourceFocus: "Diagram focus",
    sourceLead: "This extract can be organised visually.",
    caseLead: "A learner turns a source idea into a visual organiser:",
    assertion: (topic) => `${topic} can be represented visually from the selected source.`,
    reason: (summary) => `The visual link is possible because ${summary}`,
    trueFalseLead: "A diagram of the selected source would show that",
    shortStem: "Describe a diagrammatic representation of",
    shortAnswer: "The answer should identify what the diagram must show and why.",
    paragraphLead: "The paragraph can be converted into a visual organiser.",
    paragraphQuestion: "Using this visual organiser, explain",
    hotsStem: "Which part of the diagram would be wrong if",
    hotsAnswer: "The diagram would be wrong if the source relationship is misplaced.",
    competencyStem: "Use a diagram-based explanation for",
    diagramStem: "Draw a labelled visual organiser for",
    practicalStem: "Design a visual sorting activity for",
    longStem: "Write a detailed diagram-supported answer on",
    ncertStem: "Give an NCERT-style diagram answer on",
    keyPoint: "Represent the source relationship visually.",
    explanationLead: "The answer organises the source visually",
    answerPath: "Identify the visual relation, label it, and",
    answerVerb: "map",
    firstCount: 3,
    secondCount: 6,
  },
  {
    id: "numerical-angle",
    label: "quantitative",
    mcqStem: "Which quantity-based interpretation best explains",
    optionLead: "Quantitative interpretation from the selected source",
    sourceFocus: "Quantitative focus",
    sourceLead: "This extract can be checked through counted or ordered points.",
    caseLead: "A learner counts linked source points:",
    assertion: (topic) => `${topic} can be checked by counting linked source points.`,
    reason: (summary) => `The counted points matter because ${summary}`,
    trueFalseLead: "A quantity-based reading of the selected source shows that",
    shortStem: "Explain the counted or ordered points in",
    shortAnswer: "The answer should connect the count or order back to the source idea.",
    paragraphLead: "The paragraph contains points that can be counted or ordered.",
    paragraphQuestion: "Using this counted structure, explain",
    hotsStem: "What would be miscounted if",
    hotsAnswer: "The count would be wrong if the source links are grouped incorrectly.",
    competencyStem: "Use a count-based example to explain",
    diagramStem: "Draw a numbered flow for",
    practicalStem: "Design a counting or sorting activity for",
    longStem: "Write a detailed quantity-supported answer on",
    ncertStem: "Give an NCERT-style quantitative answer on",
    keyPoint: "Use a counted or ordered source structure.",
    explanationLead: "The answer uses a quantitative source check",
    answerPath: "Count the linked points, compare the order, and",
    answerVerb: "calculate",
    firstCount: 7,
    secondCount: 2,
  },
  {
    id: "case-angle",
    label: "case",
    mcqStem: "Which case-based judgement best explains",
    optionLead: "Case judgement from the selected source",
    sourceFocus: "Case focus",
    sourceLead: "This extract can be used as a case for judgement.",
    caseLead: "A learner studies this source case:",
    assertion: (topic) => `${topic} can be judged through a selected-source case.`,
    reason: (summary) => `The case is valid because ${summary}`,
    trueFalseLead: "The selected-source case shows that",
    shortStem: "Explain the case-based meaning of",
    shortAnswer: "The answer should connect the case detail to the source idea.",
    paragraphLead: "The paragraph gives a case for judgement.",
    paragraphQuestion: "Using this case, explain",
    hotsStem: "How would the judgement change if the case of",
    hotsAnswer: "The judgement changes when the source case is interpreted differently.",
    competencyStem: "Use a case-based situation to explain",
    diagramStem: "Draw a case-analysis map for",
    practicalStem: "Design a case-analysis activity for",
    longStem: "Write a detailed case-based answer on",
    ncertStem: "Give an NCERT-style case answer on",
    keyPoint: "Judge the case using selected-source evidence.",
    explanationLead: "The answer uses a source case",
    answerPath: "Read the case, judge the source detail, and",
    answerVerb: "evaluate",
    firstCount: 4,
    secondCount: 6,
  },
  {
    id: "source-extract",
    label: "source-extract",
    mcqStem: "Which extract-based reading best explains",
    optionLead: "Extract-based reading from the selected source",
    sourceFocus: "Extract focus",
    sourceLead: "This extract must be read closely.",
    caseLead: "A learner reads a selected extract closely:",
    assertion: (topic) => `${topic} depends on close reading of the selected extract.`,
    reason: (summary) => `Close reading matters because ${summary}`,
    trueFalseLead: "Close reading of the selected extract shows that",
    shortStem: "Explain the extract-based clue for",
    shortAnswer: "The answer should stay close to the extract and avoid outside knowledge.",
    paragraphLead: "The paragraph is an extract for close reading.",
    paragraphQuestion: "Using this extract, explain",
    hotsStem: "What would be missed if the extract for",
    hotsAnswer: "The key clue would be missed without close reading of the selected extract.",
    competencyStem: "Use an extract-based response to explain",
    diagramStem: "Draw an extract-clue map for",
    practicalStem: "Design a close-reading activity for",
    longStem: "Write a detailed extract-based answer on",
    ncertStem: "Give an NCERT-style extract answer on",
    keyPoint: "Use only the selected extract clue.",
    explanationLead: "The answer comes from close source reading",
    answerPath: "Read the extract, isolate the clue, and",
    answerVerb: "interpret",
    firstCount: 5,
    secondCount: 5,
  },
];

function normalizeConceptPool(
  concepts: ConceptData[],
  config: PaperConfig,
): NormalizedConcept[] {
  const pool: NormalizedConcept[] = [];
  const seenAtoms = new Set<string>();

  sourceBackedConcepts(concepts).forEach((concept, conceptIndex) => {
    const topic = concept.topicName?.trim() || concept.chapterName || config.subject;
    const chapter = concept.chapterName || `Chapter ${concept.chapterId}`;
    const atoms = sourceAtomsForConcept(concept);

    atoms.forEach((atom, atomIndex) => {
      const atomKey = normalizeAtomKey(
        `${concept.subject ?? config.subject}:${concept.chapterId}:${concept.topicId ?? ""}:${atom.summary}`,
      );
      if (seenAtoms.has(atomKey)) return;
      seenAtoms.add(atomKey);

      const normalized: NormalizedConcept = {
        summary: atom.summary,
        excerpt: atom.excerpt,
        topic,
        chapter,
        atomId: sourceAtomId(concept, config, atom, conceptIndex, atomIndex),
        atomLabel: atom.label,
        atomNumericId: conceptIndex * 100 + atomIndex,
        chapterId: concept.chapterId,
        subject: concept.subject ?? config.subject,
        classNum: concept.classNum ?? config.classNum,
        source: concept.source === "pdf" ? "pdf" : "ncert_txt",
      };

      if (concept.topicId !== undefined) normalized.topicId = concept.topicId;
      pool.push(normalized);
    });
  });

  return pool;
}

function sourceAtomId(
  concept: ConceptData,
  config: PaperConfig,
  atom: { summary: string },
  conceptIndex: number,
  atomIndex: number,
) {
  const subject = slugPart(concept.subject ?? config.subject ?? "subject");
  const chapter = slugPart(String(concept.chapterId ?? conceptIndex + 1));
  const topic = slugPart(String(concept.topicId ?? "all"));
  const source = concept.source === "pdf" ? "pdf" : "txt";
  const suffix = stableAtomSuffix(atom.summary);

  return `${subject}-c${chapter}-t${topic}-${source}-a${atomIndex + 1}-${suffix}`;
}

function sourceBackedConcepts(concepts: ConceptData[]) {
  return concepts.filter((concept) => {
    const text = concept.text.replace(/\s+/g, " ").trim();
    return (
      (concept.source === "ncert_txt" || concept.source === "pdf") &&
      text.length >= 80
    );
  });
}

function trimToSentence(value: string, maxLength: number) {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) return normalized;

  const sliced = normalized.slice(0, maxLength).trim();
  return `${sliced.replace(/[,.!?;:]+$/, "")}.`;
}

function sourceAtomsForConcept(concept: ConceptData) {
  const rawText = concept.text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  const text = normalizeSourceFragment(rawText);
  const paragraphs = rawText
    .split(/\n\s*\n+/)
    .map(normalizeSourceFragment)
    .filter((paragraph) => paragraph.length >= 60);
  const sentences = sourceSentences(text);
  const clauses = sourceClauses(text);
  const atoms: Array<{ summary: string; excerpt: string; label: string }> = [];
  const addAtom = (value: string, labelHint = "") => {
    const fragment = normalizeSourceFragment(value);
    const summary = trimToSentence(fragment, 240);
    if (!summary || summary.length < 36) return;
    atoms.push({
      summary,
      excerpt: trimToSentence(fragment, 560),
      label: keyPhrase(`${labelHint} ${summary}`),
    });
  };

  paragraphs.slice(0, 10).forEach((paragraph, index) =>
    addAtom(paragraph, `paragraph ${index + 1}`),
  );
  sentences.slice(0, 24).forEach((sentence, index) =>
    addAtom(sentence, `sentence ${index + 1}`),
  );
  for (let index = 0; index < Math.min(sentences.length - 1, 12); index += 1) {
    addAtom(
      `${sentences[index]} ${sentences[index + 1]}`,
      `sentence-window ${index + 1}`,
    );
  }
  for (let index = 0; index < Math.min(sentences.length - 2, 8); index += 1) {
    addAtom(
      `${sentences[index]} ${sentences[index + 1]} ${sentences[index + 2]}`,
      `paragraph-window ${index + 1}`,
    );
  }
  clauses.slice(0, 28).forEach((clause, index) =>
    addAtom(clause, `clause ${index + 1}`),
  );
  for (let index = 0; index < Math.min(clauses.length - 1, 24); index += 1) {
    addAtom(`${clauses[index]} ${clauses[index + 1]}`, `clause-window ${index + 1}`);
  }
  for (let index = 0; index < Math.min(clauses.length - 2, 16); index += 1) {
    addAtom(
      `${clauses[index]} ${clauses[index + 1]} ${clauses[index + 2]}`,
      `clause-window ${index + 1}`,
    );
  }
  addAtom(text, "full-source");

  const seen = new Set<string>();
  return atoms
    .filter((atom) => {
      const key = normalizeAtomKey(atom.summary);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 96);
}

function normalizeSourceFragment(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function sourceSentences(text: string) {
  const sentenceParts = text
    .split(/(?<=[.!?])\s+/)
    .map(normalizeSourceFragment)
    .filter((sentence) => sentence.length >= 36);

  if (sentenceParts.length > 1) return sentenceParts;
  return text ? [text] : [];
}

function sourceClauses(text: string) {
  return text
    .split(
      /[,;:]|\s+-\s+|\s+(?:and|but|because|when|where|while|which|that|therefore|however)\s+/i,
    )
    .map(normalizeSourceFragment)
    .filter((clause) => clause.length >= 24);
}

function keyPhrase(value: string) {
  const words = value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 3 && !sourceAtomStopWords.has(word))
    .slice(0, 7);

  return words.length ? words.join(" ") : trimToSentence(value, 70);
}

function normalizeAtomKey(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function slugPart(value: string) {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 32) || "x"
  );
}

function stableAtomSuffix(value: string) {
  const normalized = normalizeAtomKey(value);
  let hash = 0;
  for (let index = 0; index < normalized.length; index += 1) {
    hash = (hash * 31 + normalized.charCodeAt(index)) >>> 0;
  }
  return hash.toString(36).slice(0, 8) || "0";
}

const sourceAtomStopWords = new Set([
  "about",
  "after",
  "before",
  "because",
  "chapter",
  "concept",
  "context",
  "detail",
  "explains",
  "learners",
  "selected",
  "source",
  "students",
  "through",
  "using",
  "which",
  "would",
]);

function oneWordAnswer(topic: string) {
  return topic.split(/\s+/).filter(Boolean).slice(0, 2).join(" ") || "Concept";
}

function variantRecipeFor(index: number) {
  const normalizedIndex = Math.abs(index - 1);
  const recipe = variantRecipes[normalizedIndex % variantRecipes.length];
  const lens =
    variantLenses[
      Math.floor(normalizedIndex / variantRecipes.length) % variantLenses.length
    ];

  return applyVariantLens(recipe, lens);
}

function variantSlotCount() {
  return variantRecipes.length * variantLenses.length;
}

function applyVariantLens(
  recipe: VariantRecipe,
  lens: VariantLens,
): VariantRecipe {
  return {
    ...recipe,
    id: `${recipe.id}-${lens.id}`,
    label: `${recipe.label} ${lens.label}`,
    mcqStem: `${recipe.mcqStem} with a ${lens.label} lens that ${lens.stemFocus}`,
    optionLead: `${recipe.optionLead}; ${lens.optionLead}`,
    sourceFocus: `${recipe.sourceFocus}; ${lens.sourceFocus}`,
    sourceLead: `${recipe.sourceLead} ${lens.contextLead}`,
    caseLead: `${recipe.caseLead} ${lens.contextLead}`,
    trueFalseLead: `${recipe.trueFalseLead}, with a ${lens.label} check,`,
    shortStem: `${recipe.shortStem} with a ${lens.label} lens`,
    shortAnswer: `${recipe.shortAnswer} ${lens.keyPoint}`,
    paragraphLead: `${recipe.paragraphLead} ${lens.contextLead}`,
    paragraphQuestion: `${recipe.paragraphQuestion} with a ${lens.label} focus`,
    hotsStem: `${recipe.hotsStem} through a ${lens.label} lens`,
    hotsAnswer: `${recipe.hotsAnswer} ${lens.keyPoint}`,
    competencyStem: `${recipe.competencyStem} with a ${lens.label} focus`,
    diagramStem: `${recipe.diagramStem} using a ${lens.label} lens`,
    practicalStem: `${recipe.practicalStem} with a ${lens.label} focus`,
    longStem: `${recipe.longStem} with a ${lens.label} lens`,
    ncertStem: `${recipe.ncertStem} with a ${lens.label} focus`,
    keyPoint: `${recipe.keyPoint} ${lens.keyPoint}`,
    explanationLead: `${recipe.explanationLead} using the ${lens.label} lens`,
    answerPath: `${recipe.answerPath} ${lens.answerPath}`,
    answerVerb: lens.answerVerb,
  };
}

function topicSentence(topic: string) {
  return topic.endsWith(".") ? topic : `${topic}.`;
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
