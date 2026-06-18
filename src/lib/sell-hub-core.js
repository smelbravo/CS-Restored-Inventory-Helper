/**
 * Shared API + pricing for the standalone Sell Hub page.
 * API calls go through the background worker (session cookies, Brave-friendly).
 */
(function (global) {
    'use strict';

    const MP_ADD_PATH = '/inventory/marketplace/add';
    const MAX_MARKET_PRICE = 999999;
    const CSR_RARITY_SELL_PRICES = { 7: 6942, 6: 2013, 5: 530, 4: 255, 3: 118, 2: 94, 1: 56 };

    function runtime() {
        return typeof browser !== 'undefined' ? browser : chrome;
    }

    const API_BASE = 'https://api.csrestored.fun';
    const API_MSG_TIMEOUT_MS = 26000;

    function snowflakeStr(val) {
        if (val == null) return null;
        if (typeof val === 'string') {
            const s = val.trim();
            return s || null;
        }
        if (typeof val === 'number' && Number.isFinite(val)) return String(Math.trunc(val));
        return String(val);
    }

    function parseApiBodyText(text) {
        try {
            const safe = String(text).replace(/([:\[,]\s*)(-?\d{16,})(?=\s*[,}\]])/g, '$1"$2"');
            return JSON.parse(safe);
        } catch (_) {
            return text;
        }
    }

    function apiRequestViaBackground(path, method, body, timeoutMs) {
        const rt = runtime();
        return new Promise((resolve, reject) => {
            let settled = false;
            const timer = setTimeout(() => {
                if (settled) return;
                settled = true;
                reject(new Error('timeout'));
            }, timeoutMs);

            rt.runtime.sendMessage({
                type: 'csr:api',
                path,
                method,
                body,
                timeoutMs,
            }, (resp) => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                const err = rt.runtime.lastError;
                if (err) {
                    reject(new Error(String(err.message || err)));
                    return;
                }
                if (!resp?.ok) {
                    reject(new Error(resp?.error || (resp?.timeout ? 'timeout' : `HTTP ${resp?.status || '?'}`)));
                    return;
                }
                resolve(resp.data);
            });
        });
    }

    async function apiRequestDirect(path, method = 'GET', body = null, timeoutMs = 20000) {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), timeoutMs);
        try {
            const init = { method, credentials: 'include', signal: ctrl.signal };
            if (body != null && method !== 'GET' && method !== 'HEAD') {
                init.headers = { 'content-type': 'application/json' };
                init.body = typeof body === 'string' ? body : JSON.stringify(body);
            }
            const r = await fetch(API_BASE + path, init);
            const text = await r.text();
            const data = parseApiBodyText(text);
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            return data;
        } catch (e) {
            if (e?.name === 'AbortError') throw new Error('timeout');
            throw e;
        } finally {
            clearTimeout(timer);
        }
    }

    async function apiRequest(path, method = 'GET', body = null, opts = {}) {
        const timeoutMs = Number(opts.timeoutMs) > 0
            ? Number(opts.timeoutMs)
            : (method === 'GET' ? 20000 : 25000);
        const msgTimeout = Math.min(API_MSG_TIMEOUT_MS, timeoutMs + 6000);
        const preferDirect = opts.preferDirect !== false;
        const fns = preferDirect
            ? [
                () => apiRequestDirect(path, method, body, timeoutMs),
                () => apiRequestViaBackground(path, method, body, msgTimeout),
            ]
            : [
                () => apiRequestViaBackground(path, method, body, msgTimeout),
                () => apiRequestDirect(path, method, body, timeoutMs),
            ];
        const errors = [];
        for (const fn of fns) {
            try {
                return await fn();
            } catch (e) {
                errors.push(e);
            }
        }
        throw errors[0] || new Error('API request failed');
    }

    async function pingApi() {
        const t0 = performance.now();
        try {
            await apiRequest('/users/@me', 'GET', null, { timeoutMs: 15000, preferDirect: true });
            return Math.round(performance.now() - t0);
        } catch (_) {
            return null;
        }
    }

    function parseCoinVal(v) {
        if (v == null) return null;
        const n = parseInt(String(v).replace(/[^\d]/g, ''), 10);
        return Number.isFinite(n) && n > 0 ? n : null;
    }

    function formatCoinNumber(n) {
        const num = Math.max(0, Math.round(Number(n) || 0));
        return String(num).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
    }

    function formatCoins(n) {
        return `${formatCoinNumber(n)} coins`;
    }

    function parseMarketPrice(raw) {
        const s = String(raw ?? '').replace(/,/g, '').trim();
        if (!s) return null;
        const n = parseInt(s, 10);
        if (!Number.isFinite(n) || n < 1) return null;
        return Math.min(n, MAX_MARKET_PRICE);
    }

    function extractQuickSellFromItem(item) {
        if (!item || typeof item !== 'object') return null;
        const keys = [
            'quick_sell_price', 'quick_sell', 'insta_sell_price', 'sell_price',
            'quickSellPrice', 'sellPrice', 'sell_coins', 'coins_received',
        ];
        for (const k of keys) {
            const p = parseCoinVal(item[k]);
            if (p != null) return p;
        }
        return null;
    }

    function computeQuickSellPrice(item) {
        if (!item) return null;
        const rarity = parseInt(item.rarity, 10);
        const base = CSR_RARITY_SELL_PRICES[rarity] ?? CSR_RARITY_SELL_PRICES[1];
        if (!base) return null;
        const fl = Math.min(Math.max(parseFloat(item.float) || 0, 0), 1);
        let coins = Math.round(base * (1 - fl * 0.25));
        if (item.stattrak) coins = Math.round(coins * 1.5);
        return coins > 0 ? coins : null;
    }

    function getQuickSellPrice(item) {
        if (!item) return null;
        const fromApi = extractQuickSellFromItem(item);
        if (fromApi != null) return fromApi;
        return computeQuickSellPrice(item);
    }

    function getSuggestedMarketPrice(item) {
        const qs = getQuickSellPrice(item);
        return qs != null ? Math.max(1, Math.round(qs * 1.15)) : null;
    }

    function parsePosInt(v) {
        if (v == null || v === '') return null;
        const n = parseInt(v, 10);
        return Number.isFinite(n) && n > 0 ? n : null;
    }

    function catalogItemId(raw) {
        return parsePosInt(raw?.item_id ?? raw?.skin_id ?? raw?.def_id);
    }

    function mergedRaw(raw) {
        if (!raw || typeof raw !== 'object') return null;
        const nested = (raw.item && typeof raw.item === 'object' && raw.item)
            || (raw.weapon && typeof raw.weapon === 'object' && raw.weapon)
            || (raw.skin && typeof raw.skin === 'object' && raw.skin)
            || null;
        return nested ? { ...raw, ...nested } : raw;
    }

    /** CDN / skin definition id — always catalog id, never instance weapon_id. */
    function skinDefinitionIdFromRaw(raw) {
        const merged = mergedRaw(raw);
        if (!merged) return null;
        const a = parsePosInt(merged.item_id ?? merged.skin_id ?? merged.def_id);
        const b = parsePosInt(merged.weapon_id ?? merged.weaponId);
        if (a == null && b == null) return null;
        if (a == null) return b;
        if (b == null) return a;
        return Math.min(a, b);
    }

    function instanceWeaponIdFromRaw(raw) {
        if (!raw || typeof raw !== 'object') return null;
        const merged = mergedRaw(raw);
        if (!merged) return null;
        const catalog = catalogItemId(merged);
        const topWeapon = parsePosInt(merged.weapon_id ?? merged.weaponId);
        const topItem = parsePosInt(merged.item_id ?? merged.skin_id);
        if (topWeapon != null && topItem != null && topWeapon !== topItem) {
            return Math.max(topWeapon, topItem);
        }
        const candidates = new Set();
        for (const k of ['weapon_id', 'weaponId', 'skin_instance_id', 'instance_id', 'inventory_id', 'uid', 'id']) {
            const n = parsePosInt(merged[k]);
            if (n) candidates.add(n);
        }
        if (!candidates.size) return topWeapon ?? topItem;
        const nonCatalog = [...candidates].filter((n) => catalog == null || n !== catalog);
        if (nonCatalog.length) return Math.max(...nonCatalog);
        return Math.max(...candidates);
    }

    function instanceIdCandidates(item) {
        const catalog = catalogItemId(item);
        const out = new Set();
        const add = (n) => {
            if (n && (catalog == null || n !== catalog)) out.add(n);
        };
        add(parsePosInt(item._api_weapon_id));
        for (const k of ['weapon_id', 'weaponId', 'id', 'uid', 'inventory_id', 'skin_instance_id', 'instance_id']) {
            add(parsePosInt(item[k]));
        }
        return [...out];
    }

    function normalizeInventoryItem(raw) {
        const inst = instanceWeaponIdFromRaw(raw);
        if (!inst) return null;
        const skinDef = skinDefinitionIdFromRaw(raw);
        const item = { ...raw };
        item._api_weapon_id = parsePosInt(raw.weapon_id ?? raw.weaponId);
        item.weapon_id = inst;
        if (skinDef != null) item.item_id = skinDef;
        if (item.seed == null && item.paint_seed != null) item.seed = item.paint_seed;
        if (item.float == null && item.skin_float != null) item.float = item.skin_float;
        return item;
    }

    function disambiguateDuplicateWeaponIds(items) {
        const groups = new Map();
        for (const item of items) {
            const w = item.weapon_id;
            if (!groups.has(w)) groups.set(w, []);
            groups.get(w).push(item);
        }
        for (const [, group] of groups) {
            if (group.length <= 1) continue;

            const apiIds = group.map((it) => parsePosInt(it._api_weapon_id));
            if (apiIds.every(Boolean) && new Set(apiIds).size === group.length) {
                group.forEach((it, i) => { it.weapon_id = apiIds[i]; });
                continue;
            }

            const used = new Set();
            for (const item of group) {
                const cands = instanceIdCandidates(item);
                let pick = cands.find((n) => !used.has(n));
                if (pick == null && cands.length) pick = cands[0];
                if (pick == null) pick = item.weapon_id;
                item.weapon_id = pick;
                used.add(pick);
            }
        }
        return items;
    }

    function normalizeInventoryArray(data) {
        const arr = Array.isArray(data) ? data : (data?.items || data?.inventory || data?.data || []);
        const normalized = [];
        for (const raw of arr) {
            const item = normalizeInventoryItem(raw);
            if (item) normalized.push(item);
        }
        return disambiguateDuplicateWeaponIds(normalized)
            .sort((a, b) => parseInt(a.rarity, 10) - parseInt(b.rarity, 10));
    }

    async function fetchOwnInventory() {
        const data = await apiRequest('/inventory/', 'GET', null, {
            preferDirect: true,
            timeoutMs: 45000,
        });
        return normalizeInventoryArray(data);
    }

    async function fetchInventory(userId) {
        const id = userId ? String(userId).trim() : '';
        let lastErr = null;

        try {
            const data = await apiRequest('/inventory/');
            const own = normalizeInventoryArray(data);
            if (own.length) return own;
        } catch (e) {
            lastErr = e;
        }

        if (id) {
            try {
                const data = await apiRequest(`/users/${encodeURIComponent(id)}/inventory`);
                const arr = normalizeInventoryArray(data);
                if (arr.length) return arr;
            } catch (e) {
                lastErr = lastErr || e;
            }
        }

        throw lastErr || new Error('Empty inventory');
    }

    function extractCoins(data) {
        if (!data || typeof data !== 'object') return null;
        return parseCoinVal(data.coins ?? data.coin_balance ?? data.balance);
    }

    function parseUserProfile(data) {
        if (!data || typeof data !== 'object') return null;
        const id = snowflakeStr(data.id ?? data.user_id ?? data.discord_id);
        const username = String(
            data.username ?? data.name ?? data.display_name ?? data.nickname ?? '',
        ).trim();
        return { id, username };
    }

    async function fetchUserProfile(userId) {
        const want = userId ? String(userId).trim() : '';
        let me = null;
        try {
            const data = await apiRequest('/users/@me');
            me = parseUserProfile(data);
            if (!want || (me?.id && String(me.id) === want)) return me;
        } catch (_) { /* ignore */ }
        if (!want) return me;
        try {
            const data = await apiRequest(`/users/${encodeURIComponent(want)}`);
            const profile = parseUserProfile(data);
            if (profile?.username || profile?.id) return profile;
        } catch (_) { /* ignore */ }
        return me?.id ? me : { id: want, username: '' };
    }

    async function fetchUserCoins() {
        try {
            const data = await apiRequest('/users/@me');
            return extractCoins(data);
        } catch (_) {
            return null;
        }
    }

    async function fetchUserSession(userId) {
        let coins = null;
        let profile = null;
        try {
            const data = await apiRequest('/users/@me');
            coins = extractCoins(data);
            profile = parseUserProfile(data);
        } catch (_) { /* ignore */ }
        const want = userId ? String(userId).trim() : '';
        if (want && profile?.id && String(profile.id) !== want) {
            try {
                const data = await apiRequest(`/users/${encodeURIComponent(want)}`);
                const other = parseUserProfile(data);
                if (other?.username) profile = other;
                else if (other?.id) profile = { id: other.id, username: profile?.username || '' };
            } catch (_) { /* ignore */ }
        }
        if (!profile?.id && want) profile = { id: want, username: profile?.username || '' };
        return { coins, profile };
    }

    function sellWeaponIdFromItem(item) {
        if (!item) return null;
        const api = parsePosInt(item._api_weapon_id);
        if (api) return api;
        return parsePosInt(item.weapon_id);
    }

    function sleep(ms) {
        return new Promise((r) => setTimeout(r, ms));
    }

    function sellBodyRejected(data) {
        if (typeof CSR_sellBodyRejected === 'function') return CSR_sellBodyRejected(data);
        if (data == null || data === '' || typeof data !== 'object') return false;
        if (data.error) return true;
        if (data.success === false) return true;
        const msg = String(data.message || data.detail || '').toLowerCase();
        return !!(msg && /(fail|invalid|not found|no longer|locked|listed|cannot|can't|unavailable)/i.test(msg));
    }

    async function confirmSoldIds(beforeIds, onProgress) {
        const want = new Set([...beforeIds].filter(Boolean));
        if (!want.size) return { sold: 0, failed: 0, items: [] };
        const delays = [300, 600, 1200, 2000, 3500, 5000, 6500];
        let items = [];
        for (let i = 0; i <= delays.length; i++) {
            if (i > 0) await sleep(delays[i - 1]);
            try {
                items = await fetchOwnInventory();
            } catch (_) {
                continue;
            }
            const after = new Set(items.map((it) => sellWeaponIdFromItem(it)).filter(Boolean));
            const gone = [...want].filter((id) => !after.has(id)).length;
            if (onProgress) onProgress(gone, want.size);
            if (gone >= want.size) break;
        }
        const after = new Set(items.map((it) => sellWeaponIdFromItem(it)).filter(Boolean));
        const sold = [...want].filter((id) => !after.has(id)).length;
        return { sold, failed: want.size - sold, items };
    }

    async function sellWeapon(wid) {
        const id = parsePosInt(wid);
        if (!id) return { ok: false, coins: null, data: null, rejected: false };

        const path = `/inventory/sell/${encodeURIComponent(id)}`;
        const bodies = [null, {}, { weapon_id: id }];
        const maxRounds = 3;
        let lastData = null;

        for (let round = 0; round < maxRounds; round++) {
            for (const body of bodies) {
                try {
                    const data = await apiRequest(path, 'POST', body, { preferDirect: true, timeoutMs: 30000 });
                    lastData = data;
                    if (sellBodyRejected(data)) {
                        return { ok: false, coins: extractCoins(data), data, rejected: true };
                    }
                    return { ok: true, coins: extractCoins(data), data, rejected: false };
                } catch (e) {
                    const msg = String(e?.message || e);
                    if (msg.includes('429') || msg.includes('HTTP 5')) {
                        await sleep(400 * (round + 1));
                        break;
                    }
                }
            }
        }
        return { ok: false, coins: extractCoins(lastData), data: lastData, rejected: false };
    }

    async function listOnMarket(wid, priceCoins) {
        const id = sellWeaponIdFromItem(typeof wid === 'object' ? wid : null) || parsePosInt(wid);
        const price = parseMarketPrice(priceCoins);
        if (!id || !price) return false;
        try {
            await apiRequest(MP_ADD_PATH, 'POST', { weapon_id: id, price });
            return true;
        } catch (_) {
            return false;
        }
    }

    function wearCode(f) {
        if (f == null) return '';
        if (f < 0.07) return 'FN';
        if (f < 0.15) return 'MW';
        if (f < 0.38) return 'FT';
        if (f < 0.45) return 'WW';
        return 'BS';
    }

    global.CSR_SellHub = {
        MAX_MARKET_PRICE,
        parsePosInt,
        skinDefinitionIdFromRaw,
        instanceWeaponIdFromRaw,
        parseCoinVal,
        formatCoinNumber,
        formatCoins,
        parseMarketPrice,
        getQuickSellPrice,
        getSuggestedMarketPrice,
        sellWeaponIdFromItem,
        pingApi,
        confirmSoldIds,
        fetchInventory,
        fetchOwnInventory,
        fetchUserCoins,
        fetchUserProfile,
        fetchUserSession,
        extractCoins,
        sellWeapon,
        listOnMarket,
        wearCode,
    };
})(typeof globalThis !== 'undefined' ? globalThis : window);
