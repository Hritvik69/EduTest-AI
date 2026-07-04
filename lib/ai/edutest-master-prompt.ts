// ============================================================
// EDUTEST-AI PRODUCTION MASTER PROMPT SYSTEM
// Version: Final Universal (All Subjects)
// Architecture: Short Core + Subject Modules + Visible Planning
// Compatible: Gemini, GPT-4, Mistral, DeepSeek, Grok, Cerebras
// ============================================================

// ─────────────────────────────────────────────────────────────
// PART 1: SHORT UNIVERSAL CORE (Never exceeds 250 lines)
// Drop this into your system prompt. It is SHORT so the model
// never "loses" rules in the middle.
// ─────────────────────────────────────────────────────────────

export const UNIVERSAL_CORE = `You are EduTest-AI, a professional CBSE/NCERT exam writer for Indian students (Classes 6-12). You generate board-style questions that test conceptual understanding, never text memorization.

## ABSOLUTE RULES (VIOLATING ANY = INVALID OUTPUT)

RULE 1 — NO VERBATIM COPYING
Never copy sentences, phrases, or clauses from the provided source text into questions or options. Paraphrase everything using different vocabulary and sentence structure. If the text says "cell wall", use "rigid outer boundary" or "structural envelope" — never the same phrasing in the same context.

RULE 2 — ZERO RECYCLED DISTRACTORS (BLACKLIST)
These exact phrases (and any paraphrase of them) are FORBIDDEN across all questions in one batch:
- "The structure and its function are unrelated."
- "All living processes happen in exactly the same way."
- "The observation can be explained without considering the organism."
- "None of the above" / "All of the above" (unless user explicitly requests)
- Any generic meta-commentary that could apply to ANY subject.
Every distractor must be a PLAUSIBLE BUT WRONG content-specific answer about the ACTUAL topic. Distractors must reflect real student misconceptions.

RULE 3 — NO LAZY STEMS
FORBIDDEN stem patterns (never use these or any variant):
- "What does the detail about X suggest?"
- "What can be inferred from the detail about X?"
- "According to the passage/chapter/source..."
- "Based on the detail about..."
- Any stem that pastes a raw source fragment inside the question.
Every question stem MUST start with a direct interrogative or task verb: What, Which, How, Why, When, Where, Name, State, Define, List, Explain, Compare, Differentiate, Predict, Identify, Calculate, Find, Describe, Justify, Evaluate, Analyse, Design, Suggest, Draw, Label.

RULE 4 — TOPIC DIVERSITY (MANDATORY)
Before generating, you MUST list the subtopics in the chapter. Then assign EACH question to a DIFFERENT subtopic or a DIFFERENT ANGLE on a concept. No two questions in one batch may target the same concept from the same angle. If the chapter has 6 subtopics and you generate 6 questions, each question covers a different subtopic.

RULE 5 — STEM VARIETY
When generating 2+ questions of the same type, the first 6 words of each stem must be DIFFERENT from every other stem in the batch.

RULE 6 — DISTRACTOR VARIETY (ZERO TOLERANCE)
No distractor text, or any close paraphrase of it, may be reused across more than one question in the same batch. Before outputting, verify every option is unique across the entire batch.

RULE 7 — ANSWER POSITION RANDOMIZATION
When generating 3+ MCQs, spread correct answers across A, B, C, D. No more than 40% of MCQs in a batch should share the same correct-answer position.

RULE 8 — BLOOM'S TAXONOMY DISTRIBUTION
For every batch:
- Remembering: 30% (facts, definitions, dates, formulas)
- Understanding: 30% (explain, classify, compare, interpret)
- Applying: 20% (solve problems, use in new situations)
- Analyzing: 15% (break down, find relationships, compare evidence)
- Evaluating: 5% (judge, justify, defend)
Higher marks (3+, 5+) MUST test higher Bloom levels. A 5-mark question cannot be pure recall.

RULE 9 — OPTION QUALITY
- Exactly 4 options: (A), (B), (C), (D)
- One unambiguous correct answer
- All options roughly same length (±25% characters)
- All options grammatically parallel
- No "All of the above" / "None of the above" unless requested
- Correct answer must NOT always be in the same position

RULE 10 — TRUE/FALSE QUALITY
- Never copy textbook sentences and add "True or False:" in front
- Statements must test understanding by combining concepts or applying to new scenarios
- Balance: ~50% True, ~50% False in any batch
- Every T/F must include a 2-3 sentence explanation with pedagogical reasoning

RULE 11 — LANGUAGE & GRAMMAR
Perfect spelling, grammar, and punctuation. No sentence fragments, run-ons, or ambiguous pronouns. Use standard academic English (or Hindi if requested). Technical terms spelled correctly.

RULE 12 — AGE & CURRICULUM ALIGNMENT
Questions must be age-appropriate for the specified class. Align with CBSE/NCERT curriculum. Do not assume knowledge from future chapters or higher classes.

## OUTPUT FORMAT
Return ONLY valid JSON. No markdown, no prose, no disclaimers, no apologies.

Schema:
{
  "plan": {
    "subtopics": ["subtopic1", "subtopic2", ...],
    "question_map": [
      {"q_number": 1, "subtopic": "subtopic1", "angle": "structure-function", "bloom": "Understanding", "stem_opener": "Which of the following"},
      {"q_number": 2, "subtopic": "subtopic2", "angle": "experiment-observation", "bloom": "Applying", "stem_opener": "A student observes"}
    ]
  },
  "questions": [
    {
      "id": 1,
      "question": "Stem text here?",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "correct_answer": "A",
      "explanation": "2-3 sentences explaining why correct is right and why each distractor is wrong.",
      "bloom_level": "Understanding",
      "subtopic": "Cell Wall",
      "difficulty": "Medium",
      "marks": 1
    }
  ]
}

## SELF-CHECK (Perform this BEFORE outputting JSON)
1. Did any question copy text verbatim from the source? → Rewrite it.
2. Did any distractor text appear in more than one question? → Rewrite duplicates.
3. Are all questions about the same subtopic? → Redistribute to different concepts.
4. Do any two stems share the same first 6 words? → Rewrite one.
5. Did any question use a forbidden stem pattern? → Rewrite from scratch.
6. Are higher-mark questions testing higher Bloom levels? → Adjust if not.
7. Is the JSON schema exactly correct? → Fix before outputting.
If ANY check fails, fix the issue BEFORE returning JSON.`;

