import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";
import { withStrictTls } from "./url";

type Db = ReturnType<typeof drizzle<typeof schema>>;

// Cached on globalThis so Next's dev hot-reload doesn't open a new pool on every
// edit, and so warm serverless invocations reuse the same one.
const cache = globalThis as unknown as { __opsPool?: Pool; __opsDb?: Db };

/**
 * Lazy on purpose: resolving the connection string at import time would crash
 * every page (including /login) before the env file is filled in.
 */
export function getDb(): Db {
  if (cache.__opsDb) return cache.__opsDb;

  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Copy submissions/.env.local.example to " +
        "submissions/.env.local and fill in your Neon connection string.",
    );
  }

  if (!url.includes("-pooler.")) {
    console.warn(
      "[db] DATABASE_URL is not a pooled Neon URL (no '-pooler' in the host). " +
        "Application traffic should use the pooled endpoint.",
    );
  }

  // node-postgres rather than the HTTP serverless driver: this app runs its
  // queries from long-lived Node server components on Vercel Fluid compute,
  // where a reused TCP pool beats per-query HTTP round trips.
  const pool =
    cache.__opsPool ??
    new Pool({
      connectionString: withStrictTls(url),
      // PgBouncer already fronts Neon, so the app only needs a small local pool.
      max: 5,
      idleTimeoutMillis: 20_000,
      // Fail fast instead of hanging a page render if the compute is cold.
      connectionTimeoutMillis: 10_000,
    });

  // On Vercel, hand the pool to the runtime so it is drained when an instance is
  // frozen rather than leaking connections. No-op anywhere else.
  if (process.env.VERCEL) {
    void import("@vercel/functions")
      .then(({ attachDatabasePool }) => attachDatabasePool(pool))
      .catch(() => {
        /* not running on Vercel after all; nothing to attach */
      });
  }

  const db = drizzle(pool, { schema });
  cache.__opsPool = pool;
  cache.__opsDb = db;
  return db;
}

export { schema };
