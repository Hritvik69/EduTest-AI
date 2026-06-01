import { buildBlueprint, marksPerType } from "@/lib/blueprint";
import {
  allocateDifficultyTargetsForSections,
  buildDifficultyProtocolPrompt,
  chooseBatchDifficultyTargets,
  normalizeDifficultyTargets,
  normalizeQuestionDifficulty,
  subtractDifficultyTargets,
  type DifficultyTargets,
} from "@/lib/difficulty-protocol";
import { questionTypeMeta } from "@/lib/edutest-data";
import { generateJSON, getConfiguredProviders } from "@/lib/gemini";
import { questionGenerationSystemInstruction } from "@/lib/gemini-prompts";
import {
  intelligenceCountsForTotal,
  targetBloomLevelsForDifficulty,
  type GenerationArchitecturePlan,
} from "@/lib/question-planning";
import { normalizeQuestionStructure } from "@/lib/question-structure";
import { partitionUniqueQuestionsByText } from "@/lib/question-duplicates";
import { isUsableGeneratedQuestion } from "@/lib/question-validation";
import type {
  Blueprint,
  BlueprintSection,
  GeneratedQuestion,
  PaperConfig,
  QuestionCompositionItem,
  QuestionType,
} from "@/types";

interface GenerateSectionOptions {
  allowDemoFallback?: boolean;
  allowPartial?: boolean;
  availableTopics?: string[];
  coverageFocus?: QuestionCompositionItem;
  existingQuestions?: GeneratedQuestion[];
  generationPlan?: GenerationArchitecturePlan;
  difficultyTargets?: DifficultyTargets;
  generationNonce?: string;
  cooldownScope?: string;
  partialMaxExtraAttempts?: number;
  signal?: AbortSignal;
  onBatchComplete?: (details: {
    generated: number;
    total: number;
    batch: number;
    batches: number;
  }) => void;
}

export async function generatePaperQuestions(config: PaperConfig, conceptContext = "") {
  const blueprint = buildBlueprint(config);
  const questions: GeneratedQuestion[] = [];
  const availableTopics = extractAvailableTopics(conceptContext);
  const difficultyAllocations = allocateDifficultyTargetsForSections(
    config.difficulty,
    blueprint.sections,
  );

  for (let index = 0; index < blueprint.sections.length; index += 1) {
    const section = blueprint.sections[index];
    questions.push(
      ...(await generateQuestionsForSection(section, conceptContext, config, {
        availableTopics,
        existingQuestions: questions,
        difficultyTargets: difficultyAllocations[index],
      })),
    );
  }

  return { questions };
}

export async function generateQuestionsForSection(
  section: BlueprintSection,
  conceptContext: string,
  config: PaperConfig,
  options: GenerateSectionOptions = {},
) {
  if (!conceptContext.trim() && !options.allowDemoFallback) {
    throw new Error(
      "No NCERT PDF-backed concept context is available for question generation.",
    );
  }

  const availableTopics = options.availableTopics ?? extractAvailableTopics(conceptContext);

  try {
    return await generateQuestionBatches(
      section,
      conceptContext,
      config,
      availableTopics,
      options.existingQuestions ?? [],
      options.coverageFocus,
      options.generationPlan,
      options.difficultyTargets,
      options.generationNonce,
      options.cooldownScope,
      options.allowPartial,
      options.partialMaxExtraAttempts,
      options.signal,
      options.onBatchComplete,
    );
  } catch (error) {
    if (options.allowDemoFallback) {
      return generateDemoQuestionsForSection(section, config);
    }

    throw error;
  }
}