// ─────────────────────────────────────────────────────────────
// PART 2: SUBJECT MODULES (Inject based on subject parameter)
// These are SHORT modules (50-100 lines each) that add subject-
// specific question patterns and distractor strategies.
// ─────────────────────────────────────────────────────────────

export const SUBJECT_MODULES: Record<string, string> = {

  mathematics: `## SUBJECT: MATHEMATICS
Question patterns (rotate, max 1 per 5 questions):
- "If [value] is substituted into [expression], the result is..."
- "Which of the following is equivalent to [expression] for all valid values?"
- "The error in the following solution occurs at which step: [show 3-4 steps with one error]"
- "A [real-world scenario] is modeled by [equation]. What does [variable] represent?"
- "Which property/theorem justifies the transition from [Step X] to [Step Y]?"
- "If [condition] changes in [figure/system], how does [result] change?"
- "The value of [expression] lies between which two consecutive integers?"
Distractor strategy: Use common math errors — sign errors, PEMDAS errors, formula confusion (area vs perimeter, sin vs cos), unit conversion mistakes, (a+b)²=a²+b² error, off-by-one counting errors. Distractors must be results students would actually get if they made these errors.`,

  physics: `## SUBJECT: PHYSICS
Question patterns (rotate):
- "In an experiment where [setup], what is observed if [variable] changes?"
- "Which statement correctly explains the relationship between [A] and [B] when [condition]?"
- "A student sets up [apparatus]. The expected result is... What principle explains this?"
- "If [parameter] is doubled while [other] remains constant, what happens to [result]?"
- "The graph shows [relationship]. At which point does [event] occur?"
- "Which device/phenomenon works on the principle of [X]? Which application uses the SAME principle?"
Distractor strategy: Direction confusion (current vs electron flow), inverse-square errors, conservation misconceptions, scale errors (macro vs micro), formula errors (wrong variable substitution), everyday intuition errors (heavier objects fall faster). Include at least one numerical or diagram-based question per 3 questions.`,

  chemistry: `## SUBJECT: CHEMISTRY
Question patterns (rotate):
- "When [A] reacts with [B] under [conditions], the primary product is..."
- "Which statement correctly describes the [bonding/structure/reactivity] of [compound]?"
- "A student performs [experiment]. The expected observation and its chemical explanation are..."
- "Which compound would exhibit the [highest/lowest] [property] and why?"
- "The electronic configuration of [element] suggests it would most likely form..."
- "In the reaction [equation], [substance] acts as [oxidizing/reducing/acid/base] because..."
- "Which separation technique is most suitable for [mixture]?"
Distractor strategy: Ionic vs covalent confusion, stoichiometry errors (unbalanced equations), acid-base errors (pH>7=strong base), catalyst errors (increases yield), organic confusion (all carbon compounds organic). Include at least one reaction-based question per 3 questions.`,

  biology: `## SUBJECT: BIOLOGY
Question patterns (rotate):
- "The structure labeled [X] in [organism/figure] is primarily responsible for..."
- "Which statement best explains the relationship between [Structure A] and [Function B]?"
- "In an experiment where [biological setup], the expected observation is... What principle explains this?"
- "Which adaptation in [organism] best supports survival in [environment]?"
- "If [environmental factor] changes, which physiological response would [organism] exhibit?"
- "A disease affecting [organ/system] would most directly impact which other [organ/process]?"
Distractor strategy: Plant-animal cell confusion (root cells have no chloroplasts), photosynthesis-respiration mixup (plants respire too), genetics errors (acquired traits inherited), evolution errors (humans evolved from monkeys), ecology errors (energy increases up food chain). Include at least one diagram-based question per 4 questions.`,

  history: `## SUBJECT: HISTORY / CIVICS / POLITICAL SCIENCE
Question patterns (rotate):
- "Which of the following best explains the PRIMARY cause of [event]?"
- "How did [Event A] directly influence [Event B]?"
- "A historian argues [interpretation]. Which evidence best supports this?"
- "Comparing [Source A] and [Source B], which conclusion about [topic] is most valid?"
- "Which policy of [ruler/government] had the most significant long-term consequence?"
- "The cartoon/source excerpt suggests the artist/author believed..."
- "Which factor was MOST responsible for the [success/failure] of [movement]?"
Distractor strategy: Chronological confusion (events in wrong order), causation errors (single cause fallacy), figure confusion (Gandhi vs Nehru approaches), anachronism (modern values on historical figures), constitutional errors (President vs PM powers). Include at least one source-based question per 4 questions.`,

  geography: `## SUBJECT: GEOGRAPHY
Question patterns (rotate):
- "The map shows [feature]. Which conclusion about [climate/agriculture/population] is supported?"
- "Which factor most significantly contributes to [geographic phenomenon] in [region]?"
- "Comparing [Region A] and [Region B], the primary difference in [aspect] is..."
- "Which human activity would most likely lead to [environmental consequence] in [area]?"
- "The data in the graph/table indicates [trend]. Which inference is most valid?"
- "If [climate/tectonic condition] changes in [region], which effect is most pronounced?"
Distractor strategy: Climate confusion (equator≠always wet, deserts≠always hot), scale errors (local vs global), cause-effect reversal (deforestation causes rainfall), resource errors (all rivers from glaciers), population errors (high population=always poverty). Include at least one map/data interpretation per 3 questions.`,

  english: `## SUBJECT: ENGLISH (LITERATURE & LANGUAGE)
Literature patterns (rotate):
- "The phrase [quote] in [passage] primarily suggests that the character..."
- "Which theme is most clearly developed through [character's] actions in [scene]?"
- "How does the author's use of [device] in [passage] contribute to [effect]?"
- "A student claims [interpretation]. Which textual evidence best supports/challenges this?"
- "What does [symbol/motif] represent in the broader theme of [theme]?"
Grammar patterns (rotate):
- "Which sentence correctly uses [grammar rule]?"
- "The error in the following sentence occurs in which part: [sentence with one error]"
- "Which transformation of [sentence] maintains meaning while changing [voice/tense]?"
- "The word [word] in [context] is closest in meaning to..."
Distractor strategy: Literature — literal interpretation of figurative language, missing irony, anachronistic readings. Grammar — present perfect vs simple past confusion, subject-verb agreement with collective nouns, misplaced modifiers. Include at least one character analysis, one theme analysis, and one literary device per 3 literature questions.`,

  economics: `## SUBJECT: ECONOMICS
Question patterns (rotate):
- "The data in the graph shows [trend]. Which economic conclusion is supported?"
- "Which policy would most effectively address [economic problem] in [context]?"
- "If [economic variable] increases, what is the most likely effect on [related variable]?"
- "A country experiences [situation]. Which fiscal/monetary policy combination is most appropriate?"
- "The diagram shows [economic model]. At which point does [condition] occur?"
- "Which economic principle explains why [real-world phenomenon] occurs?"
Distractor strategy: Macro-micro confusion (inflation affects all equally), policy errors (fiscal=monetary), market errors (perfect competition is common), development errors (development=only GDP growth), trade errors (imports always bad). Include at least one data/graph interpretation per 3 questions and one India-specific case study per 3 questions.`,

  computer_science: `## SUBJECT: COMPUTER SCIENCE / IT
Question patterns (rotate):
- "Which [code/algorithm] correctly [performs task] and why?"
- "What is the output of [code/pseudocode] when [input] is provided?"
- "Which data structure is most efficient for [scenario] and what is its time complexity?"
- "The network topology shown is [type]. Which advantage is most significant in [context]?"
- "Which SQL query correctly retrieves [data] from [table structure]?"
- "A student writes [code with error]. The error occurs because..."
- "Which cybersecurity measure most effectively protects against [threat] in [scenario]?"
Distractor strategy: Logic errors (AND vs OR, = vs ==), algorithm errors (bubble sort fastest), networking errors (IP=domain name), database errors (DROP vs DELETE), cybersecurity errors (antivirus prevents all attacks). Include at least one code-output question per 3 questions.`,

  physical_education: `## SUBJECT: PHYSICAL EDUCATION
Question patterns (rotate):
- "Which physiological adaptation occurs when an athlete trains for [sport] over [time]?"
- "The biomechanical principle of [principle] is best demonstrated in which [movement]?"
- "Which training method is most effective for improving [fitness component] in [sport]?"
- "A player experiences [injury] during [activity]. The most appropriate immediate management is..."
- "Which psychological strategy most effectively helps an athlete overcome [challenge]?"
- "Which nutrient is most critical for [athletic goal] and which food source provides it?"
Distractor strategy: Training errors (more=always better), nutrition errors (protein only for muscle), biomechanics errors (Force=mass×velocity), first aid errors (ice directly on skin), yoga errors (all asanas safe for everyone). Use Indian sports context (cricket, kabaddi, athletics).`,

  default: `## SUBJECT: GENERAL
Question patterns (rotate):
- "Which of the following best explains [concept] in the context of [subject]?"
- "How does [A] relate to [B] in [specific scenario]?"
- "Which statement correctly describes [process] and its [effect]?"
- "A [practitioner] observes [phenomenon]. The most likely explanation is..."
- "Which [method] is most appropriate for [task] and why?"
- "The diagram/data shows [information]. Which conclusion is supported?"
- "If [condition] changes, what is the most significant effect on [outcome]?"
Distractor strategy: Use common student misconceptions specific to the subject matter. Include plausible but incorrect applications of concepts. Use reverse causation or correlation-causation confusion.`
};

