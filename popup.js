'use strict';

/** Popup-only — does not load settings.js (faster open on Firefox). Uses same storage keys as settings.js. */

const FEATURES_KEY = 'csrFeatureSettings';
const LOCKS_KEY = 'csrLockedWeaponIds';

const DEFAULTS = {
    floatOverlays: true,
    browseFilters: true,
    quickSellPanel: true,
    caseBulkBuy: true,
    caseAutoOpen: false,
    tradeSearch: true,
    skinLock: true,
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
        done(normalizeFeatures(null), normalizeLocks(null));
        return;
    }
    const finish = (data) => {
        done(
            normalizeFeatures(data?.[FEATURES_KEY]),
            normalizeLocks(data?.[LOCKS_KEY])
        );
    };
    try {
        st.get([FEATURES_KEY, LOCKS_KEY], (data) => {
            const err = typeof chrome !== 'undefined' && chrome.runtime?.lastError;
            if (err) finish(null);
            else finish(data || null);
        });
    } catch (_) {
        st.get([FEATURES_KEY, LOCKS_KEY]).then(finish).catch(() => finish(null));
    }
}

function writeFeatures(features, done) {
    const st = storageLocal();
    if (!st) {
        if (done) done();
        return;
    }
    const payload = { [FEATURES_KEY]: normalizeFeatures(features) };
    try {
        st.set(payload, () => {
            if (done) done();
        });
    } catch (_) {
        st.set(payload).then(() => { if (done) done(); }).catch(() => { if (done) done(); });
    }
}

let featureState = { ...DEFAULTS };
let lockIds = [];

function updateLockCount() {
    const lockEl = document.getElementById('lock-count');
    if (!lockEl) return;
    lockEl.textContent = lockIds.length
        ? `${lockIds.length} skin${lockIds.length !== 1 ? 's' : ''} locked`
        : 'No locked skins';
}

function syncCheckboxes() {
    document.querySelectorAll('#feature-list input[type="checkbox"]').forEach(inp => {
        const key = inp.dataset.key;
        if (key && key in featureState) inp.checked = featureState[key];
    });
    updateLockCount();
}

document.querySelectorAll('#feature-list input[type="checkbox"]').forEach(inp => {
    inp.addEventListener('change', () => {
        const key = inp.dataset.key;
        if (!key || !(key in DEFAULTS)) return;
        featureState = { ...featureState, [key]: inp.checked };
        writeFeatures(featureState);
    });
});

document.getElementById('btn-reset')?.addEventListener('click', () => {
    featureState = { ...DEFAULTS };
    syncCheckboxes();
    writeFeatures(featureState);
});

setTimeout(() => {
    readStorage((features, locks) => {
        featureState = features;
        lockIds = locks;
        syncCheckboxes();
    });
}, 0);
