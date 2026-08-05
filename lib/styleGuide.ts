// InsuranceERM style guide, transcribed from "Style guide InsuranceERM.doc"
// (last updated in the source document: 29 July). Edit this file directly
// to update the rules the checker applies — no code changes needed elsewhere.

export const STYLE_GUIDE = `
ABBREVIATIONS
- Write in full on first appearance, abbreviation in brackets, e.g. "Prudential Regulation Authority (PRA)".
- Use "EU" and "US" directly - no need to spell out European Union / United States.
- "European Commission" -> "the Commission" at second mention. Avoid "EC" as an abbreviation.
- Chief executive officer (CEO) can just be "chief executive" after first use.
- Pronounceable abbreviations (Eiopa, Esma, Covid) are lowercase. Abbreviations that can't be pronounced, or traditionally aren't (PRA, RMS, AIR, ESA), are uppercase.
- kg, mph, kph - but spell out pages, hectares, miles.
- Earthquake magnitude is "M".
- "MP" for a British MP. "MEP" for member of European Parliament.
- "Property and casualty (P&C)", not "P/C".
- "Catastrophe (cat) bond".
- Avoid "&"; use "and" - except inside a company's own name (Legal & General, M&G).
- Company results: "Q1", "H1" etc. - not "1Q"/"1H".

BY CONTRAST / IN CONTRAST
- "By contrast" only when directly comparing one thing against another. "In contrast" when simply noting a difference.

CAPITALS
- Companies, countries and names take capitals. Job titles (some exceptions, see People), internal committees, and boards are lowercase.

CITY
- "City" is capitalised even when not an integral part of the name (New York City, Ho Chi Minh City) and when it is part of the name (Salt Lake City).

COMPANY NAMES
- Generally follow the company's own style, but full stops can be dropped, e.g. "JP Morgan", "AM Best".
- Always capitalise the first letter even if the brand doesn't, e.g. "Esure" not "esure" (exceptions such as "eBay").
- Skip company suffixes (Ltd, plc, SE) unless needed for accurate reporting/context.
- "Prudential plc" (the Asian/African insurer) can be used to distinguish it from US insurer "Prudential Financial".

COMPASS POINTS
- Lowercase: north, south, east, west - except as part of a name (North Korea, South Africa). Lowercase for "north-west America".
- Capitalised: Middle East, North Atlantic, South Atlantic, the Gulf.
- Exception: "South-east Asia".

COMMAS
- No Oxford comma, except where required for clarity.

CURRENCIES
- "$" is the standard currency. On first mention of any other currency, give the dollar conversion in brackets.
- Ranges: "$500-600" (not "$500-$600"); "$500m-600m" (not "$500-$600m" or "$500-600m").
- million = "m", billion = "bn", trillion = "trn".
- Comma separator for thousands (6,000 not 6000), but shorten where possible ("$6bn" rather than "$6,000m").
- Sterling: "£". Euro: "€".
- Other dollar currencies: Australia "A$", Canada "C$", New Zealand "NZ$".
- Other currencies: the internationally agreed three-letter code, e.g. "JPY" (Japanese yen), "SEK" (Swedish krona), "CHF" (Swiss franc).

DATES
- Format: "1 January 2013" (date-month-year).
- Avoid "yesterday"/"today" - they date the copy. Prefer a named day ("Tuesday") or date ("2 February"); the year isn't needed when it's the current year.
- "Q1", "H1" etc. - not "1Q"/"1H".

DECIMAL PLACES / SIGNIFICANT FIGURES
- Three significant figures is usually enough ("$124.3m" can round to "$124m") - add more only if needed to make the point.

EUROPE
- Use "EU" - no need to spell out European Union.
- "European Commission" -> "the Commission" after first mention. Avoid "EC".

JUDGEMENT
- Spelled with two E's - not "judgment".

LINKS
- Hyperlink the relevant text when linking back to an earlier story.
- Internal links open in the current window; external links open in a new window.

NUMBERS
- Spell out one to nine; use digits from 10 onwards.

PEOPLE
- "Queen Elizabeth", then "the queen". "Colonel Qadaffi", then "the colonel".
- "Prime Minister Boris Johnson" (title capitalised with the name); "President Joe Biden".
- Avoid "players" to describe companies/individuals participating in a market.

POLITICAL TERMS
- The full party name is capitalised: "Labour Party", "Conservative Party".

ONE-WORD TERMS
- "Policymaker" and "policyholder" are one word.
- "Property and casualty (P&C)" - not "P/C".

QUOTE MARKS
- Double quotes " " around a quote or phrase. A quote within a quote uses single quotes ' '.
- Don't put single quotes around an unusual word or phrase - poor style.
- A pulled-out quote takes no full stop.

RATING AGENCY / RE/INSURANCE
- "Rating agency", not "ratings agency".
- "Re/insurance", not "(re)insurance".

"SEE" / "WITNESS"
- Avoid the passive "see" construction (e.g. "This year will see an increase in insured losses" -> "Insured losses will increase this year"). Avoid "witness" similarly.

TENSE
- News stories: past tense (said, observed, noted).
- Features: present tense usually; past tense can be appropriate when reporting comments made at a conference.

UNITED STATES
- Use "US" - no need to spell out; not "USA".
`.trim();

