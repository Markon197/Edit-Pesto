// Thin wrapper around @vercel/postgres. Provision the database from the
// Vercel dashboard (Project -> Storage -> Create Database -> Postgres,
// backed by Neon) and it auto-injects the POSTGRES_* env vars this reads —
// no manual connection string needed. See README.md for the exact steps.
import { randomUUID } from "crypto";
import { sql } from "@vercel/postgres";
import { BUILTIN_TAGS } from "@/lib/tags";

let schemaReady: Promise<void> | null = null;

// Idempotent — safe to call on every request. Cached per warm serverless
// instance so it only actually hits the DB once per cold start.
export function ensureSchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = (async () => {
      await Promise.all([
        sql`
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
        `,
        sql`
          CREATE TABLE IF NOT EXISTS activity_log (
            id TEXT PRIMARY KEY,
            action TEXT NOT NULL,
            detail TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now()
          );
        `,
        sql`
          CREATE TABLE IF NOT EXISTS tags (
            id TEXT PRIMARY KEY,
            label TEXT NOT NULL,
            color TEXT NOT NULL,
            highlight BOOLEAN NOT NULL DEFAULT FALSE,
            sort_order INTEGER NOT NULL DEFAULT 0,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now()
          );
        `,
        sql`
          CREATE TABLE IF NOT EXISTS newsletter_subscribers (
            id TEXT PRIMARY KEY,
            email TEXT NOT NULL UNIQUE,
            name TEXT,
            subscribed_at TIMESTAMPTZ NOT NULL DEFAULT now()
          );
        `,
        // metrics/takeaways are JSONB rather than their own tables — the
        // metric set genuinely varies company to company (a life insurer
        // has no combined ratio; a reinsurer reports differently to a
        // retail insurer), and nothing here needs cross-report querying,
        // just per-report display.
        sql`
          CREATE TABLE IF NOT EXISTS earnings_reports (
            id TEXT PRIMARY KEY,
            company TEXT NOT NULL,
            period TEXT NOT NULL,
            report_date DATE,
            ticker TEXT,
            source_text TEXT,
            metrics JSONB NOT NULL DEFAULT '[]'::jsonb,
            takeaways JSONB NOT NULL DEFAULT '[]'::jsonb,
            official_link TEXT,
            earnings_call_link TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now()
          );
        `,
      ]);
      // These two reference tables created just above (events / earnings_reports)
      // — sequential, not folded into the Promise.all batch, because nothing
      // guarantees a table exists before a concurrent CREATE TABLE naming it
      // in a foreign key finishes. Both are themselves idempotent, so this
      // still costs nothing on a warm run.
      await sql`
        CREATE TABLE IF NOT EXISTS week_ahead_notes (
          event_id TEXT PRIMARY KEY REFERENCES events(id) ON DELETE CASCADE,
          note TEXT,
          hidden BOOLEAN NOT NULL DEFAULT FALSE,
          sort_order INTEGER NOT NULL DEFAULT 0,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
      `;
      // Deliberately separate from earnings_reports' AI-populated fields —
      // press coverage is a manual, editorial-only addition, never touched
      // by the import/AI flow.
      await sql`
        CREATE TABLE IF NOT EXISTS press_coverage (
          id TEXT PRIMARY KEY,
          earnings_report_id TEXT NOT NULL REFERENCES earnings_reports(id) ON DELETE CASCADE,
          outlet TEXT NOT NULL,
          headline TEXT NOT NULL,
          description TEXT NOT NULL DEFAULT '',
          link TEXT NOT NULL,
          added_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
      `;
      // Migration for tables created before the optional event time field
      // existed — CREATE TABLE IF NOT EXISTS above is a no-op on a table
      // that's already there, so the new column has to be added separately.
      await sql`ALTER TABLE events ADD COLUMN IF NOT EXISTS event_time TEXT;`;
      // One-time seed: the six tags that used to be hardcoded, so an
      // existing deployment's events (already tagged "event", "earnings",
      // etc.) keep resolving to a real label and color after the upgrade.
      const { rows: tagCountRows } = await sql`SELECT COUNT(*)::int AS count FROM tags;`;
      if (tagCountRows[0]?.count === 0) {
        for (let i = 0; i < BUILTIN_TAGS.length; i++) {
          const t = BUILTIN_TAGS[i];
          await sql`
            INSERT INTO tags (id, label, color, highlight, sort_order)
            VALUES (${t.id}, ${t.label}, ${t.color}, ${t.highlight}, ${i})
            ON CONFLICT (id) DO NOTHING;
          `;
        }
      }
    })().catch((err) => {
      // Let the next call retry rather than caching a failed connection.
      schemaReady = null;
      throw err;
    });
  }
  return schemaReady;
}

// Fire-and-forget usage tracking for the hidden /stats page. Never throws —
// a logging failure must never break the feature it's logging.
export async function logActivity(action: string, detail?: string): Promise<void> {
  try {
    await ensureSchema();
    await sql`INSERT INTO activity_log (id, action, detail) VALUES (${randomUUID()}, ${action}, ${detail ?? null});`;
  } catch (err) {
    console.error("logActivity failed", err);
  }
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
