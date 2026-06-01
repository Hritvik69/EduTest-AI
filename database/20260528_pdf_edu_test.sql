CREATE TABLE IF NOT EXISTS uploaded_pdf_sources (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  file_name VARCHAR(300) NOT NULL,
  title VARCHAR(300) NOT NULL,
  subject VARCHAR(100),
  class_num INTEGER,
  word_count INTEGER DEFAULT 0,
  topics_summary JSONB,
  concepts_count INTEGER DEFAULT 0,
  status VARCHAR(20) DEFAULT 'READY',
  error_metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS uploaded_pdf_concepts (
  id SERIAL PRIMARY KEY,
  source_id INTEGER REFERENCES uploaded_pdf_sources(id) ON DELETE CASCADE,
  topic_name VARCHAR(500) NOT NULL,
  importance VARCHAR(10) DEFAULT 'MEDIUM',
  text TEXT NOT NULL,
  type VARCHAR(30),
  bloom_level VARCHAR(20),
  hots_potential BOOLEAN DEFAULT FALSE,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_uploaded_pdf_sources_user
  ON uploaded_pdf_sources(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_uploaded_pdf_concepts_source
  ON uploaded_pdf_concepts(source_id, sort_order);
