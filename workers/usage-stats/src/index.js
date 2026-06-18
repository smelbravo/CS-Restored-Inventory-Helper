/**
 * Anonymous usage stats for CS:Restored Inventory Helper (Cloudflare Worker + D1).
 * POST /v1/heartbeat — { install_id, version, browser }
 * GET  /v1/stats    — { mau, dau, online, total_installs }
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_VERSION_LEN = 32;
const MAX_BROWSER_LEN = 24;

const DAY_MS = 24 * 60 * 60 * 1000;
const MAU_MS = 30 * DAY_MS;
const ONLINE_MS = 60 * 60 * 1000;

function json(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: {
            'content-type': 'application/json; charset=utf-8',
            'cache-control': 'no-store',
        },
    });
}

function bad(msg, status = 400) {
    return json({ error: msg }, status);
}

function parseBody(raw) {
    try {
        return JSON.parse(raw);
    } catch (_) {
        return null;
    }
}

async function handleHeartbeat(request, env) {
    if (request.method !== 'POST') return bad('method', 405);
    const body = parseBody(await request.text());
    if (!body || typeof body !== 'object') return bad('invalid_json');

    const installId = String(body.install_id || '').trim().toLowerCase();
    if (!UUID_RE.test(installId)) return bad('invalid_install_id');

    const version = String(body.version || '').slice(0, MAX_VERSION_LEN) || null;
    const browser = String(body.browser || '').slice(0, MAX_BROWSER_LEN) || null;
    const now = Date.now();

    await env.DB.prepare(`
        INSERT INTO installs (install_id, first_seen, last_seen, version, browser)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(install_id) DO UPDATE SET
            last_seen = excluded.last_seen,
            version = COALESCE(excluded.version, installs.version),
            browser = COALESCE(excluded.browser, installs.browser)
    `).bind(installId, now, now, version, browser).run();

    return json({ ok: true });
}

async function handleStats(env) {
    const now = Date.now();
    const mauSince = now - MAU_MS;
    const dauSince = now - DAY_MS;
    const onlineSince = now - ONLINE_MS;

    const [mau, dau, online, total] = await Promise.all([
        env.DB.prepare('SELECT COUNT(*) AS n FROM installs WHERE last_seen >= ?').bind(mauSince).first(),
        env.DB.prepare('SELECT COUNT(*) AS n FROM installs WHERE last_seen >= ?').bind(dauSince).first(),
        env.DB.prepare('SELECT COUNT(*) AS n FROM installs WHERE last_seen >= ?').bind(onlineSince).first(),
        env.DB.prepare('SELECT COUNT(*) AS n FROM installs').first(),
    ]);

    return json({
        mau: Number(mau?.n || 0),
        dau: Number(dau?.n || 0),
        online: Number(online?.n || 0),
        total_installs: Number(total?.n || 0),
    });
}

export default {
    async fetch(request, env) {
        if (!env.DB) return bad('db_not_configured', 503);

        const url = new URL(request.url);
        if (url.pathname === '/v1/heartbeat') {
            return handleHeartbeat(request, env);
        }
        if (url.pathname === '/v1/stats' && request.method === 'GET') {
            return handleStats(env);
        }
        if (url.pathname === '/' && request.method === 'GET') {
            return json({ service: 'csr-inv-helper-usage', ok: true });
        }
        return bad('not_found', 404);
    },
};