async function generateQuestionBatches(
  section: BlueprintSection,
  conceptContext: string,
  config: PaperConfig,
  availableTopics: string[],
  existingQuestions: GeneratedQuestion[],
  coverageFocus?: QuestionCompositionItem,
  generationPlan?: GenerationArchitecturePlan,
  difficultyTargets?: DifficultyTargets,
  generationNonce?: string,
  cooldownScope?: string,
  allowPartial = false,
  partialMaxExtraAttempts = 0,
  signal?: AbortSignal,
  onBatchComplete?: GenerateSectionOptions["onBatchComplete"],
) {
  const tokenMode = tokenBudgetMode(config.aiProvider ?? "AUTO");
  const batchSize = maxQuestionsPerRequest(section.questionType, tokenMode);
  const estimatedBatches = Math.ceil(section.count / batchSize);
  const maxAttempts = allowPartial
    ? estimatedBatches + partialMaxExtraAttempts
    : estimatedBatches + 6;
  const sectionDifficultyTargets = normalizeDifficultyTargets(
    difficultyTargets ?? { [config.difficulty]: section.count },
  );
  const questions: GeneratedQuestion[] = [];
  let attempt = 0;
  let lastError: unknown;

  while (questions.length < section.count && attempt < maxAttempts) {
    throwIfAborted(signal);
    attempt += 1;
    const remaining = section.count - questions.length;
    const batchDifficultyTargets = chooseBatchDifficultyTargets(
      subtractDifficultyTargets(sectionDifficultyTargets, questions),
      Math.min(batchSize, remaining),
    );
    const batchSection = {
      ...section,
      count: Math.min(batchSize, remaining),
      totalMarks: Math.min(batchSize, remaining) * section.marksPerQuestion,
    };
    const prompt = buildPrompt(
      batchSection,
      conceptContext,
      config,
      availableTopics,
      [...existingQuestions, ...questions],
      coverageFocus,
      generationPlan,
      batchDifficultyTargets,
      sectionDifficultyTargets,
      generationNonce,
    );

    try {
      const result = await generateJSON<
        GeneratedQuestion[] | { questions: GeneratedQuestion[] }
      >(prompt, {
        systemInstruction: questionGenerationSystemInstruction,
        temperature: generationTemperature(config.difficulty),
        topP: 0.85,
        maxOutputTokens: maxOutputTokensForSection(batchSection, tokenMode),
        provider: config.aiProvider ?? "AUTO",
        task: generationNonce?.includes(":replacement:")
          ? "QUESTION_REPLACEMENT"
          : "QUESTION_GENERATION",
        cooldownScope,
        signal,
      });
      const raw = Array.isArray(result) ? result : result.questions;
      const normalized = normalizeGeneratedQuestions(
        raw,
        batchSection,
        config,
        availableTopics,
      );

      const { unique, duplicates } = partitionUniqueQuestionsByText(normalized, [
        ...existingQuestions,
        ...questions,
      ]);
      const governed = applyDifficultyGovernance(
        unique,
        section,
        config,
        sectionDifficultyTargets,
        questions,
      );

      if (duplicates.length) {
        lastError = new Error(
          `Discarded ${duplicates.length} duplicate ${section.questionType} question(s) and requested replacements.`,
        );
      }
      if (governed.rejected.length) {
        lastError = new Error(
          `Rejected ${governed.rejected.length} ${section.questionType} question(s) for difficulty governance: ${governed.rejected
            .slice(0, 2)
            .map((item) => item.reason)
            .join("; ")}`,
        );
      }

      questions.push(...governed.accepted);
      onBatchComplete?.({
        generated: Math.min(questions.length, section.count),
        total: section.count,
        batch: attempt,
        batches: Math.max(estimatedBatches, attempt),
      });
    } catch (error) {
      lastError = error;
      throwIfAborted(signal);
      if (isProviderQuotaOrAuthError(error)) {
        throw error;
      }
    }
  }

  if (questions.length < section.count) {
    if (allowPartial) return questions;

    const reason =
      lastError instanceof Error ? ` Last error: ${lastError.message}` : "";
    throw new Error(
      `AI provider generated ${questions.length}/${section.count} unique ${section.questionType} questions after ${attempt} attempts.${reason}`,
    );
  }

  return questions.slice(0, section.count);
}

export function generateDemoQuestions(config: PaperConfig, blueprint?: Blueprint) {
  const activeBlueprint = blueprint ?? buildBlueprint(config);
  return activeBlueprint.sections.flatMap((section) =>
    generateDemoQuestionsForSection(section, config),
  );
}

export function generateDemoQuestionsForSection(
  section: BlueprintSection,
  config: PaperConfig,
): GeneratedQuestion[] {
  return Array.from({ length: section.count }, (_, index) =>
    createDemoQuestion(section.questionType, config, section, index),
  );
}

const subjectPromptRules: Record<string, string> = {
  Mathematics:
    "Use equations, formulas, constructions, proofs, exact values, units where needed, and stepwise solutions. Avoid vague wording.",
  Science:
    "Use observations, cause-effect explanations, diagrams, activities, units, and NCERT vocabulary within the selected topic.",
  Physics:
    "Use formulas, SI units, graphs, numerical reasoning, observations, and cause-effect logic from the selected chapter.",
  Chemistry:
    "Use reactions, equations, symbols, properties, lab observations, valency, formulae, and precise chemical terminology.",
  Biology:
    "Use life processes, structures, functions, diagrams, examples, classification, and correct biological terms.",
  History:
    "Use chronology, sources, causes, consequences, movements, terms, evidence, and supported dates only when present in scope.",
  Geography:
    "Use maps, locations, physical features, resources, climate, population, diagrams, and selected-case reasoning.",
  Civics:
    "Use constitutional terms, democracy, rights, duties, institutions, governance, public policy, and citizen reasoning.",
  Economics:
    "Use definitions, indicators, markets, money, sectors, development logic, examples, tables, and simple data interpretation.",
  English:
    "Use the selected prose, poem, grammar, vocabulary, reading, writing, and comprehension format without changing the text scope.",
  Hindi:
    "Use selected gadyaansh, padyaansh, vyakaran, rachanatmak lekhan, sahitya context, and Hindi answer style.",
  "Basic Computer":
    "Use Python, SQL, programming logic, computer organisation, cyber safety, algorithms, code tracing, and practical computing from selected topics.",
  "Advanced Computer":
    "Use IT skills, employability skills, ICT tools, word processing, spreadsheets, entrepreneurship, green skills, and workplace/digital-practical scenarios from selected topics.",
};

function buildSubjectWorkflowPrompt(
  config: PaperConfig,
  coverageFocus?: QuestionCompositionItem,
) {
  const selectedSubjects = uniqueSubjectNames(config.subjects ?? [config.subject]);
  const activeSubject = coverageFocus?.subject ?? selectedSubjects[0] ?? config.subject;
  const relevantSubjects = uniqueSubjectNames(
    coverageFocus?.subject ? [coverageFocus.subject] : selectedSubjects,
  );
  const rules = relevantSubjects
    .map((subject) => `- ${subject}: ${subjectRule(subject)}`)
    .join("\n");
  const selections = config.subjectSelections?.length
    ? config.subjectSelections
        .map(
          (selection) =>
            `- ${selection.subject}: chapters ${selection.chapterIds.join(", ")}${
              selection.topicIds?.length
                ? `; topics ${selection.topicIds.join(", ")}`
                : ""
            }`,
        )
        .join("\n")
    : `- ${config.subject}: chapters ${config.chapterIds.join(", ")}`;

  return `SUBJECT_WORKFLOW
Selected subjects: ${selectedSubjects.join(", ")}
Active subject for this request: ${activeSubject}
Selected chapter/topic routing:
${selections}
Subject-specific generation rules:
${rules}
Workflow rule: generate every question from the active subject plus its selected chapter/topic context only.`;
}

