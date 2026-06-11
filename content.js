(function () {
'use strict';

const MP_API_RE = /api\.csrestored\.fun\/.*(marketplace|\/offers)/i;
const MP_API_URL = 'https://api.csrestored.fun/inventory/marketplace/';
const MP_ADD_URL = 'https://api.csrestored.fun/inventory/marketplace/add';
const TRADE_API_RE = /api\.csrestored\.fun\/(?:api\/)?trades\b/i;
const CASES_API_URL = 'https://api.csrestored.fun/inventory/cases';
const CASES_BUY_URL = (caseId) => `https://api.csrestored.fun/inventory/cases/buy/${caseId}`;
const CASES_OPEN_URL = (caseId) => `https://api.csrestored.fun/inventory/cases/open/${caseId}`;
const CASES_OPEN_DELAY_MIN_MS = 400;
const CASES_LIST_PAGE_RE = /^\/app\/inventory\/cases$/i;

const RARITY = {
    1: { name:'Consumer Grade',   hex:'#a8a29e' },
    2: { name:'Industrial Grade', hex:'#7dd3fc' },
    3: { name:'Mil-Spec',         hex:'#60a5fa' },
    4: { name:'Restricted',       hex:'#a855f7' },
    5: { name:'Classified',       hex:'#e879f9' },
    6: { name:'Covert / Knives / Gloves', hex:'#ef4444' },
    7: { name:'Contraband',       hex:'#facc15' },
};

function rarityDisplayName(k) {
    return typeof csrT === 'function' ? csrT(`rarity.${k}`) : (RARITY[k]?.name || '');
}

function rarityEntries() {
    return Object.entries(RARITY).sort((a, b) => parseInt(a[0], 10) - parseInt(b[0], 10))
        .map(([k, v]) => [k, { ...v, name: rarityDisplayName(k) }]);
}

function getCondition(f) {
    if (f == null) return '';
    if (f < 0.07)  return 'FN';
    if (f < 0.15)  return 'MW';
    if (f < 0.38)  return 'FT';
    if (f < 0.45)  return 'WW';
    return 'BS';
}
function wearColor(f) {
    if (f == null) return '#94a3b8';
    if (f < 0.07)  return '#4ade80';
    if (f < 0.15)  return '#86efac';
    if (f < 0.38)  return '#fbbf24';
    if (f < 0.45)  return '#fb923c';
    return '#f87171';
}
function wName(i) { return i.name.split(' | ')[0] ?? i.name; }
function sName(i) {
    const s = i.name.split(' | ')[1];
    if (!s && parseInt(i.item_type) === 1) return 'Vanilla';
    return s ?? '';
}

function parseCoinVal(v) {
    if (v == null) return null;
    const n = parseInt(String(v).replace(/[^\d]/g, ''), 10);
    return Number.isFinite(n) && n > 0 ? n : null;
}

function formatCoins(n) {
    return Number(n).toLocaleString('en-US') + ' coins';
}

const MAX_MARKET_PRICE_COINS = 999999;

function parseMarketPriceInput(raw) {
    const s = String(raw ?? '').replace(/,/g, '').trim();
    if (!s) return null;
    const n = parseInt(s, 10);
    if (!Number.isFinite(n) || n < 1) return null;
    return Math.min(n, MAX_MARKET_PRICE_COINS);
}

function clampMarketPriceInput(inp) {
    if (!inp) return null;
    const raw = String(inp.value ?? '').replace(/,/g, '').trim();
    if (!raw) return null;
    const n = parseInt(raw, 10);
    if (!Number.isFinite(n) || n < 1) return null;
    if (n > MAX_MARKET_PRICE_COINS) {
        inp.value = String(MAX_MARKET_PRICE_COINS);
        return MAX_MARKET_PRICE_COINS;
    }
    return n;
}

const quickSellByWeaponId = new Map();
let cachedSiteUserId = null;
let _qsDomObs = null;
let _qsScrapeTimer = null;

/** CS:R instant sell prices by rarity (from site RARITY_PRICES). */
const CSR_RARITY_SELL_PRICES = { 7: 6942, 6: 2013, 5: 530, 4: 255, 3: 118, 2: 94, 1: 56 };

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

function extractWeaponIdFromUrl(url) {
    if (!url) return null;
    const patterns = [
        /\/inventory\/sell\/(\d+)/i,
        /\/inventory\/(?:weapon|item|items)\/(\d+)/i,
        /\/inventory\/(\d+)(?:\/|$|\?)/i,
        /\/weapons\/(\d+)/i,
    ];
    for (const re of patterns) {
        const m = String(url).match(re);
        if (m) return parseInt(m[1], 10);
    }
    return null;
}

function extractQuickSellFromItem(item) {
    if (!item || typeof item !== 'object') return null;
    const keys = [
        'quick_sell_price', 'quick_sell', 'insta_sell_price', 'insta_sell',
        'instant_sell_price', 'instant_sell', 'sell_price', 'sell_value',
        'quicksell_price', 'vendor_price', 'scrap_value', 'base_sell_price',
        'sell_coins', 'coins_sell', 'insta_sell_coins', 'quick_sell_coins',
        'sell_amount', 'vendor_coins', 'scrap_coins', 'coins_received',
        'sell', 'sell_value_coins', 'scrap', 'worth', 'value',
        'quickSellPrice', 'sellPrice', 'instaSell', 'vendorPrice',
        'min_sell', 'min_sell_price', 'default_sell', 'default_sell_price',
    ];
    for (const k of keys) {
        const p = parseCoinVal(item[k]);
        if (p != null) return p;
    }
    const stack = [item];
    while (stack.length) {
        const o = stack.pop();
        if (!o || typeof o !== 'object') continue;
        for (const [k, v] of Object.entries(o)) {
            if (v && typeof v === 'object') stack.push(v);
            else if (/sell|vendor|scrap|instant|quick/i.test(k)) {
                const p = parseCoinVal(v);
                if (p != null) return p;
            }
        }
    }
    return null;
}

function cacheQuickSellFromInventory(arr) {
    if (!Array.isArray(arr)) return;
    for (const raw of arr) {
        const p = extractQuickSellFromItem(raw);
        const wid = raw?.weapon_id != null ? parseInt(raw.weapon_id, 10) : null;
        if (wid && p != null) quickSellByWeaponId.set(wid, p);
    }
}

function cacheQuickSellFromApiData(url, data, depth = 0) {
    if (!data || depth > 14) return;
    const widFromUrl = extractWeaponIdFromUrl(url);

    const tryRaw = (raw, widHint) => {
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return;
        const wid = raw.weapon_id != null ? parseInt(raw.weapon_id, 10) : widHint;
        const p = extractQuickSellFromItem(raw);
        if (wid && p != null) quickSellByWeaponId.set(wid, p);
    };

    if (Array.isArray(data)) {
        cacheQuickSellFromInventory(data);
        if (depth === 0) return;
        for (const v of data) {
            if (v && typeof v === 'object') cacheQuickSellFromApiData(url, v, depth + 1);
        }
        return;
    }
    if (typeof data !== 'object') return;

    if (depth === 0 && Array.isArray(data.items)) {
        cacheQuickSellFromInventory(data.items);
        tryRaw(data, widFromUrl);
        return;
    }

    tryRaw(data, widFromUrl);
    for (const k of ['item', 'weapon', 'skin', 'data', 'result', 'inventory_item']) {
        if (data[k]) tryRaw(data[k], widFromUrl);
    }
    if (widFromUrl) {
        const top = extractQuickSellFromItem(data);
        if (top != null) quickSellByWeaponId.set(widFromUrl, top);
    }

    for (const v of Object.values(data)) {
        if (v && typeof v === 'object') cacheQuickSellFromApiData(url, v, depth + 1);
    }
}

function isCsrTrackedUrl(url) {
    const u = String(url || '');
    return u.includes('api.csrestored.fun')
        || (u.includes('csrestored.fun') && /\/api\//i.test(u));
}

function rememberSiteUserId(url) {
    const m = String(url || '').match(/\/api\/user\/(\d+)\//i);
    if (m) cachedSiteUserId = m[1];
}

function findWeaponIdInText(text) {
    const m = (text || '').match(/\bID:\s*(\d+)\b/i);
    return m ? parseInt(m[1], 10) : null;
}

function findWeaponIdNearElement(el) {
    let node = el;
    for (let i = 0; i < 25 && node; i++) {
        const wid = findWeaponIdInText(node.innerText);
        if (wid) return wid;
        node = node.parentElement;
    }
    return null;
}

function parseQuickSellFromButton(btn) {
    const blob = [
        btn.textContent,
        btn.innerText,
        btn.getAttribute('aria-label'),
        btn.parentElement?.textContent,
    ].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
    const m = blob.match(/quick\s*sell[^\d]*([\d][\d.,]*)/i);
    if (m) return parseCoinVal(m[1]);
    if (!/quick\s*sell/i.test(blob)) return null;
    for (const ch of btn.querySelectorAll('span, div, p')) {
        const t = (ch.textContent || '').trim();
        if (/quick\s*sell/i.test(t)) continue;
        const n = parseCoinVal(t);
        if (n != null && n > 0) return n;
    }
    return null;
}

function scrapeWeaponDetailsQuickSell() {
    let found = false;
    for (const btn of document.querySelectorAll('button, a, [role="button"]')) {
        if (btn.closest('#csrx-win, #csrx-overlay, #csrx-fab')) continue;
        const price = parseQuickSellFromButton(btn);
        if (price == null) continue;
        const wid = findWeaponIdNearElement(btn);
        if (!wid) continue;
        quickSellByWeaponId.set(wid, price);
        found = true;
    }
    if (found) refreshQuickSellLabelsOnCards();
    return found;
}

function scheduleQuickSellDomScrape() {
    if (!isInventoryPage()) return;
    clearTimeout(_qsScrapeTimer);
    _qsScrapeTimer = setTimeout(() => {
        scrapeWeaponDetailsQuickSell();
        scheduleBrowseLayoutUpdate();
    }, 120);
}

function ensureQuickSellDomWatcher() {
    if (_qsDomObs || !isInventoryPage()) return;
    _qsDomObs = new MutationObserver(() => scheduleQuickSellDomScrape());
    _qsDomObs.observe(document.body, { childList: true, subtree: true, characterData: true });
    scheduleQuickSellDomScrape();
}

function refreshQuickSellLabelsOnCards() {
    if (!overlay?.classList.contains('open')) return;
    document.querySelectorAll('#csrx-mgrid .mc.mc-confirmed').forEach(wrap => {
        const idx = parseInt(wrap.dataset.idx, 10);
        if (Number.isNaN(idx)) return;
        const entry = modalEntries[idx];
        if (!entry?.item) return;
        const p = getQuickSellPrice(entry.item);
        const qsEl = wrap.querySelector('.mc-qs-price');
        if (!qsEl) return;
        if (p != null) {
            qsEl.textContent = `Quick sell: ${formatCoins(p)}`;
            qsEl.classList.remove('unknown');
            entry.item._csrxQuickSell = p;
        }
    });
    refreshFooter();
}

function applyQuickSellToEntries(entries, rawInv) {
    for (const entry of entries) {
        if (!entry?.item) continue;
        const raw = rawInv?.find?.(i => parseInt(i.weapon_id, 10) === entry.item.weapon_id);
        const item = raw ? { ...entry.item, ...raw } : entry.item;
        const p = getQuickSellPrice(item);
        if (p != null) {
            entry.item._csrxQuickSell = p;
            if (entry.item.weapon_id != null) quickSellByWeaponId.set(entry.item.weapon_id, p);
        }
    }
}

function getQuickSellPrice(item) {
    if (!item) return null;
    if (item._csrxQuickSell != null) return item._csrxQuickSell;
    const wid = item.weapon_id != null ? parseInt(item.weapon_id, 10) : null;
    if (wid && quickSellByWeaponId.has(wid)) return quickSellByWeaponId.get(wid);
    const fromApi = extractQuickSellFromItem(item);
    if (fromApi != null) return fromApi;
    return computeQuickSellPrice(item);
}

function getSuggestedMarketPrice(item) {
    if (!item) return null;
    const keys = ['suggested_price', 'market_price', 'recommended_price', 'list_price', 'default_price'];
    for (const k of keys) {
        const p = parseCoinVal(item[k]);
        if (p != null) return p;
    }
    const qs = getQuickSellPrice(item);
    return qs != null ? Math.max(1, Math.round(qs * 1.15)) : null;
}

function parseRequestBody(bodyRaw) {
    if (bodyRaw == null) return null;
    try {
        if (typeof bodyRaw === 'string') return JSON.parse(bodyRaw);
        if (typeof bodyRaw === 'object') return bodyRaw;
    } catch (_) {}
    return null;
}

function saveMarketListFromRequest(url, method, bodyRaw) {
    if (!url?.includes('api.csrestored.fun')) return;
    if ((method || 'GET').toUpperCase() !== 'POST') return;
    if (/\/inventory\/sell\//i.test(url) && !/marketplace/i.test(url)) return;
    const isMpAdd = /\/marketplace\/add\/?$/i.test(url) || (/\/marketplace/i.test(url) && /\/add/i.test(url));
    if (!isMpAdd && !/marketplace.*\/(create|list|offer)/i.test(url)) return;

    const bodyObj = parseRequestBody(bodyRaw);
    try {
        sessionStorage.setItem('csrx_mp_list_url', url);
        if (bodyObj) sessionStorage.setItem('csrx_mp_list_body', JSON.stringify(bodyObj));
    } catch (_) {}
}

function buildMarketListPayload(wid, price) {
    const p = Math.min(Math.max(1, parseInt(price, 10) || 0), MAX_MARKET_PRICE_COINS);
    let tpl = null;
    try { tpl = JSON.parse(sessionStorage.getItem('csrx_mp_list_body') || 'null'); } catch (_) {}
    if (!tpl || typeof tpl !== 'object') return { weapon_id: wid, price: p };

    const body = JSON.parse(JSON.stringify(tpl));
    const walk = (obj) => {
        if (!obj || typeof obj !== 'object') return;
        for (const k of Object.keys(obj)) {
            const lk = k.toLowerCase();
            if ((lk === 'weapon_id' || lk === 'weaponid' || lk === 'skin_id') && typeof obj[k] === 'number') {
                obj[k] = wid;
            } else if (
                (lk === 'price' || lk === 'price_coins' || lk === 'list_price' || lk === 'market_price')
                && typeof obj[k] === 'number'
            ) {
                obj[k] = p;
            } else if (/quick|instant|sell|vendor|scrap/i.test(lk) && typeof obj[k] === 'number') {
                delete obj[k];
            } else if (typeof obj[k] === 'object') {
                walk(obj[k]);
            }
        }
    };
    walk(body);
    body.weapon_id = wid;
    body.price = p;
    if ('price_coins' in body) body.price_coins = p;
    if ('coins' in body && !('price' in tpl)) body.coins = p;
    return body;
}

const S = document.createElement('style');
S.textContent = `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');

.csrx-card-wrap {
    position: absolute !important;
    bottom: 6px !important;
    right: 6px !important;
    display: flex !important;
    flex-direction: column !important;
    align-items: flex-end !important;
    gap: 2px !important;
    pointer-events: none !important;
    z-index: 5 !important;
}
/* Marketplace: abaixo do preço (coins), canto superior direito */
.csrx-card-wrap.csrx-mp-pos {
    bottom: auto !important;
    top: 32px !important;
    right: 8px !important;
}
.csrx-float-badge {
    display: inline-flex !important;
    align-items: center !important;
    gap: 3px !important;
    padding: 2px 6px !important;
    border-radius: 3px !important;
    font-family: 'Inter', monospace !important;
    font-size: 9px !important;
    font-weight: 600 !important;
    white-space: nowrap !important;
    letter-spacing: 0.1px !important;
    background: rgba(0,0,0,0.78) !important;
    border: 1px solid rgba(255,255,255,0.08) !important;
    backdrop-filter: blur(6px) !important;
}
.csrx-float-dot {
    width: 4px !important;
    height: 4px !important;
    border-radius: 50% !important;
    flex-shrink: 0 !important;
    display: inline-block !important;
}
.csrx-seed-badge {
    font-family: 'Inter', sans-serif !important;
    font-size: 9px !important;
    font-weight: 500 !important;
    color: rgba(255,255,255,0.45) !important;
    background: rgba(0,0,0,0.65) !important;
    padding: 2px 5px !important;
    border-radius: 3px !important;
    backdrop-filter: blur(6px) !important;
    white-space: nowrap !important;
    letter-spacing: 0.1px !important;
}

@keyframes csrxPulse {
    0%   { box-shadow: 0 0 0 0 rgba(239,68,68,0.4); }
    70%  { box-shadow: 0 0 0 8px rgba(239,68,68,0); }
    100% { box-shadow: 0 0 0 0 rgba(239,68,68,0); }
}
.csrx-picked {
    outline: 1.5px solid rgba(239,68,68,0.8) !important;
    outline-offset: 2px !important;
    transform: scale(0.94) !important;
    border-radius: 14px !important;
    animation: csrxPulse 2s infinite !important;
    position: relative !important;
    transition: transform 0.15s !important;
}
.csrx-lock-btn {
    position: absolute !important;
    top: 8px !important;
    left: 8px !important;
    width: 20px !important;
    height: 20px !important;
    padding: 0 !important;
    border: 1px solid #333 !important;
    border-radius: 5px !important;
    background: rgba(0,0,0,0.75) !important;
    color: #888 !important;
    cursor: pointer !important;
    z-index: 2 !important;
    pointer-events: auto !important;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
    line-height: 0 !important;
}
/* Below CS:R fixed sidebar (site uses ~z-20); stay above card art only */
.csrx-lock-btn:hover { border-color: #555 !important; color: #ccc !important; }
.csrx-lock-btn.csrx-locked {
    border-color: #f59e0b55 !important;
    background: rgba(245,158,11,0.2) !important;
    color: #fbbf24 !important;
}
.csrx-locked-card {
    outline: 1px solid rgba(245,158,11,0.35) !important;
    outline-offset: 1px !important;
}
.csrx-check-badge {
    position: absolute !important;
    top: 6px !important;
    left: 6px !important;
    width: 18px !important;
    height: 18px !important;
    background: #ef4444 !important;
    border-radius: 4px !important;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
    z-index: 6 !important;
    pointer-events: none !important;
}

#csrx-fab.csrx-feature-off,
#csrx-win.csrx-feature-off,
#csrx-cases-fab.csrx-feature-off,
#csrx-cases-win.csrx-feature-off {
    display: none !important;
    visibility: hidden !important;
    pointer-events: none !important;
}
#csrx-cases-fab {
    position: fixed;
    bottom: 24px;
    right: 24px;
    width: 48px;
    height: 48px;
    background: #0a0a0a;
    border-radius: 12px;
    display: none;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    z-index: 2147483640;
    box-shadow: 0 4px 20px rgba(234,179,8,0.35);
    transition: all 0.2s cubic-bezier(0.34,1.56,0.64,1);
    border: 2px solid #eab308;
    padding: 0;
    overflow: hidden;
}
#csrx-cases-fab:hover {
    transform: scale(1.07) translateY(-2px);
    box-shadow: 0 8px 28px rgba(234,179,8,0.5);
}
#csrx-cases-fab img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
    border-radius: 10px;
}
#csrx-cases-win {
    position: fixed;
    bottom: 24px;
    right: 24px;
    width: 320px;
    max-height: calc(100vh - 48px);
    background: #0a0a0a;
    border: 1px solid #2a2a2a;
    border-radius: 14px;
    display: none;
    flex-direction: column;
    z-index: 2147483641;
    box-shadow: 0 12px 40px rgba(0,0,0,0.65);
    overflow: hidden;
    font-family: 'Geist', 'Inter', sans-serif;
}
#csrx-cases-win.open { display: flex; }
#csrx-cases-hdr {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 12px 14px;
    border-bottom: 1px solid #1e1e1e;
    cursor: move;
    user-select: none;
    flex-shrink: 0;
}
#csrx-cases-winx {
    margin-left: auto;
    width: 26px;
    height: 26px;
    border-radius: 8px;
    border: 1px solid #2a2a2a;
    background: #111;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
}
#csrx-cases-body {
    padding: 14px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    flex: 1;
    min-height: 0;
    overflow-y: auto;
}
#csrx-cases-tabs {
    display: flex;
    gap: 8px;
}
.csrx-cases-tab {
    flex: 1;
    padding: 8px 10px;
    border-radius: 10px;
    border: 1px solid #2a2a2a;
    background: #111;
    color: #b1a7a6;
    font-weight: 700;
    font-size: 0.75rem;
    cursor: pointer;
}
.csrx-cases-tab.active {
    background: #1a1a1a;
    color: #e5e7eb;
    border-color: #3a3a3a;
}
.csrx-cases-mode {
    display: flex;
    flex-direction: column;
    gap: 10px;
}
#csrx-cases-body label {
    font-size: 0.6875rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #71717a;
}
#csrx-cases-pick-search-wrap {
    margin-bottom: 10px;
}
#csrx-cases-pick-search {
    width: 100%;
    margin-top: 6px;
    padding: 10px 12px;
    border-radius: 10px;
    border: 1px solid #2a2a2a;
    background: #111;
    color: #fff;
    font-size: 0.875rem;
}
#csrx-cases-pick-search:focus { border-color: #eab308; outline: none; }
#csrx-cases-pick-search::placeholder { color: #555; }
.csrx-cases-search-empty {
    padding: 10px 8px;
    font-size: 0.75rem;
    color: #737373;
    text-align: center;
}
.csrx-cases-multi-row-hidden { display: none !important; }
#csrx-cases-select,
#csrx-cases-qty {
    width: 100%;
    padding: 10px 12px;
    border-radius: 10px;
    border: 1px solid #2a2a2a;
    background: #111;
    color: #fff;
    font-size: 0.875rem;
}
#csrx-cases-open-delay,
#csrx-cases-open-mins,
#csrx-cases-open-spend {
    width: 100%;
    padding: 10px 12px;
    border-radius: 10px;
    border: 1px solid #2a2a2a;
    background: #111;
    color: #fff;
    font-size: 0.875rem;
}
#csrx-cases-open-summary {
    font-size: 0.8125rem;
    color: #b1a7a6;
    line-height: 1.45;
}
#csrx-cases-open-summary strong { color: #eab308; }
#csrx-cases-open-log {
    border: 1px solid #1f1f1f;
    background: #0c0c0c;
    border-radius: 10px;
    padding: 10px;
    max-height: 130px;
    overflow: auto;
    font-size: 0.75rem;
    line-height: 1.4;
}
.csrx-cases-log-line { margin: 0 0 6px; }
.csrx-cases-log-line:last-child { margin-bottom: 0; }
#csrx-cases-open-results {
    display: none;
    flex-direction: column;
    gap: 6px;
}
#csrx-cases-open-results-label {
    font-size: 0.6875rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #71717a;
}
#csrx-cases-open-results-body {
    border: 1px solid #1f1f1f;
    background: #0c0c0c;
    border-radius: 10px;
    padding: 8px 10px;
    max-height: 200px;
    overflow: auto;
}
.csrx-cases-result-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 5px 0;
    border-bottom: 1px solid #1a1a1a;
    font-size: 0.75rem;
    line-height: 1.35;
}
.csrx-cases-result-row:last-child { border-bottom: none; }
.csrx-cases-result-info {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 10px;
}
.csrx-cases-result-name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.csrx-cases-result-float {
    flex-shrink: 0;
    font-variant-numeric: tabular-nums;
    font-weight: 600;
}
.csrx-cases-result-sell {
    flex-shrink: 0;
    padding: 4px 8px;
    border-radius: 6px;
    border: 1px solid #3f3f46;
    background: #141414;
    color: #eab308;
    font-size: 0.6875rem;
    font-weight: 700;
    cursor: pointer;
    white-space: nowrap;
}
.csrx-cases-result-sell:hover:not(:disabled) {
    border-color: #eab308;
    background: rgba(234, 179, 8, 0.08);
}
.csrx-cases-result-sell:disabled {
    opacity: 0.35;
    cursor: not-allowed;
    color: #737373;
}
#csrx-cases-summary {
    font-size: 0.8125rem;
    color: #b1a7a6;
    line-height: 1.45;
}
#csrx-cases-summary strong { color: #eab308; }
#csrx-cases-progress {
    height: 4px;
    background: #1a1a1a;
    border-radius: 4px;
    overflow: hidden;
    display: none;
}
#csrx-cases-progress-bar {
    height: 100%;
    width: 0%;
    background: linear-gradient(90deg, #ca8a04, #eab308);
    transition: width 0.15s ease;
}
#csrx-cases-buy {
    width: 100%;
    padding: 11px 14px;
    border-radius: 10px;
    border: none;
    background: #eab308;
    color: #0a0a0a;
    font-weight: 700;
    font-size: 0.875rem;
    cursor: pointer;
}
#csrx-cases-buy:disabled {
    opacity: 0.45;
    cursor: not-allowed;
}
#csrx-cases-buy:not(:disabled):hover { filter: brightness(1.08); }
#csrx-cases-cancel {
    width: 100%;
    padding: 9px 14px;
    border-radius: 10px;
    border: 1px solid #2a2a2a;
    background: transparent;
    color: #b1a7a6;
    font-size: 0.8125rem;
    cursor: pointer;
    display: none;
}
#csrx-cases-open-start {
    width: 100%;
    padding: 11px 14px;
    border-radius: 10px;
    border: none;
    background: #eab308;
    color: #0a0a0a;
    font-weight: 800;
    font-size: 0.875rem;
    cursor: pointer;
}
#csrx-cases-open-start:disabled { opacity: 0.45; cursor: not-allowed; }
#csrx-cases-open-start:not(:disabled):hover { filter: brightness(1.08); }
#csrx-cases-open-stop {
    width: 100%;
    padding: 9px 14px;
    border-radius: 10px;
    border: 1px solid #2a2a2a;
    background: transparent;
    color: #b1a7a6;
    font-size: 0.8125rem;
    cursor: pointer;
    display: none;
}
.csrx-cases-open-mode {
    display: flex;
    gap: 6px;
    margin-top: 6px;
}
.csrx-cases-open-mode-btn {
    flex: 1;
    padding: 8px 10px;
    border-radius: 8px;
    border: 1px solid #2a2a2a;
    background: #111;
    color: #a3a3a3;
    font-size: 0.75rem;
    font-weight: 600;
    cursor: pointer;
}
.csrx-cases-open-mode-btn.active {
    border-color: #eab308;
    color: #fef08a;
    background: rgba(234, 179, 8, 0.08);
}
#csrx-cases-open-multi-wrap {
    display: none;
    flex-direction: column;
    gap: 8px;
}
#csrx-cases-open-multi-list {
    max-height: 140px;
    overflow-y: auto;
    border: 1px solid #2a2a2a;
    border-radius: 10px;
    padding: 6px;
    background: #0c0c0c;
}
.csrx-cases-multi-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 4px;
    font-size: 0.75rem;
    color: #e5e7eb;
    cursor: pointer;
    border-radius: 6px;
}
.csrx-cases-multi-row:hover { background: rgba(255,255,255,0.04); }
.csrx-cases-multi-row input { flex-shrink: 0; accent-color: #eab308; }
.csrx-cases-multi-row span { flex: 1; line-height: 1.3; }
.csrx-cases-multi-row em {
    font-style: normal;
    color: #737373;
    font-size: 0.6875rem;
}
.csrx-cases-multi-qty {
    width: 44px;
    flex-shrink: 0;
    padding: 4px 6px;
    border-radius: 6px;
    border: 1px solid #2a2a2a;
    background: #111;
    color: #fff;
    font-size: 0.75rem;
    text-align: center;
}
.csrx-cases-multi-qty:disabled {
    opacity: 0.35;
}
#csrx-cases-multi-strategy-wrap {
    margin-bottom: 10px;
}
#csrx-cases-multi-strategy-wrap > label {
    display: block;
    font-size: 0.6875rem;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: #737373;
    margin-bottom: 6px;
}
#csrx-cases-open-multi-actions {
    display: flex;
    gap: 8px;
}
#csrx-cases-open-multi-actions button {
    flex: 1;
    padding: 6px 10px;
    border-radius: 8px;
    border: 1px solid #2a2a2a;
    background: #141414;
    color: #b1a7a6;
    font-size: 0.6875rem;
    font-weight: 600;
    cursor: pointer;
}
#csrx-cases-open-sell-wrap {
    display: none;
    flex-direction: column;
    gap: 8px;
    padding-top: 4px;
    border-top: 1px solid #1f1f1f;
}
#csrx-cases-open-sell-manual {
    display: none;
    flex-direction: column;
    gap: 8px;
}
#csrx-cases-open-sell-label {
    font-size: 0.6875rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #71717a;
}
#csrx-cases-open-sell-hint {
    font-size: 0.6875rem;
    color: #737373;
    line-height: 1.4;
}
#csrx-cases-open-sell-batch {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    font-size: 0.75rem;
    color: #b1a7a6;
}
#csrx-cases-open-sell-spd {
    width: 56px;
    padding: 6px 8px;
    border-radius: 8px;
    border: 1px solid #2a2a2a;
    background: #111;
    color: #fff;
    font-size: 0.8125rem;
    text-align: center;
}
.csrx-cases-sell-btn {
    width: 100%;
    padding: 9px 12px;
    border-radius: 10px;
    border: 1px solid #2a2a2a;
    background: #141414;
    color: #e5e7eb;
    font-size: 0.8125rem;
    font-weight: 600;
    cursor: pointer;
}
.csrx-cases-sell-btn:hover:not(:disabled) { filter: brightness(1.08); }
.csrx-cases-sell-btn:disabled { opacity: 0.45; cursor: not-allowed; }
#csrx-cases-open-sell-nongold {
    border-color: #3f3f46;
    color: #fca5a5;
}
#csrx-fab {
    position: fixed;
    bottom: 24px;
    right: 24px;
    width: 48px;
    height: 48px;
    background: #0a0a0a;
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    z-index: 2147483640;
    box-shadow: 0 4px 20px rgba(239,68,68,0.35);
    transition: all 0.2s cubic-bezier(0.34,1.56,0.64,1);
    border: 2px solid #ef4444;
    padding: 0;
    overflow: hidden;
}
#csrx-fab:hover {
    transform: scale(1.07) translateY(-2px);
    box-shadow: 0 8px 28px rgba(239,68,68,0.5);
}
#csrx-fab img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
    border-radius: 10px;
}

#csrx-win {
    position: fixed;
    top: 72px;
    right: 18px;
    width: 268px;
    background: #0a0a0a;
    border: 1px solid #1f1f1f;
    border-radius: 16px;
    box-shadow: 0 20px 60px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.03);
    z-index: 2147483640;
    display: none;
    flex-direction: column;
    overflow: hidden;
    font-family: 'Inter', sans-serif;
}
#csrx-win-top {
    height: 1px;
    background: linear-gradient(90deg, transparent, #ef4444, transparent);
    opacity: 0.6;
    flex-shrink: 0;
}

#csrx-hdr {
    padding: 14px 16px 13px;
    display: flex;
    align-items: center;
    gap: 10px;
    cursor: grab;
    user-select: none;
    border-bottom: 1px solid #161616;
}
#csrx-hdr:active { cursor: grabbing; }

.csrx-logo {
    width: 32px;
    height: 32px;
    border-radius: 8px;
    flex-shrink: 0;
    background: #0a0a0a;
    border: 2px solid #ef4444;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    padding: 0;
}
.csrx-logo img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
    border-radius: 6px;
}
.csrx-hdr-text { flex: 1; min-width: 0; }
.csrx-hdr-title {
    font-size: 13px;
    font-weight: 700;
    color: #fff;
    letter-spacing: -0.2px;
    line-height: 1;
}
.csrx-hdr-sub {
    font-size: 10px;
    color: #b4b4b4;
    margin-top: 2px;
    font-weight: 400;
}

#csrx-winx {
    width: 22px;
    height: 22px;
    border-radius: 5px;
    flex-shrink: 0;
    background: transparent;
    border: 1px solid #1f1f1f;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: all 0.15s;
}
#csrx-winx:hover { background: #1a1a1a; border-color: #2a2a2a; }

#csrx-statusbar {
    margin: 10px 12px 0;
    padding: 7px 11px;
    background: #111;
    border: 1px solid #1a1a1a;
    border-radius: 8px;
    display: flex;
    align-items: center;
    gap: 7px;
}
.csrx-dot {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    flex-shrink: 0;
    background: #22c55e;
}
.csrx-dot.syncing { background: #f59e0b; animation: csrxBlink 0.9s infinite; }
.csrx-dot.active  { background: #ef4444; }
@keyframes csrxBlink { 0%,100%{opacity:1} 50%{opacity:0.2} }
#csrx-stat { font-size: 10px; font-weight: 500; color: #d4d4d4; flex: 1; }

#csrx-body { padding: 12px; display: flex; flex-direction: column; gap: 14px; }

.csrx-section {
    font-size: 9px;
    font-weight: 600;
    color: #a8a8a8;
    text-transform: uppercase;
    letter-spacing: 1.5px;
    margin-bottom: 8px;
    display: flex;
    align-items: center;
    gap: 6px;
}
.csrx-section::after { content: ''; flex: 1; height: 1px; background: #2a2a2a; }

.csrx-btn {
    width: 100%;
    padding: 10px 14px;
    border-radius: 8px;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.1px;
    cursor: pointer;
    border: 1px solid transparent;
    transition: all 0.15s;
    font-family: 'Inter', sans-serif;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
}
.csrx-btn:disabled { opacity: 0.3; cursor: not-allowed; transform: none !important; }

.csrx-btn-primary {
    background: #ef4444;
    color: #fff;
    border-color: #ef4444;
    box-shadow: 0 2px 12px rgba(239,68,68,0.25);
}
.csrx-btn-primary:hover:not(:disabled) {
    background: #dc2626;
    border-color: #dc2626;
    box-shadow: 0 4px 18px rgba(239,68,68,0.38);
    transform: translateY(-1px);
}
.csrx-btn-success {
    background: transparent;
    color: #fff;
    border-color: #2a2a2a;
}
.csrx-btn-success:hover:not(:disabled) {
    background: #1a1a1a;
    border-color: #333;
    transform: translateY(-1px);
}
.csrx-btn-danger {
    background: transparent;
    color: #ef4444;
    border-color: #2a2a2a;
}
.csrx-btn-danger:hover:not(:disabled) {
    background: rgba(239,68,68,0.06);
    border-color: rgba(239,68,68,0.3);
    transform: translateY(-1px);
}
.csrx-btn-cancel {
    background: transparent;
    color: #555;
    border-color: #1f1f1f;
}
.csrx-btn-cancel:hover:not(:disabled) { background: #111; color: #888; }

#csrx-picked-info {
    display: none;
    background: rgba(239,68,68,0.06);
    border: 1px solid rgba(239,68,68,0.15);
    border-radius: 7px;
    padding: 7px 10px;
    font-size: 10px;
    color: #ef4444;
    font-weight: 500;
    align-items: center;
    gap: 5px;
}
#csrx-picked-info.show { display: flex; }

select.csrx-sel {
    width: 100%;
    padding: 9px 26px 9px 11px;
    background: #111;
    border: 1px solid #1f1f1f;
    border-radius: 8px;
    color: #e5e5e5;
    font-family: 'Inter', sans-serif;
    font-size: 11px;
    font-weight: 500;
    outline: none;
    cursor: pointer;
    appearance: none;
    transition: all 0.15s;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' fill='%23333' viewBox='0 0 16 16'%3E%3Cpath d='M4 6h8l-4 5z'/%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right 9px center;
}
select.csrx-sel:focus { border-color: #2a2a2a; color: #fafafa; outline: none; }
select.csrx-sel option { background: #0a0a0a; color: #e5e5e5; }

.csrx-slider-wrap { padding: 1px 0; }
.csrx-slider-row  { display: flex; justify-content: space-between; align-items: center; margin-bottom: 9px; }
.csrx-slider-lbl  { font-size: 10px; font-weight: 500; color: #c4c4c4; }
.csrx-slider-val  {
    font-size: 11px;
    font-weight: 700;
    color: #fff;
    background: #161616;
    border: 1px solid #222;
    padding: 1px 8px;
    border-radius: 4px;
    min-width: 24px;
    text-align: center;
}
input[type=range].csrx-range {
    -webkit-appearance: none;
    appearance: none;
    width: 100%;
    background: transparent;
}
input[type=range].csrx-range::-webkit-slider-runnable-track,
input[type=range].csrx-range::-moz-range-track {
    height: 2px;
    background: #1f1f1f;
    border-radius: 2px;
}
input[type=range].csrx-range::-webkit-slider-thumb {
    -webkit-appearance: none;
    height: 12px;
    width: 12px;
    border-radius: 50%;
    background: #ef4444;
    cursor: pointer;
    margin-top: -5px;
    box-shadow: 0 0 8px rgba(239,68,68,0.4);
    transition: transform 0.15s;
}
input[type=range].csrx-range::-moz-range-thumb {
    height: 12px;
    width: 12px;
    border: none;
    border-radius: 50%;
    background: #ef4444;
    cursor: pointer;
    box-shadow: 0 0 8px rgba(239,68,68,0.4);
    transition: transform 0.15s;
}
input[type=range].csrx-range:hover::-webkit-slider-thumb,
input[type=range].csrx-range:hover::-moz-range-thumb { transform: scale(1.2); }

#csrx-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.92);
    backdrop-filter: blur(16px);
    z-index: 2147483647;
    display: none;
    align-items: center;
    justify-content: center;
    padding: 20px;
}
#csrx-overlay.open { display: flex; }

#csrx-modal {
    background: #0a0a0a;
    border: 1px solid #1f1f1f;
    border-radius: 18px;
    width: 100%;
    max-width: 860px;
    max-height: 92vh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    box-shadow: 0 40px 80px rgba(0,0,0,0.8), 0 0 0 1px rgba(255,255,255,0.02);
    font-family: 'Inter', sans-serif;
    animation: csrxIn 0.22s cubic-bezier(0.34,1.56,0.64,1);
}
@keyframes csrxIn {
    from { opacity:0; transform:scale(0.94) translateY(20px); }
    to   { opacity:1; transform:scale(1) translateY(0); }
}
#csrx-modal-top {
    height: 1px;
    flex-shrink: 0;
    background: linear-gradient(90deg, transparent, #ef4444 30%, #ef4444 70%, transparent);
    opacity: 0.5;
}

#csrx-mhdr {
    padding: 18px 22px 15px;
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    border-bottom: 1px solid #161616;
    flex-shrink: 0;
}
.csrx-mhdr-left { display: flex; flex-direction: column; gap: 4px; }
.csrx-mhdr-title {
    font-size: 17px;
    font-weight: 700;
    color: #fff;
    letter-spacing: -0.3px;
    line-height: 1;
}
.csrx-mhdr-title span { color: #ef4444; }
.csrx-mhdr-sub { font-size: 11px; color: #b4b4b4; font-weight: 400; }

#csrx-mxbtn {
    width: 28px;
    height: 28px;
    border-radius: 7px;
    flex-shrink: 0;
    background: transparent;
    border: 1px solid #1f1f1f;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: all 0.15s;
}
#csrx-mxbtn:hover { background: #161616; border-color: #2a2a2a; }

#csrx-mprog { height: 1px; background: #161616; flex-shrink: 0; overflow: hidden; }
#csrx-mbar  {
    height: 100%;
    width: 0;
    background: #ef4444;
    transition: width 0.4s;
    box-shadow: 0 0 8px rgba(239,68,68,0.6);
}

#csrx-mwarn {
    margin: 12px 22px 0;
    padding: 10px 14px;
    background: rgba(239,68,68,0.04);
    border: 1px solid rgba(239,68,68,0.12);
    border-radius: 8px;
    font-size: 11px;
    color: #ef4444;
    font-weight: 400;
    display: none;
    flex-shrink: 0;
    align-items: flex-start;
    gap: 9px;
    line-height: 1.5;
}
#csrx-mwarn.show { display: flex; }

#csrx-validator {
    margin: 12px 22px 0;
    padding: 12px 14px;
    background: #111;
    border: 1px solid #1a1a1a;
    border-radius: 10px;
    flex-shrink: 0;
    display: none;
}
#csrx-validator.show { display: block; }
.csrx-val-title {
    font-size: 9px;
    font-weight: 600;
    color: #2a2a2a;
    text-transform: uppercase;
    letter-spacing: 1.3px;
    margin-bottom: 8px;
    display: flex;
    align-items: center;
    gap: 5px;
}
.csrx-val-grid { display: flex; flex-direction: column; gap: 3px; }
.csrx-val-row  {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 11px;
    padding: 6px 8px;
    border-radius: 6px;
    background: #0d0d0d;
}
.csrx-val-icon   { width: 13px; height: 13px; flex-shrink: 0; }
.csrx-val-name   { color: #666; font-weight: 500; flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.csrx-val-status { font-size: 9px; font-weight: 600; padding: 2px 6px; border-radius: 4px; flex-shrink: 0; }
.vsok  { background: rgba(34,197,94,0.08);  color: #22c55e; border: 1px solid rgba(34,197,94,0.15); }
.vswarn{ background: rgba(245,158,11,0.08); color: #f59e0b; border: 1px solid rgba(245,158,11,0.15); }
.vserr { background: rgba(239,68,68,0.08);  color: #ef4444; border: 1px solid rgba(239,68,68,0.15); }

#csrx-mgrid {
    flex: 1;
    overflow-y: auto;
    padding: 16px 22px;
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    align-content: flex-start;
}
#csrx-mgrid::-webkit-scrollbar { width: 3px; }
#csrx-mgrid::-webkit-scrollbar-track { background: transparent; }
#csrx-mgrid::-webkit-scrollbar-thumb { background: #1f1f1f; border-radius: 3px; }

.mc {
    width: 148px;
    flex-shrink: 0;
    border-radius: 12px;
    overflow: hidden;
    position: relative;
    display: flex;
    flex-direction: column;
    background: #111;
    border: 1px solid #1a1a1a;
    transition: all 0.18s;
}
.mc:hover {
    transform: translateY(-3px);
    border-color: #2a2a2a;
    box-shadow: 0 10px 30px rgba(0,0,0,0.5);
}
.mc.mc-bad {
    border-color: rgba(239,68,68,0.2) !important;
    background: #0f0808 !important;
}
.mc.mc-confirmed { border-color: #1f1f1f; }

.mc-rline { height: 1.5px; width: 100%; flex-shrink: 0; }

.mc-verified {
    position: absolute;
    top: 7px;
    right: 7px;
    z-index: 5;
    width: 16px;
    height: 16px;
    border-radius: 4px;
    background: #22c55e;
    display: flex;
    align-items: center;
    justify-content: center;
}

.mc-img {
    width: 100%;
    height: 94px;
    padding: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;
    overflow: hidden;
}
.mc-img img {
    max-width: 110px;
    max-height: 76px;
    object-fit: contain;
    filter: drop-shadow(0 4px 12px rgba(0,0,0,0.8));
    display: block;
    position: relative;
    z-index: 1;
    transition: transform 0.18s;
}
.mc:hover .mc-img img { transform: scale(1.06) translateY(-2px); }
.mc-img-ph { font-size: 32px; z-index: 1; position: relative; }

.mc-wear {
    position: absolute;
    top: 7px;
    left: 7px;
    z-index: 3;
    font-family: 'Inter', sans-serif;
    font-size: 9px;
    font-weight: 600;
    padding: 2px 5px;
    border-radius: 3px;
    background: rgba(0,0,0,0.82);
    border: 1px solid rgba(255,255,255,0.06);
}

.mc-rm {
    flex-shrink: 0;
    width: 22px;
    height: 22px;
    border-radius: 5px;
    background: rgba(239,68,68,0.08);
    border: 1px solid rgba(239,68,68,0.22);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: all 0.15s;
    padding: 0;
    opacity: 0.85;
}
.mc-rm:hover { background: rgba(239,68,68,0.18); border-color: rgba(239,68,68,0.4); opacity: 1; }
.mc-rm.mc-rm-float {
    position: absolute;
    top: 7px;
    right: 7px;
    z-index: 6;
}

.mc-market-row {
    display: flex;
    align-items: center;
    gap: 6px;
}
.mc-market-row .mc-market-price { flex: 1; min-width: 0; }

.mc-body { padding: 0 9px 9px; display: flex; flex-direction: column; flex: 1; }

.mc-weapon {
    font-size: 9px;
    font-weight: 500;
    color: #333;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    line-height: 1.8;
}
.mc-skin {
    font-size: 13px;
    font-weight: 700;
    line-height: 1.2;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    margin-bottom: 6px;
    color: #fff;
}

.mc-float-row {
    display: flex;
    align-items: stretch;
    border-radius: 5px;
    overflow: hidden;
    border: 1px solid #1a1a1a;
    background: #0d0d0d;
    flex-shrink: 0;
}
.mc-float-cond {
    font-size: 9px;
    font-weight: 700;
    padding: 3px 6px;
    flex-shrink: 0;
    border-right: 1px solid #1a1a1a;
    display: flex;
    align-items: center;
}
.mc-float-num {
    font-size: 9px;
    font-weight: 400;
    color: #444;
    padding: 3px 6px;
    flex: 1;
    font-family: 'Inter', monospace;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    min-width: 0;
    display: flex;
    align-items: center;
}

.mc-pattern-row {
    display: flex;
    align-items: center;
    gap: 4px;
    margin-top: 3px;
}
.mc-pattern-lbl { font-size: 9px; font-weight: 400; color: #2a2a2a; }
.mc-pattern-num { font-size: 9px; font-weight: 600; color: #444; font-family: 'Inter', monospace; }

.mc-divider { height: 1px; background: #161616; margin: 5px 0; flex-shrink: 0; }
.mc-rarity  { font-size: 9px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; }
.mc-id      { font-size: 9px; color: #222; font-family: 'Inter', monospace; line-height: 1.5; }
.mc-st      { font-size: 10px; font-weight: 600; color: #f59e0b; margin-top: 2px; }
.mc-tag     { font-size: 10px; font-weight: 400; color: #666; font-style: italic; margin-top: 1px; }
.mc-statusbar { height: 1.5px; border-radius: 2px; margin-top: 5px; flex-shrink: 0; }

#csrx-mfoot {
    padding: 13px 22px;
    border-top: 1px solid #161616;
    display: flex;
    gap: 10px;
    align-items: center;
    flex-shrink: 0;
    background: #080808;
}
#csrx-msumm { flex: 1; }
.csrx-summ-count {
    font-size: 20px;
    font-weight: 700;
    color: #fff;
    letter-spacing: -0.5px;
    line-height: 1;
}
.csrx-summ-sub { font-size: 10px; color: #2a2a2a; margin-top: 2px; font-weight: 400; }

.m-btn {
    padding: 10px 18px;
    border-radius: 8px;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.1px;
    cursor: pointer;
    border: 1px solid transparent;
    font-family: 'Inter', sans-serif;
    transition: all 0.15s;
    white-space: nowrap;
    display: flex;
    align-items: center;
    gap: 6px;
}
.m-btn:disabled { opacity: 0.3; cursor: not-allowed; transform: none !important; }

#csrx-mcancel {
    background: transparent;
    color: #444;
    border-color: #1f1f1f;
}
#csrx-mcancel:hover:not(:disabled) { background: #111; color: #666; }

#csrx-msell {
    background: #ef4444;
    color: #fff;
    border-color: #ef4444;
    box-shadow: 0 2px 14px rgba(239,68,68,0.3);
    min-width: 136px;
    justify-content: center;
}
#csrx-msell:hover:not(:disabled) {
    background: #dc2626;
    border-color: #dc2626;
    transform: translateY(-1px);
    box-shadow: 0 4px 20px rgba(239,68,68,0.45);
}

.mc-price-block {
    margin-top: 6px;
    display: flex;
    flex-direction: column;
    gap: 5px;
    position: relative;
}
.mc-qs-price {
    font-size: 9px;
    font-weight: 600;
    color: #86efac;
    letter-spacing: 0.02em;
}
.mc-qs-price.unknown { color: #555; font-weight: 500; }
.mc-market-lbl {
    font-size: 8px;
    font-weight: 500;
    color: #444;
    text-transform: uppercase;
    letter-spacing: 0.4px;
}
.mc-market-price {
    width: 100%;
    height: 28px;
    padding: 0 8px;
    border-radius: 6px;
    border: 1px solid #2a2a2a;
    background: #0a0a0a;
    color: #fff;
    font-size: 11px;
    font-weight: 600;
    font-family: 'Inter', sans-serif;
}
.mc-market-price:focus {
    outline: none;
    border-color: #ef4444;
    box-shadow: 0 0 0 2px rgba(239,68,68,0.15);
}
.mc-market-price::placeholder { color: #333; font-weight: 400; }

#csrx-mfoot { flex-wrap: wrap; }
#csrx-mfoot-actions {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    justify-content: flex-end;
}
#csrx-mlist {
    background: #1a1a1a;
    color: #fff;
    border-color: #333;
    min-width: 120px;
    justify-content: center;
}
#csrx-mlist:hover:not(:disabled) {
    background: #222;
    border-color: #ef4444;
    color: #fff;
}
#csrx-mquick {
    background: #ef4444;
    color: #fff;
    border-color: #ef4444;
    box-shadow: 0 2px 14px rgba(239,68,68,0.3);
    min-width: 120px;
    justify-content: center;
}
#csrx-mquick:hover:not(:disabled) {
    background: #dc2626;
    border-color: #dc2626;
    transform: translateY(-1px);
    box-shadow: 0 4px 20px rgba(239,68,68,0.45);
}

#csrx-toast {
    position: fixed;
    bottom: 22px;
    left: 50%;
    transform: translateX(-50%) translateY(14px);
    z-index: 2147483647;
    background: #111;
    border: 1px solid #1f1f1f;
    border-radius: 9px;
    padding: 9px 15px;
    font-size: 12px;
    font-weight: 500;
    color: #fff;
    font-family: 'Inter', sans-serif;
    min-width: 170px;
    box-shadow: 0 12px 36px rgba(0,0,0,0.6);
    transition: all 0.26s cubic-bezier(0.34,1.56,0.64,1);
    opacity: 0;
    pointer-events: none;
    text-align: center;
    display: flex;
    align-items: center;
    gap: 9px;
    white-space: nowrap;
}
#csrx-toast.show { opacity: 1; transform: translateX(-50%) translateY(0); }
.csrx-toast-icon {
    width: 18px;
    height: 18px;
    border-radius: 5px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
}

#csrx-browse {
    width: 100%;
    margin: 12px 0 16px 0;
    padding: 0;
    font-family: 'Inter', sans-serif;
    z-index: 5;
    position: relative;
    box-sizing: border-box;
    transition: opacity 0.15s;
}
#csrx-browse.csrx-browse-under-modal {
    opacity: 0;
    visibility: hidden;
    pointer-events: none;
    height: 0;
    margin: 0;
    overflow: hidden;
}
#csrx-browse.csrx-browse-trade {
    margin: 8px 0 6px !important;
    margin-left: 0 !important;
    width: 100% !important;
    max-width: 100%;
    padding: 0;
    box-sizing: border-box;
    flex: 0 0 100%;
    align-self: stretch;
}
#csrx-browse.csrx-browse-create-offer {
    margin: 0 0 8px !important;
    margin-left: 0 !important;
    width: 100% !important;
    max-width: 100%;
    padding: 0 12px;
    box-sizing: border-box;
    flex: none;
    align-self: stretch;
}
#csrx-browse.csrx-browse-create-offer .csrx-browse-row {
    gap: 6px;
    flex-wrap: wrap;
}
#csrx-browse.csrx-browse-create-offer #csrx-browse-search {
    flex: 1 1 140px;
    min-width: 100px;
    max-width: none;
    height: 30px;
    font-size: 11px;
}
#csrx-browse.csrx-browse-create-offer .csrx-browse-filters {
    margin-left: 0;
    flex: 1 1 auto;
    gap: 5px;
}
#csrx-browse.csrx-browse-create-offer .csrx-browse-filters select {
    height: 30px;
    max-width: 108px;
    min-width: 0;
    font-size: 10px;
}
#csrx-browse.csrx-browse-create-offer #csrx-browse-rarity {
    min-width: 0;
    max-width: 118px;
}
#csrx-browse.csrx-browse-create-offer #csrx-browse-float {
    min-width: 0;
    max-width: 108px;
}
#csrx-browse.csrx-browse-create-offer #csrx-browse-clear {
    height: 30px;
    font-size: 10px;
}
#csrx-browse.csrx-browse-trade .csrx-browse-row {
    gap: 5px;
}
.csrx-browse-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
    width: 100%;
}
#csrx-browse-search {
    flex: 1 1 160px;
    min-width: 120px;
    max-width: 280px;
    height: 32px;
    padding: 0 10px 0 32px;
    border-radius: 7px;
    border: 1px solid #2a2a2a;
    background: #111 url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' fill='none' stroke='%23666' stroke-width='2'%3E%3Ccircle cx='5' cy='5' r='3.5'/%3E%3Cpath d='M8 8l2.5 2.5'/%3E%3C/svg%3E") 10px center no-repeat;
    color: #fff;
    font-size: 12px;
    outline: none;
}
#csrx-browse.csrx-browse-trade #csrx-browse-search {
    flex: 1 1 120px;
    min-width: 100px;
    max-width: 100%;
    height: 30px;
    font-size: 11px;
}
#csrx-browse-search:focus { border-color: #ef4444; }
#csrx-browse-search::placeholder { color: #555; }
.csrx-browse-filters {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
    margin-left: auto;
    flex: 0 1 auto;
}
.csrx-browse-filters select {
    height: 32px;
    max-width: 118px;
    padding: 0 24px 0 8px;
    border-radius: 7px;
    border: 1px solid #2a2a2a;
    background: #111;
    color: #ddd;
    font-size: 11px;
    font-family: 'Inter', sans-serif;
    cursor: pointer;
    outline: none;
    appearance: none;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' fill='%23666'%3E%3Cpath d='M0 0l5 6 5-6z'/%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right 10px center;
}
.csrx-browse-filters select:focus { border-color: #ef4444; }
#csrx-browse-rarity {
    min-width: 178px;
    max-width: 198px;
}
#csrx-browse-float {
    min-width: 148px;
    max-width: 162px;
}
#csrx-browse.csrx-browse-trade .csrx-browse-filters select {
    height: 30px;
    max-width: 100px;
    font-size: 10px;
    padding: 0 20px 0 6px;
}
#csrx-browse-clear {
    height: 32px;
    padding: 0 10px;
    border-radius: 7px;
    border: 1px solid #2a2a2a;
    background: transparent;
    color: #888;
    font-size: 11px;
    font-family: 'Inter', sans-serif;
    cursor: pointer;
}
#csrx-browse-clear:hover { color: #fff; border-color: #444; }
#csrx-browse.csrx-browse-trade #csrx-browse-clear {
    height: 30px;
    font-size: 10px;
    padding: 0 8px;
    flex: 0 0 auto;
}
#csrx-browse-count {
    margin-top: 6px;
    font-size: 10px;
    color: #666;
}
.csrx-browse-hidden,
.csrx-browse-slot-hidden {
    display: none !important;
    pointer-events: none !important;
}
`;
document.head.appendChild(S);

let inventoryCache   = [];
let marketplaceCache = [];
let tradeItemsCache      = [];
let tradesListCache      = [];
let friendInventoryCache = [];
let overlayRunning       = false;
let overlayTimer     = null;
let overlayPageKind  = null;
let browsePageKind   = null;
let invIndexByItemId     = new Map();
let mpIndexByItemId      = new Map();
let mpIndexByOfferId     = new Map();
let friendIndexByItemId  = new Map();
let _currentOverlayCards = null;
let _overlayBootTimer    = null;
let _overlayBootGen      = 0;
let _overlayDomObs       = null;
let _tradeModalWasOpen   = false;
let _lastTradeTheirTab   = null;

function resetTradePickerBrowseOnTabSwitch() {
    resetTradePickerBrowseClasses();
    const bar = document.getElementById('csrx-browse');
    if (bar) {
        const search = bar.querySelector('#csrx-browse-search');
        if (search) search.value = '';
        bar.remove();
    }
    browseToolsActive = false;
}
let _largeInvWarned      = false;
const LARGE_INV_WARN     = 200;
const OVERLAY_LAZY_MIN_CARDS = 80;
const OVERLAY_LAZY_VIEW_MARGIN = 400;
const OVERLAY_LAZY_BATCH = 45;
const OVERLAY_INCREMENTAL_MIN_CARDS = 50;
const OVERLAY_INCREMENTAL_BATCH = 50;
const OVERLAY_INCREMENTAL_BOTTOM_MARGIN = 280;
let _overlayLazyScroll = null;
let _overlayLazyScrollTarget = null;
let _overlayLazyCards = null;
let _overlayLazyTick = null;
let _overlayLazyMode = null;

function rebuildInvItemIndex() {
    invIndexByItemId = new Map();
    for (const raw of inventoryCache) {
        const item = normalizeInventoryEntry(raw);
        if (item?.item_id == null) continue;
        if (!invIndexByItemId.has(item.item_id)) invIndexByItemId.set(item.item_id, []);
        invIndexByItemId.get(item.item_id).push(item);
    }
}

function rebuildMpItemIndex() {
    mpIndexByItemId = new Map();
    mpIndexByOfferId = new Map();
    for (const item of marketplaceCache) {
        if (item.offer_id != null) mpIndexByOfferId.set(item.offer_id, item);
        if (item.item_id == null) continue;
        if (!mpIndexByItemId.has(item.item_id)) mpIndexByItemId.set(item.item_id, []);
        mpIndexByItemId.get(item.item_id).push(item);
    }
}

function rebuildFriendItemIndex() {
    friendIndexByItemId = new Map();
    for (const item of friendInventoryCache) {
        if (item.item_id == null) continue;
        if (!friendIndexByItemId.has(item.item_id)) friendIndexByItemId.set(item.item_id, []);
        friendIndexByItemId.get(item.item_id).push(item);
    }
}

function candidatesForImgId(imgId) {
    if (isCreateOfferModal()) return invIndexByItemId.get(imgId) || [];
    if (isMarketplacePage()) return mpIndexByItemId.get(imgId) || [];
    if (isTradePickerModal() && isTheirItemsTabActive()) {
        return friendIndexByItemId.get(imgId) || [];
    }
    return invIndexByItemId.get(imgId) || [];
}

function maybeWarnLargeInventory() {
    if (_largeInvWarned) return;
    const count = isMarketplacePage()
        ? marketplaceCache.length
        : (isTradePage() || isItemPickerModal()) ? getAllCards().length
        : inventoryCache.length;
    if (count < LARGE_INV_WARN) return;
    if (!isInventoryPage() && !isMarketplacePage() && !isItemPickerModal() && !isTradePage()) return;
    _largeInvWarned = true;
    const labelKey = isMarketplacePage() ? 'toast.largeInventory.marketplace'
        : (isTradePage() || isItemPickerModal()) ? 'toast.largeInventory.trade'
        : 'toast.largeInventory.inventory';
    toast(csrT('toast.largeInventory', {
        label: csrT(labelKey),
        count,
    }), 'info');
}

function scheduleOverlayBootstrap() {
    const gen = ++_overlayBootGen;
    const delays = [0, 80, 200, 400, 700, 1100, 1600, 2500, 4000];
    let step = 0;
    clearTimeout(_overlayBootTimer);
    const tick = () => {
        if (!overlayRunning || gen !== _overlayBootGen) return;
        applyOverlaysToAll({ urgent: true });
        const cards = getAllCards();
        const cache = getOverlayCache();
        const missing = cards.length > 0 && cache.length > 0
            && cards.some(c => !c.querySelector('.csrx-card-wrap'));
        step++;
        if (missing && step < delays.length) {
            if (_overlayLazyMode === 'incremental') maybeLoadIncrementalOverlayBatch(true);
            _overlayBootTimer = setTimeout(tick, delays[step]);
        }
    };
    _overlayBootTimer = setTimeout(tick, delays[0]);
}

function ensureOverlayDomObserver() {
    if (_overlayDomObs) return;
    let debounce = null;
    _overlayDomObs = new MutationObserver(() => {
        if (!overlayRunning) return;
        clearTimeout(debounce);
        debounce = setTimeout(() => {
            scheduleApplyOverlays(true);
            scheduleBrowseLayoutUpdate();
            if (isItemPickerModal() && !document.getElementById('csrx-browse')) {
                scheduleBrowseInit();
            }
        }, 100);
    });
    _overlayDomObs.observe(document.body, { childList: true, subtree: true });
}

function stopOverlayDomObserver() {
    _overlayDomObs?.disconnect();
    _overlayDomObs = null;
}

function isMarketplacePage() {
    return window.location.pathname.includes('/marketplace');
}
function isTradePage() {
    const p = window.location.pathname;
    return p.includes('/trade-up') || p.includes('/play') || /\/trades(\/|$)/i.test(p);
}
function findTradePickerModalRoot() {
    for (const el of document.querySelectorAll('h1, h2, h3')) {
        if (!/^send trade offer$/i.test((el.textContent || '').trim())) continue;
        let node = el;
        for (let i = 0; i < 24 && node; i++) {
            const st = getComputedStyle(node);
            const z = parseInt(st.zIndex, 10);
            if (node.getAttribute('role') === 'dialog') return node;
            if (st.position === 'fixed' && node.offsetWidth > 280) return node;
            if (!Number.isNaN(z) && z >= 40 && node.offsetWidth > 280) return node;
            node = node.parentElement;
        }
    }
    return null;
}

function findCreateOfferModalRoot() {
    for (const el of document.querySelectorAll('h1, h2, h3, h4')) {
        if (!/^create offer$/i.test((el.textContent || '').trim())) continue;
        let node = el;
        for (let i = 0; i < 24 && node; i++) {
            const st = getComputedStyle(node);
            const z = parseInt(st.zIndex, 10);
            if (node.getAttribute('role') === 'dialog') return node;
            if (st.position === 'fixed' && node.offsetWidth > 280) return node;
            if (!Number.isNaN(z) && z >= 40 && node.offsetWidth > 280) return node;
            node = node.parentElement;
        }
    }
    return null;
}

function getItemPickerModalRoot() {
    if (isTradePickerModal()) return findTradePickerModalRoot();
    if (isCreateOfferModal()) return findCreateOfferModalRoot();
    return null;
}

function isTradePickerModal() {
    const root = findTradePickerModalRoot();
    if (!root) return false;
    const t = (root.innerText || '').slice(0, 1500);
    return (/my items/i.test(t) && /their items/i.test(t))
        || /select your items/i.test(t)
        || /select their items/i.test(t)
        || /trading with/i.test(t);
}

function isCreateOfferModal() {
    return !!findCreateOfferModalRoot();
}

function isItemPickerModal() {
    return isTradePickerModal() || isCreateOfferModal();
}

function isPickerSkeletonCard(card) {
    if (!isItemPickerModal()) return false;
    let node = card;
    for (let i = 0; i < 4 && node; i++) {
        const cls = node.className || '';
        if (/animate-pulse|skeleton/i.test(cls)) return true;
        node = node.parentElement;
    }
    const img = card.querySelector('img');
    if (!img) return true;
    const r = img.getBoundingClientRect();
    if (r.width > 0 && r.width < 6 && r.height > 0 && r.height < 6) return true;
    return false;
}
function isTradeDetailView() {
    if (isTradePickerModal()) return false;
    const body = document.body?.innerText || '';
    return body.includes('Your offer') && body.includes('Their offer');
}
function isTheirItemsTabActive() {
    const tabs = [...document.querySelectorAll('button, p, span, div, a')];
    let myTab = null;
    let theirTab = null;
    for (const el of tabs) {
        const t = el.textContent?.trim() || '';
        if (/^my items$/i.test(t)) myTab = el;
        if (/^their items$/i.test(t)) theirTab = el;
    }
    if (myTab && theirTab) {
        const myBorder = parseFloat(getComputedStyle(myTab).borderBottomWidth) || 0;
        const theirBorder = parseFloat(getComputedStyle(theirTab).borderBottomWidth) || 0;
        if (theirBorder > myBorder) return true;
        if (theirTab.className?.includes?.('text-theme-primary')) return true;
        if (myTab.className?.includes?.('text-theme-primary')) return false;
    }
    return false;
}
function isInventoryPage() {
    const p = window.location.pathname.replace(/\/$/, '');
    return p === '/app/inventory' && !isMarketplacePage();
}
function isCasesListPage() {
    return CASES_LIST_PAGE_RE.test(window.location.pathname.replace(/\/$/, ''));
}

/** CS:R app left nav (~z-20). Use widest matching rail (collapsed vs hover-expanded). */
function getSiteSidebarRect() {
    let best = null;
    for (const el of document.querySelectorAll('div.fixed, aside')) {
        const r = el.getBoundingClientRect();
        if (r.width < 40 || r.width > 320) continue;
        if (r.left > 24) continue;
        if (r.top > 140) continue;
        if (r.height < window.innerHeight * 0.35) continue;
        if (!best || r.width > best.width) best = r;
    }
    return best;
}

/** Refresh lock clip when site sidebar width changes — does not move extension UI. */
function bindSidebarLockClipWatch() {
    if (window._csrxLockClipWatch) return;
    window._csrxLockClipWatch = true;
    const handler = () => scheduleSidebarChromeAlign();
    const attach = () => {
        for (const el of document.querySelectorAll('div.fixed, aside')) {
            if (el._csrxLockClipOnly) continue;
            const r = el.getBoundingClientRect();
            if (r.left > 24 || r.width < 40 || r.height < window.innerHeight * 0.35) continue;
            el._csrxLockClipOnly = true;
            el.addEventListener('transitionend', handler);
        }
    };
    attach();
    setInterval(attach, 3000);
}

let _sidebarChromeTimer = null;
function scheduleSidebarChromeAlign() {
    clearTimeout(_sidebarChromeTimer);
    _sidebarChromeTimer = setTimeout(() => {
        updateLocksBelowSiteSidebar();
    }, 40);
}

function scheduleLockSidebarClip() {
    scheduleSidebarChromeAlign();
}

function updateLocksBelowSiteSidebar() {
    const locks = document.querySelectorAll('.csrx-lock-btn');
    if (!locks.length) return;

    if (!csrIsFeatureEnabled('skinLock') || !isInventoryPage() || isMarketplacePage()) {
        locks.forEach(btn => {
            btn.style.visibility = '';
            btn.style.pointerEvents = '';
        });
        return;
    }

    const sb = getSiteSidebarRect();
    if (!sb) {
        locks.forEach(btn => {
            btn.style.visibility = '';
            btn.style.pointerEvents = '';
        });
        return;
    }

    const pad = 4;
    const left = sb.left - pad;
    const right = sb.right + pad;
    const top = sb.top - pad;
    const bottom = sb.bottom + pad;

    locks.forEach(btn => {
        const br = btn.getBoundingClientRect();
        const overlap = br.left < right && br.right > left && br.top < bottom && br.bottom > top;
        if (overlap) {
            btn.style.visibility = 'hidden';
            btn.style.pointerEvents = 'none';
        } else {
            btn.style.visibility = '';
            btn.style.pointerEvents = 'auto';
        }
    });
}

function isOverlayPage() {
    if (isInventoryPage() && csrIsFeatureEnabled('skinLock') && !isMarketplacePage()) return true;
    if (!csrIsFeatureEnabled('floatOverlays')) return false;
    return isInventoryPage() || isMarketplacePage() || isTradePage()
        || isTradePickerModal() || isTradeDetailView();
}

function normalizeInventoryEntry(i) {
    if (!i) return null;
    return {
        offer_id:  null,
        weapon_id: i.weapon_id != null ? parseInt(i.weapon_id, 10) : null,
        item_id:   i.item_id != null ? parseInt(i.item_id, 10) : null,
        float:     i.float != null && !Number.isNaN(parseFloat(i.float)) ? parseFloat(i.float) : null,
        seed:      i.seed != null ? parseInt(i.seed, 10) : null,
        stattrak:  !!i.stattrak,
        stattrak_count: i.stattrak_count != null ? parseInt(i.stattrak_count, 10) : null,
        rarity:    i.rarity,
        name:      i.name,
    };
}

function mergeItemCache(existing, incoming) {
    const map = new Map();
    for (const o of existing) {
        const k = o.weapon_id ?? `o${o.offer_id}` ?? `${o.item_id}-${o.float}-${o.seed}`;
        map.set(k, o);
    }
    for (const o of incoming) {
        const k = o.weapon_id ?? `o${o.offer_id}` ?? `${o.item_id}-${o.float}-${o.seed}`;
        map.set(k, o);
    }
    return [...map.values()];
}

function extractTradeItems(data, depth = 0) {
    if (!data || depth > 10) return [];
    const out = [];
    const visit = (node, d) => {
        if (!node || d > 10) return;
        if (Array.isArray(node)) {
            node.forEach(x => visit(x, d + 1));
            return;
        }
        if (typeof node !== 'object') return;
        const itemId = node.item_id ?? node.skin_id;
        const fl = node.skin_float ?? node.float ?? node.wear;
        if (itemId != null && (fl != null || node.weapon_id != null)) {
            const n = normalizeOfferEntry(node);
            if (n) out.push(n);
        }
        for (const v of Object.values(node)) {
            if (v && typeof v === 'object') visit(v, d + 1);
        }
    };
    visit(data, depth);
    return out;
}

function looksLikeTradePayload(data) {
    if (!data || typeof data !== 'object') return false;
    if (data.all || data.sent || data.received || data.history) return true;
    if (data.items_from_initiator || data.items_from_recipient) return true;
    if (data.id != null && (data.items_from_initiator || data.items_from_recipient)) return true;
    return false;
}

function collectTradesFromData(data) {
    const trades = [];
    const addTrade = (trade, viewerRole) => {
        if (!trade || typeof trade !== 'object') return;
        if (!trade.items_from_initiator && !trade.items_from_recipient) return;
        const t = viewerRole ? { ...trade, _viewerRole: viewerRole } : trade;
        trades.push(t);
    };
    if (Array.isArray(data)) {
        data.forEach(t => addTrade(t));
    } else if (data.all || data.sent || data.received || data.history) {
        for (const key of ['all', 'sent', 'received', 'history']) {
            if (!Array.isArray(data[key])) continue;
            const role = key === 'received' ? 'recipient' : key === 'sent' ? 'initiator' : null;
            data[key].forEach(t => addTrade(t, role));
        }
    } else {
        addTrade(data);
    }
    return trades;
}

function getItemsFromTrade(trade) {
    const items = [];
    if (!trade) return items;
    for (const key of ['items_from_initiator', 'items_from_recipient', 'initiator_items', 'recipient_items']) {
        const arr = trade[key];
        if (!Array.isArray(arr)) continue;
        for (const it of arr) {
            const n = normalizeOfferEntry(it);
            if (n) items.push(n);
        }
    }
    if (!items.length) return extractTradeItems(trade);
    return items;
}

function parseTradesResponse(data) {
    const trades = collectTradesFromData(data);
    if (trades.length) {
        const byId = new Map(tradesListCache.map(t => [t.id, t]));
        for (const t of trades) {
            const prev = byId.get(t.id);
            if (prev && !t._viewerRole && prev._viewerRole) byId.set(t.id, { ...t, _viewerRole: prev._viewerRole });
            else byId.set(t.id, t);
        }
        tradesListCache = [...byId.values()];
    }
    const items = [];
    for (const trade of trades) items.push(...getItemsFromTrade(trade));
    if (items.length) tradeItemsCache = mergeItemCache(tradeItemsCache, items);
    return items;
}

function cardMatchesItem(card, item) {
    const imgId = getImgItemId(card);
    const hasSt = cardHasStatTrak(card);
    if (imgId != null && imgId === item.item_id && item.stattrak === hasSt) return true;
    const names = getCardSkinNames(card);
    if (names && itemMatchesNames(item, names.weapon, names.skin, hasSt)) return true;
    return false;
}

function getCurrentTrade() {
    const cards = getAllCards();
    if (tradesListCache.length && cards.length) {
        let best = null;
        let bestScore = 0;
        for (const trade of tradesListCache) {
            const items = getItemsFromTrade(trade);
            if (!items.length) continue;
            let score = 0;
            for (const card of cards) {
                if (items.some(it => cardMatchesItem(card, it))) score++;
            }
            if (score > bestScore) { bestScore = score; best = trade; }
        }
        if (best && bestScore > 0) return best;
    }
    const tradeId = getTradeIdFromUrl();
    if (tradeId != null) {
        const trade = tradesListCache.find(t => t.id == tradeId);
        if (trade) return trade;
    }
    return tradesListCache[0] || null;
}

function getTradeSideItems(trade, side) {
    if (!trade) return [];
    const init = (trade.items_from_initiator || trade.initiator_items || [])
        .map(normalizeOfferEntry).filter(Boolean);
    const recip = (trade.items_from_recipient || trade.recipient_items || [])
        .map(normalizeOfferEntry).filter(Boolean);
    const role = trade._viewerRole;
    if (role === 'initiator') return side === 'your' ? init : recip;
    if (role === 'recipient') return side === 'your' ? recip : init;
    return side === 'your' ? init : recip;
}

function getActiveTradeItems() {
    const trade = getCurrentTrade();
    if (trade) return getItemsFromTrade(trade);
    if (tradeItemsCache.length) return tradeItemsCache;
    return [];
}

function getTradeIdFromUrl() {
    const m = window.location.pathname.match(/trade-up\/(\d+)/i);
    return m ? parseInt(m[1], 10) : null;
}

function getPickerCache() {
    if (isTheirItemsTabActive()) return friendInventoryCache;
    return inventoryCache.map(normalizeInventoryEntry).filter(Boolean);
}

function getOverlayCache() {
    if (isCreateOfferModal()) {
        return inventoryCache.map(normalizeInventoryEntry).filter(Boolean);
    }
    if (isMarketplacePage()) return marketplaceCache;
    if (isTradePickerModal()) return getPickerCache();
    if (isTradeDetailView()) {
        const active = getActiveTradeItems();
        if (active.length) return active;
        return tradeItemsCache;
    }
    if (isTradePage()) return tradeItemsCache;
    return inventoryCache.map(normalizeInventoryEntry).filter(Boolean);
}

function normalizeOfferEntry(o) {
    if (!o || typeof o !== 'object') return null;
    const item = o.item || o.weapon || o.skin || o;
    const offerId = o.id ?? o.offer_id ?? o.listing_id ?? item?.offer_id;
    const itemId  = o.item_id ?? item?.item_id ?? o.skin_id ?? item?.skin_id;
    const weaponId = o.weapon_id ?? item?.weapon_id;
    const fl = o.skin_float ?? item?.skin_float
        ?? o.float ?? item?.float
        ?? o.wear ?? item?.wear;
    const seed = o.skin_seed ?? item?.skin_seed
        ?? o.seed ?? item?.seed
        ?? o.paint_seed ?? item?.paint_seed;
    if (itemId == null && fl == null && offerId == null) return null;
    return {
        offer_id:  offerId != null ? parseInt(offerId, 10) : null,
        weapon_id: weaponId != null ? parseInt(weaponId, 10) : null,
        item_id:   itemId != null ? parseInt(itemId, 10) : null,
        float:     fl != null && !Number.isNaN(parseFloat(fl)) ? parseFloat(fl) : null,
        seed:      seed != null ? parseInt(seed, 10) : null,
        stattrak:  !!(o.stat_trak ?? item?.stat_trak ?? o.stattrak ?? item?.stattrak),
        stattrak_count: o.stattrak_count ?? item?.stattrak_count ?? null,
        rarity:    o.item_rarity ?? o.rarity ?? item?.rarity,
        name:      o.item_name ?? o.name ?? item?.name,
        price:     o.price != null ? parseInt(String(o.price).replace(/[^\d]/g, ''), 10)
            : (o.coins != null ? parseInt(String(o.coins).replace(/[^\d]/g, ''), 10) : null),
    };
}

function normalizeOfferList(data) {
    if (!data) return [];
    const arr = Array.isArray(data)
        ? data
        : (data.offers || data.listings || data.items || data.results || data.data || []);
    if (!Array.isArray(arr)) return [];
    return arr.map(normalizeOfferEntry).filter(Boolean);
}

function looksLikeMarketplacePayload(data) {
    if (!data) return false;
    const raw = Array.isArray(data) ? data[0] : (data.offers?.[0] || data.items?.[0] || data.data?.[0]);
    if (raw && (raw.skin_float != null || raw.price != null)) return true;
    const items = normalizeOfferList(data);
    return items.some(i => i.float != null || i.offer_id != null);
}

function mergeMarketplaceCache(existing, incoming) {
    return mergeItemCache(existing, incoming);
}

function ingestApiPayload(url, data) {
    if (!data || typeof data !== 'object') return;
    rememberSiteUserId(url);
    cacheQuickSellFromApiData(url, data);

    if (/\/api\/user\/\d+\/inventory/i.test(url)) {
        const arr = Array.isArray(data) ? data : (data.items || data.inventory || data.data || []);
        if (Array.isArray(arr) && arr.length) {
            cacheQuickSellFromInventory(arr);
            scheduleQuickSellDomScrape();
        }
    }

    if (/\/inventory\/?(?:\?|$)/i.test(url) && !/\/inventory\/marketplace/i.test(url) && !/\/users\//i.test(url)) {
        const arr = Array.isArray(data) ? data : (data.items || data.inventory || data.data || []);
        if (Array.isArray(arr) && arr.length) {
            inventoryCache = arr.sort((a, b) => parseInt(a.rarity) - parseInt(b.rarity));
            cacheQuickSellFromInventory(inventoryCache);
            rebuildInvItemIndex();
            maybeWarnLargeInventory();
            if (overlayRunning) {
                scheduleApplyOverlays(true);
                scheduleOverlayBootstrap();
            }
            if (isBrowsePage()) scheduleBrowseInit();
            if (browseToolsActive) scheduleBrowseFilters();
        }
        return;
    }
    if (MP_API_RE.test(url) || /\/inventory\/marketplace/i.test(url) || looksLikeMarketplacePayload(data)) {
        const items = normalizeOfferList(data);
        if (items.length) {
            marketplaceCache = mergeMarketplaceCache(marketplaceCache, items);
            rebuildMpItemIndex();
            if (overlayRunning) {
                scheduleApplyOverlays(true);
                scheduleOverlayBootstrap();
            }
            if (isBrowsePage()) scheduleBrowseInit();
            if (browseToolsActive) scheduleBrowseFilters();
        }
        return;
    }
    if (/\/inventory\/cases\/?(?:\?|$)/i.test(url) && !/\/cases\/buy\//i.test(url) && !/\/inventory\/cases\/\d+/i.test(url)) {
        const arr = Array.isArray(data) ? data : (data.cases || data.data || []);
        if (Array.isArray(arr) && arr.length) {
            casesCatalogCache = arr.map(normalizeCaseEntry).filter(Boolean);
            populateCasesSelect();
            updateCasesCostSummary();
        }
        return;
    }
    if (/\/users\/@me\/?(?:\?|$)/i.test(url) && data && typeof data === 'object') {
        const coins = parseCoinVal(data.coins ?? data.coin_balance ?? data.balance);
        if (coins != null) cachedUserCoins = coins;
        updateCasesCostSummary();
        return;
    }
    if (TRADE_API_RE.test(url) || (looksLikeTradePayload(data) && !Array.isArray(data))) {
        parseTradesResponse(data);
        if ((isTradePage() || isTradeDetailView()) && overlayRunning) scheduleApplyOverlays(true);
        return;
    }
    if (/\/users\/[^/]+\/inventory/i.test(url)) {
        const arr = Array.isArray(data) ? data : (data.items || data.inventory || data.data || []);
        if (Array.isArray(arr) && arr.length) {
            friendInventoryCache = arr.map(normalizeInventoryEntry).filter(Boolean);
            rebuildFriendItemIndex();
            if (overlayRunning) {
                scheduleApplyOverlays(true);
                scheduleOverlayBootstrap();
            }
        }
    }
}

let _applyOverlayTimer = null;
let _applyingOverlays   = false;
function scheduleApplyOverlays(urgent) {
    clearTimeout(_applyOverlayTimer);
    _applyOverlayTimer = setTimeout(() => {
        if (!overlayRunning || _applyingOverlays) return;
        _applyingOverlays = true;
        try { applyOverlaysToAll({ urgent: !!urgent }); } finally { _applyingOverlays = false; }
    }, urgent ? 16 : 200);
}

function clearSkinOverlays() {
    document.querySelectorAll('.csrx-card-wrap').forEach(w => {
        if (!w.closest('#csrx-win, #csrx-overlay, #csrx-fab, #csrx-toast')) w.remove();
    });
}

const _nativeFetch = window.fetch.bind(window);
window.fetch = async function (...args) {
    const req = args[0];
    const init = args[1] || {};
    const url = typeof req === 'string' ? req : (req?.url || '');
    const method = ((typeof req === 'object' && req?.method) || init.method || 'GET').toUpperCase();
    const bodyRaw = init.body ?? (typeof req === 'object' && req?.body);
    const res = await _nativeFetch(...args);
    try {
        if (isCsrTrackedUrl(url)) {
            if (res.ok && method === 'POST') saveMarketListFromRequest(url, method, bodyRaw);
            const ct = (res.headers.get('content-type') || '').toLowerCase();
            if (ct.includes('json') || ct.includes('javascript')) {
                const data = await res.clone().json();
                ingestApiPayload(url, data);
                scheduleQuickSellDomScrape();
            }
        }
    } catch (_) {}
    return res;
};

(function hookXHR() {
    const open = XMLHttpRequest.prototype.open;
    const send = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function (method, url, ...rest) {
        this._csrxUrl = String(url || '');
        this._csrxMethod = method;
        return open.call(this, method, url, ...rest);
    };
    XMLHttpRequest.prototype.send = function (...args) {
        const bodyRaw = args[0];
        this.addEventListener('load', function () {
            try {
                if (!isCsrTrackedUrl(this._csrxUrl)) return;
                if (this.status >= 200 && this.status < 300) {
                    saveMarketListFromRequest(this._csrxUrl, this._csrxMethod, bodyRaw);
                }
                const ct = String(this.getResponseHeader('content-type') || '').toLowerCase();
                if (!ct.includes('json') && !ct.includes('javascript')) return;
                ingestApiPayload(this._csrxUrl, JSON.parse(this.responseText));
                scheduleQuickSellDomScrape();
            } catch (_) {}
        });
        return send.apply(this, args);
    };
})();

async function fetchInventory() {
    try {
        const r = await fetch('https://api.csrestored.fun/inventory/', { credentials: 'include' });
        if (!r.ok) throw r.status;
        const d = await r.json();
        const arr = Array.isArray(d) ? d : (d.items || d.inventory || d.data || []);
        inventoryCache = arr.sort((a, b) => parseInt(a.rarity) - parseInt(b.rarity));
        cacheQuickSellFromInventory(inventoryCache);
        rebuildInvItemIndex();
        maybeWarnLargeInventory();
        return inventoryCache;
    } catch(e) { return inventoryCache; }
}

async function fetchMarketplace() {
    try {
        const r = await fetch(MP_API_URL, { credentials: 'include' });
        if (!r.ok) return marketplaceCache;
        const d = await r.json();
        const items = normalizeOfferList(d);
        if (items.length) {
            marketplaceCache = items;
            rebuildMpItemIndex();
        }
    } catch (_) {}
    return marketplaceCache;
}

function findOfferSectionRoot(which) {
    const want = which === 'your' ? 'your offer' : 'their offer';
    for (const el of document.querySelectorAll('p, span, div, h3, h4')) {
        const t = (el.textContent || '').trim().toLowerCase().replace(/:$/, '');
        if (t !== want) continue;
        let node = el.parentElement;
        for (let i = 0; i < 10 && node; i++) {
            if (node.querySelector('[class*="aspect-square"] img')) return node;
            node = node.parentElement;
        }
    }
    return null;
}

function getOfferSectionCards(which) {
    const root = findOfferSectionRoot(which);
    if (!root) return [];
    const skip = '#csrx-win, #csrx-overlay, #csrx-fab, #csrx-toast';
    let cards = [...root.querySelectorAll('[class*="aspect-square"]')]
        .filter(c => !c.closest(skip) && c.querySelector('img'));
    if (!cards.length) {
        cards = [...root.querySelectorAll('[class*="aspect-square"], [class*="rounded-2xl"], [class*="rounded-xl"]')]
            .filter(c => !c.closest(skip) && c.querySelector('img') && c.offsetWidth >= 60);
    }
    return cards.filter(c => !cards.some(o => o !== c && o.contains(c)));
}

function applyTradeDetailOverlays() {
    clearSkinOverlays();
    stopOverlayLazyScroll();
    const yourCards  = getOfferSectionCards('your');
    const theirCards = getOfferSectionCards('their');
    const inv        = inventoryCache.map(normalizeInventoryEntry).filter(Boolean);
    const trade      = getCurrentTrade();
    const yourItems  = trade ? getTradeSideItems(trade, 'your') : [];
    const theirItems = trade ? getTradeSideItems(trade, 'their') : [];
    const yourSet    = new Set(yourCards);

    const applyYourBatch = (list, used) => {
        for (const card of list) {
            let item = matchOverlayItem(card, inv, used);
            if (!item && yourItems.length) item = matchOverlayItem(card, yourItems, used);
            if (!item && tradeItemsCache.length) item = matchOverlayItem(card, tradeItemsCache, used);
            if (item) injectCardOverlay(card, item);
        }
    };

    const applyTheirBatch = (list, used) => {
        for (const card of list) {
            let item = theirItems.length ? matchOverlayItem(card, theirItems, used) : null;
            if (!item && tradeItemsCache.length) item = matchOverlayItem(card, tradeItemsCache, used);
            if (item) injectCardOverlay(card, item);
        }
    };

    const applyBatch = (batch) => {
        const usedYour = new Set();
        const usedTheir = new Set();
        applyYourBatch(batch.filter((c) => yourSet.has(c)), usedYour);
        applyTheirBatch(batch.filter((c) => !yourSet.has(c)), usedTheir);
    };

    const allCards = [...yourCards, ...theirCards];
    if (!allCards.length) {
        applyTradeOverlays();
        return;
    }

    if (shouldUseIncrementalOverlays(allCards.length)) {
        runIncrementalOverlayPass(allCards, applyBatch);
    } else if (shouldUseLazyOverlays(allCards.length)) {
        runLazyOverlayPass(allCards, applyBatch);
    } else {
        const usedYour = new Set();
        const usedTheir = new Set();
        applyYourBatch(yourCards, usedYour);
        applyTheirBatch(theirCards, usedTheir);
    }
}

function getOfferIdFromCard(cardEl) {
    const nodes = [cardEl, cardEl.closest('a'), cardEl.parentElement, ...cardEl.querySelectorAll('a')];
    for (const el of nodes) {
        if (!el) continue;
        const href = el.href || el.getAttribute?.('href') || '';
        const m = href.match(/\/offer\/(\d+)/i);
        if (m) return parseInt(m[1], 10);
    }
    return null;
}

function getCardWear(cardEl) {
    const WEARS = ['FN', 'MW', 'FT', 'WW', 'BS'];
    for (const el of cardEl.querySelectorAll('p, span, div')) {
        const t = el.textContent?.trim();
        if (WEARS.includes(t)) return t;
    }
    return null;
}

function getCardSeedHint(cardEl) {
    for (const el of cardEl.querySelectorAll('p, span, div')) {
        const t = el.textContent?.trim();
        if (/^\d{1,4}$/.test(t)) {
            const n = parseInt(t, 10);
            if (n >= 0 && n <= 1000) return n;
        }
    }
    return null;
}

function cardHasStatTrak(cardEl) {
    for (const el of cardEl.querySelectorAll('p, span, div')) {
        const t = (el.textContent?.trim() || '').toLowerCase();
        if (t.startsWith('stattrak') || t.startsWith('stt') || t.includes('st™') || t.startsWith('st ')) return true;
    }
    return false;
}

function getStatTrakCount(cardEl) {
    for (const el of cardEl.querySelectorAll('p, span, div')) {
        const t = el.textContent?.trim() || '';
        const m = t.match(/(?:STT|ST™|StatTrak™?)\s*(\d+)/i);
        if (m) return parseInt(m[1], 10);
    }
    return null;
}

function getCardSkinNames(cardEl) {
    const lines = [...cardEl.querySelectorAll('p')]
        .map(p => p.textContent?.trim())
        .filter(t => t
            && !['FN', 'MW', 'FT', 'WW', 'BS'].includes(t)
            && !/^(STT|ST™|StatTrak)/i.test(t)
            && !/^[\d,]+$/.test(t)
            && !/^\d+\.\d+$/.test(t)
            && !/^#\d+$/.test(t)
            && !/^\d+$/.test(t));
    const full = lines.find(t => t.includes(' | '));
    if (full) {
        const [weapon, skin] = full.split(' | ').map(s => s.trim());
        return { weapon, skin };
    }
    if (lines.length >= 2) {
        return { weapon: lines[lines.length - 2], skin: lines[lines.length - 1] };
    }
    if (lines.length === 1) return { weapon: lines[0], skin: '' };
    return null;
}

function itemMatchesNames(item, weapon, skin, hasSt) {
    if (!item.name) return false;
    if (item.stattrak !== hasSt) return false;
    const parts = item.name.toLowerCase().split(' | ');
    if (parts.length < 2) return false;
    const wLow = weapon.toLowerCase();
    const sLow = skin.toLowerCase();
    const wOk = parts[0].includes(wLow) || wLow.includes(parts[0]);
    const sOk = parts[1].includes(sLow) || sLow.includes(parts[1]);
    return wOk && sOk;
}

function itemCacheKey(item) {
    return 'w' + (item.weapon_id ?? `${item.item_id}-${item.float}-${item.seed}`);
}

function weaponIdFromCsrxKey(key) {
    if (!key || key[0] !== 'w') return null;
    const rest = key.slice(1);
    if (!/^\d+$/.test(rest)) return null;
    const wid = parseInt(rest, 10);
    return Number.isFinite(wid) && wid > 0 ? wid : null;
}

function parseOverlaySig(cardEl) {
    const sig = cardEl.querySelector('.csrx-card-wrap')?.dataset?.csrxSig;
    if (!sig) return { float: null, seed: null };
    const [fs, ss] = sig.split('|');
    const f = fs ? parseFloat(fs) : NaN;
    const s = ss ? parseInt(ss, 10) : NaN;
    return {
        float: Number.isFinite(f) ? f : null,
        seed: Number.isFinite(s) ? s : null,
    };
}

function usedKeysFromWeaponIds(usedWeaponIds) {
    const used = new Set();
    for (const wid of usedWeaponIds) {
        if (wid != null) used.add('w' + wid);
    }
    return used;
}

function matchItemByName(cardEl, cache, used) {
    const names = getCardSkinNames(cardEl);
    if (!names) return null;
    const hasSt = cardHasStatTrak(cardEl);
    const cands = cache.filter(i => {
        if (used.has(itemCacheKey(i))) return false;
        return itemMatchesNames(i, names.weapon, names.skin, hasSt);
    });
    if (cands.length >= 1) {
        const item = cands[0];
        used.add(itemCacheKey(item));
        return item;
    }
    return null;
}

function findCardForTradeItem(item, cards, usedCards) {
    for (const card of cards) {
        if (usedCards.has(card) || card.querySelector('.csrx-card-wrap')) continue;
        if (cardMatchesItem(card, item)) {
            usedCards.add(card);
            return card;
        }
    }
    return null;
}

function applyTradeOverlays() {
    const cache = getOverlayCache();
    if (!cache.length) return;
    const cards = getAllCards();
    if (!cards.length) return;
    const stamp = (batch) => applyOverlaysToCardList(batch, cache);
    if (shouldUseIncrementalOverlays(cards.length)) {
        runIncrementalOverlayPass(cards, stamp);
    } else if (shouldUseLazyOverlays(cards.length)) {
        runLazyOverlayPass(cards, stamp);
    } else {
        applyOverlaysToCardList(cards, cache);
    }
}

function matchOverlayItem(cardEl, cache, used) {
    if (!cache.length) return null;

    const offerId = getOfferIdFromCard(cardEl);
    if (offerId != null) {
        const byOffer = isMarketplacePage()
            ? mpIndexByOfferId.get(offerId)
            : cache.find(i => i.offer_id === offerId);
        if (byOffer && !used.has('o' + offerId)) {
            used.add('o' + offerId);
            return byOffer;
        }
    }

    const imgId = getImgItemId(cardEl);
    const wear  = getCardWear(cardEl);
    const hasSt = cardHasStatTrak(cardEl);
    const trustSiteWear = !isTradeDetailView();

    if (imgId != null) {
        const seedHint = isMarketplacePage() ? getCardSeedHint(cardEl) : null;
        const stCount  = isTradeDetailView() ? getStatTrakCount(cardEl) : null;
        let cands = candidatesForImgId(imgId).filter(i =>
            !used.has(itemCacheKey(i)) &&
            (i.stattrak === hasSt || i.stattrak == null) &&
            (!trustSiteWear || !wear || getCondition(i.float) === wear)
        );
        if (stCount != null && cands.length > 1) {
            const bySt = cands.filter(i => i.stattrak_count === stCount);
            if (bySt.length) cands = bySt;
        }
        if (seedHint != null && cands.length > 1) {
            const bySeed = cands.filter(i => i.seed === seedHint);
            if (bySeed.length) cands = bySeed;
        }
        if (!cands.length && trustSiteWear && wear && isInventoryPage()) {
            cands = candidatesForImgId(imgId).filter(i =>
                !used.has(itemCacheKey(i)) &&
                (i.stattrak === hasSt || i.stattrak == null)
            );
        }
        if (cands.length >= 1) {
            const item = cands[0];
            used.add(itemCacheKey(item));
            return item;
        }
        if (isTradePickerModal() && isTheirItemsTabActive() && cands.length === 0 && imgId != null) {
            return null;
        }
    }

    if (!isMarketplacePage()) {
        const byName = matchItemByName(cardEl, cache, used);
        if (byName) return byName;
    }

    if (!isMarketplacePage() && !isTradeDetailView() && _currentOverlayCards) {
        const idx = _currentOverlayCards.indexOf(cardEl);
        if (idx >= 0 && idx < cache.length && cache[idx].item_id === imgId) {
            const item = cache[idx];
            const key = itemCacheKey(item);
            if (!used.has(key)) { used.add(key); return item; }
        }
    }

    return null;
}

function getImgItemId(cardEl) {
    for (const img of cardEl.querySelectorAll('img')) {
        for (const attr of ['src', 'srcset', 'data-src']) {
            const raw = img.getAttribute(attr) || '';
            let dec = decodeURIComponent(raw);
            let m = dec.match(/\/skins\/(\d+)\.png/i);
            if (m) return parseInt(m[1], 10);
            m = dec.match(/skins%2F(\d+)\.png/i);
            if (m) return parseInt(m[1], 10);
        }
    }
    return null;
}

/** Card element inside a trade grid cell (may differ from the cell wrapper). */
function getTradePickerCardEl(slot) {
    if (!slot) return slot;
    if (String(slot.className || '').includes('aspect-square')) return slot;
    return slot.querySelector('[class*="aspect-square"][class*="rounded"]')
        || slot.querySelector('[class*="aspect-square"]')
        || slot;
}

function isTradeGridChild(el) {
    if (!el || el.nodeType !== 1) return false;
    if (el.id === 'csrx-browse') return false;
    const cls = String(el.className || '');
    if (cls.includes('aspect-square')) return true;
    if (el.querySelector('[class*="aspect-square"]')) return true;
    if (el.querySelector('img')) return true;
    return false;
}

function findTradePickerGridContainer() {
    const root = findTradePickerModalRoot();
    if (!root) return null;
    let best = null;
    let bestScore = 0;
    for (const el of root.querySelectorAll('div')) {
        if (el.closest('#csrx-browse')) continue;
        const kids = [...el.children].filter(isTradeGridChild);
        if (kids.length < 4) continue;
        const st = getComputedStyle(el);
        let score = kids.length * 100;
        if (st.display.includes('grid')) score += 500;
        else if (st.display === 'flex') score += 200;
        if (score > bestScore) {
            bestScore = score;
            best = el;
        }
    }
    return best;
}

/** Empty grid slots in Send Trade Offer (no skin loaded yet). */
function isEmptyPickerSlot(slot) {
    if (!isTradePickerModal()) return false;
    const card = getTradePickerCardEl(slot);
    const t = (card.textContent || '').replace(/\s+/g, ' ').trim();
    if (!t || t.length < 3) return true;
    if (card.querySelector('.csrx-card-wrap')) return false;
    if (t.includes('|')) return false;
    if (getCardWear(card)) return false;
    if (/★/.test(t) && t.length > 5) return false;
    if (/stattrak/i.test(t) && t.length > 8) return false;
    const img = card.querySelector('img');
    if (img) {
        const r = img.getBoundingClientRect();
        if (r.width > 16 && r.height > 16 && t.length > 6) return false;
    }
    if (getImgItemId(card) != null && t.length > 12) return false;
    return t.length < 10;
}

function getTradePickerSlots() {
    const grid = findTradePickerGridContainer();
    if (grid) {
        return [...grid.children].filter(ch =>
            ch.nodeType === 1 && ch.id !== 'csrx-browse' && !ch.closest('#csrx-browse')
        );
    }
    const root = findTradePickerModalRoot();
    if (!root) return [];
    const skip = '#csrx-browse, #csrx-win, #csrx-overlay, #csrx-fab, #csrx-toast';
    const nodes = [...root.querySelectorAll('[class*="aspect-square"]')]
        .filter(el => !el.closest(skip));
    return nodes.filter(el => !nodes.some(other => other !== el && other.contains(el)));
}

function resetTradePickerBrowseClasses() {
    const root = findTradePickerModalRoot();
    if (!root) return;
    for (const slot of getTradePickerSlots()) {
        slot.classList.remove('csrx-browse-hidden', 'csrx-browse-slot-hidden');
        slot.querySelectorAll('.csrx-browse-hidden, .csrx-browse-slot-hidden').forEach(el => {
            el.classList.remove('csrx-browse-hidden', 'csrx-browse-slot-hidden');
        });
    }
    root.querySelectorAll('.csrx-browse-hidden, .csrx-browse-slot-hidden').forEach(el => {
        if (el.closest('#csrx-browse, #csrx-win, #csrx-overlay')) return;
        el.classList.remove('csrx-browse-hidden', 'csrx-browse-slot-hidden');
    });
}

function applyTradePickerBrowseFilters(f) {
    resetTradePickerBrowseClasses();
    const slots = getTradePickerSlots();
    const realSlots = slots.filter(s => !isEmptyPickerSlot(s));
    const cardEls = realSlots.map(getTradePickerCardEl);
    const cache = getBrowseCache();
    const itemMap = buildCardItemMap(cardEls, cache);

    let visible = 0;
    for (const slot of slots) {
        if (isEmptyPickerSlot(slot)) {
            slot.classList.add('csrx-browse-slot-hidden');
            continue;
        }
        const card = getTradePickerCardEl(slot);
        const pass = cardPassesBrowseFilters(card, itemMap.get(card), f);
        if (!pass) slot.classList.add('csrx-browse-hidden');
        else visible++;
    }
    return { visible, total: realSlots.length };
}

function hideTradePickerEmptySlots() {
    if (!isTradePickerModal()) return;
    for (const el of getTradePickerSlots()) {
        if (isEmptyPickerSlot(el)) el.classList.add('csrx-browse-slot-hidden');
    }
}

function getAllCards() {
    const skip = '#csrx-win, #csrx-overlay, #csrx-fab, #csrx-toast';
    let cards = [...document.querySelectorAll('[class*="aspect-square"][class*="rounded-2xl"]')]
        .filter(c => !c.closest(skip) && c.querySelector('img'));
    if (!cards.length) {
        cards = [...document.querySelectorAll('[class*="aspect-square"][class*="rounded-xl"]')]
            .filter(c => !c.closest(skip) && c.querySelector('img'));
    }
    if (cards.length) {
        cards = cards.filter(c => !cards.some(other => other !== c && other.contains(c)));
        if (isItemPickerModal()) {
            const root = getItemPickerModalRoot();
            if (root) cards = cards.filter(c => root.contains(c));
            else cards = [];
            if (isTradePickerModal()) {
                cards = cards.filter(c => !isPickerSkeletonCard(c));
            }
        }
        return cards;
    }
    const selectors = [
        '[class*="aspect-square"][class*="rounded-2xl"][class*="flex-col"]',
        'a[href*="/offer/"] [class*="rounded-2xl"][class*="flex-col"]',
        'a[href*="/offer/"]',
        '[class*="rounded-2xl"][class*="flex-col"][class*="cursor"]',
    ];
    for (const sel of selectors) {
        const found = [...document.querySelectorAll(sel)];
        if (!found.length) continue;
        if (sel === 'a[href*="/offer/"]') {
            return found.map(a =>
                a.querySelector('[class*="rounded-2xl"][class*="flex-col"]')
                || a.querySelector('[class*="rounded-2xl"]')
                || a
            );
        }
        return found;
    }
    return [];
}

function overlaySignature(item) {
    if (!item) return '';
    const f = item.float != null ? item.float.toFixed(4) : '';
    const s = item.seed != null ? String(item.seed) : '';
    return `${f}|${s}`;
}

function injectCardOverlay(cardEl, item) {
    if (!item) return;
    const wantOverlay = csrIsFeatureEnabled('floatOverlays');
    const wantLock = csrIsFeatureEnabled('skinLock') && isInventoryPage() && item.weapon_id != null;
    if (!wantOverlay && !wantLock) return;

    const existing = cardEl.querySelector('.csrx-card-wrap');
    const lockSig = wantLock
        ? String(item.weapon_id) + (csrIsWeaponLocked(item.weapon_id) ? 'L' : 'U')
        : '';
    const sig = wantOverlay ? overlaySignature(item) : '';
    if (existing?.dataset.csrxSig === sig && existing?.dataset.csrxLock === lockSig) {
        return;
    }

    existing?.remove();

    const pos = getComputedStyle(cardEl).position;
    if (pos === 'static') cardEl.style.position = 'relative';

    const f   = item.float;
    const col = wearColor(f);
    const wrap = document.createElement('div');
    wrap.className = 'csrx-card-wrap' + (isMarketplacePage() ? ' csrx-mp-pos' : '');
    wrap.dataset.csrxSig = sig;
    wrap.dataset.csrxKey = itemCacheKey(item);
    wrap.dataset.csrxLock = lockSig;

    cardEl.querySelector('.csrx-lock-btn')?.remove();
    if (wantLock) {
        const locked = csrIsWeaponLocked(item.weapon_id);
        cardEl.classList.toggle('csrx-locked-card', locked);
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'csrx-lock-btn' + (locked ? ' csrx-locked' : '');
        btn.title = locked
            ? csrT('lock.unlock')
            : csrT('lock.lock');
        btn.innerHTML = locked
            ? '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>'
            : '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 019.9-1"/></svg>';
        btn.addEventListener('click', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            await csrToggleWeaponLock(item.weapon_id);
            injectCardOverlay(cardEl, item);
            scheduleLockSidebarClip();
        });
        cardEl.appendChild(btn);
    } else {
        cardEl.classList.remove('csrx-locked-card');
    }

    if (wantOverlay && f != null) {
        const pill = document.createElement('div');
        pill.className = 'csrx-float-badge';
        pill.style.color = col;
        pill.style.borderColor = col + '20';

        const dot = document.createElement('span');
        dot.className = 'csrx-float-dot';
        dot.style.background = col;
        pill.appendChild(dot);

        const txt = document.createElement('span');
        txt.textContent = `${getCondition(f)} · ${f.toFixed(4)}`;
        pill.appendChild(txt);
        wrap.appendChild(pill);
    }

    if (wantOverlay && item.seed != null) {
        const seed = document.createElement('div');
        seed.className = 'csrx-seed-badge';
        seed.textContent = `#${item.seed}`;
        wrap.appendChild(seed);
    }

    cardEl.appendChild(wrap);
}

/* ── Browse: search & filters (inventory + marketplace) ── */

let browseToolsActive = false;
let browseDebounce    = null;
let browseInitTimer   = null;

function isBrowsePage() {
    if (isInventoryPage() || isMarketplacePage()) {
        return csrIsFeatureEnabled('browseFilters');
    }
    if (isTradePickerModal()) return csrIsFeatureEnabled('tradeSearch');
    if (isCreateOfferModal()) return csrIsFeatureEnabled('browseFilters');
    return false;
}

/** Browse bar stays in the DOM flow — no margin/width shifts when the site sidebar expands. */
function resetBrowseBarStaticStyles(bar) {
    if (!bar) return;
    bar.style.marginLeft = '';
    bar.style.width = '';
    bar.style.maxWidth = '';
    bar.style.visibility = '';
    bar.style.pointerEvents = '';
}

function isWeaponDetailsOpen() {
    for (const el of document.querySelectorAll('h1, h2, h3, h4, p, span')) {
        if ((el.textContent || '').trim() !== 'Weapon Details') continue;
        let node = el;
        for (let i = 0; i < 16 && node; i++) {
            const st = getComputedStyle(node);
            if (st.position === 'fixed' || node.getAttribute('role') === 'dialog') return true;
            const z = parseInt(st.zIndex, 10);
            if (!Number.isNaN(z) && z >= 30) return true;
            node = node.parentElement;
        }
    }
    return false;
}

function updateBrowseBarLayout() {
    const bar = document.getElementById('csrx-browse');
    if (!bar) return;
    const tradeModal = isTradePickerModal();
    const createOffer = isCreateOfferModal();
    bar.classList.toggle('csrx-browse-trade', tradeModal);
    bar.classList.toggle('csrx-browse-create-offer', createOffer);
    bar.classList.toggle('csrx-browse-under-modal', !tradeModal && !createOffer && isWeaponDetailsOpen());
    if (tradeModal || createOffer) {
        resetBrowseBarStaticStyles(bar);
        if (tradeModal) repositionTradeBrowseBar();
    } else {
        resetBrowseBarStaticStyles(bar);
    }
}

function findTradePickerItemsLabel() {
    if (!isTradePickerModal()) return null;
    const pattern = isTheirItemsTabActive()
        ? /^select their items$/i
        : /^select your items$/i;
    const root = findTradePickerModalRoot();
    const nodes = root
        ? [...root.querySelectorAll('p, span, label, h4, h3')]
        : [...document.querySelectorAll('p, span, label, h4, h3')];
    for (const el of nodes) {
        const t = (el.textContent || '').trim();
        if (!pattern.test(t) || t.length > 48) continue;
        return el;
    }
    return null;
}

function findTradePickerBrowseMount() {
    const root = findTradePickerModalRoot();
    if (!root) return null;
    const label = findTradePickerItemsLabel();
    if (!label || !root.contains(label)) return null;

    const wrap = (label.closest('div') && root.contains(label.closest('div')))
        ? label.closest('div')
        : label;
    return { mode: 'after', el: wrap };
}

function resetBrowseFilterClasses() {
    document.querySelectorAll('.csrx-browse-hidden, .csrx-browse-slot-hidden').forEach(el => {
        el.classList.remove('csrx-browse-hidden', 'csrx-browse-slot-hidden');
    });
}

function resetPickerBrowseSideEffects() {
    const skip = '#csrx-win, #csrx-overlay, #csrx-fab, #csrx-toast';
    const cards = [...document.querySelectorAll('[class*="aspect-square"][class*="rounded-2xl"]')]
        .filter(c => !c.closest(skip) && c.querySelector('img'))
        .filter(c => !getItemPickerModalRoot()?.contains(c));
    resetBrowseFilterClasses();
    cards.forEach(c => delete c.dataset.csrxOrder);
    if (!cards.length) return;
    const grid = getCardGridParent(cards);
    if (grid) restoreCardOrder(cards, grid);
}

function cleanupOrphanTradeBrowse() {
    const bar = document.getElementById('csrx-browse');
    if (!bar?.classList.contains('csrx-browse-trade')
        && !bar?.classList.contains('csrx-browse-create-offer')) return;
    const root = getItemPickerModalRoot();
    if (!isItemPickerModal() || !root || !root.contains(bar)) {
        bar.remove();
        browseToolsActive = false;
    }
}

function isBarVisible(el) {
    if (!el?.isConnected) return false;
    const st = getComputedStyle(el);
    if (st.display === 'none' || st.visibility === 'hidden') return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
}

function isTradeBrowseBarMisplaced() {
    const bar = document.getElementById('csrx-browse');
    if (!bar) return false;
    if (!isBarVisible(bar)) return true;
    const mount = findTradePickerBrowseMount();
    if (!mount?.el) return false;
    if (mount.mode === 'before') return mount.el.previousElementSibling !== bar;
    return mount.el.nextElementSibling !== bar;
}

function repositionTradeBrowseBar() {
    if (!isTradePickerModal()) return;
    cleanupOrphanTradeBrowse();
    const bar = document.getElementById('csrx-browse');
    if (!bar) return;
    const root = findTradePickerModalRoot();
    const mount = findTradePickerBrowseMount();
    if (!root || !mount?.el || !root.contains(mount.el)) return;
    if (mount.mode === 'before') {
        if (mount.el.previousElementSibling !== bar) {
            mount.el.insertAdjacentElement('beforebegin', bar);
        }
    } else if (mount.el.nextElementSibling !== bar) {
        mount.el.insertAdjacentElement('afterend', bar);
    }
}

function findCreateOfferBrowseMount() {
    const root = findCreateOfferModalRoot();
    if (!root) return null;
    for (const el of root.querySelectorAll('h1, h2, h3, h4')) {
        if (!/^create offer$/i.test((el.textContent || '').trim())) continue;
        const row = el.closest('div');
        if (row && root.contains(row)) return { mode: 'after', el: row };
    }
    const cards = getAllCards();
    if (!cards.length) return null;
    const grid = getCardGridParent(cards);
    if (!grid || !root.contains(grid)) return null;
    return { mode: 'before', el: grid };
}

function findModalPickerBrowseMount() {
    if (isTradePickerModal()) return findTradePickerBrowseMount();
    if (isCreateOfferModal()) return findCreateOfferBrowseMount();
    const cards = getAllCards();
    if (!cards.length) return null;
    const grid = getCardGridParent(cards);
    if (!grid) return null;
    return { mode: 'before', el: grid };
}

function isSubNavTab(el) {
    const row = el.closest('div, nav, section') || el.parentElement;
    if (!row) return false;
    const t = (row.textContent || '').toLowerCase();
    return t.includes('cases') && t.includes('quests') && t.includes('trades');
}

function findBrowseHeading() {
    const label = isMarketplacePage() ? 'marketplace' : 'inventory';
    const skip = '#csrx-browse,#csrx-win,#csrx-fab,#csrx-overlay,#csrx-toast';
    const candidates = [];
    for (const el of document.querySelectorAll('h1, h2, h3, p, span, div')) {
        if (el.closest(skip)) continue;
        if (isSubNavTab(el)) continue;
        const t = (el.textContent || '').trim().toLowerCase();
        if (t !== label) continue;
        if (t.length > 24) continue;
        candidates.push(el);
    }
    candidates.sort((a, b) => {
        const aTab = isSubNavTab(a) ? 1 : 0;
        const bTab = isSubNavTab(b) ? 1 : 0;
        if (aTab !== bTab) return aTab - bTab;
        return a.textContent.length - b.textContent.length;
    });
    return candidates[0] || null;
}

function isInLeftNav(el) {
    if (!el) return false;
    let node = el;
    for (let i = 0; i < 8 && node; i++) {
        const w = node.offsetWidth;
        const cards = node.querySelectorAll('[class*="aspect-square"] img').length;
        const text = (node.textContent || '').toLowerCase();
        if (w > 0 && w < 300 && cards < 2 && text.includes('matchmaking') && text.includes('leaderboard')) {
            return true;
        }
        node = node.parentElement;
    }
    return false;
}

function findMainItemGrid() {
    const cards = getAllCards();
    if (!cards.length) return null;
    return getCardGridParent(cards);
}

function isCreateOfferBrowseBarMisplaced() {
    const bar = document.getElementById('csrx-browse');
    if (!bar) return false;
    if (!isBarVisible(bar)) return true;
    const root = findCreateOfferModalRoot();
    if (!root || !root.contains(bar)) return true;
    const mount = findCreateOfferBrowseMount();
    if (!mount?.el) return false;
    if (mount.mode === 'before') return mount.el.previousElementSibling !== bar;
    return mount.el.nextElementSibling !== bar;
}

function isBrowseBarMisplaced() {
    const bar = document.getElementById('csrx-browse');
    if (!bar) return false;
    if (isTradePickerModal()) return isTradeBrowseBarMisplaced();
    if (isCreateOfferModal()) return isCreateOfferBrowseBarMisplaced();
    if (isInLeftNav(bar)) return true;
    const grid = findMainItemGrid();
    if (!grid) return false;
    if (bar.nextElementSibling === grid) return false;
    if (grid.previousElementSibling === bar) return false;
    let sib = bar.nextElementSibling;
    while (sib && sib !== grid) {
        if (sib.querySelector?.('[class*="aspect-square"] img')) return true;
        sib = sib.nextElementSibling;
    }
    return grid.compareDocumentPosition(bar) !== Node.DOCUMENT_POSITION_PRECEDING;
}

function findBrowseMountPoint() {
    if (isItemPickerModal()) return findModalPickerBrowseMount();

    const grid = findMainItemGrid();
    if (grid) return { mode: 'before', el: grid };

    const h = findBrowseHeading();
    if (h && !isInLeftNav(h)) {
        let node = h;
        for (let i = 0; i < 10 && node; i++) {
            const next = node.nextElementSibling;
            if (next?.querySelector('[class*="aspect-square"] img')) {
                return { mode: 'after', el: node };
            }
            node = node.parentElement;
        }
        const row = h.parentElement;
        if (row && !isInLeftNav(row)) return { mode: 'after', el: row };
    }
    return null;
}

let _browseInitAttempts = 0;
function scheduleBrowseInit() {
    clearTimeout(browseInitTimer);
    browseInitTimer = setTimeout(() => {
        if (!isBrowsePage()) {
            _browseInitAttempts = 0;
            return;
        }
        if (!document.getElementById('csrx-browse') || isBrowseBarMisplaced()) {
            const before = document.getElementById('csrx-browse');
            initBrowseTools();
            const maxAttempts = isItemPickerModal() ? 25 : 12;
            if ((!before && !document.getElementById('csrx-browse')) && _browseInitAttempts < maxAttempts) {
                _browseInitAttempts++;
                scheduleBrowseInit();
                return;
            }
        }
        _browseInitAttempts = 0;
        updateBrowseBarLayout();
        if (isTradePickerModal()) repositionTradeBrowseBar();
    }, _browseInitAttempts ? 400 : 0);
}

let _browseLayoutTimer = null;
function scheduleBrowseLayoutUpdate() {
    clearTimeout(_browseLayoutTimer);
    _browseLayoutTimer = setTimeout(updateBrowseBarLayout, 80);
}

function getCardSearchText(card, item) {
    const parts = [];
    const names = getCardSkinNames(card);
    if (names?.weapon) parts.push(names.weapon);
    if (names?.skin) parts.push(names.skin);
    if (item?.name) {
        parts.push(item.name);
        const split = item.name.split(' | ');
        if (split.length >= 2) parts.push(split[0].trim(), split[1].trim());
        else parts.push(item.name.replace(/\s*\|\s*/g, ' '));
    }
    if (!parts.length) {
        parts.push((card.textContent || '').replace(/\s+/g, ' ').slice(0, 200));
    }
    return parts.join(' ').toLowerCase();
}

function getCardFloat(card, item) {
    if (item?.float != null && !Number.isNaN(item.float)) return item.float;
    for (const el of card.querySelectorAll('p, span, div')) {
        const t = el.textContent?.trim() || '';
        const m = t.match(/(?:FN|MW|FT|WW|BS)\s*[-·•]\s*(\d+\.\d+)/i);
        if (m) return parseFloat(m[1]);
    }
    return null;
}

function getCardPrice(card, item) {
    return item?.price ?? getCardPriceFromDom(card) ?? 0;
}

function sortVisibleBrowseItems(visible, f, mp) {
    if (visible.length < 2) return false;

    const priceMul = f.priceSort === 'asc' ? 1 : f.priceSort === 'desc' ? -1 : 0;
    const floatMul = f.floatSort === 'asc' ? 1 : f.floatSort === 'desc' ? -1 : 0;
    if (!priceMul && !floatMul) return false;

    visible.sort((a, b) => {
        if (mp && priceMul) {
            const pa = getCardPrice(a.card, a.item);
            const pb = getCardPrice(b.card, b.item);
            if (pa !== pb) return priceMul * (pa - pb);
        }
        if (floatMul) {
            const fa = getCardFloat(a.card, a.item);
            const fb = getCardFloat(b.card, b.item);
            const na = fa ?? (floatMul > 0 ? Infinity : -Infinity);
            const nb = fb ?? (floatMul > 0 ? Infinity : -Infinity);
            if (na !== nb) return floatMul * (na - nb);
        }
        if (!mp && priceMul) {
            const pa = getCardPrice(a.card, a.item);
            const pb = getCardPrice(b.card, b.item);
            if (pa !== pb) return priceMul * (pa - pb);
        }
        return (parseInt(a.card.dataset.csrxOrder, 10) || 0)
            - (parseInt(b.card.dataset.csrxOrder, 10) || 0);
    });
    return true;
}

function getCardPriceFromDom(cardEl) {
    for (const el of cardEl.querySelectorAll('p, span, div')) {
        const t = (el.textContent || '').trim();
        if (!/^[\d,]+$/.test(t)) continue;
        const n = parseInt(t.replace(/,/g, ''), 10);
        if (n >= 100) return n;
    }
    return null;
}

function getBrowseCache() {
    if (isCreateOfferModal()) {
        return inventoryCache.map(normalizeInventoryEntry).filter(Boolean);
    }
    if (isMarketplacePage()) return marketplaceCache;
    return inventoryCache.map(normalizeInventoryEntry).filter(Boolean);
}

function buildCardItemMap(cards, cache) {
    const used = new Set();
    const map = new Map();
    for (const card of cards) {
        let item = matchOverlayItem(card, cache, used);
        if (!item) item = matchItemByName(card, cache, used);
        map.set(card, item);
    }
    return map;
}

function getPickerGridContainer(cards) {
    const modalRoot = getItemPickerModalRoot();
    const minCount = Math.max(3, Math.floor(cards.length * 0.4));
    const candidates = new Set();
    for (const c of cards) {
        let p = c.parentElement;
        for (let i = 0; i < 10 && p; i++) {
            if (modalRoot && !modalRoot.contains(p)) break;
            candidates.add(p);
            p = p.parentElement;
        }
    }
    let best = null;
    let bestScore = -1;
    for (const p of candidates) {
        let contained = 0;
        let direct = 0;
        for (const c of cards) {
            if (!p.contains(c)) continue;
            contained++;
            if (c.parentElement === p || c.parentElement?.parentElement === p) direct++;
        }
        if (contained < minCount) continue;
        const st = getComputedStyle(p);
        const isGrid = st.display === 'grid' || st.display === 'inline-grid'
            || (st.gridTemplateColumns && st.gridTemplateColumns !== 'none');
        const score = direct * 20 + contained + (isGrid ? 500 : 0);
        if (score > bestScore) {
            bestScore = score;
            best = p;
        }
    }
    return best || cards[0].parentElement;
}

function getCardGridParent(cards) {
    if (!cards.length) return null;
    if (isItemPickerModal()) return getPickerGridContainer(cards);
    let parent = cards[0].parentElement;
    for (let i = 0; i < 4 && parent; i++) {
        const childCards = [...parent.children].filter(ch =>
            cards.some(c => c === ch || ch.contains(c))
        );
        if (childCards.length >= Math.min(3, cards.length)) return parent;
        parent = parent.parentElement;
    }
    return cards[0].parentElement;
}

function ensureCardOrder(cards) {
    cards.forEach((c, i) => {
        if (c.dataset.csrxOrder == null) c.dataset.csrxOrder = String(i);
    });
}

function restoreCardOrder(cards, grid) {
    if (!grid) return;
    ensureCardOrder(cards);
    [...cards].sort((a, b) =>
        (parseInt(a.dataset.csrxOrder, 10) || 0) - (parseInt(b.dataset.csrxOrder, 10) || 0)
    ).forEach(c => grid.appendChild(c));
}

function readBrowseFilters() {
    const bar = document.getElementById('csrx-browse');
    if (!bar) return null;
    return {
        q: (bar.querySelector('#csrx-browse-search')?.value || '').trim().toLowerCase(),
        rarity: bar.querySelector('#csrx-browse-rarity')?.value || '',
        wear: bar.querySelector('#csrx-browse-wear')?.value || '',
        floatSort: bar.querySelector('#csrx-browse-float')?.value || '',
        priceSort: bar.querySelector('#csrx-browse-price')?.value || '',
    };
}

function cardPassesBrowseFilters(card, item, f) {
    if (f.q) {
        const hay = getCardSearchText(card, item);
        const terms = f.q.split(/\s+/).filter(Boolean);
        if (!terms.every(t => hay.includes(t))) return false;
    }

    if (f.rarity !== '') {
        if (!item) return false;
        if (String(parseInt(item.rarity, 10)) !== f.rarity) return false;
    }

    const wear = f.wear;
    if (wear) {
        const cardWear = item?.float != null ? getCondition(item.float) : getCardWear(card);
        if (cardWear !== wear) return false;
    }

    return true;
}

function applyBrowseFilters() {
    const bar = document.getElementById('csrx-browse');
    if (!bar || !isBrowsePage()) return;

    if (isTradePickerModal()) repositionTradeBrowseBar();

    const f = readBrowseFilters();
    if (!f) return;

    const cards = getAllCards();
    if (!cards.length) {
        bar.querySelector('#csrx-browse-count').textContent = '';
        return;
    }

    ensureCardOrder(cards);
    const cache = getBrowseCache();
    const itemMap = buildCardItemMap(cards, cache);
    const grid = getCardGridParent(cards);
    const mp = isMarketplacePage();

    const tradePicker = isTradePickerModal();
    if (tradePicker) {
        const { visible: visCount, total } = applyTradePickerBrowseFilters(f);
        const countEl = bar.querySelector('#csrx-browse-count');
        if (countEl) {
            countEl.textContent = visCount === total
                ? `${total} items`
                : `Showing ${visCount} of ${total} items`;
        }
        return;
    }

    let visible = [];
    for (const card of cards) {
        if (isEmptyPickerSlot(card)) {
            card.classList.add('csrx-browse-slot-hidden');
            continue;
        }
        card.classList.remove('csrx-browse-slot-hidden');
        const item = itemMap.get(card);
        const pass = cardPassesBrowseFilters(card, item, f);
        card.classList.toggle('csrx-browse-hidden', !pass);
        if (pass) visible.push({ card, item });
    }

    if (sortVisibleBrowseItems(visible, f, mp)) {
        visible.forEach(({ card }) => grid?.appendChild(card));
    } else if (!isItemPickerModal()) {
        restoreCardOrder(cards, grid);
    }

    const countEl = bar.querySelector('#csrx-browse-count');
    if (countEl) {
        countEl.textContent = visible.length === cards.length
            ? csrT('browse.itemsCount', { n: cards.length })
            : csrT('browse.showing', { visible: visible.length, total: cards.length });
    }
}

function scheduleBrowseFilters() {
    clearTimeout(browseDebounce);
    browseDebounce = setTimeout(applyBrowseFilters, 120);
}

function clearBrowseFilters() {
    const bar = document.getElementById('csrx-browse');
    if (!bar) return;
    bar.querySelector('#csrx-browse-search').value = '';
    const rar = bar.querySelector('#csrx-browse-rarity');
    const wear = bar.querySelector('#csrx-browse-wear');
    const flt = bar.querySelector('#csrx-browse-float');
    if (rar) rar.value = '';
    if (wear) wear.value = '';
    if (flt) flt.value = '';
    const price = bar.querySelector('#csrx-browse-price');
    if (price) price.value = '';
    if (isTradePickerModal()) resetTradePickerBrowseClasses();
    applyBrowseFilters();
}

function buildBrowseBar() {
    const mp = isMarketplacePage();
    const tradeCompact = isTradePickerModal();
    const wrap = document.createElement('div');
    wrap.id = 'csrx-browse';

    if (tradeCompact) {
        wrap.innerHTML = `
<div class="csrx-browse-row">
    <input id="csrx-browse-search" type="search" placeholder="${csrT('browse.searchPlaceholder')}" autocomplete="off" spellcheck="false">
    <button type="button" id="csrx-browse-clear" data-i18n="browse.clear">${csrT('browse.clear')}</button>
</div>
<div id="csrx-browse-count"></div>`;
        wrap.querySelector('#csrx-browse-search').addEventListener('input', scheduleBrowseFilters);
        wrap.querySelector('#csrx-browse-clear').addEventListener('click', clearBrowseFilters);
        return wrap;
    }

    const rarityOpts = [`<option value="">${csrT('browse.allRarities')}</option>`]
        .concat(rarityEntries().map(([k, v]) =>
            `<option value="${k}">${v.name}</option>`
        )).join('');

    const wearOpts = [`<option value="">${csrT('browse.allWear')}</option>`,
        `<option value="FN">${csrT('wear.FN')}</option>`,
        `<option value="MW">${csrT('wear.MW')}</option>`,
        `<option value="FT">${csrT('wear.FT')}</option>`,
        `<option value="WW">${csrT('wear.WW')}</option>`,
        `<option value="BS">${csrT('wear.BS')}</option>`,
    ].join('');

    const floatOpts = [`<option value="">${csrT('browse.floatOrder')}</option>`,
        `<option value="asc">${csrT('browse.floatAsc')}</option>`,
        `<option value="desc">${csrT('browse.floatDesc')}</option>`,
    ].join('');

    const priceOpts = mp ? [
        `<select id="csrx-browse-price" title="${csrT('browse.sortPrice')}">`,
        `<option value="">${csrT('browse.priceOrder')}</option>`,
        `<option value="asc">${csrT('browse.cheapest')}</option>`,
        `<option value="desc">${csrT('browse.expensive')}</option>`,
        '</select>',
    ].join('') : '';

    wrap.innerHTML = `
<div class="csrx-browse-row">
    <input id="csrx-browse-search" type="search" placeholder="${csrT('browse.searchPlaceholder')}" autocomplete="off" spellcheck="false">
    <div class="csrx-browse-filters">
        <select id="csrx-browse-rarity" title="${csrT('browse.filterRarity')}">${rarityOpts}</select>
        <select id="csrx-browse-wear" title="${csrT('browse.filterWear')}">${wearOpts}</select>
        <select id="csrx-browse-float" title="${csrT('browse.sortFloat')}">${floatOpts}</select>
        ${priceOpts}
        <button type="button" id="csrx-browse-clear" data-i18n="browse.clear">${csrT('browse.clear')}</button>
    </div>
</div>
<div id="csrx-browse-count"></div>`;

    wrap.querySelector('#csrx-browse-search').addEventListener('input', scheduleBrowseFilters);
    wrap.querySelectorAll('select').forEach(el => el.addEventListener('change', applyBrowseFilters));
    wrap.querySelector('#csrx-browse-clear').addEventListener('click', clearBrowseFilters);
    return wrap;
}

function initBrowseTools() {
    if (!isBrowsePage()) return;
    const prevSearch = document.getElementById('csrx-browse-search')?.value || '';
    if (document.getElementById('csrx-browse')) {
        if (!isBrowseBarMisplaced()) return;
        document.getElementById('csrx-browse').remove();
        browseToolsActive = false;
    }
    const mount = findBrowseMountPoint();
    if (!mount?.el) return;
    if (isItemPickerModal()) {
        const root = getItemPickerModalRoot();
        if (!root || !root.contains(mount.el)) return;
    }
    const bar = buildBrowseBar();
    if (prevSearch) {
        const inp = bar.querySelector('#csrx-browse-search');
        if (inp) inp.value = prevSearch;
    }
    if (mount.mode === 'before') {
        mount.el.insertAdjacentElement('beforebegin', bar);
    } else {
        mount.el.insertAdjacentElement('afterend', bar);
    }
    browseToolsActive = true;
    resetBrowseBarStaticStyles(bar);
    updateBrowseBarLayout();
    applyBrowseFilters();
}

function stopBrowseTools() {
    browseToolsActive = false;
    clearTimeout(browseDebounce);
    clearTimeout(browseInitTimer);
    if (isTradePickerModal()) resetTradePickerBrowseClasses();
    document.getElementById('csrx-browse')?.remove();
    resetBrowseFilterClasses();
    document.querySelectorAll('[data-csrx-order]').forEach(c => delete c.dataset.csrxOrder);
}

function pruneOrphanOverlays(cardSet) {
    document.querySelectorAll('.csrx-card-wrap').forEach(wrap => {
        const card = wrap.parentElement;
        if (!card || !cardSet.has(card) || wrap.closest('#csrx-win, #csrx-overlay, #csrx-fab, #csrx-toast')) {
            wrap.remove();
        }
    });
}

function isCardNearViewport(cardEl, margin = OVERLAY_LAZY_VIEW_MARGIN) {
    if (!cardEl?.isConnected) return false;
    const r = cardEl.getBoundingClientRect();
    return r.bottom >= -margin && r.top <= window.innerHeight + margin
        && r.right >= -margin && r.left <= window.innerWidth + margin;
}

function isLazyOverlayGridPage() {
    if (isMarketplacePage()) return true;
    if (isInventoryPage() && !isMarketplacePage()) return true;
    if (isItemPickerModal()) return true;
    if (isTradeDetailView()) return true;
    if (isTradePage()) return true;
    return false;
}

function isIncrementalOverlayContext() {
    return isTradePage() || isTradeDetailView() || isItemPickerModal();
}

function shouldUseIncrementalOverlays(cardCount) {
    if (cardCount < OVERLAY_INCREMENTAL_MIN_CARDS) return false;
    if (!isIncrementalOverlayContext()) return false;
    return csrIsFeatureEnabled('floatOverlays');
}

function shouldUseLazyOverlays(cardCount) {
    if (shouldUseIncrementalOverlays(cardCount)) return false;
    if (cardCount < OVERLAY_LAZY_MIN_CARDS) return false;
    if (!isLazyOverlayGridPage()) return false;
    if (csrIsFeatureEnabled('floatOverlays')) return true;
    return csrIsFeatureEnabled('skinLock') && isInventoryPage() && !isMarketplacePage();
}

function getPendingOverlayCards() {
    if (!_overlayLazyCards) return [];
    return _overlayLazyCards.filter((c) =>
        c.isConnected && !c.querySelector('.csrx-card-wrap')
    );
}

function canOverlayScrollContainer() {
    const root = _overlayLazyScrollTarget;
    if (root) return root.scrollHeight > root.clientHeight + 8;
    return document.documentElement.scrollHeight > window.innerHeight + 8;
}

function isOverlayScrollNearBottom(margin = OVERLAY_INCREMENTAL_BOTTOM_MARGIN) {
    const root = _overlayLazyScrollTarget;
    if (root) {
        return root.scrollTop + root.clientHeight >= root.scrollHeight - margin;
    }
    const doc = document.documentElement;
    return window.innerHeight + window.scrollY >= doc.scrollHeight - margin;
}

function loadIncrementalOverlayBatch() {
    if (!_overlayLazyTick || !_overlayLazyCards) return 0;
    const pending = getPendingOverlayCards();
    if (!pending.length) return 0;
    _overlayLazyTick(pending.slice(0, OVERLAY_INCREMENTAL_BATCH));
    return Math.min(pending.length, OVERLAY_INCREMENTAL_BATCH);
}

function primeIncrementalOverlayBatches() {
    let guard = 0;
    while (guard++ < 24) {
        if (!loadIncrementalOverlayBatch()) break;
        if (canOverlayScrollContainer()) break;
    }
}

function maybeLoadIncrementalOverlayBatch(aggressive = false) {
    if (_overlayLazyMode !== 'incremental' || !_overlayLazyTick) return;
    if (!getPendingOverlayCards().length) return;
    if (aggressive) {
        primeIncrementalOverlayBatches();
        return;
    }
    if (isOverlayScrollNearBottom() || !canOverlayScrollContainer()) {
        loadIncrementalOverlayBatch();
    }
}

function applyOverlaysToCardList(cards, cache) {
    if (!cards.length || !cache.length) return;
    const used = new Set();
    for (const cardEl of cards) {
        const item = matchOverlayItem(cardEl, cache, used);
        if (!item) {
            cardEl.querySelector('.csrx-card-wrap')?.remove();
            continue;
        }
        injectCardOverlay(cardEl, item);
    }
}

function findOverlayScrollRoot() {
    const cards = getAllCards();
    if (!cards.length) return null;
    let el = cards[0].parentElement;
    while (el && el !== document.body) {
        const st = getComputedStyle(el);
        const oy = st.overflowY;
        if ((oy === 'auto' || oy === 'scroll') && el.scrollHeight > el.clientHeight + 8) {
            return el;
        }
        el = el.parentElement;
    }
    return null;
}

function stopOverlayLazyScroll() {
    if (_overlayLazyScroll && _overlayLazyScrollTarget) {
        _overlayLazyScrollTarget.removeEventListener('scroll', _overlayLazyScroll);
    }
    if (_overlayLazyScroll) {
        window.removeEventListener('scroll', _overlayLazyScroll);
    }
    _overlayLazyScroll = null;
    _overlayLazyScrollTarget = null;
    _overlayLazyCards = null;
    _overlayLazyTick = null;
    _overlayLazyMode = null;
}

function bindOverlayIncrementalScrollListener() {
    if (_overlayLazyScroll && _overlayLazyScrollTarget) {
        _overlayLazyScrollTarget.removeEventListener('scroll', _overlayLazyScroll);
    }
    if (_overlayLazyScroll) {
        window.removeEventListener('scroll', _overlayLazyScroll);
    }
    let ticking = false;
    const onScroll = () => {
        if (!overlayRunning || ticking || _overlayLazyMode !== 'incremental') return;
        ticking = true;
        requestAnimationFrame(() => {
            ticking = false;
            maybeLoadIncrementalOverlayBatch(false);
        });
    };
    _overlayLazyScroll = onScroll;
    const root = findOverlayScrollRoot();
    _overlayLazyScrollTarget = root;
    if (root) root.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('scroll', onScroll, { passive: true });
}

function runIncrementalOverlayPass(allCards, applyBatch) {
    stopOverlayLazyScroll();
    _overlayLazyCards = allCards;
    _overlayLazyTick = applyBatch;
    _overlayLazyMode = 'incremental';
    _overlayLazyScrollTarget = findOverlayScrollRoot();
    primeIncrementalOverlayBatches();
    bindOverlayIncrementalScrollListener();
}

function bindOverlayLazyScrollListener() {
    if (_overlayLazyScroll && _overlayLazyScrollTarget) {
        _overlayLazyScrollTarget.removeEventListener('scroll', _overlayLazyScroll);
    }
    if (_overlayLazyScroll) {
        window.removeEventListener('scroll', _overlayLazyScroll);
    }
    let ticking = false;
    const onScroll = () => {
        if (!overlayRunning || ticking || _overlayLazyMode !== 'viewport' || !_overlayLazyTick || !_overlayLazyCards) return;
        ticking = true;
        requestAnimationFrame(() => {
            ticking = false;
            if (!overlayRunning || _overlayLazyMode !== 'viewport' || !_overlayLazyTick || !_overlayLazyCards) return;
            const pending = _overlayLazyCards.filter((c) =>
                c.isConnected && isCardNearViewport(c) && !c.querySelector('.csrx-card-wrap')
            );
            if (!pending.length) return;
            _overlayLazyTick(pending.slice(0, OVERLAY_LAZY_BATCH));
        });
    };
    _overlayLazyScroll = onScroll;
    const root = findOverlayScrollRoot();
    _overlayLazyScrollTarget = root;
    if (root) root.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('scroll', onScroll, { passive: true });
}

function runLazyOverlayPass(allCards, applyBatch) {
    stopOverlayLazyScroll();
    _overlayLazyCards = allCards;
    _overlayLazyTick = applyBatch;
    _overlayLazyMode = 'viewport';
    const visible = allCards.filter((c) => isCardNearViewport(c));
    const firstBatch = visible.length ? visible : allCards.slice(0, OVERLAY_LAZY_BATCH);
    applyBatch(firstBatch);
    bindOverlayLazyScrollListener();
}

function applyOverlaysToAll(opts) {
    const urgent = opts?.urgent === true;
    if (isTradeDetailView()) {
        applyTradeDetailOverlays();
        return;
    }

    const cards = getAllCards();
    if (isBrowsePage() && (!document.getElementById('csrx-browse') || isBrowseBarMisplaced())) {
        scheduleBrowseInit();
    }
    scheduleBrowseLayoutUpdate();

    const cardSet = new Set(cards);
    if (!cards.length) {
        if (!urgent) clearSkinOverlays();
        return;
    }

    const cache = getOverlayCache();
    if (!cache.length) {
        if (!urgent) pruneOrphanOverlays(cardSet);
        return;
    }

    _currentOverlayCards = cards;
    try {
        if (shouldUseIncrementalOverlays(cards.length)) {
            runIncrementalOverlayPass(cards, (batch) => applyOverlaysToCardList(batch, cache));
        } else if (shouldUseLazyOverlays(cards.length)) {
            runLazyOverlayPass(cards, (batch) => applyOverlaysToCardList(batch, cache));
        } else {
            stopOverlayLazyScroll();
            applyOverlaysToCardList(cards, cache);
        }
        pruneOrphanOverlays(cardSet);
    } finally {
        _currentOverlayCards = null;
    }
    if (isTradePickerModal()) hideTradePickerEmptySlots();
    scheduleSidebarChromeAlign();
}

async function startAlwaysOnOverlay() {
    if (overlayRunning) return;
    overlayRunning = true;
    ensureOverlayDomObserver();
    if (isInventoryPage()) ensureQuickSellDomWatcher();
    const cacheReady = isMarketplacePage()
        ? marketplaceCache.length > 0
        : inventoryCache.length > 0;
    if (cacheReady) applyOverlaysToAll({ urgent: true });
    if (isBrowsePage()) scheduleBrowseInit();

    if (isMarketplacePage()) {
        await fetchMarketplace();
    } else {
        await fetchInventory();
    }
    applyOverlaysToAll({ urgent: true });
    scheduleOverlayBootstrap();
    if (isBrowsePage()) scheduleBrowseInit();
    overlayTimer = setInterval(() => {
        if (!overlayRunning || document.hidden) return;
        const cards = getAllCards();
        const cache = getOverlayCache();
        if (!cards.length || !cache.length) return;
        if (cards.some(c => !c.querySelector('.csrx-card-wrap'))) {
            if (_overlayLazyMode === 'incremental') maybeLoadIncrementalOverlayBatch(true);
            else applyOverlaysToAll({ urgent: true });
        }
    }, 6000);
}

function stopAlwaysOnOverlay() {
    overlayRunning = false;
    _overlayBootGen++;
    clearTimeout(_overlayBootTimer);
    clearInterval(overlayTimer);
    overlayTimer = null;
    stopOverlayLazyScroll();
    stopOverlayDomObserver();
    document.querySelectorAll('.csrx-card-wrap').forEach(el => el.remove());
}

function checkPageAndRun() {
    cleanupOrphanTradeBrowse();
    const onOverlay = isOverlayPage();
    const onBrowse  = isBrowsePage();
    const kind = isMarketplacePage() ? 'mp'
        : (isTradePage() || isTradeDetailView() || isTradePickerModal()) ? 'trade'
        : 'inv';

    if (!onOverlay) {
        if (overlayRunning) stopAlwaysOnOverlay();
        overlayPageKind = null;
    }

    if (!onBrowse) {
        stopBrowseTools();
        browsePageKind = null;
    } else {
        const bk = isMarketplacePage() && !isCreateOfferModal() ? 'mp'
            : isItemPickerModal() ? 'picker'
            : 'inv';
        if (browsePageKind !== bk) {
            stopBrowseTools();
            browsePageKind = bk;
        }
        if (!document.getElementById('csrx-browse') || isBrowseBarMisplaced()) scheduleBrowseInit();
        if (isCreateOfferModal() && !inventoryCache.length) {
            fetchInventory().then(() => {
                applyBrowseFilters();
                scheduleBrowseInit();
            });
        } else if (!onOverlay && isMarketplacePage() && !isCreateOfferModal() && !marketplaceCache.length) {
            fetchMarketplace().then(() => applyBrowseFilters());
        } else if (!onOverlay && isInventoryPage() && !inventoryCache.length) {
            fetchInventory().then(() => applyBrowseFilters());
        }
    }

    const pickerOpen = isItemPickerModal();
    if (pickerOpen && isTradePickerModal()) {
        const their = isTheirItemsTabActive();
        if (_lastTradeTheirTab !== null && _lastTradeTheirTab !== their) {
            resetTradePickerBrowseOnTabSwitch();
            scheduleBrowseInit();
        }
        _lastTradeTheirTab = their;
    } else if (!pickerOpen) {
        _lastTradeTheirTab = null;
    }
    if (pickerOpen && !_tradeModalWasOpen) {
        if (overlayRunning) scheduleOverlayBootstrap();
        scheduleBrowseInit();
    }
    if (!pickerOpen && _tradeModalWasOpen) {
        if (isMarketplacePage()) resetPickerBrowseSideEffects();
        else if (!isInventoryPage()) stopBrowseTools();
    }
    _tradeModalWasOpen = pickerOpen;

    if (!onOverlay) return;

    if (overlayRunning && overlayPageKind !== kind) stopAlwaysOnOverlay();

    if (!overlayRunning) {
        overlayPageKind = kind;
        startAlwaysOnOverlay();
    } else if (kind === 'mp' && !marketplaceCache.length) {
        fetchMarketplace().then(() => {
            applyOverlaysToAll({ urgent: true });
            scheduleOverlayBootstrap();
        });
    }
}

document.addEventListener('click', e => {
    const t = e.target?.textContent?.trim() || '';
    if (/^(my items|their items)$/i.test(t) && isItemPickerModal()) {
        resetTradePickerBrowseOnTabSwitch();
        scheduleApplyOverlays(true);
        scheduleOverlayBootstrap();
        setTimeout(scheduleBrowseInit, 50);
    }
}, true);

window.addEventListener('resize', scheduleBrowseLayoutUpdate);
window.addEventListener('resize', scheduleSidebarChromeAlign);
window.addEventListener('scroll', scheduleSidebarChromeAlign, true);

function extUrl(p) {
    try {
        const rt = (typeof chrome !== 'undefined' && chrome.runtime?.getURL)
            ? chrome.runtime
            : (typeof browser !== 'undefined' && browser.runtime?.getURL)
                ? browser.runtime
                : null;
        return rt ? rt.getURL(p) : p;
    } catch (_) {
        return p;
    }
}

const fab = document.createElement('div');
fab.id = 'csrx-fab';
fab.title = csrT('qs.fabTitle');
fab.innerHTML = `<img alt="CS:R Inventory Helper" src="${extUrl('icons/icon-128.png')}">`;
document.body.appendChild(fab);
fab.classList.add('csrx-feature-off');

const win = document.createElement('div');
win.id = 'csrx-win';
win.innerHTML = `
<div id="csrx-win-top"></div>
<div id="csrx-hdr">
    <div class="csrx-logo">
        <img alt="CS:R Inventory Helper" src="${extUrl('icons/icon-128.png')}">
    </div>
    <div class="csrx-hdr-text">
        <div class="csrx-hdr-title" data-i18n="qs.title">${csrT('qs.title')}</div>
        <div class="csrx-hdr-sub" data-i18n="qs.subtitle">${csrT('qs.subtitle')}</div>
    </div>
    <div id="csrx-winx">
        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#333" stroke-width="2.5" stroke-linecap="round">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
    </div>
</div>
<div id="csrx-statusbar">
    <div class="csrx-dot" id="csrx-dot"></div>
    <span id="csrx-stat" data-i18n="qs.status.ready">${csrT('qs.status.ready')}</span>
</div>
<div id="csrx-body">
    <div>
        <div class="csrx-section" data-i18n="qs.section.picker">${csrT('qs.section.picker')}</div>
        <div style="display:flex;flex-direction:column;gap:7px;">
            <button id="csrx-modbtn" class="csrx-btn csrx-btn-primary">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
                    <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/>
                    <polyline points="10 17 15 12 10 7"/>
                    <line x1="15" y1="12" x2="3" y2="12"/>
                </svg>
                ${csrT('qs.startPicking')}
            </button>
            <div id="csrx-picked-info">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
                    <polyline points="20 6 9 17 4 12"/>
                </svg>
                <span id="csrx-picked-count">${csrT('qs.itemsSelected', { n: 0 })}</span>
            </div>
            <button id="csrx-selbtn" class="csrx-btn csrx-btn-success" style="display:none;" disabled>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
                    <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                </svg>
                ${csrT('qs.reviewSell')}
            </button>
        </div>
    </div>
    <div>
        <div class="csrx-section" data-i18n="qs.section.global">${csrT('qs.section.global')}</div>
        <div style="display:flex;flex-direction:column;gap:7px;">
            <select id="csrx-rar" class="csrx-sel">
                ${rarityEntries().map(([k, v]) => `<option value="${k}">${v.name}</option>`).join('')}
            </select>
            <button id="csrx-massbtn" class="csrx-btn csrx-btn-danger">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
                    <polyline points="3 6 5 6 21 6"/>
                    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                    <path d="M10 11v6"/><path d="M14 11v6"/>
                </svg>
                ${csrT('qs.sellByRarity')}
            </button>
        </div>
    </div>
    <div>
        <div class="csrx-section" data-i18n="qs.section.speed">${csrT('qs.section.speed')}</div>
        <div class="csrx-slider-wrap">
            <div class="csrx-slider-row">
                <span class="csrx-slider-lbl" data-i18n="qs.batchSize">${csrT('qs.batchSize')}</span>
                <span class="csrx-slider-val" id="csrx-spdval">5</span>
            </div>
            <input type="range" id="csrx-spd" class="csrx-range" min="1" max="20" value="5">
        </div>
    </div>
</div>`;
document.body.appendChild(win);
win.classList.add('csrx-feature-off');

const overlay = document.createElement('div');
overlay.id = 'csrx-overlay';
overlay.innerHTML = `
<div id="csrx-modal">
    <div id="csrx-modal-top"></div>
    <div id="csrx-mhdr">
        <div class="csrx-mhdr-left">
            <div class="csrx-mhdr-title">${csrT('qs.confirm.title')}</div>
            <div class="csrx-mhdr-sub" id="csrx-mhdr-sub" data-i18n="qs.confirm.subtitle">${csrT('qs.confirm.subtitle')}</div>
        </div>
        <div id="csrx-mxbtn">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#333" stroke-width="2.5" stroke-linecap="round">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
        </div>
    </div>
    <div id="csrx-mprog"><div id="csrx-mbar"></div></div>
    <div id="csrx-mwarn">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" style="flex-shrink:0;margin-top:1px;">
            <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
            <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
        </svg>
        <span data-i18n="qs.confirm.warn">${csrT('qs.confirm.warn')}</span>
    </div>
    <div id="csrx-validator">
        <div class="csrx-val-title" data-i18n="qs.validation.title">${csrT('qs.validation.title')}</div>
        <div class="csrx-val-grid" id="csrx-val-grid"></div>
    </div>
    <div id="csrx-mgrid"></div>
    <div id="csrx-mfoot">
        <div id="csrx-msumm">
            <div class="csrx-summ-count" id="csrx-summ-count">0 items</div>
            <div class="csrx-summ-sub"   id="csrx-summ-sub">ready to sell</div>
        </div>
        <button id="csrx-mcancel" class="m-btn" data-i18n="qs.cancelSale">${csrT('qs.cancelSale')}</button>
        <div id="csrx-mfoot-actions">
            <button id="csrx-mlist" class="m-btn" type="button">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
                    <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/>
                    <line x1="3" y1="6" x2="21" y2="6"/>
                    <path d="M16 10a4 4 0 01-8 0"/>
                </svg>
                List on Market
            </button>
            <button id="csrx-mquick" class="m-btn" type="button">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
                    <line x1="12" y1="1" x2="12" y2="23"/>
                    <path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/>
                </svg>
                Quick Sell
            </button>
        </div>
    </div>
</div>`;
document.body.appendChild(overlay);

const toastEl = document.createElement('div');
toastEl.id = 'csrx-toast';
document.body.appendChild(toastEl);

let _tt;
function toast(msg, type = 'success') {
    clearTimeout(_tt);
    const cfg = {
        success: { col:'#22c55e' },
        error:   { col:'#ef4444' },
        warn:    { col:'#f59e0b' },
        info:    { col:'#fff'    },
    };
    const c = cfg[type] || cfg.info;
    const icons = {
        success:`<svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg>`,
        error:  `<svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
        warn:   `<svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round"><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
        info:   `<svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round"><circle cx="12" cy="12" r="10"/></svg>`,
    };
    toastEl.style.borderColor = c.col + '20';
    toastEl.innerHTML = `
        <div class="csrx-toast-icon" style="background:${c.col}18;border:1px solid ${c.col}25;">
            <span style="color:${c.col}">${icons[type]||icons.info}</span>
        </div>
        <span>${msg}</span>`;
    toastEl.classList.add('show');
    _tt = setTimeout(() => toastEl.classList.remove('show'), 3000);
}

{
    let drag=false,ox=0,oy=0;
    document.getElementById('csrx-hdr').addEventListener('mousedown',e=>{
        if(e.target.closest('#csrx-winx'))return;
        drag=true; ox=e.clientX; oy=e.clientY;
    });
    document.addEventListener('mouseup',()=>{drag=false;});
    document.addEventListener('mousemove',e=>{
        if(!drag)return;
        const r=win.getBoundingClientRect();
        win.style.left=(r.left+e.clientX-ox)+'px';
        win.style.top=(r.top+e.clientY-oy)+'px';
        win.style.right='auto';
        ox=e.clientX; oy=e.clientY;
    });
}

function setStatus(text, state='ready') {
    const dot=document.getElementById('csrx-dot');
    document.getElementById('csrx-stat').textContent=text;
    dot.className='csrx-dot';
    if(state==='syncing') dot.classList.add('syncing');
    if(state==='active')  dot.classList.add('active');
}

let serverInv=[], selMode=false, selling=false;
let picked=new Map();
const btnMode=document.getElementById('csrx-modbtn');
const btnSell=document.getElementById('csrx-selbtn');

async function apiInv() {
    try {
        const r=await fetch('https://api.csrestored.fun/inventory/',{credentials:'include'});
        if(!r.ok) throw r.status;
        const d=await r.json();
        const arr=Array.isArray(d)?d:(d.items||d.inventory||d.data||[]);
        cacheQuickSellFromInventory(arr);
        return arr.sort((a,b)=>parseInt(a.rarity)-parseInt(b.rarity));
    } catch(e){return [];}
}
async function apiSell(wid) {
    try {
        const url = `https://api.csrestored.fun/inventory/sell/${wid}`;
        const r=await fetch(url,{
            method:'POST',credentials:'include',
            headers:{'Content-Type':'application/json'},
            body:JSON.stringify({weapon_id:parseInt(wid)})
        });
        if (r.ok) {
            try {
                const d = await r.clone().json();
                cacheQuickSellFromApiData(url, d);
            } catch (_) {}
        }
        return r.ok;
    } catch(e){return false;}
}

async function apiListOnMarket(weaponId, priceCoins) {
    const wid = parseInt(weaponId, 10);
    const price = Math.min(
        parseInt(String(priceCoins).replace(/[^\d]/g, ''), 10) || 0,
        MAX_MARKET_PRICE_COINS
    );
    if (!wid || !price || price < 1) return { ok: false };

    let storedUrl = null;
    try { storedUrl = sessionStorage.getItem('csrx_mp_list_url'); } catch (_) {}

    const attempts = [];
    if (storedUrl) {
        try {
            const tpl = JSON.parse(sessionStorage.getItem('csrx_mp_list_body') || 'null');
            if (tpl && typeof tpl === 'object') {
                attempts.push({ url: storedUrl, body: { ...tpl, weapon_id: wid, price } });
            }
        } catch (_) {}
    }
    attempts.push({ url: MP_ADD_URL, body: buildMarketListPayload(wid, price) });

    for (const { url, body } of attempts) {
        try {
            const r = await fetch(url, {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            if (r.ok) {
                saveMarketListFromRequest(url, 'POST', JSON.stringify(body));
                return { ok: true };
            }
        } catch (_) {}
    }
    return { ok: false };
}

function enrichQuickSellPrices(entries) {
    scrapeWeaponDetailsQuickSell();
    applyQuickSellToEntries(entries, null);
}

function findCard(target) {
    let el=target;
    for(let i=0;i<15;i++){
        if(!el||el===document.body)return null;
        const cl=el.className||'';
        if(typeof cl==='string'&&cl.includes('aspect-square')&&cl.includes('rounded-2xl')&&cl.includes('flex-col'))return el;
        el=el.parentElement;
    }
    return null;
}

function matchCard(cardEl, inv, usedIds) {
    if (!inv?.length) return null;

    const wrap = cardEl.querySelector('.csrx-card-wrap');
    const overlayWid = weaponIdFromCsrxKey(wrap?.dataset?.csrxKey);
    if (overlayWid != null && !usedIds.has(overlayWid)) {
        const item = inv.find(i => parseInt(i.weapon_id, 10) === overlayWid);
        if (item) return { item, confidence: 'high' };
    }

    const used = usedKeysFromWeaponIds(usedIds);
    const matched = matchOverlayItem(cardEl, inv, used);
    if (matched && !usedIds.has(matched.weapon_id)) {
        return { item: matched, confidence: overlayWid === matched.weapon_id ? 'high' : 'medium' };
    }

    const imgId = getImgItemId(cardEl);
    const wear = getCardWear(cardEl);
    const hasSt = cardHasStatTrak(cardEl);
    if (imgId == null) return null;

    let cands = inv.filter(i =>
        i.item_id === imgId &&
        !usedIds.has(i.weapon_id) &&
        (!wear || getCondition(i.float) === wear) &&
        i.stattrak === hasSt
    );
    if (cands.length > 1) {
        const { float, seed } = parseOverlaySig(cardEl);
        if (float != null) {
            const byFloat = cands.filter(i =>
                i.float != null && Math.abs(i.float - float) < 0.00005
            );
            if (byFloat.length) cands = byFloat;
        }
        if (cands.length > 1 && seed != null) {
            const bySeed = cands.filter(i => i.seed === seed);
            if (bySeed.length) cands = bySeed;
        }
    }
    if (cands.length >= 1) {
        return { item: cands[0], confidence: cands.length === 1 ? 'medium' : 'low' };
    }
    return null;
}

function csrIsItemSellBlocked(item) {
    return csrIsFeatureEnabled('skinLock') && item?.weapon_id != null && csrIsWeaponLocked(item.weapon_id);
}

function syncQuickSellPanelVisibility() {
    const panelOn = csrIsFeatureEnabled('quickSellPanel');
    fab.classList.toggle('csrx-feature-off', !panelOn);
    win.classList.toggle('csrx-feature-off', !panelOn);
    if (!panelOn) {
        winOpen = false;
        win.style.display = 'none';
        fab.style.display = 'none';
        if (selMode) exitSel();
        return;
    }
    if (!isInventoryPage()) {
        win.style.display = 'none';
        fab.style.display = 'none';
        if (selMode) exitSel();
        return;
    }
    win.style.display = winOpen ? 'flex' : 'none';
    fab.style.display = winOpen ? 'none' : 'flex';
}

let winOpen=false;
document.getElementById('csrx-winx').addEventListener('click',()=>{winOpen=false;if(selMode)exitSel();});
fab.addEventListener('click',()=>{ if (!csrIsFeatureEnabled('quickSellPanel')) return; winOpen=true; });
setInterval(syncQuickSellPanelVisibility, 400);
document.getElementById('csrx-spd').addEventListener('input',e=>{
    document.getElementById('csrx-spdval').textContent=e.target.value;
});

function enterSel() {
    selMode=true;
    serverInv=inventoryCache;
    setStatus(csrT('qs.status.picking'),'active');
    btnMode.innerHTML=`<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg> ${csrT('qs.cancel')}`;
    btnMode.className='csrx-btn csrx-btn-cancel';
    btnSell.style.display='block';
    document.getElementById('csrx-picked-info').classList.add('show');
    updateSelBtn();
    apiInv().then((inv) => { if (selMode && inv?.length) serverInv = inv; }).catch(() => {});
}
function exitSel() {
    selMode=false; setStatus(csrT('qs.status.ready'),'ready');
    btnMode.innerHTML=`<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg> ${csrT('qs.startPicking')}`;
    btnMode.className='csrx-btn csrx-btn-primary';
    btnSell.style.display='none';
    document.getElementById('csrx-picked-info').classList.remove('show');
    picked.forEach((_,el)=>cleanCard(el)); picked.clear(); updateSelBtn();
}
function cleanCard(el) {
    el.classList.remove('csrx-picked');
    el.querySelector('.csrx-check-badge')?.remove();
    delete el._csrxWid; delete el._csrxConf;
}
btnMode.addEventListener('click',()=>selMode?exitSel():enterSel());

function updateSelBtn() {
    const n=picked.size;
    document.getElementById('csrx-picked-count').textContent = n === 1
        ? csrT('qs.itemsSelectedOne')
        : csrT('qs.itemsSelected', { n });
    btnSell.innerHTML=`<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg> ${csrT('qs.reviewSellN', { n })}`;
    btnSell.disabled=n===0;
}

document.addEventListener('click',e=>{
    if(!selMode)return;
    if(e.target.closest('#csrx-win')||e.target.closest('#csrx-overlay')||e.target.closest('#csrx-toast'))return;
    e.preventDefault(); e.stopPropagation();
    const card=findCard(e.target);
    if(!card)return;
    if(e.target.closest('.csrx-lock-btn'))return;
    if(picked.has(card)){
        picked.delete(card); cleanCard(card);
    } else {
        const usedIds=new Set([...picked.values()].filter(v=>v!=null));
        const result=matchCard(card,serverInv,usedIds);
        if(result&&csrIsItemSellBlocked(result.item)){
            toast(csrT('toast.skinLocked'),'warn');
            return;
        }
        if(result){
            card._csrxWid=result.item.weapon_id; card._csrxConf=result.confidence;
            picked.set(card,result.item.weapon_id);
            if(result.confidence==='low')toast(csrT('toast.ambiguousMatch'),'warn');
        } else {
            card._csrxWid=null; card._csrxConf='none';
            picked.set(card,null); toast(csrT('toast.itemNotFound'),'error');
        }
        card.classList.add('csrx-picked');
        const chk=document.createElement('div'); chk.className='csrx-check-badge';
        chk.innerHTML=`<svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg>`;
        card.appendChild(chk);
    }
    updateSelBtn();
},true);

function validateItems(entries,freshInv) {
    return entries.map(({cardEl,weaponId})=>{
        if(weaponId==null)return{cardEl,weaponId,item:null,status:'not_found',msg:'Not matched'};
        const fresh=freshInv.find(i=>i.weapon_id===weaponId);
        if(!fresh)return{cardEl,weaponId,item:null,status:'sold_or_missing',msg:'No longer in inventory'};
        if(cardEl){const imgId=getImgItemId(cardEl);if(imgId!=null&&imgId!==fresh.item_id)return{cardEl,weaponId,item:fresh,status:'mismatch',msg:'Image mismatch'};}
        return{cardEl,weaponId,item:fresh,status:'ok',msg:'Verified'};
    });
}

function buildMC(entry) {
    const{item,status}=entry;
    const isOk=status==='ok';
    const rNum=item?parseInt(item.rarity,10):1;
    const rInfo=RARITY[rNum]??RARITY[1];
    const hex=rInfo.hex;

    const wrap=document.createElement('div');
    wrap.className='mc'+(isOk?' mc-confirmed':' mc-bad');
    if(isOk){
        const r=parseInt(hex.slice(1,3),16),g=parseInt(hex.slice(3,5),16),b=parseInt(hex.slice(5,7),16);
        wrap.style.background=`linear-gradient(160deg,rgba(${r},${g},${b},0.07) 0%,#111 55%)`;
    }

    const rline=document.createElement('div'); rline.className='mc-rline';
    rline.style.background=isOk?hex:'#ef4444';
    rline.style.opacity='0.6';
    wrap.appendChild(rline);

    if(isOk){
        const vb=document.createElement('div'); vb.className='mc-verified';
        vb.innerHTML=`<svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3.5" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg>`;
        wrap.appendChild(vb);
    }

    const imgZ=document.createElement('div'); imgZ.className='mc-img';
    if(!item){
        imgZ.innerHTML=`<div class="mc-img-ph">❓</div>`;
    } else {
        const img=document.createElement('img');
        img.src=`https://cdn.csrestored.fun/skins/${item.item_id}.png`; img.alt=wName(item);
        img.onerror=function(){this.style.display='none';const ph=document.createElement('div');ph.className='mc-img-ph';ph.textContent='🔫';imgZ.appendChild(ph);};
        imgZ.appendChild(img);
        if(item.float!=null){
            const wc=document.createElement('div'); wc.className='mc-wear';
            const col=wearColor(item.float); wc.style.color=col;
            wc.textContent=getCondition(item.float); imgZ.appendChild(wc);
        }
    }
    wrap.appendChild(imgZ);

    const body=document.createElement('div'); body.className='mc-body';
    let rm;
    if(!item){
        body.innerHTML=`<div class="mc-weapon">${csrT('qs.unknown')}</div><div class="mc-skin" style="color:#ef4444;">${csrT('qs.notFound')}</div><div style="margin-top:4px;font-size:9px;font-weight:500;padding:2px 6px;border-radius:4px;background:rgba(239,68,68,0.08);color:#ef4444;border:1px solid rgba(239,68,68,0.15);display:inline-block;">${entry.msg||csrT('val.err')}</div>`;
        rm=document.createElement('button');
        rm.type='button';
        rm.className='mc-rm mc-rm-float';
        rm.title=csrT('qs.remove');
        rm.innerHTML=`<svg width="7" height="7" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="3" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
        wrap.appendChild(rm);
    } else {
        const f=item.float,col=wearColor(f);
        const wn=document.createElement('div');wn.className='mc-weapon';wn.textContent=wName(item);body.appendChild(wn);
        const sn=document.createElement('div');sn.className='mc-skin';sn.style.color=hex;sn.textContent=sName(item);body.appendChild(sn);

        if(f!=null){
            const fr=document.createElement('div');fr.className='mc-float-row';
            const fc=document.createElement('span');fc.className='mc-float-cond';fc.style.color=col;fc.style.background=col+'12';fc.textContent=getCondition(f);fr.appendChild(fc);
            const fv=document.createElement('span');fv.className='mc-float-num';fv.textContent=f.toFixed(6);fr.appendChild(fv);
            body.appendChild(fr);
        }
        if(item.seed!=null){
            const pr=document.createElement('div');pr.className='mc-pattern-row';
            const pl=document.createElement('span');pl.className='mc-pattern-lbl';pl.textContent=csrT('qs.pattern');
            const pn=document.createElement('span');pn.className='mc-pattern-num';pn.textContent=`#${item.seed}`;
            pr.appendChild(pl);pr.appendChild(pn);body.appendChild(pr);
        }
        const dv=document.createElement('div');dv.className='mc-divider';body.appendChild(dv);
        const rn=document.createElement('div');rn.className='mc-rarity';rn.style.color=hex;rn.textContent=rInfo.name;body.appendChild(rn);
        const idR=document.createElement('div');idR.className='mc-id';idR.textContent=`ID: ${item.weapon_id}`;body.appendChild(idR);

        const priceBlock=document.createElement('div');priceBlock.className='mc-price-block';
        const qsPrice=getQuickSellPrice(item);
        const qsEl=document.createElement('div');
        qsEl.className='mc-qs-price'+(qsPrice==null?' unknown':'');
        qsEl.textContent=qsPrice!=null?csrT('qs.quickSellLabel', { price: formatCoins(qsPrice) }):csrT('qs.quickSellEmpty');
        priceBlock.appendChild(qsEl);

        rm=document.createElement('button');
        rm.type='button';
        rm.className='mc-rm';
        rm.title=csrT('qs.removeFromList');
        rm.innerHTML=`<svg width="7" height="7" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="3" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;

        const mLbl=document.createElement('div');mLbl.className='mc-market-lbl';mLbl.textContent=csrT('qs.marketPrice');
        priceBlock.appendChild(mLbl);
        const mRow=document.createElement('div');mRow.className='mc-market-row';
        const mInp=document.createElement('input');
        mInp.type='text';
        mInp.inputMode='numeric';
        mInp.pattern='[0-9,]*';
        mInp.className='mc-market-price';
        mInp.placeholder=csrT('qs.enterPrice');
        mInp.value='';
        mInp.setAttribute('maxlength', '9');
        mInp.title=csrT('qs.marketPriceMaxTitle', { max: MAX_MARKET_PRICE_COINS.toLocaleString('en-US') });
        mInp.addEventListener('input', () => clampMarketPriceInput(mInp));
        mInp.addEventListener('blur', () => clampMarketPriceInput(mInp));
        mRow.appendChild(mInp);
        mRow.appendChild(rm);
        priceBlock.appendChild(mRow);
        body.appendChild(priceBlock);

        if(item.stattrak){const st=document.createElement('div');st.className='mc-st';st.textContent=`StatTrak™ ${item.stattrak_count??''}`;body.appendChild(st);}
        if(item.nametag){const tg=document.createElement('div');tg.className='mc-tag';tg.textContent=`"${item.nametag}"`;body.appendChild(tg);}
        const sb=document.createElement('div');sb.className='mc-statusbar';
        const bc=status==='ok'?'#22c55e':status==='mismatch'?'#f59e0b':'#ef4444';
        sb.style.background=bc;body.appendChild(sb);
    }
    wrap.appendChild(body);
    return{wrap,rm};
}

let modalEntries=[];

function getConfirmedModalItems() {
    const out = [];
    document.querySelectorAll('#csrx-mgrid .mc.mc-confirmed').forEach(wrapEl => {
        const entry = modalEntries[parseInt(wrapEl.dataset.idx, 10)];
        if (entry?.item && !csrIsItemSellBlocked(entry.item)) {
            out.push({ item: entry.item, cardEl: entry.cardEl, wrapEl });
        }
    });
    return out;
}

function refreshFooter(){
    const all=[...document.querySelectorAll('#csrx-mgrid .mc')];
    const good=all.filter(c=>c.classList.contains('mc-confirmed')).length;
    const bad=all.filter(c=>c.classList.contains('mc-bad')).length;
    document.getElementById('csrx-summ-count').textContent = good === 1
        ? csrT('qs.itemsSelectedOne')
        : csrT('qs.itemsCount', { n: good });

    let qsTotal = 0;
    let qsKnown = 0;
    getConfirmedModalItems().forEach(({ item }) => {
        const p = getQuickSellPrice(item);
        if (p != null) { qsTotal += p; qsKnown++; }
    });
    const sub = document.getElementById('csrx-summ-sub');
    if (good > 0 && qsKnown > 0) {
        sub.textContent = csrT('qs.footerQuickTotal', { total: formatCoins(qsTotal) });
    } else if (good > 0) {
        sub.textContent = csrT('qs.footerMarketHint');
    } else {
        sub.textContent = csrT('qs.footerNothing');
    }

    const listB = document.getElementById('csrx-mlist');
    const quickB = document.getElementById('csrx-mquick');
    listB.innerHTML = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 01-8 0"/></svg> ${csrT('qs.listMarket', { n: good })}`;
    quickB.innerHTML = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg> ${csrT('qs.quickSell', { n: good })}`;
    listB.disabled = good === 0;
    quickB.disabled = good === 0;
    document.getElementById('csrx-mwarn').classList.toggle('show',bad>0);
    document.getElementById('csrx-mhdr-sub').textContent = csrT('qs.verifiedSummary', { good, bad, total: all.length });
}

function buildValidatorPanel(entries){
    const panel=document.getElementById('csrx-validator');
    const grid=document.getElementById('csrx-val-grid');
    grid.innerHTML='';
    const issues=entries.filter(e=>e.status!=='ok');
    if(!issues.length){panel.classList.remove('show');return;}
    panel.classList.add('show');
    issues.forEach(e=>{
        const row=document.createElement('div');row.className='csrx-val-row';
        const sc={ok:'vsok',mismatch:'vswarn',not_found:'vserr',sold_or_missing:'vserr'}[e.status]||'vserr';
        const sl={ok:csrT('val.ok'),mismatch:csrT('val.warn'),not_found:csrT('val.err'),sold_or_missing:csrT('val.gone')}[e.status]||'?';
        const sc2=e.status==='mismatch'?'#f59e0b':'#ef4444';
        const safeName = escapeCasesHtml(e.item?.name || `ID: ${e.weaponId}`);
        row.innerHTML=`<svg class="csrx-val-icon" viewBox="0 0 24 24" fill="none" stroke="${sc2}" stroke-width="2" stroke-linecap="round"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg><span class="csrx-val-name">${safeName}</span><span class="csrx-val-status ${sc}">${sl}</span>`;
        grid.appendChild(row);
    });
}

async function openModal(entries){
    const allowed = entries.filter(e => e.weaponId == null || !csrIsWeaponLocked(e.weaponId));
    const blocked = entries.length - allowed.length;
    if (blocked) toast(blocked === 1 ? csrT('toast.lockedSkipped', { n: blocked }) : csrT('toast.lockedSkippedMany', { n: blocked }), 'warn');
    if (!allowed.length) return;
    setStatus(csrT('qs.status.validating'),'syncing');
    const fresh=await apiInv();
    setStatus(csrT('qs.status.review'),'active');
    const validated=validateItems(allowed,fresh);
    enrichQuickSellPrices(validated);
    modalEntries=validated;
    const grid=document.getElementById('csrx-mgrid'); grid.innerHTML=''; document.getElementById('csrx-mbar').style.width='0';
    modalEntries.forEach((entry,idx)=>{
        const{wrap,rm}=buildMC(entry); wrap.dataset.idx=idx;
        rm.addEventListener('click',()=>{wrap.remove();refreshFooter();buildValidatorPanel(modalEntries.filter((_,i)=>document.querySelector(`#csrx-mgrid .mc[data-idx="${i}"]`)));});
        grid.appendChild(wrap);
    });
    buildValidatorPanel(validated);
    refreshFooter();
    overlay.classList.add('open');
}

function closeModal(){
    if(selling)return; overlay.classList.remove('open'); setStatus(csrT('qs.status.ready'),'ready');
}
document.getElementById('csrx-mxbtn').addEventListener('click',closeModal);
document.getElementById('csrx-mcancel').addEventListener('click',closeModal);
overlay.addEventListener('mousedown',e=>{if(e.target===overlay)closeModal();});
document.getElementById('csrx-modal').addEventListener('mousedown',e=>{e.stopPropagation();});

function setModalBusy(busy, label) {
    const cancelB = document.getElementById('csrx-mcancel');
    const listB = document.getElementById('csrx-mlist');
    const quickB = document.getElementById('csrx-mquick');
    const xBtn = document.getElementById('csrx-mxbtn');
    cancelB.disabled = busy;
    listB.disabled = busy;
    quickB.disabled = busy;
    xBtn.style.pointerEvents = busy ? 'none' : '';
    xBtn.style.opacity = busy ? '.3' : '';
    if (busy && label) {
        listB.innerHTML = label;
        quickB.innerHTML = label;
    } else {
        refreshFooter();
    }
}

async function runQuickSell(toSell) {
    const spd = parseInt(document.getElementById('csrx-spd').value, 10) || 5;
    const bar = document.getElementById('csrx-mbar');
    let sold = 0;
    let failed = 0;
    for (let i = 0; i < toSell.length; i += spd) {
        const chunk = toSell.slice(i, i + spd);
        await Promise.all(chunk.map(async ({ item, cardEl, wrapEl }) => {
            const ok = await apiSell(item.weapon_id);
            if (ok) {
                sold++;
                if (cardEl) { cardEl.style.transition = 'opacity .5s'; cardEl.style.opacity = '.1'; cleanCard(cardEl); }
                if (wrapEl) { wrapEl.style.opacity = '.15'; wrapEl.style.transition = 'opacity .4s'; }
            } else failed++;
        }));
        bar.style.width = Math.round(Math.min(i + spd, toSell.length) / toSell.length * 100) + '%';
        setStatus(csrT('toast.quickSelling', { sold, total: toSell.length }), 'syncing');
    }
    return { sold, failed };
}

async function runListOnMarket(toList) {
    const spd = parseInt(document.getElementById('csrx-spd').value, 10) || 5;
    const bar = document.getElementById('csrx-mbar');
    let listed = 0;
    let failed = 0;
    for (let i = 0; i < toList.length; i += spd) {
        const chunk = toList.slice(i, i + spd);
        await Promise.all(chunk.map(async ({ item, price, cardEl, wrapEl }) => {
            const { ok } = await apiListOnMarket(item.weapon_id, price);
            if (ok) {
                listed++;
                if (cardEl) { cardEl.style.transition = 'opacity .5s'; cardEl.style.opacity = '.1'; cleanCard(cardEl); }
                if (wrapEl) { wrapEl.style.opacity = '.15'; wrapEl.style.transition = 'opacity .4s'; }
            } else failed++;
        }));
        bar.style.width = Math.round(Math.min(i + spd, toList.length) / toList.length * 100) + '%';
        setStatus(csrT('toast.listing', { listed, total: toList.length }), 'syncing');
    }
    return { listed, failed };
}

function collectMarketListItems() {
    const toList = [];
    let missing = 0;
    let overMax = 0;
    getConfirmedModalItems().forEach(({ item, cardEl, wrapEl }) => {
        const inp = wrapEl.querySelector('.mc-market-price');
        const raw = String(inp?.value ?? '').replace(/,/g, '').trim();
        const entered = parseInt(raw, 10);
        if (entered > MAX_MARKET_PRICE_COINS) {
            overMax++;
            if (inp) inp.value = String(MAX_MARKET_PRICE_COINS);
            inp?.focus();
            return;
        }
        const price = parseMarketPriceInput(inp?.value);
        if (!price) {
            missing++;
            inp?.focus();
            return;
        }
        toList.push({ item, price, cardEl, wrapEl });
    });
    return { toList, missing, overMax };
}

document.getElementById('csrx-mquick').addEventListener('click', async () => {
    if (selling) return;
    const toSell = getConfirmedModalItems();
    if (!toSell.length) return;
    selling = true;
    setModalBusy(true, csrT('toast.modalSelling'));
    const { sold, failed } = await runQuickSell(toSell);
    selling = false;
    closeModal();
    toast(`${csrT(sold === 1 ? 'toast.quickSold' : 'toast.quickSoldMany', { n: sold })}${failed ? ` · ${csrT('toast.quickSoldFailed', { n: failed })}` : ''}`, sold > 0 ? 'success' : 'error');
    if (selMode) exitSel();
    setTimeout(() => location.reload(), 1800);
});

document.getElementById('csrx-mlist').addEventListener('click', async () => {
    if (selling) return;
    const { toList, missing, overMax } = collectMarketListItems();
    if (overMax > 0) {
        toast(csrT('toast.marketPriceMax', { max: MAX_MARKET_PRICE_COINS.toLocaleString('en-US') }), 'warn');
        return;
    }
    if (missing > 0) {
        toast(csrT('toast.enterMarketPrice'), 'warn');
        return;
    }
    if (!toList.length) return;
    selling = true;
    setModalBusy(true, csrT('toast.modalListing'));
    const { listed, failed } = await runListOnMarket(toList);
    selling = false;
    closeModal();
    if (listed > 0) {
        toast(`${csrT('toast.listed', { n: listed })}${failed ? ` · ${csrT('toast.listedFailed', { n: failed })}` : ''}`, 'success');
    } else {
        toast(csrT('toast.listFailed'), 'error');
    }
    if (selMode) exitSel();
    if (listed > 0) setTimeout(() => location.reload(), 1800);
});

btnSell.addEventListener('click',async()=>{
    if(!picked.size||selling)return;
    const entries=[...picked.entries()]
        .filter(([, weaponId]) => {
            if (weaponId == null) return true;
            const item = serverInv.find(i => i.weapon_id === weaponId);
            return !csrIsItemSellBlocked(item || { weapon_id: weaponId });
        })
        .map(([cardEl,weaponId])=>({cardEl,weaponId}));
    const skipped=picked.size-entries.length;
    if(skipped) toast(skipped === 1 ? csrT('toast.lockedSkipped', { n: skipped }) : csrT('toast.lockedSkippedMany', { n: skipped }), 'warn');
    if(!entries.length)return;
    await openModal(entries);
});

document.getElementById('csrx-massbtn').addEventListener('click',async()=>{
    if(selling)return;
    const val=parseInt(document.getElementById('csrx-rar').value);
    setStatus(csrT('toast.fetching'),'syncing');
    const inv=await apiInv();
    setStatus(csrT('qs.status.ready'),'ready');
    const items=inv.filter(i=>parseInt(i.rarity)===val&&!csrIsItemSellBlocked(i));
    const lockedSkip=inv.filter(i=>parseInt(i.rarity)===val&&csrIsItemSellBlocked(i)).length;
    if(lockedSkip) toast(lockedSkip === 1 ? csrT('toast.lockedSkipped', { n: lockedSkip }) : csrT('toast.lockedSkippedMany', { n: lockedSkip }), 'info');
    if(!items.length){toast(csrT('toast.noRarityItems'),'warn');return;}
    modalEntries=items.map(item=>({cardEl:null,weaponId:item.weapon_id,item,status:'ok',msg:'From API'}));
    enrichQuickSellPrices(modalEntries);
    const grid=document.getElementById('csrx-mgrid'); grid.innerHTML=''; document.getElementById('csrx-mbar').style.width='0';
    document.getElementById('csrx-validator').classList.remove('show');
    document.getElementById('csrx-mwarn').classList.remove('show');
    modalEntries.forEach((entry,idx)=>{
        const{wrap,rm}=buildMC(entry); wrap.dataset.idx=idx;
        rm.addEventListener('click',()=>{wrap.remove();refreshFooter();});
        grid.appendChild(wrap);
    });
    refreshFooter();
    overlay.classList.add('open');
});

let casesCatalogCache = [];
let cachedUserCoins = null;
let casesBuyAbort = false;
let casesOpenAbort = false;
let casesOpenRunning = false;
let casesOpenSelling = false;
let casesOpenSellingDropIdx = null;
let casesOpenSessionGen = 0;
let casesOpenActiveGen = 0;
let casesSessionDrops = [];
let casesOpenStats = { opened: 0, gold: 0, lastName: '', lastRarity: null };
let casesMode = 'bulk';
const CASES_AUTO_OPEN_CFG_KEY = 'csrCasesAutoOpenConfig';
const CASES_AUTO_OPEN_SELL_CFG_KEY = 'csrCasesAutoOpenSellConfig';
let casesAutoOpenCfg = {
    delayMs: CASES_OPEN_DELAY_MIN_MS,
    spendLimit: 150000,
    minutes: 10,
    openMode: 'single',
    multiCaseIds: [],
    multiStrategy: 'cycle',
    multiCaseQuotas: {},
};
let casesAutoOpenSellCfg = {
    mode: 'manual',
    timing: 'end',
    rarities: { 1: false, 2: false, 3: false, 4: false, 5: false, 6: false, 7: false },
    batchSize: 5,
};
let _casesCfgSaveTimer = null;

function normalizeCaseEntry(c) {
    if (!c || c.id == null) return null;
    const id = parseInt(c.id, 10);
    const price = parseCoinVal(c.price);
    if (!Number.isFinite(id) || price == null) return null;
    return {
        id,
        name: c.name || `Case #${id}`,
        price,
        item_id: c.item_id != null ? parseInt(c.item_id, 10) : null,
    };
}

function getSelectedCase() {
    const sel = document.getElementById('csrx-cases-select');
    if (!sel || !sel.value) return null;
    const id = parseInt(sel.value, 10);
    return casesCatalogCache.find(c => c.id === id) || null;
}

function getCasesPickSearchQuery() {
    const inp = document.getElementById('csrx-cases-pick-search');
    return String(inp?.value ?? '').trim().toLowerCase();
}

function caseNameMatchesSearch(name, query) {
    if (!query) return true;
    return String(name ?? '').toLowerCase().includes(query);
}

function applyCasesPickSearch() {
    const query = getCasesPickSearchQuery();

    const sel = document.getElementById('csrx-cases-select');
    const selectEmpty = document.getElementById('csrx-cases-select-search-empty');
    if (sel) {
        let anyVisible = false;
        for (const opt of sel.options) {
            const dash = opt.textContent.indexOf(' — ');
            const name = dash >= 0 ? opt.textContent.slice(0, dash) : opt.textContent;
            const match = caseNameMatchesSearch(name, query);
            opt.hidden = !match;
            if (match) anyVisible = true;
        }
        if (selectEmpty) selectEmpty.hidden = !query || anyVisible;
    }

    const list = document.getElementById('csrx-cases-open-multi-list');
    const multiEmpty = document.getElementById('csrx-cases-multi-search-empty');
    if (list) {
        let anyVisible = false;
        list.querySelectorAll('.csrx-cases-multi-row').forEach((row) => {
            const id = parseInt(row.querySelector('input[data-case-id]')?.dataset.caseId, 10);
            const c = Number.isFinite(id) ? casesCatalogCache.find(x => x.id === id) : null;
            const match = caseNameMatchesSearch(c?.name, query);
            row.classList.toggle('csrx-cases-multi-row-hidden', !match);
            if (match) anyVisible = true;
        });
        if (multiEmpty) multiEmpty.hidden = !query || anyVisible;
    }
}

function clearCasesPickSearch() {
    const inp = document.getElementById('csrx-cases-pick-search');
    if (inp) inp.value = '';
    applyCasesPickSearch();
}

function populateCasesSelect() {
    const sel = document.getElementById('csrx-cases-select');
    if (!sel) return;
    const prev = sel.value;
    const sorted = [...casesCatalogCache].sort((a, b) => a.price - b.price || a.name.localeCompare(b.name));
    sel.innerHTML = sorted.map(c =>
        `<option value="${c.id}">${c.name} — ${formatCoins(c.price)}</option>`
    ).join('');
    if (prev && sorted.some(c => String(c.id) === prev)) sel.value = prev;
    populateCasesMultiList();
    applyCasesPickSearch();
}

function isCasesOpenMultiMode() {
    return casesAutoOpenCfg.openMode === 'multi';
}

function isCasesMultiQuotaMode() {
    return isCasesOpenMultiMode() && casesAutoOpenCfg.multiStrategy === 'quota';
}

function isCasesMultiCycleMode() {
    return isCasesOpenMultiMode() && casesAutoOpenCfg.multiStrategy !== 'quota';
}

function readCasesOpenModeFromUi() {
    const multiBtn = document.getElementById('csrx-cases-open-mode-multi');
    return multiBtn?.classList.contains('active') ? 'multi' : 'single';
}

function getMultiCaseQuotasFromUi() {
    const quotas = { ...(casesAutoOpenCfg.multiCaseQuotas || {}) };
    const list = document.getElementById('csrx-cases-open-multi-list');
    if (!list) return quotas;
    list.querySelectorAll('input[type="checkbox"][data-case-id]').forEach((cb) => {
        const id = parseInt(cb.dataset.caseId, 10);
        if (!Number.isFinite(id) || id <= 0) return;
        if (!cb.checked) {
            delete quotas[id];
            return;
        }
        const qtyInp = cb.closest('.csrx-cases-multi-row')?.querySelector('.csrx-cases-multi-qty');
        if (qtyInp) quotas[id] = normalizeCasesQtyInput(qtyInp);
        else if (!quotas[id]) quotas[id] = 1;
    });
    return quotas;
}

function buildQuotaOpenPlan(queue, quotas) {
    const plan = [];
    for (const c of queue) {
        const q = parseInt(quotas[c.id], 10);
        const n = Number.isFinite(q) ? Math.max(1, Math.min(99, q)) : 0;
        for (let i = 0; i < n; i++) plan.push(c);
    }
    return plan;
}

function formatMultiQuotaBreakdown(queue, quotas) {
    return queue
        .map(c => {
            const q = parseInt(quotas[c.id], 10);
            if (!Number.isFinite(q) || q < 1) return null;
            return `${q}× ${c.name}`;
        })
        .filter(Boolean)
        .join(', ');
}

function persistMultiCaseSelection() {
    const multiCaseIds = getMultiSelectedCaseIds();
    const multiCaseQuotas = getMultiCaseQuotasFromUi();
    scheduleSaveCasesAutoOpenConfig({ ...casesAutoOpenCfg, multiCaseIds, multiCaseQuotas });
}

function getMultiSelectedCaseIds() {
    const list = document.getElementById('csrx-cases-open-multi-list');
    if (!list) return [...(casesAutoOpenCfg.multiCaseIds || [])];
    const ids = [];
    list.querySelectorAll('input[type="checkbox"][data-case-id]:checked').forEach((inp) => {
        const id = parseInt(inp.dataset.caseId, 10);
        if (Number.isFinite(id) && id > 0) ids.push(id);
    });
    return ids;
}

function getCasesByIds(ids) {
    const out = [];
    for (const id of ids) {
        const c = casesCatalogCache.find(x => x.id === id);
        if (c) out.push(c);
    }
    return out;
}

function getAutoOpenCaseQueue() {
    if (isCasesOpenMultiMode()) {
        return getCasesByIds(getMultiSelectedCaseIds());
    }
    const picked = getSelectedCase();
    return picked ? [picked] : [];
}

function syncMultiStrategyUi() {
    const cycleBtn = document.getElementById('csrx-cases-multi-strategy-cycle');
    const quotaBtn = document.getElementById('csrx-cases-multi-strategy-quota');
    const quota = isCasesMultiQuotaMode();
    if (cycleBtn) cycleBtn.classList.toggle('active', !quota);
    if (quotaBtn) quotaBtn.classList.toggle('active', quota);
}

function setCasesMultiStrategy(strategy) {
    if (strategy !== 'cycle' && strategy !== 'quota') return;
    casesAutoOpenCfg = { ...casesAutoOpenCfg, multiStrategy: strategy };
    scheduleSaveCasesAutoOpenConfig(casesAutoOpenCfg);
    syncMultiStrategyUi();
    populateCasesMultiList();
    syncCasesOpenSubModeUi();
    updateCasesAutoOpenSummary();
}

async function refreshCasesAutoOpenFromStorage() {
    const cfg = await loadCasesAutoOpenConfig();
    const delayInp = document.getElementById('csrx-cases-open-delay');
    const minsInp = document.getElementById('csrx-cases-open-mins');
    const spendInp = document.getElementById('csrx-cases-open-spend');
    if (delayInp) delayInp.value = String(cfg.delayMs ?? CASES_OPEN_DELAY_MIN_MS);
    if (minsInp) minsInp.value = String(cfg.minutes ?? 10);
    if (spendInp) spendInp.value = String(cfg.spendLimit ?? 150000);
    populateCasesMultiList();
    syncMultiStrategyUi();
    syncCasesOpenSubModeUi();
    updateCasesAutoOpenSummary();
}

function populateCasesMultiList() {
    const list = document.getElementById('csrx-cases-open-multi-list');
    if (!list) return;
    const selected = new Set(casesAutoOpenCfg.multiCaseIds || []);
    const quotas = casesAutoOpenCfg.multiCaseQuotas || {};
    const quotaMode = isCasesMultiQuotaMode();
    const sorted = [...casesCatalogCache].sort((a, b) => a.price - b.price || a.name.localeCompare(b.name));
    const pickLabel = document.querySelector('label[for="csrx-cases-open-multi-list"], #csrx-cases-open-multi-wrap > label');
    const multiLabel = document.getElementById('csrx-cases-multi-pick-label');
    if (multiLabel) {
        multiLabel.textContent = csrT(quotaMode ? 'cases.multiCasePickQuota' : 'cases.multiCasePick');
    }
    list.innerHTML = sorted.map(c => {
        const checked = selected.has(c.id);
        const q = quotas[c.id] ?? quotas[String(c.id)] ?? 1;
        const qtyField = quotaMode
            ? `<input type="text" class="csrx-cases-multi-qty" inputmode="numeric" autocomplete="off" spellcheck="false" value="${q}"${checked ? '' : ' disabled'}>`
            : '';
        return `
        <label class="csrx-cases-multi-row">
            <input type="checkbox" data-case-id="${c.id}"${checked ? ' checked' : ''}>
            <span>${escapeCasesHtml(c.name)} <em>${formatCoins(c.price)}</em></span>
            ${qtyField}
        </label>`;
    }).join('');
    applyCasesPickSearch();
}

function syncCasesOpenSubModeUi() {
    const multi = isCasesOpenMultiMode();
    const selectWrap = document.getElementById('csrx-cases-select-wrap');
    const multiWrap = document.getElementById('csrx-cases-open-multi-wrap');
    const modeWrap = document.getElementById('csrx-cases-open-mode-wrap');
    const btnSingle = document.getElementById('csrx-cases-open-mode-single');
    const btnMulti = document.getElementById('csrx-cases-open-mode-multi');

    if (modeWrap) modeWrap.style.display = casesMode === 'open' ? 'block' : 'none';
    if (btnSingle) btnSingle.classList.toggle('active', !multi);
    if (btnMulti) btnMulti.classList.toggle('active', multi);

    if (casesMode === 'open') {
        if (selectWrap) selectWrap.style.display = multi ? 'none' : 'block';
        if (multiWrap) multiWrap.style.display = multi ? 'flex' : 'none';
    } else {
        if (selectWrap) selectWrap.style.display = 'block';
        if (multiWrap) multiWrap.style.display = 'none';
    }

    const spendWrap = document.getElementById('csrx-cases-open-spend')?.parentElement;
    if (spendWrap) {
        spendWrap.style.display = (casesMode === 'open' && multi && isCasesMultiQuotaMode()) ? 'none' : 'block';
    }

    syncMultiStrategyUi();
}

function normalizeCasesQtyInput(inp) {
    if (!inp) return 1;
    const raw = String(inp.value ?? '').trim();
    const n = parseInt(raw, 10);
    const qty = Number.isFinite(n) ? Math.max(1, Math.min(99, n)) : 1;
    inp.value = String(qty);
    return qty;
}

function readCasesQtyInput(inp) {
    const raw = String(inp?.value ?? '').trim();
    if (!raw) return { qty: null, valid: false, empty: true };
    const n = parseInt(raw, 10);
    if (!Number.isFinite(n) || n < 1 || n > 99) return { qty: n, valid: false, empty: false };
    return { qty: n, valid: true, empty: false };
}

function updateCasesCostSummary() {
    const summary = document.getElementById('csrx-cases-summary');
    const btn = document.getElementById('csrx-cases-buy');
    if (!summary) return;
    const qtyInp = document.getElementById('csrx-cases-qty');
    const q = readCasesQtyInput(qtyInp);
    const picked = getSelectedCase();
    if (!picked) {
        summary.innerHTML = csrT('cases.selectCaseCost');
        if (btn) btn.disabled = true;
        return;
    }
    const coinsLine = cachedUserCoins != null
        ? `${csrT('cases.yourCoins', { coins: `<strong>${formatCoins(cachedUserCoins)}</strong>` })}<br>`
        : '';

    if (q.empty) {
        summary.innerHTML = `${coinsLine}${csrT('cases.enterQty')}`;
        if (btn) btn.disabled = true;
        return;
    }
    if (!q.valid) {
        summary.innerHTML = `${coinsLine}<span style="color:#ef4444">${csrT('cases.qtyInvalid')}</span>`;
        if (btn) btn.disabled = true;
        return;
    }

    const total = picked.price * q.qty;
    const afford = cachedUserCoins != null && cachedUserCoins < total
        ? `<br><span style="color:#ef4444">${csrT('cases.notEnoughCoins')}</span>`
        : '';
    summary.innerHTML = `${coinsLine}${csrT('cases.total', { total: `<strong>${formatCoins(total)}</strong>`, qty: q.qty, unit: formatCoins(picked.price) })}${afford}`;
    if (btn) btn.disabled = cachedUserCoins != null && cachedUserCoins < total;
}

async function fetchCasesCatalog() {
    try {
        const r = await _nativeFetch(CASES_API_URL, { credentials: 'include' });
        if (!r.ok) throw new Error(`Cases list failed (${r.status})`);
        const data = await r.json();
        const arr = Array.isArray(data) ? data : (data.cases || data.data || []);
        casesCatalogCache = arr.map(normalizeCaseEntry).filter(Boolean);
        populateCasesSelect();
        updateCasesCostSummary();
        return casesCatalogCache;
    } catch (e) {
        toast(e.message || csrT('toast.casesLoadFailed'), 'error');
        return casesCatalogCache;
    }
}

async function fetchUserCoins() {
    try {
        const r = await _nativeFetch('https://api.csrestored.fun/users/@me', { credentials: 'include' });
        if (!r.ok) return cachedUserCoins;
        const data = await r.json();
        const coins = parseCoinVal(data.coins ?? data.coin_balance ?? data.balance);
        if (coins != null) cachedUserCoins = coins;
        updateCasesCostSummary();
        return cachedUserCoins;
    } catch (_) {
        return cachedUserCoins;
    }
}

function scrapeCoinsFromPage() {
    const text = document.body?.innerText || '';
    const m = text.match(/Your coins[:\s]*([\d,]+)/i) || text.match(/coins[:\s]*([\d,]+)/i);
    if (m) {
        const c = parseCoinVal(m[1]);
        if (c != null) cachedUserCoins = c;
    }
}

async function buyCaseOnce(caseId) {
    const r = await _nativeFetch(CASES_BUY_URL(caseId), {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
    });
    let data = null;
    try { data = await r.json(); } catch (_) {}
    if (!r.ok) {
        const msg = data?.message || data?.detail || `Buy failed (${r.status})`;
        throw new Error(typeof msg === 'string' ? msg : JSON.stringify(msg));
    }
    if (data && typeof data === 'object') {
        const coins = parseCoinVal(data.coins ?? data.coin_balance ?? data.balance);
        if (coins != null) cachedUserCoins = coins;
    }
    return data;
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function rarityStyle(r) {
    const n = parseInt(r, 10);
    if (!Number.isFinite(n)) return 'color:#e5e7eb';
    const hex = RARITY[n]?.hex;
    return hex ? `color:${hex};font-weight:700` : 'color:#e5e7eb';
}

async function csrPrefsRead(keys) {
    if (typeof csrPrefsGet === 'function') return csrPrefsGet(keys);
    return {};
}

async function csrPrefsWrite(obj) {
    if (typeof csrPrefsSet === 'function') return csrPrefsSet(obj);
}

function clampCasesOpenDelayMs(ms) {
    const n = parseInt(ms, 10);
    if (!Number.isFinite(n)) return CASES_OPEN_DELAY_MIN_MS;
    return Math.max(CASES_OPEN_DELAY_MIN_MS, Math.min(5000, n));
}

function normalizeCasesAutoCfg(raw) {
    const out = {
        delayMs: CASES_OPEN_DELAY_MIN_MS,
        spendLimit: 150000,
        minutes: 10,
        openMode: 'single',
        multiCaseIds: [],
        multiStrategy: 'cycle',
        multiCaseQuotas: {},
    };
    if (!raw || typeof raw !== 'object') return out;
    const d = parseInt(raw.delayMs, 10);
    const s = parseInt(raw.spendLimit, 10);
    const m = parseInt(raw.minutes, 10);
    if (Number.isFinite(d)) out.delayMs = clampCasesOpenDelayMs(d);
    if (Number.isFinite(s)) out.spendLimit = Math.max(0, Math.min(999999999, s));
    if (Number.isFinite(m)) out.minutes = Math.max(1, Math.min(120, m));
    if (raw.openMode === 'single' || raw.openMode === 'multi') out.openMode = raw.openMode;
    if (Array.isArray(raw.multiCaseIds)) {
        const ids = [];
        for (const id of raw.multiCaseIds) {
            const n = parseInt(id, 10);
            if (Number.isFinite(n) && n > 0 && !ids.includes(n)) ids.push(n);
            if (ids.length >= 32) break;
        }
        out.multiCaseIds = ids;
    }
    if (raw.multiStrategy === 'quota' || raw.multiStrategy === 'cycle') out.multiStrategy = raw.multiStrategy;
    if (raw.multiCaseQuotas && typeof raw.multiCaseQuotas === 'object') {
        const quotas = {};
        for (const [k, v] of Object.entries(raw.multiCaseQuotas)) {
            const id = parseInt(k, 10);
            const q = parseInt(v, 10);
            if (Number.isFinite(id) && id > 0 && Number.isFinite(q)) {
                quotas[id] = Math.max(1, Math.min(99, q));
            }
        }
        out.multiCaseQuotas = quotas;
    }
    return out;
}

function normalizeCasesAutoSellCfg(raw) {
    const out = {
        mode: 'manual',
        timing: 'end',
        rarities: { 1: false, 2: false, 3: false, 4: false, 5: false, 6: false, 7: false },
        batchSize: 5,
    };
    if (!raw || typeof raw !== 'object') return out;
    if (raw.mode === 'manual' || raw.mode === 'nonGold' || raw.mode === 'rarities') out.mode = raw.mode;
    if (raw.timing === 'each' || raw.timing === 'end') out.timing = raw.timing;
    const bs = parseInt(raw.batchSize, 10);
    if (Number.isFinite(bs)) out.batchSize = Math.max(1, Math.min(20, bs));
    if (raw.rarities && typeof raw.rarities === 'object') {
        for (let i = 1; i <= 7; i++) {
            if (typeof raw.rarities[i] === 'boolean') out.rarities[i] = raw.rarities[i];
            if (typeof raw.rarities[String(i)] === 'boolean') out.rarities[i] = raw.rarities[String(i)];
        }
    }
    return out;
}

async function loadCasesAutoOpenSellConfig() {
    try {
        const data = await csrPrefsRead([CASES_AUTO_OPEN_SELL_CFG_KEY]);
        const cfg = normalizeCasesAutoSellCfg(data?.[CASES_AUTO_OPEN_SELL_CFG_KEY]);
        casesAutoOpenSellCfg = cfg;
        syncCasesAutoSellBatchInput();
        updateCasesAutoOpenSummary();
        return cfg;
    } catch (_) {
        return casesAutoOpenSellCfg;
    }
}

function syncCasesAutoSellBatchInput() {
    const inp = document.getElementById('csrx-cases-open-sell-spd');
    if (inp && casesAutoOpenSellCfg.batchSize) inp.value = String(casesAutoOpenSellCfg.batchSize);
}

function isCasesAutoSellEnabled() {
    return casesAutoOpenSellCfg.mode !== 'manual';
}

function casesDropMatchesAutoSellRules(d) {
    if (!isCasesAutoSellEnabled()) return false;
    if (isCasesDropGold(d.name)) return false;
    if (casesAutoOpenSellCfg.mode === 'nonGold') return true;
    if (casesAutoOpenSellCfg.mode === 'rarities') {
        const r = parseInt(d.rarity, 10);
        return casesAutoOpenSellCfg.rarities[r] === true;
    }
    return false;
}

function describeAutoSellRules() {
    if (!isCasesAutoSellEnabled()) return csrT('cases.autoSell.manual');
    let rule = csrT('cases.autoSell.rarities');
    if (casesAutoOpenSellCfg.mode === 'nonGold') rule = csrT('cases.autoSell.nonGold');
    const when = casesAutoOpenSellCfg.timing === 'each'
        ? csrT('cases.autoSell.whenEach')
        : csrT('cases.autoSell.whenEnd');
    return `${rule} · ${when}`;
}

function csrApplyContentI18n() {
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.dataset.i18n;
        if (key) el.textContent = csrT(key);
    });

    const fab = document.getElementById('csrx-fab');
    if (fab) fab.title = csrT('qs.fabTitle');
    const casesFab = document.getElementById('csrx-cases-fab');
    if (casesFab) casesFab.title = csrT('cases.fabTitle');

    const stat = document.getElementById('csrx-stat');
    if (stat && !selMode && !selling) stat.textContent = csrT('qs.status.ready');

    const browseSearch = document.getElementById('csrx-browse-search');
    if (browseSearch) browseSearch.placeholder = csrT('browse.searchPlaceholder');
    const casesPickSearch = document.getElementById('csrx-cases-pick-search');
    if (casesPickSearch) casesPickSearch.placeholder = csrT('cases.searchPlaceholder');
    const browseClear = document.getElementById('csrx-browse-clear');
    if (browseClear) browseClear.textContent = csrT('browse.clear');

    const rarSel = document.getElementById('csrx-cases-open-sell-rar');
    if (rarSel) {
        const val = rarSel.value;
        rarSel.innerHTML = rarityEntries().map(([k, v]) =>
            `<option value="${k}">${v.name}</option>`
        ).join('');
        if (val) rarSel.value = val;
    }

    const qsRar = document.getElementById('csrx-rar');
    if (qsRar) {
        const val = qsRar.value;
        qsRar.innerHTML = rarityEntries().map(([k, v]) =>
            `<option value="${k}">${v.name}</option>`
        ).join('');
        if (val) qsRar.value = val;
    }

    updateCasesOpenSellUi();
    updateCasesCostSummary();
    updateCasesAutoOpenSummary();
    applyBrowseFilters();
    if (browseToolsActive) initBrowseTools();
    refreshCasesOpenStatsUi();

    if (overlay?.classList.contains('open')) refreshFooter();
    if (selMode) updateSelBtn();

    const modBtn = document.getElementById('csrx-modbtn');
    if (modBtn && !selMode) {
        modBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
                    <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/>
                    <polyline points="10 17 15 12 10 7"/>
                    <line x1="15" y1="12" x2="3" y2="12"/>
                </svg> ${csrT('qs.startPicking')}`;
    }
    const massBtn = document.getElementById('csrx-massbtn');
    if (massBtn) {
        massBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
                    <polyline points="3 6 5 6 21 6"/>
                    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                    <path d="M10 11v6"/><path d="M14 11v6"/>
                </svg> ${csrT('qs.sellByRarity')}`;
    }
}

async function tryAutoSellSessionDrop(drop) {
    if (!casesDropMatchesAutoSellRules(drop)) return false;
    if (!drop.weaponId) await resolveSessionDropWeaponIds([drop]);
    if (!drop.weaponId || drop.sold) return false;
    if (csrIsItemSellBlocked({ weapon_id: drop.weaponId })) return false;
    const ok = await apiSell(drop.weaponId);
    if (ok) {
        drop.sold = true;
        await fetchUserCoins();
        scrapeCoinsFromPage();
        updateCasesAutoOpenSummary();
        updateCasesCostSummary();
        return true;
    }
    return false;
}

async function loadCasesAutoOpenConfig() {
    try {
        const data = await csrPrefsRead([CASES_AUTO_OPEN_CFG_KEY]);
        const cfg = normalizeCasesAutoCfg(data?.[CASES_AUTO_OPEN_CFG_KEY]);
        casesAutoOpenCfg = cfg;
        return cfg;
    } catch (_) {
        return casesAutoOpenCfg;
    }
}

function scheduleSaveCasesAutoOpenConfig(cfg) {
    casesAutoOpenCfg = normalizeCasesAutoCfg(cfg);
    clearTimeout(_casesCfgSaveTimer);
    _casesCfgSaveTimer = setTimeout(async () => {
        await csrPrefsWrite({ [CASES_AUTO_OPEN_CFG_KEY]: casesAutoOpenCfg });
    }, 250);
}

async function runCasesBulkBuy() {
    const picked = getSelectedCase();
    const qtyInp = document.getElementById('csrx-cases-qty');
    const qty = normalizeCasesQtyInput(qtyInp);
    if (!picked) {
        toast(csrT('toast.selectCase'), 'warn');
        return;
    }
    const total = picked.price * qty;
    if (cachedUserCoins != null && cachedUserCoins < total) {
        toast(csrT('toast.notEnoughCoins'), 'error');
        return;
    }
    if (!confirm(csrT('cases.confirmBuy', {
        qty,
        name: picked.name,
        total: formatCoins(total),
    }))) {
        return;
    }

    const btn = document.getElementById('csrx-cases-buy');
    const cancelBtn = document.getElementById('csrx-cases-cancel');
    const prog = document.getElementById('csrx-cases-progress');
    const bar = document.getElementById('csrx-cases-progress-bar');
    casesBuyAbort = false;
    if (btn) btn.disabled = true;
    if (cancelBtn) cancelBtn.style.display = 'block';
    if (prog) prog.style.display = 'block';

    let ok = 0;
    let fail = 0;
    let lastErr = '';

    for (let i = 0; i < qty; i++) {
        if (casesBuyAbort) break;
        if (bar) bar.style.width = `${Math.round(((i) / qty) * 100)}%`;
        try {
            await buyCaseOnce(picked.id);
            ok++;
            if (cachedUserCoins != null) cachedUserCoins = Math.max(0, cachedUserCoins - picked.price);
            updateCasesCostSummary();
        } catch (e) {
            fail++;
            lastErr = e.message || csrT('toast.unknownError');
            break;
        }
        if (i < qty - 1) await sleep(400);
    }

    if (bar) bar.style.width = '100%';
    if (btn) btn.disabled = false;
    if (cancelBtn) cancelBtn.style.display = 'none';
    setTimeout(() => { if (prog) prog.style.display = 'none'; if (bar) bar.style.width = '0%'; }, 800);

    await fetchUserCoins();
    scrapeCoinsFromPage();

    if (casesBuyAbort) {
        toast(csrT('toast.stoppedBuy', { ok, skipped: qty - ok - fail }), 'warn');
    } else if (fail) {
        toast(lastErr || csrT('toast.buyFailed', { ok }), 'error');
    } else {
        toast(csrT('toast.bought', { n: ok, name: picked.name }), 'success');
    }
}

let casesWinOpen = false;

function resetCasesWinPosition(win) {
    if (!win) return;
    win.style.left = '';
    win.style.top = '';
    win.style.right = '24px';
    win.style.bottom = '24px';
}

function syncCasesPanelVisibility() {
    const on = isCasesListPage() && (csrIsFeatureEnabled('caseBulkBuy') || csrIsFeatureEnabled('caseAutoOpen'));
    const fab = document.getElementById('csrx-cases-fab');
    const win = document.getElementById('csrx-cases-win');
    if (!fab || !win) return;

    fab.classList.toggle('csrx-feature-off', !on);
    win.classList.toggle('csrx-feature-off', !on);

    if (!on) {
        fab.style.display = 'none';
        win.classList.remove('open');
        casesWinOpen = false;
        casesBuyAbort = true;
        casesOpenAbort = true;
        return;
    }

    fab.style.display = casesWinOpen ? 'none' : 'flex';
    win.classList.toggle('open', casesWinOpen);
    if (on && !casesCatalogCache.length) {
        fetchCasesCatalog();
        fetchUserCoins();
        scrapeCoinsFromPage();
    }
}

function syncCasesModeUi() {
    const bulkOn = csrIsFeatureEnabled('caseBulkBuy');
    const openOn = csrIsFeatureEnabled('caseAutoOpen');

    const tabs = document.getElementById('csrx-cases-tabs');
    const tabBulk = document.getElementById('csrx-cases-tab-bulk');
    const tabOpen = document.getElementById('csrx-cases-tab-open');
    const bulkBody = document.getElementById('csrx-cases-bulk');
    const openBody = document.getElementById('csrx-cases-open');

    if (tabs) tabs.style.display = bulkOn && openOn ? 'flex' : 'none';
    if (tabBulk) tabBulk.style.display = bulkOn ? '' : 'none';
    if (tabOpen) tabOpen.style.display = openOn ? '' : 'none';

    if (bulkOn && !openOn) casesMode = 'bulk';
    if (openOn && !bulkOn) casesMode = 'open';
    if (!bulkOn && !openOn) casesMode = 'bulk';

    if (tabBulk) tabBulk.classList.toggle('active', casesMode === 'bulk');
    if (tabOpen) tabOpen.classList.toggle('active', casesMode === 'open');

    if (bulkBody) bulkBody.style.display = casesMode === 'bulk' ? 'flex' : 'none';
    if (openBody) openBody.style.display = casesMode === 'open' ? 'flex' : 'none';

    syncCasesOpenSubModeUi();
    updateCasesCostSummary();
    updateCasesAutoOpenSummary();
}

function readInt(inp, fallback) {
    const raw = String(inp?.value ?? '').replace(/[^\d]/g, '').trim();
    const n = parseInt(raw, 10);
    return Number.isFinite(n) ? n : fallback;
}

/** Mirrors multi auto-open loop — spend, coins, and time cap (cycle mode). */
function estimateMultiAutoOpens(queue, spendLimit, coins, minutes, delayMs) {
    if (!queue.length || spendLimit <= 0) return 0;

    let totalSpent = 0;
    let balance = coins;
    let multiIdx = 0;
    let opens = 0;

    for (let guard = 0; guard < 50000; guard++) {
        const spendLeft = spendLimit - totalSpent;
        const next = pickNextMultiCase(queue, multiIdx, spendLeft, balance);
        if (!next) break;
        multiIdx = next.nextIdx;
        totalSpent += next.picked.price;
        if (balance != null) balance = Math.max(0, balance - next.picked.price);
        opens++;
    }

    const runMs = Math.max(1, minutes) * 60 * 1000;
    const maxByTime = delayMs > 0 ? Math.floor(runMs / delayMs) + 1 : opens;
    return Math.min(opens, maxByTime);
}

function getEffectiveQuotaPlan(queue, quotas, coins, minutes, delayMs) {
    let plan = buildQuotaOpenPlan(queue, quotas);
    if (!plan.length) return [];
    if (coins != null) {
        let bal = coins;
        plan = plan.filter((c) => {
            if (c.price > bal) return false;
            bal -= c.price;
            return true;
        });
    }
    const runMs = Math.max(1, minutes) * 60 * 1000;
    const maxByTime = delayMs > 0 ? Math.floor(runMs / delayMs) + 1 : plan.length;
    if (plan.length > maxByTime) plan = plan.slice(0, maxByTime);
    return plan;
}

function estimateQuotaAutoOpens(queue, quotas, coins, minutes, delayMs) {
    return getEffectiveQuotaPlan(queue, quotas, coins, minutes, delayMs).length;
}

function updateCasesAutoOpenSummary() {
    const sum = document.getElementById('csrx-cases-open-summary');
    const btnStart = document.getElementById('csrx-cases-open-start');
    if (!sum) return;

    const delayMs = clampCasesOpenDelayMs(readInt(document.getElementById('csrx-cases-open-delay'), casesAutoOpenCfg.delayMs));
    const spendLimit = Math.max(0, readInt(document.getElementById('csrx-cases-open-spend'), casesAutoOpenCfg.spendLimit));
    const minutes = Math.max(1, Math.min(120, readInt(document.getElementById('csrx-cases-open-mins'), casesAutoOpenCfg.minutes)));
    const coinsLine = cachedUserCoins != null
        ? `${csrT('cases.yourCoins', { coins: `<strong>${formatCoins(cachedUserCoins)}</strong>` })}<br>`
        : '';

    if (isCasesOpenMultiMode()) {
        const queue = getAutoOpenCaseQueue();
        if (!queue.length) {
            sum.innerHTML = csrT('cases.selectMultiCases');
            if (btnStart) btnStart.disabled = true;
            return;
        }

        if (isCasesMultiQuotaMode()) {
            const quotas = getMultiCaseQuotasFromUi();
            const rawPlan = buildQuotaOpenPlan(queue, quotas);
            const plan = getEffectiveQuotaPlan(queue, quotas, cachedUserCoins, minutes, delayMs);
            const totalCost = plan.reduce((s, c) => s + c.price, 0);
            const totalOpens = plan.length;
            const breakdown = formatMultiQuotaBreakdown(queue, quotas);
            const canStart = rawPlan.length > 0 && totalOpens > 0;
            const warn = !canStart
                ? `<br><span style="color:#ef4444">${csrT(rawPlan.length ? 'cases.quotaTooExpensive' : 'cases.quotaEmpty')}</span>`
                : '';
            const opensKey = totalOpens === 1 ? 'cases.willOpenQuotaOne' : 'cases.willOpenQuotaMany';
            sum.innerHTML = `${coinsLine}${csrT(opensKey, {
                breakdown: `<span style="color:#d4d4d4">${escapeCasesHtml(breakdown)}</span>`,
                opens: `<strong>${totalOpens}</strong>`,
                cost: `<strong>${formatCoins(totalCost)}</strong>`,
                delay: `<strong>${delayMs}ms</strong>`,
                minutes: `<strong>${minutes}</strong>`,
            })}${warn}<br><span style="color:#737373">${csrT('cases.autoSell', { rules: describeAutoSellRules() })}</span>`;
            if (btnStart) btnStart.disabled = casesOpenRunning || !canStart;
            return;
        }

        const minPrice = Math.min(...queue.map(c => c.price));
        const totalOpens = estimateMultiAutoOpens(queue, spendLimit, cachedUserCoins, minutes, delayMs);
        const canStart = minPrice > 0 && minPrice <= spendLimit
            && (cachedUserCoins == null || minPrice <= cachedUserCoins)
            && totalOpens > 0;
        const warn = !canStart
            ? `<br><span style="color:#ef4444">${csrT('cases.spendTooLow')}</span>`
            : '';
        const names = queue.map(c => escapeCasesHtml(c.name)).join(', ');
        const opensKey = totalOpens === 1 ? 'cases.willOpenMultiOne' : 'cases.willOpenMultiMany';
        sum.innerHTML = `${coinsLine}${csrT(opensKey, {
            types: `<strong>${queue.length}</strong>`,
            opens: `<strong>${totalOpens}</strong>`,
            names: `<span style="color:#d4d4d4">${names}</span>`,
            delay: `<strong>${delayMs}ms</strong>`,
            minutes: `<strong>${minutes}</strong>`,
        })}${warn}<br><span style="color:#737373">${csrT('cases.autoSell', { rules: describeAutoSellRules() })}</span>`;
        if (btnStart) btnStart.disabled = casesOpenRunning || !canStart;
        return;
    }

    const picked = getSelectedCase();
    if (!picked) {
        sum.innerHTML = csrT('cases.selectCaseOpen');
        if (btnStart) btnStart.disabled = true;
        return;
    }

    const maxBySpend = picked.price > 0 ? Math.floor(spendLimit / picked.price) : 0;
    const maxByCoins = (cachedUserCoins != null && picked.price > 0) ? Math.floor(cachedUserCoins / picked.price) : null;
    const maxCases = maxByCoins == null ? maxBySpend : Math.min(maxBySpend, maxByCoins);

    const warn = maxCases <= 0
        ? `<br><span style="color:#ef4444">${csrT('cases.spendTooLow')}</span>`
        : '';

    const openLine = maxCases === 1
        ? csrT('cases.willOpen', {
            n: `<strong>${maxCases}</strong>`,
            delay: `<strong>${delayMs}ms</strong>`,
            minutes: `<strong>${minutes}</strong>`,
        })
        : csrT('cases.willOpenMany', {
            n: `<strong>${maxCases}</strong>`,
            delay: `<strong>${delayMs}ms</strong>`,
            minutes: `<strong>${minutes}</strong>`,
        });

    sum.innerHTML = `${coinsLine}${openLine}${warn}<br><span style="color:#737373">${csrT('cases.autoSell', { rules: describeAutoSellRules() })}</span>`;
    if (btnStart) btnStart.disabled = casesOpenRunning || maxCases <= 0;
}

async function openCaseOnce(caseId) {
    const r = await _nativeFetch(CASES_OPEN_URL(caseId), {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
    });
    let data = null;
    try { data = await r.json(); } catch (_) {}
    if (!r.ok) {
        const msg = data?.message || data?.detail || `Open failed (${r.status})`;
        throw new Error(typeof msg === 'string' ? msg : JSON.stringify(msg));
    }
    if (data && typeof data === 'object') {
        const coins = parseCoinVal(data.coins ?? data.coin_balance ?? data.balance);
        if (coins != null) cachedUserCoins = coins;
    }
    return data;
}

function appendCasesOpenLog(htmlLine) {
    const log = document.getElementById('csrx-cases-open-log');
    if (!log) return;
    const line = document.createElement('div');
    line.className = 'csrx-cases-log-line';
    line.innerHTML = htmlLine;
    log.prepend(line);
    while (log.childElementCount > 60) log.lastElementChild?.remove();
}

function escapeCasesHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function extractFloatFromOpenData(data) {
    if (!data || typeof data !== 'object') return null;
    const tryVal = (v) => {
        if (v == null || v === '') return null;
        const f = parseFloat(v);
        return Number.isFinite(f) && f >= 0 && f <= 1 ? f : null;
    };
    for (const k of ['float', 'skin_float', 'wear', 'item_float', 'paint_wear']) {
        const f = tryVal(data[k]);
        if (f != null) return f;
    }
    for (const k of ['item', 'weapon', 'skin', 'data']) {
        if (data[k] && typeof data[k] === 'object') {
            const nested = extractFloatFromOpenData(data[k]);
            if (nested != null) return nested;
        }
    }
    return null;
}

function extractWeaponIdFromOpenData(data) {
    if (!data || typeof data !== 'object') return null;
    const tryVal = (v) => {
        if (v == null || v === '') return null;
        const n = parseInt(v, 10);
        return Number.isFinite(n) && n > 0 ? n : null;
    };
    for (const k of ['weapon_id', 'weaponId', 'skin_id', 'skinId']) {
        const w = tryVal(data[k]);
        if (w != null) return w;
    }
    for (const k of ['item', 'weapon', 'skin', 'data']) {
        if (data[k] && typeof data[k] === 'object') {
            const nested = extractWeaponIdFromOpenData(data[k]);
            if (nested != null) return nested;
        }
    }
    return null;
}

function isCasesDropGold(name) {
    return String(name || '').includes('★');
}

async function resolveSessionDropWeaponIds(drops, options = {}) {
    const retries = Math.max(1, options.retries ?? 4);
    const delayMs = options.delayMs ?? 400;

    for (let attempt = 0; attempt < retries; attempt++) {
        const need = drops.filter(d => !d.weaponId && !d.sold);
        if (!need.length) return drops;

        const inv = await apiInv();
        const used = new Set(drops.filter(d => d.weaponId).map(d => d.weaponId));
        for (const d of need) {
            const cands = inv.filter(i => {
                if (used.has(i.weapon_id)) return false;
                if (String(i.name || '') !== String(d.name || '')) return false;
                if (d.rarity != null && parseInt(i.rarity, 10) !== parseInt(d.rarity, 10)) return false;
                if (d.float != null && i.float != null) {
                    return Math.abs(parseFloat(i.float) - d.float) < 0.00001;
                }
                return d.float == null;
            });
            if (cands.length === 1 && cands[0]?.weapon_id != null) {
                d.weaponId = parseInt(cands[0].weapon_id, 10);
                used.add(d.weaponId);
            }
        }

        if (!drops.some(d => !d.weaponId && !d.sold)) return drops;
        if (attempt < retries - 1) await sleep(delayMs);
    }
    return drops;
}

function isCasesSessionActive(gen) {
    return gen === casesOpenActiveGen && !casesOpenAbort;
}

function isCasesOpenBusy() {
    return casesOpenRunning || casesOpenSelling;
}

async function persistCasesAutoOpenSellConfig() {
    casesAutoOpenSellCfg.batchSize = getCasesSessionSellBatchSize();
    await csrPrefsWrite({ [CASES_AUTO_OPEN_SELL_CFG_KEY]: casesAutoOpenSellCfg });
}

function getCasesSessionSellBatchSize() {
    const inp = document.getElementById('csrx-cases-open-sell-spd');
    const n = parseInt(String(inp?.value ?? '').trim(), 10);
    if (Number.isFinite(n)) return Math.max(1, Math.min(20, n));
    return casesAutoOpenSellCfg.batchSize || 5;
}

function getSellableSessionDrops(filterFn) {
    return casesSessionDrops.filter(d => {
        if (!d.weaponId || d.sold) return false;
        if (csrIsItemSellBlocked({ weapon_id: d.weaponId })) return false;
        return filterFn(d);
    });
}

function updateCasesOpenSellUi() {
    const wrap = document.getElementById('csrx-cases-open-sell-wrap');
    const manualBox = document.getElementById('csrx-cases-open-sell-manual');
    const hint = document.getElementById('csrx-cases-open-sell-hint');
    const btnRarity = document.getElementById('csrx-cases-open-sell-rarity');
    const btnNonGold = document.getElementById('csrx-cases-open-sell-nongold');
    const sel = document.getElementById('csrx-cases-open-sell-rar');
    if (!wrap) return;

    const remaining = casesSessionDrops.filter(d => !d.sold);
    if (!remaining.length) {
        wrap.style.display = 'none';
        return;
    }

    wrap.style.display = 'flex';
    if (manualBox) manualBox.style.display = isCasesAutoSellEnabled() ? 'none' : 'flex';

    const nonGold = getSellableSessionDrops(d => !isCasesDropGold(d.name));
    const rarVal = sel ? parseInt(sel.value, 10) : 1;
    const byRarity = getSellableSessionDrops(d => parseInt(d.rarity, 10) === rarVal);
    const unresolved = remaining.filter(d => !d.weaponId).length;

    if (hint) {
        const parts = [csrT('cases.sellHintSession', { n: remaining.length })];
        if (unresolved) parts.push(csrT('cases.sellHintNoId', { n: unresolved }));
        hint.textContent = parts.join(' · ');
    }
    if (btnRarity) {
        btnRarity.disabled = casesOpenSelling || casesOpenRunning || !byRarity.length;
        const rarEntry = rarityEntries().find(([k]) => parseInt(k, 10) === rarVal);
        const rarName = rarEntry ? rarEntry[1].name : `Rarity ${rarVal}`;
        btnRarity.textContent = byRarity.length
            ? csrT('cases.quickSellRarityN', { n: byRarity.length, rarity: rarName })
            : csrT('cases.quickSellRarity');
    }
    if (btnNonGold) {
        btnNonGold.disabled = casesOpenSelling || casesOpenRunning || !nonGold.length;
        btnNonGold.textContent = nonGold.length
            ? csrT('cases.quickSellNonGoldN', { n: nonGold.length })
            : csrT('cases.quickSellNonGold');
    }
}

function clearCasesOpenResults() {
    const box = document.getElementById('csrx-cases-open-results');
    const body = document.getElementById('csrx-cases-open-results-body');
    const sellWrap = document.getElementById('csrx-cases-open-sell-wrap');
    if (body) body.innerHTML = '';
    if (box) box.style.display = 'none';
    if (sellWrap) sellWrap.style.display = 'none';
    casesSessionDrops = [];
}

function getSessionDropSellDisabledReason(drop, dropIdx) {
    if (!drop || drop.sold) return 'sold';
    if (casesOpenRunning) return 'busy';
    if (casesOpenSelling) {
        if (casesOpenSellingDropIdx == null) return 'busy';
        if (casesOpenSellingDropIdx === dropIdx) return 'busy';
    }
    if (drop.weaponId && csrIsItemSellBlocked({ weapon_id: drop.weaponId })) return 'locked';
    return null;
}

async function sellOneSessionDrop(dropIndex) {
    if (casesOpenRunning) return;
    if (casesOpenSelling && casesOpenSellingDropIdx == null) return;
    const drop = casesSessionDrops[dropIndex];
    if (!drop || drop.sold) return;

    const blockBefore = getSessionDropSellDisabledReason(drop, dropIndex);
    if (blockBefore === 'locked') {
        toast(csrT('toast.skinLocked'), 'warn');
        return;
    }
    if (blockBefore) return;

    if (!drop.weaponId) await resolveSessionDropWeaponIds([drop], { retries: 3, delayMs: 300 });
    if (!drop.weaponId) {
        toast(csrT('cases.sellItemNoId'), 'warn');
        return;
    }
    if (csrIsItemSellBlocked({ weapon_id: drop.weaponId })) {
        toast(csrT('toast.skinLocked'), 'warn');
        renderCasesOpenResults(casesSessionDrops);
        return;
    }

    if (!confirm(csrT('cases.confirmSellOneItem', { name: drop.name }))) return;

    casesOpenSelling = true;
    casesOpenSellingDropIdx = dropIndex;
    updateCasesOpenSellUi();
    renderCasesOpenResults(casesSessionDrops);

    const ok = await apiSell(drop.weaponId);
    casesOpenSelling = false;
    casesOpenSellingDropIdx = null;

    if (ok) {
        drop.sold = true;
        const safeName = escapeCasesHtml(drop.name || '');
        appendCasesOpenLog(`<span style="color:#86efac">${csrT('cases.log.soldOne')}</span> · <span style="color:#e5e7eb">${safeName}</span>`);
        casesSessionDrops = casesSessionDrops.filter(d => !d.sold);
        fetchUserCoins().then(() => {
            scrapeCoinsFromPage();
            updateCasesAutoOpenSummary();
            updateCasesCostSummary();
        }).catch(() => {});
    } else {
        toast(csrT('toast.unknownError'), 'error');
    }

    renderCasesOpenResults(casesSessionDrops);
    updateCasesOpenSellUi();
}

function renderCasesOpenResults(drops) {
    const box = document.getElementById('csrx-cases-open-results');
    const body = document.getElementById('csrx-cases-open-results-body');
    if (!box || !body) return;
    if (!drops.length) {
        box.style.display = 'none';
        return;
    }

    const manualPick = !isCasesAutoSellEnabled();
    const sorted = [...drops].sort((a, b) => {
        const fa = a.float;
        const fb = b.float;
        if (fa == null && fb == null) return String(a.name).localeCompare(String(b.name));
        if (fa == null) return 1;
        if (fb == null) return -1;
        if (fa !== fb) return fa - fb;
        return String(a.name).localeCompare(String(b.name));
    });

    body.innerHTML = sorted.map((d) => {
        const safeName = escapeCasesHtml(d.name || 'Unknown');
        const isGold = isCasesDropGold(d.name);
        const nameStyle = isGold
            ? 'color:#facc15;font-weight:800'
            : rarityStyle(d.rarity);
        let floatHtml;
        if (d.float != null) {
            const wear = getCondition(d.float);
            const wearCol = wearColor(d.float);
            floatHtml = `<span class="csrx-cases-result-float" style="color:${wearCol}">${d.float.toFixed(4)} ${wear}</span>`;
        } else {
            floatHtml = '<span class="csrx-cases-result-float" style="color:#737373">—</span>';
        }
        const dropIdx = casesSessionDrops.indexOf(d);
        let sellBtn = '';
        if (manualPick) {
            const block = getSessionDropSellDisabledReason(d, dropIdx);
            const disabled = !!block;
            let title = csrT('cases.sellThisItemTitle');
            if (block === 'locked') title = csrT('toast.skinLocked');
            else if (block === 'busy' && casesOpenSellingDropIdx === dropIdx) title = csrT('cases.sellItemBusy');
            const label = (block === 'busy' && casesOpenSellingDropIdx === dropIdx)
                ? csrT('cases.sellItemBusy')
                : csrT('cases.sellThisItem');
            sellBtn = `<button type="button" class="csrx-cases-result-sell" data-drop-idx="${dropIdx}"${disabled ? ' disabled' : ''} title="${escapeCasesHtml(title)}">${label}</button>`;
        }
        return `<div class="csrx-cases-result-row">
            <div class="csrx-cases-result-info">
                <span class="csrx-cases-result-name" style="${nameStyle}">${safeName}</span>
                ${floatHtml}
            </div>
            ${sellBtn}
        </div>`;
    }).join('');

    box.style.display = 'flex';
    updateCasesOpenSellUi();
}

async function runCasesSessionQuickSell(filterFn, label, options = {}) {
    const silent = options.silent === true;
    if (casesOpenSelling) return { sold: 0, failed: 0 };
    await resolveSessionDropWeaponIds(casesSessionDrops, { retries: 2, delayMs: 200 });
    const toSell = getSellableSessionDrops(filterFn);
    if (!toSell.length) {
        if (!silent) toast(csrT('toast.nothingToSell'), 'warn');
        return { sold: 0, failed: 0 };
    }
    const spd = getCasesSessionSellBatchSize();
    if (!silent && !confirm(toSell.length === 1
        ? csrT('cases.confirmQuickSellOne', { label, batch: spd })
        : csrT('cases.confirmQuickSell', { n: toSell.length, label, batch: spd }))) {
        return { sold: 0, failed: 0 };
    }

    casesOpenSelling = true;
    casesOpenSellingDropIdx = null;
    updateCasesOpenSellUi();
    renderCasesOpenResults(casesSessionDrops);
    const btnStart = document.getElementById('csrx-cases-open-start');
    if (btnStart) btnStart.disabled = true;

    let sold = 0;
    let failed = 0;
    const prog = document.getElementById('csrx-cases-progress');
    const bar = document.getElementById('csrx-cases-progress-bar');
    if (prog && !casesOpenRunning) prog.style.display = 'block';

    for (let i = 0; i < toSell.length; i += spd) {
        const chunk = toSell.slice(i, i + spd);
        await Promise.all(chunk.map(async (d) => {
            const ok = await apiSell(d.weaponId);
            if (ok) {
                sold++;
                d.sold = true;
            } else {
                failed++;
            }
        }));
        if (bar) bar.style.width = `${Math.round(Math.min(i + spd, toSell.length) / toSell.length * 100)}%`;
        appendCasesOpenLog(`<span style="color:#a3a3a3">${csrT('cases.log.selling', { mode: silent ? csrT('cases.log.modeAuto') : csrT('cases.log.modeManual'), sold, total: toSell.length })}</span>`);
    }

    casesOpenSelling = false;
    casesOpenSellingDropIdx = null;
    if (bar && !casesOpenRunning) bar.style.width = '100%';
    if (!casesOpenRunning) {
        setTimeout(() => { if (prog) prog.style.display = 'none'; if (bar) bar.style.width = '0%'; }, 800);
    }
    if (btnStart) btnStart.disabled = casesOpenRunning;

    casesSessionDrops = casesSessionDrops.filter(d => !d.sold);
    renderCasesOpenResults(casesSessionDrops);
    updateCasesOpenSellUi();
    fetchUserCoins().then(() => {
        scrapeCoinsFromPage();
        updateCasesAutoOpenSummary();
    }).catch(() => {});

    if (!silent) {
        toast(
            `${csrT('toast.sessionQuickSold', { n: sold })}${failed ? csrT('toast.sessionQuickSoldFailed', { n: failed }) : ''}`,
            sold > 0 ? 'success' : 'error'
        );
    } else if (sold > 0 || failed > 0) {
        appendCasesOpenLog(`<span style="color:${sold > 0 ? '#86efac' : '#ef4444'}">${csrT('cases.log.autoSellDone', { sold })}${failed ? csrT('cases.log.autoSellFailed', { failed }) : ''}</span>`);
    }
    return { sold, failed };
}

function refreshCasesOpenStatsUi() {
    const el = document.getElementById('csrx-cases-open-stats');
    if (!el) return;
    const last = casesOpenStats.lastName
        ? csrT('cases.openedLast', { name: `<span style="${rarityStyle(casesOpenStats.lastRarity)}">${casesOpenStats.lastName}</span>` })
        : '';
    el.innerHTML = `${csrT('cases.openedStats', { opened: `<strong>${casesOpenStats.opened}</strong>`, gold: `<strong style="color:#facc15">${casesOpenStats.gold}</strong>` })}${last}`;
}

function pickNextMultiCase(queue, startIdx, spendLeft, coins) {
    if (!queue.length) return null;
    for (let j = 0; j < queue.length; j++) {
        const c = queue[(startIdx + j) % queue.length];
        if (c.price > spendLeft) continue;
        if (coins != null && c.price > coins) continue;
        return { picked: c, nextIdx: (startIdx + j + 1) % queue.length };
    }
    return null;
}

async function processAutoOpenDrop(sessionGen, picked, data, sessionDrops) {
    if (!isCasesSessionActive(sessionGen)) return false;

    const name = data?.name ? String(data.name) : csrT('cases.unknownItem');
    const rarity = data?.rarity != null ? parseInt(data.rarity, 10) : null;
    const floatVal = extractFloatFromOpenData(data);
    const weaponId = extractWeaponIdFromOpenData(data);

    sessionDrops.push({ name, rarity, float: floatVal, weaponId, sold: false });
    const drop = sessionDrops[sessionDrops.length - 1];

    casesOpenStats.opened++;
    casesOpenStats.lastName = name;
    casesOpenStats.lastRarity = rarity;

    const isGold = isCasesDropGold(name);
    if (isGold) casesOpenStats.gold++;

    if (cachedUserCoins != null) cachedUserCoins = Math.max(0, cachedUserCoins - picked.price);
    refreshCasesOpenStatsUi();
    updateCasesAutoOpenSummary();
    updateCasesCostSummary();

    const safeName = escapeCasesHtml(name);
    const safeCase = escapeCasesHtml(picked.name);
    if (isCasesOpenMultiMode()) {
        appendCasesOpenLog(`<span style="color:#737373">${safeCase}</span> → ${isGold
            ? `<span style="color:#facc15;font-weight:800">${csrT('cases.log.gold')}</span> · <span style="color:#e5e7eb">${safeName}</span>`
            : `<span style="${rarityStyle(rarity)}">${safeName}</span> <span style="color:#737373">(${rarity ?? '?'})</span>`}`);
    } else if (isGold) {
        appendCasesOpenLog(`<span style="color:#facc15;font-weight:800">${csrT('cases.log.gold')}</span> · <span style="color:#e5e7eb">${safeName}</span>`);
    } else {
        appendCasesOpenLog(`<span style="${rarityStyle(rarity)}">${safeName}</span> <span style="color:#737373">(${rarity ?? '?'})</span>`);
    }

    if (isCasesAutoSellEnabled() && casesAutoOpenSellCfg.timing === 'each' && isCasesSessionActive(sessionGen)) {
        const soldNow = await tryAutoSellSessionDrop(drop);
        if (soldNow) {
            appendCasesOpenLog(`<span style="color:#86efac">${csrT('cases.log.autoSold')}</span> · <span style="color:#e5e7eb">${safeName}</span>`);
        }
    }
    return true;
}

async function runCasesAutoOpen() {
    if (isCasesOpenBusy()) {
        toast(csrT('toast.autoOpenBusy'), 'warn');
        return;
    }

    const multi = isCasesOpenMultiMode();
    const queue = getAutoOpenCaseQueue();
    if (!queue.length) {
        toast(csrT(multi ? 'cases.selectMultiCases' : 'toast.selectCase'), 'warn');
        return;
    }

    const delayMs = clampCasesOpenDelayMs(readInt(document.getElementById('csrx-cases-open-delay'), casesAutoOpenCfg.delayMs));
    const spendLimit = Math.max(0, readInt(document.getElementById('csrx-cases-open-spend'), casesAutoOpenCfg.spendLimit));
    const minutes = Math.max(1, Math.min(120, readInt(document.getElementById('csrx-cases-open-mins'), casesAutoOpenCfg.minutes)));
    const runDurationMs = minutes * 60 * 1000;

    if (multi) {
        if (isCasesMultiQuotaMode()) {
            const quotas = getMultiCaseQuotasFromUi();
            const rawPlan = buildQuotaOpenPlan(queue, quotas);
            const plan = getEffectiveQuotaPlan(queue, quotas, cachedUserCoins, minutes, delayMs);
            if (!rawPlan.length) {
                toast(csrT('cases.quotaEmpty'), 'warn');
                return;
            }
            if (!plan.length) {
                toast(csrT('cases.quotaTooExpensive'), 'error');
                return;
            }
            const totalCost = plan.reduce((s, c) => s + c.price, 0);
            const totalOpens = plan.length;
            if (totalOpens <= 0) {
                toast(csrT('cases.quotaTooExpensive'), 'error');
                return;
            }
            if (!confirm(csrT('cases.confirmOpenMultiQuota', {
                breakdown: formatMultiQuotaBreakdown(queue, quotas),
                opens: totalOpens,
                cost: formatCoins(totalCost),
                minutes,
                delay: delayMs,
                rules: describeAutoSellRules(),
            }))) {
                return;
            }
        } else {
            const minPrice = Math.min(...queue.map(c => c.price));
            if (minPrice <= 0 || spendLimit < minPrice) {
                toast(csrT('toast.spendTooLow'), 'error');
                return;
            }
            if (!confirm(csrT('cases.confirmOpenMulti', {
                count: queue.length,
                names: queue.map(c => c.name).join(', '),
                spend: formatCoins(spendLimit),
                minutes,
                delay: delayMs,
                rules: describeAutoSellRules(),
            }))) {
                return;
            }
        }
    } else {
        const picked = queue[0];
        const maxCases = picked.price > 0 ? Math.floor(spendLimit / picked.price) : 0;
        const coinsLimit = (cachedUserCoins != null && picked.price > 0) ? Math.floor(cachedUserCoins / picked.price) : null;
        const hardMax = coinsLimit == null ? maxCases : Math.min(maxCases, coinsLimit);
        if (hardMax <= 0) {
            toast(csrT('toast.spendTooLow'), 'error');
            return;
        }
        if (!confirm(csrT('cases.confirmOpen', {
            max: hardMax,
            name: picked.name,
            spend: formatCoins(spendLimit),
            price: formatCoins(picked.price),
            minutes,
            delay: delayMs,
            rules: describeAutoSellRules(),
        }))) {
            return;
        }
    }

    const sessionGen = ++casesOpenSessionGen;
    casesOpenActiveGen = sessionGen;
    casesOpenAbort = false;
    casesOpenRunning = true;
    casesOpenStats = { opened: 0, gold: 0, lastName: '', lastRarity: null };
    const sessionDrops = [];
    clearCasesOpenResults();
    const liveLog = document.getElementById('csrx-cases-open-log');
    if (liveLog) liveLog.innerHTML = '';
    refreshCasesOpenStatsUi();
    updateCasesAutoOpenSummary();

    const btnStart = document.getElementById('csrx-cases-open-start');
    const btnStop = document.getElementById('csrx-cases-open-stop');
    const prog = document.getElementById('csrx-cases-progress');
    const bar = document.getElementById('csrx-cases-progress-bar');
    if (btnStart) btnStart.disabled = true;
    if (btnStop) btnStop.style.display = 'block';
    if (prog) prog.style.display = 'block';

    const start = Date.now();
    const end = start + runDurationMs;
    let lastErr = '';
    let totalSpent = 0;
    let multiIdx = 0;

    if (multi) {
        if (isCasesMultiQuotaMode()) {
            const quotas = getMultiCaseQuotasFromUi();
            const plan = getEffectiveQuotaPlan(queue, quotas, cachedUserCoins, minutes, delayMs);
            const planTotal = plan.length;
            appendCasesOpenLog(`<span style="color:#a3a3a3">${csrT('cases.log.startingMultiQuota', { opens: planTotal, minutes })}</span>`);
            let needDelay = false;
            let opened = 0;
            for (const picked of plan) {
                if (!isCasesSessionActive(sessionGen)) break;
                if (Date.now() >= end) break;
                if (cachedUserCoins != null && cachedUserCoins < picked.price) break;

                if (needDelay) await sleep(delayMs);
                if (!isCasesSessionActive(sessionGen)) break;

                if (bar && planTotal > 0) bar.style.width = `${Math.round((opened / planTotal) * 100)}%`;

                try {
                    const data = await openCaseOnce(picked.id);
                    if (!isCasesSessionActive(sessionGen)) break;
                    totalSpent += picked.price;
                    opened++;
                    await processAutoOpenDrop(sessionGen, picked, data, sessionDrops);
                    needDelay = true;
                } catch (e) {
                    lastErr = e?.message || 'Unknown error';
                    appendCasesOpenLog(`<span style="color:#ef4444">${csrT('cases.log.error', { msg: escapeCasesHtml(lastErr) })}</span>`);
                    break;
                }
            }
        } else {
            appendCasesOpenLog(`<span style="color:#a3a3a3">${csrT('cases.log.startingMulti', { count: queue.length, minutes })}</span>`);
            let needDelay = false;
            while (isCasesSessionActive(sessionGen) && Date.now() < end) {
                const next = pickNextMultiCase(queue, multiIdx, spendLimit - totalSpent, cachedUserCoins);
                if (!next) break;
                multiIdx = next.nextIdx;
                const picked = next.picked;

                if (needDelay) await sleep(delayMs);
                if (!isCasesSessionActive(sessionGen)) break;

                if (bar && spendLimit > 0) bar.style.width = `${Math.round(Math.min(totalSpent / spendLimit, 1) * 100)}%`;

                try {
                    const data = await openCaseOnce(picked.id);
                    if (!isCasesSessionActive(sessionGen)) break;
                    totalSpent += picked.price;
                    await processAutoOpenDrop(sessionGen, picked, data, sessionDrops);
                    needDelay = true;
                } catch (e) {
                    lastErr = e?.message || 'Unknown error';
                    appendCasesOpenLog(`<span style="color:#ef4444">${csrT('cases.log.error', { msg: escapeCasesHtml(lastErr) })}</span>`);
                    break;
                }
            }
        }
    } else {
        const picked = queue[0];
        const maxCases = picked.price > 0 ? Math.floor(spendLimit / picked.price) : 0;
        const coinsLimit = (cachedUserCoins != null && picked.price > 0) ? Math.floor(cachedUserCoins / picked.price) : null;
        const hardMax = coinsLimit == null ? maxCases : Math.min(maxCases, coinsLimit);

        appendCasesOpenLog(`<span style="color:#a3a3a3">${csrT('cases.log.starting', { name: picked.name, max: hardMax, minutes })}</span>`);

        for (let i = 0; i < hardMax; i++) {
            if (!isCasesSessionActive(sessionGen)) break;
            if (Date.now() >= end) break;
            if (cachedUserCoins != null && cachedUserCoins < picked.price) break;
            if (bar) bar.style.width = `${Math.round((i / hardMax) * 100)}%`;

            try {
                const data = await openCaseOnce(picked.id);
                if (!isCasesSessionActive(sessionGen)) break;
                totalSpent += picked.price;
                await processAutoOpenDrop(sessionGen, picked, data, sessionDrops);
            } catch (e) {
                lastErr = e?.message || 'Unknown error';
                appendCasesOpenLog(`<span style="color:#ef4444">${csrT('cases.log.error', { msg: escapeCasesHtml(lastErr) })}</span>`);
                break;
            }

            if (!isCasesSessionActive(sessionGen)) break;
            if (i < hardMax - 1) await sleep(delayMs);
        }
    }

    if (sessionGen !== casesOpenActiveGen) return;

    if (bar) bar.style.width = '100%';

    await fetchUserCoins();
    scrapeCoinsFromPage();
    updateCasesAutoOpenSummary();
    updateCasesCostSummary();

    casesOpenRunning = false;
    if (btnStop) btnStop.style.display = 'none';

    if (isCasesSessionActive(sessionGen)) {
        await resolveSessionDropWeaponIds(sessionDrops, { retries: 4, delayMs: 400 });
        casesSessionDrops = sessionDrops.filter(d => !d.sold);
        if (isCasesAutoSellEnabled() && casesAutoOpenSellCfg.timing === 'end') {
            await runCasesSessionQuickSell(
                d => casesDropMatchesAutoSellRules(d),
                describeAutoSellRules(),
                { silent: true }
            );
        }
        renderCasesOpenResults(casesSessionDrops);
    }

    if (sessionGen !== casesOpenActiveGen) return;

    casesOpenAbort = false;
    setTimeout(() => { if (prog) prog.style.display = 'none'; if (bar) bar.style.width = '0%'; }, 800);
    updateCasesAutoOpenSummary();

    if (lastErr) toast(lastErr, 'error');
    else toast(`${csrT('toast.autoOpenDone', { n: casesOpenStats.opened })}${casesOpenStats.gold ? csrT('toast.autoOpenGold', { n: casesOpenStats.gold }) : ''}`, 'success');
}

function setupCasesBulkBuy() {
    const fab = document.createElement('div');
    fab.id = 'csrx-cases-fab';
    fab.title = csrT('cases.fabTitle');
    fab.innerHTML = `<img alt="Case bulk buy" src="${extUrl('icons/icon-128.png')}">`;
    document.body.appendChild(fab);

    const win = document.createElement('div');
    win.id = 'csrx-cases-win';
    win.innerHTML = `
<div id="csrx-cases-hdr">
    <div class="csrx-logo" style="width:32px;height:32px;border-radius:8px;overflow:hidden;flex-shrink:0;">
        <img alt="" src="${extUrl('icons/icon-128.png')}" style="width:100%;height:100%;object-fit:cover;">
    </div>
    <div class="csrx-hdr-text">
        <div class="csrx-hdr-title" style="font-size:0.9375rem;" data-i18n="cases.title">${csrT('cases.title')}</div>
        <div class="csrx-hdr-sub" style="font-size:0.6875rem;" data-i18n="cases.subtitle">${csrT('cases.subtitle')}</div>
    </div>
    <div id="csrx-cases-winx">
        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#333" stroke-width="2.5" stroke-linecap="round">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
    </div>
</div>
<div id="csrx-cases-body">
    <div id="csrx-cases-tabs">
        <button type="button" id="csrx-cases-tab-bulk" class="csrx-cases-tab active" data-i18n="cases.tab.bulk">${csrT('cases.tab.bulk')}</button>
        <button type="button" id="csrx-cases-tab-open" class="csrx-cases-tab" data-i18n="cases.tab.open">${csrT('cases.tab.open')}</button>
    </div>
    <div>
        <div id="csrx-cases-pick-search-wrap">
            <label for="csrx-cases-pick-search" data-i18n="cases.search">${csrT('cases.search')}</label>
            <input type="search" id="csrx-cases-pick-search" placeholder="${csrT('cases.searchPlaceholder')}" autocomplete="off" spellcheck="false">
        </div>
        <div id="csrx-cases-select-wrap">
            <label for="csrx-cases-select" data-i18n="cases.weaponCase">${csrT('cases.weaponCase')}</label>
            <select id="csrx-cases-select" class="csrx-sel" style="margin-top:6px;width:100%;"></select>
            <div id="csrx-cases-select-search-empty" class="csrx-cases-search-empty" hidden data-i18n="cases.searchNoResults">${csrT('cases.searchNoResults')}</div>
        </div>
        <div id="csrx-cases-open-mode-wrap" style="display:none;">
            <label data-i18n="cases.openMode">${csrT('cases.openMode')}</label>
            <div class="csrx-cases-open-mode">
                <button type="button" id="csrx-cases-open-mode-single" class="csrx-cases-open-mode-btn active" data-i18n="cases.openModeSingle">${csrT('cases.openModeSingle')}</button>
                <button type="button" id="csrx-cases-open-mode-multi" class="csrx-cases-open-mode-btn" data-i18n="cases.openModeMulti">${csrT('cases.openModeMulti')}</button>
            </div>
        </div>
        <div id="csrx-cases-open-multi-wrap">
            <div id="csrx-cases-multi-strategy-wrap">
                <label data-i18n="cases.multiStrategy">${csrT('cases.multiStrategy')}</label>
                <div class="csrx-cases-open-mode">
                    <button type="button" id="csrx-cases-multi-strategy-cycle" class="csrx-cases-open-mode-btn" data-i18n="cases.multiStrategyCycle">${csrT('cases.multiStrategyCycle')}</button>
                    <button type="button" id="csrx-cases-multi-strategy-quota" class="csrx-cases-open-mode-btn" data-i18n="cases.multiStrategyQuota">${csrT('cases.multiStrategyQuota')}</button>
                </div>
            </div>
            <label id="csrx-cases-multi-pick-label" data-i18n="cases.multiCasePick">${csrT('cases.multiCasePick')}</label>
            <div id="csrx-cases-open-multi-list"></div>
            <div id="csrx-cases-multi-search-empty" class="csrx-cases-search-empty" hidden data-i18n="cases.searchNoResults">${csrT('cases.searchNoResults')}</div>
            <div id="csrx-cases-open-multi-actions">
                <button type="button" id="csrx-cases-multi-select-all" data-i18n="cases.multiSelectAll">${csrT('cases.multiSelectAll')}</button>
                <button type="button" id="csrx-cases-multi-clear" data-i18n="cases.multiClear">${csrT('cases.multiClear')}</button>
            </div>
        </div>
    </div>
    <div id="csrx-cases-bulk" class="csrx-cases-mode">
        <div>
            <label for="csrx-cases-qty" data-i18n="cases.quantity">${csrT('cases.quantity')}</label>
            <input type="text" id="csrx-cases-qty" inputmode="numeric" autocomplete="off" spellcheck="false" value="1" style="margin-top:6px;">
        </div>
        <div id="csrx-cases-summary">${csrT('cases.loading')}</div>
        <button type="button" id="csrx-cases-buy" data-i18n="cases.buy">${csrT('cases.buy')}</button>
        <button type="button" id="csrx-cases-cancel" data-i18n="cases.cancel">${csrT('cases.cancel')}</button>
    </div>
    <div id="csrx-cases-open" class="csrx-cases-mode" style="display:none;">
        <div style="display:flex;gap:10px;">
            <div style="flex:1;">
                <label for="csrx-cases-open-delay" data-i18n="cases.delay">${csrT('cases.delay')}</label>
                <input type="text" id="csrx-cases-open-delay" inputmode="numeric" autocomplete="off" spellcheck="false" value="400" style="margin-top:6px;">
            </div>
            <div style="flex:1;">
                <label for="csrx-cases-open-mins" data-i18n="cases.minutes">${csrT('cases.minutes')}</label>
                <input type="text" id="csrx-cases-open-mins" inputmode="numeric" autocomplete="off" spellcheck="false" value="10" style="margin-top:6px;">
            </div>
        </div>
        <div>
            <label for="csrx-cases-open-spend" data-i18n="cases.spendLimit">${csrT('cases.spendLimit')}</label>
            <input type="text" id="csrx-cases-open-spend" inputmode="numeric" autocomplete="off" spellcheck="false" value="150000" style="margin-top:6px;">
        </div>
        <div id="csrx-cases-open-summary">Configure limits…</div>
        <div id="csrx-cases-open-stats" style="font-size:0.8125rem;color:#b1a7a6;"></div>
        <div id="csrx-cases-open-log"></div>
        <div id="csrx-cases-open-results">
            <div id="csrx-cases-open-results-label" data-i18n="cases.resultsLabel">${csrT('cases.resultsLabel')}</div>
            <div id="csrx-cases-open-results-body"></div>
        </div>
        <div id="csrx-cases-open-sell-wrap">
            <button type="button" id="csrx-cases-open-sell-nongold" class="csrx-cases-sell-btn">${csrT('cases.quickSellNonGold')}</button>
            <div id="csrx-cases-open-sell-manual">
                <div id="csrx-cases-open-sell-label" data-i18n="cases.sellSession">${csrT('cases.sellSession')}</div>
                <div id="csrx-cases-open-sell-hint" data-i18n="cases.sellHint">${csrT('cases.sellHint')}</div>
                <select id="csrx-cases-open-sell-rar" class="csrx-sel" style="width:100%;">
                    ${rarityEntries().map(([k, v]) => `<option value="${k}">${v.name}</option>`).join('')}
                </select>
                <button type="button" id="csrx-cases-open-sell-rarity" class="csrx-cases-sell-btn">Quick sell this rarity</button>
                <div id="csrx-cases-open-sell-batch">
                    <span data-i18n="cases.batchSize">${csrT('cases.batchSize')}</span>
                    <input type="text" id="csrx-cases-open-sell-spd" inputmode="numeric" autocomplete="off" spellcheck="false" value="5">
                </div>
            </div>
        </div>
        <button type="button" id="csrx-cases-open-start" data-i18n="cases.startOpen">${csrT('cases.startOpen')}</button>
        <button type="button" id="csrx-cases-open-stop" data-i18n="cases.stop">${csrT('cases.stop')}</button>
    </div>
    <div id="csrx-cases-progress"><div id="csrx-cases-progress-bar"></div></div>
</div>`;
    document.body.appendChild(win);
    fab.classList.add('csrx-feature-off');
    win.classList.add('csrx-feature-off');

    fab.addEventListener('click', () => {
        if (!isCasesListPage()) return;
        if (!csrIsFeatureEnabled('caseBulkBuy') && !csrIsFeatureEnabled('caseAutoOpen')) return;
        casesWinOpen = true;
        resetCasesWinPosition(win);
        syncCasesPanelVisibility();
        syncCasesModeUi();
        refreshCasesAutoOpenFromStorage().catch(() => {});
        fetchCasesCatalog();
        fetchUserCoins();
        scrapeCoinsFromPage();
    });

    document.getElementById('csrx-cases-winx')?.addEventListener('click', () => {
        casesWinOpen = false;
        syncCasesPanelVisibility();
    });

    document.getElementById('csrx-cases-tab-bulk')?.addEventListener('click', () => { casesMode = 'bulk'; syncCasesModeUi(); });
    document.getElementById('csrx-cases-tab-open')?.addEventListener('click', () => {
        casesMode = 'open';
        syncCasesModeUi();
        refreshCasesAutoOpenFromStorage().catch(() => {});
    });

    document.getElementById('csrx-cases-open-mode-single')?.addEventListener('click', () => {
        casesAutoOpenCfg = { ...casesAutoOpenCfg, openMode: 'single' };
        syncCasesOpenSubModeUi();
        scheduleSaveCasesAutoOpenConfig(casesAutoOpenCfg);
        updateCasesAutoOpenSummary();
    });
    document.getElementById('csrx-cases-open-mode-multi')?.addEventListener('click', () => {
        casesAutoOpenCfg = { ...casesAutoOpenCfg, openMode: 'multi', multiCaseIds: getMultiSelectedCaseIds() };
        syncCasesOpenSubModeUi();
        scheduleSaveCasesAutoOpenConfig(casesAutoOpenCfg);
        updateCasesAutoOpenSummary();
    });
    document.getElementById('csrx-cases-multi-strategy-cycle')?.addEventListener('click', () => setCasesMultiStrategy('cycle'));
    document.getElementById('csrx-cases-multi-strategy-quota')?.addEventListener('click', () => setCasesMultiStrategy('quota'));
    document.getElementById('csrx-cases-pick-search')?.addEventListener('input', applyCasesPickSearch);
    document.getElementById('csrx-cases-open-multi-list')?.addEventListener('change', (e) => {
        const cb = e.target.closest('input[type="checkbox"][data-case-id]');
        if (cb) {
            const qtyInp = cb.closest('.csrx-cases-multi-row')?.querySelector('.csrx-cases-multi-qty');
            if (qtyInp) qtyInp.disabled = !cb.checked;
        }
        persistMultiCaseSelection();
        updateCasesAutoOpenSummary();
    });
    document.getElementById('csrx-cases-open-multi-list')?.addEventListener('input', (e) => {
        if (e.target.classList.contains('csrx-cases-multi-qty')) {
            persistMultiCaseSelection();
            updateCasesAutoOpenSummary();
        }
    });
    document.getElementById('csrx-cases-open-multi-list')?.addEventListener('blur', (e) => {
        if (e.target.classList.contains('csrx-cases-multi-qty')) {
            normalizeCasesQtyInput(e.target);
            persistMultiCaseSelection();
            updateCasesAutoOpenSummary();
        }
    }, true);
    document.getElementById('csrx-cases-multi-select-all')?.addEventListener('click', () => {
        document.querySelectorAll('#csrx-cases-open-multi-list .csrx-cases-multi-row:not(.csrx-cases-multi-row-hidden) input[type="checkbox"]').forEach(inp => { inp.checked = true; });
        document.querySelectorAll('#csrx-cases-open-multi-list .csrx-cases-multi-row:not(.csrx-cases-multi-row-hidden) .csrx-cases-multi-qty').forEach(inp => { inp.disabled = false; });
        persistMultiCaseSelection();
        updateCasesAutoOpenSummary();
    });
    document.getElementById('csrx-cases-multi-clear')?.addEventListener('click', () => {
        document.querySelectorAll('#csrx-cases-open-multi-list input[type="checkbox"]').forEach(inp => { inp.checked = false; });
        document.querySelectorAll('#csrx-cases-open-multi-list .csrx-cases-multi-qty').forEach(inp => { inp.disabled = true; });
        persistMultiCaseSelection();
        updateCasesAutoOpenSummary();
    });

    document.getElementById('csrx-cases-select')?.addEventListener('change', () => {
        updateCasesCostSummary();
        updateCasesAutoOpenSummary();
    });
    document.getElementById('csrx-cases-qty')?.addEventListener('input', updateCasesCostSummary);
    document.getElementById('csrx-cases-qty')?.addEventListener('blur', (e) => {
        const inp = e.target;
        if (!String(inp.value ?? '').trim()) inp.value = '1';
        else normalizeCasesQtyInput(inp);
        updateCasesCostSummary();
    });
    document.getElementById('csrx-cases-buy')?.addEventListener('click', () => runCasesBulkBuy());
    document.getElementById('csrx-cases-cancel')?.addEventListener('click', () => {
        casesBuyAbort = true;
        toast(csrT('toast.cancellingBuy'), 'info');
    });

    const delayInp = document.getElementById('csrx-cases-open-delay');
    const minsInp = document.getElementById('csrx-cases-open-mins');
    const spendInp = document.getElementById('csrx-cases-open-spend');

    const handleCfgChange = () => {
        const next = {
            ...casesAutoOpenCfg,
            delayMs: clampCasesOpenDelayMs(readInt(delayInp, casesAutoOpenCfg.delayMs)),
            minutes: Math.max(1, Math.min(120, readInt(minsInp, casesAutoOpenCfg.minutes))),
            spendLimit: Math.max(0, readInt(spendInp, casesAutoOpenCfg.spendLimit)),
        };
        scheduleSaveCasesAutoOpenConfig(next);
        if (delayInp) delayInp.value = String(next.delayMs);
        updateCasesAutoOpenSummary();
    };

    delayInp?.addEventListener('input', handleCfgChange);
    delayInp?.addEventListener('blur', () => {
        if (delayInp) delayInp.value = String(clampCasesOpenDelayMs(readInt(delayInp, casesAutoOpenCfg.delayMs)));
        handleCfgChange();
    });
    minsInp?.addEventListener('input', handleCfgChange);
    spendInp?.addEventListener('input', handleCfgChange);
    document.getElementById('csrx-cases-open-start')?.addEventListener('click', () => runCasesAutoOpen());
    document.getElementById('csrx-cases-open-stop')?.addEventListener('click', () => {
        casesOpenAbort = true;
        toast(csrT('toast.stoppingOpen'), 'info');
    });

    document.getElementById('csrx-cases-open-sell-rar')?.addEventListener('change', updateCasesOpenSellUi);
    document.getElementById('csrx-cases-open-sell-spd')?.addEventListener('blur', async (e) => {
        const inp = e.target;
        inp.value = String(getCasesSessionSellBatchSize());
        await persistCasesAutoOpenSellConfig();
    });
    document.getElementById('csrx-cases-open-sell-rarity')?.addEventListener('click', () => {
        const rarVal = parseInt(document.getElementById('csrx-cases-open-sell-rar')?.value, 10);
        const rarEntry = rarityEntries().find(([k]) => parseInt(k, 10) === rarVal);
        const rarName = rarEntry ? rarEntry[1].name : `Rarity ${rarVal}`;
        runCasesSessionQuickSell(
            d => parseInt(d.rarity, 10) === rarVal,
            csrT('cases.sellRarityLabel', { rarity: rarName })
        );
    });
    document.getElementById('csrx-cases-open-sell-nongold')?.addEventListener('click', () => {
        runCasesSessionQuickSell(
            d => !isCasesDropGold(d.name),
            csrT('cases.confirmSellNonGold')
        );
    });
    document.getElementById('csrx-cases-open-results-body')?.addEventListener('click', (e) => {
        const btn = e.target.closest('.csrx-cases-result-sell');
        if (!btn || btn.disabled) return;
        const idx = parseInt(btn.dataset.dropIdx, 10);
        if (!Number.isFinite(idx)) return;
        sellOneSessionDrop(idx);
    });

    {
        let drag = false;
        let ox = 0;
        let oy = 0;
        const hdr = document.getElementById('csrx-cases-hdr');
        hdr?.addEventListener('mousedown', (e) => {
            if (e.target.closest('#csrx-cases-winx')) return;
            drag = true;
            ox = e.clientX;
            oy = e.clientY;
        });
        document.addEventListener('mouseup', () => { drag = false; });
        document.addEventListener('mousemove', (e) => {
            if (!drag) return;
            const r = win.getBoundingClientRect();
            win.style.left = `${r.left + e.clientX - ox}px`;
            win.style.top = `${r.top + e.clientY - oy}px`;
            win.style.right = 'auto';
            win.style.bottom = 'auto';
            ox = e.clientX;
            oy = e.clientY;
        });
    }

    loadCasesAutoOpenConfig().then((cfg) => {
        casesAutoOpenCfg = cfg;
        if (delayInp) delayInp.value = String(cfg.delayMs ?? CASES_OPEN_DELAY_MIN_MS);
        if (minsInp) minsInp.value = String(cfg.minutes ?? 10);
        if (spendInp) spendInp.value = String(cfg.spendLimit ?? 150000);
        populateCasesMultiList();
        syncMultiStrategyUi();
        syncCasesOpenSubModeUi();
        updateCasesAutoOpenSummary();
    }).catch(() => {});

    loadCasesAutoOpenSellConfig().catch(() => {});

    if (typeof csrWatchPrefsChanges === 'function') {
        csrWatchPrefsChanges((changes) => {
            if (Object.prototype.hasOwnProperty.call(changes, CASES_AUTO_OPEN_SELL_CFG_KEY)) {
                casesAutoOpenSellCfg = normalizeCasesAutoSellCfg(changes[CASES_AUTO_OPEN_SELL_CFG_KEY]);
                syncCasesAutoSellBatchInput();
                updateCasesAutoOpenSummary();
                if (casesSessionDrops.length) renderCasesOpenResults(casesSessionDrops);
                updateCasesOpenSellUi();
            }
            if (Object.prototype.hasOwnProperty.call(changes, CASES_AUTO_OPEN_CFG_KEY)) {
                clearTimeout(_casesCfgSaveTimer);
                _casesCfgSaveTimer = null;
                casesAutoOpenCfg = normalizeCasesAutoCfg(changes[CASES_AUTO_OPEN_CFG_KEY]);
                if (delayInp) delayInp.value = String(casesAutoOpenCfg.delayMs ?? CASES_OPEN_DELAY_MIN_MS);
                if (minsInp) minsInp.value = String(casesAutoOpenCfg.minutes ?? 10);
                if (spendInp) spendInp.value = String(casesAutoOpenCfg.spendLimit ?? 150000);
                populateCasesMultiList();
                syncMultiStrategyUi();
                syncCasesOpenSubModeUi();
                updateCasesAutoOpenSummary();
            }
        });
    }
}

setupCasesBulkBuy();

function applyCsrFeatureVisibility() {
    syncQuickSellPanelVisibility();
    syncCasesPanelVisibility();
}

async function bootstrapCsrExtension() {
    await csrLoadLanguage();
    await csrLoadSettings();
    await loadCasesAutoOpenSellConfig();
    csrWatchLanguageStorage();
    csrOnLanguageChanged(() => {
        csrApplyContentI18n();
    });
    csrApplyContentI18n();
    bindSidebarLockClipWatch();
    csrWatchStorageChanges();
    csrOnSettingsChanged(() => {
        applyCsrFeatureVisibility();
        cleanupOrphanTradeBrowse();
        checkPageAndRun();
        applyOverlaysToAll({ urgent: true });
    });
    const rt = typeof browser !== 'undefined' ? browser : (typeof chrome !== 'undefined' ? chrome : null);
    if (rt?.runtime?.onMessage) {
        rt.runtime.onMessage.addListener((msg) => {
            if (msg?.type !== 'csr:reloadSettings') return;
            (async () => {
                await csrLoadSettings();
                await loadCasesAutoOpenSellConfig();
                applyCsrFeatureVisibility();
                checkPageAndRun();
                applyOverlaysToAll({ urgent: true });
            })();
        });
    }
    applyCsrFeatureVisibility();
    checkPageAndRun();
    setInterval(() => {
        checkPageAndRun();
        syncCasesPanelVisibility();
    }, 1500);
}

bootstrapCsrExtension();
})();