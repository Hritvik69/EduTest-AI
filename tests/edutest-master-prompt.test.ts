import { describe, test, expect } from 'vitest';
import { buildPrompt, QualityValidator, type QuestionGenParams, type ParsedQuestion } from '../lib/ai/edutest-master-prompt';

describe('EduTest Master Prompt System', () => {
  const mockParams: QuestionGenParams = {
    classLevel: '9',
    subject: 'biology',
    chapter: 'The Fundamental Unit of Life',
    topic: 'Cell Wall',
    questionType: 'MCQ',
    difficulty: 'Medium',
    bloomLevel: 'Understanding',
    count: 1,
    marks: 1,
    sourceText: 'The cell wall is a rigid outer boundary present in plant cells.',
    mode: 'fresh'
  };

  test('buildPrompt correctly constructs prompts with subject modules', () => {
    const prompt = buildPrompt(mockParams);
    expect(prompt).toContain('EduTest-AI');
    expect(prompt).toContain('RULE 1 — NO VERBATIM COPYING');
    // Verify subject-specific content is injected
    expect(prompt).toContain('SUBJECT: BIOLOGY');
    expect(prompt).toContain('Plant-animal cell confusion');
  });

  test('QualityValidator flags blacklisted distractors', () => {
    const questions: ParsedQuestion[] = [
      {
        id: 1,
        question: 'What is the primary function of the cell wall?',
        options: [
          'It provides structural support.',
          'The structure and its function are unrelated.', // blacklisted
          'It acts as a site of energy production.',
          'It synthesizes protein molecules.'
        ],
        correct_answer: 'A',
        explanation: 'The cell wall provides rigidity and support. Other options are incorrect.',
        bloom_level: 'Understanding',
        subtopic: 'Cell Wall',
        difficulty: 'Medium',
        marks: 1
      }
    ];

    const validationResult = QualityValidator.validateBatch(questions, mockParams.sourceText);
    expect(validationResult.allValid).toBe(false);
    expect(validationResult.summary.critical).toBeGreaterThan(0);
    expect(validationResult.results[0].validation.issues[0]).toContain('BLACKLISTED distractor');
  });

  test('QualityValidator flags lazy stems', () => {
    const questions: ParsedQuestion[] = [
      {
        id: 1,
        question: 'What can be inferred from the detail about the cell wall?', // lazy stem
        options: [
          'It provides mechanical strength.',
          'It participates in cell division.',
          'It is completely permeable.',
          'It is chemically inactive.'
        ],
        correct_answer: 'A',
        explanation: 'It provides strength.',
        bloom_level: 'Understanding',
        subtopic: 'Cell Wall',
        difficulty: 'Medium',
        marks: 1
      }
    ];

    const validationResult = QualityValidator.validateBatch(questions, mockParams.sourceText);
    expect(validationResult.allValid).toBe(false);
    expect(validationResult.summary.critical).toBe(1);
    expect(validationResult.results[0].validation.issues[0]).toContain('Lazy/broken stem pattern');
  });

  test('QualityValidator accepts valid questions', () => {
    const questions: ParsedQuestion[] = [
      {
        id: 1,
        question: 'Which component is responsible for providing rigidity to plant cells?',
        options: [
          'Rigid outer envelope',
          'Internal plasma membrane',
          'Nuclear membrane layer',
          'Ribosomal subunits'
        ],
        correct_answer: 'A',
        explanation: 'The rigid outer envelope (cell wall) provides mechanical strength.',
        bloom_level: 'Understanding',
        subtopic: 'Cell Wall',
        difficulty: 'Medium',
        marks: 1
      }
    ];

    const validationResult = QualityValidator.validateBatch(questions, mockParams.sourceText);
    expect(validationResult.allValid).toBe(true);
    expect(validationResult.summary.critical).toBe(0);
  });
});
