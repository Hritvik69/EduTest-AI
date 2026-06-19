import { neon, Pool } from "@neondatabase/serverless";

const databaseUrl = process.env.DATABASE_URL;
const sqlFunc =
  databaseUrl?.startsWith("postgres://") || databaseUrl?.startsWith("postgresql://")
    ? neon(databaseUrl)
    : null;

let pool: Pool | null = null;
function getPool() {
  if (!pool && databaseUrl) {
    pool = new Pool({ connectionString: databaseUrl });
  }
  return pool;
}

const sql = sqlFunc
  ? Object.assign(sqlFunc, {
      transaction: async (callback: (tx: any) => any[]) => {
        const p = getPool();
        if (!p) throw new Error("Database not configured");
        const client = await p.connect();
        try {
          await client.query("BEGIN");
          
          const txTag = async (strings: TemplateStringsArray, ...values: any[]) => {
            let queryText = "";
            for (let i = 0; i < strings.length; i++) {
              queryText += strings[i];
              if (i < values.length) {
                queryText += `$${i + 1}`;
              }
            }
            const res = await client.query(queryText, values);
            return res.rows;
          };

          const queries = callback(txTag);
          const results = [];
          for (const queryPromise of queries) {
            results.push(await queryPromise);
          }

          await client.query("COMMIT");
          return results;
        } catch (err) {
          await client.query("ROLLBACK");
          throw err;
        } finally {
          client.release();
        }
      },
    })
  : null;

export default sql;

