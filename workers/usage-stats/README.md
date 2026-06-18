# Usage stats worker (Cloudflare — free tier)

Anonymous install heartbeats for **CS:Restored Inventory Helper**. Powers the **ACTIVE** counter in the extension popup (MAU = last 30 days).

## What is stored

| Field | Example | Notes |
|-------|---------|--------|
| `install_id` | random UUID v4 | Generated once per browser profile |
| `version` | `3.12.0` | Extension version |
| `browser` | `firefox` | `firefox` / `chrome` / `edge` / `chromium` |
| `first_seen` / `last_seen` | Unix ms | Updated on heartbeat |

No Discord ID, inventory, or personal data.

## Deploy (one-time)

1. Install [Wrangler](https://developers.cloudflare.com/workers/wrangler/install-and-update/): `npm i -g wrangler`
2. Login: `wrangler login`
3. From this folder:

```bash
cd workers/usage-stats
wrangler d1 create csr-inv-helper-usage
```

4. Copy the `database_id` into `wrangler.toml` (replace `REPLACE_WITH_D1_DATABASE_ID`).
5. Apply schema:

```bash
wrangler d1 execute csr-inv-helper-usage --remote --file=schema.sql
```

6. Deploy:

```bash
wrangler deploy
```

7. Note the URL, e.g. `https://csr-inv-helper-usage.<your-subdomain>.workers.dev`
8. Set the same URL in **`src/lib/usage-stats-config.js`** → `CSR_USAGE_STATS_API`
9. Rebuild / reload the extension.

## Endpoints

- `POST /v1/heartbeat` — body `{ "install_id": "uuid", "version": "3.12.0", "browser": "firefox" }`
- `GET /v1/stats` — `{ "mau": 0, "dau": 0, "online": 0, "total_installs": 0 }`

## Costs

Cloudflare Workers + D1 free tier is enough for a browser extension (low traffic).

## Optional custom domain

In Cloudflare dashboard → Workers → your worker → **Custom domains** → e.g. `stats.csrestored.fun` (if you own the zone).
