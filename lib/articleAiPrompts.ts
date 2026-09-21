// Prompts + tool schemas for the Edit tab's two quick add-ons: an accuracy
// check and a short LinkedIn post. Both run on Haiku (the cheapest model).
// The LinkedIn post uses no web search at all. The accuracy check gets a
// small, hard-capped web search budget (FACT_CHECK_MAX_SEARCHES) — names
// and job titles are exactly the kind of thing that changes, so the
// model's own memory isn't enough — but the cap is what stops it turning
// into the expensive open-ended research the earlier calendar scans did.
export const QUICK_MODEL = "claude-haiku-4-5-20251001";

export const FACT_CHECK_MAX_SEARCHES = 3;

// Long enough for any real article, short enough to cap the cost of one
// runaway paste.
export const MAX_ARTICLE_CHARS = 30000;

export const SUBMIT_FACT_CHECK_TOOL = {
  name: "submit_fact_check",
  description: "Submit the accuracy-check findings for the article.",
  input_schema: {
    type: "object" as const,
    properties: {
      summary: {
        type: "string",
        description: "One short sentence: the overall read, e.g. 'Two names worth double-checking, nothing else stood out.'",
      },
      confirmed: {
        type: "array",
        description:
          "Up to 6 short lines for people/companies you actually verified as correct via search, e.g. 'Jane Smith — CEO, Acme Re (company site)'. Only things genuinely confirmed, so the editor can see what was checked. Empty if none.",
        items: { type: "string" },
      },
      issues: {
        type: "array",
        description: "Only genuine, well-founded concerns. Empty if nothing qualifies. At most 8.",
        items: {
          type: "object",
          properties: {
            excerpt: { type: "string", description: "The exact words from the article this is about, kept short." },
            category: {
              type: "string",
              enum: ["name", "title_or_role", "company", "fact", "inconsistency"],
              description:
                "name = a person's name looks misspelled; title_or_role = a job title/position looks wrong; company = a company name/spelling/detail looks wrong; fact = a general factual claim looks wrong; inconsistency = the article contradicts itself (e.g. the same person spelled or titled two ways).",
            },
            problem: { type: "string", description: "What looks wrong, in one plain sentence." },
            suggestion: { type: "string", description: "What it should probably say, or what to verify. Empty if unsure." },
            source: {
              type: "string",
              description: "URL of the page that supports your concern, if a search found one. Empty otherwise.",
            },
            confidence: {
              type: "string",
              enum: ["high", "medium"],
              description:
                "high = a search or the article itself clearly shows it's wrong; medium = a real discrepancy you couldn't fully resolve.",
            },
          },
          required: ["excerpt", "category", "problem", "confidence"],
        },
      },
    },
    required: ["summary", "issues"],
  },
};

export function buildFactCheckPrompt(articleText: string, todayISO: string): string {
  return `You are giving an insurance-trade editor a quick accuracy check of a finished article before it publishes. Today's date is ${todayISO}.

Check, in this order of priority:
1. People — names spelled correctly, and job titles/positions plausible for that person and company.
2. Companies and organisations — names and spellings correct (Zurich, Munich Re, Lloyd's of London, Aviva, AXA, etc.), and any stated detail about them (HQ, what they do, ownership) right.
3. General factual claims stated by the writer — NOT statements inside direct quotes, which are the speaker's own words (still check a quoted speaker's name and title).
4. Internal consistency — the same person or company spelled, titled or described differently in different places within the article. This is the most reliable check you have, so do it carefully.

You have a web search tool, but a HARD budget of ${FACT_CHECK_MAX_SEARCHES} searches — use them well:
- Search only for what actually needs it: the most important people named WITH a job title (verify their name spelling and CURRENT role at that company), and any company or figure you genuinely doubt. Job titles and appointments change, and your own memory ends before today, so this is what search is for.
- Don't search for well-known, stable facts you already know, and don't spend a search on someone with no title or claim attached. Combine people into one query where sensible (e.g. two executives at the same company).
- Prefer authoritative sources: the company's own site or press release, reputable trade press.
- Work quickly — don't run searches just to double-check things already settled.

Judging what you find:
- If a search clearly shows a name is misspelled or a title is out of date, that's a "high" issue — give the source URL and the corrected wording.
- If a search is inconclusive or you simply couldn't find the person, do NOT flag it as an error; at most raise it as "medium" saying it couldn't be verified. Never flag something just because you don't recognise it.
- Things you confirmed go in "confirmed" so the editor can see what was checked.
- If nothing meets the bar, return an empty issues list. Fewer, better findings beat a long list of guesses.
- Use British spelling in your own wording.

Submit only via the submit_fact_check tool.

--- ARTICLE START ---
${articleText}
--- ARTICLE END ---`;
}

export const SUBMIT_LINKEDIN_POST_TOOL = {
  name: "submit_linkedin_post",
  description: "Submit the finished LinkedIn post text.",
  input_schema: {
    type: "object" as const,
    properties: {
      post: { type: "string", description: "The complete post, ready to paste. Plain text, blank lines between paragraphs. People and companies are written as @Full Name / @Company Name." },
      mentions: {
        type: "array",
        description: "Every person and company written with an @ in the post, exactly as spelled after the @.",
        items: {
          type: "object",
          properties: {
            name: { type: "string", description: "The name exactly as written after the @ in the post." },
            kind: { type: "string", enum: ["person", "company"] },
          },
          required: ["name", "kind"],
        },
      },
    },
    required: ["post", "mentions"],
  },
};

export function buildLinkedInPrompt(articleText: string): string {
  return `Write a very short LinkedIn post promoting this InsuranceERM article.

Rules:
- 45 to 80 words total. Short punchy lines, blank line between them.
- Line one is the hook — the single most interesting fact or angle, stated plainly. No clickbait, no "You won't believe".
- Only use facts, names and figures that are actually in the article. Never invent a statistic, quote or claim.
- Professional, confident, British spelling. No emojis. No "excited to share".
- Finish with one short line pointing readers to the full story, then at most 3 relevant hashtags (e.g. #Insurance #Reinsurance) on the last line.
- Do not include a URL or a placeholder for one.
- Tag the people and companies the story is about. Write each as @Full Name or @Company Name (e.g. @Jane Smith, @Lloyd's), using the spelling in the article. Tag at most 4, prioritising the main subject, and only tag a person if the article gives their full name. Do not tag the same one twice. Then list every tag in "mentions".

Submit only via the submit_linkedin_post tool.

--- ARTICLE START ---
${articleText}
--- ARTICLE END ---`;
}
