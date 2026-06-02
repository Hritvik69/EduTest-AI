import sql from "@/lib/db";
import type { BloomLevel, ConceptData, Difficulty } from "@/types";

type BloomTarget = Partial<Record<BloomLevel, number>>;

export async function retrieveConcepts(
  conceptsOrChapterIds: ConceptData[] | number[],
  difficulty: Difficulty,
  bloomTarget: BloomTarget,
) {
  const concepts: ConceptData[] = isConceptArray(conceptsOrChapterIds)
    ? conceptsOrChapterIds
    : await fetchConceptsByChapterIds(conceptsOrChapterIds);

  const weighted = [...concepts].sort((a, b) => {
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

    return rows.map((row) => ({
      text: row.text,
      type: row.type,
      bloomLevel: row.bloom_level,
      hotsPotential: Boolean(row.hots_potential),
      hotsPoential: Boolean(row.hots_potential),
      topicName: row.topic_name ?? "General",
      topicId: row.topic_id ? Number(row.topic_id) : undefined,
      chapterId: row.chapter_id,
      source:
        row.source === "pdf" || row.source === "curriculum" || row.source === "demo"
          ? row.source
          : "unknown",
    })) satisfies ConceptData[];
  } catch {
    return [];
  }
}

function bloomScore(level: string, target: BloomTarget) {
  return target[level as BloomLevel] ?? 0;
}

function sourceTextScore(concept: ConceptData) {
  if (String(concept.type).toUpperCase() === "PDF_SOURCE_TEXT") return 3;
  if (concept.source === "pdf" && concept.text.length >= 900) return 2;
  if (concept.source === "pdf") return 1;
  return 0;
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
