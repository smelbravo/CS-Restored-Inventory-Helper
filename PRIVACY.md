# Privacy Policy — CS:Restored Inventory Helper

**Last updated:** May 2026

CS:Restored Inventory Helper is an unofficial browser extension for [Counter-Strike: Restored](https://csrestored.fun). This policy explains how the extension handles data.

## Summary

CS:Restored Inventory Helper **does not collect, store, or transmit personal data to developer servers**. All processing happens locally in your browser on pages you visit on csrestored.fun.

## What the extension does

The extension runs only on `*.csrestored.fun` and:

- Reads inventory and marketplace data from the CS:Restored API **in your existing browser session** (same as the website)
- Displays float, wear, and paint seed overlays on item cards in the page
- Provides an optional CSR Seller panel to sell items from your inventory via the site's own sell API

## Data we do not collect

The extension does **not**:

- Send data to external developer-owned servers
- Use analytics or tracking services
- Store personal information outside your browser
- Access sites other than csrestored.fun and its API/CDN

## Permissions

| Permission | Purpose |
|------------|--------|
| `*://*.csrestored.fun/*` | Inject UI overlays and CSR Seller on the site |
| `https://api.csrestored.fun/*` | Read inventory/marketplace/trade API responses to match float/seed to cards |
| `https://cdn.csrestored.fun/*` | Load skin images in the sell confirmation modal |

## Firefox data collection declaration

On Firefox, the extension declares `data_collection_permissions: required ["none"]` — meaning it does not collect or transmit data outside the browser as defined by Mozilla's extension data policies.

## Third-party services

The extension interacts with **csrestored.fun** and its API when you are logged in on that site. Your use of CS:Restored is subject to that site's own terms and privacy practices. This extension is not affiliated with Valve Corporation or the CS:Restored team.

## Open source

Source code: [github.com/smelbravo/CSR-Extension](https://github.com/smelbravo/CSR-Extension)

## Contact

For privacy questions or issues, open an issue on the GitHub repository above.
