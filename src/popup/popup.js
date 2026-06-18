'use strict';

/** Popup — features, settings, about, and Chromium update checker. */

const FEATURES_KEY = 'csrFeatureSettings';
const LOCKS_KEY = 'csrLockedWeaponIds';
const SELL_CFG_KEY = 'csrCasesAutoOpenSellConfig';
const CASES_AUTO_CFG_KEY = 'csrCasesAutoOpenConfig';
const AUTO_UPDATE_KEY = 'csrAutoUpdateCheck';

const REPO = 'smelbravo/CS-Restored-Inventory-Helper';
const GITHUB_RELEASES = `https://github.com/${REPO}/releases/latest`;
const USAGE_STATS_API = (typeof CSR_USAGE_STATS_API === 'string' ? CSR_USAGE_STATS_API : '').replace(/\/$/, '');
const USAGE_INSTALL_ID_KEY = 'csrInstallId';
const USAGE_HEARTBEAT_AT_KEY = 'csrUsageHeartbeatAt';
const USAGE_HEARTBEAT_INTERVAL_MS = 24 * 60 * 60 * 1000;
const BACKUP_STATUS_KEY = 'csr:backupStatus';
const PENDING_IMPORT_KEY = 'csr:pendingImport';

const DEFAULTS = { ...(globalThis.CSR_SETTINGS_DEFAULTS || {
    floatOverlays: true,
    browseFilters: true,
    quickSellPanel: true,
    sellHubPage: true,
    caseBulkBuy: true,
    caseAutoOpen: true,
    tradeSearch: true,
    tradeFloatOverlays: true,
    skinLock: true,
}) };

const SELL_DEFAULTS = {
    mode: 'manual',
    timing: 'end',
    rarities: { 1: false, 2: false, 3: false, 4: false, 5: false, 6: false, 7: false },
    batchSize: 2,
};

const runtime = typeof browser !== 'undefined' ? browser : chrome;

/** Firefox exposes runtime.getBrowserInfo; Chromium (Chrome, Brave, Edge…) does not. */
function isFirefoxBrowser() {
    try {
        if (typeof browser !== 'undefined' && typeof browser.runtime?.getBrowserInfo === 'function') {
            return true;
        }
    } catch (_) { /* ignore */ }
    const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
    return /Firefox\//i.test(ua) && !/Seamonkey/i.test(ua);
}

const IS_FIREFOX = typeof csrIsFirefoxBrowser === 'function' ? csrIsFirefoxBrowser() : isFirefoxBrowser();

function readStorage(done) {
    const keys = [FEATURES_KEY, LOCKS_KEY, SELL_CFG_KEY, CSR_LANG_KEY, AUTO_UPDATE_KEY];
    const finish = (data) => {
        csrLoadLanguage().then(() => {
            const autoUpdate = typeof data?.[AUTO_UPDATE_KEY] === 'boolean' ? data[AUTO_UPDATE_KEY] : true;
            done(
                normalizeFeatures(data?.[FEATURES_KEY]),
                normalizeLocks(data?.[LOCKS_KEY]),
                normalizeSellConfig(data?.[SELL_CFG_KEY]),
                autoUpdate
            );
        });
    };
    if (typeof csrPrefsGet !== 'function') {
        csrLoadLanguage().then(() => {
            done(normalizeFeatures(null), normalizeLocks(null), normalizeSellConfig(null), true);
        });
        return;
    }
    csrPrefsGet(keys).then((data) => finish(data || null)).catch(() => finish(null));
}

function writeFeatures(features, sellCfg, done) {
    const payload = {
        [FEATURES_KEY]: normalizeFeatures(features),
        [SELL_CFG_KEY]: normalizeSellConfig(sellCfg),
    };
    if (typeof csrPrefsSet !== 'function') {
        if (done) done();
        return;
    }
    csrPrefsSet(payload).then(() => { if (done) done(); }).catch(() => { if (done) done(); });
}