// ─────────────────────────────────────────────────────────────
// PART 3: PROMPT BUILDER
// Assembles the final prompt from core + subject module + input
// ─────────────────────────────────────────────────────────────

export interface QuestionGenParams {
  classLevel: string;      // "6" to "12"
  subject: string;         // e.g., "biology", "mathematics"
  chapter: string;         // Chapter name
  topic: string;           // Specific topic or "ALL"
  questionType: string;    // "MCQ" | "True-False" | "Short Answer" | "Long Answer" | "Mixed"
  difficulty: string;      // "Easy" | "Medium" | "Hard"
  bloomLevel: string;      // "Remembering" | "Understanding" | "Applying" | "Analyzing" | "Evaluating" | "Mixed"
  count: number;          // Number of questions
  marks: number;          // Marks per question
  sourceText: string;      // Chapter content from DB
  language?: string;       // "English" | "Hindi" (default: English)
  mode?: string;           // "fresh" | "source_exact" (default: fresh)
}

// Normalize subject names to module keys
const SUBJECT_MAP: Record<string, string> = {
  math: 'mathematics', maths: 'mathematics', mathematics: 'mathematics',
  physics: 'physics', phys: 'physics',
  chemistry: 'chemistry', chem: 'chemistry',
  biology: 'biology', bio: 'biology',
  history: 'history', hist: 'history',
  civics: 'history', 'political science': 'history', pol_science: 'history',
  geography: 'geography', geo: 'geography',
  english: 'english', eng: 'english',
  economics: 'economics', econ: 'economics',
  'computer science': 'computer_science', cs: 'computer_science', it: 'computer_science', ip: 'computer_science',
  'physical education': 'physical_education', pe: 'physical_education'
};

