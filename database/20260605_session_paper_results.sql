CREATE TABLE IF NOT EXISTS session_paper_results (
  id TEXT PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  session_paper_id TEXT NOT NULL,
  paper_title TEXT NOT NULL,
  subject VARCHAR(100),
  class_num INTEGER,
  score FLOAT,
  max_score INTEGER,
  percentage FLOAT,
  time_taken INTEGER,
  result_json JSONB NOT NULL DEFAULT '{}',
  weak_topics TEXT[],
  strong_topics TEXT[],
  bloom_scores JSONB,
  competency_score FLOAT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_session_paper_results_user
  ON session_paper_results(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_session_paper_results_session_paper
  ON session_paper_results(session_paper_id);
