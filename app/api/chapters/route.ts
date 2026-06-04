import { NextRequest } from "next/server";
import { jsonSuccess } from "@/lib/api-security";
import { getImportedChapters } from "@/lib/db-curriculum";
import { getDemoChapters } from "@/lib/edutest-data";
import type { ChapterOption, ChapterTopic } from "@/types";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const chapterId = Number(searchParams.get("chapterId"));
  const classNum = Number(searchParams.get("class") ?? 10);
  const subject = searchParams.get("subject") ?? "Science";
  const staticChapters = getDemoChapters(classNum, subject);
  const importedChapters = sanitizeImportedChapters(
    await getImportedChapters(classNum, subject),
    staticChapters,
  );

  if (chapterId) {
    const importedChapter = importedChapters.find((item) => item.id === chapterId);
    if (importedChapter) {
      return jsonSuccess({ topics: importedChapter.topics, source: "database" });
    }

    const staticChapter = staticChapters.find((item) => item.id === chapterId);
    if (staticChapter) {
      return jsonSuccess({ topics: staticChapter.topics, source: "static" });
    }

    return jsonSuccess({ topics: [], source: "static" });
  }

  if (importedChapters.length) {
    return jsonSuccess({ chapters: importedChapters, source: "database" });
  }

  return jsonSuccess({ chapters: staticChapters, source: "static" });
}

function sanitizeImportedChapters(
  chapters: ChapterOption[],
  staticChapters: ChapterOption[],
) {
  const seen = new Map<string, number>();

  return chapters.map((chapter, index) => {
    const cleanName = bestChapterDisplayName(chapter.name, staticChapters, index);
    const seenCount = seen.get(cleanName) ?? 0;
    seen.set(cleanName, seenCount + 1);
    const displayName = seenCount ? `${cleanName} (Part ${seenCount + 1})` : cleanName;

    return {
      ...chapter,
      name: displayName,
      topics: chapter.topics.map((topic) =>
        sanitizeTopicDisplayName(topic, displayName),
      ),
    };
  });
}

function sanitizeTopicDisplayName(topic: ChapterTopic, chapterName: string): ChapterTopic {
  const cleaned = cleanImportedLabel(topic.name);
  const name =
    looksLikeRawSourceChunk(cleaned) || cleaned.length > 90
      ? chapterName
      : clampLabel(cleaned, 78);

  return { ...topic, name };
}

function bestChapterDisplayName(
  rawName: string,
  staticChapters: ChapterOption[],
  index: number,
) {
  const cleaned = cleanImportedLabel(rawName);
  if (!looksLikeRawSourceChunk(cleaned) && cleaned.length <= 82) {
    return cleaned;
  }

  const directMatch = staticChapters.find((chapter) =>
    normalizeLabel(cleaned).includes(normalizeLabel(chapter.name)),
  );
  if (directMatch) return directMatch.name;

  const keywordMatch = staticChapters.find((chapter) =>
    chapterKeywordMatch(cleaned, chapter.name),
  );
  if (keywordMatch) return keywordMatch.name;

  const scored = staticChapters
    .map((chapter) => ({
      chapter,
      score: chapterTokenScore(cleaned, chapter.name),
    }))
    .sort((left, right) => right.score - left.score)[0];

  if (scored && scored.score >= 0.45) return scored.chapter.name;
  return staticChapters[index]?.name ?? clampLabel(cleaned, 82);
}

function cleanImportedLabel(value: string) {
  return value
    .replace(/\u00e2\u0080\u0093|\u00e2\u0080\u0094/g, "-")
    .replace(/\u00e2\u0086\u0092/g, "->")
    .replace(/\u00e2\u0080\u0099/g, "'")
    .replace(/\u00e2\u0080\u009c|\u00e2\u0080\u009d/g, '"')
    .replace(/â|â€“/g, "-")
    .replace(/â/g, "->")
    .replace(/â€™/g, "'")
    .replace(/â€œ|â€/g, '"')
    .replace(/Â/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function looksLikeRawSourceChunk(value: string) {
  const words = value.split(/\s+/).filter(Boolean);
  return (
    words.length > 14 ||
    value.length > 100 ||
    /(Activity\s+\d|Q U E S T I O N|Test tube|Can you now|Answers?\s+\d|Table\s+\d|CHAPTER n)/i.test(
      value,
    )
  );
}

function chapterKeywordMatch(rawName: string, chapterName: string) {
  const raw = normalizeLabel(rawName);
  const chapter = normalizeLabel(chapterName);

  if (chapter.includes("acid") && chapter.includes("base") && chapter.includes("salt")) {
    return /acid|base|salt|\bph\b/i.test(raw);
  }
  if (chapter.includes("metal") && chapter.includes("non metal")) {
    return /metal|non metal|reactivity|ionic/i.test(raw);
  }
  if (chapter.includes("carbon")) {
    return /carbon|covalent|ethanol|ethanoic|soap|detergent/i.test(raw);
  }
  if (chapter.includes("light")) {
    return /light|reflection|refraction|lens|mirror/i.test(raw);
  }
  if (chapter.includes("electricity")) {
    return /electric|current|voltage|resistance|ohm/i.test(raw);
  }

  return false;
}

function chapterTokenScore(rawName: string, chapterName: string) {
  const raw = normalizeLabel(rawName);
  const tokens = normalizeLabel(chapterName)
    .split(" ")
    .filter((token) => token.length >= 4);
  if (!tokens.length) return 0;

  const matched = tokens.filter((token) => raw.includes(token)).length;
  return matched / tokens.length;
}

function normalizeLabel(value: string) {
  return value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function clampLabel(value: string, maxLength: number) {
  if (value.length <= maxLength) return value;
  const slice = value.slice(0, maxLength - 3);
  const boundary = slice.lastIndexOf(" ");
  return `${slice.slice(0, boundary > 32 ? boundary : slice.length).trim()}...`;
}