function writeAutoUpdate(enabled) {
    if (typeof csrPrefsSet !== 'function') return;
    csrPrefsSet({ [AUTO_UPDATE_KEY]: !!enabled }).catch(() => {});
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

let featureState = { ...DEFAULTS };
let sellState = normalizeSellConfig(null);
let casesOpenUi = { multiStrategy: 'cycle' };
let lockIds = [];
let autoUpdateEnabled = true;

function escHtml(str) {
    return String(str).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function toast(msg, ms = 2400) {
    const stack = document.getElementById('toasts');
    if (!stack) return;
    const t = document.createElement('div');
    t.className = 'toast';
    t.textContent = msg;
    stack.appendChild(t);
    setTimeout(() => {
        t.classList.add('out');
        t.addEventListener('animationend', () => t.remove(), { once: true });
    }, ms);
}

function setBackupStatus(kind, message, persist = true) {
    const el = document.getElementById('settings-backup-status');
    if (el) {
        el.hidden = false;
        el.className = 'settings-backup-status ' + (kind === 'ok' ? 'ok' : kind === 'err' ? 'err' : '');
        el.textContent = message;
    }
    if (persist) {
        try {
            sessionStorage.setItem(BACKUP_STATUS_KEY, JSON.stringify({ kind, message, at: Date.now() }));
        } catch (_) { /* ignore */ }
    }
    toast(message);
}

function restoreBackupStatus() {
    try {
        const raw = sessionStorage.getItem(BACKUP_STATUS_KEY);
        if (!raw) return;
        const { kind, message, at } = JSON.parse(raw);
        if (Date.now() - at > 120000) {
            sessionStorage.removeItem(BACKUP_STATUS_KEY);
            return;
        }
        setBackupStatus(kind, message, false);
        switchTab('settings');
    } catch (_) { /* ignore */ }
}

async function downloadSettingsJson(json, filename) {
    const blobUrl = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    const downloads = runtime.downloads;
    if (downloads?.download) {
        try {
            await downloads.download({ url: blobUrl, filename, saveAs: false });
            setTimeout(() => URL.revokeObjectURL(blobUrl), 15000);
            return;
        } catch (_) {
            URL.revokeObjectURL(blobUrl);
        }
    }
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(blobUrl), 5000);
}

async function notifySiteTabsSettingsReload() {
    const tabsApi = runtime.tabs;
    if (!tabsApi?.query) return 0;
    let tabs = [];
    try {
        tabs = await tabsApi.query({ url: ['*://*.csrestored.fun/*', '*://csrestored.fun/*'] });
    } catch (_) {
        return 0;
    }
    let n = 0;
    for (const tab of tabs) {
        try {
            await tabsApi.sendMessage(tab.id, { type: 'csr:reloadSettings' });
            n++;
        } catch (_) { /* tab without content script */ }
    }
    return n;
}

async function notifySiteTabsDopplerReload() {
    const tabsApi = runtime.tabs;
    if (!tabsApi?.query) return 0;
    let tabs = [];
    try {
        tabs = await tabsApi.query({ url: ['*://*.csrestored.fun/*', '*://csrestored.fun/*'] });
    } catch (_) {
        return 0;
    }
    let n = 0;
    for (const tab of tabs) {
        try {
            await tabsApi.sendMessage(tab.id, { type: 'csr:reloadDopplerMap' });
            n++;
        } catch (_) { /* tab without content script */ }
    }
    return n;
}

function setDopplerMapStatus(kind, message, persist = true) {
    const el = document.getElementById('doppler-map-status');
    if (!el) return;
    el.hidden = false;
    el.className = `settings-backup-status settings-backup-${kind === 'err' ? 'err' : 'ok'}`;
    el.textContent = message;
    if (persist) {
        clearTimeout(setDopplerMapStatus._t);
        setDopplerMapStatus._t = setTimeout(() => { el.hidden = true; }, 8000);
    }
}

async function importDopplerMapFromText(text) {
    const result = await csrImportDopplerMap(text);
    const tabs = await notifySiteTabsDopplerReload();
    const msg = tabs > 0
        ? csrT('popup.settings.dopplerImportDoneLive', { imported: result.imported, total: result.total, tabs })
        : csrT('popup.settings.dopplerImportDone', { imported: result.imported, total: result.total });
    setDopplerMapStatus('ok', msg);
    switchTab('settings');
    return result;
}

function importDoneMessage(imported, tabsNotified) {
    const locks = Array.isArray(imported?.csrLockedWeaponIds) ? imported.csrLockedWeaponIds.length : 0;
    if (tabsNotified > 0) {
        return csrT('popup.settings.importDoneLive', { locks, tabs: tabsNotified });
    }
    return csrT('popup.settings.importDoneStats', { locks });
}

function applyPopupI18n() {
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.dataset.i18n;
        if (key) el.textContent = csrT(key);
    });
    document.querySelectorAll('[data-i18n-title]').forEach(el => {
        const key = el.dataset.i18nTitle;
        if (key) el.title = csrT(key);
    });
    updateBrowserSyncDesc();
    const lang = csrGetLanguage();
    document.documentElement.lang = lang.slice(0, 2);
    document.documentElement.dataset.locale = lang;
}

