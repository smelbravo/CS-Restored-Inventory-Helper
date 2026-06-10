/**
 * Smoke test for csr-storage export/import logic (mocked browser storage).
 * Run: node scripts/test-import-export.mjs
 */
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

function createMockStorage() {
    const stores = { local: {}, sync: {} };
    const listeners = [];

    function area(name) {
        return {
            get(keys, cb) {
                const keyList = Array.isArray(keys) ? keys : [keys];
                const out = {};
                for (const k of keyList) {
                    if (stores[name][k] !== undefined) out[k] = stores[name][k];
                }
                if (typeof cb === 'function') cb(out);
                else return Promise.resolve(out);
            },
            set(obj, cb) {
                Object.assign(stores[name], obj);
                const changes = {};
                for (const [k, v] of Object.entries(obj)) {
                    changes[k] = { newValue: v };
                }
                for (const fn of listeners) fn(changes, name);
                if (typeof cb === 'function') cb();
                else return Promise.resolve();
            },
            remove(keys, cb) {
                const keyList = Array.isArray(keys) ? keys : [keys];
                for (const k of keyList) delete stores[name][k];
                if (typeof cb === 'function') cb();
                else return Promise.resolve();
            },
        };
    }

    return {
        stores,
        chrome: {
            storage: {
                local: area('local'),
                sync: area('sync'),
                onChanged: { addListener(fn) { listeners.push(fn); } },
            },
        },
    };
}

async function loadCsrStorage(mock) {
    const src = fs.readFileSync(path.join(root, 'csr-storage.js'), 'utf8');
    const ctx = {
        globalThis: {},
        browser: undefined,
        chrome: mock.chrome,
        console,
    };
    vm.runInContext(src, vm.createContext(ctx));
    return ctx.globalThis;
}

const SAMPLE = {
    csrFeatureSettings: { floatOverlays: false, skinLock: true },
    csrLockedWeaponIds: [101, 202],
    csrCasesAutoOpenSellConfig: { mode: 'nonGold', timing: 'each', batchSize: 3, rarities: { 1: false } },
    csrCasesAutoOpenConfig: { delayMs: 1500, minutes: 5, spendLimit: 50000 },
    csrLanguage: 'pt-PT',
    csrAutoUpdateCheck: false,
};

let passed = 0;
let failed = 0;

function assert(cond, msg) {
    if (cond) {
        passed++;
        console.log('  OK:', msg);
    } else {
        failed++;
        console.error('  FAIL:', msg);
    }
}

async function run() {
    console.log('csr-storage import/export tests\n');

    const mock = createMockStorage();
    mock.stores.local = { ...SAMPLE, csrBrowserSyncEnabled: false };
    const api = await loadCsrStorage(mock);

    const exported = await api.csrExportSettings();
    assert(exported.version === 1, 'export has version');
    assert(exported.settings.csrLanguage === 'pt-PT', 'export includes language');
    assert(exported.settings.csrLockedWeaponIds.length === 2, 'export includes locks');

    mock.stores.local = { csrBrowserSyncEnabled: false };
    const json = JSON.stringify(exported);
    const imported = await api.csrImportSettings(json);
    assert(imported.csrLanguage === 'pt-PT', 'import restores language');
    assert(imported.csrLockedWeaponIds[0] === 101, 'import restores locks');
    assert(mock.stores.local.csrFeatureSettings.floatOverlays === false, 'import writes features to storage');

    const flat = await api.csrImportSettings(JSON.stringify(SAMPLE));
    assert(flat.csrLanguage === 'pt-PT', 'import accepts flat settings object');

    let threw = false;
    try {
        await api.csrImportSettings('{not json');
    } catch (e) {
        threw = e.message === 'invalid_json';
    }
    assert(threw, 'rejects invalid JSON');

    threw = false;
    try {
        await api.csrImportSettings(JSON.stringify({ foo: 1 }));
    } catch (e) {
        threw = e.message === 'empty';
    }
    assert(threw, 'rejects empty/unrecognized payload');

    mock.stores.local.csrBrowserSyncEnabled = false;
    await api.csrSetBrowserSyncEnabled(true);
    await api.csrImportSettings(json);
    assert(mock.stores.sync.csrLanguage === 'pt-PT', 'import writes to sync when sync enabled');
    assert(mock.stores.local.csrLockedWeaponIds[0] === 101, 'import always writes locks to local');

    mock.stores.local = { csrBrowserSyncEnabled: false };
    mock.stores.sync = {};
    const exportedSyncOnly = {
        version: 1,
        settings: { csrLockedWeaponIds: [303, 404], csrLanguage: 'en' },
    };
    await api.csrImportSettings(JSON.stringify(exportedSyncOnly));
    assert(mock.stores.local.csrLockedWeaponIds[0] === 303, 'manual import writes to local when sync off');

    mock.stores.local = {
        csrBrowserSyncEnabled: false,
        csrLockedWeaponIds: [999],
        csrLanguage: 'pt-PT',
    };
    mock.stores.sync = {
        csrLockedWeaponIds: [1, 2, 3],
        csrLanguage: 'en',
        csrFeatureSettings: { floatOverlays: false, browseFilters: true, quickSellPanel: true, caseBulkBuy: true, caseAutoOpen: true, tradeSearch: true, skinLock: true },
    };
    await api.csrSetBrowserSyncEnabled(true);
    assert(mock.stores.sync.csrLockedWeaponIds[0] === 999, 'enable sync prefers local over stale sync');
    assert(mock.stores.sync.csrLanguage === 'pt-PT', 'enable sync keeps imported language');
    assert(mock.stores.local.csrLockedWeaponIds === undefined, 'enable sync clears local copies');

    mock.stores.local = { csrBrowserSyncEnabled: false };
    mock.stores.sync = { csrLockedWeaponIds: [5], csrLanguage: 'de' };
    const mock2 = createMockStorage();
    mock2.stores.local = { csrBrowserSyncEnabled: false };
    mock2.stores.sync = { csrLockedWeaponIds: [5], csrLanguage: 'de' };
    const api2 = await loadCsrStorage(mock2);
    const exportedOff = await api2.csrExportSettings();
    assert(exportedOff.settings.csrLockedWeaponIds === undefined, 'export with sync off ignores stale sync');

    console.log(`\n${passed} passed, ${failed} failed`);
    process.exit(failed ? 1 : 0);
}

run().catch((e) => {
    console.error(e);
    process.exit(1);
});
