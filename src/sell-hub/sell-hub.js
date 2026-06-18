(() => {
    'use strict';

    const SH = window.CSR_SellHub;
    const RARITY = {
        1: { name: 'Consumer Grade', hex: '#a8a29e' },
        2: { name: 'Industrial Grade', hex: '#7dd3fc' },
        3: { name: 'Mil-Spec', hex: '#60a5fa' },
        4: { name: 'Restricted', hex: '#a855f7' },
        5: { name: 'Classified', hex: '#e879f9' },
        6: { name: 'Covert / Knives / Gloves', hex: '#ef4444' },
        7: { name: 'Contraband', hex: '#facc15' },
    };

    const PAGE = 80;
    const rt = typeof browser !== 'undefined' ? browser : chrome;
    const pageParams = new URLSearchParams(location.search);
    const pageUserId = pageParams.get('id') || '';

    let allItems = [];
    let filtered = [];
    let selected = new Set();
    let locked = new Set();
    let sortKey = 'rarity';
    const sortDirs = { rarity: 'desc', float: 'asc', recent: 'desc', name: 'asc' };
    let renderCount = 0;
    let busy = false;
    let modalItems = [];
    let lockToggleLocal = false;
    let userCoins = null;
    let recentDropAt = new Map();
    let knownWeaponIds = new Set();
    const RECENT_DROP_BADGE_MS = 48 * 60 * 60 * 1000;

    const $ = (id) => document.getElementById(id);

    function recentDropTime(item) {
        const wid = itemWeaponId(item);
        return wid != null ? recentDropAt.get(wid) : null;
    }

    function isRecentDrop(item) {
        const at = recentDropTime(item);
        return at != null && Date.now() - at < RECENT_DROP_BADGE_MS;
    }

    async function loadRecentDropIndex() {
        recentDropAt.clear();
        if (typeof csrGetRecentDrops !== 'function') return;
        const rows = await csrGetRecentDrops();
        for (const row of rows) {
            if (row.weapon_id) recentDropAt.set(row.weapon_id, row.at);
        }
    }

    async function noteNewInventoryItems(items) {
        if (typeof csrRecordRecentDrops !== 'function') return;
        const entries = [];
        for (const item of items) {
            const wid = itemWeaponId(item);
            if (!wid) continue;
            if (knownWeaponIds.size && !knownWeaponIds.has(wid)) {
                entries.push({
                    weapon_id: wid,
                    at: Date.now(),
                    name: item.name,
                    float: item.float,
                    seed: item.seed,
                });
            }
            knownWeaponIds.add(wid);
        }
        if (entries.length) {
            await csrRecordRecentDrops(entries);
            await loadRecentDropIndex();
        }
    }

    function itemWeaponId(item) {
        return SH.parsePosInt(item?.weapon_id);
    }

    function findItemByWeaponId(wid) {
        const n = parseInt(wid, 10);
        return allItems.find((i) => itemWeaponId(i) === n) || null;
    }

    function findModalCard(wid) {
        return document.querySelector(`.sh-mcard[data-wid="${wid}"]`);
    }

    function renderCoins(animate) {
        const wrap = $('sh-coins');
        const val = $('sh-coins-val');
        if (!wrap || !val) return;
        if (userCoins == null) {
            wrap.hidden = true;
            return;
        }
        wrap.hidden = false;
        val.textContent = SH.formatCoinNumber(userCoins);
        wrap.title = t('cases.yourCoins', { coins: SH.formatCoins(userCoins) });
        if (animate) {
            val.classList.remove('bump');
            void val.offsetWidth;
            val.classList.add('bump');
            val.addEventListener('animationend', () => val.classList.remove('bump'), { once: true });
        }
    }

    async function loadCoins(animate) {
        const session = await SH.fetchUserSession(pageUserId || null);
        if (session.coins != null) userCoins = session.coins;
        renderCoins(animate);
        updateHeaderUser(session.profile);
        return userCoins;
    }

    function updateHeaderUser(profile) {
        const subEl = document.querySelector('.sh-sub');
        if (!subEl) return;
        const id = profile?.id || pageUserId || '';
        const nick = String(profile?.username || '').trim();
        if (nick) {
            subEl.textContent = nick;
            subEl.title = id ? `${nick} · ${id}` : nick;
        } else if (id) {
            subEl.textContent = t('sellHub.subtitleUser', { id });
            subEl.title = id;
        } else {
            subEl.textContent = t('sellHub.subtitle');
            subEl.title = '';
        }
    }

    function applyCoinsFromApi(data, fallbackDelta) {
        const fromApi = SH.extractCoins(data);
        if (fromApi != null) {
            userCoins = fromApi;
            renderCoins(true);
            return;
        }
        if (fallbackDelta != null && userCoins != null) {
            userCoins += fallbackDelta;
            renderCoins(true);
        }
    }

    function getModalTotals() {
        let qsTotal = 0;
        let qsN = 0;
        let mpTotal = 0;
        let mpN = 0;
        modalItems.forEach((item) => {
            const p = SH.getQuickSellPrice(item);
            if (p != null) { qsTotal += p; qsN++; }
        });
        document.querySelectorAll('.sh-mcard').forEach((card) => {
            const price = SH.parseMarketPrice(card.querySelector('.sh-market-inp')?.value);
            if (price) { mpTotal += price; mpN++; }
        });
        return { qsTotal, qsN, mpTotal, mpN };
    }

    function refreshCardMarketHint(card) {
        const hint = card.querySelector('.sh-mcard-mp');
        if (!hint) return;
        const price = SH.parseMarketPrice(card.querySelector('.sh-market-inp')?.value);
        hint.textContent = price ? t('sellHub.cardMarketValue', { total: SH.formatCoins(price) }) : '';
    }

    function refreshAllCardMarketHints() {
        document.querySelectorAll('.sh-mcard').forEach(refreshCardMarketHint);
    }

    function t(key, vars) {
        return typeof csrT === 'function' ? csrT(key, vars) : key;
    }

    function extUrl(path) {
        return rt.runtime.getURL(path);
    }

    function esc(s) {
        return String(s ?? '').replace(/[&<>"']/g, (c) => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
        }[c]));
    }

    function toast(msg, kind = '') {
        const el = $('sh-toast');
        el.textContent = msg;
        el.className = 'sh-toast' + (kind ? ` ${kind}` : '');
        el.hidden = false;
        clearTimeout(toast._t);
        toast._t = setTimeout(() => { el.hidden = true; }, 4000);
    }

    function rarityName(k) {
        const n = parseInt(k, 10);
        return typeof csrT === 'function' ? csrT(`rarity.${n}`) : (RARITY[n]?.name || '');
    }

    function applyI18n() {
        document.querySelectorAll('[data-i18n]').forEach((el) => {
            const k = el.getAttribute('data-i18n');
            if (k) el.textContent = t(k);
        });
        document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
            const k = el.getAttribute('data-i18n-placeholder');
            if (k) el.placeholder = t(k);
        });
        document.title = `${t('sellHub.title')} — CS:Restored Inventory Helper`;
        updateSortButtons();
    }

    async function loadLocks() {
        await csrLoadSettings();
        locked = new Set(csrGetLockedIds());
    }

    function enrichItemForPatterns(item) {
        const enriched = { ...item };
        if (enriched.seed == null && enriched.paint_seed != null) enriched.seed = enriched.paint_seed;
        if (enriched.finish_catalog == null && typeof CSR_resolveFinishCatalog === 'function') {
            const fc = CSR_resolveFinishCatalog(enriched);
            if (fc != null) enriched.finish_catalog = fc;
        }
        return enriched;
    }

    function skinImageUrl(item) {
        const id = item.item_id ?? item.skin_id ?? item.def_id
            ?? (typeof SH.skinDefinitionIdFromRaw === 'function' ? SH.skinDefinitionIdFromRaw(item) : null);
        if (id == null) return '';
        return `https://cdn.csrestored.fun/skins/${id}.png`;
    }

    function bindThumbImage(thumb, src) {
        if (!thumb || !src) return;
        let attempt = 0;
        const maxRetries = 3;
        const onError = () => {
            attempt++;
            if (attempt <= maxRetries) {
                setTimeout(() => {
                    thumb.src = `${src}${src.includes('?') ? '&' : '?'}r=${attempt}`;
                }, 800 * attempt);
                return;
            }
            const ph = document.createElement('span');
            ph.className = 'sh-thumb-ph';
            ph.textContent = '🔫';
            thumb.removeEventListener('error', onError);
            thumb.replaceWith(ph);
        };
        thumb.addEventListener('error', onError);
        thumb.src = src;
    }

    function resolveItemPattern(item) {
        if (typeof CSR_resolveSkinPattern !== 'function') return null;
        return CSR_resolveSkinPattern(enrichItemForPatterns(item));
    }

    function patternBadgeHtml(item) {
        const pattern = resolveItemPattern(item);
        if (!pattern) return '';
        let text = '';
        let cls = 'sh-pattern';
        if (pattern.type === 'doppler') {
            text = typeof CSR_formatDopplerPatternText === 'function'
                ? CSR_formatDopplerPatternText(pattern)
                : (pattern.short || pattern.label);
            cls += ' doppler';
        } else if (pattern.type === 'fade') {
            text = pattern.short || pattern.label;
            cls += ' fade' + (pattern.percentage >= 95 ? ' hot' : '');
        } else if (pattern.type === 'marble-fade') {
            text = pattern.short || pattern.label;
            cls += ' marble';
        } else if (pattern.type === 'ch-gold') {
            text = pattern.short || pattern.label;
            cls += ' ch-gold';
        } else if (pattern.type === 'ch') {
            text = pattern.short || pattern.label;
            cls += ' ch';
        } else {
            text = pattern.short || pattern.label || '';
        }
        if (!text) return '';
        const title = pattern.label || text;
        return `<span class="${cls}" title="${esc(title)}">${esc(text)}</span>`;
    }

    function isRareItem(item) {
        const p = resolveItemPattern(item);
        if (!p) return false;
        if (p.type === 'doppler' && p.kind === 'gem') return true;
        if (p.type === 'ch' && p.tier != null && p.tier <= 2) return true;
        if (p.type === 'ch-gold') return true;
        if (p.type === 'fade' && p.percentage >= 95) return true;
        if (p.type === 'marble-fade') return true;
        return false;
    }

    const LOCK_SVG_OFF = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 019.9-1"/></svg>';
    const LOCK_SVG_ON = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>';

    const REMOVE_SVG = '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';

    function isLocked(item) {
        const wid = itemWeaponId(item);
        return wid != null && csrIsFeatureEnabled('skinLock') && locked.has(wid);
    }

    function refreshLockRow(rowEl, wid) {
        if (!rowEl) return;
        const item = findItemByWeaponId(wid);
        const lockedNow = item ? isLocked(item) : locked.has(parseInt(wid, 10));
        const lockBtn = rowEl.querySelector('.sh-lock-btn');
        const cb = rowEl.querySelector('input[type="checkbox"]');
        rowEl.classList.toggle('locked', lockedNow);
        if (lockBtn) {
            lockBtn.classList.toggle('on', lockedNow);
            lockBtn.title = lockedNow ? t('lock.unlock') : t('lock.lock');
            lockBtn.setAttribute('aria-label', lockBtn.title);
            lockBtn.innerHTML = lockedNow ? LOCK_SVG_ON : LOCK_SVG_OFF;
        }
        if (cb) {
            cb.disabled = lockedNow;
            if (lockedNow && cb.checked) {
                cb.checked = false;
                selected.delete(parseInt(wid, 10));
                rowEl.classList.remove('selected');
            }
        }
    }

    function refreshAllLockRows() {
        document.querySelectorAll('.sh-row[data-wid]').forEach((row) => {
            refreshLockRow(row, row.dataset.wid);
        });
        updateStats();
    }

    function getSearchQuery() {
        return String($('sh-search')?.value || '').trim().toLowerCase();
    }

    function getRarityFilter() {
        const v = $('sh-rarity')?.value;
        if (!v || v === 'all') return null;
        return parseInt(v, 10);
    }

    function itemMatchesSearch(item, q) {
        if (!q) return true;
        const blob = [item.name, item.item_name, item.weapon_name].filter(Boolean).join(' ').toLowerCase();
        return blob.includes(q);
    }

    function sortDirFor(key) {
        return sortDirs[key] === 'asc' ? 'asc' : 'desc';
    }

    function updateSortButtons() {
        const sortEl = $('sh-sort');
        if (!sortEl) return;
        sortEl.querySelectorAll('button[data-sort]').forEach((btn) => {
            const key = btn.dataset.sort;
            const on = key === sortKey;
            btn.classList.toggle('on', on);
            const arrow = btn.querySelector('.sh-sort-arrow');
            if (arrow) {
                arrow.textContent = on ? (sortDirFor(key) === 'desc' ? '↓' : '↑') : '';
            }
            const dir = on ? sortDirFor(key) : null;
            const lbl = btn.querySelector('.sh-sort-lbl')?.textContent?.trim() || key;
            btn.title = on
                ? (dir === 'desc' ? t('sellHub.sortDirDesc', { label: lbl }) : t('sellHub.sortDirAsc', { label: lbl }))
                : lbl;
        });
    }

    function sortItems(arr) {
        const copy = [...arr];
        const dir = sortDirFor(sortKey);
        const mul = dir === 'desc' ? -1 : 1;
        if (sortKey === 'name') {
            copy.sort((a, b) => mul * String(a.name || '').localeCompare(String(b.name || '')));
        } else if (sortKey === 'float') {
            copy.sort((a, b) => {
                const fa = a.float != null ? parseFloat(a.float) : 2;
                const fb = b.float != null ? parseFloat(b.float) : 2;
                return mul * (fa - fb);
            });
        } else if (sortKey === 'recent') {
            copy.sort((a, b) => {
                const ta = recentDropTime(a);
                const tb = recentDropTime(b);
                if (ta != null && tb != null) return mul * (ta - tb);
                if (ta != null) return dir === 'desc' ? -1 : 1;
                if (tb != null) return dir === 'desc' ? 1 : -1;
                return mul * ((itemWeaponId(a) || 0) - (itemWeaponId(b) || 0));
            });
        } else {
            copy.sort((a, b) => mul * (parseInt(a.rarity, 10) - parseInt(b.rarity, 10)));
        }
        return copy;
    }

    function applyFilters() {
        const q = getSearchQuery();
        const rar = getRarityFilter();
        filtered = sortItems(allItems.filter((item) => {
            if (rar != null && parseInt(item.rarity, 10) !== rar) return false;
            return itemMatchesSearch(item, q);
        }));
        renderCount = 0;
        $('sh-list').innerHTML = '';
        updateStats();
        renderMore();
    }

    function updateStats() {
        const sel = [...selected].filter((id) => filtered.some((i) => itemWeaponId(i) === id)).length;
        $('sh-stats').innerHTML = t('sellHub.stats', {
            total: `<strong>${allItems.length}</strong>`,
            showing: `<strong>${filtered.length}</strong>`,
            selected: `<strong>${sel}</strong>`,
        });
        $('sh-review').disabled = sel === 0 || busy;
        $('sh-review').textContent = sel > 0
            ? t('sellHub.reviewN', { n: sel })
            : t('sellHub.review');
    }

    function buildRaritySelect() {
        const sel = $('sh-rarity');
        sel.innerHTML = `<option value="all">${esc(t('sellHub.allRarities'))}</option>`;
        for (let i = 1; i <= 7; i++) {
            const opt = document.createElement('option');
            opt.value = String(i);
            opt.textContent = rarityName(i);
            sel.appendChild(opt);
        }
    }

    function rowHtml(item) {
        const wid = itemWeaponId(item);
        if (!wid) return '';
        const r = parseInt(item.rarity, 10);
        const hex = RARITY[r]?.hex || '#e5e7eb';
        const lockedRow = isLocked(item);
        const checked = selected.has(wid);
        const qs = SH.getQuickSellPrice(item);
        const wear = item.float != null ? SH.wearCode(item.float) : '—';
        const img = skinImageUrl(item);
        const patterns = patternBadgeHtml(item);
        const rare = isRareItem(item);
        const recentBadge = isRecentDrop(item)
            ? `<span class="sh-recent-badge">${esc(t('sellHub.recentDropBadge'))}</span>`
            : '';
        const lockTitle = lockedRow ? t('lock.unlock') : t('lock.lock');
        const lockCls = lockedRow ? ' on' : '';
        const imgInner = img
            ? `<img class="sh-thumb" src="${esc(img)}" alt="" loading="lazy" />`
            : `<span class="sh-thumb-ph">🔫</span>`;

        return `<div class="sh-row${checked ? ' selected' : ''}${lockedRow ? ' locked' : ''}${rare ? ' sh-rare' : ''}" data-wid="${wid}">
            <input type="checkbox" ${checked ? 'checked' : ''} ${lockedRow ? 'disabled' : ''} aria-label="Select" />
            <div class="sh-thumb-wrap">${imgInner}</div>
            <div class="sh-info">
                <div class="sh-name" style="color:${hex}">${esc(item.name || 'Unknown')}</div>
                <div class="sh-meta">${item.stattrak ? 'StatTrak™ · ' : ''}${item.float != null ? item.float.toFixed(4) : '—'}${item.seed != null ? ` · #${item.seed}` : ''}${recentBadge}</div>
                ${patterns ? `<div class="sh-patterns">${patterns}</div>` : ''}
            </div>
            <button type="button" class="sh-lock-btn${lockCls}" title="${esc(lockTitle)}" aria-label="${esc(lockTitle)}">${lockedRow ? LOCK_SVG_ON : LOCK_SVG_OFF}</button>
            <span class="sh-wear">${esc(wear)}</span>
            <span class="sh-qs">${qs != null ? esc(SH.formatCoins(qs)) : '—'}</span>
        </div>`;
    }

    function bindRow(el, item) {
        const wid = itemWeaponId(item);
        if (!wid) return;
        const cb = el.querySelector('input[type="checkbox"]');
        const toggle = () => {
            if (isLocked(item) || busy) return;
            if (selected.has(wid)) selected.delete(wid);
            else selected.add(wid);
            el.classList.toggle('selected', selected.has(wid));
            if (cb) cb.checked = selected.has(wid);
            updateStats();
        };
        const lockBtn = el.querySelector('.sh-lock-btn');
        lockBtn?.addEventListener('click', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (!csrIsFeatureEnabled('skinLock')) {
                toast(t('sellHub.lockDisabled'), 'err');
                return;
            }
            lockToggleLocal = true;
            try {
                await csrToggleWeaponLock(wid);
                await loadLocks();
                refreshLockRow(el, wid);
                updateStats();
            } finally {
                lockToggleLocal = false;
            }
        });
        el.addEventListener('click', (e) => {
            if (e.target.matches('input') || e.target.closest('.sh-lock-btn')) return;
            toggle();
        });
        cb?.addEventListener('change', toggle);
        const thumb = el.querySelector('.sh-thumb');
        if (thumb) {
            const src = skinImageUrl(item);
            if (src) bindThumbImage(thumb, src);
        }
    }

    function renderMore() {
        const list = $('sh-list');
        const slice = filtered.slice(renderCount, renderCount + PAGE);
        if (!slice.length) {
            $('sh-load-more').hidden = true;
            if (!filtered.length && allItems.length) {
                list.innerHTML = `<div class="sh-loading">${esc(t('sellHub.noResults'))}</div>`;
            }
            return;
        }
        const frag = document.createDocumentFragment();
        slice.forEach((item) => {
            const wrap = document.createElement('div');
            wrap.innerHTML = rowHtml(item);
            const row = wrap.firstElementChild;
            bindRow(row, item);
            frag.appendChild(row);
        });
        list.appendChild(frag);
        renderCount += slice.length;
        $('sh-load-more').hidden = renderCount >= filtered.length;
    }

    async function loadInventory() {
        $('sh-loading').hidden = false;
        $('sh-error').hidden = true;
        $('sh-list-wrap').hidden = true;
        $('sh-toolbar').hidden = true;
        $('sh-loading').textContent = t('sellHub.loading');

        const siteLink = $('sh-site-link');
        if (siteLink && pageUserId) {
            siteLink.href = `https://csrestored.fun/app/user/${encodeURIComponent(pageUserId)}`;
        }

        try {
            await loadLocks();
            await loadCoins(false);
            if (typeof CSR_loadItemIdFinishMap === 'function') {
                await CSR_loadItemIdFinishMap();
            }
            allItems = await SH.fetchInventory(pageUserId);
            if (typeof CSR_learnItemIdFinishBatch === 'function') {
                CSR_learnItemIdFinishBatch(allItems);
            }
            await loadRecentDropIndex();
            await noteNewInventoryItems(allItems);
            if (!allItems.length) {
                $('sh-loading').textContent = t('sellHub.noItems');
                return;
            }
            $('sh-loading').hidden = true;
            $('sh-toolbar').hidden = false;
            $('sh-list-wrap').hidden = false;
            buildRaritySelect();
            applyFilters();
        } catch (e) {
            $('sh-loading').hidden = true;
            $('sh-error').hidden = false;
            $('sh-error').textContent = t('sellHub.loadError', { msg: e?.message || 'Network error' });
        }
    }

    function selectAllFiltered() {
        filtered.forEach((item) => {
            if (!isLocked(item)) {
                const wid = itemWeaponId(item);
                if (wid) selected.add(wid);
            }
        });
        applyFilters();
    }

    function clearSelection() {
        selected.clear();
        applyFilters();
    }

    function selectByRarity() {
        const rar = getRarityFilter();
        if (rar == null) {
            const pick = prompt(t('sellHub.rarityPrompt'));
            if (!pick) return;
            const n = parseInt(pick, 10);
            if (n < 1 || n > 7) return;
            filtered.forEach((item) => {
                if (parseInt(item.rarity, 10) === n && !isLocked(item)) {
                    const wid = itemWeaponId(item);
                    if (wid) selected.add(wid);
                }
            });
        } else {
            filtered.forEach((item) => {
                if (parseInt(item.rarity, 10) === rar && !isLocked(item)) {
                    const wid = itemWeaponId(item);
                    if (wid) selected.add(wid);
                }
            });
        }
        applyFilters();
    }

    function getSelectedItems() {
        return filtered.filter((i) => {
            const wid = itemWeaponId(i);
            return wid && selected.has(wid) && !isLocked(i);
        });
    }

    function removeModalItem(wid) {
        const n = parseInt(wid, 10);
        if (!Number.isFinite(n) || busy) return;
        modalItems = modalItems.filter((i) => itemWeaponId(i) !== n);
        selected.delete(n);
        findModalCard(n)?.remove();
        if (!modalItems.length) {
            closeModal();
            applyFilters();
            return;
        }
        refreshModalSummary();
        updateStats();
    }

    function openModal() {
        modalItems = getSelectedItems();
        if (!modalItems.length) return;
        const body = $('sh-modal-body');
        const rmTitle = esc(t('qs.removeFromList'));
        body.innerHTML = modalItems.map((item) => {
            const qs = SH.getQuickSellPrice(item);
            const sug = SH.getSuggestedMarketPrice(item);
            const pat = patternBadgeHtml(item);
            const mpHint = sug != null
                ? t('sellHub.cardMarketValue', { total: SH.formatCoins(sug) })
                : '';
            return `<div class="sh-mcard" data-wid="${itemWeaponId(item)}">
                <button type="button" class="sh-mcard-rm" title="${rmTitle}" aria-label="${rmTitle}">${REMOVE_SVG}</button>
                <div class="sh-mcard-name">${esc(item.name)}</div>
                <div class="sh-mcard-meta">ID ${itemWeaponId(item)}${item.float != null ? ` · ${item.float.toFixed(6)}` : ''}${item.seed != null ? ` · #${item.seed}` : ''}</div>
                ${pat ? `<div class="sh-patterns" style="margin-bottom:8px">${pat}</div>` : ''}
                <div class="sh-mcard-qs">${qs != null ? esc(t('qs.quickSellLabel', { price: SH.formatCoins(qs) })) : esc(t('qs.quickSellEmpty'))}</div>
                <div class="sh-mcard-mp">${esc(mpHint)}</div>
                <label>${esc(t('qs.marketPrice'))}</label>
                <input type="text" class="sh-market-inp" inputmode="numeric" placeholder="${esc(t('qs.enterPrice'))}" value="${sug != null ? sug : ''}" />
            </div>`;
        }).join('');
        body.querySelectorAll('.sh-market-inp').forEach((inp) => {
            inp.addEventListener('input', () => {
                refreshCardMarketHint(inp.closest('.sh-mcard'));
                refreshModalSummary();
            });
        });
        $('sh-modal-progress').hidden = true;
        $('sh-modal-status').hidden = true;
        $('sh-modal-bar').style.width = '0';
        setModalBusy(false);
        refreshModalSummary();
        $('sh-modal-backdrop').hidden = false;
    }

    function closeModal() {
        if (busy) return;
        $('sh-modal-backdrop').hidden = true;
        $('sh-modal-progress').hidden = true;
        $('sh-modal-status').hidden = true;
        setModalBusy(false);
    }

    function setModalBusy(on, label) {
        $('sh-modal-cancel').disabled = on;
        $('sh-modal-list').disabled = on;
        $('sh-modal-sell').disabled = on;
        $('sh-modal-close').style.pointerEvents = on ? 'none' : '';
        $('sh-modal-close').style.opacity = on ? '0.35' : '';
        document.querySelectorAll('.sh-mcard-rm').forEach((btn) => { btn.disabled = on; });
        if (on && label) {
            $('sh-modal-sell').textContent = label;
            $('sh-modal-list').textContent = label;
        } else if (!on) {
            refreshModalSummary();
        }
    }

    function setModalProgress(done, total) {
        const prog = $('sh-modal-progress');
        const bar = $('sh-modal-bar');
        if (!prog || !bar) return;
        prog.hidden = !total;
        bar.style.width = total ? `${Math.round((done / total) * 100)}%` : '0';
    }

    function setModalStatus(text) {
        const el = $('sh-modal-status');
        if (!el) return;
        if (!text) {
            el.hidden = true;
            el.textContent = '';
            return;
        }
        el.hidden = false;
        el.textContent = text;
    }

    function refreshModalSummary() {
        const { qsTotal, qsN, mpTotal, mpN } = getModalTotals();
        const lines = [];
        if (qsN > 0) {
            lines.push(`<div class="sh-sum-qs">${esc(t('qs.footerQuickTotal', { total: SH.formatCoins(qsTotal) }))}</div>`);
        }
        if (mpN > 0) {
            lines.push(`<div class="sh-sum-mp">${esc(t('sellHub.footerMarketTotal', { total: SH.formatCoins(mpTotal) }))}</div>`);
        }
        if (!lines.length) {
            lines.push(`<div>${esc(t('qs.footerMarketHint'))}</div>`);
        }
        $('sh-modal-summary').innerHTML = lines.join('');
        if (!busy) {
            $('sh-modal-sell').textContent = t('qs.quickSell', { n: modalItems.length });
            $('sh-modal-list').textContent = t('qs.listMarket', { n: modalItems.length });
        }
    }

    function getBatchSize() {
        const n = parseInt($('sh-batch')?.value, 10);
        return Number.isFinite(n) ? Math.max(1, Math.min(20, n)) : 5;
    }

    function setBusy(on) {
        busy = on;
        $('sh-review').disabled = on || getSelectedItems().length === 0;
        $('sh-progress').hidden = !on;
        if (!on) $('sh-progress-bar').style.width = '0';
    }

    async function runQuickSell() {
        if (busy || !modalItems.length) return;
        if (!confirm(t('sellHub.confirmQuickSell', { n: modalItems.length }))) return;
        setBusy(true);
        setModalBusy(true, t('toast.modalSelling'));
        $('sh-modal-progress').hidden = false;
        let sold = 0;
        let failed = 0;
        const soldIds = new Set();
        const total = modalItems.length;

        for (let i = 0; i < modalItems.length; i++) {
            const item = modalItems[i];
            const wid = itemWeaponId(item);
            const card = findModalCard(wid);
            card?.classList.add('selling');
            setModalStatus(t('toast.quickSelling', { sold, total }));
            setModalProgress(i, total);

            const qs = SH.getQuickSellPrice(item);
            const result = await SH.sellWeapon(wid);
            if (result.ok) {
                sold++;
                soldIds.add(wid);
                card?.classList.remove('selling');
                card?.classList.add('sold');
                applyCoinsFromApi(result, qs);
            } else {
                failed++;
                card?.classList.remove('selling');
            }
        }

        setModalProgress(total, total);
        setModalStatus(t('toast.quickSelling', { sold, total }));
        allItems = allItems.filter((i) => !soldIds.has(itemWeaponId(i)));
        soldIds.forEach((id) => selected.delete(id));
        await loadCoins(false);
        setBusy(false);
        setModalBusy(false);
        setTimeout(() => {
            closeModal();
            applyFilters();
            toast(
                `${t(sold === 1 ? 'toast.quickSold' : 'toast.quickSoldMany', { n: sold })}${failed ? ` · ${t('toast.quickSoldFailed', { n: failed })}` : ''}`,
                sold > 0 ? 'ok' : 'err',
            );
        }, sold > 0 ? 450 : 0);
    }

    async function runListMarket() {
        if (busy || !modalItems.length) return;
        const toList = [];
        let missing = 0;
        document.querySelectorAll('.sh-mcard').forEach((card) => {
            const wid = parseInt(card.dataset.wid, 10);
            const item = modalItems.find((i) => itemWeaponId(i) === wid);
            const price = SH.parseMarketPrice(card.querySelector('.sh-market-inp')?.value);
            if (!price) { missing++; return; }
            toList.push({ item, price, wid });
        });
        if (missing) {
            toast(t('toast.enterMarketPrice'), 'err');
            return;
        }
        if (!confirm(t('sellHub.confirmList', { n: toList.length }))) return;

        setBusy(true);
        setModalBusy(true, t('toast.modalListing'));
        $('sh-modal-progress').hidden = false;
        let listed = 0;
        let failed = 0;
        const listedIds = new Set();
        const total = toList.length;

        for (let i = 0; i < toList.length; i++) {
            const { item, price, wid } = toList[i];
            const card = findModalCard(wid);
            card?.classList.add('selling');
            setModalStatus(t('toast.listing', { listed, total }));
            setModalProgress(i, total);

            const ok = await SH.listOnMarket(wid, price);
            if (ok) {
                listed++;
                listedIds.add(wid);
                card?.classList.remove('selling');
                card?.classList.add('sold');
            } else {
                failed++;
                card?.classList.remove('selling');
            }
        }

        setModalProgress(total, total);
        setModalStatus(t('toast.listing', { listed, total }));
        allItems = allItems.filter((i) => !listedIds.has(itemWeaponId(i)));
        listedIds.forEach((id) => selected.delete(id));
        setBusy(false);
        setModalBusy(false);
        setTimeout(() => {
            closeModal();
            applyFilters();
            toast(
                `${t('toast.listed', { n: listed })}${failed ? ` · ${t('toast.listedFailed', { n: failed })}` : ''}`,
                listed > 0 ? 'ok' : 'err',
            );
        }, listed > 0 ? 450 : 0);
    }

    function wireEvents() {
        $('sh-refresh').addEventListener('click', () => {
            loadInventory();
            loadCoins(false);
        });
        $('sh-search').addEventListener('input', () => applyFilters());
        $('sh-rarity').addEventListener('change', () => applyFilters());
        $('sh-sort').addEventListener('click', (e) => {
            const btn = e.target.closest('button[data-sort]');
            if (!btn) return;
            const key = btn.dataset.sort;
            if (key === sortKey) {
                sortDirs[key] = sortDirFor(key) === 'desc' ? 'asc' : 'desc';
            } else {
                sortKey = key;
            }
            updateSortButtons();
            applyFilters();
        });
        $('sh-select-all').addEventListener('click', selectAllFiltered);
        $('sh-clear-sel').addEventListener('click', clearSelection);
        $('sh-sell-rarity').addEventListener('click', selectByRarity);
        $('sh-review').addEventListener('click', openModal);
        $('sh-load-more').addEventListener('click', renderMore);

        $('sh-modal-close').addEventListener('click', closeModal);
        $('sh-modal-cancel').addEventListener('click', closeModal);
        $('sh-modal-backdrop').addEventListener('click', (e) => {
            if (e.target === $('sh-modal-backdrop')) closeModal();
        });
        $('sh-modal-sell').addEventListener('click', runQuickSell);
        $('sh-modal-list').addEventListener('click', runListMarket);
        $('sh-modal-body')?.addEventListener('click', (e) => {
            const btn = e.target.closest('.sh-mcard-rm');
            if (!btn || btn.disabled) return;
            const card = btn.closest('.sh-mcard');
            const wid = parseInt(card?.dataset.wid, 10);
            if (Number.isFinite(wid)) removeModalItem(wid);
        });

        const listWrap = $('sh-list-wrap');
        listWrap?.addEventListener('scroll', () => {
            const el = listWrap;
            if (el.scrollTop + el.clientHeight >= el.scrollHeight - 120) renderMore();
        }, { passive: true });
    }

    async function init() {
        $('sh-icon').src = extUrl('icons/icon-128.png');
        await csrLoadLanguage();
        applyI18n();
        const subEl = document.querySelector('.sh-sub');
        if (subEl && pageUserId) {
            subEl.textContent = t('sellHub.subtitleUser', { id: pageUserId });
            subEl.title = pageUserId;
        }
        csrWatchStorageChanges();
        rt.storage?.onChanged?.addListener((changes, area) => {
            if (area === 'local' && changes?.[CSR_RECENT_DROPS_KEY]) {
                loadRecentDropIndex().then(() => applyFilters()).catch(() => {});
            }
        });
        csrOnSettingsChanged(() => {
            locked = new Set(csrGetLockedIds());
            if (lockToggleLocal) return;
            refreshAllLockRows();
        });
        wireEvents();
        loadInventory();
    }

    init().catch(() => {});
})();
