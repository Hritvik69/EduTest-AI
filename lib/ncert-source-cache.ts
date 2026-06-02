import type { ConceptData } from "@/types";

type SourceCacheEntry = {
  classNum: number;
  subject: string;
  chapterName: string;
  bookTitle: string;
  concepts: string[];
};

const cachedSources: SourceCacheEntry[] = [
  {
    classNum: 8,
    subject: "English",
    chapterName: "The Wit that Won Hearts",
    bookTitle: "Poorvi",
    concepts: [
      "The chapter is set in the Vijayanagara Empire during the reign of King Krishnadeva Raya, a ruler remembered for wisdom, learning, poetry, and patronage of art and literature.",
      "Krishnadeva Raya's court includes celebrated poets called the Ashtadiggajas, and Tenali Ramakrishna is presented as a quick-witted poet and advisor whose cleverness solves difficult problems.",
      "The conflict begins after Queen Thirumalambal yawns while the king recites a vague poem filled with images such as the sun, moon, stars, and sky. The king mistakes her tired yawn for disrespect and stops speaking to her.",
      "The distressed queen asks Tenali Rama for help. Rama listens carefully and decides that the problem needs a planned strategy rather than a direct argument with the offended king.",
      "In court, during a discussion on improving paddy cultivation, Tenali Rama presents paddy seeds and claims they can give three times the usual yield, drawing skeptical comments from courtiers and a cautious response from the king.",
      "The king objects that such cultivation would need proper soil, manure, and pest protection. Tenali shifts the argument to the person who sows the seeds and asks whether yawning while sowing would scatter seeds unevenly.",
      "Tenali's humorous example makes the court laugh and leads the king to realise that yawning is natural, not a deliberate insult. The king understands that he judged the queen unfairly.",
      "The story resolves when the king apologises to Queen Thirumalambal, admitting that pride blinded him. Tenali's wit wins hearts because it corrects the king without humiliating him.",
      "The chapter develops themes of wit, wisdom, humility, conflict resolution, respectful communication, and the ability to use humour to reveal truth.",
      "Important vocabulary from the chapter includes renowned, illustrious, patron, eminent, insurmountable, trivial, forlorn, distraught, vague, strategy, sarcasm, absurd, unfazed, skeptical, gesture, orchestrated, and brimmed.",
    ],
  },
];

export function getCachedNcertSourceConcepts({
  classNum,
  subject,
  chapterId,
  chapterName,
}: {
  classNum: number;
  subject: string;
  chapterId: number;
  chapterName: string;
}): ConceptData[] {
  const entry = cachedSources.find(
    (item) =>
      item.classNum === classNum &&
      item.subject.toLowerCase() === subject.toLowerCase() &&
      item.chapterName.toLowerCase() === chapterName.toLowerCase(),
  );

  if (!entry) return [];

  return entry.concepts.map((text, index) => ({
    text,
    type: index === 9 ? "VOCABULARY" : "PDF_SOURCE_CONCEPT",
    bloomLevel: index < 3 ? "UNDERSTAND" : "APPLY",
    hotsPotential: index >= 4,
    hotsPoential: index >= 4,
    subject: entry.subject,
    classNum: entry.classNum,
    chapterName: entry.chapterName,
    topicName: sourceTopicName(index),
    topicId: undefined,
    chapterId,
    source: "pdf",
  }));
}

function sourceTopicName(index: number) {
  if (index <= 1) return "Historical and literary context";
  if (index <= 3) return "Conflict and character motivation";
  if (index <= 6) return "Tenali Rama's strategy and wit";
  if (index <= 8) return "Theme, character, tone, and inference";
  return "Vocabulary and grammar in context";
}
