"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Masthead from "@/components/Masthead";
import MetricChange from "@/components/MetricChange";
import { fetchJson } from "@/lib/fetchJson";
import type { EarningsReport, PressCoverageItem } from "@/lib/earnings";

type CoverageCandidate = { outlet: string; headline: string; description: string; link: string };

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

const EMPTY_COVERAGE_FORM = { outlet: "", headline: "", description: "", link: "" };

export default function EarningsReportPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [report, setReport] = useState<EarningsReport | null>(null);
  const [pressCoverage, setPressCoverage] = useState<PressCoverageItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [showAddCoverage, setShowAddCoverage] = useState(false);
  const [coverageForm, setCoverageForm] = useState(EMPTY_COVERAGE_FORM);
  const [addingCoverage, setAddingCoverage] = useState(false);
  const [addCoverageError, setAddCoverageError] = useState<string | null>(null);

  const [showImportCoverage, setShowImportCoverage] = useState(false);
  const [coverageImportText, setCoverageImportText] = useState("");
  const [extractingCoverage, setExtractingCoverage] = useState(false);
  const [extractCoverageError, setExtractCoverageError] = useState<string | null>(null);
  const [coverageCandidates, setCoverageCandidates] = useState<CoverageCandidate[] | null>(null);
  const [addedLinks, setAddedLinks] = useState<Set<string>>(new Set());

  async function load() {
    try {
      const data = await fetchJson(`/api/earnings/${params.id}`);
      setReport(data.report);
      setPressCoverage(Array.isArray(data.pressCoverage) ? data.pressCoverage : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load that report.");
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  async function addCoverageItem(item: CoverageCandidate): Promise<boolean> {
    if (!report) return false;
    try {
      const data = await fetchJson(`/api/earnings/${report.id}/press-coverage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(item),
      });
      setPressCoverage((cur) => [data.item, ...cur]);
      return true;
    } catch (e) {
      alert(e instanceof Error ? e.message : "Could not add that item.");
      return false;
    }
  }

  async function submitManualCoverage(e: React.FormEvent) {
    e.preventDefault();
    if (!coverageForm.outlet.trim() || !coverageForm.headline.trim() || !coverageForm.link.trim()) {
      setAddCoverageError("Outlet, headline, and link are required.");
      return;
    }
    setAddingCoverage(true);
    setAddCoverageError(null);
    const ok = await addCoverageItem(coverageForm);
    setAddingCoverage(false);
    if (ok) {
      setCoverageForm(EMPTY_COVERAGE_FORM);
      setShowAddCoverage(false);
    } else {
      setAddCoverageError("Could not save that item.");
    }
  }

  async function deleteCoverageItem(itemId: string) {
    if (!report) return;
    try {
      await fetchJson(`/api/earnings/${report.id}/press-coverage/${itemId}`, { method: "DELETE" });
      setPressCoverage((cur) => cur.filter((p) => p.id !== itemId));
    } catch (e) {
      alert(e instanceof Error ? e.message : "Could not remove that item.");
    }
  }

  async function runExtractCoverage() {
    if (!report) return;
    setExtractingCoverage(true);
    setExtractCoverageError(null);
    try {
      const data = await fetchJson(`/api/earnings/${report.id}/press-coverage/extract`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: coverageImportText }),
      });
      setCoverageCandidates(data.candidates ?? []);
      setAddedLinks(new Set());
      setShowImportCoverage(false);
    } catch (e) {
      setExtractCoverageError(e instanceof Error ? e.message : "Could not process that text.");
    } finally {
      setExtractingCoverage(false);
    }
  }

  async function addCandidate(item: CoverageCandidate) {
    const ok = await addCoverageItem(item);
    if (ok) setAddedLinks((cur) => new Set(cur).add(item.link));
  }

  return (
    <>
      <Masthead />
      <main>
        {error && <div className="error-banner">{error}</div>}
        {!report && !error && <p className="empty-hint">Loading…</p>}

        {report && (
          <>
            <div className="earnings-header">
              <div className="earnings-header-top">
                <span className="tag-pill color-earn">{report.period}</span>
                {report.priorPeriod && <span className="earnings-ticker">vs {report.priorPeriod}</span>}
                {report.ticker && <span className="earnings-ticker">{report.ticker}</span>}
              </div>
              <h1 className="earnings-company">{report.company}</h1>
              <p className="earnings-dateline">
                {report.reportDate ? formatDate(report.reportDate) : "No report date given"}
              </p>
            </div>

            <div className="pane" style={{ marginBottom: 20 }}>
              <div style={{ padding: "18px 20px" }}>
                {report.metrics.length > 0 ? (
                  <div className="metrics-table-wrap" style={{ overflowX: "auto" }}>
                    <table className="metrics-table">
                      <thead>
                        <tr>
                          <th>Metric</th>
                          <th>{report.period}</th>
                          <th>{report.priorPeriod || "Prior period"}</th>
                          <th>Change</th>
                        </tr>
                      </thead>
                      <tbody>
                        {report.metrics.map((m, i) => (
                          <tr key={i}>
                            <td>{m.label}</td>
                            <td className="metrics-table-current">{m.current}</td>
                            <td>{m.priorYear || "—"}</td>
                            <td>{m.change ? <MetricChange change={m.change} /> : "—"}</td>
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
                    <h3 style={{ fontSize: ".78rem", textTransform: "uppercase", letterSpacing: ".06em", color: "var(--ink-soft)", margin: "22px 0 8px" }}>
                      Key takeaways
                    </h3>
                    <div className="takeaways-card">
                      <ul className="takeaway-list">
                        {report.takeaways.map((t, i) => (
                          <li key={i}>{t}</li>
                        ))}
                      </ul>
                    </div>
                  </>
                )}

                <h3 style={{ fontSize: ".78rem", textTransform: "uppercase", letterSpacing: ".06em", color: "var(--ink-soft)", margin: "22px 0 8px" }}>
                  Stock performance
                </h3>
                <div className="coming-soon-card">
                  Not built yet — this needs a reliable stock-data source for European exchanges first. Coming in a
                  follow-up.
                </div>

                {(report.officialLink || report.earningsCallLink) && (
                  <div style={{ marginTop: 16, display: "flex", gap: 16, flexWrap: "wrap", fontSize: ".88rem" }}>
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

              <div className="modal-actions" style={{ padding: "0 20px 18px" }}>
                <span />
                <button className="action btn-danger" onClick={deleteReport} disabled={deleting}>
                  {deleting ? "Deleting…" : "Delete report"}
                </button>
              </div>
            </div>

            <div className="pane">
              <div className="pane-head">
                <h2>Press coverage</h2>
                <div style={{ display: "flex", gap: 8 }}>
                  <button className="icon-btn" onClick={() => setShowAddCoverage(true)}>
                    + Add manually
                  </button>
                  <button
                    className="icon-btn"
                    onClick={() => {
                      setCoverageImportText("");
                      setExtractCoverageError(null);
                      setShowImportCoverage(true);
                    }}
                  >
                    📋 Import coverage
                  </button>
                </div>
              </div>
              <div style={{ padding: "16px 18px" }}>
                {coverageCandidates && coverageCandidates.length > 0 && (
                  <>
                    <p className="scan-note">
                      Found {coverageCandidates.length} item{coverageCandidates.length === 1 ? "" : "s"} — add the ones
                      you want, leave out the rest.
                    </p>
                    <div className="scan-results-list" style={{ marginBottom: 16 }}>
                      {coverageCandidates.map((c) => {
                        const added = addedLinks.has(c.link);
                        return (
                          <div className="scan-result" key={c.link}>
                            <div className="info">
                              <strong>{c.outlet}</strong> — {c.headline}
                              {c.description && <div className="desc">{c.description}</div>}
                            </div>
                            <button
                              className="add-btn"
                              disabled={added}
                              onClick={() => addCandidate(c)}
                              aria-label={`Add ${c.headline}`}
                            >
                              {added ? "✓" : "+"}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}
                {coverageCandidates && coverageCandidates.length === 0 && (
                  <p className="scan-note">Nothing found in that text — try pasting more context.</p>
                )}

                {pressCoverage.length === 0 && !coverageCandidates ? (
                  <div className="coming-soon-card">
                    No coverage added yet — add a link manually, or paste a dump of links/headlines with Import
                    coverage and review what's found.
                  </div>
                ) : (
                  <div className="press-coverage-list">
                    {pressCoverage.map((p) => (
                      <div className="press-coverage-item" key={p.id}>
                        <div className="row1">
                          <div>
                            <div className="title">{p.headline}</div>
                            <span className="tag-pill color-slate" style={{ marginTop: 4 }}>
                              {p.outlet}
                            </span>
                          </div>
                          <button className="icon-btn" onClick={() => deleteCoverageItem(p.id)}>
                            Remove
                          </button>
                        </div>
                        {p.description && <div className="desc">{p.description}</div>}
                        <a href={p.link} target="_blank" rel="noopener noreferrer" style={{ fontSize: ".82rem" }}>
                          Read →
                        </a>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </main>

      {showAddCoverage && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setShowAddCoverage(false)}>
          <div className="modal">
            <h3>Add press coverage</h3>
            <form className="event-form" onSubmit={submitManualCoverage}>
              {addCoverageError && <div className="error-banner">{addCoverageError}</div>}
              <label>
                Outlet
                <input
                  required
                  placeholder="e.g. Bloomberg"
                  value={coverageForm.outlet}
                  onChange={(e) => setCoverageForm((f) => ({ ...f, outlet: e.target.value }))}
                />
              </label>
              <label>
                Headline
                <input
                  required
                  value={coverageForm.headline}
                  onChange={(e) => setCoverageForm((f) => ({ ...f, headline: e.target.value }))}
                />
              </label>
              <label>
                Description (optional)
                <textarea
                  value={coverageForm.description}
                  onChange={(e) => setCoverageForm((f) => ({ ...f, description: e.target.value }))}
                />
              </label>
              <label>
                Link
                <input
                  required
                  type="url"
                  placeholder="https://…"
                  value={coverageForm.link}
                  onChange={(e) => setCoverageForm((f) => ({ ...f, link: e.target.value }))}
                />
              </label>
              <div className="modal-actions">
                <button
                  type="button"
                  className="action btn-ghost"
                  onClick={() => setShowAddCoverage(false)}
                  disabled={addingCoverage}
                >
                  Cancel
                </button>
                <button type="submit" className="action btn-primary" disabled={addingCoverage}>
                  {addingCoverage ? "Adding…" : "Add"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showImportCoverage && (
        <div
          className="modal-overlay"
          onClick={(e) => e.target === e.currentTarget && !extractingCoverage && setShowImportCoverage(false)}
        >
          <div className="modal modal-wide" style={{ maxWidth: 680 }}>
            <h3>Import press coverage</h3>
            <p style={{ fontSize: ".88rem", color: "var(--ink-soft)", marginTop: 0 }}>
              Paste a dump of links, headlines, or notes — it'll be read through and turned into a list you review
              and add from, same as the earnings import.
            </p>
            {extractCoverageError && <div className="error-banner">{extractCoverageError}</div>}
            <textarea
              value={coverageImportText}
              onChange={(e) => setCoverageImportText(e.target.value)}
              placeholder="Paste links/headlines/notes here…"
              maxLength={60000}
              style={{
                width: "100%",
                minHeight: 260,
                fontFamily: "inherit",
                fontSize: ".9rem",
                padding: "8px 10px",
                border: "1px solid var(--line)",
                borderRadius: 3,
                background: "var(--paper)",
                color: "var(--ink)",
                resize: "vertical",
              }}
            />
            <div className="modal-actions">
              <button className="action btn-ghost" onClick={() => setShowImportCoverage(false)} disabled={extractingCoverage}>
                Cancel
              </button>
              <button
                className="action btn-primary"
                disabled={!coverageImportText.trim() || extractingCoverage}
                onClick={runExtractCoverage}
              >
                {extractingCoverage ? "Reading…" : "Extract coverage"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