function subjectRule(subject: string) {
  return subjectPromptRules[subject] ?? subjectPromptRules.Science;
}

function uniqueSubjectNames(subjects: string[]) {
  return Array.from(
    new Set(subjects.map((subject) => subject.trim()).filter(Boolean)),
  );
}

function buildPrompt(
  section: BlueprintSection,
  conceptContext: string,
  config: PaperConfig,
  availableTopics: string[],
  existingQuestions: GeneratedQuestion[] = [],
  coverageFocus?: QuestionCompositionItem,
  generationPlan?: GenerationArchitecturePlan,
  batchDifficultyTargets: DifficultyTargets = {},
  sectionDifficultyTargets: DifficultyTargets = {},
  generationNonce?: string,
) {
  const subjectWorkflow = buildSubjectWorkflowPrompt(config, coverageFocus);
  const topicList = availableTopics.length
    ? availableTopics.map((topic) => `- ${topic}`).join("\n")
    : "- Use only the extracted NCERT chapter concepts below";
  const sectionContext = `
CONFIG_JSON:${JSON.stringify(buildPromptConfig(config, section, availableTopics, generationPlan, sectionDifficultyTargets, coverageFocus, generationNonce))}

Subject: ${config.subject}, Class: ${config.classNum}
${subjectWorkflow}
Difficulty: ${section.difficulty}
Count needed: ${section.count}
Allowed chapter topics:
${topicList}
Chapter concepts:
${conceptContext}
`;
  const batchIntelligence = intelligenceCountsForTotal(section.count);
  const cognitiveLevels = targetBloomLevelsForDifficulty(config.difficulty);
  const difficultyProtocol = buildDifficultyProtocolPrompt(
    config.difficulty,
    section.questionType,
    batchDifficultyTargets,
  );
  const coverageFocusRules = coverageFocus
    ? `
Coverage focus for this request:
- Subject: ${coverageFocus.subject}
- Chapter: ${coverageFocus.chapterName ?? coverageFocus.chapterId ?? "Selected chapter"}
- Topic: ${coverageFocus.topicName ?? "All selected topics in this chapter"}
- Required count from this focus: ${section.count}
All returned questions in this request must come from this coverage focus.
Every returned question's subject field must be "${coverageFocus.subject}".
`
    : "";
  const antiRepeatRules = existingQuestions.length
    ? `
Forbidden existing/invalid question stems from this paper:
${existingQuestions
  .slice(-24)
  .map((question, index) => `${index + 1}. ${question.text}`)
  .join("\n")}
Do not repeat, paraphrase, lightly reword, or reuse these ideas, stems, examples, numbers, option patterns, answer facts, source/case scenarios, or diagrams.
Replacement rule: if this request is replacing invalid/duplicate questions, every returned question must be a genuinely new valid alternative with a different concept angle, different data/example, and different answer path. Do not copy a failed question and only change wording.
`
    : "";

  const strictRules = `
Rules:
- Obey CONFIG_JSON exactly: section type/count/marks, topics, exam type, and difficulty targets.
- Generate ONLY current_section.type. Do not merge formats.
- Use ONLY provided chapter knowledge. ${
    config.sourceMode === "pdf_upload"
      ? "Uploaded PDF concepts are the only source."
      : "Selected chapters/topics are the allowed scope."
  }
- No outside/web/generic filler; do not copy source lines verbatim.
- Required fields on every item: text, correctAnswer, explanation, topic, difficulty, bloomLevel, reasoningSteps, difficultyConfidence, cognitiveComplexity{conceptIntegration,abstractionLevel,inferenceLevel,ambiguityLevel,cognitiveLoad}.
- Topic must exactly match one allowed topic.
- Subject must match the active subject in SUBJECT_WORKFLOW and the coverage focus.
- Batch intelligence: ${batchIntelligence.basic} basic, ${batchIntelligence.important} important, ${batchIntelligence.conceptualTrap} conceptual trap.
- Difficulty targets: batch ${JSON.stringify(normalizeDifficultyTargets(batchDifficultyTargets))}; section ${JSON.stringify(normalizeDifficultyTargets(sectionDifficultyTargets))}.
- Ceiling/allowed: ${section.questionType} max ${difficultyProtocol.ceiling}; allowed ${difficultyProtocol.allowed.join(",")}; forbidden ${difficultyProtocol.forbidden.join(",")}.
- Bloom focus for ${config.difficulty}: ${cognitiveLevels.join("+")}. Difficulty must be real reasoning/application/integration, never wording tricks.
- Unique stems/concepts within this response; use fresh board-style questions grounded in concepts.
- Never generate duplicate questions. A duplicate includes same concept angle, same numerical values, same scenario, same answer fact, same option pattern, or a near-paraphrase of any forbidden stem.
- Fresh run nonce: ${generationNonce ?? "not-provided"}. Treat this as a new paper; do not reuse previous output, demo/template examples, or repeated numeric placeholders such as "20 units to 30 units".
- For source/case/paragraph/diagram/practical/HOTS/competency/long, synthesize a fresh scenario from concepts.
- If source is curriculum, use only chapter/topic scope; do not invent exact textbook facts.
- Self-check count, marks, structure, topic balance, duplicates, answer clarity, and format.
${antiRepeatRules}
${coverageFocusRules}
`;

  const prompts: Record<QuestionType, string> = {
    MCQ: `Generate ${section.count} MCQ questions.
${sectionContext}
${strictRules}
Rules: exactly 4 options, exactly 1 correct answer, plausible distractors, same option category, no joke options, no grammatical clues, no option length bias, no direct textbook sentence copying. Test understanding rather than random memorization. Prefer Indian daily-life contexts when appropriate.
Return JSON array: [{ "text","options":[{"id","text","isCorrect"}],"correctAnswer","explanation","bloomLevel","competencyLevel","difficulty","topic" }]`,
    ASSERTION_REASON: `Generate ${section.count} Assertion-Reason questions in exact CBSE format.
${sectionContext}
${strictRules}
Assertion (A): [statement]
Reason (R): [statement]
Options are ALWAYS exactly these 4:
  A: Both A and R true, R correctly explains A
  B: Both A and R true, R does NOT explain A
  C: A true, R false
  D: A false, R true
Make combinations genuinely tricky. NOT obvious.
Avoid trivial assertions, fake logical links, and textbook-copy statements. The reason must be academically valid and must genuinely test conceptual understanding.
Return JSON: [{ "text" (full formatted), "assertion","reason","correctAnswer":"A|B|C|D","explanation","difficulty","topic" }]`,
    TRUE_FALSE: `Generate ${section.count} True/False questions.
${sectionContext}
${strictRules}
Statements must be precise, unambiguous, and conceptually testable. Avoid partially true wording.
Return JSON: [{ "text":"statement","correctAnswer":"True|False","explanation","topic" }]`,
    ONE_WORD: `Generate ${section.count} One Word questions.
${sectionContext}
${strictRules}
The answer must truly be one word or one accepted term using proper subject terminology.
Return JSON: [{ "text":"question ending with ?","correctAnswer":"one word or term","explanation","topic" }]`,
    FILL_BLANK: `Generate ${section.count} Fill in the Blank questions.
${sectionContext}
${strictRules}
The blank must test meaningful understanding, not grammar alone. Keep the sentence natural.
Return JSON: [{ "text":"sentence with ________ for blank","correctAnswer":"word or phrase","explanation","topic" }]`,
    VERY_SHORT: `Generate ${section.count} Very Short Answer questions.
${sectionContext}
${strictRules}
The answer must fit in 1-2 sentences and focus on direct conceptual understanding.
Return JSON: [{ "text":"question","correctAnswer":"1-2 sentence model answer","keyPoints":[],"marks":2,"topic" }]`,
    MATCH_FOLLOWING: `Generate ${section.count} Match the Column questions.
${sectionContext}
${strictRules}
Each question: 4 items Column A matched to 4 different items Column B.
Items from different sub-topics. Relationships must be academically meaningful, logically matchable, and unambiguous. Not too obvious.
Return JSON: [{ "text":"Match Column A with Column B","matchPairs":[{"left","right"},...],"correctAnswer":"A1-B3, A2-B1, A3-B4, A4-B2","explanation","marks":3,"topic" }]`,
    SHORT: `Generate ${section.count} Short Answer questions.
${sectionContext}
${strictRules}
Questions needing 3-5 line answers. Require explanation ability, conceptual clarity, and reasoning where appropriate. Use "explain", "describe", "compare" style.
Return JSON: [{ "text","correctAnswer":"full model answer","keyPoints":["p1","p2","p3"],"bloomLevel","marks":3,"topic" }]`,
    NUMERICAL: `Generate ${section.count} Numerical questions.
${sectionContext}
${strictRules}
Include all given data in question. Must be solvable with realistic values. Avoid arithmetic traps unrelated to the concept. Show complete solution.
Return JSON: [{ "text":"problem with all values given","correctAnswer":"final answer with unit","keyPoints":["Step1:formula","Step2:values","Step3:answer"],"marks":3,"topic" }]`,
    SOURCE_BASED: `Generate ${section.count} Source-Based questions.
${sectionContext}
${strictRules}
Write a fresh authentic passage (3-5 lines historical/scientific/literary as appropriate) derived from the extracted chapter concepts. Then 4 sub-questions directly connected to the passage.
Return JSON: [{ "scenario":"passage text","text":"Read and answer:","subQuestions":[{"text","correctAnswer","marks":1},...4 subQs],"marks":4,"topic" }]`,
    CASE_BASED: `Generate ${section.count} Case-Based questions.
${sectionContext}
${strictRules}
Realistic scenario (3-5 lines) derived from the extracted chapter concepts. The questions must logically emerge from the case. Avoid artificial storytelling.
2 sub-questions: sub-Q1 is MCQ (2 marks), sub-Q2 is SHORT (2 marks).
Return EXACT JSON shape:
[{ "scenario":"3-5 line case", "text":"Read the case and answer the questions.", "subQuestions":[
  { "text":"MCQ sub-question", "type":"MCQ", "marks":2, "options":[{"id":"A","text":"...","isCorrect":false},{"id":"B","text":"...","isCorrect":true},{"id":"C","text":"...","isCorrect":false},{"id":"D","text":"...","isCorrect":false}], "correctAnswer":"B" },
  { "text":"Short-answer sub-question", "type":"SHORT", "marks":2, "correctAnswer":"2-3 sentence model answer" }
], "correctAnswer":"(1) B; (2) 2-3 sentence model answer", "explanation":"marking reason", "marks":4, "topic":"exact allowed topic" }]
Do not omit sub-question type, marks, options, or correctAnswer.`,
    PARAGRAPH: `Generate ${section.count} Paragraph questions.
${sectionContext}
${strictRules}
Paragraph must test comprehension, stay academically relevant, and avoid unnecessary length.
Return JSON: [{ "scenario":"fresh paragraph built from extracted concepts","text":"Based on above, answer:","correctAnswer":"detailed answer","marks":4,"topic" }]`,
    HOTS: `Generate ${section.count} HOTS questions.
${sectionContext}
${strictRules}
Must require prediction, analysis, application, multi-concept integration, or unfamiliar scenario reasoning. Cannot be answerable by direct recall. Challenge reasoning, not memory.
Return JSON: [{ "text":"HOTS question","correctAnswer":"model answer","keyPoints":[],"bloomLevel":"EVALUATE","marks":4,"topic" }]`,
    COMPETENCY: `Generate ${section.count} Competency-Based questions.
${sectionContext}
${strictRules}
Real-life scenario testing ability to apply or transfer the concept to a practical situation. Indian context preferred.
Return JSON: [{ "text","correctAnswer","keyPoints":[],"competencyLevel":3,"bloomLevel":"APPLY","marks":4,"topic" }]`,
    DIAGRAM: `Generate ${section.count} Diagram-Based questions.
${sectionContext}
${strictRules}
Question about labeling or explaining a diagram of a concept.
Return JSON: [{ "text":"Observe the diagram of {topic} and answer:","diagramDescription":"what diagram shows","correctAnswer":"what labels or explanation needed","keyPoints":[],"marks":5,"topic" }]`,
    PRACTICAL: `Generate ${section.count} Practical questions.
${sectionContext}
${strictRules}
Experiment or activity based question with scientifically realistic procedure, observation, inference, and precaution.
Return JSON: [{ "text":"practical/experiment question","correctAnswer":"observation + inference + precaution","keyPoints":["observation","inference","precaution"],"marks":5,"topic" }]`,
    LONG: `Generate ${section.count} Long Answer questions.
${sectionContext}
${strictRules}
Requires structured explanation with introduction, 3-4 main points, stepwise reasoning, relevant examples/derivations/diagrams where useful, and conclusion.
Return JSON: [{ "text","correctAnswer":"complete 5-mark model answer","keyPoints":["intro","pt1","pt2","pt3","example","conclusion"],"bloomLevel","marks":5,"topic" }]`,
    NCERT_FORMAT: `Generate ${section.count} NCERT Books/PDF questions.
${sectionContext}
${strictRules}
Generate bookish NCERT exercise-style questions only from the selected chapter/topic/PDF context above.
If uploaded PDF or extracted NCERT text is present, use that local context instead of inventing from the whole book.
If no full textbook/PDF text is present, generate NCERT-style questions from the selected chapter and allowed topics only.
Use familiar NCERT exercise patterns such as define, give reasons, differentiate, explain, examples, in-text concept checks, and back-exercise style.
Maintain NCERT phrasing style and textbook conceptual flow without copying exact source text.
Return JSON: [{ "text","correctAnswer","marks":1|2|3,"topic" }]`,
  };

  return `${prompts[section.questionType]}

Return ONLY valid JSON with no markdown.`;
}

