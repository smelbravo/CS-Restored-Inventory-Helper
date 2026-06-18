/**
 * Base URL of the deployed usage-stats Cloudflare Worker.
 * See workers/usage-stats/README.md — update after `wrangler deploy`.
 */
(function (global) {
    'use strict';
    global.CSR_USAGE_STATS_API = 'https://csr-inv-helper-usage.smelbravo.workers.dev';
})(typeof globalThis !== 'undefined' ? globalThis : self);
