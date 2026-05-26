# CSR Extension

Browser extension for [Counter-Strike: Restored](https://csrestored.fun) — float and pattern overlays on inventory and marketplace, plus a quick-sell helper for your own items.

Works in **Firefox** and **Chromium** browsers (Manifest V3).

## Features

### Float & pattern overlays
- Shows **wear abbreviation** (FN, MW, FT, WW, BS), **float value** (e.g. `0.1962`), and **paint seed** (`#640`) on item cards.
- **Inventory** (`/app/inventory`): badges in the bottom-right corner of each card.
- **Marketplace** (`/app/inventory/marketplace`): badges below the price (top-right), so they do not cover the seller username.
- Color-coded float dot (green → yellow → red by wear).
- Data is loaded from the CS:R API and matched to cards by offer ID, skin image, wear, and seed.

### CSR Seller (inventory only)
Floating panel to sell items from **your** inventory without opening each item manually.

- **Start Picking** — click cards to select items to sell.
- **Review & Sell** — confirm selection in a modal with validation.
- **Sell by Rarity** — bulk sell all items of a chosen rarity tier.
- **Batch size** slider — control how many sell requests run in parallel.

> The red **star button** (bottom-right on inventory) opens this panel. It is hidden on the marketplace.

## Installation (developer / temporary)

### Firefox
1. Open `about:debugging` → **This Firefox** → **Load Temporary Add-on**.
2. Select `manifest.json` from this folder.

### Chrome / Edge / Brave
1. Open `chrome://extensions` (or `edge://extensions`).
2. Enable **Developer mode**.
3. Click **Load unpacked** and select this folder.

## Usage

1. Log in on [csrestored.fun](https://csrestored.fun) with Discord.
2. Open **Inventory** or **Marketplace** — overlays appear automatically after the grid loads.
3. On inventory, click the **star** icon to open CSR Seller when you want to sell items.

## Permissions

| Permission | Why |
|------------|-----|
| `*://*.csrestored.fun/*` | Inject UI on the site |
| `https://api.csrestored.fun/*` | Read inventory and marketplace data |
| `https://cdn.csrestored.fun/*` | Skin images in the sell modal |

## API endpoints used

| Endpoint | Purpose |
|----------|---------|
| `GET /inventory/` | Your inventory (float, seed, sell) |
| `GET /inventory/marketplace/` | Marketplace listings (`skin_float`, `skin_seed`) |
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

## Disclaimer

This extension is **not affiliated** with Valve Corporation or the CS:R team. Use at your own risk. Selling items is irreversible — always review the confirmation modal.

## License

MIT — see [LICENSE](LICENSE).
