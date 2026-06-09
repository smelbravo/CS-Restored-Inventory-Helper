'use strict';

/** Popup — loads i18n.js for translations. Same storage keys as settings.js. */

const FEATURES_KEY = 'csrFeatureSettings';
const LOCKS_KEY = 'csrLockedWeaponIds';
const SELL_CFG_KEY = 'csrCasesAutoOpenSellConfig';

const DEFAULTS = {
    floatOverlays: true,
    browseFilters: true,
    quickSellPanel: true,
    caseBulkBuy: true,
    caseAutoOpen: true,
    tradeSearch: true,
    skinLock: true,
};

const SELL_DEFAULTS = {
    mode: 'manual',
    timing: 'end',
    rarities: { 1: false, 2: false, 3: false, 4: false, 5: false, 6: false, 7: false },
    batchSize: 5,
};

function storageLocal() {
    if (typeof browser !== 'undefined' && browser.storage?.local) return browser.storage.local;
    if (typeof chrome !== 'undefined' && chrome.storage?.local) return chrome.storage.local;
    return null;
}

function normalizeFeatures(raw) {
    const out = { ...DEFAULTS };
    if (!raw || typeof raw !== 'object') return out;
    for (const k of Object.keys(DEFAULTS)) {
        if (typeof raw[k] === 'boolean') out[k] = raw[k];
    }
    return out;
}

function normalizeSellConfig(raw) {
    const out = {
        mode: SELL_DEFAULTS.mode,
        timing: SELL_DEFAULTS.timing,
        rarities: { ...SELL_DEFAULTS.rarities },
        batchSize: SELL_DEFAULTS.batchSize,
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

function normalizeLocks(raw) {
    const ids = [];
    if (!Array.isArray(raw)) return ids;
    for (const id of raw) {
        const n = parseInt(id, 10);
        if (Number.isFinite(n) && n > 0) ids.push(n);
    }
    return ids;
}

function readStorage(done) {
    const st = storageLocal();
    if (!st) {
        csrLoadLanguage().then(() => {
            done(normalizeFeatures(null), normalizeLocks(null), normalizeSellConfig(null));
        });
        return;
    }
    const finish = (data) => {
        csrLoadLanguage().then(() => {
            done(
                normalizeFeatures(data?.[FEATURES_KEY]),
                normalizeLocks(data?.[LOCKS_KEY]),
                normalizeSellConfig(data?.[SELL_CFG_KEY])
            );
        });
    };
    try {
        st.get([FEATURES_KEY, LOCKS_KEY, SELL_CFG_KEY, CSR_LANG_KEY], (data) => {
            const err = typeof chrome !== 'undefined' && chrome.runtime?.lastError;
            if (err) finish(null);
            else finish(data || null);
        });
    } catch (_) {
        st.get([FEATURES_KEY, LOCKS_KEY, SELL_CFG_KEY, CSR_LANG_KEY]).then(finish).catch(() => finish(null));
    }
}

function writeFeatures(features, sellCfg, done) {
    const st = storageLocal();
    if (!st) {
        if (done) done();
        return;
    }
    const payload = {
        [FEATURES_KEY]: normalizeFeatures(features),
        [SELL_CFG_KEY]: normalizeSellConfig(sellCfg),
    };
    try {
        st.set(payload, () => {
            if (done) done();
        });
    } catch (_) {
        st.set(payload).then(() => { if (done) done(); }).catch(() => { if (done) done(); });
    }
}

let featureState = { ...DEFAULTS };
let sellState = normalizeSellConfig(null);
let lockIds = [];

function applyPopupI18n() {
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.dataset.i18n;
        if (key) el.textContent = csrT(key);
    });
    document.documentElement.lang = csrGetLanguage().slice(0, 2);
}

function populateLanguageSelect() {
    const sel = document.getElementById('lang-select');
    if (!sel) return;
    const cur = csrGetLanguage();
    sel.innerHTML = csrGetSupportedLanguages()
        .map(({ code, label }) => `<option value="${code}">${label}</option>`)
        .join('');
    sel.value = cur;
}

function updateLockCount() {
    const lockEl = document.getElementById('lock-count');
    if (!lockEl) return;
    if (!lockIds.length) {
        lockEl.textContent = csrT('popup.lockCount.none');
    } else if (lockIds.length === 1) {
        lockEl.textContent = csrT('popup.lockCount.one', { n: lockIds.length });
    } else {
        lockEl.textContent = csrT('popup.lockCount.many', { n: lockIds.length });
    }
}

