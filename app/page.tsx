"use client";

import { useRef, useState } from "react";

type CheckResult = {
  annotatedHtml: string;
  headlines: string[];
  companies: string[];
  people: string[];
};

function htmlToText(html: string): string {
  const div = document.createElement("div");
  div.innerHTML = html;
  return (div.innerText || div.textContent || "").trim();
}

function cleanHtmlFrom(sourceHtml: string): string {
  const div = document.createElement("div");
  div.innerHTML = sourceHtml;
  div.querySelectorAll("del").forEach((n) => n.remove());
  div.querySelectorAll("ins").forEach((n) => n.replaceWith(document.createTextNode(n.textContent || "")));
  return div.innerHTML;
}

export default function Home() {
  const inputRef = useRef<HTMLDivElement>(null);
  const [result, setResult] = useState<CheckResult | null>(null);
  const [accepted, setAccepted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedFlag, setCopiedFlag] = useState<string | null>(null);

  function flash(key: string) {
    setCopiedFlag(key);
    setTimeout(() => setCopiedFlag((cur) => (cur === key ? null : cur)), 1400);
  }

  async function handleCheck() {
    const html = inputRef.current?.innerHTML ?? "";
    if (!html.trim()) return;
    setLoading(true);
    setError(null);
    setAccepted(false);
    setResult(null);
    try {
      const res = await fetch("/api/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ html }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Something went wrong.");
      setResult(data as CheckResult);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong. Try again.");
    } finally {
      setLoading(false);
    }
  }

  function currentOutputHtml(): string {
    if (!result) return "";
    return accepted ? cleanHtmlFrom(result.annotatedHtml) : result.annotatedHtml;
  }

  async function copyForCms() {
    const html = cleanHtmlFrom(result?.annotatedHtml ?? "");
    if (!html.trim()) return;
    const text = htmlToText(html);
    try {
      const item = new ClipboardItem({
        "text/html": new Blob([html], { type: "text/html" }),
        "text/plain": new Blob([text], { type: "text/plain" }),
      });
      await navigator.clipboard.write([item]);
    } catch {
      await navigator.clipboard.writeText(text);
    }
    flash("cms");
  }

  async function copyPlainText() {
    const html = cleanHtmlFrom(result?.annotatedHtml ?? "");
    if (!html.trim()) return;
    await navigator.clipboard.writeText(htmlToText(html));
    flash("plain");
  }

  async function copyList(key: string, items: string[]) {
    if (!items.length) return;
    await navigator.clipboard.writeText(items.join("; "));
    flash(key);
  }

  async function copyOne(headline: string) {
    await navigator.clipboard.writeText(headline);
    flash("h-" + headline);
  }

  const editCount = result ? (result.annotatedHtml.match(/<ins[\s>]/g) || []).length : 0;

  return (
    <>
      <div className="masthead">
        <div className="wordmark">
          Edit<span>Pesto</span>
        </div>
        <div className="tag">Final proofing pass for InsuranceERM copy</div>
      </div>

      <main>
        <section className="workspace">
          <div className="pane">
            <div className="pane-head">
              <h2>Paste article</h2>
            </div>
            <div
              ref={inputRef}
              className="input-area"
              contentEditable
              suppressContentEditableWarning
              data-placeholder="Paste the finished, edited article here..."
            />
            <div className="pane-actions">
              <button className="btn-secondary" onClick={handleCheck} disabled={loading}>
                {loading ? "Checking..." : "Check article"}
              </button>
              <span style={{ fontSize: ".82rem", color: "var(--ink-soft)" }}>
                Links, bold and italics are kept exactly as pasted
              </span>
            </div>
          </div>

          <div className="pane">
            <div className="pane-head">
              <h2>Ready to publish</h2>
              <span className="count">
                {!result
                  ? ""
                  : accepted
                  ? "All edits accepted"
                  : editCount === 0
                  ? "No issues found"
                  : `${editCount} edit${editCount === 1 ? "" : "s"} found`}
              </span>
            </div>
            <div
              className={`output-body${accepted ? " clean" : ""}`}
              data-placeholder="Your checked article will appear here."
              dangerouslySetInnerHTML={{ __html: currentOutputHtml() }}
            />
            <div className="pane-actions">
              {error && <div className="error-banner">{error}</div>}
              <button
                className="btn-primary"
                onClick={() => setAccepted(true)}
                disabled={!result || editCount === 0 || accepted}
              >
                Accept all edits
              </button>
              <button className="btn-ghost" onClick={copyForCms} disabled={!result}>
                Copy for CMS
              </button>
              <button className="btn-ghost" onClick={copyPlainText} disabled={!result}>
                Copy plain text
              </button>
              <span className={`copied-flag${copiedFlag === "cms" || copiedFlag === "plain" ? " show" : ""}`}>
                Copied ✓
              </span>
            </div>
          </div>
        </section>

        <section className="side-row">
          <div className="card">
            <h3>Headline options</h3>
            {result && result.headlines.length > 0 ? (
              <ul className="headline-list">
                {result.headlines.map((h) => (
                  <li key={h}>
                    <span className="txt">{h}</span>
                    <button className="icon-btn" onClick={() => copyOne(h)}>
                      {copiedFlag === "h-" + h ? "Copied" : "Copy"}
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="empty-hint">Run a check to see headline options.</p>
            )}
          </div>

          <div className="card">
            <h3>Companies mentioned</h3>
            {result && result.companies.length > 0 ? (
              <>
                <div className="chip-field">
                  {result.companies.map((c, i) => (
                    <span key={c}>
                      <span className="chip">{c}</span>
                      {i < result.companies.length - 1 && <span className="sep">;</span>}
                    </span>
                  ))}
                </div>
                <button className="btn-ghost" style={{ alignSelf: "flex-start" }} onClick={() => copyList("companies", result.companies)}>
                  {copiedFlag === "companies" ? "Copied ✓" : "Copy for CMS field"}
                </button>
              </>
            ) : (
              <p className="empty-hint">Run a check to see companies mentioned.</p>
            )}
          </div>

          <div className="card">
            <h3>People mentioned</h3>
            {result && result.people.length > 0 ? (
              <>
                <div className="chip-field">
                  {result.people.map((p, i) => (
                    <span key={p}>
                      <span className="chip">{p}</span>
                      {i < result.people.length - 1 && <span className="sep">;</span>}
                    </span>
                  ))}
                </div>
                <button className="btn-ghost" style={{ alignSelf: "flex-start" }} onClick={() => copyList("people", result.people)}>
                  {copiedFlag === "people" ? "Copied ✓" : "Copy for CMS field"}
                </button>
              </>
            ) : (
              <p className="empty-hint">Run a check to see people mentioned.</p>
            )}
          </div>
        </section>
      </main>
    </>
  );
}
