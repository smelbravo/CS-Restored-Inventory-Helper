# Privacy Policy — CS:Restored Inventory Helper

**Last updated:** May 2026

CS:Restored Inventory Helper is an unofficial browser extension for [Counter-Strike: Restored](https://csrestored.fun). This policy explains how the extension handles data.

## Summary

CS:Restored Inventory Helper **does not collect or transmit personal data to developer-owned servers**. Extension preferences stay in your browser; optional third-party calls (CounterAPI, GitHub release check) are described below.

## What the extension does

The extension runs only on `*.csrestored.fun` and:

- Reads inventory and marketplace data from the CS:Restored API **in your existing browser session** (same as the website)
- Displays float, wear, and paint seed overlays on item cards in the page
- Provides an optional CSR Seller panel to sell items from your inventory via the site's own sell API

## Data we do not collect

The extension does **not**:

- Send data to external developer-owned servers
- Use analytics or tracking services
- Store personal information on developer-owned servers
- Access sites other than csrestored.fun and its API/CDN (except optional GitHub release checks on Chromium)

## Permissions

| Permission | Purpose |
|------------|--------|
| `storage` | Save feature toggles, locked skin IDs, case config, language, and sync preferences in `storage.local` and (optionally) `storage.sync` |
| `downloads` | Save exported JSON backup files to your Downloads folder |
| `tabs` | After import, notify open csrestored.fun tabs so locks and settings apply without a full page reload |
| `*://*.csrestored.fun/*` | Inject UI overlays and CSR Seller on the site |
| `https://api.csrestored.fun/*` | Read inventory/marketplace/trade API responses to match float/seed to cards |
| `https://cdn.csrestored.fun/*` | Load skin images in the sell confirmation modal |
| `https://api.github.com/*` | Optional update check on Chromium browsers (About tab) |
| `https://api.counterapi.dev/*` | Optional anonymous community user counter in the popup header (one request per hour when you open the popup) |

## Browser sync (optional)

If you enable **Browser sync** in the extension Settings tab:

- Preferences are stored in your browser's **sync storage** (`storage.sync`) instead of local-only storage
- **Firefox:** data syncs through **Firefox Sync** when you are signed in to your Mozilla account
- **Chrome / Brave / Edge:** data syncs through **Chrome sync** when you are signed in to your Google account
- Sync is **per browser vendor** — Firefox and Chromium do not share the same sync
- No extension developer server is involved; sync is handled entirely by your browser vendor

When browser sync is **disabled** (default), all data stays in local extension storage on that device only.

## Export / import

You can export or import a JSON backup of your settings from the Settings tab. Backups stay on your device unless you choose to move the file elsewhere. Import replaces matching settings after you confirm in the popup.

## Ephemeral browser storage

On csrestored.fun, the extension may use **sessionStorage** to remember a successful marketplace listing URL/body template (`csrx_mp_list_url`, `csrx_mp_list_body`) for the current tab session only.

In the extension popup, **localStorage** may store:

- `csr:liveUsersCounted` — timestamp for throttling the optional CounterAPI ping (once per hour per install)
- `csr:update` — cached GitHub release metadata for the optional Chromium update checker

These keys never leave your browser except when you explicitly export a settings JSON file.

## Firefox data collection declaration

On Firefox, the extension declares `data_collection_permissions: required ["none"]` — meaning it does not collect or transmit data outside the browser as defined by Mozilla's extension data policies.

## Third-party services

The extension interacts with **csrestored.fun** and its API when you are logged in on that site. Your use of CS:Restored is subject to that site's own terms and privacy practices.

When you open the extension popup, it may contact **CounterAPI** (`api.counterapi.dev`) to display an approximate count of active users and to register one anonymous visit per install per hour. No account or personal data is sent.

This extension is not affiliated with Valve Corporation or the CS:Restored team.

## Open source

Source code: [github.com/smelbravo/CS-Restored-Inventory-Helper](https://github.com/smelbravo/CS-Restored-Inventory-Helper)

## Contact

For privacy questions or issues, open an issue on the GitHub repository above.
