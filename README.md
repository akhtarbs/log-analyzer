# Local Log Analyzer

A browser-only, offline-first log analysis tool for security analysts. Import, search, filter, mark, tag, and investigate log files — entirely on your machine. No login, no backend, no cloud database, nothing ever leaves your browser.

```
STATIC WEB APP · NO LOGIN · NO SERVER · NO CLOUD · GITHUB PAGES COMPATIBLE
```

## Features

- **Import**: drag & drop or browse `.log .txt .csv .json .jsonl` files, multiple at once, parsed off the main thread via a Web Worker so the UI never freezes.
- **Log Files manager**: every uploaded file is listed with its name, parser used, event count, size, and import time. Each file can be individually **included or excluded** from analysis — excluded files stay in local storage but their events are hidden from the dashboard, analysis, and detection rules until re-included. Files can also be deleted entirely (with confirmation).
- **Automatic parsing**: Linux syslog, Linux auth.log (SSH), Apache access/error, Nginx access/error, JSON, JSONL, CSV, and a generic fallback — auto-detected per file.
- **Normalized events** stored in IndexedDB (via Dexie): timestamp, severity, IPs/ports, username, hostname, action, status, raw log, and more.
- **Log Explorer**: virtualized table (`@tanstack/react-virtual`) that stays smooth at 100k-1M+ rows, full-text search with debounce, quick severity/mark filters, and an AND/OR advanced filter builder. Sort by newest/oldest first with one click; choose 100-500 rows per page and jump straight to any page number instead of clicking Next repeatedly. Filter to an exact time range (date + time down to the millisecond) using an indexed range query, so narrowing to a small window stays fast even on huge datasets.
- **Built for millions of rows**: imports are streamed from disk by a worker (the file is never read whole into memory) with backpressure, so memory stays flat; Dashboard and Analysis read small pre-computed per-file statistics that are built during import instead of rescanning the table (so they open instantly, and survive a page refresh); the Log Explorer pages through the timestamp index and takes totals from per-file counts; detection rules stream in time order with a small sliding window per group; deleting a file runs in batches with progress.
- **Pre-computed statistics**: each file gets a statistics record at import time (totals, severities, failed authentication, events per minute, and top source/destination IPs, usernames, event types, user agents, URLs, status codes and methods). Files imported before this existed are scanned once automatically, then cached. Settings → *Rebuild statistics* recomputes them. Top lists are exact unless a single field has tens of thousands of distinct values (e.g. unique URLs), in which case the long tail is pruned and only rare values can be undercounted.
- **Log Explorer remembers where you were**: search, quick filter, advanced filters, sort order, rows per page, page number and time range are restored after a refresh. Default columns are Timestamp, Source IP, URL and the full raw log.
- **Analysis page**: a summary row (requests, error share, automated-client share, marked events), a short list of *key findings* (addresses that probe with mostly errors or scanner user agents, sensitive paths such as `/.env` and `/wp-login.php`, injection-style payload patterns, traffic spikes) where each one opens the Log Explorer already filtered, a stacked request timeline (per HTTP status class; group by 1 minute up to 1 day; click a bar or a "busiest" entry to open that exact time range), and an Indicators card with tabs for Source IP, User Agent, URL/Path and Status (plus Username and Destination IP when the logs have them) with detail view, Copy IoC and CSV export. Everything is computed locally from statistics stored at import time. Flags are indications from simple patterns, not verdicts.
- **Time range picker**: choose a date and the time starts at 00:00:00.000; adjust hour, minute, second and millisecond if needed, or use "end of day" for the last day.
- **Progress and cancel for long operations**: imports, dashboard/analysis calculations, Log Explorer searches and detection-rule runs report live progress (thin bar at the top of the page plus a task panel with percentage, elapsed time and a Cancel button for work that takes more than a moment). A newer search automatically cancels an older one still running. Timings are written to the browser console as `[perf] ...` lines, and the import dialog shows a read / parse / save breakdown.
- **Configurable display timezone**: pick any UTC/GMT offset (including half/quarter-hour zones like +5:30, +5:45, +8:45) in Settings, and every timestamp shown across the app — Log Explorer, log detail, dashboard, analysis, investigations, saved filters, detection findings, and the time-range filter — displays in that offset. The underlying data always stays stored and matched in UTC, so switching timezones is purely a display preference and never requires re-importing.
- **Configurable columns**: choose exactly which fields the Log Explorer table shows via the Columns selector — Timestamp is always shown, everything else (severity, IPs, ports, username, action, status, URL, HTTP version, user agent, referer, request body, tags, raw log, and more) is optional and persists across sessions.
- **Nested filter groups**: the filter builder supports grouping conditions arbitrarily deep — each group (top-level or nested) has its own independent AND/OR combinator, so you can express things like `srcIp equals X AND (severity equals CRITICAL OR severity equals HIGH)`. Includes `is empty` / `is not empty` operators for checking whether a field was populated by the parser.
- **HTTP-aware parsing**: Apache/Nginx access logs (Combined Log Format) and JSON/JSONL/CSV sources now also extract **URL/path, HTTP version, User-Agent/browser, Referer, and request body/data sent** where present, all filterable, searchable, and exportable like any other field.
- **Full raw log**: every event's complete original log line is always available — as an optional "Full Log (Raw)" column in the table, and always shown in the log detail drawer with a one-click copy button.
- **Marking & tagging**: 5 mark levels (Critical/Suspicious/Review/Benign/Info), built-in + custom tags, analyst notes per event (add, edit, delete), bulk actions across a selection. Marking or tagging from the log detail drawer immediately refreshes the Log Explorer table.
- **Investigations**: create cases, attach events, view a timeline with aggregate stats (unique IPs/users, critical/suspicious counts).
- **Local detection engine**: threshold/time-window rules (SSH brute force, port scan, web scanning) plus keyword-based SQLi/command-injection/XSS flags — always framed as *potential suspicious activity*, never a confirmed verdict.
- **IP analysis**: click any source IP to see first/last seen, failed vs successful logins, unique destinations/ports — all computed locally.
- **Saved filters** and **custom detection rules**, persisted locally.
- **Export**: CSV / JSON / TXT via `Blob` + `URL.createObjectURL` — nothing is ever sent to a server.
- **Backup & restore**: exports metadata, marks, tags, investigations, filters, rules, and settings as JSON (optionally a ZIP with original log files included).
- **PWA / offline support**: after the first load, the app works with no internet connection.
- **Dark / Light / System** themes, dense SOC-console UI built for reading a lot of events quickly.

