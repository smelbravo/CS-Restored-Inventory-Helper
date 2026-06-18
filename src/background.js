'use strict';

importScripts('./lib/usage-stats-config.js', './lib/usage-stats-sw.js');

const API_BASE = 'https://api.csrestored.fun';

function onApiMessage(msg, sendResponse) {
    const path = String(msg.path || '');
    if (!path.startsWith('/')) {
        sendResponse({ ok: false, error: 'bad path' });
        return;
    }
    const method = String(msg.method || 'GET').toUpperCase();
    const init = { method, credentials: 'include' };
    if (msg.body != null && method !== 'GET' && method !== 'HEAD') {
        init.headers = { 'content-type': 'application/json' };
        init.body = typeof msg.body === 'string' ? msg.body : JSON.stringify(msg.body);
    }

    const timeoutMs = Number(msg.timeoutMs) > 0 ? Number(msg.timeoutMs) : (method === 'GET' ? 20000 : 25000);
    const ctrl = new AbortController();
    init.signal = ctrl.signal;
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);

    fetch(API_BASE + path, init)
        .then(async (r) => {
            clearTimeout(timer);
            let data = null;
            try {
                const text = await r.text();
                try {
                    const safe = text.replace(/([:\[,]\s*)(-?\d{16,})(?=\s*[,}\]])/g, '$1"$2"');
                    data = JSON.parse(safe);
                } catch (_) {
                    data = text;
                }
            } catch (_) { /* ignore */ }
            sendResponse({
                ok: r.ok,
                data,
                status: r.status,
                error: r.ok ? null : `HTTP ${r.status}`,
            });
        })
        .catch((err) => {
            clearTimeout(timer);
            const timedOut = err?.name === 'AbortError';
            sendResponse({
                ok: false,
                error: timedOut ? 'timeout' : String(err?.message || err),
                timeout: timedOut,
            });
        });
}

const rt = typeof browser !== 'undefined' ? browser : chrome;
rt.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (!msg) return;
    if (msg.type === 'csr:usage-ping') {
        const force = msg.force === true;
        if (typeof CSR_sendUsageHeartbeat === 'function') {
            CSR_sendUsageHeartbeat(force).then(() => sendResponse({ ok: true })).catch(() => sendResponse({ ok: false }));
        } else {
            sendResponse({ ok: false });
        }
        return true;
    }
    if (msg.type !== 'csr:api') return;
    onApiMessage(msg, sendResponse);
    return true;
});
