# Changelog

## 3.8.6

No functional changes — version bump only (AMO does not allow re-uploading a deleted **3.8.5** submission). Same build as **3.8.5**.

## 3.8.5

**New — inventory browse filters**
- **Gems only** in Doppler phase dropdown — Ruby, Sapphire, Black Pearl, Emerald (no P1–P4)
- **Skin lock** filter — all / locked only / unlocked only (inventory page)

## 3.8.4

**Fix — duplicate skin overlay matching (Case Hardened / same item_id)**
- Multiple inventory cards with the same skin image (e.g. several AK-47 Case Hardened) no longer copy float/seed from another card
- Batched overlay loading (50+ cards) now reserves already-stamped `weapon_id`s across scroll batches
- Better disambiguation when several candidates share wear: existing overlay sig, float, and seed
- Removed unsafe inventory index→cache fallback that could assign wrong items
- API `seed` is no longer overwritten by DOM hints when already present

## 3.8.3

**New — trade partner inventory overlays**
- **Send Trade Offer → Their Items:** active fetch `GET /users/{id}/inventory` — float, seed, **`skin_index`** (Doppler/Gamma phase), and Case Hardened tier on the trade partner's items (same badges as your inventory)
- **Trade detail** (Your offer / Their offer): loads partner inventory from trade `initiator_id` / `recipient_id` and overlays **Their offer**
- Per-user session cache; passive hook when the site fetches the same endpoint; `/users/friends` for name → user ID

