import type {
  BloomLevel,
  Difficulty,
  QuestionType,
} from "@/types";
import {
  getCurriculumChapters,
  getCurriculumSubjects,
} from "@/lib/curriculum-data";

export const classes = [6, 7, 8, 9, 10, 11, 12];

export const subjects = getCurriculumSubjects();

export const defaultBloomDistribution: Record<BloomLevel, number> = {
  REMEMBER: 15,
  UNDERSTAND: 20,
  APPLY: 30,
  ANALYZE: 20,
  EVALUATE: 10,
  CREATE: 5,
};

export const bloomLabels: Record<BloomLevel, string> = {
  REMEMBER: "Remember",
  UNDERSTAND: "Understand",
  APPLY: "Apply",
  ANALYZE: "Analyze",
  EVALUATE: "Evaluate",
  CREATE: "Create",
};

export const difficultyLabels: Record<Difficulty, string> = {
  EASY: "Easy",
  MEDIUM: "Medium",
  HARD: "Hard",
  ABSURD: "Absurd",
};

export const questionTypeMeta: {
  type: QuestionType;
  label: string;
  marks: number | "Mixed";
  section: "A" | "B" | "C" | "D" | "E" | "All";
  description: string;
}[] = [
  {
    type: "MCQ",
    label: "MCQ",
    marks: 1,
    section: "A",
    description: "4 options with one correct answer.",
  },
  {
    type: "ASSERTION_REASON",
    label: "Assertion-Reason",
    marks: 1,
    section: "A",
    description: "CBSE assertion and reason logic.",
  },
  {
    type: "TRUE_FALSE",
    label: "True/False",
    marks: 1,
    section: "A",
    description: "Direct statement judgement.",
  },
  {
    type: "ONE_WORD",
    label: "One Word",
    marks: 1,
    section: "B",
    description: "Single keyword or term answer.",
  },
  {
    type: "FILL_BLANK",
    label: "Fill in Blanks",
    marks: 1,
    section: "B",
    description: "Complete a precise concept sentence.",
  },
  {
    type: "VERY_SHORT",
    label: "Very Short Ans",
    marks: 2,
    section: "B",
    description: "One or two sentence answer.",
  },
  {
    type: "MATCH_FOLLOWING",
    label: "Match the Column",
    marks: 3,
    section: "C",
    description: "Column A and B matching.",
  },
  {
    type: "SHORT",
    label: "Short Answer",
    marks: 3,
    section: "C",
    description: "Three to five line explanation.",
  },
  {
    type: "NUMERICAL",
    label: "Numerical",
    marks: 3,
    section: "C",
    description: "Maths or Science calculation.",
  },
  {
    type: "SOURCE_BASED",
    label: "Source-Based",
    marks: 4,
    section: "D",
    description: "Read source passage and answer.",
  },
  {
    type: "CASE_BASED",
    label: "Case-Based",
    marks: 4,
    section: "D",
    description: "Real scenario with sub-questions.",
  },
  {
    type: "PARAGRAPH",
    label: "Paragraph",
    marks: 4,
    section: "D",
    description: "Comprehension-based question.",
  },
  {
    type: "HOTS",
    label: "HOTS",
    marks: 4,
    section: "D",
    description: "Higher order thinking challenge.",
  },
  {
    type: "COMPETENCY",
    label: "Competency-Based",
    marks: 4,
    section: "D",
    description: "Real-life concept application.",
  },
  {
    type: "DIAGRAM",
    label: "Diagram-Based",
    marks: 5,
    section: "E",
    description: "Label, infer, or explain a diagram.",
  },
  {
    type: "PRACTICAL",
    label: "Practical",
    marks: 5,
    section: "E",
    description: "Experiment or observation question.",
  },
  {
    type: "LONG",
    label: "Long Answer",
    marks: 5,
    section: "E",
    description: "Detailed structured explanation.",
  },
  {
    type: "NCERT_FORMAT",
    label: "NCERT Books/PDF",
    marks: "Mixed",
    section: "All",
    description: "Bookish NCERT/PDF exercise-style questions.",
  },
];

export const selectableQuestionTypeMeta = [
  ...questionTypeMeta.filter(
    (item) =>
      item.type !== "DIAGRAM" &&
      item.type !== "MATCH_FOLLOWING" &&
      item.type !== "NCERT_FORMAT",
  ),
  questionTypeMeta.find((item) => item.type === "MATCH_FOLLOWING")!,
];

export const questionTypeDetails: Record<
  QuestionType,
  {
    goal: string;
    expectedFields: string[];
    answerFormat: string;
    sample: string;
  }