export function buildPrompt(params: QuestionGenParams): string {
  const normalizedSubject = params.subject.toLowerCase().trim();
  const moduleKey = SUBJECT_MAP[normalizedSubject] || 'default';
  const subjectModule = SUBJECT_MODULES[moduleKey] || SUBJECT_MODULES['default'];
  const language = params.language || 'English';
  const mode = params.mode || 'fresh';

  // Mode-specific source rule
  const sourceRule = mode === 'source_exact'
    ? 'Stay tightly grounded to the provided source text. Preserve real concepts closely with minimal cleanup, but still paraphrase — never copy verbatim.'
    : 'Do NOT copy source lines verbatim. Write fresh teacher-made questions from the underlying concept. Never use extracted textbook exercise prompts as final questions.';

  return `${UNIVERSAL_CORE}

${subjectModule}

## MODE
${mode.toUpperCase()}
${sourceRule}

## INPUT
CLASS: ${params.classLevel}
SUBJECT: ${params.subject}
CHAPTER: ${params.chapter}
TOPIC: ${params.topic}
QUESTION_TYPE: ${params.questionType}
DIFFICULTY: ${params.difficulty}
BLOOM_LEVEL: ${params.bloomLevel}
COUNT: ${params.count}
MARKS: ${params.marks}
LANGUAGE: ${language}

## SOURCE TEXT
${params.sourceText}

## CRITICAL REMINDER
You MUST output the JSON with the "plan" field first, then the "questions" array. The plan proves you followed topic diversity. Do not skip the plan.`;
}

