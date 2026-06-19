# Changelog

## 3.12.5

**Recommended release** — bundles **Case opening stats (v3.10)**, **Sell Hub (v3.11)**, **MAU counter (v3.12.0)**, and quick-sell fixes **3.12.1–3.12.5**. Use this build if quick sell showed **failed** while skins actually sold (slow CS:R API / server timeouts).

GitHub release draft: [RELEASE-NOTES-v3.12.5.md](RELEASE-NOTES-v3.12.5.md)

### Fix — “Failed” but skin actually sold (slow API sync)
- Quick sell waits up to ~15s for inventory to update before marking failed (panel, cases, auto-sell)
- HTTP 200 with empty body counts as OK again; only explicit API errors reject
- If sell request succeeded but body unclear, polls `/inventory/` until item disappears

### Fix — Sell Hub stuck on “Selling…”
- Sells run **sequentially** (batch size = pause between groups, not parallel hammer)
- **Confirming sales…** phase with retries before closing modal
- Inventory list shows **before** pattern-map / recent-drops finish loading
- Direct API fetch first (faster than cold service worker); 45s timeout for large inventories

### New — API latency ping (Sell Hub)
- Header shows `API 450ms` / `API slow · 8200ms` / `API unreachable` so you know when the site is lagging

## 3.12.4

### Fix — Quick sell verification (panel, cases, auto-sell)
- Shared `CSR_sellWeapon`: empty HTTP 200 no longer counts as sold (needs coins, success, or weapon echo)
- `apiSell` confirms each sale against fresh `/inventory/` (retry once if API is slow)
- Case drops: no longer use `skin_id` as sell id — match real `weapon_id` from inventory by name/float

## 3.12.3

### Fix — Sell Hub false “sold” / skins gone with no coins
- Sell uses **raw API `weapon_id`** (`_api_weapon_id`), not the disambiguated display id
- Sell requests go through **background API proxy** (same session as inventory load), not extension-page `fetch`
- Success only when the API returns **coins** (or explicit success) — empty 200 no longer counts as sold
- After sell/list: **re-fetch inventory** from server to confirm what actually sold (no optimistic local removal)
- Review modal re-validates selection against fresh inventory before selling

## 3.12.2

### Fix — Sell Hub stuck on “Loading inventory…”
- Inventory loads first via authenticated `/inventory/` (not public profile endpoint)
- API calls: background proxy timeout + direct `fetch` fallback (Brave/Chromium)
- Pattern map load no longer blocks the list (4 s cap; GitHub fetch could hang forever)

### Change — Quick sell batch size default **2**
- Default batch size is now **2** (panel slider, popup, cases auto-sell, Sell Hub)
- Hint under batch slider: slow site/API + high batch may fail to sell skins

### Fix — Batch size slider track invisible in Brave
- Visible track on the range input (`#2a2a2a` / `#4a4a4a`) instead of transparent-only pseudo-elements

## 3.12.1

### Fix — Quick sell mass failures (inventory panel, cases, Sell Hub)
- Sell API aligned with site / CSR+: `POST /inventory/sell/{id}` with **empty body** first (was always `{ weapon_id }` only)
- Retries on **429 / 5xx**; parses JSON error bodies; learns request shape when you quick sell on the site once
- **280 ms** pause between bulk-sell batches to reduce rate limits when the API is busy
- Weapon ID match fix in confirm modal validation (string vs number)

## 3.12.0

### New — Anonymous active-user stats (real usage, not downloads)
- **ACTIVE** counter in popup — **MAU** (installs with heartbeat in last **30 days**); tooltip shows **DAU** and **online (1h)**
- Daily anonymous heartbeat: random `install_id`, extension version, browser family only
- **Cloudflare Worker + D1** (`workers/usage-stats/`) — free tier; see `workers/usage-stats/README.md`
- Popup registers on open (direct `fetch`); background worker + daily `alarms` as backup
- Replaces CounterAPI “online now” counter (v3.7.1–v3.11)
- Privacy policy updated; Firefox `data_collection_permissions: technicalAndInteraction`
- Permissions: `alarms`; host permission for deployed stats worker URL

### Fix — popup counter stuck on “—”
- Firefox/Brave: no longer blocks on `runtime.sendMessage` to background; heartbeat from popup with timeout-safe background ping

## 3.11.0

### New — Sell Hub (standalone page)
- **Sell Hub** — lightweight extension tab for bulk **quick sell** and **marketplace list** outside the CS:R site UI (less lag on huge inventories)
- **Green FAB** on `/app/inventory` opens `sell-hub.html` (toggle: popup **Sell Hub (standalone page)**)
- Search, rarity filter, batch size, select all / clear / sell by rarity
- **Sort:** rarity (default **high → low**), float, **last dropped**, name — click active sort again to reverse (↑/↓)
- **New drop** badge (48 h) from `csrRecentDrops` (auto-open, site case opens, new items on refresh)
- **Review modal** — quick sell + market prices, remove (×) per card, footer totals, one-by-one sell animation + progress
- **Coins** in header (live updates, space-separated thousands); **nickname** from `GET /users/@me`
- **Skin lock** integrated (same list as inventory; respects per-`weapon_id` locks)