function updateBrowserSyncDesc() {
    const el = document.getElementById('browser-sync-desc');
    if (!el) return;
    el.textContent = csrT(IS_FIREFOX
        ? 'popup.settings.browserSyncDescFirefox'
        : 'popup.settings.browserSyncDescChromium');
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

function readMultiStrategyUi() {
    const el = document.querySelector('input[name="multiStrategy"]:checked');
    return el?.value === 'quota' ? 'quota' : 'cycle';
}

async function loadCasesOpenUiState() {
    if (typeof csrPrefsGet !== 'function') return;
    try {
        const data = await csrPrefsGet([CASES_AUTO_CFG_KEY]);
        const raw = data?.[CASES_AUTO_CFG_KEY];
        casesOpenUi.multiStrategy = raw?.multiStrategy === 'quota' ? 'quota' : 'cycle';
    } catch (_) { /* ignore */ }
}

async function persistCasesOpenUi() {
    if (typeof csrPrefsGet !== 'function' || typeof csrPrefsSet !== 'function') return;
    try {
        const data = await csrPrefsGet([CASES_AUTO_CFG_KEY]);
        const cur = data?.[CASES_AUTO_CFG_KEY] && typeof data[CASES_AUTO_CFG_KEY] === 'object'
            ? data[CASES_AUTO_CFG_KEY]
            : {};
        await csrPrefsSet({
            [CASES_AUTO_CFG_KEY]: { ...cur, multiStrategy: casesOpenUi.multiStrategy },
        });
    } catch (_) { /* ignore */ }
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

function syncTradeFloatVisibility() {
    const masterOff = !featureState.floatOverlays;
    document.querySelectorAll('[data-key="tradeFloatOverlays"]').forEach((row) => {
        row.classList.toggle('is-off', masterOff);
        const inp = row.querySelector('input[type="checkbox"]');
        if (inp) inp.disabled = masterOff;
    });
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

    document.querySelectorAll('input[name="multiStrategy"]').forEach(inp => {
        inp.checked = inp.value === casesOpenUi.multiStrategy;
    });

    syncSellSubVisibility();
    syncTradeFloatVisibility();
    updateLockCount();
}

function persist() {
    writeFeatures(featureState, sellState);
}

function refreshPopupFromStorage() {
    return new Promise((resolve) => {
        readStorage((features, locks, sellCfg, autoUpdate) => {
            featureState = features;
            lockIds = locks;
            sellState = sellCfg;
            autoUpdateEnabled = autoUpdate;
            const toggle = document.getElementById('auto-update-toggle');
            if (toggle) toggle.checked = autoUpdateEnabled;
            syncCheckboxes();
            csrLoadLanguage().then(() => {
                applyPopupI18n();
                populateLanguageSelect();
                updateLockCount();
                resolve();
            });
        });
    });
}

function switchTab(tab) {
    document.querySelectorAll('.tab-btn').forEach(btn => {
        const on = btn.dataset.tab === tab;
        btn.classList.toggle('active', on);
        btn.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    document.querySelectorAll('.popup-panel').forEach(panel => {
        panel.classList.toggle('active', panel.dataset.tab === tab);
    });
}

document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab || 'features'));
});