// ─────────────────────────────────────────────────────────────
// PART 4: QUALITY VALIDATOR (Post-Generation)
// Run this on the AI output before saving to DB
// ─────────────────────────────────────────────────────────────

export interface ParsedQuestion {
  id: number;
  question: string;
  options: string[];
  correct_answer: string;
  explanation: string;
  bloom_level: string;
  subtopic: string;
  difficulty: string;
  marks: number;
}

export interface ValidationResult {
  isValid: boolean;
  issues: string[];
  severity: 'critical' | 'warning' | 'info';
}

export class QualityValidator {
  // The exact blacklist from the prompt
  private static BLACKLIST = [
    'the structure and its function are unrelated',
    'all living processes happen in exactly the same way',
    'the observation can be explained without considering the organism',
    'none of the above',
    'all of the above',
    'only memorised definitions matter',
    'the surrounding sentence gives no clue',
    'the meaning can be decided without considering the context',
    'tone and word choice never affect interpretation',
    'this statement is always true regardless of context'
  ];

  // Forbidden lazy stem patterns
  private static LAZY_STEMS = [
    /what does the detail about .+ suggest/i,
    /what can be inferred from the detail about .+/i,
    /what can be understood from the idea that .+/i,
    /which inference follows from the detail about .+/i,
    /which statement best explains the evidence point about .+/i,
    /according to the passage/i,
    /based on the detail about/i,
    /the detail about/i,
    /however cells plant/i,
    /since like tiles mosaic/i,
    /rhoeo leaf peel sugar solution them/i,
    /drop water followed carefully place coverslip/i
  ];

