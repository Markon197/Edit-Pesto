// Prompts + tool schemas for the Calendar tab's AI features: two scans that
// use Claude's server-side web_search tool so results are grounded in
// current, real data (event dates and earnings calendars change every
// year), plus an import prompt that formats text the user already has in
// hand and needs no search at all.

// max_uses caps how many searches Claude can run in a single scan. Without
// it, the model has no reason to be economical — on the earnings scan in
// particular, it was searching for each company individually rather than
// using a handful of broad queries, which is what actually burned through
// the API credits (99 searches across ~5 scans, ~20/scan). Capped low
// enough to force efficient, broad queries; the prompts below also ask for
// that explicitly so quality doesn't just degrade to "fewer results."
export function webSearchTool(maxUses: number) {
  return {
    type: "web_search_20250305",
    name: "web_search",
    max_uses: maxUses,
  };
}

export const SUBMIT_EVENTS_TOOL = {
  name: "submit_events",
  description: "Submit the upcoming insurance industry events found via research.",
  input_schema: {
    type: "object" as const,
    properties: {
      events: {
        type: "array",
        items: {
          type: "object",
          properties: {
            title: { type: "string" },
            startDate: { type: "string", description: "YYYY-MM-DD" },
            endDate: {
              type: "string",
              description: "YYYY-MM-DD, only if the event spans multiple days; omit otherwise",
            },
            time: {
              type: "string",
              description: "HH:MM in 24-hour time, only if a specific start time was found; omit otherwise",
            },
            location: { type: "string" },
            description: { type: "string", description: "One factual sentence." },
            link: { type: "string", description: "The event's official page, if found." },
          },
          required: ["title", "startDate", "description"],
        },
      },
    },
    required: ["events"],
  },
};

export const SUBMIT_EARNINGS_TOOL = {
  name: "submit_earnings",
  description: "Submit the insurance-sector earnings dates found via research.",
  input_schema: {
    type: "object" as const,
    properties: {
      earnings: {
        type: "array",
        items: {
          type: "object",
          properties: {
            company: { type: "string" },
            date: { type: "string", description: "YYYY-MM-DD" },
            time: {
              type: "string",
              description: "HH:MM in 24-hour time, only if a specific report time was found (e.g. before market open); omit otherwise",
            },
            description: {
              type: "string",
              description: "E.g. 'H1 2026 results' or 'Q3 2026 results'.",
            },
            link: { type: "string", description: "The company's investor relations page, if found." },
          },
          required: ["company", "date", "description"],
        },
      },
    },
    required: ["earnings"],
  },
};

export const SUBMIT_IMPORT_TOOL = {
  name: "submit_import",
  description: "Submit the calendar events extracted and formatted from the pasted text.",
  input_schema: {
    type: "object" as const,
    properties: {
      events: {
        type: "array",
        items: {
          type: "object",
          properties: {
            title: { type: "string" },
            tag: {
              type: "string",
              enum: ["event", "earnings", "editorial", "holiday"],
              description:
                "Best-fitting category: 'event' (industry conference/gathering), 'earnings' (a company results date), 'editorial' (an internal deadline/publishing date), 'holiday' (a public holiday).",
            },
            startDate: { type: "string", description: "YYYY-MM-DD" },
            endDate: {
              type: "string",
              description: "YYYY-MM-DD, only if it spans multiple days; omit otherwise",
            },
            time: {
              type: "string",
              description: "HH:MM in 24-hour time, only if the text actually gives one; omit otherwise",
            },
            description: {
              type: "string",
              description: "One factual sentence drawn from the text — don't invent detail that isn't there.",
            },
            link: { type: "string", description: "A URL, only if one is present in the text for this item." },
          },
          required: ["title", "tag", "startDate", "description"],
        },
      },
    },
    required: ["events"],
  },
};

function focusLine(focus: string): string {
  return focus ? `\n\nThe person running this search asked you to specifically focus on: "${focus}". Weight your search toward that, but stay within the rules above.` : "";
}

