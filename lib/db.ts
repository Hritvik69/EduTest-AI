import { neon } from "@neondatabase/serverless";

const databaseUrl = process.env.DATABASE_URL;
const sql =
  databaseUrl?.startsWith("postgres://") || databaseUrl?.startsWith("postgresql://")
    ? neon(databaseUrl)
    : null;

export default sql;
