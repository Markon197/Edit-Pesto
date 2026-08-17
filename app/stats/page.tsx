"use client";

import { useEffect, useRef, useState } from "react";
import Masthead from "@/components/Masthead";
import { fetchJson } from "@/lib/fetchJson";

type CountRow = { action: string; count: number };
type RecentRow = { action: string; detail: string | null; created_at: string };
type DailyRow = { date: string; count: number; byAction: Record<string, number> };

const ACTION_LABELS: Record<string, string> = {
  site_visit: "Site visit",
  edit_check: "Edit tab — article checked",
  scan_events: "Calendar — insurance events scanned",
  scan_earnings: "Calendar — earnings calendar scanned",
  scan_holidays: "Calendar — UK bank holidays scanned",
  import_events: "Calendar — events imported from pasted text",
  add_event: "Calendar — event added",
  edit_event: "Calendar — event edited",
  delete_event: "Calendar — event deleted",
  add_tag: "Calendar — tag added",
  edit_tag: "Calendar — tag edited",
  delete_tag: "Calendar — tag deleted",
  week_ahead_edit: "Week Ahead — event customised",
  newsletter_signup: "Week Ahead — newsletter signup",
  extract_earnings_report: "Earnings — report extracted from pasted text",
  add_earnings_report: "Earnings — report saved",
  delete_earnings_report: "Earnings — report deleted",
  extract_press_coverage: "Earnings — press coverage extracted from pasted text",
  add_press_coverage: "Earnings — press coverage added",
  delete_press_coverage: "Earnings — press coverage deleted",
};

function labelFor(action: string): string {
  return ACTION_LABELS[action] || action;
}

function formatDay(iso: string): string {
  const d = new Date(iso + "T00:00:00Z");
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
}

