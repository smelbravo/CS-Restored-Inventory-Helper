'use strict';

const runtime = typeof browser !== 'undefined' ? browser : chrome;
const BACKUP_STATUS_KEY = 'csr:backupStatus';

function applyPageI18n() {
    document.querySelectorAll('[data-i18n]').forEach((el) => {
        const key = el.dataset.i18n;
        if (key) el.textContent = csrT(key);
    });
}

function setPageStatus(kind, message) {
    const el = document.getElementById('import-page-status');
    if (el) {
        el.hidden = false;
        el.className = 'settings-backup-status ' + (kind === 'ok' ? 'ok' : kind === 'err' ? 'err' : '');
        el.textContent = message;
    }
    try {
        sessionStorage.setItem(BACKUP_STATUS_KEY, JSON.stringify({ kind, message, at: Date.now() }));
    } catch (_) { /* ignore */ }
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

function importDoneMessage(imported, tabsNotified) {
    const locks = Array.isArray(imported?.csrLockedWeaponIds) ? imported.csrLockedWeaponIds.length : 0;
    if (tabsNotified > 0) {
        return csrT('popup.settings.importDoneLive', { locks, tabs: tabsNotified });
    }
    return csrT('popup.settings.importDoneStats', { locks });
}

async function runImport(text) {
    const imported = await csrImportSettings(text);
    const tabsNotified = await notifySiteTabsSettingsReload();
    const msg = importDoneMessage(imported, tabsNotified);
    setPageStatus('ok', msg);
    return imported;
}

async function boot() {
    await csrLoadLanguage();
    applyPageI18n();

    const fileInput = document.getElementById('import-page-file');
    const importModal = document.getElementById('import-modal');
    let pendingImportText = null;

    document.getElementById('import-page-pick')?.addEventListener('click', () => fileInput?.click());
    document.getElementById('import-page-close')?.addEventListener('click', () => window.close());

    fileInput?.addEventListener('change', async () => {
        const file = fileInput.files?.[0];
        fileInput.value = '';
        if (!file) return;
        try {
            pendingImportText = await file.text();
            if (importModal) importModal.hidden = false;
        } catch (_) {
            setPageStatus('err', csrT('popup.settings.importError'));
        }
    });

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
    document.getElementById('import-confirm')?.addEventListener('click', async () => {
        if (importModal) importModal.hidden = true;
        if (!pendingImportText) return;
        const text = pendingImportText;
        pendingImportText = null;
        try {
            await runImport(text);
        } catch (_) {
            setPageStatus('err', csrT('popup.settings.importError'));
        }
    });
}

boot().catch(() => {
    setPageStatus('err', csrT('popup.settings.importError'));
});