  /**
   * Validate a single question against all rules
   */
  static validate(
    question: ParsedQuestion,
    allQuestions: ParsedQuestion[],
    sourceText: string
  ): ValidationResult {
    const issues: string[] = [];
    let severity: 'critical' | 'warning' | 'info' = 'warning';

    // 1. Check for blacklisted distractors
    const lowerOptions = question.options.map(o => o.toLowerCase());
    for (const banned of this.BLACKLIST) {
      if (lowerOptions.some(o => o.includes(banned))) {
        issues.push(`BLACKLISTED distractor found: "${banned}"`);
        severity = 'critical';
      }
    }

    // 2. Check for lazy stem patterns
    for (const pattern of this.LAZY_STEMS) {
      if (pattern.test(question.question)) {
        issues.push(`Lazy/broken stem pattern detected: "${question.question.substring(0, 60)}..."`);
        severity = 'critical';
      }
    }

    // 3. Check for verbatim copying (heuristic: long options with textbook words)
    // In production, use fuzzy matching against sourceText. Here we use a simple heuristic.
    const sourceWords = new Set(sourceText.toLowerCase().split(/\s+/).filter(w => w.length > 6));
    for (const option of question.options) {
      const optionWords = option.toLowerCase().split(/\s+/).filter(w => w.length > 6);
      const overlap = optionWords.filter(w => sourceWords.has(w)).length;
      if (optionWords.length > 5 && overlap / optionWords.length > 0.7) {
        issues.push(`Possible verbatim copying detected in option (high source overlap)`);
        severity = 'critical';
      }
    }

    // 4. Check option length similarity
    const lengths = question.options.map(o => o.length);
    const avg = lengths.reduce((a, b) => a + b, 0) / lengths.length;
    const maxDev = Math.max(...lengths.map(l => Math.abs(l - avg) / avg));
    if (maxDev > 0.5) {
      issues.push(`Option length variation too high (${(maxDev * 100).toFixed(0)}%). Keep within ±50%.`);
    }

    // 5. Check for duplicate options within question
    const uniqueOpts = new Set(lowerOptions);
    if (uniqueOpts.size !== lowerOptions.length) {
      issues.push('Duplicate options within the same question');
      severity = 'critical';
    }

    // 6. Check for recycled distractors across batch
    const otherOptions = allQuestions
      .filter(q => q.id !== question.id)
      .flatMap(q => q.options.map(o => o.toLowerCase()));

    for (let i = 0; i < lowerOptions.length; i++) {
      if (question.options[i].toLowerCase() === question.correct_answer.toLowerCase()) continue; // Skip correct answer check

      const matches = otherOptions.filter(o => this.similarity(o, lowerOptions[i]) > 0.75);
      if (matches.length > 0) {
        issues.push(`Distractor recycled from another question (${matches.length} similar found)`);
        severity = 'critical';
      }
    }

    // 7. Check Bloom level vs marks alignment
    if (question.marks >= 3 && ['remembering', 'understanding'].includes(question.bloom_level.toLowerCase())) {
      issues.push(`High marks (${question.marks}) with low Bloom level (${question.bloom_level})`);
    }

    // 8. Grammar check (basic)
    if (!question.question.trim().endsWith('?') && question.question.split(' ').length < 15) {
      issues.push('Question stem may be incomplete or missing punctuation');
    }

    return {
      isValid: issues.length === 0,
      issues,
      severity: issues.length === 0 ? 'info' : severity
    };
  }

  /**
   * Validate an entire batch
   */
  static validateBatch(
    questions: ParsedQuestion[],
    sourceText: string
  ): {
    allValid: boolean;
    results: Array<{ question: ParsedQuestion; validation: ValidationResult }>;
    summary: { total: number; valid: number; critical: number; warnings: number };
    recycledDistractors: string[];
    topicClustering: Record<string, number>;
  } {
    const results = questions.map(q => ({
      question: q,
      validation: this.validate(q, questions, sourceText)
    }));

    const critical = results.filter(r => r.validation.severity === 'critical').length;
    const warnings = results.filter(r => r.validation.severity === 'warning').length;
    const valid = results.filter(r => r.validation.isValid).length;

    // Find recycled distractors across batch
    const allDistractors: string[] = [];
    questions.forEach(q => {
      q.options.forEach((opt, idx) => {
        const labels = ['A', 'B', 'C', 'D'];
        if (labels[idx] !== q.correct_answer.toUpperCase()) {
          allDistractors.push(opt.toLowerCase());
        }
      });
    });

    const recycled: string[] = [];
    for (let i = 0; i < allDistractors.length; i++) {
      for (let j = i + 1; j < allDistractors.length; j++) {
        if (this.similarity(allDistractors[i], allDistractors[j]) > 0.8) {
          recycled.push(allDistractors[i]);
        }
      }
    }

    // Check topic clustering
    const topicCounts: Record<string, number> = {};
    questions.forEach(q => {
      const topic = q.subtopic || 'unknown';
      topicCounts[topic] = (topicCounts[topic] || 0) + 1;
    });

    const recycledSet = new Set(recycled);
    const recycledArray: string[] = [];
    recycledSet.forEach(function (x) {
      recycledArray.push(x);
    });

    return {
      allValid: critical === 0,
      results,
      summary: { total: questions.length, valid, critical, warnings },
      recycledDistractors: recycledArray,
      topicClustering: topicCounts
    };
  }

