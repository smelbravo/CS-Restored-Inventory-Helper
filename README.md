# CS:Restored Inventory Helper

Unofficial browser extension for [Counter-Strike: Restored](https://csrestored.fun) — float and pattern overlays for **your items** on inventory/marketplace/trades, plus a quick-sell helper for your own items.

Works in **Firefox**, **Microsoft Edge**, and **Chromium** browsers (Manifest V3).

**Current version:** `2.9.3`

## Site requirements (CS:Restored)

The extension only works on [csrestored.fun](https://csrestored.fun). To use the site (and this extension), you need:

- **Steam level** greater than 0
- **CS2 playtime:** at least 25 hours

Log in with Discord on the website after meeting these requirements.

## Features (current)

### Float & pattern overlays (your items)

Shows **wear abbreviation** (FN, MW, FT, WW, BS), **float value** (e.g. `0.1962`), and **paint seed** (`#640`) on item cards. Color-coded float dot (green → yellow → red by wear).

| Page | Route | Notes |
|------|-------|-------|
| **Inventory** | `/app/inventory` | Badges in the bottom-right corner of each card |
| **Marketplace** | `/app/inventory/marketplace` | Badges below the price (top-right), so they do not cover the seller username |
| **Trade views** | `/app/play` and `/app/inventory/trade-up` | Shows float/seed for **your own skins** when the data exists (your inventory) |
| **Send Trade Offer** | Modal on site | **My Items** tab uses your inventory (works). **Their Items** depends on the site's API (see limitations) |

Data is matched to cards by offer ID, skin image, wear, StatTrak, and name. The extension hooks into the site's own API responses — it does not spam duplicate requests.

### CSR Seller (inventory only)

Floating panel to sell items from **your** inventory without opening each item manually.

- **Start Picking** — click cards to select items to sell
- **Review & Sell** — confirm selection in a modal with validation
- **Sell by Rarity** — bulk sell all items of a chosen rarity tier
- **Batch size** slider — control how many sell requests run in parallel

> The red **star button** (bottom-right on inventory) opens this panel. It is hidden on the marketplace and trade pages.

## Trade overlay behaviour (current)

- **Your offer / Your items**: float + seed works because it can be read from your inventory (`GET /inventory/`).
- **Their offer / Other player's items**: **not supported yet** because the site API does not provide float/seed for the other player's items in trades (see limitations).

On **Send Trade Offer**:
- **My Items**: overlays work (your inventory data).
- **Their Items**: depends on the site returning float/seed in `GET /users/{id}/inventory` (currently not available).

## Installation (developer / temporary)

### Firefox

1. Open `about:debugging` → **This Firefox** → **Load Temporary Add-on**
2. Select `manifest.json` from this folder

### Chrome / Edge / Brave

1. Open `chrome://extensions` (or `edge://extensions`)
2. Enable **Developer mode**
3. Click **Load unpacked** and select this folder

## Usage

1. Go to [csrestored.fun](https://csrestored.fun) and log in with Discord (Steam level > 0, 25+ CS2 hours required by the site)
2. Open **Inventory**, **Marketplace**, or **Play → Trades** — overlays appear automatically after the grid loads
3. On inventory, click the **star** icon to open CSR Seller when you want to sell items

## Permissions

| Permission | Why |
|------------|-----|
| `*://*.csrestored.fun/*` | Inject UI on the site |
| `https://api.csrestored.fun/*` | Read inventory, marketplace, and trade data |
| `https://cdn.csrestored.fun/*` | Skin images in the sell modal |

## API endpoints used

| Endpoint | Purpose |
|----------|---------|
| `GET /inventory/` | Your inventory (float, seed, weapon_id) |
| `GET /inventory/marketplace/` | Marketplace listings (`skin_float`, `skin_seed`) |
| `GET /api/trades` | Trade offers (intercepted from site requests; `items_from_initiator`, `items_from_recipient`) |
| `GET /users/{id}/inventory` | Friend inventory for **Their Items** in Send Trade Offer |
| `POST /inventory/sell/{weapon_id}` | Sell items via CSR Seller |

## Project structure

```
├── manifest.json   # Extension manifest (MV3)
├── content.js      # Content script (overlays + CSR Seller UI)
├── icons/          # Store icons (16, 48, 128, 300 px) — add before publish
├── PRIVACY.md      # Privacy policy (for store listings)
├── LICENSE         # MIT
└── README.md
```

## Store listing copy (Firefox / Edge)

Use this text when submitting to browser stores.

### Name

**CS:Restored Inventory Helper**

### Summary / short description

```
Float, seed, and quick-sell tools for Counter-Strike: Restored (csrestored.fun).
```

### Description (public)

```
CS:Restored Inventory Helper adds float and paint seed overlays to Counter-Strike: Restored (csrestored.fun).

Features:
• Float + seed badges on your inventory and marketplace item cards
• Wear abbreviation (FN, MW, FT, WW, BS) with color-coded float dot
• CSR Seller — quick-sell panel for your inventory (red star button, inventory page only)

Requirements:
Go to https://csrestored.fun and log in with Discord.
The site requires:
• Steam level greater than 0
• CS2 playtime: at least 25 hours

This is an unofficial extension. It is not affiliated with Valve Corporation or the CS:Restored team.

The extension only runs on csrestored.fun. It reads inventory/marketplace data from the site API locally in your browser to display overlays. It does not collect or send data to external servers.

Note: Float/seed for other players' items in trades is not supported yet (site API limitation).
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
This extension only works on https://csrestored.fun when logged in.

Site requirements (enforced by CS:Restored, not the extension):
• Steam level greater than 0
• CS2 playtime: at least 25 hours

How to test:
1. Go to https://csrestored.fun and log in with Discord (reviewer can use their own account if it meets the requirements above)
2. Open Inventory (/app/inventory) — float/seed badges appear on item cards (bottom-right)
3. Open Marketplace (/app/inventory/marketplace) — badges appear below the price
4. On Inventory, click the red star button (bottom-right) to open CSR Seller

Data collection: The extension does not transmit data to developer servers. It only reads csrestored.fun API responses in-page to match float/seed to UI cards.

Source code: https://github.com/smelbravo/CS-Restored-Inventory-Helper
Support: https://github.com/smelbravo/CS-Restored-Inventory-Helper/issues
```

### Firefox categories

- Jogos e entretenimento
- Compras

### Edge search terms

```
csrestored, cs restored, float, seed, inventory, marketplace, skins, counter-strike
```

### Store assets still needed

| Asset | Size | Required |
|-------|------|----------|
| Extension logo | 128×128 min, 300×300 recommended | ✅ `icons/icon-300.png` |
| Manifest icons | 16, 48, 128 px | ✅ In `icons/` |
| Small promo tile (Edge) | 440×280 | Yes (Edge) |
| Screenshots | 640×480 or 1280×800 | Recommended |

## Branches

| Branch | Description |
|--------|-------------|
| `main` | Stable releases |
| `develop` | Active development |

## Changelog

### v2.9.3

- Added extension icons (16, 48, 128, 300 px) generated from store logo

### v2.9.2

- Rebranded extension name to **CS:Restored Inventory Helper**
- Updated manifest description and store listing copy (README)

### v2.9.1

- Added `data_collection_permissions` for Firefox Add-ons submission
- Added `PRIVACY.md` and CS:Restored site requirements to README

### v2.9

- Fixed excessive network requests — extension no longer calls `/api/trades` on its own; uses data from the site's fetch/XHR hooks only
- Removed MutationObserver loop that caused repeated overlay refreshes
- Added support for **Play → Trades** (`/app/play`) trade views
- Section-aware matching on trade detail pages (so your items can show float/seed reliably)
- **Their Items** tab uses separate friend inventory cache (no longer mixes with your inventory)
- Tab switch listener for Send Trade Offer modal (My Items ↔ Their Items)

### v2.8

- Separate caches for My Items vs Their Items in trade picker
- Fixed wrong float/seed showing on friend items when user inventory was merged in

### v2.6 – v2.7

- Trade offer support via `/api/trades`
- Trade picker modal vs trade detail view detection
- Overlays from `items_from_initiator` and `items_from_recipient`

### v2.1 – v2.5

- Marketplace overlays (`skin_float`, `skin_seed`)
- Badge position below price on marketplace cards
- Trade page detection and API path fixes

### v2.0 and earlier

- Inventory float/seed overlays
- CSR Seller (pick, review, sell by rarity, batch sell)

## Known limitations

- **Other player's items in trades / Their Items**: currently the CS:R API does not expose `float` + `seed` (and ideally `weapon_id`) for the other player's items in trades and in the friend inventory used by the trade modal. Until those fields exist in the API, the extension cannot show accurate float/seed for other players' skins.
- **Future**: if the site adds those fields to `/api/trades` and `/users/{id}/inventory`, the extension can be updated to show float/seed for other players when sending/receiving trade offers.

## Disclaimer

This extension is **not affiliated** with Valve Corporation or the CS:R team. Use at your own risk. Selling items is irreversible — always review the confirmation modal.

## License

MIT — see [LICENSE](LICENSE).