function buildPromptConfig(
  config: PaperConfig,
  section: BlueprintSection,
  availableTopics: string[],
  generationPlan?: GenerationArchitecturePlan,
  sectionDifficultyTargets: DifficultyTargets = {},
  coverageFocus?: QuestionCompositionItem,
  generationNonce?: string,
) {
  const blueprint = buildBlueprint(config);
  const questionTypeCounts = toPromptQuestionTypeCounts(blueprint);

  return {
    class: config.classNum,
    subjects: config.subjects ?? [config.subject],
    subject_workflow: {
      active_subject: coverageFocus?.subject ?? config.subject,
      selected_subjects: config.subjects ?? [config.subject],
      subject_selections: config.subjectSelections ?? [],
      current_focus: coverageFocus
        ? {
            subject: coverageFocus.subject,
            chapter_id: coverageFocus.chapterId ?? null,
            chapter_name: coverageFocus.chapterName ?? null,
            topic_id: coverageFocus.topicId ?? null,
            topic_name: coverageFocus.topicName ?? null,
            question_count: coverageFocus.questionCount,
          }
        : null,
      active_subject_rule: subjectRule(coverageFocus?.subject ?? config.subject),
    },
    chapters: config.subjectSelections?.reduce<Record<string, number[]>>(
      (acc, selection) => {
        acc[selection.subject] = selection.chapterIds;
        return acc;
      },
      {},
    ) ?? { [config.subject]: config.chapterIds },
    topics: availableTopics.length ? { allowed_topics: availableTopics } : null,
    source_mode: config.sourceMode ?? "curriculum",
    uploaded_pdf_source_id: config.pdfSourceId ?? null,
    uploaded_pdf_title: config.pdfSource?.title ?? null,
    total_marks: blueprint.totalMarks,
    duration_min: config.duration,
    question_count: blueprint.totalQuestions,
    exam_type: config.examType,
    question_types: questionTypeCounts,
    question_type_counts: questionTypeCounts,
    difficulty_protocol: buildDifficultyProtocolPrompt(
      config.difficulty,
      section.questionType,
      sectionDifficultyTargets,
    ),
    current_section: {
      type: section.questionType,
      count: section.count,
      marks_per_question: section.marksPerQuestion,
      total_marks: section.totalMarks,
      difficulty_targets: normalizeDifficultyTargets(sectionDifficultyTargets),
    },
    ai_provider: config.aiProvider ?? "AUTO",
    generation_nonce: generationNonce ?? null,
    difficulty: config.difficulty,
    blooms: config.bloomDistribution,
    architecture: generationPlan,
  };
}

