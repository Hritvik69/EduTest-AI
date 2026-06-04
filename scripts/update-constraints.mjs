import { neon } from "@neondatabase/serverless";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match || process.env[match[1]]) continue;
    let value = match[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[match[1]] = value;
  }
}

loadEnvFile(path.join(projectRoot, ".env.local"));

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not set.");
  }
  const sql = neon(databaseUrl);
  
  console.log("Altering concepts table constraints...");
  await sql`
    ALTER TABLE concepts DROP CONSTRAINT IF EXISTS concepts_source_check
  `;
  await sql`
    ALTER TABLE concepts
      ADD CONSTRAINT concepts_source_check
      CHECK (source IN ('pdf', 'curriculum', 'demo', 'unknown', 'ncert_txt')) NOT VALID
  `;
  
  console.log("Altering questions table constraints...");
  await sql`
    ALTER TABLE questions DROP CONSTRAINT IF EXISTS questions_source_check
  `;
  await sql`
    ALTER TABLE questions
      ADD CONSTRAINT questions_source_check
      CHECK (source IN ('pdf', 'curriculum', 'demo', 'unknown', 'ncert_txt')) NOT VALID
  `;
  
  console.log("Constraints updated successfully!");
}

main().catch(console.error);
