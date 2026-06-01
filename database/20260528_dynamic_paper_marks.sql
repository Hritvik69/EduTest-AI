ALTER TABLE papers DROP CONSTRAINT IF EXISTS papers_total_marks_check;

ALTER TABLE papers
  ADD CONSTRAINT papers_total_marks_check
  CHECK (total_marks >= 5 AND total_marks <= 500) NOT VALID;