function toPromptQuestionTypeCounts(blueprint: Blueprint) {
  const counts = questionTypeMeta.reduce<Record<QuestionType, number>>(
    (acc, item) => {
      acc[item.type] = 0;
      return acc;
    },
    {} as Record<QuestionType, number>,
  );

  blueprint.sections.forEach((section) => {
    counts[section.questionType] = section.count;
  });

  return counts;
}

function generationTemperature(difficulty: PaperConfig["difficulty"]) {
  if (difficulty === "ABSURD") return 0.55;
  if (difficulty === "HARD") return 0.48;
  return 0.4;
}

type TokenBudgetMode = "STANDARD" | "LOW";

function tokenBudgetMode(provider: PaperConfig["aiProvider"] = "AUTO"): TokenBudgetMode {
  const configuredProviders = getConfiguredProviders();
  const onlyOpenRouter =
    configuredProviders.length === 1 && configuredProviders[0] === "OPENROUTER";

  return provider === "OPENROUTER" || (provider === "AUTO" && onlyOpenRouter)
    ? "LOW"
    : "STANDARD";
}

function maxQuestionsPerRequest(type: QuestionType, mode: TokenBudgetMode) {
  if (mode === "LOW") {
    if (["SOURCE_BASED", "CASE_BASED", "PARAGRAPH", "HOTS", "COMPETENCY", "DIAGRAM", "PRACTICAL", "LONG"].includes(type)) {
      return 1;
    }

    if (["SHORT", "NUMERICAL", "MATCH_FOLLOWING"].includes(type)) return 3;
    if (type === "ASSERTION_REASON") return 4;
    return 5;
  }

  if (["MCQ", "TRUE_FALSE", "ONE_WORD", "FILL_BLANK"].includes(type)) return 8;
  if (type === "ASSERTION_REASON") return 6;
  if (["VERY_SHORT", "MATCH_FOLLOWING", "SHORT", "NUMERICAL"].includes(type)) {
    return 5;
  }
  return 3;
}

