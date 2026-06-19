-- 20260619_persist_generated_papers.sql
--
-- Generated papers are now persisted to the database (see persistGeneratedPaper
-- in lib/paper-store.ts and the generate-paper route). This migration adds the
-- dashboard listing index used by listPapersForUser, which orders each user's
-- papers by created_at DESC and limits to the most recent 100.
--
-- The existing idx_papers_user(user_id) index already supports the equality
-- scan, but a composite (user_id, created_at DESC) index lets the ordered
-- LIMIT 100 list avoid an extra sort. The index is created IF NOT EXISTS so it
-- is safe to re-run.

CREATE INDEX IF NOT EXISTS idx_papers_user_created_at
  ON papers(user_id, created_at DESC);
