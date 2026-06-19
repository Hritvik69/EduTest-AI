import sql from "@/lib/db";
import {
  isNcertTxtSourceConcept,
  isSourceTextConcept,
  normalizeNcertTxtConceptType,
} from "@/lib/source-types";
import type { BloomLevel, ConceptData, Difficulty } from "@/types";

type BloomTarget = Partial<Record<BloomLevel, number>>;
export type SourceQuality = "strong" | "weak" | "outline_only" | "missing";

export interface SourceQualitySummary {
  quality: SourceQuality;
  sourceTextChunks: number;
  meaningfulChars: number;
  outlineRatio: number;
}

export async function retrieveConcepts(
  conceptsOrChapterIds: ConceptData[] | number[],
  difficulty: Difficulty,
  bloomTarget: BloomTarget,
) {
  const concepts: ConceptData[] = isConceptArray(conceptsOrChapterIds)
    ? conceptsOrChapterIds
    : await fetchConceptsByChapterIds(conceptsOrChapterIds);
  const sourceTextConcepts = concepts.filter(isSourceTextConcept);
  const contextConcepts = sourceTextConcepts.length ? sourceTextConcepts : concepts;

  const weighted = [...contextConcepts].sort((a, b) => {
    const sourceTextWeight = sourceTextScore(b) - sourceTextScore(a);
    if (sourceTextWeight) return sourceTextWeight;

    const hotsWeight =
      difficulty === "HARD" || difficulty === "ABSURD"
        ? Number(b.hotsPotential) - Number(a.hotsPotential)
        : 0;
    if (hotsWeight) return hotsWeight;

    return bloomScore(b.bloomLevel, bloomTarget) - bloomScore(a.bloomLevel, bloomTarget);
  });

  const lines = weighted.map((concept) => {
    const subject = concept.subject ? `[Subject: ${concept.subject}] ` : "";
    const chapter = concept.chapterName
      ? `[Chapter: ${concept.chapterName}] `
      : `[ChapterId: ${concept.chapterId}] `;

    return `${subject}${chapter}[Source: ${concept.source ?? "unknown"}] [Topic: ${concept.topicName}] [${concept.bloomLevel}] [${concept.type}] ${concept.text}`;
  });

  return limitContext(lines);
}

export function analyzeConceptSourceQuality(
  concepts: ConceptData[],
): SourceQualitySummary {
  if (!concepts.length) {
    return {
      quality: "missing",
      sourceTextChunks: 0,
      meaningfulChars: 0,
      outlineRatio: 1,
    };
  }

  const sourceTextChunks = concepts.filter(isSourceTextConcept).length;
  const uniqueTexts = Array.from(
    new Set(concepts.map((concept) => normalizeText(concept.text)).filter(Boolean)),
  );
  const outlineCount = uniqueTexts.filter(isOutlineText).length;
  const meaningfulChars = uniqueTexts.filter((text) => !isOutlineText(text)).join(" ").length;
  const outlineRatio = uniqueTexts.length ? outlineCount / uniqueTexts.length : 1;

  let quality: SourceQuality = "strong";
  if (!sourceTextChunks && outlineRatio >= 0.7) {
    quality = "outline_only";
  } else if (meaningfulChars < 650 && sourceTextChunks < 2) {
    quality = "weak";
  }

  return {
    quality,
    sourceTextChunks,
    meaningfulChars,
    outlineRatio,
  };
}

function isConceptArray(input: ConceptData[] | number[]): input is ConceptData[] {
  return Boolean(input[0] && typeof input[0] === "object");
}

async function fetchConceptsByChapterIds(chapterIds: number[]): Promise<ConceptData[]> {
  if (!sql || !chapterIds.length) return [];

  try {
    const rows = await sql`
      SELECT c.text, c.type, c.bloom_level, c.hots_potential,
             t.id AS topic_id, t.name AS topic_name,
             c.chapter_id, c.source
      FROM concepts c
      LEFT JOIN topics t ON t.id = c.topic_id
      WHERE c.chapter_id = ANY(${chapterIds})
      ORDER BY c.id ASC
    `;

    return rows.map((row) => {
      const type = normalizeNcertTxtConceptType(row.type);
      return {
        text: row.text,
        type,
        bloomLevel: row.bloom_level,
        hotsPotential: Boolean(row.hots_potential),
        hotsPoential: Boolean(row.hots_potential),
        topicName: row.topic_name ?? "General",
        topicId: row.topic_id ? Number(row.topic_id) : undefined,
        chapterId: row.chapter_id,
        source:
          isSourceTextConcept({ type, text: row.text } as ConceptData) ||
          row.source === "ncert_txt"
            ? "ncert_txt"
            : row.source === "pdf" ||
                row.source === "curriculum" ||
                row.source === "demo"
              ? row.source
              : "unknown",
      };
    }) satisfies ConceptData[];
  } catch {
    return [];
  }
}

function bloomScore(level: string, target: BloomTarget) {
  return target[level as BloomLevel] ?? 0;
}

function sourceTextScore(concept: ConceptData) {
  if (isNcertTxtSourceConcept(concept)) return 4;
  if (isSourceTextConcept(concept)) return 3;
  if (concept.source === "ncert_txt" && concept.text.length >= 900) return 3;
  if (concept.source === "ncert_txt") return 2;
  if (concept.source === "pdf" && concept.text.length >= 900) return 2;
  if (concept.source === "pdf") return 1;
  return 0;
}

function normalizeText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function isOutlineText(text: string) {
  const wordCount = text.split(/\s+/).filter(Boolean).length;
  return (
    wordCount < 8 ||
    /includes the NCERT\/CBSE topic|reading comprehension and inference|vocabulary and grammar in context|theme, character, tone, and literary devices|core concepts and definitions|textbook examples and exercises|problem solving and application|is an important concept from the uploaded PDF/i.test(
      text,
    )
  );
}

function limitContext(lines: string[]) {
  const configured = Number(process.env.AI_CONTEXT_CHAR_LIMIT);
  const limit =
    Number.isInteger(configured) && configured >= 2500 && configured <= 16000
      ? configured
      : 9000;
  let total = 0;
  const selected: string[] = [];

  for (const line of lines) {
    const next = line.length + 1;
    if (total + next > limit) break;
    selected.push(line);
    total += next;
  }

  return selected.join("\n");
}
