import { jsonSuccess } from "@/lib/api-security";
import { getImportedSubjectOptions } from "@/lib/db-curriculum";
import { subjects as staticSubjects } from "@/lib/edutest-data";

export async function GET() {
  const importedSubjects = await getImportedSubjectOptions();

  return jsonSuccess({
    subjects: importedSubjects.length ? importedSubjects : staticSubjects,
    source: importedSubjects.length ? "database" : "static",
  });
}
