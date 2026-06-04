import { jsonSuccess } from "@/lib/api-security";
import { getImportedSubjectOptions } from "@/lib/db-curriculum";
import { subjects as staticSubjects } from "@/lib/edutest-data";
import { subjectIconForName } from "@/lib/curriculum-data";

interface SubjectOption {
  name: string;
  icon: string;
  classes: number[];
}

export async function GET() {
  const importedSubjects = await getImportedSubjectOptions();
  const subjects = mergeSubjectOptions(staticSubjects, importedSubjects);

  return jsonSuccess({
    subjects,
    source: importedSubjects.length ? "database+static" : "static",
  });
}

function mergeSubjectOptions(
  staticOptions: SubjectOption[],
  importedOptions: SubjectOption[],
) {
  const merged = new Map<string, SubjectOption>();

  [...staticOptions, ...importedOptions].forEach((subject) => {
    const previous = merged.get(subject.name);
    const classes = new Set([
      ...(previous?.classes ?? []),
      ...subject.classes,
    ]);

    const visibleClasses = visibleClassesForSubject(
      subject.name,
      Array.from(classes).sort((left, right) => left - right),
    );

    merged.set(subject.name, {
      name: subject.name,
      icon: subjectIconForName(subject.name),
      classes: visibleClasses,
    });
  });

  return Array.from(merged.values()).filter((subject) => subject.classes.length);
}

function visibleClassesForSubject(subject: string, classes: number[]) {
  if (subject === "Social Science") return [];
  if (subject === "Science") {
    return classes.filter((classNum) => ![9, 10, 11, 12].includes(classNum));
  }

  return classes;
}
