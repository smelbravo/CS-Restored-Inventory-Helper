/**
 * Shared feature toggles & skin locks (browser.storage.local).
 * Loaded before content.js and by popup.html.
 */
(function (global) {
    'use strict';

    const FEATURES_KEY = 'csrFeatureSettings';
    const LOCKS_KEY = 'csrLockedWeaponIds';

    const CSR_SETTINGS_DEFAULTS = {
        floatOverlays: true,
        browseFilters: true,
        quickSellPanel: true,
        caseBulkBuy: true,
        tradeSearch: true,
        skinLock: true,
    };

    const FEATURE_META = [
        { key: 'floatOverlays', label: 'Float & seed overlays', desc: 'Wear, float, and pattern on item cards' },
        { key: 'browseFilters', label: 'Search & filters', desc: 'Inventory, marketplace, and create offer' },
        { key: 'quickSellPanel', label: 'Quick Sell & Market', desc: 'Floating panel and confirm sale' },
        { key: 'caseBulkBuy', label: 'Case bulk buy', desc: 'Buy weapon cases in bulk on the Cases tab (goes to in-game inventory)' },
        { key: 'tradeSearch', label: 'Trade offer search', desc: 'Search bar in Send Trade Offer modal' },
        { key: 'skinLock', label: 'Skin lock', desc: 'Padlock on inventory cards — blocks extension Quick Sell only (not the site Weapon Details button)' },
    ];

    let featureSettings = { ...CSR_SETTINGS_DEFAULTS };
    let lockedWeaponIds = new Set();
    const changeListeners = new Set();

    function storageApi() {
        if (typeof browser !== 'undefined' && browser.storage?.local) return browser.storage.local;
        if (typeof chrome !== 'undefined' && chrome.storage?.local) return chrome.storage.local;
        return null;
    }

    function notifyChange() {
        for (const fn of changeListeners) {
            try { fn(featureSettings, lockedWeaponIds); } catch (_) { /* ignore */ }
        }
    }

    function normalizeFeatures(raw) {
        const out = { ...CSR_SETTINGS_DEFAULTS };
        if (!raw || typeof raw !== 'object') return out;
        for (const k of Object.keys(CSR_SETTINGS_DEFAULTS)) {
            if (typeof raw[k] === 'boolean') out[k] = raw[k];
        }
        return out;
    }

    function normalizeLocks(raw) {
        const set = new Set();
        if (!Array.isArray(raw)) return set;
        for (const id of raw) {
            const n = parseInt(id, 10);
            if (Number.isFinite(n) && n > 0) set.add(n);
        }
        return set;
    }

    async function csrLoadSettings() {
        const st = storageApi();
        if (!st) {
            featureSettings = { ...CSR_SETTINGS_DEFAULTS };
            lockedWeaponIds = new Set();
            return { featureSettings, lockedWeaponIds };
        }
        const data = await st.get([FEATURES_KEY, LOCKS_KEY]);
        featureSettings = normalizeFeatures(data[FEATURES_KEY]);
        lockedWeaponIds = normalizeLocks(data[LOCKS_KEY]);
        return { featureSettings, lockedWeaponIds };
    }

    async function csrSaveFeatureSettings(partial) {
        featureSettings = normalizeFeatures({ ...featureSettings, ...partial });
        const st = storageApi();
        if (st) await st.set({ [FEATURES_KEY]: featureSettings });
        notifyChange();
        return featureSettings;
    }

    async function csrSaveLockedIds(ids) {
        lockedWeaponIds = normalizeLocks(ids);
        const st = storageApi();
        if (st) await st.set({ [LOCKS_KEY]: [...lockedWeaponIds] });
        notifyChange();
        return lockedWeaponIds;
    }

    function csrIsFeatureEnabled(key) {
        return featureSettings[key] !== false;
    }

    function csrIsWeaponLocked(weaponId) {
        const wid = parseInt(weaponId, 10);
        return Number.isFinite(wid) && lockedWeaponIds.has(wid);
    }

    async function csrToggleWeaponLock(weaponId) {
        const wid = parseInt(weaponId, 10);
        if (!Number.isFinite(wid) || wid <= 0) return lockedWeaponIds;
        if (lockedWeaponIds.has(wid)) lockedWeaponIds.delete(wid);
        else lockedWeaponIds.add(wid);
        await csrSaveLockedIds([...lockedWeaponIds]);
        return lockedWeaponIds;
    }

    function csrOnSettingsChanged(fn) {
        if (typeof fn === 'function') changeListeners.add(fn);
    }

    function csrWatchStorageChanges() {
        const api = typeof browser !== 'undefined' ? browser : (typeof chrome !== 'undefined' ? chrome : null);
        if (!api?.storage?.onChanged) return;
        api.storage.onChanged.addListener((changes, area) => {
            if (area !== 'local') return;
            let dirty = false;
            if (changes[FEATURES_KEY]) {
                featureSettings = normalizeFeatures(changes[FEATURES_KEY].newValue);
                dirty = true;
            }
            if (changes[LOCKS_KEY]) {
                lockedWeaponIds = normalizeLocks(changes[LOCKS_KEY].newValue);
                dirty = true;
            }
            if (dirty) notifyChange();
        });
    }

    global.CSR_SETTINGS_DEFAULTS = CSR_SETTINGS_DEFAULTS;
    global.CSR_FEATURE_META = FEATURE_META;
    global.csrLoadSettings = csrLoadSettings;
    global.csrSaveFeatureSettings = csrSaveFeatureSettings;
    global.csrIsFeatureEnabled = csrIsFeatureEnabled;
    global.csrIsWeaponLocked = csrIsWeaponLocked;
    global.csrToggleWeaponLock = csrToggleWeaponLock;
    global.csrOnSettingsChanged = csrOnSettingsChanged;
    global.csrWatchStorageChanges = csrWatchStorageChanges;
    global.csrGetLockedIds = () => [...lockedWeaponIds];

})(typeof globalThis !== 'undefined' ? globalThis : window);
