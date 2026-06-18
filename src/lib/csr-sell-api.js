/**
 * Shared quick-sell API helper (inventory panel, cases, Sell Hub).
 * CS:R / CSR+ use POST /inventory/sell/{id} with empty or {} body — not always { weapon_id }.
 */
(function (global) {
    'use strict';

    const API_BASE = 'https://api.csrestored.fun';
    const SELL_URL_KEY = 'csrx_sell_last_url';
    const SELL_BODY_KEY = 'csrx_sell_last_body';
    const CONFIRM_DELAYS_MS = [200, 350, 500, 800, 1200, 1800, 2500, 3500, 4500, 5500];

    function sleep(ms) {
        return new Promise((r) => setTimeout(r, ms));
    }

    function parseWeaponId(wid) {
        if (wid == null || wid === '') return null;
        const n = parseInt(wid, 10);
        return Number.isFinite(n) && n > 0 ? n : null;
    }

    function extractSellCoins(data) {
        if (!data || typeof data !== 'object') return null;
        for (const k of ['coins', 'coin_balance', 'balance']) {
            const v = data[k];
            if (v == null) continue;
            const n = parseInt(String(v).replace(/[^\d]/g, ''), 10);
            if (Number.isFinite(n) && n >= 0) return n;
        }
        return null;
    }

    /** Explicit API rejection in response body (not slow-sync false negative). */
    function sellBodyRejected(data) {
        if (data == null || data === '' || typeof data !== 'object') return false;
        if (data.error) return true;
        if (data.success === false) return true;
        const msg = String(data.message || data.detail || '').toLowerCase();
        return !!(msg && /(fail|invalid|not found|no longer|locked|listed|cannot|can't|unavailable)/i.test(msg));
    }

    function sellResponseOk(data) {
        return !sellBodyRejected(data);
    }

    function rememberSiteSellRequest(url, bodyRaw) {
        if (!url || !/\/inventory\/sell\//i.test(url)) return;
        try {
            sessionStorage.setItem(SELL_URL_KEY, url);
            if (bodyRaw == null || bodyRaw === '') {
                sessionStorage.removeItem(SELL_BODY_KEY);
            } else {
                const s = typeof bodyRaw === 'string' ? bodyRaw : JSON.stringify(bodyRaw);
                sessionStorage.setItem(SELL_BODY_KEY, s);
            }
        } catch (_) { /* ignore */ }
    }

    function learnedSellAttempts(id) {
        const out = [];
        try {
            const tplUrl = sessionStorage.getItem(SELL_URL_KEY);
            const tplBody = sessionStorage.getItem(SELL_BODY_KEY);
            if (tplUrl && /\/inventory\/sell\//i.test(tplUrl)) {
                const url = tplUrl.replace(/\/inventory\/sell\/[^/?#]+/i, `/inventory/sell/${encodeURIComponent(id)}`);
                out.push({ url, body: tplBody ?? '{}' });
            }
        } catch (_) { /* ignore */ }
        return out;
    }

    async function postSell(url, body) {
        const init = {
            method: 'POST',
            credentials: 'include',
            headers: { Accept: 'application/json' },
        };
        if (body !== undefined) {
            init.headers['Content-Type'] = 'application/json';
            init.body = body;
        }
        const res = await fetch(url, init);
        let data = null;
        try {
            const text = await res.text();
            if (text) {
                const safe = text.replace(/([:\[,]\s*)(-?\d{16,})(?=\s*[,}\]])/g, '$1"$2"');
                data = JSON.parse(safe);
            }
        } catch (_) { /* ignore */ }
        const httpOk = res.ok && res.status >= 200 && res.status < 300;
        const rejected = sellBodyRejected(data);
        const ok = httpOk && !rejected;
        return {
            ok,
            httpOk,
            rejected,
            data,
            status: res.status,
            retryable: res.status === 429 || res.status >= 500,
        };
    }

    /**
     * Poll until weapon_id no longer in inventory (handles slow API sync).
     * @param {number|string} wid
     * @param {(id: number) => Promise<boolean>} isStillOwned async — true if still in inventory
     * @param {{ delays?: number[] }} opts
     */
    async function confirmWeaponSold(wid, isStillOwned, opts = {}) {
        const id = parseWeaponId(wid);
        if (!id || typeof isStillOwned !== 'function') return false;
        const delays = opts.delays || CONFIRM_DELAYS_MS;
        for (let i = 0; i < delays.length; i++) {
            await sleep(delays[i]);
            try {
                if (!(await isStillOwned(id))) return true;
            } catch (_) { /* retry */ }
        }
        try {
            return !(await isStillOwned(id));
        } catch (_) {
            return false;
        }
    }

    /**
     * @param {number|string} wid weapon instance id
     * @param {{ retries?: number, confirm?: boolean, isStillOwned?: (id: number) => Promise<boolean> }} opts
     */
    async function sellWeapon(wid, opts = {}) {
        const id = parseWeaponId(wid);
        if (!id) return { ok: false, httpOk: false, rejected: false };

        const defaultUrl = `${API_BASE}/inventory/sell/${encodeURIComponent(id)}`;
        const attempts = [
            ...learnedSellAttempts(id),
            { url: defaultUrl, body: undefined },
            { url: defaultUrl, body: '{}' },
            { url: defaultUrl, body: JSON.stringify({ weapon_id: id }) },
        ];

        let last = { ok: false, httpOk: false, rejected: false, data: null, status: 0 };
        const maxRounds = Math.max(1, Math.min(5, opts.retries ?? 3));
        for (let round = 0; round < maxRounds; round++) {
            let sawRetryable = false;
            for (const { url, body } of attempts) {
                try {
                    const res = await postSell(url, body);
                    last = res;
                    if (res.ok) {
                        if (opts.confirm !== false && typeof opts.isStillOwned === 'function') {
                            const confirmed = await confirmWeaponSold(id, opts.isStillOwned, opts);
                            return { ...res, ok: confirmed, confirmed };
                        }
                        return res;
                    }
                    if (res.rejected) return res;
                    if (res.retryable) {
                        sawRetryable = true;
                        break;
                    }
                } catch (_) { /* try next body shape */ }
            }
            if (sawRetryable && round < maxRounds - 1) {
                await sleep(400 * (round + 1) + Math.floor(Math.random() * 200));
                continue;
            }
            break;
        }

        if (typeof opts.isStillOwned === 'function') {
            try {
                if (!(await opts.isStillOwned(id))) {
                    return { ...last, ok: true, confirmed: true, viaInventory: true };
                }
            } catch (_) { /* ignore */ }
        }
        return last;
    }

    global.CSR_rememberSiteSellRequest = rememberSiteSellRequest;
    global.CSR_sellWeapon = sellWeapon;
    global.CSR_confirmWeaponSold = confirmWeaponSold;
    global.CSR_sellBodyRejected = sellBodyRejected;
    global.CSR_extractSellCoins = extractSellCoins;
})(typeof globalThis !== 'undefined' ? globalThis : self);
