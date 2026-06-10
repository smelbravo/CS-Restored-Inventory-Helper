# Changelog

## 3.7.4

- Fix browser sync toggle restoring old settings — local/imported data now wins over stale `storage.sync`; import clears leftover sync keys
- Export reads only the active storage area (no mixing with old sync when sync is off)

## 3.7.3

- Fix export/import backup — reliable download via `downloads` API; import opens a dedicated tab (Firefox popup no longer closes before file pick)
- Import always writes to `storage.local` (and sync when enabled); export merges local + sync so locks are not missed
- Visible backup status in Settings (survives popup close); paste JSON fallback; open csrestored.fun tabs notified after import
- Permissions: `downloads`, `tabs` (see PRIVACY.md)

## 3.7.2

- Fix auto-open session mutex — no overlapping runs; Start stays disabled until end-of-session auto-sell finishes
- Fix import/export — confirmation modal, full popup reload after import, storage error handling, lock cap (5000)
- Browser sync clears inactive storage area when toggling; import normalizes payload
- Safer marketplace listing (learned template first), fetch/XHR hooks skip non-JSON, ambiguous card/drop matching skipped
- Validator XSS escape; cases batch size persists from panel; GitHub API User-Agent; ARIA tab labels; README/PRIVACY updates

## 3.7.1

- **Live user counter** in popup header (next to version) — community total via CounterAPI; one anonymous ping per install per hour

## 3.7.0

- **Browser sync** — optional `storage.sync` for settings across devices (Firefox Sync / Chrome sync) in Settings tab
- **Export / import** — JSON backup of all extension preferences (features, locks, case config, language)
- New module `csr-storage.js` — unified prefs API for local and sync storage

## 3.6.0

- New **About** tab — version, links (GitHub, AMO, Privacy, License), bundled **What's new** from this file
- **Redesigned popup** — header **Inventory Helper**, horizontal top tabs, grouped features (Inventory → Sell → Trades → Cases)
- **GitHub update checker** for Chromium — optional auto-check + manual button; Firefox shows AMO note instead
- Improved popup layout for long translations (pt-PT, de, ru)
- Storage key `csrAutoUpdateCheck`; permission `api.github.com` for release checks
- Fix: Chromium update UI on Brave/Edge (Firefox detection uses `getBrowserInfo`, not `typeof browser`)

## 3.5.0

- Multi-language UI — popup Settings tab with language picker (en-US, en-GB, pt-PT, pt-BR, de, ru, es)
- Session auto-sell for auto case opening — manual, all non-gold, or selected rarities
- Rarity tier names stay English in all locales

## 3.4.0

- Auto case opening on Cases tab with live log, results table, and spend/time limits
- Lazy overlay loading for large inventories (80+ cards)

## 3.2.0

- Extension popup with feature toggles and skin lock count
