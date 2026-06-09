# Changelog

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