function maxOutputTokensForSection(section: BlueprintSection, mode: TokenBudgetMode) {
  const baseByType: Partial<Record<QuestionType, number>> = {
    MCQ: 3200,
    ASSERTION_REASON: 3000,
    TRUE_FALSE: 2200,
    ONE_WORD: 2200,
    FILL_BLANK: 2200,
    VERY_SHORT: 3000,
    MATCH_FOLLOWING: 3600,
    SHORT: 4200,
    NUMERICAL: 4200,
    SOURCE_BASED: 5200,
    CASE_BASED: 5200,
    PARAGRAPH: 4200,
    HOTS: 4200,
    COMPETENCY: 4200,
    DIAGRAM: 4200,
    PRACTICAL: 4200,
    LONG: 5200,
    NCERT_FORMAT: 3600,
  };

  const requested = (baseByType[section.questionType] ?? 4200) + section.count * 300;

  if (mode === "LOW") {
    const lowBudgetByType: Partial<Record<QuestionType, number>> = {
      MCQ: 1000,
      ASSERTION_REASON: 1000,
      TRUE_FALSE: 800,
      ONE_WORD: 800,
      FILL_BLANK: 800,
      VERY_SHORT: 950,
      MATCH_FOLLOWING: 1050,
      SHORT: 1050,
      NUMERICAL: 1050,
      SOURCE_BASED: 1100,
      CASE_BASED: 1100,
      PARAGRAPH: 1000,
      HOTS: 1000,
      COMPETENCY: 1000,
      DIAGRAM: 1000,
      PRACTICAL: 1000,
      LONG: 1100,
      NCERT_FORMAT: 950,
    };

    return Math.min(
      openRouterMaxOutputTokens(),
      lowBudgetByType[section.questionType] ?? 1000,
      requested,
    );
  }

  return Math.min(8192, requested);
}

function openRouterMaxOutputTokens() {
  const configured = Number(process.env.OPENROUTER_MAX_OUTPUT_TOKENS);
  if (Number.isInteger(configured) && configured >= 600 && configured <= 4096) {
    return configured;
  }

  return 1100;
}

function isProviderQuotaOrAuthError(error: unknown) {
  if (!(error instanceof Error)) return false;
  return isAIProviderUnavailableMessage(error.message);
}

function isAIProviderUnavailableMessage(message: string) {
  return /All configured AI providers failed|Set .*API_?KEY|Set at least one AI provider key|402|credit|quota|billing|can only afford|max_tokens|401|403|unauthorized|api[_\s-]?key|invalid key|not allowed|permission|429|rate.?limit|503|service unavailable|temporarily|busy|overloaded|timeout|timed out|network|fetch failed|ECONNRESET|ENOTFOUND|ETIMEDOUT/i.test(
    message,
  );
}

