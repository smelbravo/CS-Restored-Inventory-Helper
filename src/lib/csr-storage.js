/**
 * Extension preferences — local storage or browser sync (Firefox Sync / Chrome sync).
 * Toggle flag always lives in storage.local.
 */
(function (global) {
    'use strict';

    const SYNC_TOGGLE_KEY = 'csrBrowserSyncEnabled';
    const EXPORT_VERSION = 1;
    const MAX_LOCKED_IDS = 5000;

    const SYNCABLE_KEYS = [
        'csrFeatureSettings',
        'csrLockedWeaponIds',
        'csrCasesAutoOpenSellConfig',
        'csrCasesAutoOpenConfig',
        'csrCaseOpeningStats',
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
        if (!st) return Promise.reject(new Error('storage_unavailable'));
        return new Promise((resolve, reject) => {
            try {
                st.set(obj, () => {
                    const err = typeof chrome !== 'undefined' && chrome.runtime?.lastError;
                    if (err) reject(new Error(String(err.message || err)));
                    else resolve();
                });
            } catch (_) {
                st.set(obj).then(() => resolve()).catch((e) => reject(e));
            }
        });
    }

    function storageRemove(area, keys) {
        const st = areaApi(area);
        if (!st) return Promise.resolve();
        const keyList = Array.isArray(keys) ? keys : [keys];
        return new Promise((resolve) => {
            try {
                st.remove(keyList, () => resolve());
            } catch (_) {
                st.remove(keyList).then(() => resolve()).catch(() => resolve());
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

    const FEATURE_DEFAULTS = global.CSR_SETTINGS_DEFAULTS || {
        floatOverlays: true,
        browseFilters: true,
        quickSellPanel: true,
        caseBulkBuy: true,
        caseAutoOpen: true,
        sellHubPage: true,
        tradeSearch: true,
        tradeFloatOverlays: true,
        skinLock: true,
    };

    function normalizeImportPayload(raw) {
        const payload = {};
        if (!raw || typeof raw !== 'object') return payload;

        if (raw.csrFeatureSettings && typeof raw.csrFeatureSettings === 'object') {
            const out = { ...FEATURE_DEFAULTS };
            for (const k of Object.keys(FEATURE_DEFAULTS)) {
                if (typeof raw.csrFeatureSettings[k] === 'boolean') out[k] = raw.csrFeatureSettings[k];
            }
            payload.csrFeatureSettings = out;
        }

        if (Array.isArray(raw.csrLockedWeaponIds)) {
            const ids = [];
            for (const id of raw.csrLockedWeaponIds) {
                const n = parseInt(id, 10);
                if (Number.isFinite(n) && n > 0) ids.push(n);
                if (ids.length >= MAX_LOCKED_IDS) break;
            }
            payload.csrLockedWeaponIds = ids;
        }

        if (raw.csrLanguage && typeof raw.csrLanguage === 'string') {
            payload.csrLanguage = raw.csrLanguage.trim().slice(0, 16);
        }

        if (typeof raw.csrAutoUpdateCheck === 'boolean') {
            payload.csrAutoUpdateCheck = raw.csrAutoUpdateCheck;
        }

        if (raw.csrCasesAutoOpenSellConfig && typeof raw.csrCasesAutoOpenSellConfig === 'object') {
            payload.csrCasesAutoOpenSellConfig = raw.csrCasesAutoOpenSellConfig;
        }

        if (raw.csrCasesAutoOpenConfig && typeof raw.csrCasesAutoOpenConfig === 'object') {
            payload.csrCasesAutoOpenConfig = raw.csrCasesAutoOpenConfig;
        }

        if (raw.csrCaseOpeningStats && typeof raw.csrCaseOpeningStats === 'object') {
            payload.csrCaseOpeningStats = raw.csrCaseOpeningStats;
        }

        return payload;
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
            const merged = mergeForSyncEnable(localData, syncData);
            await storageRemove('sync', SYNCABLE_KEYS);
            if (Object.keys(merged).length) await storageSet('sync', merged);
            await storageRemove('local', SYNCABLE_KEYS);
        } else {
            const syncData = await storageGet('sync', SYNCABLE_KEYS);
            const toLocal = {};
            for (const k of SYNCABLE_KEYS) {
                if (syncData[k] !== undefined) toLocal[k] = syncData[k];
            }
            if (Object.keys(toLocal).length) await storageSet('local', toLocal);
            await storageRemove('sync', SYNCABLE_KEYS);
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
        const enabled = await csrIsBrowserSyncEnabled();
        const data = enabled
            ? await csrPrefsGet(SYNCABLE_KEYS)
            : await storageGet('local', SYNCABLE_KEYS);
        const settings = {};
        for (const k of SYNCABLE_KEYS) {
            if (data[k] !== undefined) settings[k] = data[k];
        }
        return {
            version: EXPORT_VERSION,
            exportedAt: new Date().toISOString(),
            settings,
        };
    }

    /** Local snapshot wins when enabling sync — avoids stale cloud/sync data overwriting a fresh import. */
    function mergeForSyncEnable(localData, syncData) {
        const hasLocal = SYNCABLE_KEYS.some((k) => localData[k] !== undefined);
        if (hasLocal) {
            const out = {};
            for (const k of SYNCABLE_KEYS) {
                if (localData[k] !== undefined) out[k] = localData[k];
            }
            return out;
        }
        const out = {};
        for (const k of SYNCABLE_KEYS) {
            if (syncData[k] !== undefined) out[k] = syncData[k];
        }
        return out;
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
        let payload = normalizeImportPayload(settings);
        if (!Object.keys(payload).length) throw new Error('empty');
        if (merge) {
            const existing = await csrExportSettings();
            const existingSettings = existing.settings || {};
            for (const k of SYNCABLE_KEYS) {
                if (payload[k] === undefined && existingSettings[k] !== undefined) {
                    payload[k] = existingSettings[k];
                }
            }
        }
        await storageSet('local', payload);
        try {
            if (await csrIsBrowserSyncEnabled()) {
                await storageRemove('sync', SYNCABLE_KEYS);
                await storageSet('sync', payload);
            } else {
                await storageRemove('sync', SYNCABLE_KEYS);
            }
        } catch (_) { /* sync quota — local import still applied */ }
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

    const DOPPLER_MAP_STORAGE_KEY = 'csrItemIdFinishMap';
    const RECENT_DROPS_KEY = 'csrRecentDrops';
    const RECENT_DROPS_MAX = 400;
    const DOPPLER_MAP_FINISH_IDS = new Set([
        415, 416, 417, 418, 419, 420, 421,
        617, 618, 619, 852, 853, 854, 855,
        568, 569, 570, 571, 572,
        1119, 1120, 1121, 1122, 1123,
    ]);

    function normalizeDopplerMapEntries(raw) {
        let map = raw;
        if (raw && typeof raw === 'object' && raw.map && typeof raw.map === 'object') {
            map = raw.map;
        }
        if (!map || typeof map !== 'object') return {};
        const out = {};
        for (const [k, v] of Object.entries(map)) {
            if (k.startsWith('_')) continue;
            const fc = parseInt(v, 10);
            if (!Number.isFinite(fc) || !DOPPLER_MAP_FINISH_IDS.has(fc)) continue;
            out[String(k)] = fc;
        }
        return out;
    }

    async function csrExportDopplerMap() {
        const data = await storageGet('local', [DOPPLER_MAP_STORAGE_KEY]);
        const stored = normalizeDopplerMapEntries(data[DOPPLER_MAP_STORAGE_KEY] || {});
        return {
            version: 1,
            exportedAt: new Date().toISOString(),
            _comment: 'CS:R CDN item_id → skin_index (Doppler/Gamma). Learned by extension or merged from community map.',
            ...stored,
        };
    }

    async function csrImportDopplerMap(raw, opts) {
        const merge = opts?.merge !== false;
        let blob = raw;
        if (typeof raw === 'string') {
            try {
                blob = JSON.parse(raw);
            } catch (_) {
                throw new Error('invalid_json');
            }
        }
        const incoming = normalizeDopplerMapEntries(blob);
        if (!Object.keys(incoming).length) throw new Error('empty');
        const data = await storageGet('local', [DOPPLER_MAP_STORAGE_KEY]);
        const existing = normalizeDopplerMapEntries(data[DOPPLER_MAP_STORAGE_KEY] || {});
        const next = merge ? { ...existing, ...incoming } : { ...incoming };
        await storageSet('local', { [DOPPLER_MAP_STORAGE_KEY]: next });
        return {
            imported: Object.keys(incoming).length,
            total: Object.keys(next).length,
        };
    }

    function recentDropRowKey(row) {
        if (row?.weapon_id != null) return `w${row.weapon_id}`;
        const name = String(row?.name || '').trim();
        const fl = row?.float != null ? Number(row.float).toFixed(6) : '';
        const seed = row?.seed != null ? String(row.seed) : '';
        return `s${name}|${fl}|${seed}`;
    }

    function normalizeRecentDrops(raw) {
        if (!Array.isArray(raw)) return [];
        const out = [];
        for (const row of raw) {
            if (!row || typeof row !== 'object') continue;
            const weapon_id = row.weapon_id != null ? parseInt(row.weapon_id, 10) : null;
            const at = row.at != null ? Number(row.at) : 0;
            const name = String(row.name || '').trim();
            const fl = row.float != null && !Number.isNaN(parseFloat(row.float)) ? parseFloat(row.float) : null;
            const seed = row.seed != null ? parseInt(row.seed, 10) : null;
            if (!weapon_id && !name) continue;
            out.push({
                weapon_id: Number.isFinite(weapon_id) && weapon_id > 0 ? weapon_id : null,
                at: Number.isFinite(at) && at > 0 ? at : Date.now(),
                name,
                float: fl,
                seed: Number.isFinite(seed) ? seed : null,
            });
        }
        return out;
    }

    async function csrGetRecentDrops() {
        const data = await storageGet('local', [RECENT_DROPS_KEY]);
        return normalizeRecentDrops(data[RECENT_DROPS_KEY]);
    }

    async function csrRecordRecentDrops(entries) {
        const list = Array.isArray(entries) ? entries : [entries];
        if (!list.length) return csrGetRecentDrops();
        const cur = await csrGetRecentDrops();
        const byKey = new Map(cur.map((r) => [recentDropRowKey(r), r]));
        const now = Date.now();
        for (const e of list) {
            if (!e || typeof e !== 'object') continue;
            const weapon_id = e.weapon_id != null ? parseInt(e.weapon_id, 10) : null;
            const row = {
                weapon_id: Number.isFinite(weapon_id) && weapon_id > 0 ? weapon_id : null,
                at: e.at != null ? Number(e.at) : now,
                name: String(e.name || '').trim(),
                float: e.float != null && !Number.isNaN(parseFloat(e.float)) ? parseFloat(e.float) : null,
                seed: e.seed != null ? parseInt(e.seed, 10) : null,
            };
            if (!row.weapon_id && !row.name) continue;
            byKey.set(recentDropRowKey(row), row);
        }
        const merged = [...byKey.values()]
            .sort((a, b) => b.at - a.at)
            .slice(0, RECENT_DROPS_MAX);
        await storageSet('local', { [RECENT_DROPS_KEY]: merged });
        return merged;
    }

    global.CSR_RECENT_DROPS_KEY = RECENT_DROPS_KEY;
    global.CSR_SYNCABLE_KEYS = SYNCABLE_KEYS;
    global.CSR_SYNC_TOGGLE_KEY = SYNC_TOGGLE_KEY;
    global.CSR_MAX_LOCKED_IDS = MAX_LOCKED_IDS;
    global.csrIsBrowserSyncEnabled = csrIsBrowserSyncEnabled;
    global.csrSetBrowserSyncEnabled = csrSetBrowserSyncEnabled;
    global.csrPrefsGet = csrPrefsGet;
    global.csrPrefsSet = csrPrefsSet;
    global.csrWatchPrefsChanges = csrWatchPrefsChanges;
    global.csrExportSettings = csrExportSettings;
    global.csrImportSettings = csrImportSettings;
    global.csrExportDopplerMap = csrExportDopplerMap;
    global.csrImportDopplerMap = csrImportDopplerMap;
    global.csrGetRecentDrops = csrGetRecentDrops;
    global.csrRecordRecentDrops = csrRecordRecentDrops;
    global.csrIsFirefoxBrowser = csrIsFirefoxBrowser;

})(typeof globalThis !== 'undefined' ? globalThis : window);
