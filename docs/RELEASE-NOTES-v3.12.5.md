# CS:Restored Inventory Helper — v3.12.5

**Release date:** *(publish on GitHub Releases)*

This is the recommended update if you are on **v3.10.x or older**, or if quick sell / Sell Hub showed **failed** while skins actually sold. It bundles features merged since the last public GitHub release (**Sell Hub**, **MAU counter**, case stats) plus quick-sell reliability fixes for slow CS:R API / server-side timeouts.

---

## Highlights

### Sell Hub (v3.11 — first time on store for many users)
- **Green FAB** on `/app/inventory` → standalone extension tab for bulk **quick sell** and **marketplace list**
- Search, rarity filter, sort (rarity / float / **last dropped** / name with ↑↓ toggle)
- **New drop** badge (48 h), skin lock, review modal with progress animation
- Less lag than selling inside the heavy CS:R inventory UI on **500+ skins**

### Active users counter (v3.12)
- Popup header **ACTIVE** = MAU (installs with heartbeat in last **30 days**)
- Anonymous Cloudflare Worker + D1 — see [workers/usage-stats/README.md](../workers/usage-stats/README.md)

### Quick sell reliability (v3.12.1 – v3.12.5)
- Aligned with site / CSR+: `POST /inventory/sell/{id}` with **empty body** first
- Shared **`csr-sell-api.js`** — retries, learns site request shape, **polls inventory** before marking failed
- Default **batch size 2** (panel, popup, cases, Sell Hub) + hint when API is slow
- **Sell Hub:** API latency ping, confirm-sales step, sequential sells, 45s timeout for large inventories
- **Cases:** session auto-sell uses real `weapon_id` from inventory match (not catalog `skin_id`)

---

## Fixes since v3.12.0

| Version | Summary |
|---------|---------|
| **3.12.5** | Slow API sync — no more false **failed** when skin sold; Sell Hub **Confirming sales…**; API ping |
| **3.12.4** | Stricter sell verification; case drop ID fix |
| **3.12.3** | Sell Hub wrong weapon id / false sold / no coins |
| **3.12.2** | Sell Hub loading hang; batch default 2; Brave slider track |
| **3.12.1** | Mass quick-sell failures (empty body, 429 retries, 280 ms batch pause) |

---

## Install / update

| Browser | Link |
|---------|------|
| **Firefox** | [Firefox Add-ons](https://addons.mozilla.org/firefox/addon/csr-inventory-helper/) |
| **Chrome / Edge / Brave** | [GitHub Releases](https://github.com/smelbravo/CS-Restored-Inventory-Helper/releases) → `.zip` → Load unpacked |

1. Download **CS-Restored-Inventory-Helper-v3.12.5.zip**
2. Unzip → browser extensions → **Load unpacked** (or reload existing folder)
3. Reload any open **csrestored.fun** tabs

---

## Tips when CS:R is lagging

- Quick sell / cases: keep **batch size 2**
- **Sell Hub:** check header **API ping** — if **>5s**, wait or sell in smaller batches
- Case auto-open: delay **800–1500 ms** if you see **Too Many Requests**
- Site owner may add **timeouts** on quick sell — extension waits for inventory to update before showing failed

---

## Full changelog

See [CHANGELOG.md](CHANGELOG.md).

---

## Credits

- Trade partner overlays: [query / CSR+](https://github.com/queryery/CSR-PLUS)
- Quick sell API behaviour aligned with CSR+ / site conventions

**Not affiliated** with Valve or the CS:Restored team.