## Architecture

```
Browser
  |- React UI (pages/components)
  |- Log Parser (src/parsers) - auto-detecting, per-format
  |- Web Worker (src/workers) - chunked parsing off the main thread
  |- Analysis Engine (src/analysis) - threshold/window detection + injection heuristics
  |- Filter Engine (src/services/filterEngine.ts)
  `- IndexedDB (src/db, via Dexie) - logs, files, marks, tags, investigations, rules, filters, settings
```

There is no `Browser -> Server -> Database` path anywhere in this app. Every computation — parsing, filtering, aggregation, detection — runs in the browser.

## Installation

```bash
git clone <this-repo>
cd local-log-analyzer
npm install
```

## Development

```bash
npm run dev
```

Opens the app at `http://localhost:5173`.

## Build

```bash
npm run build
npm run preview
```

## Testing

```bash
npm run test
```

Covers the log parsers (format detection + field extraction) and the detection engine (threshold/window rule matching, injection heuristics).

## GitHub Pages Deployment

This repo ships with `.github/workflows/deploy.yml`. On every push to `main`, GitHub Actions runs `npm ci && npm run build` and publishes `dist/` to GitHub Pages automatically. The build's base path is set from the repository name (`VITE_BASE=/${repo-name}/`), so the app resolves correctly at:

```
https://USERNAME.github.io/log-analyzer/
```

**To enable it:** in your repository settings, set *Pages -> Source* to **GitHub Actions**.

The app uses `HashRouter` (routes like `#/logs`, `#/investigations/3`) specifically because GitHub Pages has no server-side rewrite rules — a plain `BrowserRouter` would 404 on refresh for any route other than `/`. Hash-based routes always resolve to `index.html`.

## Local Storage / IndexedDB

