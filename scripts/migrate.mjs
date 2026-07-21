import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

const envLocalPath = path.join(rootDir, ".env.local");
if (fs.existsSync(envLocalPath)) {
  const content = fs.readFileSync(envLocalPath, "utf8");
  content.split("\n").forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;
    const parts = trimmed.split("=");
    if (parts.length >= 2) {
      const key = parts[0].trim();
      const val = parts.slice(1).join("=").trim();
      if (!process.env[key]) process.env[key] = val;
    }
  });
}

if (!process.env.DATABASE_URL) {
  console.error("Error: DATABASE_URL environment variable is missing.");
  process.exit(1);
}

const { Pool } = await import("@neondatabase/serverless");
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function runSqlFile(client, filePath) {
  console.log(`Executing SQL file: ${path.basename(filePath)}`);
  const content = fs.readFileSync(filePath, "utf8");
  try {
    await client.query(content);
    console.log(`✓ Successfully executed ${path.basename(filePath)}`);
  } catch (err) {
    console.error(`✗ Error executing ${path.basename(filePath)}:`, err.message);
  }
}

async function main() {
  const client = await pool.connect();
  try {
    const dbDir = path.join(rootDir, "database");

    const schemaSql = `
      CREATE EXTENSION IF NOT EXISTS vector;

      CREATE TABLE IF NOT EXISTS subjects (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        board VARCHAR(20) DEFAULT 'CBSE',
        class_num INTEGER NOT NULL,
        icon VARCHAR(10),
        active BOOLEAN DEFAULT TRUE,
        UNIQUE (name, board, class_num)
      );

      CREATE TABLE IF NOT EXISTS chapters (
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

      CREATE TABLE IF NOT EXISTS topics (
        id SERIAL PRIMARY KEY,
        chapter_id INTEGER REFERENCES chapters(id),
        name VARCHAR(500) NOT NULL,
        importance VARCHAR(10) DEFAULT 'MEDIUM',
        UNIQUE (chapter_id, name)
      );

      CREATE TABLE IF NOT EXISTS concepts (
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

      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(200) UNIQUE NOT NULL,
        name VARCHAR(200),
        image TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS papers (
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

      CREATE TABLE IF NOT EXISTS questions (
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

      CREATE TABLE IF NOT EXISTS paper_questions (
        id SERIAL PRIMARY KEY,
        paper_id INTEGER REFERENCES papers(id),
        question_id INTEGER REFERENCES questions(id),
        section VARCHAR(20),
        order_num INTEGER
      );

      CREATE TABLE IF NOT EXISTS attempts (
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

      CREATE TABLE IF NOT EXISTS analytics (
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
    `;

    console.log("Applying base schema...");
    await client.query(schemaSql);

    const migrations = [
      "20260527_hardening.sql",
      "20260528_dynamic_paper_marks.sql",
      "20260528_pdf_edu_test.sql",
      "20260531_ncert_books_import.sql",
      "20260602_ai_usage_logs.sql",
      "20260605_session_paper_results.sql",
      "20260619_persist_generated_papers.sql",
      "2026_RAG_indexes.sql",
    ];

    for (const m of migrations) {
      await runSqlFile(client, path.join(dbDir, m));
    }

    const res = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);
    console.log("\nDatabase migration finished!");
    console.log("Tables in database:", res.rows.map((t) => t.table_name));
  } finally {
    client.release();
    await pool.end();
  }
}

main();
