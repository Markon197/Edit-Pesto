"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Masthead from "@/components/Masthead";
import { fetchJson } from "@/lib/fetchJson";
import type { EarningsReport, PressCoverageItem } from "@/lib/earnings";

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

function changeClass(change?: string): string {
  if (!change) return "";
  if (change.trim().startsWith("+")) return "metric-change up";
  if (change.trim().startsWith("-") || change.trim().startsWith("−")) return "metric-change down";
  return "metric-change";
}

export default function EarningsReportPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [report, setReport] = useState<EarningsReport | null>(null);
  const [pressCoverage, setPressCoverage] = useState<PressCoverageItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    fetchJson(`/api/earnings/${params.id}`)
      .then((data) => {
        setReport(data.report);
        setPressCoverage(Array.isArray(data.pressCoverage) ? data.pressCoverage : []);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Could not load that report."));
  }, [params.id]);

  async function deleteReport() {
    if (!report) return;
    setDeleting(true);
    try {
      await fetchJson(`/api/earnings/${report.id}`, { method: "DELETE" });
      router.push("/earnings");
    } catch (e) {
      alert(e instanceof Error ? e.message : "Could not delete that report.");
      setDeleting(false);
    }
  }

  return (
    <>
      <Masthead />
      <main>
        {error && <div className="error-banner">{error}</div>}
        {!report && !error && <p className="empty-hint">Loading…</p>}

        {report && (
          <>
            <div className="pane" style={{ marginBottom: 20 }}>
              <div className="pane-head">
                <h2>
                  {report.company} — {report.period}
                </h2>
                <span style={{ fontSize: ".8rem", color: "var(--ink-soft)", fontStyle: "italic" }}>
                  {report.reportDate ? formatDate(report.reportDate) : "No report date given"}
                </span>
              </div>

              <div style={{ padding: "16px 18px" }}>
                {report.metrics.length > 0 ? (
                  <div style={{ overflowX: "auto" }}>
                    <table className="metrics-table">
                      <thead>
                        <tr>
                          <th>Metric</th>
                          <th>This period</th>
                          <th>Prior year</th>
                          <th>Change</th>
                        </tr>
                      </thead>
                      <tbody>
                        {report.metrics.map((m, i) => (
                          <tr key={i}>
                            <td>{m.label}</td>
                            <td>{m.current}</td>
                            <td>{m.priorYear || "—"}</td>
                            <td>
                              {m.change ? <span className={changeClass(m.change)}>{m.change}</span> : "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="empty-hint">No metrics recorded for this report.</p>
                )}

                {report.takeaways.length > 0 && (
                  <>
                    <h3 style={{ fontSize: ".78rem", textTransform: "uppercase", letterSpacing: ".06em", color: "var(--ink-soft)", margin: "20px 0 8px" }}>
                      Key takeaways
                    </h3>
                    <ul className="takeaway-list">
                      {report.takeaways.map((t, i) => (
                        <li key={i}>{t}</li>
                      ))}
                    </ul>
                  </>
                )}

                <h3 style={{ fontSize: ".78rem", textTransform: "uppercase", letterSpacing: ".06em", color: "var(--ink-soft)", margin: "20px 0 8px" }}>
                  Stock performance
                </h3>
                <div className="coming-soon-card">
                  Not built yet — this needs a reliable stock-data source for European exchanges first. Coming in a
                  follow-up.
                </div>

                {(report.officialLink || report.earningsCallLink || report.ticker) && (
                  <div style={{ marginTop: 16, display: "flex", gap: 16, flexWrap: "wrap", fontSize: ".88rem" }}>
                    {report.ticker && <span style={{ color: "var(--ink-soft)" }}>Ticker: {report.ticker}</span>}
                    {report.officialLink && (
                      <a href={report.officialLink} target="_blank" rel="noopener noreferrer">
                        Official release →
                      </a>
                    )}
                    {report.earningsCallLink && (
                      <a href={report.earningsCallLink} target="_blank" rel="noopener noreferrer">
                        Earnings call →
                      </a>
                    )}
                  </div>
                )}
              </div>

              <div className="modal-actions" style={{ padding: "0 18px 18px" }}>
                <span />
                <button className="action btn-danger" onClick={deleteReport} disabled={deleting}>
                  {deleting ? "Deleting…" : "Delete report"}
                </button>
              </div>
            </div>

            <div className="pane">
              <div className="pane-head">
                <h2>Press coverage</h2>
                <span style={{ fontSize: ".8rem", color: "var(--ink-soft)", fontStyle: "italic" }}>
                  {pressCoverage.length} item{pressCoverage.length === 1 ? "" : "s"}
                </span>
              </div>
              <div style={{ padding: "16px 18px" }}>
                {pressCoverage.length === 0 ? (
                  <div className="coming-soon-card">
                    No coverage added yet. This is a manual, editorial-only section (Bloomberg, other outlets) — not
                    built from the import — adding coverage here is coming in a follow-up.
                  </div>
                ) : (
                  <ul className="event-list" style={{ maxHeight: "none" }}>
                    {pressCoverage.map((p) => (
                      <li className="event-card" key={p.id} style={{ cursor: "default" }}>
                        <div className="row1">
                          <span className="title">{p.headline}</span>
                          <span className="date">{p.outlet}</span>
                        </div>
                        {p.description && <div className="desc">{p.description}</div>}
                        <a href={p.link} target="_blank" rel="noopener noreferrer" style={{ fontSize: ".82rem" }}>
                          Read →
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </>
        )}
      </main>
    </>
  );
}