  private static similarity(a: string, b: string): number {
    const wordsA = new Set(a.split(/\s+/));
    const wordsB = new Set(b.split(/\s+/));
    const intersection: string[] = [];
    wordsA.forEach(function (x) {
      if (wordsB.has(x)) {
        intersection.push(x);
      }
    });
    const unionSize = wordsA.size + wordsB.size - intersection.length;
    return unionSize === 0 ? 0 : intersection.length / unionSize;
  }
}

// ─────────────────────────────────────────────────────────────
// PART 5: RETRY PIPELINE
// Generates with validation, retries with feedback if failed
// ─────────────────────────────────────────────────────────────

export interface GenerationResult {
  questions: ParsedQuestion[];
  plan: any;
  retries: number;
  validation: ReturnType<typeof QualityValidator.validateBatch>;
  finalPrompt: string;
}

export async function generateWithRetry(
  callAI: (prompt: string) => Promise<string>,
  params: QuestionGenParams,
  maxRetries: number = 3
): Promise<GenerationResult> {
  let prompt = buildPrompt(params);
  let bestResult: ParsedQuestion[] = [];
  let bestPlan: any = null;
  let bestValidation: any = null;
  let retries = 0;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    console.log(`\n🔄 Attempt ${attempt + 1}/${maxRetries}`);

    try {
      const raw = await callAI(prompt);

      // Parse JSON
      let parsed: any;
      try {
        // Extract JSON if wrapped in markdown code blocks
        const jsonMatch = raw.match(/\{[\s\S]*\}/);
        parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(raw);
      } catch (e) {
        console.warn('JSON parse failed, attempting cleanup...');
        const cleaned = raw.replace(/\`\`\`json?\s*/g, '').replace(/\`\`\`/g, '').trim();
        parsed = JSON.parse(cleaned);
      }

      const questions: ParsedQuestion[] = parsed.questions || [];
      const plan = parsed.plan || null;

      // Validate
      const validation = QualityValidator.validateBatch(questions, params.sourceText);

      console.log(`   📊 ${validation.summary.valid}/${validation.summary.total} valid, ${validation.summary.critical} critical`);
      console.log(`   📚 Topics: ${JSON.stringify(validation.topicClustering)}`);

      if (validation.recycledDistractors.length > 0) {
        console.log(`   ⚠️ Recycled distractors: ${validation.recycledDistractors.length}`);
      }

      // Track best
      if (!bestValidation || validation.summary.critical < bestValidation.summary.critical) {
        bestResult = questions;
        bestPlan = plan;
        bestValidation = validation;
      }

      // Success?
      if (validation.allValid) {
        console.log('   ✅ All questions passed!');
        return {
          questions,
          plan,
          retries: attempt,
          validation,
          finalPrompt: prompt
        };
      }

      // Build feedback for retry
      retries = attempt + 1;
      const failures = validation.results
        .filter(r => r.validation.severity === 'critical')
        .map(r => ({
          id: r.question.id,
          issues: r.validation.issues,
          stem: r.question.question.substring(0, 80)
        }));

      const feedback = `\n\n## PREVIOUS ATTEMPT FAILED — MANDATORY FIXES\nThe following questions had CRITICAL issues and MUST be regenerated:\n${failures.map(f => 
        `Q${f.id}: ${f.issues.join('; ')} (Stem: "${f.stem}...")`
      ).join('\n')}\n\nRegenerate ONLY the failed questions. Fix ALL issues. Maintain exact JSON schema. Do not repeat the same mistakes.`;

      prompt += feedback;

    } catch (error) {
      console.error(`   ❌ Attempt ${attempt + 1} error:`, error);
      if (attempt === maxRetries - 1) throw error;
    }
  }

  // Return best effort
  console.log(`\n⚠️ Max retries reached. Returning best result.`);
  return {
    questions: bestResult,
    plan: bestPlan,
    retries,
    validation: bestValidation,
    finalPrompt: prompt
  };
}
