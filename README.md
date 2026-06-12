# CS:Restored Inventory Helper

Unofficial browser extension for [Counter-Strike: Restored](https://csrestored.fun) — float and paint seed overlays, **Doppler/Gamma phase** and **Case Hardened tier** badges, search and filters on inventory/marketplace, a quick-sell panel, **case bulk buy** and **auto case opening** (single or **multi case**, with optional **session auto-sell** and **per-item sell**) on the Cases tab, optional **toolbar settings** to turn each feature on or off, **skin lock** to avoid accidental sells, **multi-language UI** (popup + on-site panels), optional **browser sync** and **JSON backup** for settings, a **live user counter** in the popup header, and an **About** tab with release info and (on Chromium) a GitHub update checker.

Works in **Firefox**, **Microsoft Edge**, and **Chromium** browsers (Manifest V3).

**Current version:** `3.8.4`

**Repository:** [github.com/smelbravo/CS-Restored-Inventory-Helper](https://github.com/smelbravo/CS-Restored-Inventory-Helper)

**Firefox (signed):** [addons.mozilla.org/firefox/addon/csr-inventory-helper](https://addons.mozilla.org/firefox/addon/csr-inventory-helper/)

## Site requirements (CS:Restored)

The extension only works on [csrestored.fun](https://csrestored.fun). To use the site (and this extension), you need:

- **Steam level** greater than 0
- **CS2 playtime:** at least 25 hours

Log in with Discord on the website after meeting these requirements.

## Features

### Float & pattern overlays (your items)

Shows **wear abbreviation** (FN, MW, FT, WW, BS), **float value** (e.g. `0.1962`), and **paint seed** (`#640`) on item cards. Color-coded float dot (green → yellow → red by wear).

On **Doppler / Gamma Doppler** and **Case Hardened** skins, extra badges show **phase or gem** (Ruby, Sapphire, P1–P4, Emerald…) and **CH tier** (#1, T1–T3) — see [Pattern badges](#pattern-badges).

| Page | Route | Notes |
|------|-------|-------|
| **Inventory** | `/app/inventory` | Badges in the bottom-right corner of each card |
| **Marketplace** | `/app/inventory/marketplace` | Float/seed top-right; phase badge beside wear when known (see [Marketplace Doppler phases](#marketplace-doppler--gamma-doppler-phases)) |
| **Trade views** | `/app/play`, `/app/inventory/trade-up` | Float/seed/pattern for **your** items; **trade detail** loads partner inventory for **Their offer** (v3.8.3+) |
| **Send Trade Offer** | Modal on site | **My Items** — your inventory; **Their Items** — partner float, seed, Doppler phase, CH tier via `GET /users/{id}/inventory` (v3.8.3+); search + trade float toggle |

Data is matched by offer ID, skin image, wear, StatTrak, and name. The extension reads data from the site's own API responses in your browser session — it does not send data to external servers or spam duplicate API calls.

#### Large inventories — batched overlay loading (v3.4+, unified v3.8.1+)

Float/seed badges (and skin-lock buttons on inventory) are applied in **batches of 50** instead of all at once when a grid has **50+** cards.

Same behaviour everywhere:

| When | What happens |
|------|----------------|
| Page / modal open | First **50** cards (DOM order) |
| You scroll | Up to **50** **visible** cards without overlays are stamped first |
| Near bottom of grid | Next **50** in list order |

Applies to **inventory**, **marketplace**, **trades**, trade detail, **Send Trade Offer**, and **Create Offer**.

With **200+** items you may still see some site slowness, but the extension should no longer spike the page by stamping every card immediately. A short info toast may appear on very large inventory, marketplace, or trade lists.

#### Pattern badges

| Skin family | Identified by | Badge examples |
|-------------|---------------|----------------|
| **Doppler** | Finish Catalog **415–421** (Ruby, Sapphire, Black Pearl, Phase 1–4) | `Ruby · 415`, `P2 · 419` |
| **Gamma Doppler** (knives) | Finish Catalog **568–572** (Emerald, Phase 1–4) | `Emerald · 568`, `P3 · 571` |
| **Glock-18 Gamma Doppler** | Paint index **1119–1123** (CS:R-specific, not 568–572) | `Emerald · 1119`, `P2 · 1121` |
| **Case Hardened** | Paint **seed** (community tier lists) | `#1`, `T1`, `T2`, `T3` |

**Where badges appear:** same places and toggles as float/seed — **inventory**, **marketplace** (grid + **offer detail** `/marketplace/offer/{id}`), **trades**, **Send Trade Offer**, **Create Offer** (not the Cases shop panel). Respects **Float & seed overlays** and **Trade float & seed overlays**.

**Doppler:** phase is **not** derived from seed — CS:R exposes it as **`skin_index`** (paint index) on inventory items. Knives use **415–421** / **568–572**; **Glock-18 Gamma Doppler** uses **1119–1123**. Badges show **phase + paint index** (e.g. `Emerald · 1119`) anywhere float/seed overlays run when the paint index is known.

#### Marketplace Doppler / Gamma Doppler phases

The **marketplace listing API does not send `skin_index`**. On marketplace **grid cards**, Doppler/Gamma phase badges appear **only** when the extension already knows that listing’s **`item_id` → paint index** mapping — for example after you **owned at least one** Doppler or Gamma of that skin type (same `item_id`), or the map was learned from trades, case opens, friend inventory, or bundled `data/csr-doppler-item-map.json`.

| Situation | Marketplace grid |
|-----------|------------------|
| You **have owned** that Doppler/Gamma `item_id` (map learned) | Phase badge shown (e.g. `P2 · 419`) beside wear |
| You **never had** that knife/skin in your inventory | Usually **float + seed only** — **no phase label** |
| **Offer detail** (`/marketplace/offer/{id}`) | Same rule — phase when `item_id` is in the map |

**Inventory** always shows phase when the site API includes `skin_index` (your items and other players’ inventories when the API is accessible). This is why the **Phase browse filter** is on **inventory** and **Create Offer** only — **not** on marketplace (filtering by phase there would be unreliable without per-listing `skin_index`).

**Case Hardened:** works when `seed` is present (same as float overlays). Seed lists are **bundled offline** (no calls to third-party sites) and cross-checked against community databases:

- [BlueGemLab](https://bluegemlab.com/) — 25 Case Hardened skins, ~25k patterns
- [CSGOBlueGem.com](https://csgobluegem.com/) — collector reference
- [SteamAnalyst Blue Gem Guide](https://www.steamanalyst.com/guides/blue-gem) — #1 seeds per knife
- [isitabluegem.com](https://www.isitabluegem.com/) — pattern tiers
- [CSFloat](https://csfloat.com/) — marketplace pattern filters (reference)

**Coverage today:** full T1–T3 for **AK-47** and **Karambit**; T0–T1 for **M9**, **Five-SeveN**, **MAC-10**; **#1 Blue Gem** for all 20 CH knives; **#1 Gold Gem** started (e.g. Flip `#731`). Full T1–T4 for every knife can be added in future releases as bundled data grows.

### Search & filters (inventory + marketplace)

Horizontal bar above the item grid (same layout on both pages):

| Control | Inventory | Marketplace |
|---------|-----------|---------------|
| **Search** | Weapon or skin name | Weapon or skin name (uses API `item_name`) |
| **Rarity** | Consumer → Covert / Knives / Gloves → Contraband | Same |
| **Wear** | FN, MW, FT, WW, BS | Same |
| **Phase** | Phased only, Ruby/Sapphire/BP/Emerald, P1–P4 | — (not on marketplace; API has no `skin_index` per listing) |
| **CH tier** | Tiered only, #1 / T1–T3 blue, #1 / G1–G3 gold | Same (seed tier lists) |
| **Float order** | Low → High / High → Low | Same |
| **Price order** | — | Cheapest / Most expensive (coins) |
| **Clear** | Reset all filters | Reset all filters |

- Filters can be **combined** (e.g. Covert / Knives / Gloves + FN + Cheapest + Float Low→High on marketplace)
- Shows `Showing X of Y items` when filters hide cards
- Sorting reorders the visible grid without reloading the page

### Extension popup — Features, Settings & About (v3.2+)

Click the **extension icon** in the browser toolbar (Firefox / Chrome / Edge). The popup header shows **Inventory Helper** (always in English) plus your version badge. Three **top tabs**:

| Tab | What it contains |
|-----|------------------|
| **Features** | Feature toggles grouped by category (see below) + auto case opening / auto-sell subsection |
| **Settings** | **Language**, optional **browser sync**, **export / import** JSON backup |
| **About** | Version, live user counter, description, links (GitHub, AMO, Privacy, License), bundled **What's new** changelog, and update tools |

Each feature can be turned on or off; preferences are saved in **`storage.local`** by default, or in **`storage.sync`** when browser sync is enabled (extension storage — not site cookies).

#### Features tab — groups & order (v3.6+)

| Group | Toggles (top → bottom) |
|-------|-------------------------|
| **Inventory & browse** | Float & seed overlays → Search & filters |
| **Sell & protect** | Skin lock → Quick Sell & Market |
| **Trades** | Trade float & seed overlays → Trade offer search |
| **Cases** | Case bulk buy → Auto case opening (+ auto-sell rules) |

Skin lock is listed before Quick Sell so you protect items before using bulk sell tools. Case tools stay together at the bottom.

#### About tab & updates (v3.6+)

| Browser | Updates |
|---------|---------|
| **Firefox (AMO)** | Mozilla installs signed updates automatically when you install from [addons.mozilla.org](https://addons.mozilla.org/firefox/addon/csr-inventory-helper/). The About tab shows an AMO note instead of the GitHub checker. |
| **Chrome / Edge / Brave / Opera** | Optional **Auto-update check** (on by default) compares your version to the latest [GitHub release](https://github.com/smelbravo/CS-Restored-Inventory-Helper/releases) when you open the popup (cached ~1 hour). **Check for updates** always hits GitHub and shows a toast or opens a modal with a link to the release `.zip`. |

Manual Chromium install: download the release `.zip` from GitHub → `chrome://extensions` → Developer mode → **Load unpacked** (or replace files and **Reload**).

Update checker inspired by [CSR+](https://github.com/queryery/CSR-PLUS) (used with permission) — adapted for this repo (`smelbravo/CS-Restored-Inventory-Helper`). Trade partner inventory overlays (v3.8.3) use the same API pattern as CSR+ Trades — see [Credits](#credits--acknowledgments).

#### Language (v3.5+)

Choose a language under **Settings → Language**. Applies to the **toolbar popup** and **injected UI** on csrestored.fun (browse bar, Quick Sell panel, Cases panel, toasts, confirm dialogs). Reload the tab if some labels do not update immediately.

#### Browser sync & backup (v3.7+)

| Feature | What it does |
|---------|----------------|
| **Browser sync** | Optional toggle — when on, settings sync via **Firefox Sync** or **Chrome sync** (`storage.sync`). Off by default. |
| **Export settings** | Downloads a JSON backup (features, locks, case config, language, auto-update pref). Uses the `downloads` permission. |
| **Import settings** | Opens a dedicated import tab (Firefox-friendly), or paste JSON in the popup. Confirms before replacing settings. |
| **After import** | Open csrestored.fun tabs are notified so locks apply without a full reload (`tabs` permission). |

**Backup JSON includes:** `csrFeatureSettings`, `csrLockedWeaponIds`, `csrCasesAutoOpenSellConfig`, `csrCasesAutoOpenConfig`, `csrLanguage`, `csrAutoUpdateCheck`.

**Not in backup:** the browser-sync toggle itself (stays per device). Manual export/import is the way to move settings between Firefox and Chromium.

When you enable browser sync after importing, **local settings win** over stale cloud data (v3.7.4+).

Implementation: `csr-storage.js` — unified prefs API for local and sync storage.

#### Live user counter (v3.7.1+)

Popup header shows an approximate **ONLINE** count (CounterAPI, namespace `csr-inv-helper/online`). One anonymous ping per install per hour when you open the popup. Fails silently if the service is unreachable.

#### Language codes (v3.5+)

| Code | Language |
|------|----------|
| `en-US` | English (US) |
| `en-GB` | English (UK) |
| `pt-PT` | Português (Portugal) |
| `pt-BR` | Português (Brasil) |
| `de` | Deutsch |
| `ru` | Русский |
| `es` | Español |

- First install: language is guessed from the browser locale (`navigator.language`).
- Saved under `csrLanguage` in `storage.local`.
- **Rarity names** stay in **English** (Consumer Grade, Mil-Spec, Covert / Knives / Gloves, etc.) in all locales — same as the CS community convention.
- Wear abbreviations in overlays (FN, MW, FT, WW, BS) are unchanged.

| Toggle | What it controls |
|--------|------------------|
| **Float & seed overlays** | Wear, float, and paint seed badges on item cards |
| **Search & filters** | Browse bar on inventory, marketplace, and Create Offer |
| **Skin lock** | Padlock on inventory cards (see table below) |
| **Quick Sell & Market** | Bottom-right CS:R button, helper panel, and Confirm Sale flow |
| **Trade float & seed overlays** | Float/seed on trade pages and Send Trade Offer (turn off to reduce lag; requires **Float & seed overlays** on) |
| **Trade offer search** | Compact search bar in Send Trade Offer (My Items / Their Items) |
| **Case bulk buy** | Floating panel on [Cases](https://csrestored.fun/app/inventory/cases) — pick case + quantity, buy to in-game inventory |
| **Auto case opening** | Auto-open cases on [Cases](https://csrestored.fun/app/inventory/cases) — single or multi case, spend/time limits, session auto-sell, per-item sell, results sorted by float (**on by default**) |

#### Auto case opening — popup section (v3.5+)

When **Auto case opening** is enabled, the toolbar popup shows a **dedicated subsection** (not just a single checkbox):

| Setting | Options | Default |
|---------|---------|---------|
| **Multi case opening** | Cycle until spend limit / Fixed opens per case | **Cycle** |
| **Auto-sell session drops** | Manual — each item or bulk / Auto: all non-gold (★ kept) / Auto: selected rarities | **Manual** |
| **Rarity checkboxes** | Consumer → Contraband (when “selected rarities” is on) | All off |
| **When to auto-sell** | When session ends / After each case opens | When session ends |
| **Auto-sell batch size** | 1–20 | 5 |

- Auto-sell applies **only to skins dropped in the current auto-open run** — never your full inventory.
- **Manual** is the default — sell each drop with **Sell** on its row, or use bulk buttons (non-gold / by rarity).
- **Reset defaults** turns **Auto case opening** on and keeps auto-sell on **Manual**.

Saved in `storage.local` under `csrCasesAutoOpenSellConfig` (popup) plus `csrCasesAutoOpenConfig` (delay, minutes, spend limit, open mode, multi case IDs, multi strategy, per-case quotas on the Cases panel).

- Disabled features stop injecting UI and skip related work on the page (useful on large inventories or if you only want overlays).
- Changes apply within about **0.4 seconds** on the open tab, or immediately when you change a toggle in the popup.
- **Reset defaults** restores toggles (including **Auto case opening** on) and auto-sell to **Manual only**.

### Skin lock (v3.2+)

When **Skin lock** is enabled, each skin on **your inventory** (`/app/inventory`, not marketplace) gets a **padlock** in the **top-left** of the card. Click to lock / unlock. Locked cards get a subtle gold outline.

Use this if you sometimes sell by mistake while tired (e.g. items still selected for quick sell).

| Quick sell path | Blocked when skin is locked? |
|-----------------|------------------------------|
| Extension — **Start Picking** → select card | Yes — cannot pick locked skins |
| Extension — **Review & Sell** | Yes — locked skins skipped |
| Extension — **Sell by Rarity** | Yes — locked skins skipped |
| Extension — **Confirm Sale** → **Quick Sell** button | Yes — locked skins skipped |
| **CS:R website** — **Weapon Details** → site Quick Sell | **No** — that button belongs to the site, not the extension |

**List on Market** is not blocked by lock (only instant quick-sell paths above).

Lock state is stored per `weapon_id` in `storage.local` and syncs across tabs. The popup shows how many skins are currently locked.

### Quick Sell & Market panel (inventory only)

When **Quick Sell & Market** is enabled in the popup, the floating **CS:R button** (bottom-right on inventory) opens the helper panel:

- **Start Picking** — click cards to select items to sell (respects skin lock; duplicate skins matched by float/seed overlay, v3.7.5+)
- **Review & Sell** — confirm selection in a modal with validation
- **Sell by Rarity** — bulk sell all items of a chosen rarity tier (respects skin lock)
- **Batch size** (under **Speed**) — how many items are sold or listed **in parallel** during bulk Quick Sell or List on Market (see below)

Hidden on marketplace and trade pages. With the toggle off, the floating button and panel do not appear.

Panel labels (**Picker**, **Global**, **Speed**), status text, rarity dropdown, and batch-size label use **lighter text** on the dark background for readability (v3.4+).

#### Batch size (Speed slider)

Controls parallel API requests when you **Quick Sell** or **List on Market** from the Confirm Sale modal (bulk flows only — not single sells on the site).

| Setting | Range | Default |
|---------|-------|---------|
| **Batch size** | 1–20 | 5 |

- The extension processes items in **chunks** of this size (e.g. 30 items at batch size **5** → 6 rounds of 5 parallel requests).
- **Higher** (15–20) = faster bulk operations, but more load on the server — may fail or hit rate limits.
- **Lower** (1–3) = slower, but usually more reliable if you see errors.

Example reply for players: *“Batch size is how many skins get sold or listed at the same time during bulk Quick Sell / List on Market. Higher = faster; lower = safer if requests fail.”*

### Case bulk buy (Cases tab only, v3.3+)

When **Case bulk buy** is enabled, a **gold floating button** appears only on [`/app/inventory/cases`](https://csrestored.fun/app/inventory/cases) (the case shop grid, not a single case detail page).

- Choose **weapon case** and **quantity** (1–99)
- Shows **total coin cost** and your balance (from the site API)
- **Buy containers** calls the same API as the site’s **Buy Container** button (`POST /inventory/cases/buy/{id}`) once per case
- Purchased cases go to your **in-game inventory** — open them in CS:R like normal, not via the website opener

Use this for the “buy X cases in one click” workflow without clicking each case on the site.

### Auto case opening (Cases tab only, v3.4+)

When **Auto case opening** is enabled, the gold **Cases** panel on [`/app/inventory/cases`](https://csrestored.fun/app/inventory/cases) shows an **Auto open** tab (toggle in the extension popup; **on by default** for new installs / Reset defaults).

- **Search cases** — filter by name (bulk buy dropdown, single-case select, and multi-case list)
- **Open mode:** **Single case** (one case type, repeat) or **Multi case** (several types in one session) — v3.8+
- Configure **delay (ms)** (default and minimum **400**), **minutes** (time limit), and **spend limit (coins)** — saved in `storage.local` (`csrCasesAutoOpenConfig`)
- **Start auto open** loops `POST /inventory/cases/open/{caseId}` until limits, stop, or an error
- **Live log** during the run (rarity-colored drops, gold ★ highlighted)
- **Results** table when the session ends: every skin with **float + wear**, sorted **best float first** (lowest → highest)
- **Stop** cancels after the current open finishes
- Panel opens **anchored bottom-right** with **max height** and **internal scroll** so long sessions (log + results + sell controls) are not cut off at the top of the screen

If the API omits float on a drop, that row shows `—` and sorts after items with a known float.

If you see **Too Many Requests**, the CS:R server rate-limited the open request — increase **delay** (try **800–1500 ms**), wait a minute, and retry. This is unrelated to inventory size.

#### Multi case opening (v3.8+)

On the **Auto open** tab, switch **Open mode** to **Multi case**:

| Control | What it does |
|---------|----------------|
| **Multi open style** | **Cycle until limit** — rotate selected cases one-by-one until spend/coins/time runs out |
| | **Fixed per case** — set opens (1–99) per selected case; spend limit hidden (plan uses quantities + your balance) |
| **Case list** | Checkboxes for each case; quantity field on the right when **Fixed per case** is on |
| **Select all / Clear** | Bulk select (filtered list only when search is active) |

Strategy can be changed in the **toolbar popup** (Auto case opening → Multi case opening) or on the Cases panel — both stay in sync via `csrCasesAutoOpenConfig.multiStrategy`.

Summary line shows estimated opens (cycle) or planned breakdown (e.g. `5× Cobblestone, 3× Bravo · 8 opens`).

#### Session auto-sell (v3.5+)

Configure in the **toolbar popup** under **Auto case opening** (see table above). Sell controls on the Cases panel after a session:

| Popup auto-sell mode | Cases panel after session |
|----------------------|---------------------------|
| **Manual** | **Sell** on each row in results + **Quick sell all non-gold** + rarity dropdown / **Quick sell this rarity** + batch size |
| **Auto** (non-gold or selected rarities) | Only **Quick sell all non-gold (N)** for leftovers that did not match auto-sell rules |

- **Sell** (per item, v3.8+) — quick sell **one** drop; keep skins you like for your loadout
- **Quick sell all non-gold** — sell every ★-less drop from **this session only** (knives/gloves kept)
- **Quick sell this rarity** — sell one rarity tier from session drops (manual mode only)
- Auto-sell at **session end** runs in batch without a second confirm; **manual** actions still ask for confirmation
- **After each case opens** recycles coins faster but sends more sell requests — use batch size **1–2** if the site is slow

Uses the same `POST /inventory/sell/{weapon_id}` endpoint as Quick Sell. Locked skins (`weapon_id` in lock list) are skipped.

### Confirm Sale — marketplace list + quick sell (v3.1+)

When you open **Review & Sell**, the **Confirm Sale** modal shows each verified item with:

| Control | What it does |
|---------|----------------|
| **Quick sell: X coins** | Instant sell price (same value as the site’s **Quick Sell** button in Weapon Details) |
| **Market price (coins)** | Your listing price on the marketplace |
| **List on Market** | Lists all verified items at the prices you entered |
| **Quick Sell** | Instant sell at the site’s default price (`POST /inventory/sell/{weapon_id}`) |
| **Cancel** | Close without selling |

**List on Market** uses `POST /inventory/marketplace/add` with `{ weapon_id, price }`. If listing fails the first time, list one item manually on the site once — the extension learns the exact API body from that request for the rest of the session.

**Quick sell prices** use the same formula as the site (rarity base price × float factor; StatTrak ×1.5). No need to open each skin in Weapon Details first.

### Search in Send Trade Offer (v3.1.7+)

Compact **search bar** inside the trade modal (My Items and Their Items):

- Search by weapon or skin name; **Clear** resets the grid
- Switching **My Items ↔ Their Items** clears the search automatically
- Empty inventory slots are hidden; filtered items collapse without empty grid squares
- Full rarity/wear/float filters remain on Inventory, Marketplace, and Create Offer

## Trade overlay behaviour

- **Your offer / My items**: float + seed + pattern badges from your inventory (`GET /inventory/`)
- **Their offer / Their Items (trade partner)**: active fetch **`GET /users/{id}/inventory`** when you pick a friend in **Send Trade Offer** or open **trade detail** (Your offer / Their offer). Shows float, seed, **`skin_index`** (Doppler/Gamma phase), and Case Hardened tier when the API returns them — same badge rules as your inventory.
- Partner ID comes from the selected friend, `/users/friends` name match, or trade `initiator_id` / `recipient_id`. Inventory is cached per user for the session.
- Disable trade overlays in popup **Trades** → **Trade float & seed overlays** to reduce lag on large inventories (500+ skins).

Thanks to **query** ([CSR+](https://github.com/queryery/CSR-PLUS)) for documenting the `/users/{id}/inventory` endpoint and the trade-inventory approach used in CSR+ Trades — this feature was built with his guidance and permission. See [Credits](#credits--acknowledgments).

## Installation

### Firefox (recommended)

Install or update from **[Firefox Add-ons](https://addons.mozilla.org/firefox/addon/csr-inventory-helper/)** — signed build, automatic updates.

1. Open the link above (or search *CS:Restored Inventory Helper* on AMO)
2. Click **Add to Firefox**
3. Pin the extension on the toolbar if you like

### Chrome / Edge / Brave

1. Download the **`.zip`** from [GitHub Releases](https://github.com/smelbravo/CS-Restored-Inventory-Helper/releases) and unzip, **or** clone this repo
2. Open `chrome://extensions` (or `edge://extensions`)
3. Enable **Developer mode**
4. Click **Load unpacked** and select the folder that contains `manifest.json`

### Firefox — developers (GitHub `.zip`, temporary)

For testing unsigned builds before they reach AMO:

1. Download **`.zip`** from [GitHub Releases](https://github.com/smelbravo/CS-Restored-Inventory-Helper/releases) and unzip
2. **`about:debugging`** → **This Firefox** → **Load Temporary Add-on** → `manifest.json`  
   *(Reload after each Firefox restart.)*

The **`.xpi` on GitHub** is unsigned and **does not install** on Firefox Release via *Install from file* — use AMO or the temporary `.zip` method above.

### Updating

| Platform | How |
|----------|-----|
| **Firefox** | Updates automatically from [Firefox Add-ons](https://addons.mozilla.org/firefox/addon/csr-inventory-helper/); or **Add-ons** → gear → **Check for Updates** |
| **Chrome / Edge / Brave** | Replace folder → **Reload**, or remove and load again |
| **Firefox (temporary `.zip`)** | Reload via `about:debugging` after restart |

## Releases

Stable downloads: [GitHub Releases](https://github.com/smelbravo/CS-Restored-Inventory-Helper/releases) (latest: **v3.8.3**).

| Browser | Install |
|---------|---------|
| **Firefox** | [Firefox Add-ons](https://addons.mozilla.org/firefox/addon/csr-inventory-helper/) (signed, auto-update) |
| **Chrome, Edge, Brave** | [GitHub `.zip`](https://github.com/smelbravo/CS-Restored-Inventory-Helper/releases) → Load unpacked |

See **[Installation](#installation)** for details. GitHub `.xpi` is for AMO packaging only — use the store link on Firefox Release.

Build release packages locally:

```bash
python scripts/build-zip.py
```

Creates `releases/CS-Restored-Inventory-Helper-v{version}.zip` and `.xpi` (forward-slash paths). Release notes and older zips stay in `release-notes/` and `extension-zip/` (all gitignored locally).

Firefox Add-ons listing copy (local drafts): [`../amo-listing/`](../amo-listing/)

## Usage

1. Go to [csrestored.fun](https://csrestored.fun) and log in with Discord
2. (Optional) Click the **extension icon** in the toolbar → **Features**: enable what you want; **Settings**: language, browser sync, export/import; **About**: version info and (on Chromium) check for GitHub updates
3. Open **Inventory** or **Marketplace** — float/seed badges and the search/filter bar appear after items load (usually a few seconds)
4. On inventory: use the **padlock** (top-left of a card) to lock skins you must not sell by accident
5. If **Quick Sell & Market** is on: click the **CS:R logo button** (bottom-right) → **Start Picking** → **Review & Sell** → **List on Market** or **Quick Sell**
6. On **Cases** ([`/app/inventory/cases`](https://csrestored.fun/app/inventory/cases)), open the gold **Cases** button → **Bulk buy** and/or **Auto open**; configure auto-sell rules in the extension popup first if you want automatic selling
7. On **Play → Trades** / **Send Trade Offer**, overlays and trade search work when those toggles are enabled

## Permissions

| Permission | Why |
|------------|-----|
| `storage` | Feature toggles, locked skin IDs, case auto-open/sell config, language, auto-update preference — in `storage.local` and optionally `storage.sync` |
| `downloads` | Save exported JSON settings backup to Downloads |
| `tabs` | Notify open csrestored.fun tabs after import so locks and settings apply immediately |
| `*://*.csrestored.fun/*` | Inject UI on the site |
| `https://api.csrestored.fun/*` | Read inventory, marketplace, and trade data |
| `https://cdn.csrestored.fun/*` | Skin images in the sell modal |
| `https://api.github.com/*` | Check for new releases from the About tab (Chromium only) |
| `https://api.counterapi.dev/*` | Optional live user counter in popup header (one ping per hour) |
| `icons/*.png`, `docs/CHANGELOG.md` (web accessible) | Extension logo on the floating button, panel, popup; changelog in About tab |

## API endpoints used

| Endpoint | Purpose |
|----------|---------|
| `GET /inventory/` | Your inventory (float, seed, weapon_id, **skin_index** on phased skins) |
| `GET /inventory/marketplace/` | Marketplace listings (`skin_float`, `skin_seed`, price; **no `skin_index`**) |
| `GET /api/trades` | Trade offers (intercepted from site; not fetched by extension) |
| `GET /users/{id}/inventory` | Friend / trade partner inventory (float, seed, `skin_index` — Send Trade Offer Their Items, trade detail) |
| `GET /users/friends` | Friends list (name → user ID for trade partner fetch) |
| `GET /api/user/{id}/inventory` | Site inventory route (intercepted; may include quick sell prices) |
| `POST /inventory/sell/{weapon_id}` | Instant quick sell from Confirm Sale |
| `POST /inventory/marketplace/add` | List item on marketplace (`weapon_id`, `price`) |
| `GET /inventory/cases` | Case shop list (bulk buy panel) |
| `POST /inventory/cases/buy/{caseId}` | Buy one weapon case (bulk buy loops per quantity) |
| `POST /inventory/cases/open/{caseId}` | Auto-open one case (auto case opening) |

## Project structure

```
├── manifest.json              # Extension manifest (MV3)
├── LICENSE
├── README.md
├── src/
│   ├── content.js             # Content script (overlays, filters, quick-sell UI)
│   ├── lib/
│   │   ├── csr-storage.js     # Local + sync prefs, export/import
│   │   ├── settings.js        # Feature toggles & skin locks
│   │   ├── skin-patterns.js   # Doppler / Case Hardened patterns
│   │   ├── i18n.js            # Translation API (csrT, csrLoadLanguage, …)
│   │   ├── i18n-packs.js      # Locale packs (pt-PT, pt-BR)
│   │   └── i18n-packs-generated.js  # Full de/ru/es — scripts/build-locale-packs.js
│   └── popup/
│       ├── popup.html         # Toolbar popup (Features + Settings + About)
│       ├── popup.js
│       ├── popup.css
│       ├── import-backup.html # Dedicated import page (Firefox-friendly)
│       └── import-backup.js
├── data/
│   └── csr-doppler-item-map.json
├── docs/
│   ├── CHANGELOG.md           # Bundled release notes (About → What's new)
│   └── PRIVACY.md             # Privacy policy (store listings)
├── icons/                     # Extension icons (16, 48, 128, 300 px)
├── scripts/                   # build-zip.py, i18n tools, tests
├── release-notes/             # GitHub-style release note drafts (local)
└── releases/                  # Built .zip / .xpi (local, gitignored)
```

## Branches

| Branch | Description |
|--------|-------------|
| `main` | Stable releases |
| `develop` | Integration branch for next release |

## Changelog

### Unreleased (develop)

### v3.8.4

- **Fix:** Duplicate Case Hardened (and same-skin) inventory cards no longer reuse the same float/seed — batched overlay passes now track already-stamped items across batches; improved candidate disambiguation by wear/float/seed

### v3.8.3

- **New:** **Trade partner overlays** — float, seed, Doppler/Gamma phase, and CH tier on **Send Trade Offer → Their Items** and **trade detail (Their offer)** via `GET /users/{id}/inventory`
- **New:** Active partner fetch + per-user cache; friends list from `/users/friends` for name → ID
- **Credits:** [CSR+](https://github.com/queryery/CSR-PLUS) / **query (9uery)** — API approach and permission for trade partner inventory

### v3.8.2

- **New:** **Doppler / Gamma Doppler** phase badges (`skin_index` 415–421, 568–572, Glock 1119–1123) and **Case Hardened** tier badges (#1, T1–T3) on inventory, trades, Create Offer, marketplace (when map known)
- **Important:** Marketplace Doppler phases only when you have owned that `item_id` (or map learned) — API has no `skin_index`; otherwise float/seed only
- **Browse:** Phase filter on inventory + Create Offer only; CH tier filter on marketplace too
- **Fix:** Marketplace float/seed overlays restored; improved card matching
- **Structure:** `src/`, `data/`, `docs/` layout; build via `scripts/build-zip.py`

### v3.8.1

- **New:** **Trade float & seed overlays** toggle — disable float/seed on trade pages and Send Trade Offer (inventory unchanged)
- **Perf:** All float/seed overlays use unified **50-item batches** on scroll (inventory, marketplace, trades, modals)

### v3.8.0

- **New:** **Multi case opening** — Single / Multi toggle; cycle or fixed opens per case; strategy in popup + Cases panel
- **New:** **Case search** on Cases panel (dropdown and multi list)
- **New:** **Per-item Sell** in manual mode — keep drops you like; bulk non-gold / by rarity still available
- **Change:** Auto-open delay default and minimum **400 ms**
- **Fix:** Sell buttons available immediately when session ends; ID resolution retries; smoother one-by-one selling

### v3.7.5

- **Fix:** Quick Sell **Start Picking** — duplicate skins (same weapon/skin + wear) no longer show `ID: null` / Not matched in Confirm Sale
- **Fix:** Card matching uses overlay `weapon_id`, float/seed hints, and the same logic as float overlays

### v3.7.4

- **Fix:** Browser sync toggle no longer restores stale cloud/sync data over imported or local settings — local wins
- **Fix:** Import clears leftover sync keys; export with sync off reads only `storage.local`
- **Improvement:** Popup and csrestored.fun tabs refresh after toggling browser sync

### v3.7.3

- **Fix:** Export via `downloads` API; import opens dedicated tab (`import-backup.html`) — works on Firefox
- **New:** Paste JSON import; visible backup status in Settings
- **Fix:** Import always writes `storage.local`; notifies open csrestored.fun tabs after import
- **Permissions:** `downloads`, `tabs`

### v3.7.2

- **Fix:** Auto-open session mutex; Start disabled until end-of-session auto-sell completes
- **Fix:** Import confirmation modal, popup reload after import, lock cap (5000), storage error toasts
- **Fix:** Browser sync clears inactive storage area; marketplace listing, XSS, JSON-only fetch hooks
- **Improvement:** Cases batch size persists; ARIA tabs; Firefox min 128.0; import/export tests

### v3.7.1

- **New:** Live **ONLINE** user counter in popup header (CounterAPI; one ping/hour per install)
- **Permission:** `api.counterapi.dev`

### v3.7.0

- **New:** Optional **browser sync** (`storage.sync` — Firefox Sync / Chrome sync)
- **New:** **Export / import** JSON backup of all extension preferences
- **New:** `csr-storage.js` — unified prefs API for local and sync storage

See **[CHANGELOG.md](docs/CHANGELOG.md)** for the full per-version breakdown.

### v3.6.0

- **New:** **About** tab — version, description, GitHub / AMO / Privacy / License links, bundled **What's new** from `CHANGELOG.md`
- **New:** **Redesigned popup UI** — compact header (**Inventory Helper** title), **horizontal top tabs** (Features / Settings / About), grouped feature list, improved scroll and long-locale layout (pt/de/ru)
- **New:** **Feature groups** in popup — Inventory & browse → Sell & protect → Trades → Cases (logical order; skin lock before Quick Sell)
- **New:** **GitHub update checker** for Chromium (Chrome, Edge, Brave, Opera) — optional auto-check on popup open + manual **Check for updates** with release modal (pattern adapted from [CSR+](https://github.com/queryery/CSR-PLUS) with permission)
- **Note:** Firefox AMO installs still update through Mozilla's store; About tab shows AMO guidance instead of the GitHub checker
- **Storage:** `csrAutoUpdateCheck` in `storage.local` (default on for Chromium)
- **Permission:** `https://api.github.com/*` for release checks only
- **Fix:** About tab update checker on **Brave / Edge / Chrome** — no longer mistaken for Firefox (uses `runtime.getBrowserInfo`)
- **Build:** `CHANGELOG.md`, `PRIVACY.md`, and `LICENSE` included in release `.zip` / `.xpi`

### v3.5.0

- **New:** **Multi-language UI** — popup **Settings** tab with language picker (en-US, en-GB, pt-PT, pt-BR, de, ru, es); browse bar, Quick Sell, Cases panel, toasts, and confirms translated; rarity tier names stay English in all locales
- **New:** **Session auto-sell** for auto case opening — popup rules: manual (default), all non-gold, or selected rarities; sell when session ends or after each open; batch size 1–20
- **New:** **Quick sell session drops** on Cases panel — **Quick sell all non-gold** always available after a run; full manual block (rarity dropdown + sell-by-rarity + batch size) only when popup auto-sell is **Manual only**
- **New:** Toolbar popup **Auto case opening** subsection — master toggle + auto-sell options (collapsible when feature off)
- **Change:** **Auto case opening** toggle **on by default** (new installs / Reset defaults); auto-sell stays **Manual only** by default
- **Change:** Auto-open **delay default 1000 ms** (was 250) — reduces `Too Many Requests` from the case open API
- **UI:** Cases panel **bottom-right** anchor, **max-height**, scrollable body — panel no longer clips at the top when log/results grow
- **Storage:** `csrCasesAutoOpenSellConfig` and `csrLanguage` in `storage.local`

### v3.4.0

- **New:** **Auto case opening** — **Auto open** tab on `/app/inventory/cases`; configure delay, time limit, and spend limit (saved in `storage.local`); live drop log; **Stop** button; toggle in popup (default off)
- **New:** **Results table** after each auto-open session — every skin with float/wear, sorted **lowest float first** (best → worst)
- **Perf:** **Batched overlay loading** on large grids (**50+** cards) — 50 items at a time on inventory, marketplace, trades, and picker modals (reduces lag with 200+ items)
- **Perf:** Info toast for very large lists (**200+** items on inventory or marketplace)
- **Fix:** **Quick Sell & Market** panel — brighter labels (**Picker**, **Global**, **Speed**), status text, rarity dropdown, and batch-size label
- **Fix:** Confirm Sale modal subtitle contrast improved

### v3.3.0

- **New:** **Case bulk buy** — gold floating panel on `/app/inventory/cases`; pick case + quantity (1–99), buy containers via site API (toggle in toolbar popup)
- **Fix:** search & filters bar stays **static** when the CS:R sidebar expands (no margin shift, no remount/disappear loop)
- **Fix:** extension UI (browse bar, skin lock icons) stays **below** the site sidebar (`z-index` + hide locks when overlapping nav)
- **Fix:** case bulk buy quantity field allows normal typing (normalize on blur, not on every keystroke)

### v3.2.7

- **Published on [Firefox Add-ons](https://addons.mozilla.org/firefox/addon/csr-inventory-helper/)** (signed v3.2.7)
- **Fix:** Firefox — settings popup opens on first click (`popup.js` standalone; does not load `settings.js` on open)
- **Fix:** browse/search, Create Offer layout, and popup regressions shipped in v3.2.2–v3.2.6 (merged to `main`)
- **Docs:** batch size (Speed slider) — parallel sell/list count (1–20) explained in README
- **Docs:** Firefox install — unsigned `.xpi` from GitHub does not work on Release; use `.zip` + `about:debugging`, AMO when signed, or Developer Edition for permanent `.xpi`
- **Build:** `scripts/build-zip.py` outputs both `.zip` (Chromium) and `.xpi` (AMO / Developer Edition)

### v3.2.6

- **Fix:** Firefox — removed invalid `gecko.background`, `firefox-background.js`, and `options_ui` (these caused manifest warnings and made the toolbar icon need multiple clicks)
- **Fix:** popup back to simple `default_popup` only; static HTML + sync render (no `await` before UI)

### v3.2.5

- **Reverted in v3.2.6:** Firefox `gecko.background` / `options_ui` experiment (invalid manifest + worse click behaviour)

### v3.2.4

- **Fix:** Firefox — removed `background.service_worker` (unsupported when loading temporary add-ons); popup still renders immediately without a background script

### v3.2.3

- **Fix:** **Create Offer** — search/filters row no longer has a huge gap (dedicated layout class; filters not pushed with `margin-left: auto`)
- **Fix:** **Create Offer** — item grid stays under the toolbar (grid parent detection prefers the real card grid, not the modal flex wrapper)
- **Fix:** toolbar popup renders immediately on open (no empty wait for storage)

### v3.2.2

- **Fix:** search & filters stay active when **Float & seed overlays** is off (browse no longer tied to overlay bootstrap)
- **Fix:** **Create Offer** modal — browse bar no longer flickers; item grid scoped to the modal (marketplace cards are not hidden/moved)
- **Fix:** closing **Create Offer** no longer leaves marketplace skins oversized (safer hide CSS + grid restore on close)

### v3.2.1

- **Fix:** floating Quick Sell button stays hidden when **Quick Sell & Market** is off in the popup
- **Fix:** lock icon on **top-left** of inventory card (no longer overlaps float badge)
- **Docs:** skin lock scope — extension quick sell only, not site Weapon Details

### v3.2.0

- **New:** toolbar **popup** (`popup.html`) — toggle each feature on/off
- **New:** `settings.js` + `storage` permission — preferences and lock list in `storage.local`
- **New:** **Skin lock** — padlock on inventory cards; locked `weapon_id`s excluded from extension quick sell flows
- **New:** `action.default_popup` in manifest (click extension icon to open settings)

### v3.1.16

- **UI:** wider float sort dropdown — full **Float: Low → High** label visible

### v3.1.15

- **Fix:** Send Trade Offer — search clears when switching My Items ↔ Their Items

### v3.1.14

- **Fix:** trade search hides entire grid cells (not just skin icons); no empty squares when filtering

### v3.1.13

- **Fix:** trade picker filter targets outer grid slots; **Clear** restores full inventory

### v3.1.12

- **Fix:** Send Trade Offer modal detection — no giant search bar on Trades page after picking a friend

### v3.1.11

- **Fix:** trade search bar stays under “Select Your/Their Items” on both tabs

### v3.1.10

- **UI:** wider rarity dropdown for **Covert / Knives / Gloves**

### v3.1.9

- **UI:** rarity label **Covert / Knives / Gloves** in all filters and Quick Sell panel

### v3.1.8

- **Fix:** Send Trade Offer — compact search bar under “Select Your Items” (no grid break / skeleton rows)
- **Fix:** trade picker no longer reorders DOM cards (React layout stays intact)
- **Fix:** empty inventory slots hidden more reliably in Send Trade Offer
- **Note:** Send Trade Offer uses search only (filters stay on Inventory, Marketplace, Create Offer)

### v3.1.7

- **Fix:** regression — inventory/marketplace/create offer skins visible again (removed overly strict card filter)
- **Fix:** search/filters on Send Trade Offer and Create Offer modals

### v3.1.6

- **Fix:** Send Trade Offer search bar — hide empty inventory slots (no more grey placeholder rows)
- **Fix:** market list max **999,999** coins; avoids wrong price / quick-sell payload when over limit

### v3.1.5

- **UI:** smaller search bar and filters; sidebar offset only when nav is expanded
- **UI:** Confirm Sale market price input empty by default; remove (×) beside input

### v3.1.4

- **UI:** panel renamed **Quick Sell & Market** with clearer subtitle
- **UI:** Confirm Sale remove (×) button no longer overlaps market price input
- **UI:** search/filters hide under Weapon Details modal; sidebar inset on inventory/marketplace
- **UI:** search + filters in **Send Trade Offer** (My Items / Their Items)

### v3.1.3

- **Fix:** quick sell price in Confirm Sale — calculated locally with the site formula (rarity + float + StatTrak)
- Removed failed API prefetch requests (404 spam in Network tab)

### v3.1.2

- Quick sell cache from Weapon Details DOM + `/api/user/.../inventory` intercept

### v3.1.1

- **Fix:** marketplace list via `POST /inventory/marketplace/add`

### v3.1.0

- **Confirm Sale:** per-item **market price** input + **List on Market** button (working)
- **Confirm Sale:** **Quick Sell** button (site default instant sell) + **quick sell price** on each card
- Learns marketplace list API URL when you list an item on the site (session)

### v3.0.9

- **Fix:** float/seed slow to appear or only after tab change (regression from v3.0.8 performance work)
- Instant overlay refresh when API data arrives (no idle callback delay)
- Fast retry while SPA loads item cards; DOM observer for new cards (inventory, marketplace, Send Trade Offer)
- Send Trade Offer modal applies overlays when opened (no need to switch My Items ↔ Their Items)
- Item lookup index for large inventories (500–1000+ skins) — much faster matching
- One-time warning toast if inventory has 500+ items

### v3.0.8

- **Performance:** overlays update incrementally (no full tear-down every 2s) — fixes freezing on large inventories (Brave, Edge, Chrome)
- **Performance:** browse filters no longer re-run on a background poll loop
- Background refresh every 8s; urgent refresh when API data arrives
- Faster first paint when cache is already available; browse bar retries while the SPA loads
- **Fix:** inventory float/seed missing (regression: `fetchInventory` did not update `inventoryCache`)
- **Fix:** inventory API responses no longer misclassified as marketplace data
- Name-based item matching on inventory when image ID matching fails

### v3.0.7

- Panel title: **CS:R Inventory Helper**
- Extension logo on floating button and panel header (full-bleed, red border)
- `web_accessible_resources` for icons

### v3.0.6

- Replaced star SVG with extension icon on FAB and panel header

### v3.0.5

- Combined **price + float** sort on marketplace (e.g. cheapest first, then lowest float)
- Float read from DOM when API item match is missing

### v3.0.4

- Marketplace search matches **weapon name** via API `item_name`
- Browse bar layout aligned with marketplace style on inventory

### v3.0.3

- Fixed browse bar mount (no longer stuck in left sidebar)
- Fixed sidebar false-positive detection

### v3.0.2

- Fixed rarity filter mapping (API uses 1–7: Consumer → Contraband)
- Browse bar placement before item grid

### v3.0.0 – v3.0.1

- Search & filters on inventory and marketplace
- Rarity, wear, float sort, marketplace price sort
- Browse bar init retries when SPA loads items

### v2.9.x

- Firefox `data_collection_permissions`, `PRIVACY.md`, site requirements in README
- Extension icons (16/48/128/300)
- Rebrand to **CS:Restored Inventory Helper**
- Trade overlays, network loop fix, `/app/play` support

### v2.0 – v2.8

- Inventory/marketplace float overlays, CSR Seller, trade API integration

## Performance & troubleshooting

The **search/filter bar** loads with the page. **Float/seed badges** appear once your item data is loaded and cards are visible — usually within a few seconds.

### Large inventories (200+ skins)

With **50+** item cards, float/seed badges load in **batches of 50** (visible cards on scroll, then more near the bottom) on inventory, marketplace, trades, and picker modals. The extension shows a **one-time info message** at **200+** items. Very large inventories can still feel slow because the CS:R site itself loads many cards — if the page freezes, reload or use a fresh tab.

**Tips:**

1. Reload the extension after updating (`about:debugging` → Reload)
2. Turn off unused features in the **extension popup** (less UI and CPU on huge inventories)
3. Use a **fresh tab** if Firefox/Chrome has been open for hours with many tabs
4. Close unused tabs to free memory

**If float/seed never appear:** reload the page while logged in. On **Send Trade Offer**, overlays should show on **My Items** without switching tabs. Report browser + inventory size on [GitHub Issues](https://github.com/smelbravo/CS-Restored-Inventory-Helper/issues).

## Known limitations

- **Marketplace Doppler/Gamma phases:** listing API has no `skin_index`. Phase badges on marketplace grid only when **`item_id` → paint index** is known (you owned that Doppler type, trades/case opens, or bundled map). Otherwise listings show float/seed only. Phase **browse filter** is not on marketplace for this reason.
- **Other player's items** in trades / Their Items: uses `GET /users/{id}/inventory` when you open **Send Trade Offer → Their Items** or view a trade detail (float, seed, Doppler phase, CH tier when the API returns them). Requires you to be logged in; the API must allow viewing that player's inventory. Trade list rows without opening detail may still lack overlays until partner inventory is loaded.
- **Case open / bulk sell rate limits:** CS:R may return **Too Many Requests** when many players open cases or quick-sell at once, or when delay/batch size is too aggressive. Lower delay between opens, use auto-sell batch size 1–2, or wait and retry — not caused by large inventory overlays.
- **Pin images** missing on the site are a **CS:R website** issue (assets not uploaded yet), not the extension.

## Disclaimer

This extension is **not affiliated** with Valve Corporation or the CS:Restored team. Use at your own risk. Selling items is irreversible — always review the confirmation modal.

## Credits & acknowledgments

| Contributor | What |
|-------------|------|
| **[query (9uery)](https://github.com/queryery)** — [CSR+](https://github.com/queryery/CSR-PLUS) | **v3.8.3** — trade partner float/seed/pattern overlays: documented `GET /users/{id}/inventory` and the trade-inventory workflow used in CSR+ Trades; implementation adapted with permission |
| **query / CSR+** | **v3.6+** — GitHub update checker pattern (About tab) |
| **query / CSR+** | **v3.7.1** — live user counter pattern (CounterAPI) |

## License

MIT — see [LICENSE](LICENSE).

---

## Store listing copy (Firefox / Edge)

### Name

**CS:Restored Inventory Helper**

### Summary (short description)

```
Float, seed, quick sell, cases bulk buy & auto open, session auto-sell, 7 languages, skin lock. CS:Restored (csrestored.fun). Unofficial — browser session only.
```

### About / Description (Firefox — public)

```
CS:Restored Inventory Helper is an unofficial browser extension for Counter-Strike: Restored (https://csrestored.fun). It adds quality-of-life tools on top of the official website — everything runs locally in your browser using your existing login session. No data is sent to third-party servers.

WHAT IT DOES

• Float & seed overlays — wear (FN/MW/FT/WW/BS), float value, and paint seed on inventory, marketplace, and trade item cards
• Doppler / Gamma Doppler phase badges (Ruby, Sapphire, P1–P4, Emerald…) and Case Hardened tier badges (#1, T1–T3) on inventory and trades; on marketplace only when you have owned that Doppler item_id (API has no skin_index per listing)
• Search & filters — filter by name, rarity, wear, phase (inventory + Create Offer), CH tier, float order, and (on marketplace) price; works on Inventory, Marketplace, and Create Offer; bar stays in place when the site sidebar expands
• Quick Sell & Market panel — floating helper on inventory: pick items, sell by rarity, review before selling, list on marketplace or quick sell in bulk
• Batch size control — choose how many items are sold or listed in parallel (1–20) for faster or safer bulk operations
• Confirm Sale modal — per-item quick sell price, market price input, List on Market and Quick Sell buttons with validation
• Case bulk buy — on the Cases tab (/app/inventory/cases), buy multiple weapon cases at once (quantity 1–99) using your coin balance; purchased cases go to your in-game inventory (toggle in extension settings)
• Auto case opening — Auto open tab on Cases: delay (default 1000 ms), time limit, spend limit; live log; results sorted by float; optional session auto-sell (manual default, non-gold, or by rarity) configured in toolbar popup; Quick sell session drops after a run
• Multi-language UI — popup Settings tab: English (US/UK), Portuguese (PT/BR), German, Russian, Spanish; rarity names stay English
• Batched overlays on large grids — float/seed badges load 50 at a time (50+ cards) to reduce lag; scroll to load more
• Trade partner overlays (v3.8.3) — float, seed, Doppler phase, CH tier on Send Trade Offer Their Items and trade detail via GET /users/{id}/inventory (thanks to query / CSR+ for the API approach)
• Trade float & seed overlays — toggle float/seed on trade pages and Send Trade Offer (disable to reduce lag)
• Trade offer search — compact search bar in Send Trade Offer (My Items / Their Items)
• Toolbar settings popup — Features tab (toggles) + Settings tab (language); preferences saved in extension storage
• Skin lock — padlock on inventory cards to block accidental quick sell from the extension (does not block the site’s own Weapon Details button)

WHERE IT WORKS

• Inventory (/app/inventory)
• Marketplace (/app/inventory/marketplace)
• Cases shop (/app/inventory/cases) — bulk buy and auto open panels
• Trade views (/app/play) — float/seed for your own items when inventory data is available
• Send Trade Offer modal — search on item grid (My Items / Their Items)

REQUIREMENTS (from the CS:Restored website)

• Log in with Discord at https://csrestored.fun
• Steam level greater than 0
• At least 25 hours of CS2 playtime

PRIVACY

• Runs only on csrestored.fun
• Does not collect or send data to external servers
• Reads site API data in your browser session to display overlays and filters
• Feature toggles, language, locked skin IDs, and case auto-sell settings stored locally in extension storage (storage.local)

Source: https://github.com/smelbravo/CS-Restored-Inventory-Helper
Privacy: https://github.com/smelbravo/CS-Restored-Inventory-Helper/blob/main/docs/PRIVACY.md

NOT AFFILIATED with Valve Corporation or the CS:Restored team.

LIMITATION: Float/seed for other players' items in trades is not available until the site API provides those fields.
Marketplace Doppler/Gamma phase badges require a learned item_id map (typically after owning that skin type); otherwise marketplace shows float/seed only.
```

### Privacy policy URL

```
https://github.com/smelbravo/CS-Restored-Inventory-Helper/blob/main/docs/PRIVACY.md
```

### Support site

```
https://github.com/smelbravo/CS-Restored-Inventory-Helper
```

### Notes for reviewer (private)

```
Extension: CS:Restored Inventory Helper (v3.5.0)
Works only on https://csrestored.fun when logged in.

Site requirements (enforced by CS:Restored, not the extension):
• Steam level greater than 0
• CS2 playtime: at least 25 hours

How to test:
1. Go to https://csrestored.fun and log in with Discord (reviewer can use their own account if it meets the requirements above).
2. Click the extension icon in the toolbar:
   - **Features** tab: toggle features on/off (e.g. disable Quick Sell & Market → floating button should disappear on inventory)
   - **Settings** tab: change language (e.g. Português) — reload tab; Cases panel and Quick Sell labels should update
   - Skin lock toggle + count of locked skins
3. Inventory (/app/inventory):
   - Float/wear/seed badges on item cards (bottom-right)
   - Padlock top-left on cards — lock a skin, then try Quick Sell / Sell by Rarity (locked skins skipped)
   - Search & filter bar above the item grid (name, rarity, wear, float sort)
   - Bottom-right CS:R logo button → quick-sell panel (Start Picking, Sell by Rarity, batch size) when toggle is on
4. Marketplace (/app/inventory/marketplace):
   - Badges below the price on each listing
   - Same search/filter bar; try searching "M4A4", filters for rarity/wear, price and float sort
   - Hover-expand the site left sidebar — search bar should not jump or disappear
5. Cases (/app/inventory/cases):
   - Gold floating button → **Bulk buy** tab (case dropdown, quantity 1–99, Buy containers) when Case bulk buy toggle is on
   - Same panel → **Auto open** tab: delay (default 1000 ms), minutes, spend limit, Start/Stop, results table sorted by float
   - Extension popup → **Auto case opening** section: auto-sell manual / non-gold / rarities; when manual, full sell-session controls after a run; **Quick sell all non-gold** always shown for leftovers
   - Panel should sit bottom-right and scroll internally when log/results are long
6. Send Trade Offer (site modal):
   - Open Send Trade Offer → pick a friend → modal opens normally
   - My Items / Their Items: compact search under “Select … Items”; Clear resets; tab switch clears search
   - Float/seed on My Items; Their Items depends on site API
7. Play → Trades (/app/play): open a trade — float/seed on your own items when the site API provides them (other players' items may not show float/seed until the site exposes those fields).

Storage: feature toggles and locked weapon IDs use storage.local only (no cookies, no external servers).

Large inventories:
- With 200+ items, overlays load in batches as you scroll (lazy loading). Page may still feel heavy on weak PCs due to site rendering.
- Quick Sell panel text should be clearly readable (Picker / Global / Speed labels).

Data collection: The extension declares required ["none"] in the manifest. It does not transmit data to developer servers. It only reads csrestored.fun API responses in the page (via the site's own fetch/XHR) to match float/seed to UI cards and power filters.

Privacy policy: https://github.com/smelbravo/CS-Restored-Inventory-Helper/blob/main/docs/PRIVACY.md
Source code: https://github.com/smelbravo/CS-Restored-Inventory-Helper
Support: https://github.com/smelbravo/CS-Restored-Inventory-Helper/issues
```

### Firefox categories

- Games & entertainment
- Shopping

### Edge search terms

```
csrestored, cs restored, float, seed, inventory, marketplace, skins, counter-strike, inventory helper
```
