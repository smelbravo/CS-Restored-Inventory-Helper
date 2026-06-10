/**
 * Shared feature toggles & skin locks (storage.local or storage.sync).
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
        caseAutoOpen: true,
        tradeSearch: true,
        skinLock: true,
    };

    let featureSettings = { ...CSR_SETTINGS_DEFAULTS };
    let lockedWeaponIds = new Set();
    const changeListeners = new Set();

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
        if (typeof csrPrefsGet !== 'function') {
            featureSettings = { ...CSR_SETTINGS_DEFAULTS };
            lockedWeaponIds = new Set();
            return { featureSettings, lockedWeaponIds };
        }
        const data = await csrPrefsGet([FEATURES_KEY, LOCKS_KEY]);
        featureSettings = normalizeFeatures(data[FEATURES_KEY]);
        lockedWeaponIds = normalizeLocks(data[LOCKS_KEY]);
        return { featureSettings, lockedWeaponIds };
    }

    async function csrSaveFeatureSettings(partial) {
        featureSettings = normalizeFeatures({ ...featureSettings, ...partial });
        if (typeof csrPrefsSet === 'function') {
            await csrPrefsSet({ [FEATURES_KEY]: featureSettings });
        }
        notifyChange();
        return featureSettings;
    }

    async function csrSaveLockedIds(ids) {
        lockedWeaponIds = normalizeLocks(ids);
        if (typeof csrPrefsSet === 'function') {
            await csrPrefsSet({ [LOCKS_KEY]: [...lockedWeaponIds] });
        }
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
        if (typeof csrWatchPrefsChanges !== 'function') return;
        csrWatchPrefsChanges((changes) => {
            let dirty = false;
            if (Object.prototype.hasOwnProperty.call(changes, FEATURES_KEY)) {
                featureSettings = normalizeFeatures(changes[FEATURES_KEY]);
                dirty = true;
            }
            if (Object.prototype.hasOwnProperty.call(changes, LOCKS_KEY)) {
                lockedWeaponIds = normalizeLocks(changes[LOCKS_KEY]);
                dirty = true;
            }
            if (dirty) notifyChange();
        });
    }

    global.CSR_SETTINGS_DEFAULTS = CSR_SETTINGS_DEFAULTS;
    global.csrLoadSettings = csrLoadSettings;
    global.csrSaveFeatureSettings = csrSaveFeatureSettings;
    global.csrIsFeatureEnabled = csrIsFeatureEnabled;
    global.csrIsWeaponLocked = csrIsWeaponLocked;
    global.csrToggleWeaponLock = csrToggleWeaponLock;
    global.csrOnSettingsChanged = csrOnSettingsChanged;
    global.csrWatchStorageChanges = csrWatchStorageChanges;
    global.csrGetLockedIds = () => [...lockedWeaponIds];

})(typeof globalThis !== 'undefined' ? globalThis : window);
