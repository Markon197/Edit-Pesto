"use client";

import { useEffect, useRef, useState } from "react";
import Masthead from "@/components/Masthead";
import PastaLoader from "@/components/PastaLoader";
import { fetchJson } from "@/lib/fetchJson";

type CheckResult = {
  annotatedHtml: string;
  headlines: string[];
  companies: string[];
  people: string[];
};

type Stats = { total: number; accepted: number; denied: number; pending: number };

type FactIssue = {
  excerpt: string;
  category: "name" | "title_or_role" | "company" | "fact" | "inconsistency";
  problem: string;
  suggestion: string;
  source: string;
  confidence: "high" | "medium";
};
type FactCheck = { summary: string; issues: FactIssue[]; confirmed: string[] };

const FACT_CATEGORY_LABELS: Record<FactIssue["category"], string> = {
  name: "Name",
  title_or_role: "Title / role",
  company: "Company",
  fact: "Fact",
  inconsistency: "Inconsistent",
};

function htmlToText(html: string): string {
  const div = document.createElement("div");
  div.innerHTML = html;
  return (div.innerText || div.textContent || "").trim();
}

export default function Home() {
  const inputRef = useRef<HTMLDivElement>(null);
  const outputRef = useRef<HTMLDivElement>(null);
  const [result, setResult] = useState<CheckResult | null>(null);
  const [stats, setStats] = useState<Stats>({ total: 0, accepted: 0, denied: 0, pending: 0 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedFlag, setCopiedFlag] = useState<string | null>(null);

  const [factCheck, setFactCheck] = useState<FactCheck | null>(null);
  const [factLoading, setFactLoading] = useState(false);
  const [factError, setFactError] = useState<string | null>(null);
  const [linkedinPost, setLinkedinPost] = useState<string | null>(null);
  const [linkedinLoading, setLinkedinLoading] = useState(false);
  const [linkedinError, setLinkedinError] = useState<string | null>(null);
  // Which side panel is open. Results used to render in cards at the very
  // bottom of the page, out of sight — now they open beside the article.
  const [drawer, setDrawer] = useState<"fact" | "linkedin" | null>(null);

  useEffect(() => {
    if (!drawer) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setDrawer(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawer]);

  function flash(key: string) {
    setCopiedFlag(key);
    setTimeout(() => setCopiedFlag((cur) => (cur === key ? null : cur)), 1400);
  }

  // The output pane's HTML is owned entirely by this effect, not by React's
  // JSX (no dangerouslySetInnerHTML on that div). If React also described its
  // children, any later re-render (even one triggered by our own setStats
  // below) would silently overwrite the accept/deny buttons we inject here,
  // since React always re-syncs a node it thinks it owns.
  useEffect(() => {
    if (!outputRef.current) return;
    const container = outputRef.current;
    if (!result) {
      container.innerHTML = "";
      setStats({ total: 0, accepted: 0, denied: 0, pending: 0 });
      return;
    }
    container.innerHTML = result.annotatedHtml;
    const dels = Array.from(container.querySelectorAll("del"));
    let editId = 0;
    dels.forEach((del) => {
      const ins = del.nextElementSibling;
      if (!ins || ins.tagName.toLowerCase() !== "ins") return;
      const id = String(editId++);
      del.setAttribute("data-edit-id", id);
      ins.setAttribute("data-edit-id", id);
      const controls = document.createElement("span");
      controls.className = "edit-controls";
      controls.setAttribute("data-edit-id", id);
      controls.innerHTML =
        '<button type="button" class="edit-btn edit-accept" title="Accept this fix">✓</button>' +
        '<button type="button" class="edit-btn edit-reject" title="Keep original wording">✕</button>';
      ins.after(controls);
    });
    updateStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result]);

  function updateStats() {
    if (!outputRef.current) return;
    const controls = Array.from(outputRef.current.querySelectorAll<HTMLElement>(".edit-controls"));
    const total = controls.length;
    const accepted = controls.filter((c) => c.getAttribute("data-decision") === "accepted").length;
    const denied = controls.filter((c) => c.getAttribute("data-decision") === "denied").length;
    setStats({ total, accepted, denied, pending: total - accepted - denied });
  }

  function resolveEdit(editId: string, decision: "accepted" | "denied") {
    if (!outputRef.current) return;
    const del = outputRef.current.querySelector(`del[data-edit-id="${editId}"]`);
    const ins = outputRef.current.querySelector(`ins[data-edit-id="${editId}"]`);
    const controls = outputRef.current.querySelector(`.edit-controls[data-edit-id="${editId}"]`);
    if (!del || !ins || !controls) return;
    if (decision === "accepted") {
      del.classList.add("edit-resolved-hide");
      ins.classList.remove("edit-resolved-hide");
      ins.classList.add("edit-resolved-plain");
      del.classList.remove("edit-resolved-plain");
    } else {
      ins.classList.add("edit-resolved-hide");
      del.classList.remove("edit-resolved-hide");
      del.classList.add("edit-resolved-plain");
      ins.classList.remove("edit-resolved-plain");
    }
    controls.classList.add("edit-done");
    controls.setAttribute("data-decision", decision);
  }

  function handleOutputClick(e: React.MouseEvent<HTMLDivElement>) {
    const target = e.target as HTMLElement;
    const btn = target.closest(".edit-btn") as HTMLElement | null;
    if (!btn) return;
    const controls = btn.closest(".edit-controls") as HTMLElement | null;
    const editId = controls?.getAttribute("data-edit-id");
    if (editId == null) return;
    resolveEdit(editId, btn.classList.contains("edit-accept") ? "accepted" : "denied");
    updateStats();
  }

  function acceptAllRemaining() {
    if (!outputRef.current) return;
    const pending = Array.from(
      outputRef.current.querySelectorAll<HTMLElement>(".edit-controls:not(.edit-done)")
    );
    pending.forEach((controls) => {
      const editId = controls.getAttribute("data-edit-id");
      if (editId != null) resolveEdit(editId, "accepted");
    });
    updateStats();
  }

  async function handleCheck() {
    const html = inputRef.current?.innerHTML ?? "";
    if (!html.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);
    // A fresh check makes any earlier fact-check / post stale.
    setFactCheck(null);
    setFactError(null);
    setLinkedinPost(null);
    setLinkedinError(null);
    setDrawer(null);
    try {
      const data = await fetchJson("/api/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ html }),
      });
      setResult(data as CheckResult);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong. Try again.");
    } finally {
      setLoading(false);
    }
  }

  // Resolve the live output DOM into final HTML: accepted/pending edits use
  // the fix, denied edits keep the original wording. Reads decisions straight
  // off the DOM so it always matches what's on screen.
  function resolvedHtml(): string {
    if (!outputRef.current) return "";
    const source = outputRef.current;
    const clone = source.cloneNode(true) as HTMLElement;
    clone.querySelectorAll(".edit-controls").forEach((n) => n.remove());
    clone.querySelectorAll("del").forEach((del) => {
      const id = del.getAttribute("data-edit-id");
      const decision = id != null ? source.querySelector(`.edit-controls[data-edit-id="${id}"]`)?.getAttribute("data-decision") : null;
      if (decision === "denied") {
        del.replaceWith(document.createTextNode(del.textContent || ""));
      } else {
        del.remove();
      }
    });
    clone.querySelectorAll("ins").forEach((ins) => {
      const id = ins.getAttribute("data-edit-id");
      const decision = id != null ? source.querySelector(`.edit-controls[data-edit-id="${id}"]`)?.getAttribute("data-decision") : null;
      if (decision === "denied") {
        ins.remove();
      } else {
        ins.replaceWith(document.createTextNode(ins.textContent || ""));
      }
    });
    return clone.innerHTML;
  }

  async function copyForCms() {
    const html = resolvedHtml();
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
    const html = resolvedHtml();
    if (!html.trim()) return;
    await navigator.clipboard.writeText(htmlToText(html));
    flash("plain");
  }

  // Both add-ons work off the article as it currently stands in the output
  // pane (accepted edits applied, denied ones reverted), not the raw paste.
  function currentArticleText(): string {
    return htmlToText(resolvedHtml());
  }

  async function runFactCheck() {
    const text = currentArticleText();
    if (!text) return;
    setFactLoading(true);
    setFactError(null);
    setFactCheck(null);
    try {
      const data = await fetchJson("/api/factcheck", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      setFactCheck(data as FactCheck);
    } catch (e) {
      setFactError(e instanceof Error ? e.message : "The accuracy check failed.");
    } finally {
      setFactLoading(false);
    }
  }

  async function runLinkedin() {
    const text = currentArticleText();
    if (!text) return;
    setLinkedinLoading(true);
    setLinkedinError(null);
    setLinkedinPost(null);
    try {
      const data = await fetchJson("/api/linkedin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      setLinkedinPost(data.post as string);
    } catch (e) {
      setLinkedinError(e instanceof Error ? e.message : "Couldn't generate a post.");
    } finally {
      setLinkedinLoading(false);
    }
  }

  // Opening a tab runs it the first time; reopening just shows what's there.
  function openFact() {
    setDrawer("fact");
    if (!factCheck && !factLoading) runFactCheck();
  }
  function openLinkedin() {
    setDrawer("linkedin");
    if (!linkedinPost && !linkedinLoading) runLinkedin();
  }

  async function copyLinkedin() {
    if (!linkedinPost) return;
    await navigator.clipboard.writeText(linkedinPost);
    flash("linkedin");
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

  let countLabel = "";
  if (result) {
    if (stats.total === 0) countLabel = "No issues found";
    else if (stats.pending === 0) countLabel = "All edits reviewed";
    else countLabel = `${stats.pending} of ${stats.total} edit${stats.total === 1 ? "" : "s"} need review`;
  }

  return (
    <>
      <Masthead />

      <main className={drawer ? "has-drawer" : undefined}>
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
              <span className={`count${result && stats.total > 0 && stats.pending === 0 ? " count-ready" : ""}`}>
                {countLabel}
              </span>
            </div>
            <div className="output-body-wrap">
              {/* Loading overlay is a sibling, not a swap: the ref'd div below
                  must stay mounted at all times so outputRef.current is never
                  null when the decoration effect runs (see effect comment). */}
              {loading && <PastaLoader label="Checking your copy…" />}
              <div
                ref={outputRef}
                className="output-body"
                data-placeholder="Your checked article will appear here. Each fix gets its own ✓ accept / ✕ keep-original buttons."
                onClick={handleOutputClick}
                style={loading ? { display: "none" } : undefined}
              />
            </div>
            <div className="pane-actions">
              {error && <div className="error-banner">{error}</div>}
              <button className="btn-primary" onClick={acceptAllRemaining} disabled={!result || stats.pending === 0}>
                Accept all remaining edits
              </button>
              <button className="btn-ghost" onClick={copyForCms} disabled={!result}>
                Copy for CMS
              </button>
              <button className="btn-ghost" onClick={copyPlainText} disabled={!result}>
                Copy plain text
              </button>
              <button className={`btn-ghost${drawer === "fact" ? " is-open" : ""}`} onClick={openFact} disabled={!result}>
                {factLoading ? "Checking facts…" : "✓ Fact-check"}
              </button>
              <button className={`btn-ghost${drawer === "linkedin" ? " is-open" : ""}`} onClick={openLinkedin} disabled={!result}>
                {linkedinLoading ? "Writing…" : "LinkedIn post"}
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

      {drawer && (
        <aside className="insight-drawer" role="dialog" aria-label={drawer === "fact" ? "Accuracy check" : "LinkedIn post"}>
          <div className="insight-head">
            <div className="insight-tabs">
              <button className={drawer === "fact" ? "active" : ""} onClick={openFact}>
                ✓ Accuracy check
              </button>
              <button className={drawer === "linkedin" ? "active" : ""} onClick={openLinkedin}>
                LinkedIn post
              </button>
            </div>
            <button className="insight-close" onClick={() => setDrawer(null)} aria-label="Close panel">
              ✕
            </button>
          </div>

          <div className="insight-body">
            {drawer === "fact" && (
              <>
                {factLoading && (
                  <PastaLoader label="Checking names, titles and facts against the web… usually 10–30 seconds" />
                )}
                {factError && <div className="error-banner">{factError}</div>}
                {factCheck && (
                  <>
                    <div className={`fact-verdict ${factCheck.issues.length === 0 ? "clear" : "flagged"}`}>
                      <div className="fact-verdict-icon">{factCheck.issues.length === 0 ? "✓" : factCheck.issues.length}</div>
                      <div>
                        <div className="fact-verdict-title">
                          {factCheck.issues.length === 0
                            ? "Nothing flagged"
                            : `${factCheck.issues.length} thing${factCheck.issues.length === 1 ? "" : "s"} to check`}
                        </div>
                        {factCheck.summary && <div className="fact-verdict-sub">{factCheck.summary}</div>}
                      </div>
                    </div>

                    {factCheck.issues.length > 0 && (
                      <ul className="fact-list">
                        {factCheck.issues.map((issue, i) => (
                          <li key={i} className={`fact-item ${issue.confidence}`}>
                            <div className="fact-item-top">
                              <span className="fact-cat">{FACT_CATEGORY_LABELS[issue.category]}</span>
                              <span className="fact-conf">{issue.confidence === "high" ? "Likely error" : "Worth a look"}</span>
                            </div>
                            <div className="fact-excerpt">“{issue.excerpt}”</div>
                            <div className="fact-problem">{issue.problem}</div>
                            {issue.suggestion && <div className="fact-suggestion">→ {issue.suggestion}</div>}
                            {issue.source && (
                              <a className="fact-source" href={issue.source} target="_blank" rel="noopener noreferrer">
                                Source ↗
                              </a>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}

                    {factCheck.confirmed.length > 0 && (
                      <div className="fact-confirmed">
                        <div className="fact-confirmed-title">Checked and confirmed</div>
                        <ul>
                          {factCheck.confirmed.map((c, i) => (
                            <li key={i}>✓ {c}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    <p className="fact-disclaimer">
                      Checked with a few quick web searches on the main people and companies, so it won't cover every
                      name. A second pair of eyes, not a substitute for checking your sources.
                    </p>
                  </>
                )}
                {!factLoading && (factCheck || factError) && (
                  <button className="btn-ghost insight-rerun" onClick={runFactCheck}>
                    Run again
                  </button>
                )}
              </>
            )}

            {drawer === "linkedin" && (
              <>
                {linkedinLoading && <PastaLoader label="Writing a short post…" />}
                {linkedinError && <div className="error-banner">{linkedinError}</div>}
                {linkedinPost !== null && !linkedinLoading && (
                  <>
                    <div className="li-card">
                      <div className="li-card-head">
                        <div className="li-avatar">IE</div>
                        <div>
                          <div className="li-name">InsuranceERM</div>
                          <div className="li-meta">Post preview · edit below before copying</div>
                        </div>
                      </div>
                      <textarea
                        className="li-text"
                        value={linkedinPost}
                        onChange={(e) => setLinkedinPost(e.target.value)}
                        rows={11}
                        aria-label="LinkedIn post text"
                      />
                      <div className="li-count">
                        {linkedinPost.trim() ? linkedinPost.trim().split(/\s+/).length : 0} words
                      </div>
                    </div>
                    <div className="li-actions">
                      <button className="btn-primary li-copy" onClick={copyLinkedin}>
                        {copiedFlag === "linkedin" ? "Copied ✓" : "Copy post"}
                      </button>
                      <button className="btn-ghost" onClick={runLinkedin}>
                        Rewrite
                      </button>
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        </aside>
      )}
    </>
  );
}
