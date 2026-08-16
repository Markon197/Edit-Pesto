// Thin wrapper around @vercel/postgres. Provision the database from the
// Vercel dashboard (Project -> Storage -> Create Database -> Postgres,
// backed by Neon) and it auto-injects the POSTGRES_* env vars this reads —
// no manual connection string needed. See README.md for the exact steps.
import { sql } from "@vercel/postgres";

let schemaReady: Promise<void> | null = null;

// Idempotent — safe to call on every request. Cached per warm serverless
// instance so it only actually hits the DB once per cold start.
export function ensureSchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = sql`
      CREATE TABLE IF NOT EXISTS events (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        tag TEXT NOT NULL,
        start_date DATE NOT NULL,
        end_date DATE,
        description TEXT NOT NULL DEFAULT '',
        link TEXT,
        source TEXT NOT NULL DEFAULT 'manual',
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `
      .then(() => undefined)
      .catch((err) => {
        // Let the next call retry rather than caching a failed connection.
        schemaReady = null;
        throw err;
      });
  }
  return schemaReady;
}

export { sql };
