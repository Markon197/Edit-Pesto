# PestoBot

Two tools for InsuranceERM in one app, sharing a masthead and tab nav:

- **Edit** — a final proofing pass on articles before they go to the CMS. Paste a finished, edited article in on the left; get it back on the right with only genuine typos, grammar, spacing and style-guide issues fixed and marked inline — links, bold and italics untouched. Plus five headline options and a copy-ready list of the companies and people mentioned.
- **Calendar** — a shared team calendar of industry events, editorial deadlines and insurer earnings dates, with two AI scan buttons that search the web and propose events to add.

The style guide the Edit tab checks against lives in [`lib/styleGuide.ts`](lib/styleGuide.ts) — edit that file directly to change the rules.

## How it works

**Edit tab**
- `app/page.tsx` — the UI (paste box, diff view, accept-all, copy buttons, headlines/companies/people).
- `app/api/check/route.ts` — the only place that talks to Claude for this tab. Sends the pasted HTML plus the style guide as instructions, gets back the annotated result.
- `lib/styleGuide.ts` — the InsuranceERM style guide and the instructions given to the model.

**Calendar tab**
- `app/calendar/page.tsx` — the UI (month view, upcoming list, add-event form, scan panels, event popup).
- `app/api/events/route.ts` and `app/api/events/[id]/route.ts` — list/create/delete events in the shared database.
- `app/api/scan/events/route.ts` and `app/api/scan/earnings/route.ts` — the two scan buttons. Each calls Claude with web search turned on so results are grounded in real, current data, then filters out anything already on the calendar before returning candidates (nothing is saved until you click **+**).
- `lib/calendarPrompts.ts` — the instructions given to the model for each scan.
- `lib/db.ts` / `lib/events.ts` — the database client and shared types/tag list.

**Shared**
- `components/Masthead.tsx` — logo, version badge, dark-mode toggle, and the Edit/Calendar tabs.
- `middleware.ts` — a simple shared-password gate (`SITE_PASSWORD`) in front of the whole site.

## Local setup

1. Install [Node.js](https://nodejs.org) (LTS) if you don't have it.
2. Install dependencies:
   ```bash
   npm install
   ```
3. `.env.local` already exists with `SITE_PASSWORD=Pasta123`. Open it and replace `ANTHROPIC_API_KEY` with a real key from [console.anthropic.com](https://console.anthropic.com) → API Keys.
4. Run it:
   ```bash
   npm run dev
   ```
   Open http://localhost:3000 — your browser will prompt for a username (anything) and password (`Pasta123`).

## Deploying to Vercel

1. Push this repo to GitHub (see below).
2. Go to [vercel.com/new](https://vercel.com/new), import the repo.
3. Before the first deploy, add two **Environment Variables** in the project settings:
   - `ANTHROPIC_API_KEY` — your real key
   - `SITE_PASSWORD` — `Pasta123` (or change it here any time — no code change needed)
4. Deploy. You'll get a URL like `edit-pesto.vercel.app` — share that with the team. Every push to `main` redeploys automatically.

## Setting up the Calendar tab's database (one-time)

The Calendar tab needs a real database so "everyone sees the same events" actually works — the Edit tab doesn't need this, so skip this section if you only care about Edit.

1. In the Vercel dashboard, open this project → **Storage** tab → **Create Database** → choose **Postgres** (this provisions a Neon-backed Postgres instance).
2. Once created, Vercel automatically connects it to this project and injects the `POSTGRES_*` environment variables — no connection string to copy by hand.
3. Redeploy (Vercel usually prompts you to; if not, trigger a redeploy from the Deployments tab). The `events` table is created automatically the first time the Calendar tab is used — no migration step to run.
4. That's it — open the Calendar tab and it should load (an empty calendar, ready to add to).

If the Calendar tab shows a database error, it almost always means step 1–2 hasn't happened yet for that environment.

## Updating the style guide

Edit the `STYLE_GUIDE` text in [`lib/styleGuide.ts`](lib/styleGuide.ts) and redeploy (or just push to `main` if connected to GitHub). No other code needs to change.

## Notes / limits

- Articles over ~60,000 characters are rejected in one go — split very long pieces.
- The password gate is a single shared password for the whole team, suited to an internal tool — not intended to protect sensitive data.
- The two scan buttons rely on Claude's web search tool, which needs a real, current Anthropic API key with web search available on the account. If a scan errors immediately, that's the first thing to check.
- Event dedup on the scan buttons is a straightforward title match (not fuzzy matching) — an event added under a noticeably different name could still show up again as a "new" suggestion.
