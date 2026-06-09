'use strict';

/** Popup — features, settings, about, and Chromium update checker. */

const FEATURES_KEY = 'csrFeatureSettings';
const LOCKS_KEY = 'csrLockedWeaponIds';
const SELL_CFG_KEY = 'csrCasesAutoOpenSellConfig';
const AUTO_UPDATE_KEY = 'csrAutoUpdateCheck';

const REPO = 'smelbravo/CS-Restored-Inventory-Helper';
const GITHUB_RELEASES = `https://github.com/${REPO}/releases/latest`;

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

function applyPopupI18n() {
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.dataset.i18n;
        if (key) el.textContent = csrT(key);
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
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tab);
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
        const url = runtime.runtime.getURL('CHANGELOG.md');
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
            `<a class="cl-more" href="https://github.com/${REPO}/blob/main/CHANGELOG.md" target="_blank" rel="noopener">${escHtml(csrT('popup.about.fullChangelog'))}</a>`;
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
    const r = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`);
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
    if (!IS_FIREFOX && autoUpdateEnabled) checkForUpdate(false);
}

async function bindSettingsAccountUi() {
    const syncToggle = document.getElementById('browser-sync-toggle');
    if (syncToggle && typeof csrIsBrowserSyncEnabled === 'function') {
        syncToggle.checked = await csrIsBrowserSyncEnabled();
        syncToggle.addEventListener('change', async () => {
            const on = syncToggle.checked;
            try {
                await csrSetBrowserSyncEnabled(on);
                toast(csrT(on ? 'popup.settings.browserSyncEnabled' : 'popup.settings.browserSyncDisabled'));
            } catch (_) {
                syncToggle.checked = !on;
            }
        });
    }

    document.getElementById('btn-export-settings')?.addEventListener('click', async () => {
        try {
            const blob = await csrExportSettings();
            const json = JSON.stringify(blob, null, 2);
            const a = document.createElement('a');
            a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
            a.download = `csr-inventory-helper-settings-${new Date().toISOString().slice(0, 10)}.json`;
            a.click();
            URL.revokeObjectURL(a.href);
            toast(csrT('popup.settings.exportDone'));
        } catch (_) { /* ignore */ }
    });

    const fileInput = document.getElementById('import-file-input');
    document.getElementById('btn-import-settings')?.addEventListener('click', () => fileInput?.click());
    fileInput?.addEventListener('change', async () => {
        const file = fileInput.files?.[0];
        fileInput.value = '';
        if (!file) return;
        try {
            const text = await file.text();
            const imported = await csrImportSettings(text);
            if (imported[FEATURES_KEY]) featureState = normalizeFeatures(imported[FEATURES_KEY]);
            if (imported[SELL_CFG_KEY]) sellState = normalizeSellConfig(imported[SELL_CFG_KEY]);
            if (imported[LOCKS_KEY]) lockIds = normalizeLocks(imported[LOCKS_KEY]);
            if (imported[AUTO_UPDATE_KEY] !== undefined) {
                autoUpdateEnabled = !!imported[AUTO_UPDATE_KEY];
                const toggle = document.getElementById('auto-update-toggle');
                if (toggle) toggle.checked = autoUpdateEnabled;
            }
            if (imported[CSR_LANG_KEY]) await csrLoadLanguage();
            syncCheckboxes();
            applyPopupI18n();
            populateLanguageSelect();
            toast(csrT('popup.settings.importDone'));
        } catch (_) {
            toast(csrT('popup.settings.importError'));
        }
    });

    if (typeof csrWatchPrefsChanges === 'function') {
        csrWatchPrefsChanges((changes) => {
            if (Object.prototype.hasOwnProperty.call(changes, FEATURES_KEY)) {
                featureState = normalizeFeatures(changes[FEATURES_KEY]);
                syncCheckboxes();
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
    });
}, 0);
