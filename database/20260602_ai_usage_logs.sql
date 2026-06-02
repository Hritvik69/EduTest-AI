CREATE TABLE IF NOT EXISTS ai_usage_logs (
  id BIGSERIAL PRIMARY KEY,
  generation_job_id TEXT,
  paper_id BIGINT,
  task TEXT NOT NULL,
  provider TEXT NOT NULL,
  model TEXT,
  status TEXT NOT NULL,
  error_class TEXT,
  duration_ms INTEGER,
  prompt_chars INTEGER,
  response_chars INTEGER,
  max_output_tokens INTEGER,
  estimated_input_tokens INTEGER,
  estimated_output_tokens INTEGER,
  cache_hit BOOLEAN DEFAULT FALSE,
  cooldown_applied BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_usage_logs_generation_job_id
  ON ai_usage_logs (generation_job_id);

CREATE INDEX IF NOT EXISTS idx_ai_usage_logs_task_provider_created_at
  ON ai_usage_logs (task, provider, created_at DESC);
