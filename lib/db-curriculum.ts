import sql from "@/lib/db";
import { subjectIconForName } from "@/lib/curriculum-data";
import type { ChapterOption, ChapterTopic } from "@/types";

export interface SubjectOption {
  name: string;
  icon: string;
  classes: number[];
}

export async function getImportedSubjectOptions(): Promise<SubjectOption[]> {
  if (!sql) return [];

  try {
    const rows = await sql`
      SELECT s.name, array_agg(DISTINCT s.class_num ORDER BY s.class_num) AS classes
      FROM subjects s
      WHERE s.active = TRUE
      AND EXISTS (
        SELECT 1
        FROM chapters c
        WHERE c.subject_id = s.id
        AND c.active = TRUE
        AND c.import_source = 'ncert_books'
        AND c.name NOT ILIKE '%Full Book Source%'
      )
      GROUP BY s.name
      ORDER BY MIN(s.class_num), s.name
    `;

    return rows.map((row) => ({
      name: String(row.name),
      icon: subjectIconForName(String(row.name)),
      classes: normalizeClasses(row.classes),
    }));
  } catch {
    return [];
  }
}

export async function hasImportedCurriculum() {
  if (!sql) return false;

  try {
    const rows = await sql`
      SELECT COUNT(*)::int AS count
      FROM chapters
      WHERE active = TRUE
      AND import_source = 'ncert_books'
      AND name NOT ILIKE '%Full Book Source%'
    `;
    return Number(rows[0]?.count ?? 0) > 0;
  } catch {
    return false;
  }
}

export async function getImportedChapters(
  classNum: number,
  subject: string,
): Promise<ChapterOption[]> {
  if (!sql) return [];

  try {
    const chapterRows = await sql`
      SELECT c.id, c.name, c.status, c.difficulty_score
      FROM chapters c
      JOIN subjects s ON s.id = c.subject_id
      WHERE s.class_num = ${classNum}
      AND s.name = ${subject}
      AND s.active = TRUE
      AND c.active = TRUE
      AND c.import_source = 'ncert_books'
      AND c.name NOT ILIKE '%Full Book Source%'
      ORDER BY COALESCE(c.source_pdf_path, ''), COALESCE(c.page_start, 0), c.id
    `;

    if (!chapterRows.length) return [];

    const chapterIds = chapterRows.map((row) => Number(row.id));
    const topicRows = await sql`
      SELECT id, chapter_id, name, importance
      FROM topics
      WHERE chapter_id = ANY(${chapterIds})
      ORDER BY id ASC
    `;
    const topicsByChapter = new Map<number, ChapterTopic[]>();
    topicRows.forEach((row) => {
      const chapterId = Number(row.chapter_id);
      const topics = topicsByChapter.get(chapterId) ?? [];
      topics.push({
        id: Number(row.id),
        name: String(row.name),
        importance: normalizeImportance(row.importance),
      });
      topicsByChapter.set(chapterId, topics);
    });

    return chapterRows.map((row, index) => ({
      id: Number(row.id),
      name: String(row.name),
      status: normalizeChapterStatus(row.status),
      difficultyScore: Number(row.difficulty_score ?? 0.42 + (index % 4) * 0.08),
      topics: topicsByChapter.get(Number(row.id)) ?? [],
      topicsCount: topicsByChapter.get(Number(row.id))?.length ?? 0,
    }));
  } catch {
    return [];
  }
}

function normalizeClasses(value: unknown) {
  if (Array.isArray(value)) {
    return value
      .map(Number)
      .filter((item) => Number.isInteger(item))
      .sort((left, right) => left - right);
  }

  return [];
}

function normalizeImportance(value: unknown): ChapterTopic["importance"] {
  return value === "LOW" || value === "HIGH" || value === "MEDIUM"
    ? value
    : "MEDIUM";
}

function normalizeChapterStatus(value: unknown): ChapterOption["status"] {
  return value === "NO_PDF" ||
    value === "CURRICULUM_READY" ||
    value === "PDF_READY" ||
    value === "PDF_UPLOADED" ||
    value === "READY" ||
    value === "EXTRACTED"
    ? value
    : "READY";
}