**Credits**
- **[CSR+](https://github.com/queryery/CSR-PLUS)** / **query (9uery)** — documented the `/users/{id}/inventory` API and trade-inventory approach in CSR+ Trades; this feature was implemented with his guidance and permission

## 3.8.2

**New — Doppler / Gamma Doppler phase & Case Hardened tier badges**
- **Doppler / Gamma Doppler:** phase or gem from **`skin_index`** (Finish Catalog **415–421**, knife Gamma **568–572**, **Glock-18 Gamma 1119–1123**) on inventory, trades, Create Offer, and marketplace **offer detail**
- **Case Hardened:** blue/gold gem tier badges from **paint seed** (AK/Karambit full T1–T3, #1 seeds for 20 CH knives; bundled offline lists)
- Badges show **phase · paint index** (e.g. `Emerald · 568`, `P2 · 1121`) next to wear on cards; float/seed overlays unchanged

**Marketplace — Doppler phases (important)**
- The **marketplace listing API does not include `skin_index`**. Phase badges on marketplace **grid cards** only appear when the extension knows that **`item_id` → paint index** mapping — typically after you **own at least one Doppler/Gamma** (or the same `item_id` was learned from inventory, trades, or case opens), plus entries in bundled `data/csr-doppler-item-map.json`
- If you have **never** had that knife/skin in your inventory, marketplace Doppler listings often show **float/seed only** — no phase label
- **Offer detail** (`/marketplace/offer/{id}`) uses the same map when available

**Browse filters**
- **Phase** filter (phased only, Ruby/Sapphire/BP/Emerald, P1–P4): **inventory** and **Create Offer** only — **not** on marketplace (unreliable without per-listing `skin_index`)
- **Case Hardened tier** filter: inventory, marketplace, and Create Offer

**Fix — marketplace float/seed overlays**
- Restored float + seed badges on marketplace grid (top-right); improved card→API matching (name, wear, seed)
- Phase badge placement: inventory top row beside wear; marketplace beside wear at top

**Project structure**
- Source under `src/` (`content.js`, `lib/`, `popup/`), `data/csr-doppler-item-map.json`, docs in `docs/`; build via `scripts/build-zip.py`

## 3.8.1

**New — Trade float/seed toggle**
- Popup **Trades** → disable float & seed overlays on trade pages and Send Trade Offer (inventory unchanged)

**Perf — unified batched float/seed overlays**
- **Every** grid with **50+** cards uses the same batching: inventory, marketplace, trades, trade detail, **Send Trade Offer**, Create Offer
- First **50** cards get overlays; more load on scroll (visible cards first, then **+50** near scroll bottom)
- Skin-lock buttons on large inventories follow the same batching when float overlays are off

## 3.8.0

**New — Multi case opening** (Auto open tab)
- **Single case** / **Multi case** toggle — open one case type or several in the same session
- **Multi open style** — **Cycle** (one of each until spend limit) or **Fixed per case** (quantity 1–99 per selected case); toggle in popup and on the Cases panel
- **Case search** — filter the case dropdown or multi list by name
- **Manual session sell — per item** — **Sell** on each drop in the results table; **Quick sell all non-gold** and sell-by-rarity bulk buttons remain

**Change**
- Auto open **default and minimum delay: 400 ms** (API rate limit)

**Fix**
- Per-item **Sell** buttons no longer stay disabled until a bulk sell runs (session flag cleared before results render)
- Weapon IDs resolved with retries after session end; other rows stay clickable while one item sells

## 3.7.5

**Fix — Quick Sell manual picking**
- Clicking duplicate skins (same weapon/skin + wear) no longer shows `ID: null` / Not matched in Confirm Sale
- Card matching uses overlay `weapon_id`, float/seed hints, and overlay matching logic

## 3.7.4

**Fix — browser sync after import**
- Enabling **Browser sync** no longer restores stale `storage.sync` data over freshly imported or local settings — **local snapshot wins** when any local prefs exist
- **Import** clears leftover sync keys even when browser sync is off (prevents ghost data on next sync enable)
- **Export** with sync off reads **only** `storage.local` (no mixing with old sync entries)

**Improvement**
- Popup and open csrestored.fun tabs refresh immediately after toggling browser sync

---

## 3.7.3

**Fix — export / import backup (Firefox & Chromium)**
- **Export** uses the `downloads` API so the JSON file saves reliably when the popup closes
- **Import** opens a dedicated **`src/popup/import-backup.html`** tab — Firefox no longer loses the file picker when the popup closes
- **Paste JSON** fallback in Settings for quick manual import without a file dialog
- **Backup status** line in Settings (persists via `sessionStorage` if the popup closes)
- **Import** always writes to `storage.local` first; also writes to sync when browser sync is enabled
- Open **csrestored.fun** tabs receive a reload message after import so locks apply without a manual refresh

**Permissions**
- `downloads` — save exported JSON to Downloads
- `tabs` — notify content scripts after import

**Files**
- New: `src/popup/import-backup.html`, `src/popup/import-backup.js`

---

## 3.7.2

**Fix — auto case opening**
- Session **mutex** — no overlapping auto-open runs
- **Start** stays disabled until end-of-session auto-sell finishes
- Panel hide no longer forces `casesOpenRunning = false` mid-session

**Fix — export / import (first hardening pass)**
- Import **confirmation modal** before replacing settings
- Full **popup reload** from storage after import
- **Lock cap** — max 5000 IDs per import
- Storage errors surfaced to the user (toast)

**Fix — browser sync**
- Toggling sync **clears** the inactive storage area (local ↔ sync migration)
- Import **normalizes** payload (features, locks, case config, language)

**Fix — site & security**
- Safer **marketplace listing** (learned template first, less brute-force)
- Fetch/XHR hooks skip non-JSON responses
- Ambiguous card/drop matching skipped instead of wrong match
- **Validator XSS** — user-facing strings escaped in confirm UI

**Improvement**
- Cases **batch size** persists when the input loses focus
- GitHub API **User-Agent** on release checks
- Popup **ARIA** tab labels (`aria-selected`)
- Popup loads **`settings.js`** for shared prefs API
- Firefox **min version 128.0**
- **`scripts/test-import-export.mjs`** — storage export/import smoke tests
- **`scripts/scan-i18n.js`** — i18n key scanner updates
- README and PRIVACY updates

---

## 3.7.1

**New — live user counter**
- Approximate **ONLINE** user count in popup header (next to version badge)
- Powered by **CounterAPI** (`csr-inv-helper/online` namespace — separate from CSR+)
- One anonymous increment per install per hour when you open the popup; fails silent if unreachable

**Improvement**
- Header layout refined for version badge + counter + status label

**Permission**
- `https://api.counterapi.dev/*`

---

## 3.7.0

**New — browser sync**
- Optional **Browser sync** toggle in Settings tab
- When enabled, preferences sync via **Firefox Sync** or **Chrome sync** (`storage.sync`)
- Toggle flag always stays in `storage.local` (per device)

**New — export / import backup**
- **Export settings** — JSON file with all extension preferences
- **Import settings** — restore from JSON (initial popup file picker flow)
- Useful for moving settings between Firefox and Chromium (sync vendors do not cross over)

**New — unified storage module**
- **`csr-storage.js`** — `csrPrefsGet` / `csrPrefsSet`, sync toggle, export/import API
- **`settings.js`** and popup updated to route prefs through the new module

**Backup includes:** `csrFeatureSettings`, `csrLockedWeaponIds`, `csrCasesAutoOpenSellConfig`, `csrCasesAutoOpenConfig`, `csrLanguage`, `csrAutoUpdateCheck`

---

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
