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

    function apiRequest(path, method = 'GET', body = null) {
        const rt = runtime();
        return new Promise((resolve, reject) => {
            rt.runtime.sendMessage({
                type: 'csr:api',
                path,
                method,
                body,
            }, (resp) => {
                const err = rt.runtime.lastError;
                if (err) {
                    reject(new Error(String(err.message || err)));
                    return;
                }
                if (!resp?.ok) {
                    reject(new Error(resp?.error || resp?.timeout ? 'timeout' : `HTTP ${resp?.status || '?'}`));
                    return;
                }
                resolve(resp.data);
            });
        });
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

    async function fetchInventory(userId) {
        const id = userId ? String(userId).trim() : '';
        let lastErr = null;

        if (id) {
            try {
                const data = await apiRequest(`/users/${encodeURIComponent(id)}/inventory`);
                const arr = normalizeInventoryArray(data);
                if (arr.length) return arr;
            } catch (e) {
                lastErr = e;
            }
        }

        try {
            const data = await apiRequest('/inventory/');
            return normalizeInventoryArray(data);
        } catch (e) {
            throw lastErr || e;
        }
    }

    function extractCoins(data) {
        if (!data || typeof data !== 'object') return null;
        return parseCoinVal(data.coins ?? data.coin_balance ?? data.balance);
    }

    function parseUserProfile(data) {
        if (!data || typeof data !== 'object') return null;
        const id = data.id ?? data.user_id ?? data.discord_id;
        const username = String(
            data.username ?? data.name ?? data.display_name ?? data.nickname ?? '',
        ).trim();
        return {
            id: id != null ? String(id) : null,
            username,
        };
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

    async function sellWeapon(wid) {
        const id = parseInt(wid, 10);
        if (!id) return { ok: false, coins: null };
        try {
            const data = await apiRequest(`/inventory/sell/${id}`, 'POST', { weapon_id: id });
            return { ok: true, coins: extractCoins(data) };
        } catch (_) {
            return { ok: false, coins: null };
        }
    }

    async function listOnMarket(wid, priceCoins) {
        const id = parseInt(wid, 10);
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
        fetchInventory,
        fetchUserCoins,
        fetchUserProfile,
        fetchUserSession,
        extractCoins,
        sellWeapon,
        listOnMarket,
        wearCode,
    };
})(typeof globalThis !== 'undefined' ? globalThis : window);
