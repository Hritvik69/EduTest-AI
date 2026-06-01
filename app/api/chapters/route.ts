import { NextRequest } from "next/server";
import { jsonSuccess } from "@/lib/api-security";
import {
  getImportedChapters,
  hasImportedCurriculum,
} from "@/lib/db-curriculum";
import { getDemoChapters } from "@/lib/edutest-data";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const chapterId = Number(searchParams.get("chapterId"));
  const classNum = Number(searchParams.get("class") ?? 10);
  const subject = searchParams.get("subject") ?? "Science";
  const importedChapters = await getImportedChapters(classNum, subject);

  if (chapterId) {
    const importedChapter = importedChapters.find((item) => item.id === chapterId);
    if (importedChapter) {
      return jsonSuccess({ topics: importedChapter.topics, source: "database" });
    }

    if (await hasImportedCurriculum()) {
      return jsonSuccess({ topics: [], source: "database" });
    }

    const staticChapter = getDemoChapters(classNum, subject).find(
      (item) => item.id === chapterId,
    );
    if (staticChapter) {
      return jsonSuccess({ topics: staticChapter.topics, source: "static" });
    }

    return jsonSuccess({ topics: [], source: "static" });
  }

  if (importedChapters.length) {
    return jsonSuccess({ chapters: importedChapters, source: "database" });
  }

  if (await hasImportedCurriculum()) {
    return jsonSuccess({ chapters: [], source: "database" });
  }

  const staticChapters = getDemoChapters(classNum, subject);
  return jsonSuccess({ chapters: staticChapters, source: "static" });
}
