'use strict';

async function render() {
    const list = document.getElementById('feature-list');
    const lockEl = document.getElementById('lock-count');
    await csrLoadSettings();

    list.innerHTML = '';
    for (const meta of CSR_FEATURE_META) {
        const row = document.createElement('label');
        row.className = 'feature-row';
        row.innerHTML = `
            <input type="checkbox" data-key="${meta.key}" ${csrIsFeatureEnabled(meta.key) ? 'checked' : ''}>
            <div class="feature-text">
                <div class="feature-label">${meta.label}</div>
                <div class="feature-desc">${meta.desc}</div>
            </div>`;
        list.appendChild(row);
    }

    const locks = csrGetLockedIds();
    lockEl.textContent = locks.length
        ? `${locks.length} skin${locks.length !== 1 ? 's' : ''} locked`
        : 'No locked skins';

    list.querySelectorAll('input[type="checkbox"]').forEach(inp => {
        inp.addEventListener('change', async () => {
            const key = inp.dataset.key;
            await csrSaveFeatureSettings({ [key]: inp.checked });
            const locksNow = csrGetLockedIds();
            lockEl.textContent = locksNow.length
                ? `${locksNow.length} skin${locksNow.length !== 1 ? 's' : ''} locked`
                : 'No locked skins';
        });
    });
}

document.getElementById('btn-reset').addEventListener('click', async () => {
    await csrSaveFeatureSettings({ ...CSR_SETTINGS_DEFAULTS });
    await render();
});

render();
