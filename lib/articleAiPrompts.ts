// Prompts + tool schemas for the Edit tab's two quick add-ons: a cheap
// accuracy check and a short LinkedIn post. Both run on Haiku (the
// cheapest model) with no web search — that's what keeps them at a
// fraction of a cent per article, and it's also why the fact-check is
// honest about what it can and can't do (see the prompt).
export const QUICK_MODEL = "claude-haiku-4-5-20251001";

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
            confidence: {
              type: "string",
              enum: ["high", "medium"],
              description: "high = you're confident it's an error; medium = worth a second look.",
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

Important limits — be honest about them:
- You have NO web access. You only know what you already know. Your knowledge ends before today, so events, appointments and results from recent months may be entirely unknown to you.
- Do NOT flag something just because you don't recognise it, and do NOT assume a person has kept an old job — people change roles. Only flag a name/title/fact when you have solid, specific reason to think it's wrong, or when the article contradicts itself.
- Use "high" confidence only when you're sure; "medium" for a real but unverified concern. If nothing meets that bar, return an empty issues list. Fewer, better findings beat a long list of guesses.
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
      post: { type: "string", description: "The complete post, ready to paste. Plain text, blank lines between paragraphs." },
    },
    required: ["post"],
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

Submit only via the submit_linkedin_post tool.

--- ARTICLE START ---
${articleText}
--- ARTICLE END ---`;
}