function readSellUi() {
    const modeEl = document.querySelector('input[name="sellMode"]:checked');
    const timingEl = document.querySelector('input[name="sellTiming"]:checked');
    const batchInp = document.getElementById('sell-batch');
    const rarities = { ...SELL_DEFAULTS.rarities };
    document.querySelectorAll('#sell-rarities input[data-rarity]').forEach(inp => {
        const r = parseInt(inp.dataset.rarity, 10);
        if (Number.isFinite(r)) rarities[r] = inp.checked;
    });
    const bs = parseInt(String(batchInp?.value ?? '').trim(), 10);
    return normalizeSellConfig({
        mode: modeEl?.value || 'manual',
        timing: timingEl?.value || 'end',
        rarities,
        batchSize: Number.isFinite(bs) ? bs : sellState.batchSize,
    });
}

function syncSellSubVisibility() {
    const sub = document.getElementById('case-auto-open-sub');
    const rarBox = document.getElementById('sell-rarities');
    const timingWrap = document.getElementById('sell-timing-wrap');
    const batchWrap = document.getElementById('sell-batch-wrap');
    const autoOn = featureState.caseAutoOpen;
    const sellAuto = sellState.mode !== 'manual';

    if (sub) sub.classList.toggle('is-off', !autoOn);
    if (rarBox) rarBox.hidden = !autoOn || sellState.mode !== 'rarities';
    if (timingWrap) timingWrap.hidden = !autoOn || !sellAuto;
    if (batchWrap) batchWrap.hidden = !autoOn || !sellAuto;
}

function syncCheckboxes() {
    document.querySelectorAll('#feature-list input[type="checkbox"][data-key]').forEach(inp => {
        const key = inp.dataset.key;
        if (key && key in featureState) inp.checked = featureState[key];
    });

    document.querySelectorAll('input[name="sellMode"]').forEach(inp => {
        inp.checked = inp.value === sellState.mode;
    });
    document.querySelectorAll('input[name="sellTiming"]').forEach(inp => {
        inp.checked = inp.value === sellState.timing;
    });
    document.querySelectorAll('#sell-rarities input[data-rarity]').forEach(inp => {
        const r = parseInt(inp.dataset.rarity, 10);
        inp.checked = !!sellState.rarities[r];
    });
    const batchInp = document.getElementById('sell-batch');
    if (batchInp) batchInp.value = String(sellState.batchSize);

    syncSellSubVisibility();
    updateLockCount();
}

function persist() {
    writeFeatures(featureState, sellState);
}

function switchTab(tab) {
    document.querySelectorAll('.popup-tab').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tab);
    });
    document.getElementById('panel-features')?.classList.toggle('active', tab === 'features');
    document.getElementById('panel-settings')?.classList.toggle('active', tab === 'settings');
}

document.querySelectorAll('.popup-tab').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab || 'features'));
});

document.querySelectorAll('#feature-list input[type="checkbox"][data-key]').forEach(inp => {
    inp.addEventListener('change', () => {
        const key = inp.dataset.key;
        if (!key || !(key in DEFAULTS)) return;
        featureState = { ...featureState, [key]: inp.checked };
        syncSellSubVisibility();
        persist();
    });
});

document.querySelectorAll('input[name="sellMode"]').forEach(inp => {
    inp.addEventListener('change', () => {
        if (!inp.checked) return;
        sellState = readSellUi();
        syncSellSubVisibility();
        persist();
    });
});

document.querySelectorAll('input[name="sellTiming"]').forEach(inp => {
    inp.addEventListener('change', () => {
        if (!inp.checked) return;
        sellState = readSellUi();
        persist();
    });
});

document.querySelectorAll('#sell-rarities input[data-rarity]').forEach(inp => {
    inp.addEventListener('change', () => {
        sellState = readSellUi();
        persist();
    });
});

document.getElementById('sell-batch')?.addEventListener('blur', (e) => {
    sellState = readSellUi();
    e.target.value = String(sellState.batchSize);
    persist();
});

document.getElementById('lang-select')?.addEventListener('change', (e) => {
    csrSaveLanguage(e.target.value).then(() => {
        applyPopupI18n();
        populateLanguageSelect();
        updateLockCount();
    });
});

document.getElementById('btn-reset')?.addEventListener('click', () => {
    featureState = { ...DEFAULTS };
    sellState = normalizeSellConfig(null);
    syncCheckboxes();
    persist();
});

setTimeout(() => {
    readStorage((features, locks, sellCfg) => {
        featureState = features;
        lockIds = locks;
        sellState = sellCfg;
        applyPopupI18n();
        populateLanguageSelect();
        syncCheckboxes();
    });
}, 0);
