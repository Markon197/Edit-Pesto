// Prompt + tool schema for the Earnings hub's Import feature. Same shape as
// the Calendar's Import (lib/calendarPrompts.ts's buildImportPrompt): no
// web search, just extraction/formatting of text the user already has in
// hand — a press release, an AI-generated summary, whatever. Fast, cheap,
// and immune to the web-search scans' timeout risk.
export const SUBMIT_EARNINGS_REPORT_TOOL = {
  name: "submit_earnings_report",
  description: "Submit the structured earnings report extracted from the pasted text.",
  input_schema: {
    type: "object" as const,
    properties: {
      company: { type: "string", description: "The company name, e.g. 'Zurich Insurance Group'." },
      period: { type: "string", description: "The reporting period, e.g. 'H1 2026', 'Q3 2026', 'FY2025'." },
      reportDate: { type: "string", description: "YYYY-MM-DD, the date results were announced, only if stated." },
      ticker: { type: "string", description: "Stock ticker/exchange code, only if given or unambiguous." },
      metrics: {
        type: "array",
        description:
          "Comparable financial metrics found in the text. For insurers, prioritise: gross written premium, net income/profit, combined ratio (P&C insurers only — most life insurers don't report one), solvency ratio, return on equity. Include other metrics the text emphasises too.",
        items: {
          type: "object",
          properties: {
            label: { type: "string", description: "e.g. 'Net income', 'Combined ratio', 'Solvency II ratio'." },
            current: { type: "string", description: "Current period's value, exactly as stated, unit included — e.g. '€1.2bn', '94.5%'." },
            priorYear: { type: "string", description: "Prior-year comparison value — only if the text actually states one." },
            change: {
              type: "string",
              description:
                "Change vs prior year — only if the text states it directly, or it's a plain computation from the two values given. Never estimate one that isn't there.",
            },
          },
          required: ["label", "current"],
        },
      },
      takeaways: {
        type: "array",
        description: "3-5 short, factual key-takeaway bullet points — highlights, not a restatement of the metrics table.",
        items: { type: "string" },
      },
      officialLink: { type: "string", description: "Link to the official release/results page, only if present in the text." },
      earningsCallLink: { type: "string", description: "Link to the earnings call webcast/transcript, only if present." },
    },
    required: ["company", "period", "metrics", "takeaways"],
  },
};

export function buildEarningsReportPrompt(rawText: string): string {
  return `You are helping InsuranceERM's editorial team turn a press release or other source text into a structured earnings report.

Read the text below and extract:
- The company name and reporting period (e.g. "H1 2026", "Q3 2026", "FY2025").
- The report/announcement date, only if stated.
- The stock ticker, only if given or unambiguous from the company name.
- Financial metrics — prioritise ones genuinely comparable across insurers where the text gives them: gross written premium, net income/profit, combined ratio (property & casualty insurers only — don't force one onto a life insurer that doesn't report it), solvency ratio, return on equity. Include any other metric the text itself emphasises too. For each: the current period's value exactly as stated (currency/unit included), the prior-year value only if the text actually states one, and the change only if the text states it directly or it's a plain computation from the two values given — never estimate or invent a comparison that isn't actually there.
- 3-5 short, factual key-takeaway bullet points — highlights an editor would lead with, not a restatement of every number already in the metrics table.
- A link to the official release and to the earnings call, only if either is actually present in the text.

Never invent a number, a date, or a comparison that isn't in the text. If a common metric genuinely isn't mentioned, leave it out rather than guessing at it.

Submit your findings only via the submit_earnings_report tool, no other commentary.

--- PASTED TEXT START ---
${rawText}
--- PASTED TEXT END ---`;
}
