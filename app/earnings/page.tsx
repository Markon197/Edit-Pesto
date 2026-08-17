"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Masthead from "@/components/Masthead";
import { fetchJson } from "@/lib/fetchJson";
import type { EarningsMetric, EarningsReport } from "@/lib/earnings";

type Draft = {
  company: string;
  period: string;
  reportDate: string;
  ticker: string;
  metrics: EarningsMetric[];
  takeaways: string[];
  officialLink: string;
  earningsCallLink: string;
  sourceText: string;
};

function formatShort(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export default function EarningsPage() {
  const router = useRouter();
  const [reports, setReports] = useState<EarningsReport[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [showImport, setShowImport] = useState(false);
  const [importText, setImportText] = useState("");
  const [extracting, setExtracting] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);

  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  async function load() {
    try {
      const data = await fetchJson("/api/earnings");
      setReports(Array.isArray(data.reports) ? data.reports : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load earnings reports.");
    }
  }
  useEffect(() => {
    load();
  }, []);

  async function runExtract() {
    setExtracting(true);
    setExtractError(null);
    try {
      const data = await fetchJson("/api/earnings/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: importText }),
      });
      setDraft(data.draft);
      setShowImport(false);
    } catch (e) {
      setExtractError(e instanceof Error ? e.message : "Could not process that text.");
    } finally {
      setExtracting(false);
    }
  }

  function updateMetric(i: number, patch: Partial<EarningsMetric>) {
    setDraft((d) => (d ? { ...d, metrics: d.metrics.map((m, idx) => (idx === i ? { ...m, ...patch } : m)) } : d));
  }
  function addMetric() {
    setDraft((d) => (d ? { ...d, metrics: [...d.metrics, { label: "", current: "", priorYear: "", change: "" }] } : d));
  }
  function removeMetric(i: number) {
    setDraft((d) => (d ? { ...d, metrics: d.metrics.filter((_, idx) => idx !== i) } : d));
  }
  function updateTakeaway(i: number, value: string) {
    setDraft((d) => (d ? { ...d, takeaways: d.takeaways.map((t, idx) => (idx === i ? value : t)) } : d));
  }
  function addTakeaway() {
    setDraft((d) => (d ? { ...d, takeaways: [...d.takeaways, ""] } : d));
  }
  function removeTakeaway(i: number) {
    setDraft((d) => (d ? { ...d, takeaways: d.takeaways.filter((_, idx) => idx !== i) } : d));
  }

  async function saveDraft(e: React.FormEvent) {
    e.preventDefault();
    if (!draft) return;
    if (!draft.company.trim() || !draft.period.trim()) {
      setSaveError("A company name and reporting period are required.");
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      const data = await fetchJson("/api/earnings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      router.push(`/earnings/${data.report.id}`);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Could not save that report.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Masthead />
      <main>
        <div className="action-row">
          <button
            className="action btn-secondary"
            onClick={() => {
              setImportText("");
              setExtractError(null);
              setShowImport(true);
            }}
          >
            📋 Import earnings report
          </button>
        </div>

        {error && <div className="error-banner">{error}</div>}

        <div className="pane">
          <div className="pane-head">
            <h2>Earnings</h2>
            <span style={{ fontSize: ".8rem", color: "var(--ink-soft)", fontStyle: "italic" }}>
              {reports ? `${reports.length} report${reports.length === 1 ? "" : "s"}` : "Loading…"}
            </span>
          </div>
          <ul className="event-list" style={{ maxHeight: "none" }}>
            {reports && reports.length === 0 && (
              <p className="empty-hint" style={{ padding: "0 4px" }}>
                No earnings reports yet — paste a press release with Import to add the first one.
              </p>
            )}
            {reports?.map((r) => (
              <li className="event-card" key={r.id}>
                <Link href={`/earnings/${r.id}`} style={{ textDecoration: "none", color: "inherit", display: "block" }}>
                  <div className="row1">
                    <span className="title">
                      {r.company} — {r.period}
                    </span>
                    <span className="date">{r.reportDate ? formatShort(r.reportDate) : ""}</span>
                  </div>
                  {r.takeaways[0] && <div className="desc">{r.takeaways[0]}</div>}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </main>

      {showImport && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && !extracting && setShowImport(false)}>
          <div className="modal modal-wide" style={{ maxWidth: 720 }}>
            <h3>Import earnings report</h3>
            <p style={{ fontSize: ".88rem", color: "var(--ink-soft)", marginTop: 0 }}>
              Paste a press release or AI-generated summary — it'll be read through and turned into a structured
              report you can review and edit before saving.
            </p>
            {extractError && <div className="error-banner">{extractError}</div>}
            <textarea
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              placeholder="Paste text here…"
              maxLength={60000}
              style={{
                width: "100%",
                minHeight: 360,
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
              <button className="action btn-ghost" onClick={() => setShowImport(false)} disabled={extracting}>
                Cancel
              </button>
              <button className="action btn-primary" disabled={!importText.trim() || extracting} onClick={runExtract}>
                {extracting ? "Reading…" : "Extract report"}
              </button>
            </div>
          </div>
        </div>
      )}

      {draft && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && !saving && setDraft(null)}>
          <div className="modal modal-wide" style={{ maxWidth: 760 }}>
            <h3>Review before saving</h3>
            <form className="event-form" onSubmit={saveDraft}>
              {saveError && <div className="error-banner">{saveError}</div>}
              <div className="form-row">
                <label>
                  Company
                  <input
                    required
                    value={draft.company}
                    onChange={(e) => setDraft((d) => d && { ...d, company: e.target.value })}
                  />
                </label>
                <label>
                  Period
                  <input
                    required
                    placeholder="H1 2026"
                    value={draft.period}
                    onChange={(e) => setDraft((d) => d && { ...d, period: e.target.value })}
                  />
                </label>
              </div>
              <div className="form-row">
                <label>
                  Report date (optional)
                  <input
                    type="date"
                    value={draft.reportDate}
                    onChange={(e) => setDraft((d) => d && { ...d, reportDate: e.target.value })}
                  />
                </label>
                <label>
                  Ticker (optional)
                  <input value={draft.ticker} onChange={(e) => setDraft((d) => d && { ...d, ticker: e.target.value })} />
                </label>
              </div>

              <label>Metrics</label>
              <div className="metric-editor">
                {draft.metrics.map((m, i) => (
                  <div className="metric-editor-row" key={i}>
                    <input placeholder="Label" value={m.label} onChange={(e) => updateMetric(i, { label: e.target.value })} />
                    <input placeholder="Current" value={m.current} onChange={(e) => updateMetric(i, { current: e.target.value })} />
                    <input
                      placeholder="Prior year"
                      value={m.priorYear || ""}
                      onChange={(e) => updateMetric(i, { priorYear: e.target.value })}
                    />
                    <input placeholder="Change" value={m.change || ""} onChange={(e) => updateMetric(i, { change: e.target.value })} />
                    <button type="button" className="icon-btn" onClick={() => removeMetric(i)} aria-label="Remove metric">
                      ✕
                    </button>
                  </div>
                ))}
                <button type="button" className="action btn-ghost" onClick={addMetric}>
                  + Add metric
                </button>
              </div>

              <label>Key takeaways</label>
              <div className="metric-editor">
                {draft.takeaways.map((t, i) => (
                  <div className="metric-editor-row metric-editor-row-single" key={i}>
                    <input value={t} onChange={(e) => updateTakeaway(i, e.target.value)} />
                    <button type="button" className="icon-btn" onClick={() => removeTakeaway(i)} aria-label="Remove takeaway">
                      ✕
                    </button>
                  </div>
                ))}
                <button type="button" className="action btn-ghost" onClick={addTakeaway}>
                  + Add takeaway
                </button>
              </div>

              <label>
                Official release link (optional)
                <input
                  type="url"
                  value={draft.officialLink}
                  onChange={(e) => setDraft((d) => d && { ...d, officialLink: e.target.value })}
                />
              </label>
              <label>
                Earnings call link (optional)
                <input
                  type="url"
                  value={draft.earningsCallLink}
                  onChange={(e) => setDraft((d) => d && { ...d, earningsCallLink: e.target.value })}
                />
              </label>

              <div className="modal-actions">
                <button type="button" className="action btn-ghost" onClick={() => setDraft(null)} disabled={saving}>
                  Discard
                </button>
                <button type="submit" className="action btn-primary" disabled={saving}>
                  {saving ? "Saving…" : "Save report"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
