/**
 * Extension UI translations (popup + content script).
 * Storage key: csrLanguage
 */
(function (global) {
    'use strict';

    const LANG_KEY = 'csrLanguage';
    const DEFAULT_LANG = 'en-US';
    const SUPPORTED = ['en-US', 'en-GB', 'pt-PT', 'pt-BR', 'de', 'ru', 'es'];

    const LANG_LABELS = {
        'en-US': 'English (US)',
        'en-GB': 'English (UK)',
        'pt-PT': 'Português (Portugal)',
        'pt-BR': 'Português (Brasil)',
        'de': 'Deutsch',
        'ru': 'Русский',
        'es': 'Español',
    };

    const enUS = {
        'popup.title': 'Inventory Helper',
        'popup.subtitle': 'Toggle features on csrestored.fun',
        'popup.tab.features': 'Features',
        'popup.tab.settings': 'Settings',
        'popup.tab.about': 'About',
        'popup.featuresLead': 'Turn each on-site tool on or off.',
        'popup.group.inventory': 'Inventory & browse',
        'popup.group.selling': 'Sell & protect',
        'popup.group.trades': 'Trades',
        'popup.group.cases': 'Cases',
        'popup.settingsLead': 'Language and extension preferences.',
        'popup.aboutName': 'CS:R Inventory Helper',
        'popup.aboutDesc': 'Float, seed, quick sell, case tools, and skin lock for csrestored.fun — all in your browser session.',
        'popup.about.github': 'GitHub',
        'popup.about.amo': 'Firefox AMO',
        'popup.about.privacy': 'Privacy',
        'popup.about.license': 'License',
        'popup.about.updates': 'Updates',
        'popup.about.autoUpdate': 'Auto-update check',
        'popup.about.autoUpdateDesc': 'Watch GitHub for new releases and prompt you when one is out. (Chromium browsers only.)',
        'popup.about.checkUpdate': 'Check for updates',
        'popup.about.firefoxNote': 'Firefox installs from AMO update automatically when Mozilla publishes a new signed version — no manual GitHub check needed.',
        'popup.about.openAmo': 'Open AMO page',
        'popup.about.whatsNew': "What's new",
        'popup.about.noChangelog': 'Changelog not available.',
        'popup.about.fullChangelog': 'Full changelog ↗',
        'popup.about.disclaimer': 'Not affiliated with Valve or Counter-Strike: Restored.',
        'popup.update.modalTag': 'UPDATE',
        'popup.update.title': 'Update available',
        'popup.update.body': 'A newer build',
        'popup.update.bodyEnd': 'is ready. Open the release page to download it — your settings stay intact.',
        'popup.update.later': 'Later',
        'popup.update.open': 'Open release ↗',
        'popup.update.checking': 'Checking GitHub for updates…',
        'popup.update.error': 'Could not reach GitHub — try again later.',
        'popup.update.noReleases': 'No releases published yet.',
        'popup.update.upToDate': "You're on the latest version (v{v}).",
        'popup.update.firefoxHint': 'Firefox updates through addons.mozilla.org automatically.',
        'popup.settings.language': 'Language',
        'popup.settings.languageHint': 'Applies to extension UI on csrestored.fun. Reload the tab if some labels do not update.',
        'popup.settings.syncSection': 'Sync across devices',
        'popup.settings.browserSync': 'Browser sync',
        'popup.settings.browserSyncDescFirefox': 'When enabled, settings sync through Firefox Sync (sign in to your Mozilla account on each device).',
        'popup.settings.browserSyncDescChromium': 'When enabled, settings sync through Chrome sync (sign in to your Google account on each browser).',
        'popup.settings.browserSyncEnabled': 'Browser sync enabled',
        'popup.settings.browserSyncDisabled': 'Browser sync disabled',
        'popup.settings.backupSection': 'Backup',
        'popup.settings.export': 'Export settings',
        'popup.settings.import': 'Import settings',
        'popup.settings.backupHint': 'Download or restore a JSON backup — useful when switching browsers or sharing settings manually.',
        'popup.settings.exportDone': 'Settings exported.',
        'popup.settings.importDone': 'Settings imported — reload csrestored.fun tabs to apply.',
        'popup.settings.importError': 'Could not import — invalid or empty file.',
        'popup.liveUsers.users': 'USERS',
        'popup.liveUsers.user': 'USER',
        'popup.liveUsers.online': 'ONLINE',
        'popup.liveUsers.title': 'People using Inventory Helper',
        'popup.reset': 'Reset defaults',
        'popup.lockCount.none': 'No locked skins',
        'popup.lockCount.one': '{n} skin locked',
        'popup.lockCount.many': '{n} skins locked',
        'feature.floatOverlays.label': 'Float & seed overlays',
        'feature.floatOverlays.desc': 'Wear, float, and pattern on item cards',
        'feature.browseFilters.label': 'Search & filters',
        'feature.browseFilters.desc': 'Inventory, marketplace, and create offer',
        'feature.quickSellPanel.label': 'Quick Sell & Market',
        'feature.quickSellPanel.desc': 'Floating panel and confirm sale',
        'feature.caseBulkBuy.label': 'Case bulk buy',
        'feature.caseBulkBuy.desc': 'Buy cases in bulk on /app/inventory/cases',
        'feature.caseAutoOpen.label': 'Auto case opening',
        'feature.caseAutoOpen.desc': 'Auto-open on /app/inventory/cases',
        'feature.tradeSearch.label': 'Trade offer search',
        'feature.tradeSearch.desc': 'Search bar in Send Trade Offer modal',
        'feature.skinLock.label': 'Skin lock',
        'feature.skinLock.desc': 'Padlock on inventory cards — blocks extension Quick Sell only',
        'popup.caseAutoSell.title': 'Auto-sell session drops',
        'popup.caseAutoSell.hint': 'Only items from the current auto-open run — never your full inventory. Default is manual.',
        'popup.sellMode.manual': 'Manual only — buttons when finished',
        'popup.sellMode.nonGold': 'Auto: all non-gold (★ kept)',
        'popup.sellMode.rarities': 'Auto: selected rarities only',
        'popup.sellTiming.title': 'When to auto-sell',
        'popup.sellTiming.end': 'When session ends (less server load)',
        'popup.sellTiming.each': 'After each case opens (faster coin recycle)',
        'popup.sellBatch': 'Auto-sell batch size (1–20)',
        'rarity.1': 'Consumer Grade',
        'rarity.2': 'Industrial Grade',
        'rarity.3': 'Mil-Spec',
        'rarity.4': 'Restricted',
        'rarity.5': 'Classified',
        'rarity.6': 'Covert / Knives / Gloves',
        'rarity.7': 'Contraband',
        'rarityShort.1': 'Consumer',
        'rarityShort.2': 'Industrial',
        'rarityShort.3': 'Mil-Spec',
        'rarityShort.4': 'Restricted',
        'rarityShort.5': 'Classified',
        'rarityShort.6': 'Covert',
        'rarityShort.7': 'Contraband',
        'wear.FN': 'Factory New',
        'wear.MW': 'Minimal Wear',
        'wear.FT': 'Field-Tested',
        'wear.WW': 'Well-Worn',
        'wear.BS': 'Battle-Scarred',
        'browse.searchPlaceholder': 'Search weapon or skin…',
        'browse.clear': 'Clear',
        'browse.allRarities': 'All rarities',
        'browse.allWear': 'All wear',
        'browse.floatOrder': 'Float order',
        'browse.floatAsc': 'Float: Low → High',
        'browse.floatDesc': 'Float: High → Low',
        'browse.priceOrder': 'Price order',
        'browse.filterRarity': 'Filter by rarity',
        'browse.filterWear': 'Filter by wear',
        'browse.sortFloat': 'Sort by float',
        'browse.sortPrice': 'Sort by price',
        'browse.cheapest': 'Cheapest first',
        'browse.expensive': 'Most expensive first',
        'browse.itemsCount': '{n} items',
        'browse.showing': 'Showing {visible} of {total} items',
        'toast.largeInventory': 'Large {label} ({count}+ items): float/seed load in batches as you scroll.',
        'toast.largeInventory.inventory': 'inventory',
        'toast.largeInventory.marketplace': 'marketplace',
        'lock.unlock': 'Unlock — blocked from extension Quick Sell',
        'lock.lock': 'Lock — blocks extension Quick Sell (panel + confirm modal)',
        'qs.fabTitle': 'CS:R Quick Sell & Market — pick skins, list or instant sell',
        'qs.title': 'Quick Sell & Market',
        'qs.subtitle': 'Pick skins · list on market or instant sell',
        'qs.status.ready': 'Ready',
        'qs.status.picking': 'Click to pick',
        'qs.status.validating': 'Validating…',
        'qs.status.review': 'Review',
        'qs.section.picker': 'Picker',
        'qs.section.global': 'Global',
        'qs.section.speed': 'Speed',
        'qs.startPicking': 'Start Picking',
        'qs.cancel': 'Cancel',
        'qs.reviewSell': 'Review & Sell',
        'qs.reviewSellN': 'Review & Sell ({n})',
        'qs.itemsSelected': '{n} items selected',
        'qs.itemsSelectedOne': '1 item selected',
        'qs.sellByRarity': 'Sell by Rarity',
        'qs.batchSize': 'Batch size',
        'qs.confirm.title': 'Confirm Sale',
        'qs.confirm.subtitle': 'Quick sell or list on marketplace',
        'qs.confirm.warn': 'Some items could not be verified and will be skipped.',
        'qs.validation.title': 'Validation Report',
        'qs.cancelSale': 'Cancel',
        'qs.listMarket': 'List {n} on Market',
        'qs.quickSell': 'Quick Sell {n}',
        'qs.itemsCount': '{n} items',
        'qs.verifiedSummary': '{good} verified · {bad} skipped · {total} total',
        'qs.quickSellLabel': 'Quick sell: {price}',
        'qs.quickSellEmpty': 'Quick sell: —',
        'qs.marketPrice': 'Market price (coins)',
        'qs.pattern': 'Pattern',
        'qs.remove': 'Remove',
        'qs.removeFromList': 'Remove from sale list',
        'qs.unknown': 'Unknown',
        'qs.notFound': 'Not Found',
        'qs.footerQuickTotal': 'Quick sell total: {total}',
        'qs.footerMarketHint': 'Set market price · quick sell shown per item',
        'qs.footerNothing': 'nothing to sell',
        'qs.footerReady': 'ready to sell',
        'qs.listOnMarketBtn': 'List on Market',
        'qs.quickSellBtn': 'Quick Sell',
        'qs.enterPrice': 'Enter price…',
        'qs.marketPriceMaxTitle': 'Max {max} coins',
        'toast.skinLocked': 'This skin is locked — unlock it on the card first',
        'toast.ambiguousMatch': 'Ambiguous match — verify in modal',
        'toast.itemNotFound': 'Item not found in inventory',
        'toast.lockedSkipped': '{n} locked item skipped',
        'toast.lockedSkippedMany': '{n} locked items skipped',
        'toast.quickSelling': 'Quick selling {sold}/{total}…',
        'toast.listing': 'Listing {listed}/{total}…',
        'toast.quickSold': 'Quick sold {n} item',
        'toast.quickSoldMany': 'Quick sold {n} items',
        'toast.quickSoldFailed': '{n} failed',
        'toast.marketPriceMax': 'Market price cannot exceed {max} coins',
        'toast.enterMarketPrice': 'Enter a market price (coins) for each item',
        'toast.listed': 'Listed {n} on marketplace',
        'toast.listedFailed': '{n} failed',
        'toast.listFailed': 'Could not list on marketplace — open Marketplace, create one offer on the site, then retry',
        'toast.noRarityItems': 'No items for selected rarity',
        'toast.fetching': 'Fetching…',
        'toast.nothingToSell': 'Nothing to sell for this selection',
        'toast.unknownError': 'Unknown error',
        'toast.modalSelling': 'Selling…',
        'toast.modalListing': 'Listing…',
        'cases.fabTitle': 'CS:R Cases tools — bulk buy / auto open',
        'cases.title': 'Case Bulk Buy',
        'cases.subtitle': 'Cases go to in-game inventory',
        'cases.tab.bulk': 'Bulk buy',
        'cases.tab.open': 'Auto open',
        'cases.weaponCase': 'Weapon case',
        'cases.quantity': 'Quantity (1–99)',
        'cases.buy': 'Buy containers',
        'cases.cancel': 'Cancel',
        'cases.delay': 'Delay (ms)',
        'cases.minutes': 'Minutes',
        'cases.spendLimit': 'Spend limit (coins)',
        'cases.startOpen': 'Start auto open',
        'cases.stop': 'Stop',
        'cases.resultsLabel': 'Results — best float first',
        'cases.sellSession': 'Sell session drops',
        'cases.sellHint': 'Only items from this auto-open run',
        'cases.quickSellRarity': 'Quick sell this rarity (0 in session)',
        'cases.quickSellRarityN': 'Quick sell {n}× {rarity}',
        'cases.quickSellNonGold': 'Quick sell all non-gold (0 in session)',
        'cases.quickSellNonGoldN': 'Quick sell all non-gold ({n})',
        'cases.batchSize': 'Batch size (1–20)',
        'cases.loading': 'Loading cases…',
        'cases.selectCaseCost': 'Select a case to see total cost.',
        'cases.enterQty': 'Enter quantity (1–99) to see total.',
        'cases.qtyInvalid': 'Quantity must be between 1 and 99.',
        'cases.yourCoins': 'Your coins: {coins}',
        'cases.total': 'Total: {total} ({qty}× {unit})',
        'cases.notEnoughCoins': 'Not enough coins for this purchase.',
        'cases.selectCaseOpen': 'Select a case to configure auto opening.',
        'cases.willOpen': 'Will open up to {n} case · Delay: {delay} · Time limit: {minutes} min',
        'cases.willOpenMany': 'Will open up to {n} cases · Delay: {delay} · Time limit: {minutes} min',
        'cases.spendTooLow': 'Spend limit too low (or not enough coins) for this case.',
        'cases.autoSell': 'Auto-sell: {rules}',
        'cases.autoSell.manual': 'Manual (use buttons when finished)',
        'cases.autoSell.nonGold': 'All non-gold (★ kept)',
        'cases.autoSell.rarities': 'Selected rarities',
        'cases.autoSell.whenEach': 'after each open',
        'cases.autoSell.whenEnd': 'when session ends',
        'cases.openedStats': 'Opened: {opened} · Gold: {gold}',
        'cases.openedLast': ' · Last: {name}',
        'cases.sellHintSession': '{n} drop(s) this session',
        'cases.sellHintNoId': '{n} without ID (can\'t sell)',
        'cases.confirmBuy': 'Buy {qty}× {name} for {total}?\n\nCases go to your in-game inventory (open them in CS:R, not on the website).',
        'cases.confirmOpen': 'Auto-open up to {max}× {name}?\n\nLimits:\n- Spend: {spend} (case price {price})\n- Time: {minutes} min\n- Delay: {delay} ms\n- Auto-sell: {rules}\n\nUse Stop to cancel after current open.',
        'cases.confirmQuickSell': 'Quick sell {n} item(s) from this session?\n\n{label}\n\nBatch size: {batch}\n\nOnly drops from this auto-open run — not your whole inventory.',
        'cases.confirmQuickSellOne': 'Quick sell 1 item from this session?\n\n{label}\n\nBatch size: {batch}\n\nOnly drops from this auto-open run — not your whole inventory.',
        'toast.selectCase': 'Select a case first',
        'toast.notEnoughCoins': 'Not enough coins',
        'toast.casesLoadFailed': 'Failed to load cases',
        'toast.stoppedBuy': 'Stopped — {ok} bought, {skipped} skipped',
        'toast.buyFailed': 'Bought {ok}, then failed',
        'toast.bought': 'Bought {n}× {name} — check in-game inventory',
        'toast.cancellingBuy': 'Cancelling after current purchase…',
        'toast.stoppingOpen': 'Stopping after current open…',
        'toast.spendTooLow': 'Spend limit too low (or not enough coins)',
        'toast.autoOpenDone': 'Auto-open finished — opened {n}',
        'toast.autoOpenGold': ' · {n} gold',
        'toast.sessionQuickSold': 'Quick sold {n} from session',
        'toast.sessionQuickSoldFailed': ' · {n} failed (site may be busy — try lower batch size)',
        'cases.log.starting': 'Starting auto open: {name} · max {max} · {minutes} min',
        'cases.log.gold': 'GOLD',
        'cases.log.autoSold': 'Auto-sold',
        'cases.log.error': 'Error: {msg}',
        'cases.log.selling': '{mode}… {sold}/{total}',
        'cases.log.autoSellDone': 'Auto-sell done — {sold} sold',
        'cases.log.autoSellFailed': ' · {failed} failed',
        'cases.log.modeAuto': 'Auto-sell',
        'cases.log.modeManual': 'Session quick sell',
        'cases.confirmSellNonGold': 'All non-gold drops (★ knives/gloves kept)',
        'cases.sellRarityLabel': 'Rarity: {rarity}',
        'cases.unknownItem': 'Unknown item',
        'val.ok': 'OK',
        'val.low': 'Low confidence',
        'val.skip': 'Skipped',
        'val.err': 'Error',
        'val.gone': 'Gone',
        'val.warn': 'Warn',
    };

    const enGB = { ...enUS,
        'popup.settings.languageHint': 'Applies to extension UI on csrestored.fun. Reload the tab if some labels do not update.',
    };

    function mergeLocale(overrides) {
        return overrides ? { ...enUS, ...overrides } : { ...enUS };
    }

    const packs = global.CSR_LOCALE_PACKS || {};
    const ptPT = mergeLocale(packs['pt-PT']);
    const ptBR = mergeLocale(packs['pt-BR'] || packs['pt-PT']);
    const de = mergeLocale(packs.de);
    const ru = mergeLocale(packs.ru);
    const es = mergeLocale(packs.es);

    const MESSAGES = {
        'en-US': enUS,
        'en-GB': enGB,
        'pt-PT': ptPT,
        'pt-BR': ptBR,
        de,
        ru,
        es,
    };

    let currentLang = DEFAULT_LANG;
    const langListeners = new Set();

    function normalizeLang(raw) {
        if (typeof raw !== 'string' || !raw.trim()) return DEFAULT_LANG;
        const s = raw.trim();
        if (SUPPORTED.includes(s)) return s;
        const lower = s.toLowerCase();
        if (lower.startsWith('pt')) return lower.includes('br') ? 'pt-BR' : 'pt-PT';
        if (lower.startsWith('en')) return lower.includes('gb') ? 'en-GB' : 'en-US';
        if (lower.startsWith('de')) return 'de';
        if (lower.startsWith('ru')) return 'ru';
        if (lower.startsWith('es')) return 'es';
        return DEFAULT_LANG;
    }

    function detectBrowserLang() {
        try {
            const nav = (typeof navigator !== 'undefined' && (navigator.language || navigator.userLanguage)) || '';
            return normalizeLang(nav);
        } catch (_) {
            return DEFAULT_LANG;
        }
    }

    function notifyLangChange() {
        for (const fn of langListeners) {
            try { fn(currentLang); } catch (_) { /* ignore */ }
        }
    }

    function csrT(key, params) {
        const pack = MESSAGES[currentLang] || MESSAGES[DEFAULT_LANG];
        let str = pack[key] ?? MESSAGES[DEFAULT_LANG][key] ?? key;
        if (params && typeof params === 'object') {
            for (const [k, v] of Object.entries(params)) {
                str = str.split(`{${k}}`).join(String(v));
            }
        }
        return str;
    }

    function csrGetLanguage() {
        return currentLang;
    }

    function csrGetSupportedLanguages() {
        return SUPPORTED.map(code => ({ code, label: LANG_LABELS[code] || code }));
    }

    async function csrLoadLanguage() {
        if (typeof csrPrefsGet !== 'function') {
            currentLang = detectBrowserLang();
            return currentLang;
        }
        try {
            const data = await csrPrefsGet([LANG_KEY]);
            const saved = data?.[LANG_KEY];
            currentLang = saved ? normalizeLang(saved) : detectBrowserLang();
        } catch (_) {
            currentLang = detectBrowserLang();
        }
        return currentLang;
    }

    async function csrSaveLanguage(lang) {
        currentLang = normalizeLang(lang);
        if (typeof csrPrefsSet === 'function') {
            try { await csrPrefsSet({ [LANG_KEY]: currentLang }); } catch (_) { /* ignore */ }
        }
        notifyLangChange();
        return currentLang;
    }

    function csrOnLanguageChanged(fn) {
        if (typeof fn === 'function') langListeners.add(fn);
    }

    function csrWatchLanguageStorage() {
        if (typeof csrWatchPrefsChanges !== 'function') return;
        csrWatchPrefsChanges((changes) => {
            if (!Object.prototype.hasOwnProperty.call(changes, LANG_KEY)) return;
            currentLang = normalizeLang(changes[LANG_KEY]);
            notifyLangChange();
        });
    }

    global.CSR_LANG_KEY = LANG_KEY;
    global.CSR_DEFAULT_LANG = DEFAULT_LANG;
    global.csrT = csrT;
    global.csrGetLanguage = csrGetLanguage;
    global.csrGetSupportedLanguages = csrGetSupportedLanguages;
    global.csrLoadLanguage = csrLoadLanguage;
    global.csrSaveLanguage = csrSaveLanguage;
    global.csrOnLanguageChanged = csrOnLanguageChanged;
    global.csrWatchLanguageStorage = csrWatchLanguageStorage;
    global.csrNormalizeLang = normalizeLang;

})(typeof globalThis !== 'undefined' ? globalThis : window);
