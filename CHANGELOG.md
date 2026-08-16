# Changelog

Every shipped change bumps `APP_VERSION` in [lib/version.ts](lib/version.ts) (shown in the masthead) and gets a line here, so it's obvious at a glance whether the live site reflects the latest request.

## Version 6 — 2026-08-05
- Scan buttons now show a pasta-bowl loading animation while running, and turn into a **Stop scan** button — pressing it cancels the request all the way through to the Claude call, so an accidental press doesn't burn tokens.
- Calendar redesign: multi-day events render as one spanning bar across the days they cover (Google Calendar-style) instead of a dot repeated per day; single-day events show their title directly in the grid, not just a colored dot.
- Added a 4th tag, **Bank Holiday**, plus an "Add UK bank holidays" button — pulls straight from gov.uk's own data (no AI needed), for today through the end of next year.
- Event popups now have an **Export .ics** button — downloads a file that opens directly in Outlook, Google Calendar, or Apple Calendar.
- New hidden `/stats` page (not linked anywhere, same site password) showing usage counts: Edit checks, and each scan type, with a recent-activity log.
- More color variety: Bank Holiday's burgundy plus a warm gold "today" highlight, moving past the navy/cream-only palette.

## Version 5 — 2026-08-05
- Fixed the masthead/tabs/content width mismatch — all three now line up at the same (wider) 1600px column, with full-width colored bars behind the masthead and tabs.
- Made the Edit/Calendar tabs noticeably bigger and easier to spot.
- Much clearer error messages when the Calendar tab's database isn't connected yet — spells out the exact Vercel steps right in the banner instead of a generic "check the README."
- Scan failures now distinguish a database problem from a search problem, so the error you see actually points at what broke.

## Version 4 — 2026-08-05
- New **Calendar** tab, next to Edit, sharing one masthead/nav.
- Month view + upcoming list, backed by a real shared database (Vercel Postgres via Neon) — every event anyone adds or approves is visible to everyone.
- **Add event** with a tag (Industry event / Earnings / Editorial).
- **Scan insurance events** — web-search-grounded Claude call, finds 5+ upcoming industry events, skips anything already on the calendar, "+" to approve each one.
- **Scan earnings calendar** — same mechanism, scoped to insurers reporting in the next two weeks only (clearly labeled), skips duplicates.
- Click any event (grid or list) for a short detail popup with a delete button.
- **Needs setup before this works**: provision the database (see README) and add its connection env vars in Vercel.

## Version 3 — 2026-08-05
- Dark mode shows a small italic "Nut Free" label next to the logo (pesto usually has pine nuts) — a dark-mode-only easter egg.
- Stronger contrast on the accepted-edit (green/bold) highlight color in both themes, so it reads more clearly against normal body text.

## Version 2 — 2026-08-05
- Added a small hover animation on the masthead logo (the leaf antenna perks up).
- Removed "InsuranceERM" and the "concept mockup" caveat from the tagline.
- Added a manual dark-mode toggle in the masthead (defaults to light, remembers your choice via localStorage, no flash on reload).

## Version 1 — 2026-08-05
- Editorial redesign: light paper background, serif typography (Georgia/Times New Roman), restrained hairline borders instead of card shadows/neon accents.
- Renamed the product to **PestoBot**; new robot logomark in the masthead (the browser-tab favicon is unchanged, by request).
- Added a small animation (steaming bowl) in the output pane while a check is running.
- Added the version number itself, shown next to the wordmark.
