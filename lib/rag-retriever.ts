import sql from "@/lib/db";
import { generateEmbedding } from "./embeddings";
import { normalizeNcertTxtConceptType } from "./source-types";
import type { ConceptData } from "@/types";

export async function hybridSearch(
  chapterIds: number[],
  query: string,
  limit = 12,
): Promise<ConceptData[]> {
  if (!sql || !chapterIds.length || !query.trim()) {
    return [];
  }

  try {
    const queryVector = await generateEmbedding(query);
    const vectorString = `[${queryVector.join(",")}]`;

    const rows = await sql`
      WITH vector_search AS (
        SELECT id, row_number() OVER (ORDER BY embedding <=> ${vectorString}::vector) as rank
        FROM concepts
        WHERE chapter_id = ANY(${chapterIds}) AND embedding IS NOT NULL
        LIMIT 50
      ),
      keyword_search AS (
        SELECT id, row_number() OVER (ORDER BY ts_rank_cd(to_tsvector('english', text), plainto_tsquery('english', ${query})) DESC) as rank
        FROM concepts
        WHERE chapter_id = ANY(${chapterIds}) AND to_tsvector('english', text) @@ plainto_tsquery('english', ${query})
        LIMIT 50
      )
      SELECT c.id, c.text, c.type, c.bloom_level, c.hots_potential, c.source, c.chapter_id,
             t.id AS topic_id, t.name AS topic_name, ch.name AS chapter_name,
             COALESCE(1.0 / (60.0 + v.rank), 0.0) + COALESCE(1.0 / (60.0 + k.rank), 0.0) AS rrf_score
      FROM concepts c
      LEFT JOIN topics t ON t.id = c.topic_id
      LEFT JOIN chapters ch ON ch.id = c.chapter_id
      LEFT JOIN vector_search v ON v.id = c.id
      LEFT JOIN keyword_search k ON k.id = c.id
      WHERE v.id IS NOT NULL OR k.id IS NOT NULL
      ORDER BY rrf_score DESC
      LIMIT ${limit}
    `;

    return rows.map((row) => ({
      text: String(row.text),
      type: normalizeNcertTxtConceptType(row.type),
      bloomLevel: row.bloom_level,
      hotsPotential: Boolean(row.hots_potential),
      topicName: row.topic_name ?? "General",
      topicId: row.topic_id ? Number(row.topic_id) : undefined,
      chapterId: Number(row.chapter_id),
      chapterName: row.chapter_name ?? undefined,
      source: row.source ?? "unknown",
    }));
  } catch (err) {
    console.error("Hybrid search failed, falling back to empty retrieval", err);
    return [];
  }
}
