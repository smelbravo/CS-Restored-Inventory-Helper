const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const i18nSrc = fs.readFileSync(path.join(root, 'src/lib/i18n.js'), 'utf8');
const packsSrc = fs.readFileSync(path.join(root, 'src/lib/i18n-packs.js'), 'utf8');
const genPath = path.join(root, 'src/lib/i18n-packs-generated.js');
const genSrc = fs.existsSync(genPath) ? fs.readFileSync(genPath, 'utf8') : '';

const enMatch = i18nSrc.match(/const enUS = \{([\s\S]*?)\n    \};/);
const enKeys = [...enMatch[1].matchAll(/'([^']+)':/g)].map((m) => m[1]);

function keysInBlock(src, startMarker, endMarker) {
    const start = src.indexOf(startMarker);
    if (start < 0) return [];
    const from = start + startMarker.length;
    const end = endMarker ? src.indexOf(endMarker, from) : -1;
    const block = src.slice(from, end > from ? end : undefined);
    return [...block.matchAll(/'([^']+)':/g)].map((m) => m[1]);
}

const ptPT = keysInBlock(packsSrc, "'pt-PT': {", "'pt-BR':");
const ptBR = keysInBlock(packsSrc, "'pt-BR': {", '};');
const de = keysInBlock(genSrc, 'global.CSR_LOCALE_PACKS.de = {', 'global.CSR_LOCALE_PACKS.ru');
const ru = keysInBlock(genSrc, 'global.CSR_LOCALE_PACKS.ru = {', 'global.CSR_LOCALE_PACKS.es');
const es = keysInBlock(genSrc, 'global.CSR_LOCALE_PACKS.es = {', '})(typeof');

function report(name, overrides) {
    const set = new Set(overrides);
    const missing = enKeys.filter((k) => !set.has(k));
    console.log(`${name}: ${set.size} overrides, ${missing.length} missing (en-US fallback)`);
    if (missing.length && missing.length <= 20) console.log(' ', missing.join(', '));
    else if (missing.length) console.log(' ', missing.slice(0, 20).join(', '), `… +${missing.length - 20} more`);
}

console.log('en-US:', enKeys.length, 'keys\n');
report('pt-PT', ptPT);
report('pt-BR', ptBR);
report('de', de);
report('ru', ru);
report('es', es);
