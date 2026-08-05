# Edit Pesto

The final proofing pass for InsuranceERM articles before they go to the CMS. Paste a finished, edited article in on the left; get it back on the right with only genuine typos, grammar, spacing and style-guide issues fixed and marked inline — links, bold and italics untouched. Plus five headline options and a copy-ready list of the companies and people mentioned.

The style guide it checks against lives in [`lib/styleGuide.ts`](lib/styleGuide.ts) — edit that file directly to change the rules.

## How it works

- `app/page.tsx` — the UI (paste box, diff view, accept-all, copy buttons, headlines/companies/people).
- `app/api/check/route.ts` — the only place that talks to Claude. Sends the pasted HTML plus the style guide as instructions, gets back the annotated result.
- `middleware.ts` — a simple shared-password gate (`SITE_PASSWORD`) in front of the whole site.
- `lib/styleGuide.ts` — the InsuranceERM style guide and the instructions given to the model.

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
2. Go to [vercel.com/new](https://vercel.com/new), import the `Edit-Pesto` repo.
3. Before the first deploy, add two **Environment Variables** in the project settings:
   - `ANTHROPIC_API_KEY` — your real key
   - `SITE_PASSWORD` — `Pasta123` (or change it here any time — no code change needed)
4. Deploy. You'll get a URL like `edit-pesto.vercel.app` — share that with the team. Every push to `main` redeploys automatically.

## Updating the style guide

Edit the `STYLE_GUIDE` text in [`lib/styleGuide.ts`](lib/styleGuide.ts) and redeploy (or just push to `main` if connected to GitHub). No other code needs to change.

## Notes / limits

- Articles over ~60,000 characters are rejected in one go — split very long pieces.
- The password gate is a single shared password for the whole team, suited to an internal tool — not intended to protect sensitive data.
