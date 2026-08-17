// Prompt + tool schema for the Earnings report page's "Import coverage"
// feature — same shape as every other Import in this app: no web search,
// just formatting text the user already has (a dump of links, headlines,
// notes copied from search results) into structured candidates the user
// then reviews and adds one by one, exactly like a Calendar scan's results.
export const SUBMIT_PRESS_COVERAGE_TOOL = {
  name: "submit_press_coverage",
  description: "Submit press coverage items extracted from the pasted text/links.",
  input_schema: {
    type: "object" as const,
    properties: {
      items: {
        type: "array",
        items: {
          type: "object",
          properties: {
            outlet: {
              type: "string",
              description: "The publication/outlet name, e.g. 'Bloomberg', 'Reuters'. Infer from the link's domain if not stated explicitly.",
            },
            headline: { type: "string", description: "The article's headline, as given." },
            description: {
              type: "string",
              description:
                "A short one-sentence description — use one if given, or lightly summarise what's actually provided. Don't invent detail that isn't there.",
            },
            link: { type: "string", description: "The article's URL." },
          },
          required: ["outlet", "headline", "link"],
        },
      },
    },
    required: ["items"],
  },
};

export function buildPressCoveragePrompt(company: string, period: string, rawText: string): string {
  return `You are helping InsuranceERM's editorial team catalogue press coverage of an earnings report — ${company}, ${period}. The text below is a dump the editor collected: links, headlines, notes, maybe copied search results.

Extract every distinct article mentioned: the outlet (infer from the link's domain if the text doesn't name it), the headline, a short one-sentence description if one is given or can be lightly drawn from what's actually there, and the URL. If the same link appears more than once, only include it once.

Never invent a headline, outlet, or description that isn't actually derivable from the text. If nothing resembling a real article is in the text, submit an empty list rather than forcing something in.

Submit your findings only via the submit_press_coverage tool, no other commentary.

--- PASTED TEXT START ---
${rawText}
--- PASTED TEXT END ---`;
}
