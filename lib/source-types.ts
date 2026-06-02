import type { ConceptData } from "@/types";

export const NCERT_TXT_SOURCE_TYPE = "NCERT_TXT_SOURCE";
export const PDF_SOURCE_TEXT_TYPE = "PDF_SOURCE_TEXT";

export function isNcertTxtSourceConcept(concept: ConceptData) {
  return String(concept.type).toUpperCase() === NCERT_TXT_SOURCE_TYPE;
}

export function isPdfSourceTextConcept(concept: ConceptData) {
  return String(concept.type).toUpperCase() === PDF_SOURCE_TEXT_TYPE;
}

export function isSourceTextConcept(concept: ConceptData) {
  return isNcertTxtSourceConcept(concept) || isPdfSourceTextConcept(concept);
}

export function isNormalNcertTxtConcept(concept: ConceptData) {
  return concept.source === "ncert_txt" || isNcertTxtSourceConcept(concept);
}

export function normalizeNcertTxtConceptType(type: unknown) {
  return String(type).toUpperCase() === PDF_SOURCE_TEXT_TYPE
    ? NCERT_TXT_SOURCE_TYPE
    : String(type ?? "FACT");
}
