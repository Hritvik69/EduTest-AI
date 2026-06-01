ALTER TABLE subjects ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT TRUE;
ALTER TABLE chapters ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT TRUE;
ALTER TABLE chapters ADD COLUMN IF NOT EXISTS book_title VARCHAR(300);
ALTER TABLE chapters ADD COLUMN IF NOT EXISTS source_pdf_path TEXT;
ALTER TABLE chapters ADD COLUMN IF NOT EXISTS page_start INTEGER;
ALTER TABLE chapters ADD COLUMN IF NOT EXISTS page_end INTEGER;
ALTER TABLE chapters ADD COLUMN IF NOT EXISTS import_source VARCHAR(30) DEFAULT 'curriculum';

UPDATE subjects SET active = TRUE WHERE active IS NULL;
UPDATE chapters SET active = TRUE WHERE active IS NULL;
UPDATE chapters SET import_source = 'curriculum' WHERE import_source IS NULL;

CREATE INDEX IF NOT EXISTS idx_subjects_active_class
  ON subjects(active, class_num, name);

CREATE INDEX IF NOT EXISTS idx_chapters_active_import
  ON chapters(active, import_source, subject_id);

CREATE INDEX IF NOT EXISTS idx_chapters_pdf_path
  ON chapters(source_pdf_path)
  WHERE source_pdf_path IS NOT NULL;