Everything lives in a single IndexedDB database, `LogAnalyzerDB`, managed by [Dexie](https://dexie.org):

| Table | Purpose |
|---|---|
| `logs` | normalized log events |
| `logFiles` | imported file metadata (+ original content, if small) |
| `tags` / `logTags` | tag definitions and event<->tag links |
| `investigations` / `investigationLogs` | cases and their attached events |
| `notes` | analyst notes per event |
| `savedFilters` | reusable filter definitions |
| `detectionRules` | built-in and custom detection rules |
| `settings` | app preferences |

Indexes are set on the fields used for filtering and sorting (`timestamp`, `severity`, `eventType`, `srcIp`, `dstIp`, `username`, `hostname`) so the Log Explorer stays responsive on very large datasets without ever loading the full table into memory.

## Supported Log Formats

- Linux Syslog
- Linux Auth Log (`auth.log`, SSH events)
- Apache Access Log (Combined Log Format) — timestamps are parsed with an explicit regex + `Date.UTC`, not string-mangled and handed to `new Date()`, to avoid silently losing precision (e.g. seconds) as can happen with looser parsing approaches
- Apache Error Log
- Nginx Access Log (same precise timestamp handling as Apache)
- Nginx Error Log
- JSON (array-of-objects file)
- JSONL (newline-delimited JSON)
- CSV (header-aware, common field name variants recognized)
- Generic (fallback for anything else — still fully searchable)

## Importing Logs

Use **Import Log** on the Dashboard or Log Explorer. Files are read with the File API, handed to a Web Worker, parsed in chunks, and streamed into IndexedDB — so multi-hundred-MB files don't block or crash the UI. Auto-detection samples the first ~200 lines to pick a parser; you can see which parser was used in the import summary and on the Settings page.

## Filtering

- **Quick filters**: All / severity levels / Marked / Unmarked / Suspicious.
- **Advanced filter builder**: pick a field, operator (`equals`, `contains`, `starts with`, `between`, `in`, `is empty`, `is not empty`, ...), and value; combine multiple conditions with AND/OR, with arbitrarily deep nested groups each carrying their own combinator.
- **Search**: matches IP, username, hostname, event type, message, and raw log text, debounced to avoid excessive re-querying.

## Marking

Five levels — CRITICAL, SUSPICIOUS, REVIEW, BENIGN, INFO — settable per event or in bulk across a selection.

## Tagging

Built-in tags (`BRUTE_FORCE`, `PORT_SCAN`, `SQL_INJECTION`, `XSS`, `COMMAND_INJECTION`, `SUSPICIOUS_IP`, `MALWARE`, `DATA_EXFILTRATION`, `FALSE_POSITIVE`, `INVESTIGATE`) plus custom tags you define.

## Investigation

Create a case (auto-numbered `INV-YYYY-NNN`), set priority/status, attach events from the log detail drawer or via bulk actions, and review the auto-generated timeline with unique-IP/user and critical/suspicious counts.

## Detection Rules

Threshold-over-time-window rules (e.g. "more than 10 `SSH_LOGIN_FAILED` from the same source IP within 5 minutes -> mark HIGH, tag BRUTE_FORCE"). Built-in rules cover SSH brute force, port scanning, and web scanning; you can add your own from the Rules page. Findings are always described as **potential suspicious activity** — review before acting.

## Backup

Settings -> Backup exports a `log-analyzer-backup.json` (or `.zip` if you choose to include original log files) containing log metadata, marks, tags, investigations, saved filters, detection rules, and settings. Raw event rows are intentionally excluded from the backup (there can be millions) — re-import the original log files to regenerate them, then restore this backup to reapply your analyst work.

## Restore

Settings -> Restore Backup, choose **Merge** (keep existing data, add the backup's data) or **Replace** (wipe local data first). Marks are reapplied by log ID, so restoring works best against the same imported files.

## Privacy

A **LOCAL MODE** indicator is always visible in the header. No log content is ever transmitted anywhere — there are no IP lookup, threat-intel, AI-analysis, geolocation, or DNS-lookup calls to external services, and none will be added without being an explicit, opt-in feature you turn on yourself.

## Limitations

- Text search and advanced filters (anything that isn't a plain time range or the Marked filter) still read the table row by row — there is no index for "contains" — so on millions of rows they take a while; they show progress and can be cancelled.
- A `.json` file containing one big array is read whole (JSON can't be streamed record by record); for very large data use JSONL (one JSON object per line).
- Events whose timestamp could not be parsed are stored but are not part of the timestamp index, so they do not appear in the default timestamp-ordered view.
- Very large single files (multi-GB) are bounded by available browser memory/IndexedDB quota, not by this app's logic — check the storage estimate on the Settings page.
- Detection rules are heuristic threshold rules, not a full SIEM correlation engine — treat findings as leads to investigate, not confirmed incidents.
- Original log file content is only auto-included in backups when small (<=2MB); larger files should be re-imported rather than restored from backup.
- Timestamps without a recognizable format are stored as `null` and excluded from time-based charts/rules.

## Troubleshooting

- **Refreshing a page like `/investigations/3` shows a blank screen on GitHub Pages** — make sure you're using the deployed hash-routed URL (`.../#/investigations/3`); a bare path without the `#` won't resolve on static hosting.
- **Import seems stuck** — very large files can take a while to read; watch the Reading/Parsing/Saving progress bars. If it's genuinely stuck, check the browser console for a Web Worker error.
- **Storage full** — use Settings -> Clear All Data, or export a backup first, then re-import only what you need.
- **Assets 404 after deploying** — confirm the repository name matches the `VITE_BASE` computed in `deploy.yml` (`/${repo-name}/`), or set it explicitly if you renamed the repo.