export function buildEventsScanPrompt(todayISO: string, existingTitles: string[], focus = ""): string {
  const exclude = existingTitles.length ? existingTitles.join("; ") : "(nothing yet — the calendar is empty)";
  return `You are researching upcoming insurance industry events for InsuranceERM, a trade publication whose audience is UK/Europe-weighted but globally aware. Today's date is ${todayISO}.

Search the web and find at least 5 upcoming conferences, summits, or industry gatherings relevant to insurance and reinsurance professionals over the next 9 months from today. Prioritise events relevant to a UK/European audience (e.g. Monte Carlo Rendez-Vous, Baden-Baden Meeting, Dive In Festival, Insurtech Insights, British Insurance Awards) but also include major international events when they're significant enough to matter to this audience (e.g. ICA, APIF, RIMS, major regulator conferences in Asia or North America).

You have a limited number of searches (about 4) — spend them on broad queries that surface several events at once (e.g. "insurance industry conferences 2026 2027", "reinsurance conferences UK Europe 2026") rather than one search per event. Only search individually for a specific event's exact dates if a broad search didn't already give you one. Work quickly — this has a hard time limit, so don't spend extra turns double-checking things a broad search already answered well enough.

Do not include any of the following — they are already on the calendar: ${exclude}

For each event, give an exact start date (and end date if it spans multiple days) in YYYY-MM-DD, a one-sentence factual description, and a link to the event's official page if you found one. Include a start time (HH:MM, 24-hour) only if one turned up naturally in what you already found — don't spend an extra search chasing it down. Only include events you found real, current evidence for — do not guess a date.${focusLine(focus)}

Submit your findings only via the submit_events tool, no other commentary.`;
}

export function buildEarningsScanPrompt(
  todayISO: string,
  windowEndISO: string,
  existingKeys: string[],
  focus = ""
): string {
  const exclude = existingKeys.length ? existingKeys.join("; ") : "(nothing yet)";
  return `You are researching insurance-sector earnings dates for InsuranceERM. Today's date is ${todayISO}.

Find major insurance and reinsurance companies relevant to a UK/European trade audience (e.g. Aviva, Zurich, Allianz, AXA, Munich Re, Swiss Re, Beazley, Hiscox, Lloyd's market participants, Prudential, Legal & General, Chubb, and other large listed insurers when relevant) that are scheduled to report earnings between ${todayISO} and ${windowEndISO} inclusive — a strict two-week window. Do not include anything reporting outside that window, even if it's close.

You have a limited number of searches (about 3) — do NOT search for each company individually. Instead use broad queries first (e.g. "insurance company earnings calendar this week", "insurer results dates ${todayISO.slice(0, 7)}") to find several at once, and only fall back to a single company-specific search if one broad result looks promising but needs confirming. Work quickly — this has a hard time limit, so don't spend extra turns double-checking things a broad search already answered well enough.

Do not include any of the following — they are already on the calendar: ${exclude}

For each, give the company name, the exact reporting date in YYYY-MM-DD, a short description (e.g. "H1 2026 results" or "Q3 2026 results" — the results themselves, not the analyst call, since the call is same-day), and a link to their investor relations page if found. Include a report time (HH:MM, 24-hour) only if one turned up naturally in what you already found — don't spend an extra search chasing it down. Only include companies you found real, current evidence for. If nothing qualifies in this window, submit an empty list rather than including anything outside it.${focusLine(focus)}

Submit your findings only via the submit_earnings tool, no other commentary.`;
}

// No web_search involved — this is pure extraction/formatting of text the
// user already has in hand (a press release, an AI-generated list, a copied
// table, rough notes), so it's fast and cheap compared to the two scans
// above, and immune to their web-search timeout risk.
export function buildImportPrompt(todayISO: string, rawText: string, existingTitles: string[]): string {
  const exclude = existingTitles.length ? existingTitles.join("; ") : "(nothing yet)";
  return `You are helping InsuranceERM's editorial team import events into their calendar from pasted text — which might be a press release, an AI-generated list, a copied table, or rough notes. Today's date is ${todayISO}.

Read the text below and extract EVERY distinct dated event, earnings date, editorial deadline, or holiday it mentions — there is no cap and no target count. If it contains 3, submit 3; if it contains 80, submit all 80. Do not stop early, sample, or only return "the top few" — the whole point is to save the person reading this from typing in each one by hand, so a partial list defeats the purpose. For each one:
- Give an exact date in YYYY-MM-DD. If the text gives a relative date (e.g. "next Tuesday", "in three weeks"), work it out from today's date. Never invent a date that isn't stated or clearly computable from what's given.
- Pick the best-fitting tag: "event" (industry conference/gathering), "earnings" (a company results date), "editorial" (an internal deadline/publishing date), or "holiday" (a public holiday).
- Include a start time (HH:MM, 24-hour) only if the text actually gives one.
- Write a one-sentence factual description drawn from the text — don't pad it with invented detail.
- Include a link only if a URL is actually present in the text for that item.

Do not include any of the following — they are already on the calendar: ${exclude}

If the text contains nothing resembling a dated event, submit an empty list rather than forcing something in. Submit your findings only via the submit_import tool, no other commentary.

--- PASTED TEXT START ---
${rawText}
--- PASTED TEXT END ---`;
}
