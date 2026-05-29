(function () {
'use strict';

const MP_API_RE = /api\.csrestored\.fun\/.*(marketplace|\/offers)/i;
const MP_API_URL = 'https://api.csrestored.fun/inventory/marketplace/';
const MP_ADD_URL = 'https://api.csrestored.fun/inventory/marketplace/add';
const TRADE_API_RE = /api\.csrestored\.fun\/(?:api\/)?trades\b/i;

const RARITY = {
    1: { name:'Consumer Grade',   hex:'#a8a29e' },
    2: { name:'Industrial Grade', hex:'#7dd3fc' },
    3: { name:'Mil-Spec',         hex:'#60a5fa' },
    4: { name:'Restricted',       hex:'#a855f7' },
    5: { name:'Classified',       hex:'#e879f9' },
    6: { name:'Covert / Knives / Gloves', hex:'#ef4444' },
    7: { name:'Contraband',       hex:'#facc15' },
};

function rarityEntries() {
    return Object.entries(RARITY).sort((a, b) => parseInt(a[0], 10) - parseInt(b[0], 10));
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
    z-index: 10 !important;
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
    z-index: 25 !important;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
    line-height: 0 !important;
}
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
    z-index: 20 !important;
    pointer-events: none !important;
}

#csrx-fab.csrx-feature-off,
#csrx-win.csrx-feature-off {
    display: none !important;
    visibility: hidden !important;
    pointer-events: none !important;
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
    color: #3d3d3d;
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
#csrx-stat { font-size: 10px; font-weight: 500; color: #3d3d3d; flex: 1; }

#csrx-body { padding: 12px; display: flex; flex-direction: column; gap: 14px; }

.csrx-section {
    font-size: 9px;
    font-weight: 600;
    color: #2a2a2a;
    text-transform: uppercase;
    letter-spacing: 1.5px;
    margin-bottom: 8px;
    display: flex;
    align-items: center;
    gap: 6px;
}
.csrx-section::after { content: ''; flex: 1; height: 1px; background: #1a1a1a; }

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
    color: #666;
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
select.csrx-sel:focus { border-color: #2a2a2a; color: #aaa; outline: none; }
select.csrx-sel option { background: #0a0a0a; color: #aaa; }

.csrx-slider-wrap { padding: 1px 0; }
.csrx-slider-row  { display: flex; justify-content: space-between; align-items: center; margin-bottom: 9px; }
.csrx-slider-lbl  { font-size: 10px; font-weight: 500; color: #333; }
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
.csrx-mhdr-sub { font-size: 11px; color: #333; font-weight: 400; }

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
    z-index: 2;
    position: relative;
    box-sizing: border-box;
    transition: margin-left 0.2s ease, width 0.2s ease, opacity 0.15s;
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
const LARGE_INV_WARN     = 500;

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
    if (_largeInvWarned || inventoryCache.length < LARGE_INV_WARN) return;
    if (!isInventoryPage() && !isTradePickerModal()) return;
    _largeInvWarned = true;
    toast(`Large inventory (${inventoryCache.length}+ items): float/seed may load slower.`, 'warn');
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
            const data = await res.clone().json();
            ingestApiPayload(url, data);
            scheduleQuickSellDomScrape();
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
    const yourCards  = getOfferSectionCards('your');
    const theirCards = getOfferSectionCards('their');
    const inv        = inventoryCache.map(normalizeInventoryEntry).filter(Boolean);
    const trade      = getCurrentTrade();
    const yourItems  = trade ? getTradeSideItems(trade, 'your') : [];
    const theirItems = trade ? getTradeSideItems(trade, 'their') : [];

    let used = new Set();
    for (const card of yourCards) {
        let item = matchOverlayItem(card, inv, used);
        if (!item && yourItems.length) item = matchOverlayItem(card, yourItems, used);
        if (!item && tradeItemsCache.length) item = matchOverlayItem(card, tradeItemsCache, used);
        if (item) injectCardOverlay(card, item);
    }

    used = new Set();
    for (const card of theirCards) {
        let item = theirItems.length ? matchOverlayItem(card, theirItems, used) : null;
        if (!item && tradeItemsCache.length) item = matchOverlayItem(card, tradeItemsCache, used);
        if (item) injectCardOverlay(card, item);
    }

    if (!yourCards.length && !theirCards.length) applyTradeOverlays();
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
    const items = getActiveTradeItems();
    if (!items.length) return;
    const cards = getAllCards();
    if (!cards.length) return;
    const usedCards = new Set();
    for (const item of items) {
        const card = findCardForTradeItem(item, cards, usedCards);
        if (card) injectCardOverlay(card, item);
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
            ? 'Unlock — blocked from extension Quick Sell'
            : 'Lock — blocks extension Quick Sell (panel + confirm modal)';
        btn.innerHTML = locked
            ? '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>'
            : '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 019.9-1"/></svg>';
        btn.addEventListener('click', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            await csrToggleWeaponLock(item.weapon_id);
            injectCardOverlay(cardEl, item);
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

/** Sidebar inset only when the left nav is expanded (wide), not the collapsed icon rail. */
function measureSidebarInset() {
    if (!isInventoryPage() && !isMarketplacePage()) return 0;
    let inset = 0;
    for (const el of document.querySelectorAll('aside, nav, div')) {
        const r = el.getBoundingClientRect();
        if (r.left > 12) continue;
        if (r.width < 130 || r.width > 380) continue;
        if (r.height < window.innerHeight * 0.35) continue;
        const t = (el.innerText || '').toLowerCase();
        if (!t.includes('matchmaking') || !t.includes('inventory')) continue;
        if (t.length > 400) continue;
        inset = Math.max(inset, Math.round(r.right));
    }
    return inset;
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
        bar.style.marginLeft = '';
        bar.style.width = '';
        bar.style.maxWidth = '';
        if (tradeModal) repositionTradeBrowseBar();
    } else {
        const inset = measureSidebarInset();
        if (inset > 0) {
            bar.style.marginLeft = `${inset}px`;
            bar.style.width = `calc(100% - ${inset}px)`;
        } else {
            bar.style.marginLeft = '';
            bar.style.width = '';
        }
        bar.style.maxWidth = '';
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
            ? `${cards.length} items`
            : `Showing ${visible.length} of ${cards.length} items`;
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
    <input id="csrx-browse-search" type="search" placeholder="Search weapon or skin…" autocomplete="off" spellcheck="false">
    <button type="button" id="csrx-browse-clear">Clear</button>
</div>
<div id="csrx-browse-count"></div>`;
        wrap.querySelector('#csrx-browse-search').addEventListener('input', scheduleBrowseFilters);
        wrap.querySelector('#csrx-browse-clear').addEventListener('click', clearBrowseFilters);
        return wrap;
    }

    const rarityOpts = ['<option value="">All rarities</option>']
        .concat(rarityEntries().map(([k, v]) =>
            `<option value="${k}">${v.name}</option>`
        )).join('');

    const wearOpts = ['<option value="">All wear</option>',
        '<option value="FN">Factory New</option>',
        '<option value="MW">Minimal Wear</option>',
        '<option value="FT">Field-Tested</option>',
        '<option value="WW">Well-Worn</option>',
        '<option value="BS">Battle-Scarred</option>',
    ].join('');

    const floatOpts = ['<option value="">Float order</option>',
        '<option value="asc">Float: Low → High</option>',
        '<option value="desc">Float: High → Low</option>',
    ].join('');

    const priceOpts = mp ? [
        '<select id="csrx-browse-price" title="Sort by price">',
        '<option value="">Price order</option>',
        '<option value="asc">Cheapest first</option>',
        '<option value="desc">Most expensive first</option>',
        '</select>',
    ].join('') : '';

    wrap.innerHTML = `
<div class="csrx-browse-row">
    <input id="csrx-browse-search" type="search" placeholder="Search weapon or skin…" autocomplete="off" spellcheck="false">
    <div class="csrx-browse-filters">
        <select id="csrx-browse-rarity" title="Filter by rarity">${rarityOpts}</select>
        <select id="csrx-browse-wear" title="Filter by wear">${wearOpts}</select>
        <select id="csrx-browse-float" title="Sort by float">${floatOpts}</select>
        ${priceOpts}
        <button type="button" id="csrx-browse-clear">Clear</button>
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
    const used = new Set();
    try {
        for (const cardEl of cards) {
            const item = matchOverlayItem(cardEl, cache, used);
            if (!item) {
                cardEl.querySelector('.csrx-card-wrap')?.remove();
                continue;
            }
            injectCardOverlay(cardEl, item);
        }
        pruneOrphanOverlays(cardSet);
    } finally {
        _currentOverlayCards = null;
    }
    if (isTradePickerModal()) hideTradePickerEmptySlots();
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
            applyOverlaysToAll({ urgent: true });
        }
    }, 6000);
}

function stopAlwaysOnOverlay() {
    overlayRunning = false;
    _overlayBootGen++;
    clearTimeout(_overlayBootTimer);
    clearInterval(overlayTimer);
    overlayTimer = null;
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
fab.title = 'CS:R Quick Sell & Market — pick skins, list or instant sell';
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
        <div class="csrx-hdr-title">Quick Sell &amp; Market</div>
        <div class="csrx-hdr-sub">Pick skins · list on market or instant sell</div>
    </div>
    <div id="csrx-winx">
        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#333" stroke-width="2.5" stroke-linecap="round">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
    </div>
</div>
<div id="csrx-statusbar">
    <div class="csrx-dot" id="csrx-dot"></div>
    <span id="csrx-stat">Ready</span>
</div>
<div id="csrx-body">
    <div>
        <div class="csrx-section">Picker</div>
        <div style="display:flex;flex-direction:column;gap:7px;">
            <button id="csrx-modbtn" class="csrx-btn csrx-btn-primary">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
                    <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/>
                    <polyline points="10 17 15 12 10 7"/>
                    <line x1="15" y1="12" x2="3" y2="12"/>
                </svg>
                Start Picking
            </button>
            <div id="csrx-picked-info">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
                    <polyline points="20 6 9 17 4 12"/>
                </svg>
                <span id="csrx-picked-count">0 items selected</span>
            </div>
            <button id="csrx-selbtn" class="csrx-btn csrx-btn-success" style="display:none;" disabled>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
                    <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                </svg>
                Review &amp; Sell
            </button>
        </div>
    </div>
    <div>
        <div class="csrx-section">Global</div>
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
                Sell by Rarity
            </button>
        </div>
    </div>
    <div>
        <div class="csrx-section">Speed</div>
        <div class="csrx-slider-wrap">
            <div class="csrx-slider-row">
                <span class="csrx-slider-lbl">Batch size</span>
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
            <div class="csrx-mhdr-title">Confirm <span>Sale</span></div>
            <div class="csrx-mhdr-sub" id="csrx-mhdr-sub">Quick sell or list on marketplace</div>
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
        Some items could not be verified and will be skipped.
    </div>
    <div id="csrx-validator">
        <div class="csrx-val-title">Validation Report</div>
        <div class="csrx-val-grid" id="csrx-val-grid"></div>
    </div>
    <div id="csrx-mgrid"></div>
    <div id="csrx-mfoot">
        <div id="csrx-msumm">
            <div class="csrx-summ-count" id="csrx-summ-count">0 items</div>
            <div class="csrx-summ-sub"   id="csrx-summ-sub">ready to sell</div>
        </div>
        <button id="csrx-mcancel" class="m-btn">Cancel</button>
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

    const urls = [...new Set([
        storedUrl,
        MP_ADD_URL,
        'https://api.csrestored.fun/inventory/marketplace/create',
        'https://api.csrestored.fun/inventory/marketplace/list',
    ].filter(Boolean))];

    const payloads = [...new Set([
        JSON.stringify({ weapon_id: wid, price }),
        JSON.stringify(buildMarketListPayload(wid, price)),
        JSON.stringify({ weapon_id: wid, price_coins: price }),
    ])].map(s => JSON.parse(s));

    for (const url of urls) {
        for (const body of payloads) {
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
    const cards=getAllCards(); const idx=cards.indexOf(cardEl); const imgId=getImgItemId(cardEl);
    if(idx>=0&&idx<inv.length){
        const cand=inv[idx];
        if(imgId===cand.item_id&&!usedIds.has(cand.weapon_id))return{item:cand,confidence:'high'};
    }
    const paras=[...cardEl.querySelectorAll('p')];
    const wear=paras.find(p=>['FN','MW','FT','WW','BS'].includes(p.textContent?.trim()))?.textContent?.trim();
    const hasSt=(paras[0]?.textContent?.trim()||'').toLowerCase().startsWith('stattrak');
    if(imgId!=null){
        const cands=inv.filter(i=>i.item_id===imgId&&!usedIds.has(i.weapon_id)&&(!wear||getCondition(i.float)===wear)&&i.stattrak===hasSt);
        if(cands.length===1)return{item:cands[0],confidence:'medium'};
        if(cands.length>1) return{item:cands[0],confidence:'low'};
        const c2=inv.filter(i=>i.item_id===imgId&&!usedIds.has(i.weapon_id)&&(!wear||getCondition(i.float)===wear));
        if(c2.length>0)return{item:c2[0],confidence:'low'};
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
    setStatus('Click to pick','active');
    btnMode.innerHTML=`<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg> Cancel`;
    btnMode.className='csrx-btn csrx-btn-cancel';
    btnSell.style.display='block';
    document.getElementById('csrx-picked-info').classList.add('show');
    updateSelBtn();
}
function exitSel() {
    selMode=false; setStatus('Ready','ready');
    btnMode.innerHTML=`<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg> Start Picking`;
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
    document.getElementById('csrx-picked-count').textContent=`${n} item${n!==1?'s':''} selected`;
    btnSell.innerHTML=`<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg> Review &amp; Sell (${n})`;
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
            toast('This skin is locked — unlock it on the card first','warn');
            return;
        }
        if(result){
            card._csrxWid=result.item.weapon_id; card._csrxConf=result.confidence;
            picked.set(card,result.item.weapon_id);
            if(result.confidence==='low')toast('Ambiguous match — verify in modal','warn');
        } else {
            card._csrxWid=null; card._csrxConf='none';
            picked.set(card,null); toast('Item not found in inventory','error');
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
        body.innerHTML=`<div class="mc-weapon">Unknown</div><div class="mc-skin" style="color:#ef4444;">Not Found</div><div style="margin-top:4px;font-size:9px;font-weight:500;padding:2px 6px;border-radius:4px;background:rgba(239,68,68,0.08);color:#ef4444;border:1px solid rgba(239,68,68,0.15);display:inline-block;">${entry.msg||'Error'}</div>`;
        rm=document.createElement('button');
        rm.type='button';
        rm.className='mc-rm mc-rm-float';
        rm.title='Remove';
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
            const pl=document.createElement('span');pl.className='mc-pattern-lbl';pl.textContent='Pattern';
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
        qsEl.textContent=qsPrice!=null?`Quick sell: ${formatCoins(qsPrice)}`:'Quick sell: —';
        priceBlock.appendChild(qsEl);

        rm=document.createElement('button');
        rm.type='button';
        rm.className='mc-rm';
        rm.title='Remove from sale list';
        rm.innerHTML=`<svg width="7" height="7" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="3" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;

        const mLbl=document.createElement('div');mLbl.className='mc-market-lbl';mLbl.textContent='Market price (coins)';
        priceBlock.appendChild(mLbl);
        const mRow=document.createElement('div');mRow.className='mc-market-row';
        const mInp=document.createElement('input');
        mInp.type='text';
        mInp.inputMode='numeric';
        mInp.pattern='[0-9,]*';
        mInp.className='mc-market-price';
        mInp.placeholder='Enter price…';
        mInp.value='';
        mInp.setAttribute('maxlength', '9');
        mInp.title=`Max ${MAX_MARKET_PRICE_COINS.toLocaleString('en-US')} coins`;
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
    document.getElementById('csrx-summ-count').textContent=`${good} item${good!==1?'s':''}`;

    let qsTotal = 0;
    let qsKnown = 0;
    getConfirmedModalItems().forEach(({ item }) => {
        const p = getQuickSellPrice(item);
        if (p != null) { qsTotal += p; qsKnown++; }
    });
    const sub = document.getElementById('csrx-summ-sub');
    if (good > 0 && qsKnown > 0) {
        sub.textContent = `Quick sell total: ${formatCoins(qsTotal)}`;
    } else if (good > 0) {
        sub.textContent = 'Set market price · quick sell shown per item';
    } else {
        sub.textContent = 'nothing to sell';
    }

    const listB = document.getElementById('csrx-mlist');
    const quickB = document.getElementById('csrx-mquick');
    listB.innerHTML = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 01-8 0"/></svg> List ${good} on Market`;
    quickB.innerHTML = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg> Quick Sell ${good}`;
    listB.disabled = good === 0;
    quickB.disabled = good === 0;
    document.getElementById('csrx-mwarn').classList.toggle('show',bad>0);
    document.getElementById('csrx-mhdr-sub').textContent=`${good} verified · ${bad} skipped · ${all.length} total`;
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
        const sl={ok:'OK',mismatch:'Warn',not_found:'Error',sold_or_missing:'Gone'}[e.status]||'?';
        const sc2=e.status==='mismatch'?'#f59e0b':'#ef4444';
        row.innerHTML=`<svg class="csrx-val-icon" viewBox="0 0 24 24" fill="none" stroke="${sc2}" stroke-width="2" stroke-linecap="round"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg><span class="csrx-val-name">${e.item?.name||`ID: ${e.weaponId}`}</span><span class="csrx-val-status ${sc}">${sl}</span>`;
        grid.appendChild(row);
    });
}

async function openModal(entries){
    const allowed = entries.filter(e => e.weaponId == null || !csrIsWeaponLocked(e.weaponId));
    const blocked = entries.length - allowed.length;
    if (blocked) toast(`${blocked} locked item${blocked !== 1 ? 's' : ''} skipped`, 'warn');
    if (!allowed.length) return;
    setStatus('Validating…','syncing');
    const fresh=await apiInv();
    setStatus('Review','active');
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
    if(selling)return; overlay.classList.remove('open'); setStatus('Ready','ready');
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
        setStatus(`Quick selling ${sold}/${toSell.length}…`, 'syncing');
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
        setStatus(`Listing ${listed}/${toList.length}…`, 'syncing');
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
    setModalBusy(true, 'Selling…');
    const { sold, failed } = await runQuickSell(toSell);
    selling = false;
    closeModal();
    toast(`Quick sold ${sold} item${sold !== 1 ? 's' : ''}${failed ? ` · ${failed} failed` : ''}`, sold > 0 ? 'success' : 'error');
    if (selMode) exitSel();
    setTimeout(() => location.reload(), 1800);
});

document.getElementById('csrx-mlist').addEventListener('click', async () => {
    if (selling) return;
    const { toList, missing, overMax } = collectMarketListItems();
    if (overMax > 0) {
        toast(`Market price cannot exceed ${MAX_MARKET_PRICE_COINS.toLocaleString('en-US')} coins`, 'warn');
        return;
    }
    if (missing > 0) {
        toast('Enter a market price (coins) for each item', 'warn');
        return;
    }
    if (!toList.length) return;
    selling = true;
    setModalBusy(true, 'Listing…');
    const { listed, failed } = await runListOnMarket(toList);
    selling = false;
    closeModal();
    if (listed > 0) {
        toast(`Listed ${listed} on marketplace${failed ? ` · ${failed} failed` : ''}`, 'success');
    } else {
        toast('Could not list on marketplace — open Marketplace, create one offer on the site, then retry', 'error');
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
    if(skipped)toast(`${skipped} locked item${skipped!==1?'s':''} skipped`,'warn');
    if(!entries.length)return;
    await openModal(entries);
});

document.getElementById('csrx-massbtn').addEventListener('click',async()=>{
    if(selling)return;
    const val=parseInt(document.getElementById('csrx-rar').value);
    setStatus('Fetching…','syncing');
    const inv=await apiInv();
    setStatus('Ready','ready');
    const items=inv.filter(i=>parseInt(i.rarity)===val&&!csrIsItemSellBlocked(i));
    const lockedSkip=inv.filter(i=>parseInt(i.rarity)===val&&csrIsItemSellBlocked(i)).length;
    if(lockedSkip)toast(`${lockedSkip} locked item${lockedSkip!==1?'s':''} skipped`,'info');
    if(!items.length){toast('No items for selected rarity','warn');return;}
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

function applyCsrFeatureVisibility() {
    syncQuickSellPanelVisibility();
}

async function bootstrapCsrExtension() {
    await csrLoadSettings();
    csrWatchStorageChanges();
    csrOnSettingsChanged(() => {
        applyCsrFeatureVisibility();
        cleanupOrphanTradeBrowse();
        checkPageAndRun();
        applyOverlaysToAll({ urgent: true });
    });
    applyCsrFeatureVisibility();
    checkPageAndRun();
    setInterval(checkPageAndRun, 1500);
}

bootstrapCsrExtension();
})();