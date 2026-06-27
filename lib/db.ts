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

          let lastError: Error | null = null;

          const txTag = async (strings: TemplateStringsArray, ...values: any[]) => {
            // If any previous query failed, propagate that error immediately
            if (lastError) {
              throw lastError;
            }

            let queryText = "";
            for (let i = 0; i < strings.length; i++) {
              queryText += strings[i];
              if (i < values.length) {
                queryText += `$${i + 1}`;
              }
            }

            try {
              const result = await client.query(queryText, values);
              return result.rows;
            } catch (err) {
              // Store the error to propagate to subsequent queries
              lastError = err instanceof Error ? err : new Error(String(err));
              throw lastError;
            }
          };

          const resultOrPromise = callback(txTag);

          // If callback returns a promise (async), await it first so that all
          // synchronous queries inside the promise have a chance to run and set
          // lastError before we check it.  This is critical: if any query throws
          // inside the async callback, the throw propagates up and the outer
          // catch will roll back — but we must NOT commit if lastError is set.
          let queries: unknown;
          if (resultOrPromise instanceof Promise) {
            queries = await resultOrPromise;
          } else {
            queries = resultOrPromise;
          }

          // If any previous query failed, propagate the error before COMMIT.
          // This guards the synchronous-path case where queries queue up without
          // throwing and then lastError gets set; we must abort the commit.
          if (lastError) {
            throw lastError;
          }

          // Collect results - all queries should have succeeded at this point.
          // Note: lastError is also checked again after collection to guard
          // against any async query that resolved but stored an error.
          const results: unknown[] = [];
          if (Array.isArray(queries)) {
            for (const queryResult of queries) {
              if (queryResult instanceof Promise) {
                results.push(await queryResult);
              } else {
                results.push(queryResult);
              }
            }
          } else if (queries !== undefined && queries !== null) {
            results.push(queries);
          }

          // Verify no error occurred during result collection.
          // This handles the edge case where an awaited promise resolved
          // (not threw) but stored lastError internally.
          if (lastError) {
            throw lastError;
          }

          await client.query("COMMIT");
          return results;
        } catch (err) {
          // Ensure ROLLBACK is called on ANY error
          try {
            await client.query("ROLLBACK");
          } catch (rollbackErr) {
            // If ROLLBACK itself fails, log it but still throw original error
            console.error("[db.transaction] ROLLBACK failed:", rollbackErr);
          }
          throw err;
        } finally {
          client.release();
        }
      },
    })
  : null;

export default sql;