function formatDayFull(iso: string): string {
  const d = new Date(iso + "T00:00:00Z");
  return d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

// A bar with only its top corners rounded, square at the baseline — a
// plain SVG <rect rx> would round all four corners, which reads wrong for
// a bar growing up from an axis.
function barPath(x: number, y: number, w: number, h: number, r: number): string {
  const rr = Math.max(0, Math.min(r, h / 2, w / 2));
  if (rr === 0) return `M${x},${y + h} L${x},${y} L${x + w},${y} L${x + w},${y + h} Z`;
  return (
    `M${x},${y + h} L${x},${y + rr} Q${x},${y} ${x + rr},${y} ` +
    `L${x + w - rr},${y} Q${x + w},${y} ${x + w},${y + rr} L${x + w},${y + h} Z`
  );
}

// One series (every logged action counts as one "use," regardless of
// type) plotted per day — so no legend (the pane title already says what
// this is) and one fixed hue matching the rest of the app's navy accent.
// Hovering anywhere in a day's column (not just the visible bar — days
// with zero uses need a hit target too) shows a breakdown by action type
// for that day, not just the total.
function UsageChart({ data }: { data: DailyRow[] }) {
  const width = 900;
  const height = 170;
  const padding = { top: 18, right: 6, bottom: 22, left: 30 };
  const plotW = width - padding.left - padding.right;
  const plotH = height - padding.top - padding.bottom;
  const baseline = padding.top + plotH;

  const max = Math.max(1, ...data.map((d) => d.count));
  const n = data.length || 1;
  const slot = plotW / n;
  const barW = Math.min(22, slot * 0.7);
  const labelEvery = Math.max(1, Math.round(n / 6));

  const containerRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<{ index: number; x: number; y: number } | null>(null);

  function handleMove(index: number, e: React.MouseEvent) {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    setHover({ index, x: e.clientX - rect.left, y: e.clientY - rect.top });
  }

  const hovered = hover ? data[hover.index] : null;
  const hoveredBreakdown = hovered
    ? Object.entries(hovered.byAction).sort((a, b) => b[1] - a[1])
    : [];

  return (
    <div ref={containerRef} style={{ position: "relative" }}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        style={{ width: "100%", height: "auto", display: "block" }}
        role="img"
        aria-label={`Usage per day, last ${data.length} days, ${data.reduce((s, d) => s + d.count, 0)} uses total`}
      >
        {/* Recessive reference lines: baseline (0) and the max value, hairline and one step off the surface. */}
        <line x1={padding.left} y1={baseline} x2={padding.left + plotW} y2={baseline} stroke="var(--line)" strokeWidth={1} />
        <line x1={padding.left} y1={padding.top} x2={padding.left + plotW} y2={padding.top} stroke="var(--line)" strokeWidth={1} />
        <text x={padding.left - 6} y={baseline} textAnchor="end" dominantBaseline="middle" fontSize={10} fill="var(--ink-soft)">
          0
        </text>
        <text x={padding.left - 6} y={padding.top} textAnchor="end" dominantBaseline="middle" fontSize={10} fill="var(--ink-soft)">
          {max}
        </text>

        {data.map((d, i) => {
          const x = padding.left + i * slot + (slot - barW) / 2;
          const h = d.count === 0 ? 0 : Math.max(2, (d.count / max) * plotH);
          const y = baseline - h;
          const showLabel = i === 0 || i === n - 1 || i % labelEvery === 0;
          const isHovered = hover?.index === i;
          return (
            <g key={d.date}>
              {h > 0 && (
                <path d={barPath(x, y, barW, h, 4)} fill="var(--navy)" opacity={isHovered ? 1 : 0.92} />
              )}
              {showLabel && (
                <text x={x + barW / 2} y={baseline + 14} textAnchor="middle" fontSize={9.5} fill="var(--ink-soft)">
                  {formatDay(d.date)}
                </text>
              )}
              {/* Hit target covers the whole day column, not just the bar — a
                  zero-count day has no visible bar but should still be
                  hoverable, and a slim bar is an easy miss otherwise. */}
              <rect
                x={padding.left + i * slot}
                y={padding.top}
                width={slot}
                height={plotH}
                fill="transparent"
                onMouseEnter={(e) => handleMove(i, e)}
                onMouseMove={(e) => handleMove(i, e)}
                onMouseLeave={() => setHover(null)}
                style={{ cursor: "pointer" }}
              />
            </g>
          );
        })}
      </svg>

      {hover && hovered && (
        <div className="chart-tooltip" style={{ left: hover.x, top: hover.y }}>
          <div className="chart-tooltip-date">{formatDayFull(hovered.date)}</div>
          <div className="chart-tooltip-total">
            {hovered.count} use{hovered.count === 1 ? "" : "s"} total
          </div>
          {hoveredBreakdown.length > 0 ? (
            <ul>
              {hoveredBreakdown.map(([action, count]) => (
                <li key={action}>
                  <span>{labelFor(action)}</span>
                  <span>{count}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="chart-tooltip-empty">Nothing this day</p>
          )}
        </div>
      )}
    </div>
  );
}

export default function StatsPage() {
  const [counts, setCounts] = useState<CountRow[] | null>(null);
  const [recent, setRecent] = useState<RecentRow[] | null>(null);
  const [daily, setDaily] = useState<DailyRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchJson("/api/stats")
      .then((data) => {
        setCounts(data.counts);
        setRecent(data.recent);
        setDaily(Array.isArray(data.daily) ? data.daily : []);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Could not load stats."));
  }, []);

  const total = counts?.reduce((sum, c) => sum + c.count, 0) ?? 0;

  return (
    <>
      <Masthead />
      <main>
        <div className="status-strip">
          Usage stats — not linked from anywhere in the app; this URL is the only way in. Same site password
          protects it as everything else.
        </div>

        {error && <div className="error-banner">{error}</div>}

        <div className="pane" style={{ marginBottom: 20 }}>
          <div className="pane-head">
            <h2>Usage per day</h2>
            <span style={{ fontSize: ".8rem", color: "var(--ink-soft)", fontStyle: "italic" }}>
              every click counts as one use — last {daily?.length ?? 30} days — hover a bar for the breakdown
            </span>
          </div>
          <div style={{ padding: "16px 18px" }}>
            {!daily && !error && <p className="empty-hint">Loading…</p>}
            {daily && daily.length > 0 && <UsageChart data={daily} />}
          </div>
        </div>

        <section className="stats-workspace">
          <div className="pane">
            <div className="pane-head">
              <h2>Totals by action</h2>
              <span style={{ fontSize: ".8rem", color: "var(--ink-soft)", fontStyle: "italic" }}>
                {total} total
              </span>
            </div>
            <div style={{ padding: "16px 18px" }}>
              {!counts && !error && <p className="empty-hint">Loading…</p>}
              {counts && counts.length === 0 && <p className="empty-hint">No activity logged yet.</p>}
              {counts && counts.length > 0 && (
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <tbody>
                    {counts.map((c) => (
                      <tr key={c.action} style={{ borderBottom: "1px solid var(--line)" }}>
                        <td style={{ padding: "8px 4px", fontSize: ".95rem" }}>{labelFor(c.action)}</td>
                        <td
                          style={{
                            padding: "8px 4px",
                            textAlign: "right",
                            fontVariantNumeric: "tabular-nums",
                            fontWeight: 700,
                          }}
                        >
                          {c.count}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          <div className="pane">
            <div className="pane-head">
              <h2>Recent activity</h2>
            </div>
            <ul className="event-list" style={{ maxHeight: 480 }}>
              {recent && recent.length === 0 && <p className="empty-hint">Nothing yet.</p>}
              {recent?.map((r, i) => (
                <li className="event-card" key={i} style={{ cursor: "default" }}>
                  <div className="row1">
                    <span className="title" style={{ fontSize: ".92rem" }}>
                      {labelFor(r.action)}
                    </span>
                    <span className="date">{new Date(r.created_at).toLocaleString("en-GB")}</span>
                  </div>
                  {r.detail && <div className="desc">{r.detail}</div>}
                </li>
              ))}
            </ul>
          </div>
        </section>
      </main>
    </>
  );
}
