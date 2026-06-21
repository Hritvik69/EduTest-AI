import type { ConceptData } from "@/types";

export interface HiddenGem {
  type:
    | "SCIENTIST_NAME"
    | "DISCOVERY"
    | "TIMELINE"
    | "DID_YOU_KNOW"
    | "ETYMOLOGY"
    | "EXPERIMENT"
    | "SIDE_NOTE"
    | "COMPARISON"
    | "HISTORICAL_CONTEXT"
    | "FORGOTTEN_DETAIL";
  content: string;
  context?: string;
  source?: string; // reference to textbook section
  bloomLevel: "UNDERSTAND" | "ANALYZE" | "EVALUATE" | "CREATE";
}

export interface CuriosityConfig {
  enabled: boolean;
  minDifficulty?: "EASY" | "MEDIUM" | "HARD";
  maxQuestions?: number;
  focus?: HiddenGem["type"][];
}

/**
 * Pattern matches for extracting hidden gems from NCERT text
 */
const EXTRACTION_PATTERNS = {
  scientistName: /(?:scientist|physicist|chemist|biologist)\s+([A-Z][a-z]+\s+[A-Z][a-z]+)/gi,
  discovery: /(?:discovered|discovered that|first observed|proposed|formulated)\s+([^.!?]+)/gi,
  didYouKnow: /(?:did you know|fun fact|interesting fact)\s*:?\s*([^.!?]+)/gi,
  sideNote: /\[([^\]]+)\]|Note:\s*([^.!?]+)/gi,
  timeline: /(\d{4}|19\d{2}|20\d{2})\s*[-–]\s*([^.!?]+)/gi,
  etymology: /(?:etymology|origin|from|derived from)\s+(?:the\s+)?(?:word|term|Greek|Latin)\s+([^.!?]+)/gi,
  experiment: /(?:experiment|observation|demonstrated|showed that)\s+([^.!?]+)/gi,
  comparison: /(?:unlike|compared to|whereas|similar to|differ[s]?\s+from)\s+([^.!?]+)/gi,
};

/**
 * Extract hidden gems from NCERT source text
 * Prioritizes: Did You Know, Footnotes, Timeline sections, Side notes, Forgotten tables
 */
export function extractHiddenGems(
  sourceText: string,
  chapter?: string,
): HiddenGem[] {
  const gems: HiddenGem[] = [];

  // 1. HIGH PRIORITY: Did You Know sections
  const didYouKnowMatches = sourceText.matchAll(EXTRACTION_PATTERNS.didYouKnow);
  for (const match of didYouKnowMatches) {
    gems.push({
      type: "DID_YOU_KNOW",
      content: match[1]?.trim() || "",
      bloomLevel: "ANALYZE",
      source: chapter,
    });
  }

  // 2. HIGH PRIORITY: Side notes and footnotes
  const sideNoteMatches = sourceText.matchAll(EXTRACTION_PATTERNS.sideNote);
  for (const match of sideNoteMatches) {
    const content = match[1]?.trim() || match[2]?.trim() || "";
    if (content) {
      gems.push({
        type: "SIDE_NOTE",
        content,
        bloomLevel: "UNDERSTAND",
        source: chapter,
      });
    }
  }

  // 3. Scientist names and contributions
  const scientistMatches = sourceText.matchAll(EXTRACTION_PATTERNS.scientistName);
  const scientists = new Set<string>();
  for (const match of scientistMatches) {
    const name = match[1]?.trim();
    if (name && !scientists.has(name)) {
      scientists.add(name);
      gems.push({
        type: "SCIENTIST_NAME",
        content: name,
        bloomLevel: "UNDERSTAND",
        source: chapter,
      });
    }
  }

  // 4. Discoveries and formulations
  const discoveryMatches = sourceText.matchAll(EXTRACTION_PATTERNS.discovery);
  for (const match of discoveryMatches) {
    gems.push({
      type: "DISCOVERY",
      content: match[1]?.trim() || "",
      bloomLevel: "ANALYZE",
      source: chapter,
    });
  }

  // 5. Timelines
  const timelineMatches = sourceText.matchAll(EXTRACTION_PATTERNS.timeline);
  for (const match of timelineMatches) {
    gems.push({
      type: "TIMELINE",
      content: `${match[1]}: ${match[2]?.trim()}`,
      bloomLevel: "UNDERSTAND",
      source: chapter,
    });
  }

  // 6. Etymology and origins
  const etymologyMatches = sourceText.matchAll(EXTRACTION_PATTERNS.etymology);
  for (const match of etymologyMatches) {
    gems.push({
      type: "ETYMOLOGY",
      content: match[1]?.trim() || "",
      bloomLevel: "UNDERSTAND",
      source: chapter,
    });
  }

  // 7. Experiments and observations
  const experimentMatches = sourceText.matchAll(EXTRACTION_PATTERNS.experiment);
  for (const match of experimentMatches) {
    gems.push({
      type: "EXPERIMENT",
      content: match[1]?.trim() || "",
      bloomLevel: "APPLY",
      source: chapter,
    });
  }

  // 8. Comparisons
  const comparisonMatches = sourceText.matchAll(EXTRACTION_PATTERNS.comparison);
  for (const match of comparisonMatches) {
    gems.push({
      type: "COMPARISON",
      content: match[1]?.trim() || "",
      bloomLevel: "ANALYZE",
      source: chapter,
    });
  }

  return gems;
}

