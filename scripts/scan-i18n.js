const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const i18nSrc = fs.readFileSync(path.join(root, 'i18n.js'), 'utf8');
const packsSrc = fs.readFileSync(path.join(root, 'i18n-packs.js'), 'utf8');

const enMatch = i18nSrc.match(/const enUS = \{([\s\S]*?)\n    \};/);
const enKeys = [...enMatch[1].matchAll(/'([^']+)':/g)].map((m) => m[1]);

function keysInBlock(startMarker, endMarker) {
    const start = packsSrc.indexOf(startMarker);
    if (start < 0) return [];
    const from = start + startMarker.length;
    const end = packsSrc.indexOf(endMarker, from);
    const block = packsSrc.slice(from, end > from ? end : undefined);
    return [...block.matchAll(/'([^']+)':/g)].map((m) => m[1]);
}

const ptPT = keysInBlock("'pt-PT': {", "'pt-BR':");
const ptBR = keysInBlock("'pt-BR': {", '};');
const de = keysInBlock('global.CSR_LOCALE_PACKS.de = {', 'global.CSR_LOCALE_PACKS.ru');
const ru = keysInBlock('global.CSR_LOCALE_PACKS.ru = {', 'global.CSR_LOCALE_PACKS.es');
const es = keysInBlock('global.CSR_LOCALE_PACKS.es = {', '})(typeof');

function report(name, overrides) {
    const set = new Set(overrides);
    const missing = enKeys.filter((k) => !set.has(k));
    console.log(`${name}: ${set.size} overrides, ${missing.length} missing`);
    if (missing.length) console.log(' ', missing.join(', '));
}

console.log('en-US:', enKeys.length, 'keys\n');
report('pt-PT', ptPT);
report('pt-BR', ptBR);
report('de', de);
report('ru', ru);
report('es', es);