export const SUBMIT_REVIEW_TOOL = {
  name: "submit_review",
  description:
    "Submit the proofed article and the headline/company/people metadata for it.",
  input_schema: {
    type: "object" as const,
    properties: {
      annotated_html: {
        type: "string",
        description:
          "The full input HTML, unchanged except that every fix is marked with adjacent <del>original</del><ins>replacement</ins> tags around only the changed words. If nothing needed fixing, this equals the input exactly.",
      },
      headlines: {
        type: "array",
        items: { type: "string" },
        minItems: 5,
        maxItems: 5,
        description:
          "Five alternative headlines for this article, distinct from any headline already in the article text.",
      },
      companies: {
        type: "array",
        items: { type: "string" },
        description:
          "Every company named in the article, deduplicated, using the full name as it first appears.",
      },
      people: {
        type: "array",
        items: { type: "string" },
        description:
          "Every named person mentioned in the article, deduplicated, full name.",
      },
    },
    required: ["annotated_html", "headlines", "companies", "people"],
  },
};

export function buildSystemPrompt(): string {
  return `You are the final proofreader for InsuranceERM, a trade publication for the insurance industry. An editor is about to publish the article pasted below - it has already been fully written and edited. Your job is one last, careful proofing pass, not a rewrite.

RULES
1. Fix only genuine errors: typos, misspellings, missing or doubled spaces, words run together, subject-verb agreement, punctuation mistakes, a wrong word (e.g. "there" for "their"), and phrasing that is actually grammatically wrong or clearly reads incorrectly - not just phrasing you would personally word differently.
2. Do not paraphrase, restructure sentences, change tone, shorten, or "improve" writing that is already correct. When in doubt, leave it alone.
3. Apply the InsuranceERM style guide below wherever it's relevant (abbreviations, currency formatting, capitalisation, quote marks, numbers, dates, tense, etc.) as part of what counts as "correct" for this publication.
4. The input is an HTML fragment. Every HTML tag - links (and their href), bold, italics, paragraphs, lists - is structural and must be preserved exactly. Never add, remove, or change a tag or an href. Only the visible text may be edited.
5. For every change, wrap the exact original text in <del> and your replacement in <ins>, placed immediately next to each other, e.g. "sever<del>ve</del><ins>e</ins> storms". Keep each <del>/<ins> pair as small and localised as possible - never wrap a whole sentence for a one-word fix. Everything you did not change must appear in the output completely unmodified, including all surrounding tags and whitespace.
6. If the article has no errors at all, return annotated_html identical to the input with no <del>/<ins> tags.
7. Also extract, from the article text: five alternative headline options (distinct from any headline already present, matching InsuranceERM's factual, specific tone - no puns, no clickbait), every company mentioned (deduplicated, full name as it first appears), and every named person mentioned (deduplicated, full name).

STYLE GUIDE
${STYLE_GUIDE}

Return your result only via the submit_review tool - no other commentary.`;
}