> = {
  MCQ: {
    goal: "Application-focused objective item with four plausible options.",
    expectedFields: ["text", "options A-D", "correctAnswer", "explanation", "topic"],
    answerFormat: "One option isCorrect=true and correctAnswer is A, B, C, or D.",
    sample: "Which observation best explains why an iron nail rusts faster in moist air?",
  },
  ASSERTION_REASON: {
    goal: "CBSE assertion-reason logic with one exact option from A-D.",
    expectedFields: ["text", "assertion", "reason", "correctAnswer", "explanation", "topic"],
    answerFormat: "A-D based on whether assertion/reason are true and linked.",
    sample: "Assertion (A): Acids turn blue litmus red. Reason (R): Acids release H+ ions.",
  },
  TRUE_FALSE: {
    goal: "Direct concept judgement with a clear explanation.",
    expectedFields: ["text", "correctAnswer", "explanation", "topic"],
    answerFormat: "True or False.",
    sample: "A convex lens always forms a virtual image.",
  },
  ONE_WORD: {
    goal: "Single-term recall or recognition from the selected topic.",
    expectedFields: ["text", "correctAnswer", "explanation", "topic"],
    answerFormat: "One word or short term.",
    sample: "What is the process of conversion of water vapour into liquid called?",
  },
  FILL_BLANK: {
    goal: "Precise completion of a concept sentence.",
    expectedFields: ["text", "correctAnswer", "explanation", "topic"],
    answerFormat: "Missing word or phrase.",
    sample: "The SI unit of electric current is ________.",
  },
  VERY_SHORT: {
    goal: "One or two sentence CBSE-style response.",
    expectedFields: ["text", "correctAnswer", "keyPoints", "marks", "topic"],
    answerFormat: "Brief model answer with key terms.",
    sample: "State one reason why respiration is essential for living organisms.",
  },
  MATCH_FOLLOWING: {
    goal: "Four matched pairs from connected subtopics.",
    expectedFields: ["text", "matchPairs", "correctAnswer", "explanation", "marks", "topic"],
    answerFormat: "Pair mapping such as A1-B3, A2-B1.",
    sample: "Match the substance with its common chemical property.",
  },
  SHORT: {
    goal: "Three to five line explanation using NCERT vocabulary.",
    expectedFields: ["text", "correctAnswer", "keyPoints", "bloomLevel", "marks", "topic"],
    answerFormat: "Full model answer plus 3-4 scoring points.",
    sample: "Explain how transportation of water occurs in plants.",
  },
  NUMERICAL: {
    goal: "Solvable Maths or Science problem with all values given.",
    expectedFields: ["text", "correctAnswer", "keyPoints", "marks", "topic"],
    answerFormat: "Formula, substitution, final answer with unit.",
    sample: "Calculate resistance when 12 V produces a current of 2 A.",
  },
  SOURCE_BASED: {
    goal: "Fresh passage with four sub-questions derived from selected concepts.",
    expectedFields: ["scenario", "text", "subQuestions", "marks", "topic"],
    answerFormat: "Four answered sub-questions, usually 1 mark each.",
    sample: "Read a short passage about a lab observation and answer four questions.",
  },
  CASE_BASED: {
    goal: "Real-world scenario with two linked sub-questions.",
    expectedFields: ["scenario", "text", "subQuestions", "marks", "topic"],
    answerFormat: "One MCQ-style sub-question and one short-answer sub-question.",
    sample: "A student tests household solutions with indicators and explains the result.",
  },
  PARAGRAPH: {
    goal: "Comprehension-style paragraph grounded in the chapter.",
    expectedFields: ["scenario", "text", "correctAnswer", "marks", "topic"],
    answerFormat: "Detailed answer based only on the paragraph and concept.",
    sample: "Based on the paragraph, explain the effect of changing one condition.",
  },
  HOTS: {
    goal: "Higher-order prediction, comparison, or unfamiliar application.",
    expectedFields: ["text", "correctAnswer", "keyPoints", "bloomLevel", "marks", "topic"],
    answerFormat: "Reasoned model answer, usually Evaluate level.",
    sample: "Predict what would happen if one part of the system stopped working.",
  },
  COMPETENCY: {
    goal: "Real-life decision-making using the selected concept.",
    expectedFields: ["text", "correctAnswer", "keyPoints", "competencyLevel", "bloomLevel", "marks", "topic"],
    answerFormat: "Action plus reason plus concept link.",
    sample: "Choose the safer method in a daily-life situation and justify it.",
  },
  DIAGRAM: {
    goal: "Label, infer, or explain a diagram or schematic.",
    expectedFields: ["text", "diagramDescription", "correctAnswer", "keyPoints", "marks", "topic"],
    answerFormat: "Required labels or explanation.",
    sample: "Draw and label a diagram of the human respiratory system.",
  },
  PRACTICAL: {
    goal: "Experiment, activity, observation, inference, or precaution.",
    expectedFields: ["text", "correctAnswer", "keyPoints", "marks", "topic"],
    answerFormat: "Observation, inference, precaution, and result where relevant.",
    sample: "Design an activity to show that carbon dioxide is released during respiration.",
  },
  LONG: {
    goal: "Structured 5-mark answer with intro, points, example, and conclusion.",
    expectedFields: ["text", "correctAnswer", "keyPoints", "bloomLevel", "marks", "topic"],
    answerFormat: "Complete model answer with scoring structure.",
    sample: "Explain the process with definition, steps, example, and conclusion.",
  },
  NCERT_FORMAT: {
    goal: "Bookish NCERT exercise-style item from the selected chapter, topic, or uploaded PDF context.",
    expectedFields: ["text", "correctAnswer", "marks", "topic"],
    answerFormat: "Definition, explanation, example, differentiate, or exercise response.",
    sample: "Give reasons for the following observation as an NCERT exercise question.",
  },
};

export const presetQuestionTypes: Record<string, QuestionType[]> = {
  "Only MCQ": ["MCQ"],
  "CBSE Standard": ["MCQ", "CASE_BASED", "SHORT", "LONG", "HOTS"],
  "Objective Mix": ["MCQ", "ASSERTION_REASON", "TRUE_FALSE"],
  Subjective: ["VERY_SHORT", "SHORT", "LONG", "HOTS"],
  "Full Mix": selectableQuestionTypeMeta.map((item) => item.type),
};

export const sectionDotColors: Record<string, string> = {
  A: "bg-blue-400",
  B: "bg-emerald-400",
  C: "bg-amber-400",
  D: "bg-violet-400",
  E: "bg-rose-400",
  All: "bg-slate-300",
};

export function getDemoChapters(classNum: number, subject: string) {
  return getCurriculumChapters(classNum, subject);
}
