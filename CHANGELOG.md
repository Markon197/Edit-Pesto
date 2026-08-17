# Changelog

Every shipped change bumps `APP_VERSION` in [lib/version.ts](lib/version.ts) (shown in the masthead) and gets a line here, so it's obvious at a glance whether the live site reflects the latest request.

## Version 22 — 2026-08-18
- **Formatting fixes**: negative values now use a plain minus sign, never accounting-style parentheses; currency shows as a symbol ($, €, £, ¥), never a 3-letter code (USD/EUR/GBP). Both enforced in the extraction prompt and backstopped by a normalizer on the way in, in case the model doesn't fully comply.
- **Specific period comparisons**: reports now carry an explicit "prior period" (e.g. "H1 2025" for an "H1 2026" report), extracted from the text rather than a generic "prior year" label — every comparison names exactly what it's being measured against.
- **Up/down arrows**: every metric's change now shows ↑ or ↓ (colored green/up, red/down) based on its sign. Worth knowing: this is purely directional, not a "good or bad for the company" judgement — for a metric like combined ratio where lower is better, a decrease still shows red/down. Flagging in case that's worth a smarter version later.
- **Redesigned report page**: a proper editorial header (large company name, period pill, dateline) instead of a small-caps label; the metrics table replaced with a stat-card grid (label, big value, named-period comparison, change badge); key takeaways bigger and set in a tinted card instead of small print.
- **Redesigned list page**: bigger cards with the period, prior-period, ticker, up to two headline metrics with their change badges, and up to two takeaways per report — much more to go on before clicking in.
- **New: Press coverage**, done. Add a link manually (outlet/headline/description/link), or paste a dump of links/headlines/notes with "Import coverage" and Claude extracts a reviewable list — add or leave out each one, same accept/reject pattern as every other Import in this app. Deliberately never auto-saves anything itself.
- New DB column `earnings_reports.prior_period`; all press-coverage actions logged to /stats.

