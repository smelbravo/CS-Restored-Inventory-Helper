# CS:Restored Inventory Helper

Unofficial browser extension for [Counter-Strike: Restored](https://csrestored.fun) — float and paint seed overlays, search and filters on inventory/marketplace, and a quick-sell panel for your own items.

Works in **Firefox**, **Microsoft Edge**, and **Chromium** browsers (Manifest V3).

**Current version:** `3.0.8`

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
| **Send Trade Offer** | Modal on site | **My Items** works; **Their Items** depends on site API (see limitations) |

Data is matched by offer ID, skin image, wear, StatTrak, and name. The extension reads data from the site's own API responses in your browser session — it does not send data to external servers or spam duplicate API calls.

### Search & filters (inventory + marketplace)

Horizontal bar above the item grid (same layout on both pages):

| Control | Inventory | Marketplace |
|---------|-----------|---------------|
| **Search** | Weapon or skin name | Weapon or skin name (uses API `item_name`) |
| **Rarity** | Consumer → Contraband | Same |
| **Wear** | FN, MW, FT, WW, BS | Same |
| **Float order** | Low → High / High → Low | Same |
| **Price order** | — | Cheapest / Most expensive (coins) |
| **Clear** | Reset all filters | Reset all filters |

- Filters can be **combined** (e.g. Covert + FN + Cheapest + Float Low→High on marketplace)
- Shows `Showing X of Y items` when filters hide cards
- Sorting reorders the visible grid without reloading the page

### CS:R Inventory Helper panel (inventory only)

Floating button (bottom-right on inventory) opens the **CS:R Inventory Helper** panel:

- **Start Picking** — click cards to select items to sell
- **Review & Sell** — confirm selection in a modal with validation
- **Sell by Rarity** — bulk sell all items of a chosen rarity tier
- **Batch size** slider — parallel sell requests (1–10)

Hidden on marketplace and trade pages.

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

## Usage

1. Go to [csrestored.fun](https://csrestored.fun) and log in with Discord
2. Open **Inventory** or **Marketplace** — wait for the site to load your items; float/seed badges and the search/filter bar appear shortly after (usually a few seconds)
3. On inventory, click the **CS:R logo button** (bottom-right) to open the quick-sell panel
4. On **Play → Trades**, overlays show on your items in trade detail views when data is available

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
| `POST /inventory/sell/{weapon_id}` | Sell items via quick-sell panel |

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

Float/seed badges and the search bar appear **after** the site loads your items and the extension reads inventory data from the page session. On a fast connection this is usually a few seconds; on a slow or busy PC (many browser tabs, Firefox open for a long time, large inventories with 500+ items) it can take longer.

**If overlays feel slow or the page freezes:**

1. Reload the extension (`about:debugging` → Reload, or reload the unpacked extension in Chrome/Edge)
2. Open inventory in a **fresh tab** instead of a tab that has been open for hours
3. Close unused tabs or restart the browser if memory is high
4. Very large inventories (1000+ items) need more time — the v3.0.8 update reduces freezing but cannot speed up the site itself

**If float/seed never appear on inventory:** reload the page once while logged in. If it still fails, report your browser and inventory size on [GitHub Issues](https://github.com/smelbravo/CS-Restored-Inventory-Helper/issues).

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
• Trade views (/app/play) — float/seed for your own items only

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
Extension: CS:Restored Inventory Helper (v3.0.8)
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
4. Play → Trades (/app/play): open a trade — float/seed on your own items when the site API provides them (other players' items may not show float/seed until the site exposes those fields).

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
