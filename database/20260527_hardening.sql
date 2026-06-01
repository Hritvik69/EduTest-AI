ALTER TABLE chapters ADD COLUMN IF NOT EXISTS error_metadata JSONB;
ALTER TABLE chapters ALTER COLUMN name TYPE VARCHAR(500);

ALTER TABLE papers ADD COLUMN IF NOT EXISTS subject_selections JSONB;
ALTER TABLE papers ADD COLUMN IF NOT EXISTS error_metadata JSONB;
ALTER TABLE papers ADD COLUMN IF NOT EXISTS is_demo_mode BOOLEAN DEFAULT FALSE;
ALTER TABLE papers ADD COLUMN IF NOT EXISTS generation_job_id VARCHAR(120);
ALTER TABLE papers ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(140);
ALTER TABLE papers ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();

ALTER TABLE attempts ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'IN_PROGRESS';
ALTER TABLE attempts ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW();
ALTER TABLE attempts ADD COLUMN IF NOT EXISTS error_metadata JSONB;
ALTER TABLE attempts ADD COLUMN IF NOT EXISTS is_demo_mode BOOLEAN DEFAULT FALSE;
ALTER TABLE concepts ADD COLUMN IF NOT EXISTS source VARCHAR(20) DEFAULT 'unknown';
ALTER TABLE questions ADD COLUMN IF NOT EXISTS source VARCHAR(20) DEFAULT 'unknown';
ALTER TABLE topics ALTER COLUMN name TYPE VARCHAR(500);

UPDATE concepts c
SET source = CASE
  WHEN ch.pdf_url IS NOT NULL THEN 'pdf'
  WHEN ch.status = 'CURRICULUM_READY' THEN 'curriculum'
  ELSE 'demo'
END
FROM chapters ch
WHERE c.chapter_id = ch.id
AND (c.source IS NULL OR c.source = 'unknown');

UPDATE questions q
SET source = CASE
  WHEN EXISTS (
    SELECT 1
    FROM paper_questions pq
    JOIN papers p ON p.id = pq.paper_id
    WHERE pq.question_id = q.id
    AND p.is_demo_mode = TRUE
  ) THEN 'demo'
  WHEN EXISTS (
    SELECT 1
    FROM chapters ch
    WHERE ch.id = q.chapter_id
    AND ch.pdf_url IS NOT NULL
  ) THEN 'pdf'
  WHEN EXISTS (
    SELECT 1
    FROM chapters ch
    WHERE ch.id = q.chapter_id
    AND ch.status = 'CURRICULUM_READY'
  ) THEN 'curriculum'
  ELSE 'unknown'
END
WHERE q.source IS NULL OR q.source = 'unknown';

CREATE UNIQUE INDEX IF NOT EXISTS idx_subjects_unique
  ON subjects(name, board, class_num);

CREATE UNIQUE INDEX IF NOT EXISTS idx_chapters_subject_name
  ON chapters(subject_id, name);

CREATE UNIQUE INDEX IF NOT EXISTS idx_topics_chapter_name
  ON topics(chapter_id, name);

CREATE UNIQUE INDEX IF NOT EXISTS idx_papers_user_idempotency
  ON papers(user_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_attempts_progress_unique
  ON attempts(paper_id, user_id)
  WHERE status = 'IN_PROGRESS';

CREATE UNIQUE INDEX IF NOT EXISTS idx_paper_questions_unique_order
  ON paper_questions(paper_id, order_num);

CREATE UNIQUE INDEX IF NOT EXISTS idx_paper_questions_unique_question
  ON paper_questions(paper_id, question_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'papers_status_check'
  ) THEN
    ALTER TABLE papers
      ADD CONSTRAINT papers_status_check
      CHECK (status IN ('GENERATING', 'READY', 'FAILED')) NOT VALID;
  END IF;

  ALTER TABLE papers DROP CONSTRAINT IF EXISTS papers_total_marks_check;
  ALTER TABLE papers
    ADD CONSTRAINT papers_total_marks_check
    CHECK (total_marks >= 5 AND total_marks <= 500) NOT VALID;

  ALTER TABLE chapters DROP CONSTRAINT IF EXISTS chapters_status_check;
  ALTER TABLE chapters
    ADD CONSTRAINT chapters_status_check
    CHECK (status IN ('NO_PDF', 'CURRICULUM_READY', 'PDF_READY', 'PDF_UPLOADED', 'READY', 'EXTRACTED', 'FAILED')) NOT VALID;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'questions_type_check'
  ) THEN
    ALTER TABLE questions
      ADD CONSTRAINT questions_type_check
      CHECK (
        type IN (
          'MCQ', 'ASSERTION_REASON', 'TRUE_FALSE', 'ONE_WORD', 'FILL_BLANK',
          'VERY_SHORT', 'MATCH_FOLLOWING', 'SHORT', 'NUMERICAL',
          'SOURCE_BASED', 'CASE_BASED', 'PARAGRAPH', 'HOTS', 'COMPETENCY',
          'DIAGRAM', 'PRACTICAL', 'LONG', 'NCERT_FORMAT'
        )
      ) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'questions_marks_check'
  ) THEN
    ALTER TABLE questions
      ADD CONSTRAINT questions_marks_check
      CHECK (marks > 0 AND marks <= 20) NOT VALID;
  END IF;

  ALTER TABLE concepts DROP CONSTRAINT IF EXISTS concepts_source_check;
  ALTER TABLE concepts
    ADD CONSTRAINT concepts_source_check
    CHECK (source IN ('pdf', 'curriculum', 'demo', 'unknown')) NOT VALID;

  ALTER TABLE questions DROP CONSTRAINT IF EXISTS questions_source_check;
  ALTER TABLE questions
    ADD CONSTRAINT questions_source_check
    CHECK (source IN ('pdf', 'curriculum', 'demo', 'unknown')) NOT VALID;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'attempts_status_check'
  ) THEN
    ALTER TABLE attempts
      ADD CONSTRAINT attempts_status_check
      CHECK (status IN ('IN_PROGRESS', 'COMPLETED', 'FAILED')) NOT VALID;
  END IF;
END $$;
