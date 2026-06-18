# Privacy Policy — CS:Restored Inventory Helper

**Last updated:** June 2026

CS:Restored Inventory Helper is an unofficial browser extension for [Counter-Strike: Restored](https://csrestored.fun). This policy explains how the extension handles data.

## Summary

Extension preferences stay in your browser. The extension reads CS:Restored data only in your existing login session. It sends **anonymous usage heartbeats** to a developer-operated stats service (see [Anonymous usage statistics](#anonymous-usage-statistics)) so the popup can show how many people actively use the extension. No Discord account, inventory, or personal identity is included.

## What the extension does

The extension runs only on `*.csrestored.fun` and:

- Reads inventory and marketplace data from the CS:Restored API **in your existing browser session** (same as the website)
- Displays float, wear, and paint seed overlays on item cards in the page
- Provides an optional CSR Seller panel to sell items from your inventory via the site's own sell API

## Anonymous usage statistics

To show an **active user count** in the extension popup (and to help the developer understand real usage beyond store download numbers), the extension:

- Generates a random **install ID** (UUID) once per browser profile and stores it in `storage.local` (`csrInstallId`)
- Sends at most **one heartbeat per day** (and when you open the popup if the last ping was older than 24 hours) to a **Cloudflare Worker** endpoint operated by the extension developer
- Each heartbeat includes only: **install ID**, **extension version**, and **browser family** (`firefox`, `chrome`, `edge`, or `chromium`)

The service stores **first seen** and **last seen** timestamps per install ID. Aggregated counts (e.g. active in the last 30 days) are shown in the popup. This cannot identify your CS:Restored account or Discord user.

This telemetry is **always on** and is disclosed here; it is not optional.

## Data we do not collect

The extension does **not**:

- Send your Discord ID, Steam ID, username, or inventory to developer servers
- Use third-party advertising or analytics platforms
- Sell or share usage data

## Permissions

| Permission | Purpose |
|------------|--------|
| `storage` | Save feature toggles, locked skin IDs, anonymous install ID, case config, language, and sync preferences in `storage.local` and (optionally) `storage.sync` |
| `alarms` | Schedule at most one anonymous usage heartbeat per day from the background service worker |
| `downloads` | Save exported JSON backup files to your Downloads folder |
| `tabs` | After import, notify open csrestored.fun tabs so locks and settings apply without a full page reload |
| `*://*.csrestored.fun/*` | Inject UI overlays and CSR Seller on the site |
| `https://api.csrestored.fun/*` | Read inventory/marketplace/trade API responses to match float/seed to cards |
| `https://cdn.csrestored.fun/*` | Load skin images in the sell confirmation modal |
| `https://api.github.com/*` | Optional update check on Chromium browsers (About tab) |
| `https://csr-inv-helper-usage.*.workers.dev/*` | Anonymous usage heartbeat and active-user stats for the popup counter |

If a custom domain is configured for the stats worker, the exact host is listed in the extension manifest `host_permissions`.

## Browser sync (optional)

If you enable **Browser sync** in the extension Settings tab:

- Preferences are stored in your browser's **sync storage** (`storage.sync`) instead of local-only storage
- **Firefox:** data syncs through **Firefox Sync** when you are signed in to your Mozilla account
- **Chrome / Brave / Edge:** data syncs through **Chrome sync** when you are signed in to your Google account
- Sync is **per browser vendor** — Firefox and Chromium do not share the same sync
- The anonymous install ID and usage heartbeat schedule stay on each device (`storage.local` only)

When browser sync is **disabled** (default), all data stays in local extension storage on that device only.

## Export / import

You can export or import a JSON backup of your settings from the Settings tab. Backups stay on your device unless you choose to move the file elsewhere. Import replaces matching settings after you confirm in the popup. The anonymous install ID is **not** included in JSON backup.

## Ephemeral browser storage

On csrestored.fun, the extension may use **sessionStorage** to remember a successful marketplace listing URL/body template (`csrx_mp_list_url`, `csrx_mp_list_body`) for the current tab session only.

In the extension popup, **localStorage** may store:

- `csr:update` — cached GitHub release metadata for the optional Chromium update checker

These keys never leave your browser except when you explicitly export a settings JSON file.

## Firefox data collection declaration

On Firefox, the extension declares `data_collection_permissions: required ["technicalAndInteraction"]` for the anonymous install heartbeat (version + browser family + random install ID). No personally identifying information is transmitted.

## Third-party services

The extension interacts with **csrestored.fun** and its API when you are logged in on that site. Your use of CS:Restored is subject to that site's own terms and privacy practices.

This extension is not affiliated with Valve Corporation or the CS:Restored team.

## Open source

Source code: [github.com/smelbravo/CS-Restored-Inventory-Helper](https://github.com/smelbravo/CS-Restored-Inventory-Helper)

Stats worker source: `workers/usage-stats/` in the same repository.

## Contact

For privacy questions or issues, open an issue on the GitHub repository above.