function normalizeGeneratedQuestions(
  questions: GeneratedQuestion[],
  section: BlueprintSection,
  config: PaperConfig,
  availableTopics: string[],
) {
  if (!Array.isArray(questions) || !questions.length) {
    throw new Error(`AI provider returned no ${section.questionType} questions.`);
  }

  const normalized: GeneratedQuestion[] = [];

  questions.forEach((question, index) => {
    try {
      const candidate = normalizeQuestionStructure({
        ...question,
        topic: normalizeTopic(question.topic, availableTopics),
        type: section.questionType,
        difficulty: question.difficulty ?? section.difficulty,
        marks: section.marksPerQuestion,
        explanation: question.explanation,
        correctAnswer: question.correctAnswer,
        bloomLevel: question.bloomLevel ?? "UNDERSTAND",
        competencyLevel: question.competencyLevel ?? 2,
        chapterId:
          numericId(question.chapterId) ??
          config.chapterIds[index % Math.max(1, config.chapterIds.length)],
        topicId:
          numericId(question.topicId) ??
          config.topicIds?.[index % Math.max(1, config.topicIds.length)],
        section: section.name,
        subject: question.subject ?? config.subject,
        classNum: question.classNum ?? config.classNum,
      } satisfies GeneratedQuestion, section);

      if (isUsableGeneratedQuestion(candidate, section)) {
        normalized.push(candidate);
      }
    } catch {
      // Skip malformed provider output and request a top-up batch.
    }
  });

  if (!normalized.length) {
    throw new Error(
      `AI provider returned no usable ${section.questionType} questions.`,
    );
  }

  return normalized;
}

function applyDifficultyGovernance(
  questions: GeneratedQuestion[],
  section: BlueprintSection,
  config: PaperConfig,
  sectionDifficultyTargets: DifficultyTargets,
  acceptedQuestions: GeneratedQuestion[],
) {
  const remainingTargets = subtractDifficultyTargets(
    sectionDifficultyTargets,
    acceptedQuestions,
  );
  const accepted: GeneratedQuestion[] = [];
  const rejected: Array<{ question: GeneratedQuestion; reason: string }> = [];

  questions.forEach((question) => {
    const result = normalizeQuestionDifficulty(
      question,
      config.difficulty,
      section.questionType,
    );

    if (!result.valid) {
      rejected.push({
        question,
        reason: result.reasons.join(", "),
      });
      return;
    }

    if (remainingTargets[result.validatedDifficulty] <= 0) {
      rejected.push({
        question,
        reason: `${result.validatedDifficulty} target already satisfied`,
      });
      return;
    }

    remainingTargets[result.validatedDifficulty] -= 1;
    accepted.push(result.question);
  });

  return { accepted, rejected };
}

function extractAvailableTopics(conceptContext: string) {
  const seen = new Set<string>();
  const topics: string[] = [];

  for (const line of conceptContext.split(/\r?\n/)) {
    const match = line.match(/\[Topic:\s*(.+?)\]\s*\[/);
    const topic = match?.[1]?.trim();
    if (!topic) continue;
    const key = topic.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    topics.push(topic);
  }

  return topics;
}

function normalizeTopic(topic: string | undefined, availableTopics: string[]) {
  if (!availableTopics.length) return topic;
  if (!topic?.trim()) {
    throw new Error("Generated question is missing a valid chapter topic.");
  }

  const normalizedTopic = topic.trim().toLowerCase();
  const exact = availableTopics.find(
    (candidate) => candidate.trim().toLowerCase() === normalizedTopic,
  );
  if (exact) return exact;

  throw new Error(
    `Generated question topic "${topic}" is not one of the extracted chapter topics.`,
  );
}

function numericId(value: unknown) {
  const numberValue = Number(value);
  return Number.isInteger(numberValue) && numberValue > 0 ? numberValue : undefined;
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw new Error("Generation cancelled by client.");
  }
}

