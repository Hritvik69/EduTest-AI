-- 2026 RAG Indexes
-- Production-grade RAG (Retrieval-Augmented Generation) acceleration for EduTest-AI.
-- Adds HNSW index on concepts.embedding (pgvector cosine) and GIN FTS index on
-- the concepts text column. Both are used by lib/rag-retriever.ts (hybridSearch).

-- 1) HNSW index for fast approximate-nearest-neighbor vector search.
--    Uses cosine distance (<=>) because embeddings come from Gemini
--    text-embedding-004 and the retriever compares with `<=>`.
CREATE INDEX IF NOT EXISTS idx_concepts_embedding_hnsw
  ON concepts
  USING hnsw (embedding vector_cosine_ops);

-- 2) GIN index over to_tsvector('english', text) for full-text keyword search.
--    Used by the keyword_search CTE in lib/rag-retriever.ts which calls
--    plainto_tsquery / ts_rank_cd for exact textbook term matching
--    (e.g. "Ohm's Law", "Faraday", "Newton's third law").
CREATE INDEX IF NOT EXISTS idx_concepts_fts
  ON concepts
  USING gin (to_tsvector('english', text));

-- Optional: help the chapter_id filter used in the WHERE clause.
-- (B-tree; cheap to keep alongside the HNSW + GIN pair.)
CREATE INDEX IF NOT EXISTS idx_concepts_chapter_id
  ON concepts (chapter_id);
