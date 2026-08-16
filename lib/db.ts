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

// One clear, actionable message for any DB failure, shown directly in the
// UI — so "it's broken" turns into "here's the exact next step" without
// needing to go dig through the README.
const SETUP_STEPS =
  "In Vercel: open this project → the Storage tab → Create Database → choose Postgres. Then redeploy (Deployments tab → ⋯ → Redeploy).";

export function friendlyDbError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (/missing|connection string|POSTGRES_URL|ECONNREFUSED|getaddrinfo|authenticat/i.test(msg)) {
    return `The shared calendar's database isn't connected yet. ${SETUP_STEPS}`;
  }
  return `Could not reach the calendar database. ${SETUP_STEPS} If it's already set up, try redeploying once more.`;
}

export { sql };