function createDemoQuestion(
  type: QuestionType,
  config: PaperConfig,
  section: BlueprintSection,
  index: number,
): GeneratedQuestion {
  const meta = questionTypeMeta.find((item) => item.type === type);
  const topic = `${config.subject} concept ${index + 1}`;
  const base = {
    text: `Demo ${meta?.label ?? type} question ${index + 1} for Class ${
      config.classNum
    } ${config.subject}.`,
    type,
    difficulty: config.difficulty,
    marks: section.marksPerQuestion,
    correctAnswer: "Apply the NCERT concept with correct reasoning and keywords.",
    explanation: "A strong answer links the concept, evidence, and conclusion.",
    keyPoints: ["Concept accuracy", "NCERT vocabulary", "Clear reasoning"],
    bloomLevel: index % 3 === 0 ? "APPLY" : index % 3 === 1 ? "ANALYZE" : "UNDERSTAND",
    competencyLevel: Math.min(5, 2 + (index % 4)),
    topic,
    chapterId: config.chapterIds[index % Math.max(1, config.chapterIds.length)],
    topicId: config.topicIds?.[index % Math.max(1, config.topicIds.length)],
    section: section.name,
    subject: config.subject,
    classNum: config.classNum,
  } satisfies GeneratedQuestion;

  switch (type) {
    case "MCQ":
      return {
        ...base,
        text: `A student observes ${topic} in a daily-life situation. Which explanation is most accurate?`,
        options: defaultOptions(),
        correctAnswer: "B",
      };
    case "ASSERTION_REASON":
      return {
        ...base,
        text: "Assertion (A): The concept works only when the correct condition is present. Reason (R): The condition changes how particles or values interact.",
        assertion: "The concept works only when the correct condition is present.",
        reason: "The condition changes how particles or values interact.",
        options: assertionOptions(),
        correctAnswer: "A",
      };
    case "TRUE_FALSE":
      return {
        ...base,
        text: `${topic} can be explained using evidence from observation.`,
        correctAnswer: "True",
      };
    case "ONE_WORD":
      return {
        ...base,
        text: `Which term best names the main idea in ${topic}?`,
        correctAnswer: "Principle",
      };
    case "FILL_BLANK":
      return {
        ...base,
        text: `The main factor responsible for ${topic} is ________.`,
        correctAnswer: "condition",
      };
    case "VERY_SHORT":
      return {
        ...base,
        text: `State one reason why ${topic} is important.`,
        correctAnswer: "It helps explain the observation using the correct NCERT concept.",
      };
    case "MATCH_FOLLOWING":
      return {
        ...base,
        text: "Match Column A with Column B.",
        matchPairs: [
          { left: "Concept", right: "Principle" },
          { left: "Observation", right: "Evidence" },
          { left: "Application", right: "Daily use" },
          { left: "Conclusion", right: "Inference" },
        ],
        correctAnswer: "A1-B1, A2-B2, A3-B3, A4-B4",
      };
    case "NUMERICAL":
      return {
        ...base,
        text: "A value changes from 20 units to 30 units. Calculate the increase and state the unit.",
        correctAnswer: "10 units",
        keyPoints: ["Step1: final - initial", "Step2: 30 - 20", "Step3: 10 units"],
      };
    case "SOURCE_BASED":
      return {
        ...base,
        scenario:
          "A school laboratory observation shows a clear change after a condition is altered. Students note the before and after evidence and discuss the principle behind it.",
        text: "Read the source and answer the questions.",
        subQuestions: Array.from({ length: 4 }, (_, subIndex) => ({
          text: `Source sub-question ${subIndex + 1}`,
          type: "ONE_WORD",
          correctAnswer: "Evidence",
          marks: 1,
        })),
      };
    case "CASE_BASED":
      return {
        ...base,
        scenario:
          "Riya observes a familiar classroom situation where changing one condition changes the result. She records the observation and explains it to her group.",
        text: "Read the case and answer the questions.",
        subQuestions: [
          {
            text: "Which concept is being applied?",
            type: "MCQ",
            options: defaultOptions(),
            correctAnswer: "B",
            marks: 2,
          },
          {
            text: "Explain the mechanism behind it.",
            type: "SHORT",
            correctAnswer: "The mechanism follows the NCERT principle and evidence.",
            marks: 2,
          },
        ],
      };
    case "PARAGRAPH":
      return {
        ...base,
        scenario:
          "The paragraph describes a concept, an observation, and a result. Use the given relationship to answer.",
        text: "Based on the paragraph, answer the question.",
      };
    case "HOTS":
      return {
        ...base,
        text: `Predict what would happen if the condition in ${topic} changed unexpectedly. Justify your answer.`,
        bloomLevel: "EVALUATE",
      };
    case "COMPETENCY":
      return {
        ...base,
        text: `You must solve a practical problem using ${topic}. What would you do and why?`,
        bloomLevel: "APPLY",
        competencyLevel: 3,
      };
    case "DIAGRAM":
      return {
        ...base,
        text: `Observe the diagram of ${topic} and answer.`,
        diagramDescription: `A labelled schematic showing ${topic} with key parts.`,
      };
    case "PRACTICAL":
      return {
        ...base,
        text: `Design an activity to verify ${topic}. Mention observation, inference, and precaution.`,
        correctAnswer: "Observation plus inference plus one valid precaution.",
        keyPoints: ["observation", "inference", "precaution"],
      };
    case "LONG":
      return {
        ...base,
        text: `Explain ${topic} with an introduction, main points, example, and conclusion.`,
        correctAnswer:
          "Introduction: define the concept. Main points: explain relationships and evidence. Example: connect to daily life. Conclusion: summarize the principle.",
        keyPoints: ["intro", "pt1", "pt2", "pt3", "example", "conclusion"],
      };
    case "NCERT_FORMAT":
      return {
        ...base,
        text: `Why is ${topic} important? Explain in NCERT exercise style.`,
        marks: marksPerType.NCERT_FORMAT,
      };
    default:
      return base;
  }
}

function defaultOptions() {
  return [
    { id: "A", text: "Only the visible observation matters", isCorrect: false },
    { id: "B", text: "The concept is applied with correct reasoning", isCorrect: true },
    { id: "C", text: "The result happens without any condition", isCorrect: false },
    { id: "D", text: "The observation is unrelated to the concept", isCorrect: false },
  ];
}

function assertionOptions() {
  return [
    {
      id: "A",
      text: "Both A and R true, R correctly explains A",
      isCorrect: true,
    },
    {
      id: "B",
      text: "Both A and R true, R does NOT explain A",
      isCorrect: false,
    },
    { id: "C", text: "A true, R false", isCorrect: false },
    { id: "D", text: "A false, R true", isCorrect: false },
  ];
}