document.querySelectorAll('#feature-list input[type="checkbox"][data-key]').forEach(inp => {
    inp.addEventListener('change', () => {
        const key = inp.dataset.key;
        if (!key || !(key in DEFAULTS)) return;
        featureState = { ...featureState, [key]: inp.checked };
        syncSellSubVisibility();
        syncTradeFloatVisibility();
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

document.querySelectorAll('input[name="multiStrategy"]').forEach(inp => {
    inp.addEventListener('change', async () => {
        if (!inp.checked) return;
        casesOpenUi.multiStrategy = readMultiStrategyUi();
        await persistCasesOpenUi();
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
        renderChangelog();
    });
});

document.getElementById('btn-reset')?.addEventListener('click', () => {
    featureState = { ...DEFAULTS };
    sellState = normalizeSellConfig(null);
    syncCheckboxes();
    persist();
});

/* ── About: version, changelog, updates ── */

function showVersion() {
    const v = runtime.runtime.getManifest().version;
    const aboutVer = document.getElementById('about-ver');
    const sideVer = document.getElementById('side-ver');
    if (aboutVer) aboutVer.textContent = `v${v}`;
    if (sideVer) sideVer.textContent = `v${v}`;
}

async function renderChangelog() {
    const box = document.getElementById('changelog');
    if (!box) return;
    try {
        const url = runtime.runtime.getURL('docs/CHANGELOG.md');
        const md = await fetch(url).then(r => r.text());
        const blocks = md.split(/^## /m).filter(b => /^\d/.test(b.trim()));
        if (!blocks.length) {
            box.innerHTML = `<p style="color:var(--muted)">${escHtml(csrT('popup.about.noChangelog'))}</p>`;
            return;
        }
        const head = blocks[0].split('\n');
        const title = head[0].trim();
        const items = head
            .filter(l => l.trim().startsWith('- '))
            .map(l => l.replace(/^[-\s]+/, '').replace(/\*\*/g, '').trim())
            .slice(0, 6);
        box.innerHTML =
            `<div class="cl-ver">${escHtml(title)}</div>` +
            '<ul class="cl-list">' + items.map(i => `<li>${escHtml(i)}</li>`).join('') + '</ul>' +
            `<a class="cl-more" href="https://github.com/${REPO}/blob/main/docs/CHANGELOG.md" target="_blank" rel="noopener">${escHtml(csrT('popup.about.fullChangelog'))}</a>`;
    } catch (_) {
        box.innerHTML = `<p style="color:var(--muted)">${escHtml(csrT('popup.about.noChangelog'))}</p>`;
    }
}

function cmpVer(a, b) {
    const pa = a.split('.').map(Number);
    const pb = b.split('.').map(Number);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
        const d = (pa[i] || 0) - (pb[i] || 0);
        if (d) return d;
    }
    return 0;
}

async function fetchLatest(useCache) {
    if (useCache) {
        try {
            const cached = JSON.parse(localStorage.getItem('csr:update') || 'null');
            if (cached && Date.now() - cached.at < 3600e3) return cached;
        } catch (_) { /* ignore */ }
    }
    const r = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
        headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'CS-Restored-Inventory-Helper' },
    });
    if (r.status === 404) return { none: true, at: Date.now() };
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const data = await r.json();
    const latest = {
        tag: String(data.tag_name || '').replace(/^v/i, ''),
        url: data.html_url || GITHUB_RELEASES,
        at: Date.now(),
    };
    try { localStorage.setItem('csr:update', JSON.stringify(latest)); } catch (_) { /* ignore */ }
    return latest;
}

function openUpdateModal(latest) {
    const modal = document.getElementById('update-modal');
    const verEl = document.getElementById('modal-ver');
    const goEl = document.getElementById('modal-go');
    if (!modal) return;
    if (verEl) verEl.textContent = ` v${latest.tag} `;
    if (goEl) goEl.href = latest.url || GITHUB_RELEASES;
    modal.hidden = false;
}

async function checkForUpdate(manual) {
    if (IS_FIREFOX) {
        if (manual) toast(csrT('popup.update.firefoxHint'));
        return;
    }
    const current = runtime.runtime.getManifest().version;
    let latest;
    try {
        latest = await fetchLatest(!manual);
    } catch (_) {
        if (manual) toast(csrT('popup.update.error'));
        return;
    }
    if (latest.none) {
        if (manual) toast(csrT('popup.update.noReleases'));
    } else if (latest.tag && cmpVer(latest.tag, current) > 0) {
        openUpdateModal(latest);
    } else if (manual) {
        toast(csrT('popup.update.upToDate', { v: current }));
    }
}

function bindUpdateUi() {
    const updateSection = document.getElementById('update-section');
    const firefoxNote = document.getElementById('firefox-update-note');
    const toggle = document.getElementById('auto-update-toggle');

    if (IS_FIREFOX) {
        if (updateSection) updateSection.hidden = true;
        if (firefoxNote) firefoxNote.hidden = false;
    } else {
        if (updateSection) updateSection.hidden = false;
        if (firefoxNote) firefoxNote.hidden = true;
        if (toggle) {
            toggle.checked = autoUpdateEnabled;
            toggle.addEventListener('change', () => {
                autoUpdateEnabled = toggle.checked;
                writeAutoUpdate(autoUpdateEnabled);
            });
        }
        document.getElementById('check-update')?.addEventListener('click', () => {
            toast(csrT('popup.update.checking'), 1400);
            checkForUpdate(true);
        });
    }

    const modal = document.getElementById('update-modal');
    document.getElementById('modal-later')?.addEventListener('click', () => {
        if (modal) modal.hidden = true;
    });
    modal?.addEventListener('click', (e) => {
        if (e.target === modal) modal.hidden = true;
    });
    document.getElementById('modal-go')?.addEventListener('click', () => {
        if (modal) modal.hidden = true;
    });
}

function bootAbout() {
    showVersion();
    renderChangelog();
    bindUpdateUi();
    loadUsageStats();
    if (!IS_FIREFOX && autoUpdateEnabled) checkForUpdate(false);
}

/** Anonymous MAU from usage-stats worker; fails silent if unreachable. */
function usageRuntime() {
    return typeof browser !== 'undefined' ? browser : chrome;
}

function randomInstallId() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
    });
}

