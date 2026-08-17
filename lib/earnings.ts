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
  reportDate: string | null; // YYYY-MM-DD
  ticker: string | null;
  sourceText: string | null;
  metrics: EarningsMetric[];
  takeaways: string[];
  officialLink: string | null;
  earningsCallLink: string | null;
  createdAt: string;
};

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