/**
 * Convert hidden gems to question-generation guidance
 */
export function buildHiddenGemsPrompt(
  gems: HiddenGem[],
  config: CuriosityConfig,
): string {
  if (!gems.length) {
    return `No hidden gems found in selected chapters. Generate fresh questions.`;
  }

  const grouped = groupGemsByType(gems);
  const typesList = Object.entries(grouped)
    .map(([type, items]) => `- ${type} (${items.length} items)`)
    .join("\n");

  return `
GENERATION MODE: HIDDEN GEMS & CURIOSITY QUESTIONS
- Mine the selected NCERT source for: scientist names, dates, discoveries, experiments, side notes, "Did You Know?" facts, timelines, etymology, and overlooked details.
- Prioritize: Did You Know sections, footnotes, timeline sections, side notes, and forgotten tables.

AVAILABLE HIDDEN GEMS:
${typesList}

QUESTION GENERATION FRAMEWORK:

1. **Scientist Names & Contributions** (${grouped["SCIENTIST_NAME"]?.length || 0} gems)
   Generate:
   - Which scientist first observed [discovery]?
   - Match the scientist with his/her contribution.
   - Identify the role of [scientist name] in [field].
   - When did [scientist] make their contribution?

2. **Historical Timelines** (${grouped["TIMELINE"]?.length || 0} gems)
   Generate:
   - Arrange these discoveries chronologically.
   - In which century was [discovery] made?
   - Which event occurred before [event]?
   - What was the sequence of developments?

3. **Did You Know Facts** (${grouped["DID_YOU_KNOW"]?.length || 0} gems)
   Generate:
   - Which [organism/entity] has [unusual property]?
   - What is the rarest/longest/smallest [thing] in [context]?
   - Which interesting fact about [topic] surprised most students?
   - Can you name an unusual example of [concept]?

4. **Etymology & Origins** (${grouped["ETYMOLOGY"]?.length || 0} gems)
   Generate:
   - What does "[term]" literally mean?
   - From which language does "[word]" originate?
   - The word "[biology]" is derived from which roots?
   - Explain the connection between [word etymology] and [meaning].

5. **Experiments & Observations** (${grouped["EXPERIMENT"]?.length || 0} gems)
   Generate:
   - [Scientist] observed [phenomenon] using which equipment?
   - What observation led to the discovery of [concept]?
   - Describe the experiment that proved [theory].
   - What was the key finding of [scientist's] work?

6. **Comparisons & Contrasts** (${grouped["COMPARISON"]?.length || 0} gems)
   Generate:
   - How does [A] differ from [B]?
   - Which scientist/discovery came first: [X] or [Y]?
   - Contrast [historical context] with [modern understanding].
   - Why was [older method] replaced by [newer one]?

7. **Side Notes & Forgotten Details** (${grouped["SIDE_NOTE"]?.length || 0} gems)
   Generate:
   - What additional information is provided in [textbook note]?
   - This side note reveals which important fact?
   - Why is this often overlooked detail significant?

CRITICAL RULES:
- DO NOT generate basic textbook questions (❌ "What is an atom?", ❌ "Define photosynthesis")
- Each question MUST reference or depend on the hidden gem content
- Questions should feel like "Easter eggs" that reward careful readers
- Vary question types: MCQ, SHORT, MATCH_FOLLOWING, TRUE_FALSE based on gem type
- Ensure difficulty matches config difficulty setting
- Do NOT lift gems verbatim as question text; reframe them as exam-quality questions
- Always maintain CBSE exam standards and Bloom's Taxonomy alignment
`;
}

/**
 * Group hidden gems by type for organization
 */
export function groupGemsByType(gems: HiddenGem[]): Record<HiddenGem["type"], HiddenGem[]> {
  return gems.reduce(
    (acc, gem) => {
      if (!acc[gem.type]) acc[gem.type] = [];
      acc[gem.type].push(gem);
      return acc;
    },
    {} as Record<HiddenGem["type"], HiddenGem[]>,
  );
}

/**
 * Convert gems to ConceptData for integration with existing pipeline
 */
export function gemsToConceptData(
  gems: HiddenGem[],
  chapterId: number,
  classNum: number,
  subject: string,
  chapterName: string,
): ConceptData[] {
  return gems.map((gem, index) => ({
    text: gem.content,
    type: `HIDDEN_GEM_${gem.type}`,
    bloomLevel: gem.bloomLevel,
    hotsPotential: gem.bloomLevel === "EVALUATE" || gem.bloomLevel === "CREATE",
    subject,
    classNum,
    chapterName,
    topicName: `Hidden Gem: ${gem.type.replace(/_/g, " ")}`,
    chapterId,
    source: "ncert_txt",
  }));
}