function usageBrowserFamily() {
    const ua = navigator.userAgent || '';
    if (/Firefox\//i.test(ua) && !/Seamonkey/i.test(ua)) return 'firefox';
    if (/Edg\//i.test(ua)) return 'edge';
    if (/Chrome\//i.test(ua)) return 'chrome';
    return 'chromium';
}

async function ensureUsageHeartbeat(force = false) {
    if (!USAGE_STATS_API) return false;
    const rt = usageRuntime();
    const now = Date.now();
    const data = await storageLocalGet([USAGE_INSTALL_ID_KEY, USAGE_HEARTBEAT_AT_KEY]);
    let installId = data[USAGE_INSTALL_ID_KEY];
    if (!installId || !/^[0-9a-f-]{36}$/i.test(String(installId))) {
        installId = randomInstallId();
        await storageLocalSet({ [USAGE_INSTALL_ID_KEY]: installId });
    }
    const last = Number(data[USAGE_HEARTBEAT_AT_KEY] || 0);
    if (!force && now - last < USAGE_HEARTBEAT_INTERVAL_MS) return true;

    let version = '';
    try {
        version = rt.runtime.getManifest().version || '';
    } catch (_) { /* ignore */ }

    try {
        const r = await fetch(`${USAGE_STATS_API}/v1/heartbeat`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                install_id: installId,
                version,
                browser: usageBrowserFamily(),
            }),
        });
        if (r.ok) {
            await storageLocalSet({ [USAGE_HEARTBEAT_AT_KEY]: now });
            return true;
        }
    } catch (_) { /* silent */ }
    return false;
}

function storageLocalGet(keys) {
    const rt = usageRuntime();
    return new Promise((resolve) => {
        rt.storage.local.get(keys, (data) => resolve(data || {}));
    });
}

function storageLocalSet(obj) {
    const rt = usageRuntime();
    return new Promise((resolve) => {
        rt.storage.local.set(obj, () => resolve());
    });
}

function pingBackgroundUsage() {
    const rt = usageRuntime();
    return Promise.race([
        new Promise((resolve, reject) => {
            try {
                rt.runtime.sendMessage({ type: 'csr:usage-ping', force: true }, (resp) => {
                    const err = rt.runtime.lastError;
                    if (err) reject(err);
                    else resolve(resp);
                });
            } catch (e) {
                reject(e);
            }
        }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 1500)),
    ]).catch(() => {});
}

