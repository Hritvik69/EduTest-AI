CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE subjects (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  board VARCHAR(20) DEFAULT 'CBSE',
  class_num INTEGER NOT NULL,
  icon VARCHAR(10),
  active BOOLEAN DEFAULT TRUE,
  UNIQUE (name, board, class_num)
);

CREATE TABLE chapters (
  id SERIAL PRIMARY KEY,
  subject_id INTEGER REFERENCES subjects(id),
  name VARCHAR(500) NOT NULL,
  pdf_url TEXT,
  status VARCHAR(30) DEFAULT 'NO_PDF',
  difficulty_score FLOAT DEFAULT 0.5,
  error_metadata JSONB,
  active BOOLEAN DEFAULT TRUE,
  book_title VARCHAR(300),
  source_pdf_path TEXT,
  page_start INTEGER,
  page_end INTEGER,
  import_source VARCHAR(30) DEFAULT 'curriculum',
  UNIQUE (subject_id, name)
);

CREATE TABLE topics (
  id SERIAL PRIMARY KEY,
  chapter_id INTEGER REFERENCES chapters(id),
  name VARCHAR(500) NOT NULL,
  importance VARCHAR(10) DEFAULT 'MEDIUM',
  UNIQUE (chapter_id, name)
);

CREATE TABLE concepts (
  id SERIAL PRIMARY KEY,
  topic_id INTEGER REFERENCES topics(id),
  chapter_id INTEGER REFERENCES chapters(id),
  text TEXT NOT NULL,
  type VARCHAR(30),
  bloom_level VARCHAR(20),
  hots_potential BOOLEAN DEFAULT FALSE,
  source VARCHAR(20) DEFAULT 'unknown',
  embedding vector(768)
);

CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(200) UNIQUE NOT NULL,
  name VARCHAR(200),
  image TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE papers (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  title VARCHAR(300) NOT NULL,
  class_num INTEGER NOT NULL,
  subject VARCHAR(100) NOT NULL,
  subject_selections JSONB,
  chapter_ids INTEGER[],
  total_marks INTEGER NOT NULL,
  duration INTEGER NOT NULL,
  difficulty VARCHAR(10) NOT NULL,
  question_types TEXT[],
  type_distribution JSONB,
  bloom_distribution JSONB,
  blueprint JSONB,
  status VARCHAR(20) DEFAULT 'GENERATING',
  error_metadata JSONB,
  is_demo_mode BOOLEAN DEFAULT FALSE,
  generation_job_id VARCHAR(120),
  idempotency_key VARCHAR(140),
  updated_at TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE questions (
  id SERIAL PRIMARY KEY,
  text TEXT NOT NULL,
  type VARCHAR(30) NOT NULL,
  difficulty VARCHAR(10) NOT NULL,
  marks INTEGER NOT NULL,
  options JSONB,
  correct_answer TEXT NOT NULL,
  explanation TEXT NOT NULL,
  key_points JSONB,
  bloom_level VARCHAR(20),
  competency_level INTEGER DEFAULT 1,
  chapter_id INTEGER REFERENCES chapters(id),
  topic_id INTEGER REFERENCES topics(id),
  subject VARCHAR(100),
  class_num INTEGER,
  scenario TEXT,
  sub_questions JSONB,
  match_pairs JSONB,
  diagram_description TEXT,
  assertion TEXT,
  reason TEXT,
  source VARCHAR(20) DEFAULT 'unknown',
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE paper_questions (
  id SERIAL PRIMARY KEY,
  paper_id INTEGER REFERENCES papers(id),
  question_id INTEGER REFERENCES questions(id),
  section VARCHAR(20),
  order_num INTEGER
);

CREATE TABLE attempts (
  id SERIAL PRIMARY KEY,
  paper_id INTEGER REFERENCES papers(id),
  user_id INTEGER REFERENCES users(id),
  answers JSONB NOT NULL DEFAULT '{}',
  score FLOAT,
  max_score INTEGER,
  percentage FLOAT,
  feedback JSONB,
  time_taken INTEGER,
  completed_at TIMESTAMP,
  status VARCHAR(20) DEFAULT 'IN_PROGRESS',
  created_at TIMESTAMP DEFAULT NOW(),
  error_metadata JSONB,
  is_demo_mode BOOLEAN DEFAULT FALSE
);

CREATE TABLE analytics (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  paper_id INTEGER REFERENCES papers(id),
  attempt_id INTEGER REFERENCES attempts(id),
  weak_topics TEXT[],
  strong_topics TEXT[],
  bloom_scores JSONB,
  competency_score FLOAT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE session_paper_results (
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

CREATE INDEX idx_chapters_subject ON chapters(subject_id);
CREATE INDEX idx_subjects_active_class ON subjects(active, class_num, name);
CREATE INDEX idx_chapters_active_import ON chapters(active, import_source, subject_id);
CREATE INDEX idx_chapters_pdf_path ON chapters(source_pdf_path) WHERE source_pdf_path IS NOT NULL;
CREATE INDEX idx_concepts_chapter ON concepts(chapter_id);
CREATE INDEX idx_questions_chapter ON questions(chapter_id);
CREATE INDEX idx_questions_type ON questions(type);
CREATE INDEX idx_paper_questions_paper ON paper_questions(paper_id);
CREATE INDEX idx_papers_user ON papers(user_id);
CREATE INDEX idx_attempts_paper ON attempts(paper_id);
CREATE UNIQUE INDEX idx_papers_user_idempotency
  ON papers(user_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
CREATE UNIQUE INDEX idx_attempts_progress_unique
  ON attempts(paper_id, user_id)
  WHERE status = 'IN_PROGRESS';
CREATE UNIQUE INDEX idx_paper_questions_unique_order
  ON paper_questions(paper_id, order_num);
CREATE INDEX idx_session_paper_results_user
  ON session_paper_results(user_id, created_at DESC);
CREATE INDEX idx_session_paper_results_session_paper
  ON session_paper_results(session_paper_id);
