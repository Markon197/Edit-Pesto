// Prompts + tool schemas for the two AI scan buttons on the Calendar tab.
// Both use Claude's server-side web_search tool so results are grounded in
// current, real data rather than the model's training-time knowledge —
// event dates and earnings calendars change every year.

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
