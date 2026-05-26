# CSR Extension

Browser extension for [Counter-Strike: Restored](https://csrestored.fun) — float and pattern overlays on inventory, marketplace, and trades, plus a quick-sell helper for your own items.

Works in **Firefox** and **Chromium** browsers (Manifest V3).

**Current version:** `2.9`

## Features

### Float & pattern overlays

Shows **wear abbreviation** (FN, MW, FT, WW, BS), **float value** (e.g. `0.1962`), and **paint seed** (`#640`) on item cards. Color-coded float dot (green → yellow → red by wear).

| Page | Route | Notes |
|------|-------|-------|
| **Inventory** | `/app/inventory` | Badges in the bottom-right corner of each card |
| **Marketplace** | `/app/inventory/marketplace` | Badges below the price (top-right), so they do not cover the seller username |
| **Trade Up** | `/app/inventory/trade-up` | Overlays on trade-related views |
| **Play / Trades** | `/app/play` | Received and sent trade offer detail views |
| **Send Trade Offer** | Modal on site | **My Items** tab uses your inventory; **Their Items** tab uses the friend's inventory when the site loads it |

Data is matched to cards by offer ID, skin image, wear, StatTrak, and name. The extension hooks into the site's own API responses — it does not spam duplicate requests.

### CSR Seller (inventory only)

Floating panel to sell items from **your** inventory without opening each item manually.

- **Start Picking** — click cards to select items to sell
- **Review & Sell** — confirm selection in a modal with validation
- **Sell by Rarity** — bulk sell all items of a chosen rarity tier
- **Batch size** slider — control how many sell requests run in parallel

> The red **star button** (bottom-right on inventory) opens this panel. It is hidden on the marketplace and trade pages.

## Trade overlay behaviour

On trade detail pages (**Your offer** / **Their offer**):

- **Your offer** — float and seed from your inventory (`/inventory/`) and, when available, from the trades API
- **Their offer** — float and seed only when the trades API includes them for the other player's items

On **Send Trade Offer → Their Items**, overlays use the friend inventory endpoint (`/users/{id}/inventory`) when the site fetches it. If the API does not return float/seed for another player's items, the extension cannot display them.

## Installation (developer / temporary)

### Firefox

1. Open `about:debugging` → **This Firefox** → **Load Temporary Add-on**
2. Select `manifest.json` from this folder

### Chrome / Edge / Brave

1. Open `chrome://extensions` (or `edge://extensions`)
2. Enable **Developer mode**
3. Click **Load unpacked** and select this folder

## Usage

1. Log in on [csrestored.fun](https://csrestored.fun) with Discord
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
- Added support for **Play → Trades** (`/app/play`) received/sent trade views
- **Your offer** / **Their offer** section-aware overlays on trade detail pages
- Correct side mapping for received vs sent trades (`initiator` / `recipient`)
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

- **Other player's items in trades** — if `/api/trades` or `/users/{id}/inventory` does not include `float`, `seed`, and `weapon_id` per item, overlays cannot be shown for those skins. This requires API changes on the CS:R backend.

## Disclaimer

This extension is **not affiliated** with Valve Corporation or the CS:R team. Use at your own risk. Selling items is irreversible — always review the confirmation modal.

## License

MIT — see [LICENSE](LICENSE).