### New — Background service worker
- `src/background.js` proxies authenticated API calls (`csr:api`) for Sell Hub — session cookies work in Brave/Chromium

### Fix — Skin lock on duplicate skins
- Locking one copy no longer locks every duplicate (e.g. multiple AWP | Man-o'-war) — per `weapon_id` disambiguation
- Sell Hub thumbnails use catalog `item_id` for CDN images

### Fix — Case opening stats (all auto-open modes)
- Stats and recent drops recorded from `processAutoOpenDrop` for single, multi cycle, multi quota, and auto-sell paths
- Site case-open hook deduped when extension already recorded the drop

## 3.10.0

### New — Case opening stats (Cases panel)
- **Stats** tab on the gold Cases floating panel (`/app/inventory/cases`) — lifetime counters separate from a single auto-open session
- Tracks **total opens**, **total gold** (★ knives & gloves), **cases since last gold**, last gold / last drop (rarity-colored), and **recent gold history**
- **See more** expands a full breakdown by rarity (count, %, bars)
- Counts **site opens** (API hook) and **extension auto-open** (recorded after each successful open)
- **Reset stats** button; data in `csrCaseOpeningStats` (browser sync + JSON backup when enabled)

### Fix — Case stats not recording during auto-open
- Auto-open uses native `fetch` and bypassed the API hook — stats now recorded directly after each successful `POST /inventory/cases/open/`
- Improved API drop normalization (`item_name`, nested `item`, special ★ drops)

### Fix — Stats UI readability
- Last drop / last gold names use rarity colors on a readable dark card background

## 3.9.0

Minor release — pattern badges (shipped in repo as **3.8.9**) plus auto-open resilience.

### Improvement — Auto case opening resilience
- **Server / network errors** (5xx, 429, timeouts) no longer stop the whole session on the first failure — retries with backoff (up to **8** consecutive errors)
- **Fatal errors** still stop immediately (401/403/404, not enough coins, invalid case)
- **Time limit** maximum raised from **120** to **480** minutes (default remains **10** min)

## 3.8.9

### Fix — CS:R alt Doppler Black Pearl (skin_index 617)
- **Kukri / Butterfly / Shadow Daggers** (and similar alt-gem knives): `skin_index` **617** is **Black Pearl**, not Ruby; **618** is **Ruby** (was swapped in v3.8.7)
- Fixes wrong **Ruby · 617** badges and browse filters on Black Pearl alt Doppler knives

### New — Fade % badges
- **`| Fade`** knives and guns show **fade percentage** from paint **seed** (Valve rotation algorithm; bundled offline — no external API)
- **All** fade items show a badge (e.g. `83.8%`, `99.9%`); **≥ 95%** uses stronger gradient styling; **90–94%** and **80–89%** use discreet badges
- Works on inventory, marketplace, trades, Create Offer (when `seed` is present)

### New — Marble Fade pattern badges
- **Fire & Ice** — Karambit, Bayonet, Flip Knife, Gut Knife (community tier lists; badge `F&I`, `2nd`, …)
- **Max Red Tip** — all Marble Fade knife types (Butterfly, M9, Talon, Huntsman, Ursus, Falchion, Bowie, Stiletto, Nomad, Navaja, Skeleton, Shadow Daggers, Paracord, Survival, Classic, Kukri)
- Seed lists bundled from korenevskiy Steam guides + community references (pattern.wiki, SteamAnalyst, CSFloat)

### New — browse filters (Fade / Marble Fade)
- **Fade ≥ 95%**, **Fire & Ice**, **Red Tip** in the pattern dropdown (inventory, marketplace, Create Offer)
- Requires paint **seed** on the item (same as Case Hardened tier filter)

## 3.8.8

### Fix — auto-open delay field (reported by holme)
- **Delay (ms)** can be cleared and typed freely; minimum **400** applied on blur / Start (toast when clamped)
- **Quick presets:** **400 / 800 / 1500 ms** under the delay field

### New — Doppler map export / import
- Popup **Settings → Doppler map** — export / import `item_id → skin_index` JSON (learned from inventory + bundled entries)
- Import merges entries and refreshes open csrestored.fun tabs

### New — marketplace Doppler phase filter
- **Phase** browse filter on marketplace (same options as inventory) — only listings with a **known** `item_id` map match
- Counter note when filtering: marketplace shows known phases only

## 3.8.7

**Hotfix** — critical bugs reported right after the v3.8.x big update.

### Fix — About tab logo (reported by smelbravo)
- Popup **About** icon used wrong image path (`icons/` instead of `../../icons/`)

### Fix — Doppler Sapphire missing on some knives (reported by Ametx)
- **CS:R alt `skin_index`:** gems **617–619** (Black Pearl = **617**, Ruby = **618**, Sapphire = **619**, not CS:GO **415–417**) and phases **852–855** on Kukri, Butterfly, Shadow Daggers, and similar
- `skin_index` no longer confused with paint **seed** on phased knives
- Finish catalog lookup uses all CDN/item ids and card image id; **Gems only** filter fixed for affected knives
- Bundled map: Kukri Sapphire CDN id **2024 → 619**

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
