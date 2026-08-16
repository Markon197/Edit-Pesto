# Changelog

Every shipped change bumps `APP_VERSION` in [lib/version.ts](lib/version.ts) (shown in the masthead) and gets a line here, so it's obvious at a glance whether the live site reflects the latest request.

## Version 10 — 2026-08-16
- **Fixed a crash on scan errors**: if a scan request ever came back as a non-JSON response (e.g. a Vercel timeout page), the app tried to `JSON.parse` it directly and threw an ugly, uncaught error. All fetches (Edit tab, Calendar, Stats) now go through a shared `fetchJson` helper that reads the response safely first and always surfaces a clean, readable error message instead of crashing.
- **Fixed the calendar's grid lines**: the vertical lines between day columns were only drawing next to the date number, not running the full height of the week row, so the grid looked broken/incomplete. They now run edge-to-edge like a proper spreadsheet or Google Calendar.
- Calendar rows are taller again for more breathing room.
- Upcoming list now shows the next 7 events and scrolls for the rest, plus a **See all** button that opens the full, scrollable list of every event on the calendar.

## Version 9 — 2026-08-16
- Calendar grid is now truly fixed-size, like Google Calendar's month view: always exactly 6 week rows, each exactly the same height, regardless of how many events are in a given week (busy weeks show up to 2 event bars + a "+N more" instead of growing taller). Verified two months — one packed with events, one empty — render at the exact same pixel height.
- The Upcoming list now automatically matches that same fixed height, instead of stretching to whatever the calendar happened to need that month.
- Finished scan results can be minimized (▾/▸, collapses back to just the header) or dismissed entirely (✕) — no more losing calendar real estate to a scan you're done reviewing.

## Version 8 — 2026-08-16
- **Cost fix**: the web_search tool had no cap on how many searches Claude could run per scan — the earnings prompt in particular listed a dozen companies by name, which likely pushed it to search each one individually (~20 searches per scan observed). Added `max_uses` (6 for events, 5 for earnings) and rewrote both prompts to explicitly ask for a few broad queries instead of one-per-item.

## Version 7 — 2026-08-05
- **Fixed the scan buttons** — likely regression from Version 6's "cancel the upstream call on Stop" change (removed it; Stop still stops your own wait immediately, just doesn't guarantee cutting the server-side call short anymore). If scans still fail after this, the exact error text from Vercel's function logs is what I need to go further.
- Calendar rows are noticeably roomier now (taller, more like an ordinary month calendar), while keeping the bar-based rendering.
- The Upcoming list now always matches the calendar's height exactly (equal-height panes), instead of shrinking to its own content.
- Event popups have an **Edit** button — change the title, tag, dates, description, or link on any event, including ones added by a scan.
- The three scan buttons are now one **🔍 Scan…** button with a dropdown (Industry events / Earnings calendar / UK bank holidays).
- The two AI scans now ask first: an optional "anything specific to focus on?" step (e.g. a country, a company) before running — bank holidays skips this since there's nothing to customize.

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