## Version 21 — 2026-08-18
Foundation for the two new sections pitched this session — a big change, phase one of two (the Earnings hub's stock-performance chart and manual press-coverage entry are still to come).

- **Calendar nav is now a dropdown**: Calendar / Week Ahead / Earnings.
- **New: Week Ahead.** Auto-pulled from the calendar for the current Monday–Sunday (resets every Monday since it's always computed live off today's date, not a stored snapshot). Hide, reorder, or write a shorter blurb for any event without touching the calendar entry itself. A newsletter signup form captures interest — sending isn't built yet, this just saves the list for when it is.
- **New: Earnings hub.** A list of company earnings reports; an Import button pastes a press release or AI summary and Claude extracts a metrics table (prioritising gross written premium, net income, combined ratio for P&C insurers, solvency ratio, return on equity — whatever the release actually gives, nothing forced), 3-5 key takeaways, and official/earnings-call links, all reviewable and editable before saving. Stock performance and manual press-coverage entry are in the data model already but not built into the UI yet — see the "Stock data" research below.
- Researched free stock-data APIs for the eventual stock-performance chart: Finnhub, Twelve Data, and Alpha Vantage all gate or throttle European exchange data too hard to be usable; Stooq.com is the practical option (free, no key, real LSE/Xetra/SIX coverage) but is an unofficial/undocumented endpoint — the plan is to fetch daily into our own database rather than live on every page view, so an outage there degrades gracefully instead of breaking the page.
- New DB tables: `newsletter_subscribers`, `week_ahead_notes` (per-event override), `earnings_reports` (metrics/takeaways stored as JSONB — the metric set genuinely differs company to company), `press_coverage`.
- `lib/weekDates.ts` extracted from the Calendar tab's week-view date math (UTC-consistent, same fix as Version 13) — now shared with Week Ahead instead of risking a second copy drifting out of sync.
- All new actions (Week Ahead edits, newsletter signups, earnings extract/save/delete) are logged to `/stats` like everything else.

## Version 20 — 2026-08-17
- **Chart hover now shows a full breakdown**: hovering a day (or an empty day — the hit area covers the whole column, not just the bar) shows a proper floating tooltip with the date, the total, and a per-action-type breakdown sorted by count, instead of just a plain "date: N uses" tooltip.
- **Site visits are now logged**: a lightweight ping fires once per page load (Edit, Calendar, or Stats) from the shared masthead, logged as `site_visit` — shows up in "Totals by action," "Recent activity," and the usage chart like anything else. Worth knowing: it's a page-view count, not a unique-session count — there's no login/session system in this app beyond the one shared site password, so switching tabs counts as a new visit the same way opening the site fresh does.

## Version 19 — 2026-08-17
- **Usage-per-day chart on the stats page**: a small bar chart above the existing totals/recent-activity panes, one bar per day for the last 30 days, every logged action counting as one use (so 5 edit checks in a day shows as 5). Hover a bar for the exact date and count. Zero-filled so a quiet day shows as an empty gap in the bar row rather than just vanishing.

## Version 18 — 2026-08-17
- **Stats now log every calendar action**, not just scans/import: adding, editing, and deleting an event, and adding, editing, and deleting a tag are all logged now, alongside the Edit tab's article checks (which were already logged). Since the whole site shares one password rather than individual logins, this was already "from all users" by construction — the gap was that several actions just weren't being recorded at all, not that they were being missed for some people and not others.
- Fixed a layout bug this surfaced: the hidden `/stats` page was quietly reusing the calendar's `.cal-workspace` CSS class for its own unrelated two-column layout, which broke (fell back to one column) when that class became conditional in Version 16. Stats gets its own `.stats-workspace` class now.

## Version 17 — 2026-08-17
- **List view toggle**: brought back the Upcoming side list from before Version 16, but as an opt-in "📋 List view" button next to See all, not a permanent panel — the calendar stays full-width by default, and only splits to make room for the list once someone actually turns it on. Remembered per browser (localStorage), so if you like having it on, it stays on next time you open the tab.

## Version 16 — 2026-08-17
- **Manage tags**: a new button opens a modal to add, rename, recolor, or delete tags — shared with the whole team, not just local to your browser. Colors come from a curated 10-color palette (not free-form hex) so everything still looks like one consistent system; any tag can also opt into the "highlighted" treatment (bordered pill + accented card) that was previously just for InsuranceERM's own events. Tags moved from a hardcoded list to a real database table — existing events keep working exactly as before (the original six tags are seeded in automatically), and deleting a tag doesn't retag its events, they just show a plain grey label until edited.
- **Calendar is now full-width**: removed the Upcoming side panel entirely. A small toolbar with the event count and a **See all** button now sits directly above the calendar instead. Day numbers, event bars, and weekday labels are all a bit bigger too, since the calendar now has the width the side panel used to take.

## Version 15 — 2026-08-16
- **Two new tags**: "InsuranceERM Event" and "Webinar". InsuranceERM's own events get a deliberately different treatment from the rest of the tag set — a warm gold/amber accent, a bordered pill (the only tag pill with one), and a tinted background + accent stripe wherever they show up as a card — so they're easy to pick out at a glance from third-party events.
- **Tag filter**: a row of toggleable chips ("Show: Industry event · Earnings · Editorial · Bank Holiday · InsuranceERM Event · Webinar") above the calendar. Click a tag to hide it — everywhere events show up (month grid, week view, Upcoming, See all) respects it, not just one list. "Show all" resets it.
- **The two AI web-search scans (industry events, earnings calendar) are temporarily disabled** — greyed out in the Scan menu with a "Temporarily disabled" note, while their cost/reliability gets revisited. UK bank holidays and Import events are untouched, since neither uses web search. One flag in the code (`SCANS_DISABLED`) re-enables both when ready.

## Version 14 — 2026-08-16
- Import events: paste box is much bigger (220px → 440px tall, modal widened to fit) and the limit raised from 12,000 to 60,000 characters — it's used rarely, so no need to keep it tight.
- The AI was told, in effect, to just give a representative sample rather than everything — reworded the prompt to be explicit that there's no cap and no target count: 3 in, 3 out; 80 in, 80 out. Also raised the response's own token budget (4096 → 8192) so a long list has room to actually come back in full rather than getting cut off.
- All scan/import results (not just imports) now sit in a scrollable list capped at 480px instead of growing the page to fit however many came back — same fix as the Upcoming list a few versions back, applied here too.

## Version 13 — 2026-08-16
- **Fixed the week view's "next" arrow** getting stuck instead of advancing (previous worked fine). Root cause: the new week-nav date math parsed dates in local time but read them back out in UTC, which silently shifts the date by a day for anyone in a positive UTC offset (the UK, whenever BST is in effect) — and since the week snaps to Monday on every click, that error compounded and could make forward clicks loop in place. Fixed by keeping the whole calculation in UTC throughout, the same approach already used for .ics export.
- **New: Import events.** A button next to "+ Add event" opens a paste box — drop in raw text, a press release, an AI-generated list, a copied schedule, whatever you've got — and it reads through it and proposes a list of events (title, date, time if given, a guessed tag, description) that you review and add one by one, exactly like a scan's results. No web search involved, so it's fast and immune to the scan timeout issue.

## Version 12 — 2026-08-16
- **Week view**: a Month/Week toggle next to the calendar's month name. Week view is a day-by-day agenda for the selected week — every event fully readable (title, time, tag, description), not squeezed into a lane bar, so a busy day is actually easy to read. Navigate week-to-week with the same ‹ › arrows.
- **Event times**: events can now optionally carry a start time, not just a date — a new "Time" field on the Add/Edit forms. Shows wherever a date shows (Upcoming, See all, week view, the event popup) as e.g. "16 Aug, 9am". Scans (industry events, earnings) will pick up a time too if one turned up naturally in the search, without spending extra searches chasing it down. Exporting a timed, single-day event to .ics now sets the actual time instead of marking it all-day.
- Existing events without a time are unaffected — the field is entirely optional throughout.

## Version 11 — 2026-08-16
- **Scan timeouts**: scans were occasionally hitting Vercel's hard function time limit (504) after already spending the API call — the search budget per scan (6 for events, 5 for earnings) was too high for the 60-second ceiling. Cut to 4 and 3 respectively, and told the model explicitly to work quickly rather than double-checking things a broad search already covered. Should fail far less often; if it still happens occasionally, that's the absolute ceiling on Vercel's side, not something the app can retry around.
- Calendar rows show 3 events per day now (was 2), with a bigger row height to fit.
- The "+N more this week" overflow badge is now an actual visible pill (not faint italic grey text) and clicking it opens the full "See all" list.
- **Fixed the Upcoming list actually growing to fit every event** instead of scrolling — the "equal height panes" CSS trick from Version 9 turned out to size both panes to the tallest one's full, unclipped content, so a busy calendar with 20+ events just made the whole page longer. The Upcoming pane's height is now measured directly off the calendar pane's rendered size and applied as a cap, so it always matches the calendar and scrolls internally past that.

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
