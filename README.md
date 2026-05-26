# CSR Extension

Browser extension for [Counter-Strike: Restored](https://csrestored.fun) — float and pattern overlays for **your items** on inventory/marketplace/trades, plus a quick-sell helper for your own items.

Works in **Firefox** and **Chromium** browsers (Manifest V3).

**Current version:** `2.9.1`

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
├── LICENSE         # MIT
└── README.md
```

## Branches

| Branch | Description |
|--------|-------------|
| `main` | Stable releases |
| `develop` | Active development |

## Changelog

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
