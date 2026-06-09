/**
 * Builds full de/ru/es locale packs (all en-US keys) from partial overrides in i18n-packs.js.
 * Run: node scripts/build-locale-packs.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const i18nSrc = fs.readFileSync(path.join(root, 'i18n.js'), 'utf8');
const packsSrc = fs.readFileSync(path.join(root, 'i18n-packs.js'), 'utf8');

const g = {};
vm.runInNewContext(packsSrc, g);
const enMatch = i18nSrc.match(/const enUS = \{([\s\S]*?)\n    \};/);
const enPairs = [...enMatch[1].matchAll(/'([^']+)': '((?:\\'|[^'])*)'/g)];
const enUS = Object.fromEntries(enPairs.map((m) => [m[1], m[2].replace(/\\'/g, "'")]));

const partial = {
    de: g.CSR_LOCALE_PACKS.de || {},
    ru: g.CSR_LOCALE_PACKS.ru || {},
    es: g.CSR_LOCALE_PACKS.es || {},
};

// Machine-assisted bulk translations for remaining en-US strings
const DE = {
    'popup.title': 'Inventory Helper',
    'rarity.1': 'Verbraucherqualität', 'rarity.2': 'Industriequalität', 'rarity.3': 'Mil-Spec',
    'rarity.4': 'Limitiert', 'rarity.5': 'Klassifiziert', 'rarity.6': 'Covert / Messer / Handschuhe', 'rarity.7': 'Kontrabande',
    'rarityShort.1': 'Verbraucher', 'rarityShort.2': 'Industrie', 'rarityShort.3': 'Mil-Spec',
    'rarityShort.4': 'Limitiert', 'rarityShort.5': 'Klassifiziert', 'rarityShort.6': 'Covert', 'rarityShort.7': 'Kontrabande',
    'wear.FN': 'Fabrikneu', 'wear.MW': 'Minimale Gebrauchsspuren', 'wear.FT': 'Einsatzerprobt',
    'wear.WW': 'Abgenutzt', 'wear.BS': 'Kampfspuren',
    'browse.filterRarity': 'Nach Seltenheit filtern', 'browse.filterWear': 'Nach Abnutzung filtern',
    'browse.sortFloat': 'Nach Float sortieren', 'browse.sortPrice': 'Nach Preis sortieren',
    'toast.largeInventory': 'Großes Inventar ({count}+ Items): Float/Seed laden beim Scrollen.',
    'toast.largeInventory.inventory': 'Inventar', 'toast.largeInventory.marketplace': 'Marktplatz',
    'lock.unlock': 'Entsperren — vor Extension Quick Sell geschützt',
    'lock.lock': 'Sperren — blockiert Extension Quick Sell',
    'qs.fabTitle': 'CS:R Quick Sell & Markt', 'qs.title': 'Quick Sell & Markt',
    'qs.subtitle': 'Skins wählen · listen oder sofort verkaufen',
    'qs.status.picking': 'Klicken zum Auswählen', 'qs.status.validating': 'Wird geprüft…', 'qs.status.review': 'Prüfen',
    'qs.section.picker': 'Auswahl', 'qs.section.global': 'Global', 'qs.section.speed': 'Geschwindigkeit',
    'qs.reviewSell': 'Prüfen & verkaufen', 'qs.reviewSellN': 'Prüfen & verkaufen ({n})',
    'qs.itemsSelected': '{n} Items ausgewählt', 'qs.itemsSelectedOne': '1 Item ausgewählt',
    'qs.batchSize': 'Batch-Größe', 'qs.confirm.title': 'Verkauf bestätigen',
    'qs.confirm.subtitle': 'Quick sell oder auf Marktplatz listen',
    'qs.confirm.warn': 'Einige Items konnten nicht verifiziert werden und werden übersprungen.',
    'qs.validation.title': 'Validierungsbericht', 'qs.cancelSale': 'Abbrechen',
    'qs.listMarket': '{n} auf Marktplatz listen', 'qs.quickSell': 'Quick Sell {n}',
    'qs.itemsCount': '{n} Items', 'qs.verifiedSummary': '{good} verifiziert · {bad} übersprungen · {total} gesamt',
    'qs.quickSellLabel': 'Quick sell: {price}', 'qs.quickSellEmpty': 'Quick sell: —',
    'qs.marketPrice': 'Marktpreis (Münzen)', 'qs.pattern': 'Pattern', 'qs.remove': 'Entfernen',
    'qs.removeFromList': 'Aus Verkaufsliste entfernen', 'qs.unknown': 'Unbekannt', 'qs.notFound': 'Nicht gefunden',
    'qs.footerQuickTotal': 'Quick-sell-Gesamt: {total}', 'qs.footerMarketHint': 'Marktpreis setzen · Quick sell pro Item',
    'qs.footerNothing': 'nichts zu verkaufen', 'qs.footerReady': 'bereit zum Verkaufen',
    'qs.listOnMarketBtn': 'Auf Marktplatz listen', 'qs.quickSellBtn': 'Quick Sell',
    'qs.enterPrice': 'Preis eingeben…', 'qs.marketPriceMaxTitle': 'Max. {max} Münzen',
    'toast.skinLocked': 'Skin ist gesperrt — zuerst auf der Karte entsperren',
    'toast.ambiguousMatch': 'Mehrdeutige Zuordnung — im Modal prüfen',
    'toast.itemNotFound': 'Item nicht im Inventar gefunden',
    'toast.lockedSkipped': '{n} gesperrtes Item übersprungen', 'toast.lockedSkippedMany': '{n} gesperrte Items übersprungen',
    'toast.quickSelling': 'Quick selling {sold}/{total}…', 'toast.listing': 'Listet {listed}/{total}…',
    'toast.quickSold': 'Quick sell: {n} Item', 'toast.quickSoldMany': 'Quick sell: {n} Items',
    'toast.quickSoldFailed': '{n} fehlgeschlagen',
    'toast.marketPriceMax': 'Marktpreis darf {max} Münzen nicht überschreiten',
    'toast.enterMarketPrice': 'Marktpreis (Münzen) für jedes Item eingeben',
    'toast.listed': '{n} auf Marktplatz gelistet', 'toast.listedFailed': '{n} fehlgeschlagen',
    'toast.listFailed': 'Listing fehlgeschlagen — Marktplatz öffnen, ein Angebot erstellen, erneut versuchen',
    'toast.noRarityItems': 'Keine Items für gewählte Seltenheit',
    'toast.fetching': 'Lädt…', 'toast.nothingToSell': 'Nichts zu verkaufen in dieser Auswahl',
    'toast.unknownError': 'Unbekannter Fehler', 'toast.modalSelling': 'Verkauft…', 'toast.modalListing': 'Listet…',
    'cases.fabTitle': 'CS:R Cases — Massenkauf / Auto-Öffnen', 'cases.title': 'Massenkauf von Cases',
    'cases.subtitle': 'Cases gehen ins In-Game-Inventar', 'cases.weaponCase': 'Waffen-Case',
    'cases.quantity': 'Menge (1–99)', 'cases.resultsLabel': 'Ergebnisse — bester Float zuerst',
    'cases.sellSession': 'Session-Drops verkaufen', 'cases.sellHint': 'Nur Items aus diesem Auto-Open-Lauf',
    'cases.quickSellRarity': 'Quick sell diese Seltenheit (0 in Session)',
    'cases.quickSellRarityN': 'Quick sell {n}× {rarity}',
    'cases.quickSellNonGold': 'Quick sell alles außer Gold (0 in Session)',
    'cases.batchSize': 'Batch-Größe (1–20)', 'cases.loading': 'Cases werden geladen…',
    'cases.selectCaseCost': 'Case wählen für Gesamtkosten.', 'cases.enterQty': 'Menge (1–99) für Gesamt eingeben.',
    'cases.qtyInvalid': 'Menge muss zwischen 1 und 99 liegen.', 'cases.notEnoughCoins': 'Nicht genug Münzen für diesen Kauf.',
    'cases.selectCaseOpen': 'Case für Auto-Öffnen wählen.',
    'cases.willOpen': 'Öffnet bis {n} Case · Verzögerung: {delay} · Limit: {minutes} min',
    'cases.willOpenMany': 'Öffnet bis {n} Cases · Verzögerung: {delay} · Limit: {minutes} min',
    'cases.spendTooLow': 'Ausgabenlimit zu niedrig (oder nicht genug Münzen) für dieses Case.',
    'cases.autoSell': 'Auto-Verkauf: {rules}', 'cases.autoSell.rarities': 'Ausgewählte Seltenheiten',
    'cases.openedStats': 'Geöffnet: {opened} · Gold: {gold}', 'cases.openedLast': ' · Letzte: {name}',
    'cases.sellHintSession': '{n} Drops in dieser Session', 'cases.sellHintNoId': '{n} ohne ID (nicht verkaufbar)',
    'cases.confirmBuy': '{qty}× {name} für {total} kaufen?\n\nCases gehen ins In-Game-Inventar (in CS:R öffnen, nicht auf der Website).',
    'cases.confirmOpen': 'Bis {max}× {name} auto-öffnen?\n\nLimits:\n- Ausgaben: {spend} (Preis {price})\n- Zeit: {minutes} min\n- Verzögerung: {delay} ms\n- Auto-Verkauf: {rules}\n\nStopp bricht nach aktuellem Öffnen ab.',
    'cases.confirmQuickSell': 'Quick sell {n} Items aus dieser Session?\n\n{label}\n\nBatch: {batch}\n\nNur Drops dieser Session — nicht das ganze Inventar.',
    'cases.confirmQuickSellOne': 'Quick sell 1 Item aus dieser Session?\n\n{label}\n\nBatch: {batch}\n\nNur Drops dieser Session — nicht das ganze Inventar.',
    'toast.casesLoadFailed': 'Cases konnten nicht geladen werden',
    'toast.stoppedBuy': 'Gestoppt — {ok} gekauft, {skipped} übersprungen',
    'toast.buyFailed': '{ok} gekauft, dann fehlgeschlagen',
    'toast.bought': '{n}× {name} gekauft — In-Game-Inventar prüfen',
    'toast.cancellingBuy': 'Abbruch nach aktuellem Kauf…', 'toast.stoppingOpen': 'Stopp nach aktuellem Öffnen…',
    'toast.spendTooLow': 'Ausgabenlimit zu niedrig (oder nicht genug Münzen)',
    'toast.autoOpenDone': 'Auto-Öffnen beendet — {n} geöffnet', 'toast.autoOpenGold': ' · {n} Gold',
    'toast.sessionQuickSold': 'Quick sell: {n} aus Session',
    'toast.sessionQuickSoldFailed': ' · {n} fehlgeschlagen (Server ausgelastet — kleinere Batch-Größe)',
    'cases.log.starting': 'Auto-Öffnen startet: {name} · max {max} · {minutes} min',
    'cases.log.gold': 'GOLD', 'cases.log.autoSold': 'Auto-verkauft',
    'cases.log.error': 'Fehler: {msg}', 'cases.log.selling': '{mode}… {sold}/{total}',
    'cases.log.autoSellDone': 'Auto-Verkauf fertig — {sold} verkauft',
    'cases.log.autoSellFailed': ' · {failed} fehlgeschlagen',
    'cases.log.modeAuto': 'Auto-Verkauf', 'cases.log.modeManual': 'Session Quick Sell',
    'cases.confirmSellNonGold': 'Alles außer Gold (★ Messer/Handschuhe behalten)',
    'cases.sellRarityLabel': 'Seltenheit: {rarity}', 'cases.unknownItem': 'Unbekanntes Item',
    'val.ok': 'OK', 'val.low': 'Geringe Sicherheit', 'val.skip': 'Übersprungen',
    'val.err': 'Fehler', 'val.gone': 'Weg', 'val.warn': 'Warnung',
};

const RU = {
    'popup.title': 'Inventory Helper',
    'feature.floatOverlays.desc': 'Износ, float и pattern на карточках',
    'feature.browseFilters.desc': 'Инвентарь, маркетплейс и создание оффера',
    'feature.quickSellPanel.desc': 'Плавающая панель и подтверждение продажи',
    'feature.caseBulkBuy.desc': 'Массовая покупка кейсов на /app/inventory/cases',
    'feature.caseAutoOpen.desc': 'Авто-открытие на /app/inventory/cases',
    'feature.tradeSearch.desc': 'Поиск в модальном окне Send Trade Offer',
    'feature.skinLock.desc': 'Замок на карточках — блокирует Quick Sell расширения',
    'popup.caseAutoSell.hint': 'Только дропы текущей сессии авто-открытия — никогда весь инвентарь. По умолчанию: вручную.',
    'popup.sellMode.rarities': 'Авто: только выбранные редкости',
    'popup.sellTiming.title': 'Когда продавать автоматически',
    'popup.sellTiming.end': 'В конце сессии (меньше нагрузка на сервер)',
    'popup.sellTiming.each': 'После каждого открытия (быстрее монеты)',
    'popup.sellBatch': 'Размер пакета авто-продажи (1–20)',
    'rarity.1': 'Ширпотреб', 'rarity.2': 'Промышленное', 'rarity.3': 'Армейское',
    'rarity.4': 'Запрещённое', 'rarity.5': 'Засекреченное', 'rarity.6': 'Тайное / Ножи / Перчатки', 'rarity.7': 'Контрабанда',
    'rarityShort.1': 'Ширпотреб', 'rarityShort.2': 'Промышленное', 'rarityShort.3': 'Армейское',
    'rarityShort.4': 'Запрещённое', 'rarityShort.5': 'Засекреченное', 'rarityShort.6': 'Тайное', 'rarityShort.7': 'Контрабанда',
    'wear.FN': 'Прямо с завода', 'wear.MW': 'Немного поношенное', 'wear.FT': 'После полевых испытаний',
    'wear.WW': 'Поношенное', 'wear.BS': 'Закалённое в боях',
    'browse.allWear': 'Любой износ', 'browse.floatOrder': 'Порядок float',
    'browse.floatAsc': 'Float: низкий → высокий', 'browse.floatDesc': 'Float: высокий → низкий',
    'browse.priceOrder': 'Порядок цены', 'browse.filterRarity': 'Фильтр по редкости',
    'browse.filterWear': 'Фильтр по износу', 'browse.sortFloat': 'Сортировка по float',
    'browse.sortPrice': 'Сортировка по цене', 'browse.cheapest': 'Сначала дешёвые', 'browse.expensive': 'Сначала дорогие',
    'toast.largeInventory': 'Большой инвентарь ({count}+ предметов): float/seed загружаются при прокрутке.',
    'toast.largeInventory.inventory': 'инвентарь', 'toast.largeInventory.marketplace': 'маркетплейс',
    'lock.unlock': 'Разблокировать — защищено от Quick Sell расширения',
    'lock.lock': 'Заблокировать — блокирует Quick Sell расширения',
    'qs.fabTitle': 'CS:R Quick Sell и маркет', 'qs.title': 'Quick Sell и маркет',
    'qs.subtitle': 'Выбор скинов · листинг или мгновенная продажа',
    'qs.status.picking': 'Нажмите для выбора', 'qs.status.validating': 'Проверка…', 'qs.status.review': 'Проверка',
    'qs.section.picker': 'Выбор', 'qs.section.global': 'Общие', 'qs.section.speed': 'Скорость',
    'qs.reviewSell': 'Проверить и продать', 'qs.reviewSellN': 'Проверить и продать ({n})',
    'qs.itemsSelected': 'Выбрано {n} предметов', 'qs.itemsSelectedOne': 'Выбран 1 предмет',
    'qs.batchSize': 'Размер пакета', 'qs.confirm.title': 'Подтвердить продажу',
    'qs.confirm.subtitle': 'Quick sell или листинг на маркетплейсе',
    'qs.confirm.warn': 'Некоторые предметы не удалось проверить и будут пропущены.',
    'qs.validation.title': 'Отчёт проверки', 'qs.cancelSale': 'Отмена',
    'qs.listMarket': 'Листинг {n} на маркетплейсе', 'qs.quickSell': 'Quick Sell {n}',
    'qs.itemsCount': '{n} предметов', 'qs.verifiedSummary': '{good} проверено · {bad} пропущено · {total} всего',
    'qs.quickSellLabel': 'Quick sell: {price}', 'qs.quickSellEmpty': 'Quick sell: —',
    'qs.marketPrice': 'Цена на маркетплейсе (монеты)', 'qs.pattern': 'Pattern',
    'qs.remove': 'Удалить', 'qs.removeFromList': 'Убрать из списка продажи',
    'qs.unknown': 'Неизвестно', 'qs.notFound': 'Не найдено',
    'qs.footerQuickTotal': 'Итого quick sell: {total}',
    'qs.footerMarketHint': 'Укажите цену на маркетплейсе · quick sell по каждому предмету',
    'qs.footerNothing': 'нечего продавать', 'qs.footerReady': 'готово к продаже',
    'qs.listOnMarketBtn': 'Листинг на маркетплейсе', 'qs.quickSellBtn': 'Quick Sell',
    'qs.enterPrice': 'Введите цену…', 'qs.marketPriceMaxTitle': 'Макс. {max} монет',
    'toast.skinLocked': 'Скин заблокирован — сначала разблокируйте на карточке',
    'toast.ambiguousMatch': 'Неоднозначное совпадение — проверьте в модальном окне',
    'toast.itemNotFound': 'Предмет не найден в инвентаре',
    'toast.lockedSkipped': '{n} заблокированный пропущен', 'toast.lockedSkippedMany': '{n} заблокированных пропущено',
    'toast.quickSelling': 'Quick selling {sold}/{total}…', 'toast.listing': 'Листинг {listed}/{total}…',
    'toast.quickSold': 'Quick sell: {n} предмет', 'toast.quickSoldMany': 'Quick sell: {n} предметов',
    'toast.quickSoldFailed': '{n} не удалось',
    'toast.marketPriceMax': 'Цена не может превышать {max} монет',
    'toast.enterMarketPrice': 'Введите цену на маркетплейсе (монеты) для каждого предмета',
    'toast.listed': 'Выставлено {n} на маркетплейсе', 'toast.listedFailed': '{n} не удалось',
    'toast.listFailed': 'Не удалось выставить — откройте маркетплейс, создайте оффер на сайте и повторите',
    'toast.noRarityItems': 'Нет предметов выбранной редкости',
    'toast.fetching': 'Загрузка…', 'toast.nothingToSell': 'Нечего продавать в этой выборке',
    'toast.unknownError': 'Неизвестная ошибка', 'toast.modalSelling': 'Продажа…', 'toast.modalListing': 'Листинг…',
    'cases.fabTitle': 'CS:R Кейсы — массовая покупка / авто-открытие',
    'cases.resultsLabel': 'Результаты — лучший float первым',
    'cases.sellSession': 'Продать дропы сессии', 'cases.sellHint': 'Только предметы из этой сессии авто-открытия',
    'cases.quickSellRarity': 'Quick sell этой редкости (0 в сессии)',
    'cases.quickSellRarityN': 'Quick sell {n}× {rarity}',
    'cases.quickSellNonGold': 'Quick sell всё кроме золота (0 в сессии)',
    'cases.batchSize': 'Размер пакета (1–20)', 'cases.loading': 'Загрузка кейсов…',
    'cases.selectCaseCost': 'Выберите кейс для расчёта стоимости.',
    'cases.enterQty': 'Введите количество (1–99) для итога.',
    'cases.qtyInvalid': 'Количество должно быть от 1 до 99.',
    'cases.notEnoughCoins': 'Недостаточно монет для покупки.',
    'cases.selectCaseOpen': 'Выберите кейс для настройки авто-открытия.',
    'cases.willOpen': 'Откроет до {n} кейса · Задержка: {delay} · Лимит: {minutes} мин',
    'cases.willOpenMany': 'Откроет до {n} кейсов · Задержка: {delay} · Лимит: {minutes} мин',
    'cases.spendTooLow': 'Лимит трат слишком низкий (или недостаточно монет) для этого кейса.',
    'cases.autoSell': 'Авто-продажа: {rules}', 'cases.autoSell.manual': 'Вручную (кнопки в конце)',
    'cases.autoSell.nonGold': 'Всё кроме золота (★ сохраняются)', 'cases.autoSell.rarities': 'Выбранные редкости',
    'cases.autoSell.whenEach': 'после каждого открытия', 'cases.autoSell.whenEnd': 'в конце сессии',
    'cases.openedStats': 'Открыто: {opened} · Золото: {gold}', 'cases.openedLast': ' · Последний: {name}',
    'cases.sellHintSession': '{n} дропов в этой сессии', 'cases.sellHintNoId': '{n} без ID (нельзя продать)',
    'cases.confirmBuy': 'Купить {qty}× {name} за {total}?\n\nКейсы попадут в in-game инвентарь (открывайте в CS:R, не на сайте).',
    'cases.confirmOpen': 'Авто-открыть до {max}× {name}?\n\nЛимиты:\n- Траты: {spend} (цена {price})\n- Время: {minutes} мин\n- Задержка: {delay} мс\n- Авто-продажа: {rules}\n\nСтоп — после текущего открытия.',
    'cases.confirmQuickSell': 'Quick sell {n} предметов из этой сессии?\n\n{label}\n\nПакет: {batch}\n\nТолько дропы этой сессии — не весь инвентарь.',
    'cases.confirmQuickSellOne': 'Quick sell 1 предмет из этой сессии?\n\n{label}\n\nПакет: {batch}\n\nТолько дропы этой сессии — не весь инвентарь.',
    'toast.casesLoadFailed': 'Не удалось загрузить кейсы',
    'toast.stoppedBuy': 'Остановлено — куплено {ok}, пропущено {skipped}',
    'toast.buyFailed': 'Куплено {ok}, затем ошибка',
    'toast.bought': 'Куплено {n}× {name} — проверьте in-game инвентарь',
    'toast.cancellingBuy': 'Отмена после текущей покупки…', 'toast.stoppingOpen': 'Остановка после текущего открытия…',
    'toast.spendTooLow': 'Лимит трат слишком низкий (или недостаточно монет)',
    'toast.autoOpenDone': 'Авто-открытие завершено — открыто {n}', 'toast.autoOpenGold': ' · {n} золото',
    'toast.sessionQuickSold': 'Quick sell: {n} из сессии',
    'toast.sessionQuickSoldFailed': ' · {n} не удалось (сервер занят — уменьшите пакет)',
    'cases.log.starting': 'Старт авто-открытия: {name} · макс {max} · {minutes} мин',
    'cases.log.gold': 'GOLD', 'cases.log.autoSold': 'Авто-продано',
    'cases.log.error': 'Ошибка: {msg}', 'cases.log.selling': '{mode}… {sold}/{total}',
    'cases.log.autoSellDone': 'Авто-продажа завершена — продано {sold}',
    'cases.log.autoSellFailed': ' · {failed} не удалось',
    'cases.log.modeAuto': 'Авто-продажа', 'cases.log.modeManual': 'Quick sell сессии',
    'cases.confirmSellNonGold': 'Всё кроме золота (★ ножи/перчатки сохраняются)',
    'cases.sellRarityLabel': 'Редкость: {rarity}', 'cases.unknownItem': 'Неизвестный предмет',
    'val.ok': 'OK', 'val.low': 'Низкая уверенность', 'val.skip': 'Пропущено',
    'val.err': 'Ошибка', 'val.gone': 'Продано', 'val.warn': 'Предупреждение',
};

const ES = {
    'popup.title': 'Inventory Helper',
    'feature.floatOverlays.desc': 'Desgaste, float y pattern en las tarjetas',
    'feature.browseFilters.desc': 'Inventario, marketplace y crear oferta',
    'feature.quickSellPanel.desc': 'Panel flotante y confirmar venta',
    'feature.caseBulkBuy.desc': 'Compra masiva en /app/inventory/cases',
    'feature.caseAutoOpen.desc': 'Auto abrir en /app/inventory/cases',
    'feature.tradeSearch.desc': 'Barra de búsqueda en Send Trade Offer',
    'feature.skinLock.desc': 'Candado en tarjetas — bloquea Quick Sell de la extensión',
    'popup.caseAutoSell.hint': 'Solo drops de la sesión de auto abrir — nunca todo el inventario. Por defecto: manual.',
    'popup.sellMode.rarities': 'Auto: solo rarezas seleccionadas',
    'popup.sellTiming.title': 'Cuándo vender automáticamente',
    'popup.sellTiming.end': 'Al terminar la sesión (menos carga en el servidor)',
    'popup.sellTiming.each': 'Tras cada apertura (monedas más rápido)',
    'popup.sellBatch': 'Tamaño del lote auto-venta (1–20)',
    'rarity.1': 'Grado consumidor', 'rarity.2': 'Grado industrial', 'rarity.3': 'Mil-Spec',
    'rarity.4': 'Restringido', 'rarity.5': 'Clasificado', 'rarity.6': 'Covert / Cuchillos / Guantes', 'rarity.7': 'Contrabando',
    'rarityShort.1': 'Consumidor', 'rarityShort.2': 'Industrial', 'rarityShort.3': 'Mil-Spec',
    'rarityShort.4': 'Restringido', 'rarityShort.5': 'Clasificado', 'rarityShort.6': 'Covert', 'rarityShort.7': 'Contrabando',
    'wear.FN': 'De fábrica', 'wear.MW': 'Poco desgastado', 'wear.FT': 'Field-Tested',
    'wear.WW': 'Muy desgastado', 'wear.BS': 'Con marcas de batalla',
    'browse.allWear': 'Todo el desgaste', 'browse.floatOrder': 'Orden del float',
    'browse.floatAsc': 'Float: bajo → alto', 'browse.floatDesc': 'Float: alto → bajo',
    'browse.priceOrder': 'Orden de precio', 'browse.filterRarity': 'Filtrar por rareza',
    'browse.filterWear': 'Filtrar por desgaste', 'browse.sortFloat': 'Ordenar por float',
    'browse.sortPrice': 'Ordenar por precio', 'browse.cheapest': 'Más barato primero', 'browse.expensive': 'Más caro primero',
    'toast.largeInventory': 'Inventario grande ({count}+ objetos): float/seed cargan al hacer scroll.',
    'toast.largeInventory.inventory': 'inventario', 'toast.largeInventory.marketplace': 'marketplace',
    'lock.unlock': 'Desbloquear — protegido del Quick Sell de la extensión',
    'lock.lock': 'Bloquear — impide Quick Sell de la extensión',
    'qs.fabTitle': 'CS:R Quick Sell y mercado', 'qs.title': 'Quick Sell y mercado',
    'qs.subtitle': 'Elegir skins · listar o vender al instante',
    'qs.status.picking': 'Clic para elegir', 'qs.status.validating': 'Validando…', 'qs.status.review': 'Revisar',
    'qs.section.picker': 'Selector', 'qs.section.global': 'Global', 'qs.section.speed': 'Velocidad',
    'qs.reviewSell': 'Revisar y vender', 'qs.reviewSellN': 'Revisar y vender ({n})',
    'qs.itemsSelected': '{n} objetos seleccionados', 'qs.itemsSelectedOne': '1 objeto seleccionado',
    'qs.batchSize': 'Tamaño del lote', 'qs.confirm.title': 'Confirmar venta',
    'qs.confirm.subtitle': 'Quick sell o listar en marketplace',
    'qs.confirm.warn': 'Algunos objetos no se pudieron verificar y se omitirán.',
    'qs.validation.title': 'Informe de validación', 'qs.cancelSale': 'Cancelar',
    'qs.listMarket': 'Listar {n} en marketplace', 'qs.quickSell': 'Quick Sell {n}',
    'qs.itemsCount': '{n} objetos', 'qs.verifiedSummary': '{good} verificados · {bad} omitidos · {total} total',
    'qs.quickSellLabel': 'Quick sell: {price}', 'qs.quickSellEmpty': 'Quick sell: —',
    'qs.marketPrice': 'Precio en marketplace (monedas)', 'qs.pattern': 'Pattern',
    'qs.remove': 'Quitar', 'qs.removeFromList': 'Quitar de la lista de venta',
    'qs.unknown': 'Desconocido', 'qs.notFound': 'No encontrado',
    'qs.footerQuickTotal': 'Total quick sell: {total}',
    'qs.footerMarketHint': 'Define precio en marketplace · quick sell por objeto',
    'qs.footerNothing': 'nada para vender', 'qs.footerReady': 'listo para vender',
    'qs.listOnMarketBtn': 'Listar en marketplace', 'qs.quickSellBtn': 'Quick Sell',
    'qs.enterPrice': 'Introducir precio…', 'qs.marketPriceMaxTitle': 'Máx. {max} monedas',
    'toast.skinLocked': 'Skin bloqueada — desbloquéala en la tarjeta primero',
    'toast.ambiguousMatch': 'Coincidencia ambigua — verifica en el modal',
    'toast.itemNotFound': 'Objeto no encontrado en el inventario',
    'toast.lockedSkipped': '{n} bloqueado omitido', 'toast.lockedSkippedMany': '{n} bloqueados omitidos',
    'toast.quickSelling': 'Quick selling {sold}/{total}…', 'toast.listing': 'Listando {listed}/{total}…',
    'toast.quickSold': 'Quick sell: {n} objeto', 'toast.quickSoldMany': 'Quick sell: {n} objetos',
    'toast.quickSoldFailed': '{n} fallaron',
    'toast.marketPriceMax': 'El precio no puede exceder {max} monedas',
    'toast.enterMarketPrice': 'Introduce precio en marketplace (monedas) para cada objeto',
    'toast.listed': 'Listados {n} en marketplace', 'toast.listedFailed': '{n} fallaron',
    'toast.listFailed': 'No se pudo listar — abre Marketplace, crea una oferta en el sitio e inténtalo de nuevo',
    'toast.noRarityItems': 'No hay objetos para la rareza seleccionada',
    'toast.fetching': 'Cargando…', 'toast.nothingToSell': 'Nada para vender en esta selección',
    'toast.unknownError': 'Error desconocido', 'toast.modalSelling': 'Vendiendo…', 'toast.modalListing': 'Listando…',
    'cases.fabTitle': 'CS:R Cajas — compra masiva / auto abrir',
    'cases.resultsLabel': 'Resultados — mejor float primero',
    'cases.sellSession': 'Vender drops de sesión', 'cases.sellHint': 'Solo objetos de esta sesión de auto abrir',
    'cases.quickSellRarity': 'Quick sell esta rareza (0 en sesión)',
    'cases.quickSellRarityN': 'Quick sell {n}× {rarity}',
    'cases.quickSellNonGold': 'Quick sell todo menos oro (0 en sesión)',
    'cases.batchSize': 'Tamaño del lote (1–20)', 'cases.loading': 'Cargando cajas…',
    'cases.selectCaseCost': 'Selecciona una caja para ver el coste total.',
    'cases.enterQty': 'Introduce cantidad (1–99) para ver el total.',
    'cases.qtyInvalid': 'La cantidad debe estar entre 1 y 99.',
    'cases.notEnoughCoins': 'Monedas insuficientes para esta compra.',
    'cases.selectCaseOpen': 'Selecciona una caja para configurar auto abrir.',
    'cases.willOpen': 'Abrirá hasta {n} caja · Retraso: {delay} · Límite: {minutes} min',
    'cases.willOpenMany': 'Abrirá hasta {n} cajas · Retraso: {delay} · Límite: {minutes} min',
    'cases.spendTooLow': 'Límite de gasto demasiado bajo (o monedas insuficientes) para esta caja.',
    'cases.autoSell': 'Auto-venta: {rules}', 'cases.autoSell.manual': 'Manual (botones al terminar)',
    'cases.autoSell.nonGold': 'Todo menos oro (★ conservados)', 'cases.autoSell.rarities': 'Rarezas seleccionadas',
    'cases.autoSell.whenEach': 'tras cada apertura', 'cases.autoSell.whenEnd': 'al terminar la sesión',
    'cases.openedStats': 'Abiertas: {opened} · Oro: {gold}', 'cases.openedLast': ' · Última: {name}',
    'cases.sellHintSession': '{n} drops en esta sesión', 'cases.sellHintNoId': '{n} sin ID (no se puede vender)',
    'cases.confirmBuy': '¿Comprar {qty}× {name} por {total}?\n\nLas cajas van al inventario in-game (ábrelas en CS:R, no en la web).',
    'cases.confirmOpen': '¿Auto abrir hasta {max}× {name}?\n\nLímites:\n- Gasto: {spend} (precio {price})\n- Tiempo: {minutes} min\n- Retraso: {delay} ms\n- Auto-venta: {rules}\n\nDetener cancela tras la apertura actual.',
    'cases.confirmQuickSell': '¿Quick sell {n} objetos de esta sesión?\n\n{label}\n\nLote: {batch}\n\nSolo drops de esta sesión — no todo el inventario.',
    'cases.confirmQuickSellOne': '¿Quick sell 1 objeto de esta sesión?\n\n{label}\n\nLote: {batch}\n\nSolo drops de esta sesión — no todo el inventario.',
    'toast.casesLoadFailed': 'Error al cargar cajas',
    'toast.stoppedBuy': 'Detenido — {ok} compradas, {skipped} omitidas',
    'toast.buyFailed': 'Compradas {ok}, luego falló',
    'toast.bought': 'Compradas {n}× {name} — revisa inventario in-game',
    'toast.cancellingBuy': 'Cancelando tras la compra actual…', 'toast.stoppingOpen': 'Deteniendo tras la apertura actual…',
    'toast.spendTooLow': 'Límite de gasto demasiado bajo (o monedas insuficientes)',
    'toast.autoOpenDone': 'Auto abrir terminado — abiertas {n}', 'toast.autoOpenGold': ' · {n} oro',
    'toast.sessionQuickSold': 'Quick sell: {n} de la sesión',
    'toast.sessionQuickSoldFailed': ' · {n} fallaron (servidor ocupado — reduce el lote)',
    'cases.log.starting': 'Iniciando auto abrir: {name} · máx {max} · {minutes} min',
    'cases.log.gold': 'GOLD', 'cases.log.autoSold': 'Auto-vendido',
    'cases.log.error': 'Error: {msg}', 'cases.log.selling': '{mode}… {sold}/{total}',
    'cases.log.autoSellDone': 'Auto-venta hecha — {sold} vendidos',
    'cases.log.autoSellFailed': ' · {failed} fallaron',
    'cases.log.modeAuto': 'Auto-venta', 'cases.log.modeManual': 'Quick sell de sesión',
    'cases.confirmSellNonGold': 'Todo menos oro (★ cuchillos/guantes conservados)',
    'cases.sellRarityLabel': 'Rareza: {rarity}', 'cases.unknownItem': 'Objeto desconocido',
    'val.ok': 'OK', 'val.low': 'Baja confianza', 'val.skip': 'Omitido',
    'val.err': 'Error', 'val.gone': 'Vendido', 'val.warn': 'Aviso',
};

function buildFull(partialOverrides, bulk) {
    const out = { ...enUS };
    for (const [k, v] of Object.entries(bulk)) out[k] = v;
    for (const [k, v] of Object.entries(partialOverrides)) out[k] = v;
    return out;
}

const fullDe = buildFull(partial.de, DE);
const fullRu = buildFull(partial.ru, RU);
const fullEs = buildFull(partial.es, ES);

function serialize(obj) {
    const lines = Object.entries(obj).map(([k, v]) => {
        const esc = v
            .replace(/\\/g, '\\\\')
            .replace(/'/g, "\\'")
            .replace(/\r\n/g, '\\n')
            .replace(/\n/g, '\\n')
            .replace(/\r/g, '\\n');
        return `        '${k}': '${esc}',`;
    });
    return lines.join('\n');
}

const outPath = path.join(root, 'i18n-packs-generated.js');
const body = `/**
 * AUTO-GENERATED — do not edit by hand. Run: node scripts/build-locale-packs.js
 */
(function (global) {
    'use strict';
    global.CSR_LOCALE_PACKS = global.CSR_LOCALE_PACKS || {};
    global.CSR_LOCALE_PACKS.de = {
${serialize(fullDe)}
    };
    global.CSR_LOCALE_PACKS.ru = {
${serialize(fullRu)}
    };
    global.CSR_LOCALE_PACKS.es = {
${serialize(fullEs)}
    };
})(typeof globalThis !== 'undefined' ? globalThis : window);
`;

fs.writeFileSync(outPath, body);
console.log('Wrote', outPath);
console.log('de keys:', Object.keys(fullDe).length);
console.log('ru keys:', Object.keys(fullRu).length);
console.log('es keys:', Object.keys(fullEs).length);
