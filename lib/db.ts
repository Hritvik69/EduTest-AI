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
      transaction: async (callback: (tx: any) => any) => {
        const p = getPool();
        if (!p) throw new Error("Database not configured");
        const client = await p.connect();
        try {
          await client.query("BEGIN");
          
          let queryQueue = Promise.resolve();
          const txTag = async (strings: TemplateStringsArray, ...values: any[]) => {
            let queryText = "";
            for (let i = 0; i < strings.length; i++) {
              queryText += strings[i];
              if (i < values.length) {
                queryText += `$${i + 1}`;
              }
            }
            const resultPromise = queryQueue.then(() => client.query(queryText, values));
            queryQueue = resultPromise.then(() => {}, () => {}); // Catch and continue queue chain
            const res = await resultPromise;
            return res.rows;
          };

          const resultOrPromise = callback(txTag);
          const queries =
            resultOrPromise instanceof Promise ? await resultOrPromise : resultOrPromise;

          const results = [];
          if (Array.isArray(queries)) {
            for (const queryPromise of queries) {
              results.push(await queryPromise);
            }
          } else {
            await queryQueue;
            results.push(queries);
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

