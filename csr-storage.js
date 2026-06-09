/**
 * Extension preferences — local storage or browser sync (Firefox Sync / Chrome sync).
 * Toggle flag always lives in storage.local.
 */
(function (global) {
    'use strict';

    const SYNC_TOGGLE_KEY = 'csrBrowserSyncEnabled';
    const EXPORT_VERSION = 1;

    const SYNCABLE_KEYS = [
        'csrFeatureSettings',
        'csrLockedWeaponIds',
        'csrCasesAutoOpenSellConfig',
        'csrCasesAutoOpenConfig',
        'csrLanguage',
        'csrAutoUpdateCheck',
    ];

    let syncEnabledCache = null;

    function storageRoot() {
        if (typeof browser !== 'undefined' && browser.storage) return browser.storage;
        if (typeof chrome !== 'undefined' && chrome.storage) return chrome.storage;
        return null;
    }

    function areaApi(area) {
        return storageRoot()?.[area] || null;
    }

    function storageGet(area, keys) {
        const st = areaApi(area);
        if (!st) return Promise.resolve({});
        const keyList = Array.isArray(keys) ? keys : [keys];
        return new Promise((resolve) => {
            try {
                st.get(keyList, (data) => {
                    const err = typeof chrome !== 'undefined' && chrome.runtime?.lastError;
                    resolve(err ? {} : (data || {}));
                });
            } catch (_) {
                st.get(keyList).then((data) => resolve(data || {})).catch(() => resolve({}));
            }
        });
    }

    function storageSet(area, obj) {
        const st = areaApi(area);
        if (!st) return Promise.resolve();
        return new Promise((resolve) => {
            try {
                st.set(obj, () => resolve());
            } catch (_) {
                st.set(obj).then(() => resolve()).catch(() => resolve());
            }
        });
    }

    async function csrIsBrowserSyncEnabled() {
        if (syncEnabledCache !== null) return syncEnabledCache;
        const data = await storageGet('local', [SYNC_TOGGLE_KEY]);
        syncEnabledCache = data[SYNC_TOGGLE_KEY] === true;
        return syncEnabledCache;
    }

    function prefsArea(enabled) {
        return enabled ? 'sync' : 'local';
    }

    async function csrPrefsGet(keys) {
        const keyList = Array.isArray(keys) ? keys : [keys];
        const enabled = await csrIsBrowserSyncEnabled();
        let data = await storageGet(prefsArea(enabled), keyList);

        if (enabled) {
            const missing = keyList.filter((k) => data[k] === undefined);
            if (missing.length) {
                const localData = await storageGet('local', missing);
                const toMigrate = {};
                for (const k of missing) {
                    if (localData[k] !== undefined) {
                        data[k] = localData[k];
                        toMigrate[k] = localData[k];
                    }
                }
                if (Object.keys(toMigrate).length) {
                    await storageSet('sync', toMigrate);
                }
            }
        }
        return data;
    }

    async function csrPrefsSet(obj) {
        if (!obj || typeof obj !== 'object') return;
        const enabled = await csrIsBrowserSyncEnabled();
        await storageSet(prefsArea(enabled), obj);
    }

    async function csrSetBrowserSyncEnabled(enabled) {
        const on = !!enabled;
        if (on) {
            const localData = await storageGet('local', SYNCABLE_KEYS);
            const syncData = await storageGet('sync', SYNCABLE_KEYS);
            const merged = {};
            for (const k of SYNCABLE_KEYS) {
                if (localData[k] !== undefined) merged[k] = localData[k];
                else if (syncData[k] !== undefined) merged[k] = syncData[k];
            }
            if (Object.keys(merged).length) await storageSet('sync', merged);
        } else {
            const syncData = await storageGet('sync', SYNCABLE_KEYS);
            const toLocal = {};
            for (const k of SYNCABLE_KEYS) {
                if (syncData[k] !== undefined) toLocal[k] = syncData[k];
            }
            if (Object.keys(toLocal).length) await storageSet('local', toLocal);
        }
        syncEnabledCache = on;
        await storageSet('local', { [SYNC_TOGGLE_KEY]: on });
    }

    function csrWatchPrefsChanges(onChange) {
        const api = typeof browser !== 'undefined' ? browser : (typeof chrome !== 'undefined' ? chrome : null);
        if (!api?.storage?.onChanged || typeof onChange !== 'function') return;
        api.storage.onChanged.addListener(async (changes, area) => {
            if (area === 'local' && changes[SYNC_TOGGLE_KEY]) {
                syncEnabledCache = changes[SYNC_TOGGLE_KEY].newValue === true;
            }
            const enabled = await csrIsBrowserSyncEnabled();
            const activeArea = enabled ? 'sync' : 'local';
            if (area !== activeArea) return;
            const relevant = {};
            for (const k of SYNCABLE_KEYS) {
                if (changes[k]) relevant[k] = changes[k].newValue;
            }
            if (Object.keys(relevant).length) onChange(relevant, area);
        });
    }

    async function csrExportSettings() {
        const data = await csrPrefsGet(SYNCABLE_KEYS);
        return {
            version: EXPORT_VERSION,
            exportedAt: new Date().toISOString(),
            settings: data,
        };
    }

    async function csrImportSettings(raw, opts) {
        const merge = opts?.merge === true;
        let blob = raw;
        if (typeof raw === 'string') {
            try {
                blob = JSON.parse(raw);
            } catch (_) {
                throw new Error('invalid_json');
            }
        }
        if (!blob || typeof blob !== 'object') throw new Error('invalid');
        const settings = blob.settings && typeof blob.settings === 'object' ? blob.settings : blob;
        const payload = {};
        for (const k of SYNCABLE_KEYS) {
            if (settings[k] !== undefined) payload[k] = settings[k];
        }
        if (!Object.keys(payload).length) throw new Error('empty');
        if (merge) {
            const existing = await csrPrefsGet(SYNCABLE_KEYS);
            for (const k of SYNCABLE_KEYS) {
                if (payload[k] === undefined && existing[k] !== undefined) {
                    payload[k] = existing[k];
                }
            }
        }
        await csrPrefsSet(payload);
        return payload;
    }

    function csrIsFirefoxBrowser() {
        try {
            if (typeof browser !== 'undefined' && typeof browser.runtime?.getBrowserInfo === 'function') {
                return true;
            }
        } catch (_) { /* ignore */ }
        const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
        return /Firefox\//i.test(ua) && !/Seamonkey/i.test(ua);
    }

    global.CSR_SYNCABLE_KEYS = SYNCABLE_KEYS;
    global.CSR_SYNC_TOGGLE_KEY = SYNC_TOGGLE_KEY;
    global.csrIsBrowserSyncEnabled = csrIsBrowserSyncEnabled;
    global.csrSetBrowserSyncEnabled = csrSetBrowserSyncEnabled;
    global.csrPrefsGet = csrPrefsGet;
    global.csrPrefsSet = csrPrefsSet;
    global.csrWatchPrefsChanges = csrWatchPrefsChanges;
    global.csrExportSettings = csrExportSettings;
    global.csrImportSettings = csrImportSettings;
    global.csrIsFirefoxBrowser = csrIsFirefoxBrowser;

})(typeof globalThis !== 'undefined' ? globalThis : window);
