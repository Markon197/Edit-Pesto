"use client";

import { useEffect, useState } from "react";
import Masthead from "@/components/Masthead";

type CountRow = { action: string; count: number };
type RecentRow = { action: string; detail: string | null; created_at: string };

const ACTION_LABELS: Record<string, string> = {
  edit_check: "Edit tab — article checked",
  scan_events: "Calendar — insurance events scanned",
  scan_earnings: "Calendar — earnings calendar scanned",
  scan_holidays: "Calendar — UK bank holidays scanned",
};

function labelFor(action: string): string {
  return ACTION_LABELS[action] || action;
}

export default function StatsPage() {
  const [counts, setCounts] = useState<CountRow[] | null>(null);
  const [recent, setRecent] = useState<RecentRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/stats")
      .then((res) => res.json().then((data) => ({ ok: res.ok, data })))
      .then(({ ok, data }) => {
        if (!ok) throw new Error(data?.error || "Could not load stats.");
        setCounts(data.counts);
        setRecent(data.recent);
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

        <section className="cal-workspace">
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
