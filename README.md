# CS:Restored Inventory Helper

Unofficial browser extension for [Counter-Strike: Restored](https://csrestored.fun) — float and paint seed overlays, search and filters on inventory/marketplace, and a quick-sell panel for your own items.

Works in **Firefox**, **Microsoft Edge**, and **Chromium** browsers (Manifest V3).

**Current version:** `3.1.16` (on branch `main`)

**Repository:** [github.com/smelbravo/CS-Restored-Inventory-Helper](https://github.com/smelbravo/CS-Restored-Inventory-Helper)

## Site requirements (CS:Restored)

The extension only works on [csrestored.fun](https://csrestored.fun). To use the site (and this extension), you need:

- **Steam level** greater than 0
- **CS2 playtime:** at least 25 hours

Log in with Discord on the website after meeting these requirements.

## Features

### Float & pattern overlays (your items)

Shows **wear abbreviation** (FN, MW, FT, WW, BS), **float value** (e.g. `0.1962`), and **paint seed** (`#640`) on item cards. Color-coded float dot (green → yellow → red by wear).

| Page | Route | Notes |
|------|-------|-------|
| **Inventory** | `/app/inventory` | Badges in the bottom-right corner of each card |
| **Marketplace** | `/app/inventory/marketplace` | Badges below the price (top-right) |
| **Trade views** | `/app/play`, `/app/inventory/trade-up` | Float/seed for **your** items when inventory data is available |
| **Send Trade Offer** | Modal on site | Search on item grid (My Items / Their Items); filters on Inventory, Marketplace, Create Offer; **Their Items** float/seed depends on site API (see limitations) |

Data is matched by offer ID, skin image, wear, StatTrak, and name. The extension reads data from the site's own API responses in your browser session — it does not send data to external servers or spam duplicate API calls.

### Search & filters (inventory + marketplace)

Horizontal bar above the item grid (same layout on both pages):

| Control | Inventory | Marketplace |
|---------|-----------|---------------|
| **Search** | Weapon or skin name | Weapon or skin name (uses API `item_name`) |
| **Rarity** | Consumer → Covert / Knives / Gloves → Contraband | Same |
| **Wear** | FN, MW, FT, WW, BS | Same |
| **Float order** | Low → High / High → Low | Same |
| **Price order** | — | Cheapest / Most expensive (coins) |
| **Clear** | Reset all filters | Reset all filters |

- Filters can be **combined** (e.g. Covert / Knives / Gloves + FN + Cheapest + Float Low→High on marketplace)
- Shows `Showing X of Y items` when filters hide cards
- Sorting reorders the visible grid without reloading the page

### Quick Sell & Market panel (inventory only)

Floating button (bottom-right on inventory) opens the **Quick Sell & Market** panel:

- **Start Picking** — click cards to select items to sell
- **Review & Sell** — confirm selection in a modal with validation
- **Sell by Rarity** — bulk sell all items of a chosen rarity tier
- **Batch size** slider — parallel sell requests (1–10)

Hidden on marketplace and trade pages.

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

- **Your offer / My items**: float + seed from your inventory (`GET /inventory/`)
- **Their offer / Other player's items**: **not supported** — site API does not expose float/seed for other players' trade items (see limitations)

## Installation (developer / temporary)

### Firefox

1. Open `about:debugging` → **This Firefox** → **Load Temporary Add-on**
2. Select `manifest.json` from this folder

### Chrome / Edge / Brave

1. Open `chrome://extensions` (or `edge://extensions`)
2. Enable **Developer mode**
3. Click **Load unpacked** and select this folder

## Releases

| Version | Tag | Notes |
|---------|-----|-------|
| **3.1.16** | [v3.1.16](https://github.com/smelbravo/CS-Restored-Inventory-Helper/releases/tag/v3.1.16) | [RELEASE_NOTES-v3.1.16.md](RELEASE_NOTES-v3.1.16.md) |

Build the install zip locally:

```bash
python build-zip.py
```

Creates `../releases/CS-Restored-Inventory-Helper-v{version}.zip` (AMO-compatible paths).

## Usage

1. Go to [csrestored.fun](https://csrestored.fun) and log in with Discord
2. Open **Inventory** or **Marketplace** — wait for the site to load your items; float/seed badges and the search/filter bar appear shortly after (usually a few seconds)
3. On inventory, click the **CS:R logo button** (bottom-right) to open the helper panel
4. **Start Picking** → select skins → **Review & Sell** → set market prices and use **List on Market** or **Quick Sell**
5. On **Play → Trades**, overlays show on your items in trade detail views when data is available

## Permissions

| Permission | Why |
|------------|-----|
| `*://*.csrestored.fun/*` | Inject UI on the site |
| `https://api.csrestored.fun/*` | Read inventory, marketplace, and trade data |
| `https://cdn.csrestored.fun/*` | Skin images in the sell modal |
| `icons/*.png` (web accessible) | Extension logo on the floating button and panel |

## API endpoints used

| Endpoint | Purpose |
|----------|---------|
| `GET /inventory/` | Your inventory (float, seed, weapon_id) |
| `GET /inventory/marketplace/` | Marketplace listings (`skin_float`, `skin_seed`, price) |
| `GET /api/trades` | Trade offers (intercepted from site; not fetched by extension) |
| `GET /users/{id}/inventory` | Friend inventory for Send Trade Offer (Their Items) |
| `GET /api/user/{id}/inventory` | Site inventory route (intercepted; may include quick sell prices) |
| `POST /inventory/sell/{weapon_id}` | Instant quick sell from Confirm Sale |
| `POST /inventory/marketplace/add` | List item on marketplace (`weapon_id`, `price`) |

## Project structure

```
├── manifest.json   # Extension manifest (MV3)
├── content.js      # Content script (overlays, filters, quick-sell UI)
├── icons/          # Extension icons (16, 48, 128, 300 px)
├── PRIVACY.md      # Privacy policy (store listings)
├── LICENSE         # MIT
└── README.md
```

## Branches

| Branch | Description |
|--------|-------------|
| `main` | Stable releases |
| `develop` | Active development |

## Changelog

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

### Large inventories (500–1000+ skins)

Matching float/seed to items is heavier with very large inventories. The extension shows a **one-time warning** at 500+ items and uses optimized lookups, but you may still see a short delay or brief page slowdown on low-end PCs. If the site becomes unresponsive, reload the page or use a fresh browser tab.

**Tips:**

1. Reload the extension after updating (`about:debugging` → Reload)
2. Use a **fresh tab** if Firefox/Chrome has been open for hours with many tabs
3. Close unused tabs to free memory

**If float/seed never appear:** reload the page while logged in. On **Send Trade Offer**, overlays should show on **My Items** without switching tabs. Report browser + inventory size on [GitHub Issues](https://github.com/smelbravo/CS-Restored-Inventory-Helper/issues).

## Known limitations

- **Other player's items** in trades / Their Items: CS:R API does not expose `float`, `seed`, and `weapon_id` for the other player's items. Third-party tools cannot show accurate values until the site adds these fields to `/api/trades` and `/users/{id}/inventory`.
- **Pin images** missing on the site are a **CS:R website** issue (assets not uploaded yet), not the extension.

## Disclaimer

This extension is **not affiliated** with Valve Corporation or the CS:Restored team. Use at your own risk. Selling items is irreversible — always review the confirmation modal.

## License

MIT — see [LICENSE](LICENSE).

---

## Store listing copy (Firefox / Edge)

### Name

**CS:Restored Inventory Helper**

### Summary (short description)

```
Float, seed, search, filters, and quick-sell for CS:Restored (csrestored.fun).
```

### About / Description (Firefox — public)

```
CS:Restored Inventory Helper is an unofficial browser extension for Counter-Strike: Restored (https://csrestored.fun).

WHAT IT DOES
• Shows float, wear (FN/MW/FT/WW/BS), and paint seed on your inventory and marketplace item cards
• Search and filter items by name, rarity, wear, float, and price (marketplace)
• Quick-sell panel on your inventory — pick items, sell by rarity, or review before selling

WHERE IT WORKS
• Inventory (/app/inventory)
• Marketplace (/app/inventory/marketplace)
• Trade views (/app/play) and Send Trade Offer — float/seed for your own items (My Items)

LARGE INVENTORIES (500+ skins)
• Float/seed may take a few extra seconds to appear; very large inventories (1000+) can slow the page on weaker PCs

REQUIREMENTS (from the CS:Restored website)
• Log in with Discord at https://csrestored.fun
• Steam level greater than 0
• At least 25 hours of CS2 playtime

PRIVACY
• Runs only on csrestored.fun
• Does not collect or send data to external servers
• Reads site API data in your browser session to display overlays and filters

NOT AFFILIATED with Valve Corporation or the CS:Restored team.

LIMITATION: Float/seed for other players' items in trades is not available until the site API provides those fields.
```

### Privacy policy URL

```
https://github.com/smelbravo/CS-Restored-Inventory-Helper/blob/main/PRIVACY.md
```

### Support site

```
https://github.com/smelbravo/CS-Restored-Inventory-Helper
```

### Notes for reviewer (private)

```
Extension: CS:Restored Inventory Helper (v3.1.16)
Works only on https://csrestored.fun when logged in.

Site requirements (enforced by CS:Restored, not the extension):
• Steam level greater than 0
• CS2 playtime: at least 25 hours

How to test:
1. Go to https://csrestored.fun and log in with Discord (reviewer can use their own account if it meets the requirements above).
2. Inventory (/app/inventory):
   - Float/wear/seed badges on item cards (bottom-right)
   - Search & filter bar above the item grid (name, rarity, wear, float sort)
   - Bottom-right CS:R logo button → quick-sell panel (Start Picking, Sell by Rarity, batch size)
3. Marketplace (/app/inventory/marketplace):
   - Badges below the price on each listing
   - Same search/filter bar; try searching "M4A4", filters for rarity/wear, price and float sort
4. Send Trade Offer (site modal):
   - Open Send Trade Offer → pick a friend → modal opens normally
   - My Items / Their Items: compact search under “Select … Items”; Clear resets; tab switch clears search
   - Float/seed on My Items; Their Items depends on site API
5. Play → Trades (/app/play): open a trade — float/seed on your own items when the site API provides them (other players' items may not show float/seed until the site exposes those fields).

Large inventories:
- With 500–1000+ items, float/seed may take a few extra seconds to appear and may slow the page on weaker PCs.

Data collection: The extension declares required ["none"] in the manifest. It does not transmit data to developer servers. It only reads csrestored.fun API responses in the page (via the site's own fetch/XHR) to match float/seed to UI cards and power filters.

Privacy policy: https://github.com/smelbravo/CS-Restored-Inventory-Helper/blob/main/PRIVACY.md
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
