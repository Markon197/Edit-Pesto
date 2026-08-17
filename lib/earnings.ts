// Shared types for the Earnings hub. Metrics and takeaways are stored as
// JSONB on the row (see lib/db.ts) rather than their own tables — the
// metric set genuinely varies company to company (a life insurer has no
// combined ratio; a reinsurer's release reads differently to a retail
// insurer's), so a flexible per-report list is the honest shape, not a
// fixed set of columns most rows would leave null.
import { toDateString } from "@/lib/events";

export type EarningsMetric = {
  label: string;
  current: string;
  priorYear?: string;
  change?: string;
};

export type EarningsReport = {
  id: string;
  company: string;
  period: string; // e.g. "H1 2026"
  priorPeriod: string | null; // e.g. "H1 2025" — what the prior-year figures actually compare to
  reportDate: string | null; // YYYY-MM-DD
  ticker: string | null;
  sourceText: string | null;
  metrics: EarningsMetric[];
  takeaways: string[];
  officialLink: string | null;
  earningsCallLink: string | null;
  createdAt: string;
};

// Defensive backstop, not the primary fix — the extraction prompt already
// asks for symbols-not-codes and minus-not-parentheses, but models don't
// comply with formatting instructions with 100% consistency, and this is
// cheap insurance against the one thing the user was explicit about.
const CURRENCY_CODES: Record<string, string> = { USD: "$", EUR: "€", GBP: "£", JPY: "¥" };

export function normalizeMetricValue(value: string): string {
  let s = value.trim();
  // Accounting-style negative parentheses -> a leading minus sign, e.g.
  // "(5.2%)" -> "-5.2%", "(USD 40m)" -> "-USD 40m" (code swap happens next).
  const paren = s.match(/^\(\s*(.+?)\s*\)$/);
  if (paren) s = `-${paren[1]}`;
  for (const [code, symbol] of Object.entries(CURRENCY_CODES)) {
    s = s.replace(new RegExp(`\\b${code}\\s?`, "gi"), symbol);
  }
  return s.trim();
}

export type PressCoverageItem = {
  id: string;
  earningsReportId: string;
  outlet: string;
  headline: string;
  description: string;
  link: string;
  addedAt: string;
};

function asMetrics(value: unknown): EarningsMetric[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((m): m is Record<string, unknown> => !!m && typeof m === "object")
    .filter((m) => typeof m.label === "string" && typeof m.current === "string")
    .map((m) => ({
      label: m.label as string,
      current: m.current as string,
      priorYear: typeof m.priorYear === "string" ? m.priorYear : undefined,
      change: typeof m.change === "string" ? m.change : undefined,
    }));
}

function asStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((s): s is string => typeof s === "string");
}

export function rowToEarningsReport(row: any): EarningsReport {
  return {
    id: row.id,
    company: row.company,
    period: row.period,
    priorPeriod: row.prior_period ?? null,
    reportDate: row.report_date ? toDateString(row.report_date) : null,
    ticker: row.ticker ?? null,
    sourceText: row.source_text ?? null,
    metrics: asMetrics(row.metrics),
    takeaways: asStringList(row.takeaways),
    officialLink: row.official_link ?? null,
    earningsCallLink: row.earnings_call_link ?? null,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
  };
}

export function rowToPressCoverage(row: any): PressCoverageItem {
  return {
    id: row.id,
    earningsReportId: row.earnings_report_id,
    outlet: row.outlet,
    headline: row.headline,
    description: row.description ?? "",
    link: row.link,
    addedAt: row.added_at instanceof Date ? row.added_at.toISOString() : String(row.added_at),
  };
}
