# CS:Restored Inventory Helper — v3.12.6

**Release date:** 2026-06-02

Patch release for **Firefox AMO** validation. Functionally identical to **v3.12.5** — all quick-sell reliability, Sell Hub, case opening stats, and MAU counter features are unchanged.

---

## What's new in 3.12.6

- **Firefox manifest:** `background.scripts` fallback paired with `service_worker` (AMO requirement)
- **Removed** invalid `data_collection_permissions` block that blocked AMO signing (MAU heartbeat still works; optional consent UI pending Mozilla schema)

---

## Full feature set (since v3.9)

See [RELEASE-NOTES-v3.12.5.md](RELEASE-NOTES-v3.12.5.md) for Case opening stats, Sell Hub, MAU counter, and quick-sell fixes (3.12.1–3.12.5).

---

## Install

- **Firefox:** [addons.mozilla.org](https://addons.mozilla.org/firefox/addon/csr-inventory-helper/) (pending review after this upload)
- **Chrome / Edge / Brave:** load unpacked from repo or download `.zip` from [GitHub Releases](https://github.com/smelbravo/CS-Restored-Inventory-Helper/releases)
