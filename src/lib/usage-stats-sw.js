/**
 * Anonymous usage heartbeat — service worker only (importScripts from background.js).
 */
(function () {
    'use strict';

    const API = typeof CSR_USAGE_STATS_API === 'string' ? CSR_USAGE_STATS_API.replace(/\/$/, '') : '';
    const INSTALL_ID_KEY = 'csrInstallId';
    const HEARTBEAT_AT_KEY = 'csrUsageHeartbeatAt';
    const HEARTBEAT_INTERVAL_MS = 24 * 60 * 60 * 1000;
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

    const rt = typeof browser !== 'undefined' ? browser : chrome;

    function randomUuid() {
        if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
            const r = (Math.random() * 16) | 0;
            const v = c === 'x' ? r : (r & 0x3) | 0x8;
            return v.toString(16);
        });
    }

    function detectBrowser() {
        const ua = self.navigator?.userAgent || '';
        if (/Firefox\//i.test(ua) && !/Seamonkey/i.test(ua)) return 'firefox';
        if (/Edg\//i.test(ua)) return 'edge';
        if (/Chrome\//i.test(ua)) return 'chrome';
        return 'chromium';
    }

    function storageGet(keys) {
        return new Promise((resolve) => {
            rt.storage.local.get(keys, (data) => resolve(data || {}));
        });
    }

    function storageSet(obj) {
        return new Promise((resolve) => {
            rt.storage.local.set(obj, () => resolve());
        });
    }

    async function getInstallId() {
        const data = await storageGet(INSTALL_ID_KEY);
        let id = data[INSTALL_ID_KEY];
        if (!id || !UUID_RE.test(String(id))) {
            id = randomUuid();
            await storageSet({ [INSTALL_ID_KEY]: id });
        }
        return id;
    }

    async function sendUsageHeartbeat(force) {
        if (!API) return;
        const now = Date.now();
        const data = await storageGet(HEARTBEAT_AT_KEY);
        const last = Number(data[HEARTBEAT_AT_KEY] || 0);
        if (!force && now - last < HEARTBEAT_INTERVAL_MS) return;

        const installId = await getInstallId();
        let version = '';
        try {
            version = rt.runtime.getManifest().version || '';
        } catch (_) { /* ignore */ }

        try {
            const r = await fetch(`${API}/v1/heartbeat`, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({
                    install_id: installId,
                    version,
                    browser: detectBrowser(),
                }),
            });
            if (r.ok) await storageSet({ [HEARTBEAT_AT_KEY]: now });
        } catch (_) { /* silent */ }
    }

    global.CSR_sendUsageHeartbeat = sendUsageHeartbeat;

    sendUsageHeartbeat(false);

    rt.runtime.onInstalled.addListener(() => {
        sendUsageHeartbeat(true);
    });

    if (rt.alarms?.create) {
        rt.alarms.create('csr-usage-heartbeat', { periodInMinutes: 24 * 60 });
        rt.alarms.onAlarm.addListener((alarm) => {
            if (alarm.name === 'csr-usage-heartbeat') sendUsageHeartbeat(true);
        });
    }
})();
