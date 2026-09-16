/* PineApple Work Center — carpeta de un cliente con todas sus cotizaciones */
(function () {
    const store = window.pineappleStore || {};
    const { normalizeClientId, formatMoney, formatDate, fetchJsonOrNull, CLIENTS_API, DOCS_API } = store;

    const state = {
        clientName: '',
        clientId: '',
        documents: [],
        selectedId: null
    };

    const el = {
        title: document.getElementById('folder-title'),
        subtitle: document.getElementById('folder-subtitle'),
        summary: document.getElementById('folder-summary'),
        list: document.getElementById('folder-list'),
        preview: document.getElementById('folder-preview'),
        back: document.getElementById('folder-back'),
        newDoc: document.getElementById('folder-new'),
        dbState: document.getElementById('db-state'),
        toasts: document.getElementById('toast-stack')
    };

    const LOGO = 'https://res.cloudinary.com/nox-company/image/upload/v1788821914/PineApple%20Service%20Media/ChatGPT_Image_Sep_7_2026_06_30_53_PM-Photoroom_tip3f5.png';

    // Iconos SVG (sin emojis genéricos).
    const ICONS = {
        quote: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 3h9l4 4v14H6z"/><path d="M15 3v4h4"/><path d="M9 12h7M9 16h5"/></svg>',
        invoice: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 3l2.5 1.6L12 3l2.5 1.6L17 3v17l-2.5-1.6L12 20l-2.5-1.6L7 20z"/><path d="M10 9h4M10 13h4"/></svg>'
    };

    function toast(message, type = 'info') {
        if (!el.toasts) return;
        const node = document.createElement('div');
        node.className = `toast${type === 'info' ? '' : ' is-' + type}`;
        node.textContent = message;
        el.toasts.appendChild(node);
        el.toasts.hidden = false;
        setTimeout(() => {
            node.remove();
            if (!el.toasts.childElementCount) el.toasts.hidden = true;
        }, type === 'error' ? 6000 : 4000);
    }

    function escapeHtml(text) {
        return String(text === null || text === undefined ? '' : text).replace(/[&<>"']/g, character => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;'
        })[character]);
    }

    function isQuote(documentData) {
        return !/factura/i.test(documentData.type || '');
    }

    function documentType(documentData) {
        return isQuote(documentData) ? 'Cotización' : 'Factura';
    }

    // Convierte fechas dd/mm/aaaa o ISO a milisegundos para ordenar.
    function documentTime(value) {
        if (!value) return 0;
        const text = String(value).trim();
        const local = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
        if (local) {
            let year = Number(local[3]);
            if (year < 100) year += 2000;
            return new Date(year, Number(local[2]) - 1, Number(local[1])).getTime();
        }
        const parsed = new Date(text).getTime();
        return Number.isNaN(parsed) ? 0 : parsed;
    }

    function clientKey(name) {
        return store.normalizeText ? store.normalizeText(name || '') : String(name || '').toLowerCase();
    }

    function setConnectionState(online) {
        if (!el.dbState) return;
        el.dbState.hidden = false;
        el.dbState.className = `db-state${online ? ' is-online' : ' is-offline'}`;
        el.dbState.textContent = online ? 'Base de datos conectada' : 'Sin conexión · mostrando copia local';
    }

    // Adapta un documento del servidor al formato local.
    function normalizeRemoteDocument(raw) {
        if (!raw || typeof raw !== 'object') return null;
        const id = raw.id || raw.docId || '';
        if (!id) return null;

        const items = Array.isArray(raw.items)
            ? raw.items
            : (raw.payload && Array.isArray(raw.payload.items) ? raw.payload.items : []);
        const client = raw.client || (raw.payload && raw.payload.client) || {};

        return {
            id: id,
            clientId: normalizeClientId(raw.clientId || client.id || ''),
            clientName: raw.clientName || client.name || 'Sin cliente',
            type: raw.type || (raw.payload && raw.payload.type) || 'COTIZACIÓN',
            date: raw.date || (raw.payload && raw.payload.date) || '',
            items: items,
            total: raw.total !== undefined && raw.total !== null ? raw.total : ((raw.payload && raw.payload.total) || 0),
            displayName: raw.displayName || raw.fileName || `${id}.json`,
            payload: raw.payload || { type: raw.type, date: raw.date, client: client, items: items },
            createdAt: raw.createdAt || raw.updatedAt || new Date().toISOString(),
            updatedAt: raw.updatedAt || raw.createdAt || new Date().toISOString(),
            deletedAt: raw.deletedAt || null
        };
    }

    function renderSummary(documents) {
        if (!el.summary) return;

        const active = documents.filter(item => !item.deletedAt);
        const quotes = active.filter(isQuote).length;
        const invoices = active.length - quotes;
        const total = active.reduce((sum, item) => sum + (Number(item.total) || 0), 0);

        el.summary.innerHTML = `
            <div class="folder-metric">
                <span class="folder-metric-label">Documentos</span>
                <span class="folder-metric-value">${active.length}</span>
            </div>
            <div class="folder-metric">
                <span class="folder-metric-label">Cotizaciones</span>
                <span class="folder-metric-value">${quotes}</span>
            </div>
            <div class="folder-metric">
                <span class="folder-metric-label">Facturas</span>
                <span class="folder-metric-value">${invoices}</span>
            </div>
            <div class="folder-metric is-money">
                <span class="folder-metric-label">Total</span>
                <span class="folder-metric-value">${formatMoney(total)}</span>
            </div>
        `;
    }

    function renderList(documents) {
        if (!el.list) return;

        const active = documents
            .filter(item => !item.deletedAt)
            .sort((a, b) => documentTime(b.date) - documentTime(a.date) ||
                new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));

        if (!active.length) {
            el.list.innerHTML = '<div class="empty-hint">Esta carpeta no tiene documentos activos.</div>';
            return;
        }

        el.list.innerHTML = active.map(documentData => `
            <button class="folder-item${documentData.id === state.selectedId ? ' is-active' : ''}"
                    type="button" data-doc="${escapeHtml(documentData.id)}">
                <span class="folder-item-icon" aria-hidden="true">${isQuote(documentData) ? ICONS.quote : ICONS.invoice}</span>
                <span class="folder-item-main">
                    <span class="folder-item-name">${escapeHtml(documentData.displayName || documentType(documentData))}</span>
                    <span class="folder-item-meta">${escapeHtml(documentData.date || 'Sin fecha')} · ${documentType(documentData)}</span>
                </span>
                <span class="folder-item-total">${formatMoney(documentData.total)}</span>
            </button>
        `).join('');
    }

    function renderPreview(documentData) {
        if (!el.preview) return;

        if (!documentData) {
            el.preview.innerHTML = `
                <div class="preview-empty">
                    <span class="preview-empty-icon" aria-hidden="true">
                        <svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M6 3h9l4 4v14H6z"/><path d="M15 3v4h4"/><path d="M9 12h7M9 16h5"/>
                        </svg>
                    </span>
                    <h2>Selecciona un documento</h2>
                    <p>Elige una cotización de la lista para ver su previsualización completa.</p>
                </div>
            `;
            return;
        }

        const rows = (documentData.items || []).map(item => `
            <tr>
                <td>${escapeHtml(item.description || 'Sin descripción')}</td>
                <td class="num">${escapeHtml(item.quantity || '')}</td>
                <td class="num">${escapeHtml(item.price || '')}</td>
                <td class="num">${escapeHtml(item.total || '')}</td>
            </tr>
        `).join('');

        el.preview.innerHTML = `
            <div class="preview-doc">
                <div class="preview-head">
                    <div class="preview-brand">
                        <img class="preview-logo" src="${LOGO}" alt="PineApple">
                        <div>
                            <div class="preview-brand-name">PINEAPPLE</div>
                            <div class="preview-brand-sub">MultiService</div>
                        </div>
                    </div>
                    <span class="preview-type${isQuote(documentData) ? '' : ' is-invoice'}">${documentType(documentData)}</span>
                </div>

                <dl class="preview-meta">
                    <div class="preview-meta-item">
                        <dt>Cliente</dt>
                        <dd>${escapeHtml(documentData.clientName || 'Sin cliente')}</dd>
                    </div>
                    <div class="preview-meta-item">
                        <dt>ID Cliente</dt>
                        <dd>${escapeHtml(documentData.clientId || '—')}</dd>
                    </div>
                    <div class="preview-meta-item">
                        <dt>Fecha</dt>
                        <dd>${escapeHtml(documentData.date || '—')}</dd>
                    </div>
                    <div class="preview-meta-item">
                        <dt>Última edición</dt>
                        <dd>${formatDate(documentData.updatedAt)}</dd>
                    </div>
                </dl>

                <table class="preview-table">
                    <thead>
                        <tr>
                            <th>Descripción</th>
                            <th class="num">Cant.</th>
                            <th class="num">Precio</th>
                            <th class="num">Total</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rows || '<tr><td colspan="4" class="empty-hint">Sin líneas guardadas.</td></tr>'}
                    </tbody>
                </table>

                <div class="preview-total-row">
                    <span class="preview-total-label">Total</span>
                    <span class="preview-total-value">${formatMoney(documentData.total)}</span>
                </div>

                <div class="preview-actions">
                    <button class="btn btn-secondary btn-sm" type="button" data-open="${escapeHtml(documentData.id)}">Editar</button>
                    <button class="btn btn-sm" type="button" data-download="${escapeHtml(documentData.id)}">Descargar JSON</button>
                </div>
            </div>
        `;
    }

    function select(documentId) {
        state.selectedId = documentId;
        const documentData = state.documents.find(item => item.id === documentId) || null;
        renderList(state.documents);
        renderPreview(documentData);
    }

    function download(documentData) {
        const payload = documentData.payload || {
            type: documentData.type,
            date: documentData.date,
            client: { id: documentData.clientId, name: documentData.clientName },
            items: documentData.items
        };
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = documentData.displayName || 'documento.json';
        link.click();
        URL.revokeObjectURL(url);
    }

    // Carga los documentos desde la base de datos (con respaldo en caché local).
    async function load() {
        const params = new URLSearchParams(window.location.search);
        state.clientName = params.get('cliente') || '';
        state.clientId = normalizeClientId(params.get('id') || '');

        if (el.title) el.title.textContent = state.clientName || 'Carpeta del cliente';
        if (el.subtitle) el.subtitle.textContent = `Documentos de ${state.clientName || 'este cliente'}`;

        // 1) Caché local (permite ver algo mientras responde el servidor).
        try {
            const local = await window.pineappleDB.getAll('documents');
            state.documents = local.filter(matchClient);
            renderSummary(state.documents);
            renderList(state.documents);
            if (state.documents.length) select(state.documents[0].id);
        } catch (error) {
            /* IndexedDB puede estar bloqueado en modo incógnito. */
        }

        // 2) Base de datos (fuente principal).
        if (typeof fetchJsonOrNull === 'function') {
            const remote = await fetchJsonOrNull(DOCS_API);
            if (Array.isArray(remote)) {
                setConnectionState(true);

                const records = remote
                    .map(normalizeRemoteDocument)
                    .filter(record => record && matchClient(record));

                // Combina servidor + locales (sin duplicar).
                const merged = new Map();
                records.forEach(record => merged.set(record.id, record));
                state.documents.forEach(record => {
                    if (!merged.has(record.id)) merged.set(record.id, record);
                });

                state.documents = [...merged.values()];

                for (const record of state.documents) {
                    try { await window.pineappleDB.put('documents', record); } catch (error) { /* caché opcional */ }
                }

                renderSummary(state.documents);
                renderList(state.documents);
                if (!state.selectedId && state.documents.length) select(state.documents[0].id);
                return;
            }
        }

        setConnectionState(false);
    }

    // ¿Este documento pertenece a la carpeta del cliente abierto?
    function matchClient(documentData) {
        if (!documentData) return false;
        const sameId = state.clientId &&
            normalizeClientId(documentData.clientId) === state.clientId;
        const sameName = clientKey(documentData.clientName) === clientKey(state.clientName);
        return Boolean(sameId || sameName);
    }

    document.addEventListener('click', event => {
        const item = event.target.closest('[data-doc]');
        if (item) {
            select(item.dataset.doc);
            return;
        }

        const openDoc = event.target.closest('[data-open]');
        if (openDoc) {
            window.open(`cotizaciones.html?doc=${encodeURIComponent(openDoc.dataset.open)}`, '_blank');
            return;
        }

        const downloadDoc = event.target.closest('[data-download]');
        if (downloadDoc) {
            const documentData = state.documents.find(item => item.id === downloadDoc.dataset.download);
            if (documentData) download(documentData);
            return;
        }

        if (event.target.closest('#folder-back')) {
            if (window.history.length > 1) window.history.back();
            else window.location.href = 'index.html';
            return;
        }

        if (event.target.closest('#folder-new')) {
            const params = new URLSearchParams({
                nuevo: '1',
                cliente: state.clientName,
                id: state.clientId
            });
            window.open(`cotizaciones.html?${params.toString()}`, '_blank');
        }
    });

    load().catch(error => {
        console.warn('No se pudo cargar la carpeta:', error);
        toast('No se pudo cargar la carpeta del cliente.', 'error');
    });
})();
