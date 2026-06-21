import type { GenerationContract } from "@/types";

/**
 * Build the AI prompt rules for Hidden Gems & Curiosity Questions generation mode
 */
export function buildHiddenGemsPromptRules(contract: GenerationContract): string {
  const config = contract.source;
  const gemFocus = (contract as any).curiosityConfig?.focus?.join(", ") || "all types";

  return `
GENERATION MODE: HIDDEN GEMS & CURIOSITY QUESTIONS
- CONFIG: generationMode = "hidden_gems"
- TARGET: Generate exam-grade questions from overlooked textbook details, side notes, "Did You Know?" facts, scientist names, timelines, and historical context.

EXTRACTION PRIORITY (HIGH TO LOW):
1. "Did You Know?" sections and fact boxes
2. Footnotes and marginal notes
3. Timeline sections and historical context
4. Side notes and "Additional Information" boxes
5. Forgotten tables and comparison charts
6. Scientist names and their contributions
7. Etymology and word origins
8. Experimental procedures and observations
9. Historical comparisons and contrasts

FOCUS AREAS REQUESTED: ${gemFocus}

QUESTION GENERATION FRAMEWORK:

❌ DO NOT generate basic textbook questions:
  - "What is an atom?"
  - "Define photosynthesis"
  - "What is the cell theory?"
  - "Name the scientist who discovered X"

✅ DO generate questions like:

**Scientist Names & Contributions:**
  - "Which scientist first observed cork cells, and what instrument did they use?"
  - "Match these scientists with their discoveries"
  - "Identify the contribution of [scientist name] to the field of [subject]"
  - "When did [scientist] make their breakthrough?"

**Historical Timelines:**
  - "Arrange these scientific discoveries chronologically"
  - "In which century was [discovery] made?"
  - "Which event occurred before [other event]?"
  - "What was the sequence of developments in [field]?"

**Did You Know Facts:**
  - "Which cell in the human body is the longest?"
  - "Which organism has no true nucleus?"
  - "What is the rarest/smallest/largest [thing] in [context]?"

**Etymology & Origins:**
  - "The word '[biology]' originates from which language roots?"
  - "What does 'prokaryote' literally mean?"
  - "From where does the term '[scientific term]' derive?"

**Experiments & Observations:**
  - "Robert Hooke observed cork cells using which instrument?"
  - "Which observation led to the development of cell theory?"
  - "Describe the key finding of [scientist's] experiment"

**Comparisons:**
  - "How does [prokaryote] differ from [eukaryote]?"
  - "Which discovery came first: [X] or [Y]?"
  - "Compare [older concept] with [modern understanding]"

**Side Notes & Forgotten Details:**
  - "What additional information is provided in this textbook footnote?"
  - "Why is this often-overlooked detail significant?"
  - "How does this side note change our understanding of [concept]?"

CRITICAL RULES:
- Questions MUST be exam-grade (CBSE standard) and reference actual hidden gems
- DO NOT lift gem content verbatim; reframe as original, teacher-written questions
- Every question must feel like an "Easter egg" that rewards close reading
- Maintain Bloom's Taxonomy alignment (ANALYZE, EVALUATE focus for curiosity)
- Vary question types: MCQ (4 options), MATCH_FOLLOWING, SHORT, TRUE_FALSE, ASSERTION_REASON
- All answers must be fully sourced from NCERT text; no outside facts
- Difficulty must match config.paper.difficulty setting
- Each question should target 1 hidden gem + test understanding depth
`;
}

/**
 * Validate that hidden gems mode is properly configured
 */
export function validateHiddenGemsConfig(contract: GenerationContract): string[] {
  const errors: string[] = [];
  const curiosityConfig = (contract as any).curiosityConfig;

  if (!curiosityConfig?.enabled) {
    errors.push("Hidden Gems mode enabled but curiosityConfig.enabled is false");
  }

  if (contract.source.chapterIds.length === 0) {
    errors.push("No chapters selected for hidden gems extraction");
  }

  if (!curiosityConfig?.focus || curiosityConfig.focus.length === 0) {
    errors.push("No gem types selected in curiosity focus");
  }

  if ((curiosityConfig?.maxQuestions ?? 0) === 0) {
    errors.push("maxQuestions is 0; curiosity questions count must be > 0");
  }

  return errors;
}