async function loadUsageStats() {
    const numEl = document.getElementById('lu-num');
    if (!numEl) return;
    numEl.classList.add('loading');
    try {
        pingBackgroundUsage();
        await ensureUsageHeartbeat(true);
        if (!USAGE_STATS_API) throw new Error('no_api');
        const r = await fetch(`${USAGE_STATS_API}/v1/stats`, { cache: 'no-store' });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const data = await r.json();
        const mau = Number(data.mau || 0);
        numEl.textContent = mau.toLocaleString();
        const aside = document.querySelector('.top-hdr-aside');
        if (aside) {
            aside.title = csrT('popup.usageStats.title', {
                dau: Number(data.dau || 0).toLocaleString(),
                online: Number(data.online || 0).toLocaleString(),
            });
        }
    } catch (_) {
        numEl.textContent = '—';
        const aside = document.querySelector('.top-hdr-aside');
        if (aside) aside.title = csrT('popup.usageStats.unavailable');
    } finally {
        numEl.classList.remove('loading');
    }
}

async function bindSettingsAccountUi() {
    restoreBackupStatus();

    const syncToggle = document.getElementById('browser-sync-toggle');
    if (syncToggle && typeof csrIsBrowserSyncEnabled === 'function') {
        syncToggle.checked = await csrIsBrowserSyncEnabled();
        syncToggle.addEventListener('change', async () => {
            const on = syncToggle.checked;
        try {
            await csrSetBrowserSyncEnabled(on);
            await refreshPopupFromStorage();
            await notifySiteTabsSettingsReload();
            toast(csrT(on ? 'popup.settings.browserSyncEnabled' : 'popup.settings.browserSyncDisabled'));
        } catch (_) {
            syncToggle.checked = !on;
            toast(csrT('popup.settings.storageError'));
        }
        });
    }

    document.getElementById('btn-export-settings')?.addEventListener('click', async () => {
        try {
            const blob = await csrExportSettings();
            const settings = blob.settings || {};
            const lockCount = Array.isArray(settings.csrLockedWeaponIds)
                ? settings.csrLockedWeaponIds.length
                : 0;
            const keyCount = Object.keys(settings).length;
            const json = JSON.stringify(blob, null, 2);
            const filename = `csr-inventory-helper-settings-${new Date().toISOString().slice(0, 10)}.json`;
            const msg = csrT('popup.settings.exportDoneStats', { locks: lockCount, keys: keyCount });
            setBackupStatus('ok', msg);
            switchTab('settings');
            await downloadSettingsJson(json, filename);
        } catch (_) {
            setBackupStatus('err', csrT('popup.settings.exportError'));
            switchTab('settings');
        }
    });

    document.getElementById('btn-import-settings')?.addEventListener('click', () => {
        try {
            runtime.tabs.create({ url: runtime.runtime.getURL('src/popup/import-backup.html') });
            setBackupStatus('ok', csrT('popup.settings.importPageOpened'), false);
            switchTab('settings');
        } catch (_) {
            setBackupStatus('err', csrT('popup.settings.importError'));
            switchTab('settings');
        }
    });

    const importModal = document.getElementById('import-modal');
    let pendingImportText = null;

    function showImportModal(text) {
        pendingImportText = text;
        if (importModal) importModal.hidden = false;
        switchTab('settings');
    }

    try {
        const pending = sessionStorage.getItem(PENDING_IMPORT_KEY);
        if (pending) {
            sessionStorage.removeItem(PENDING_IMPORT_KEY);
            showImportModal(pending);
        }
    } catch (_) { /* ignore */ }

    document.getElementById('import-cancel')?.addEventListener('click', () => {
        pendingImportText = null;
        if (importModal) importModal.hidden = true;
    });
    importModal?.addEventListener('click', (e) => {
        if (e.target === importModal) {
            pendingImportText = null;
            importModal.hidden = true;
        }
    });

    async function confirmImport() {
        if (importModal) importModal.hidden = true;
        if (!pendingImportText) return;
        const text = pendingImportText;
        pendingImportText = null;
        try {
            const imported = await csrImportSettings(text);
            await refreshPopupFromStorage();
            const tabsNotified = await notifySiteTabsSettingsReload();
            setBackupStatus('ok', importDoneMessage(imported, tabsNotified));
            switchTab('settings');
        } catch (_) {
            setBackupStatus('err', csrT('popup.settings.importError'));
            switchTab('settings');
        }
    }

    document.getElementById('import-confirm')?.addEventListener('click', confirmImport);

    document.getElementById('btn-import-paste')?.addEventListener('click', () => {
        const text = document.getElementById('import-paste')?.value?.trim();
        if (!text) {
            setBackupStatus('err', csrT('popup.settings.importError'));
            switchTab('settings');
            return;
        }
        showImportModal(text);
    });

    document.getElementById('btn-export-doppler-map')?.addEventListener('click', async () => {
        try {
            const blob = await csrExportDopplerMap();
            const entries = Object.keys(blob).filter((k) => !k.startsWith('_') && k !== 'version' && k !== 'exportedAt').length;
            const json = JSON.stringify(blob, null, 2);
            const filename = `csr-doppler-item-map-${new Date().toISOString().slice(0, 10)}.json`;
            setDopplerMapStatus('ok', csrT('popup.settings.dopplerExportDone', { entries }));
            switchTab('settings');
            await downloadSettingsJson(json, filename);
        } catch (_) {
            setDopplerMapStatus('err', csrT('popup.settings.dopplerExportError'));
            switchTab('settings');
        }
    });

    document.getElementById('btn-import-doppler-map')?.addEventListener('click', () => {
        document.getElementById('doppler-map-file')?.click();
    });

    document.getElementById('doppler-map-file')?.addEventListener('change', async (e) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file) return;
        try {
            const text = await file.text();
            await importDopplerMapFromText(text);
        } catch (_) {
            setDopplerMapStatus('err', csrT('popup.settings.dopplerImportError'));
            switchTab('settings');
        }
    });

    document.getElementById('btn-import-doppler-paste')?.addEventListener('click', async () => {
        const text = document.getElementById('doppler-map-paste')?.value?.trim();
        if (!text) {
            setDopplerMapStatus('err', csrT('popup.settings.dopplerImportError'));
            switchTab('settings');
            return;
        }
        try {
            await importDopplerMapFromText(text);
            const paste = document.getElementById('doppler-map-paste');
            if (paste) paste.value = '';
        } catch (_) {
            setDopplerMapStatus('err', csrT('popup.settings.dopplerImportError'));
            switchTab('settings');
        }
    });

    if (typeof csrWatchPrefsChanges === 'function') {
        csrWatchPrefsChanges((changes) => {
            if (Object.prototype.hasOwnProperty.call(changes, FEATURES_KEY)) {
                featureState = normalizeFeatures(changes[FEATURES_KEY]);
                syncCheckboxes();
            }
            if (Object.prototype.hasOwnProperty.call(changes, CASES_AUTO_CFG_KEY)) {
                const raw = changes[CASES_AUTO_CFG_KEY];
                casesOpenUi.multiStrategy = raw?.multiStrategy === 'quota' ? 'quota' : 'cycle';
                document.querySelectorAll('input[name="multiStrategy"]').forEach(inp => {
                    inp.checked = inp.value === casesOpenUi.multiStrategy;
                });
            }
            if (Object.prototype.hasOwnProperty.call(changes, SELL_CFG_KEY)) {
                sellState = normalizeSellConfig(changes[SELL_CFG_KEY]);
                syncCheckboxes();
            }
            if (Object.prototype.hasOwnProperty.call(changes, LOCKS_KEY)) {
                lockIds = normalizeLocks(changes[LOCKS_KEY]);
                updateLockCount();
            }
            if (Object.prototype.hasOwnProperty.call(changes, CSR_LANG_KEY)) {
                csrLoadLanguage().then(() => {
                    applyPopupI18n();
                    populateLanguageSelect();
                    updateLockCount();
                    renderChangelog();
                });
            }
            if (Object.prototype.hasOwnProperty.call(changes, AUTO_UPDATE_KEY)) {
                readStorage((features, locks, sellCfg, autoUpdate) => {
                    autoUpdateEnabled = autoUpdate;
                    const toggle = document.getElementById('auto-update-toggle');
                    if (toggle) toggle.checked = autoUpdateEnabled;
                });
            }
        });
    }
}

setTimeout(() => {
    readStorage((features, locks, sellCfg, autoUpdate) => {
        featureState = features;
        lockIds = locks;
        sellState = sellCfg;
        autoUpdateEnabled = autoUpdate;
        applyPopupI18n();
        populateLanguageSelect();
        syncCheckboxes();
        bootAbout();
        bindSettingsAccountUi();
        loadCasesOpenUiState().then(() => syncCheckboxes());
    });
}, 0);
