/* PineApple Work Center — Dashboard de clientes y documentos */
(function () {
    const store = window.pineappleStore || {};
    const {
        normalizeText,
        normalizeClientId,
        formatMoney,
        formatDate,
        makeId,
        fetchJson,
        fetchJsonOrNull,
        CLIENTS_API,
        DOCS_API
    } = store;

    const TRASH_DAYS = 30;

    const state = {
        clients: [],
        documents: [],
        view: 'documents',
        sort: 'recent',
        clientFilter: '',
        selectedDocumentId: null,
        pendingMoveId: null,
        syncing: false,
        databaseOnline: null,
        clientsOnline: null
    };

    const el = {
        stats: document.getElementById('dash-stats'),
        grid: document.getElementById('clients-grid'),
        clientFilter: document.getElementById('client-filter-input'),
        clientFilterClear: document.getElementById('client-filter-clear'),
        trashBtn: document.getElementById('trash-toggle'),
        overlay: document.getElementById('detail-overlay'),
        detail: document.getElementById('detail-body'),
        picker: document.getElementById('picker-overlay'),
        pickerList: document.getElementById('picker-list'),
        toasts: document.getElementById('toast-stack'),
        emptyCards: document.getElementById('empty-cards')
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

    function clientKey(name) {
        return normalizeText(name || '') || 'sin cliente';
    }

    function daysLeft(documentData) {
        const started = new Date(documentData.deletedAt || documentData.updatedAt || Date.now()).getTime();
        const elapsed = Math.floor((Date.now() - started) / 86400000);
        return Math.max(0, TRASH_DAYS - elapsed);
    }

    function buildFolders() {
        const map = new Map();

        state.clients.forEach(client => {
            if (client.deletedAt) return;
            map.set(clientKey(client.name), {
                name: client.name,
                id: normalizeClientId(client.id),
                documents: []
            });
        });

        state.documents.forEach(documentData => {
            const key = clientKey(documentData.clientName);
            if (!map.has(key)) {
                map.set(key, {
                    name: documentData.clientName || 'Sin cliente',
                    id: normalizeClientId(documentData.clientId),
                    documents: []
                });
            }
            const folder = map.get(key);
            folder.documents.push(documentData);
            if (!folder.id && documentData.clientId) folder.id = normalizeClientId(documentData.clientId);
        });

        const folders = [...map.values()];
        folders.forEach(folder => {
            folder.documents.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
            folder.active = folder.documents.filter(item => !item.deletedAt);
            folder.trashed = folder.documents.filter(item => item.deletedAt);
            folder.quotes = folder.active.filter(isQuote).length;
            folder.invoices = folder.active.filter(item => !isQuote(item)).length;
            folder.total = folder.active.reduce((sum, item) => sum + (Number(item.total) || 0), 0);
            const newest = folder.active[0] || folder.trashed[0] || null;
            folder.latest = newest;
            folder.updatedAt = newest ? new Date(newest.updatedAt).getTime() : 0;
        });

        return folders;
    }

    function visibleFolders(folders) {
        const trashView = state.view === 'trash';

        return folders
            .filter(folder => {
                if (trashView) return folder.trashed.length > 0;
                if (!folder.active.length) return false;
                if (state.view === 'invoices' && !folder.invoices) return false;

                // Filtro por cliente: es una búsqueda de texto libre. Se compara
                // contra el nombre de la carpeta, el nombre del cliente y su id,
                // ignorando acentos y mayúsculas.
                if (state.clientFilter) {
                    const needle = normalizeText(state.clientFilter);
                    const haystack = [
                        folder.name,
                        folder.id ? normalizeClientId(folder.id) : '',
                        String(folder.id || '').replace(/^@/, '')
                    ].filter(Boolean).join(' ');
                    if (!normalizeText(haystack).includes(needle)) return false;
                }

                return true;
            })
            .sort((a, b) => {
                if (state.sort === 'name') return a.name.localeCompare(b.name, 'es');
                if (state.sort === 'total') return b.total - a.total;
                if (state.sort === 'count') return b.documents.length - a.documents.length;
                return b.updatedAt - a.updatedAt;
            });
    }

    // El buscador de clientes es un campo de texto: solo hay que reflejar el
    // valor activo y mostrar u ocultar la «x» para borrar la búsqueda.
    function renderClientFilter() {
        if (!el.clientFilter) return;
        if (document.activeElement !== el.clientFilter) {
            el.clientFilter.value = state.clientFilter;
        }
        if (el.clientFilterClear) {
            el.clientFilterClear.hidden = !state.clientFilter;
        }
    }


    function renderStats(folders) {
        const active = state.documents.filter(item => !item.deletedAt);

        const cards = [
            { key: 'documents', label: 'Documentos', value: active.length, hint: `${folders.filter(f => f.active.length).length} carpetas activas`, accent: true },
            { key: 'clients', label: 'Clientes', value: folders.filter(f => f.active.length || f.trashed.length).length, hint: 'Carpetas creadas' }
        ];

        el.stats.innerHTML = cards.map(card => `
            <button class="stat-card${state.view === card.key ? ' is-active' : ''}${card.accent ? ' is-accent' : ''}" type="button" data-stat="${card.key}">
                <span class="stat-label">${card.label}</span>
                <span class="stat-value">${card.value}</span>
                <span class="stat-hint">${card.hint}</span>
            </button>
        `).join('');
    }

    // Iconos SVG (sin emojis genéricos) para carpetas y documentos.
    const ICONS = {
        folder: '<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 7.5A1.5 1.5 0 0 1 4.5 6h4l2 2.2h7A1.5 1.5 0 0 1 19 9.7v7.8A1.5 1.5 0 0 1 17.5 19h-13A1.5 1.5 0 0 1 3 17.5z"/></svg>',
        quote: '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 3h9l4 4v14H6z"/><path d="M15 3v4h4"/><path d="M9 12h7M9 16h5"/></svg>',
        invoice: '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 3l2.5 1.6L12 3l2.5 1.6L17 3v17l-2.5-1.6L12 20l-2.5-1.6L7 20z"/><path d="M10 9h4M10 13h4"/></svg>',
        trash: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16"/><path d="M9 7V5h6v2"/><path d="M6 7l1 12h10l1-12"/></svg>'
    };

    function renderDocumentButton(documentData) {
        const name = documentData.displayName || `${documentType(documentData)}_${documentData.date}.json`;
        const badge = documentData.deletedAt
            ? `<span class="client-doc-date">${daysLeft(documentData)} días restantes en papelera</span>`
            : `<span class="client-doc-date">${escapeHtml(documentData.date || 'Sin fecha')} · ${documentType(documentData)}</span>`;

        return `
            <button class="client-doc" type="button" data-document="${escapeHtml(documentData.id)}">
            <span class="client-doc-icon" aria-hidden="true">${isQuote(documentData) ? ICONS.quote : ICONS.invoice}</span>
            <span class="client-doc-main">
                    <span>${escapeHtml(name)}</span>
                    ${badge}
                </span>
                <span class="client-doc-total">${formatMoney(documentData.total)}</span>
            </button>
        `;
    }

    // Cada carpeta muestra solo la cotización más reciente. El resto se ve
    // entrando con "Ver carpeta" (página con todas las previsualizaciones).
    function renderFolder(folder) {
        const trashView = state.view === 'trash';
        const documents = trashView ? folder.trashed : folder.active;
        const latest = documents[0] || null;
        const hidden = Math.max(0, documents.length - 1);

        return `
            <article class="client-card" data-folder="${escapeHtml(folder.name)}">
                <div class="client-card-head">
                    <span class="folder-badge" aria-hidden="true">${ICONS.folder}</span>
                    <div style="min-width:0;flex:1;">
                        <h2 class="client-name">${escapeHtml(folder.name)}</h2>
                        <div class="client-id-line">
                            <span>Carpeta con ${folder.documents.length} documento${folder.documents.length === 1 ? '' : 's'}</span>
                            ${folder.id ? `<span class="client-id">${escapeHtml(folder.id)}</span>` : ''}
                        </div>
                    </div>
                </div>
                <div class="client-stats">
                    ${folder.quotes ? `<span class="stat-pill is-quote">${folder.quotes} ${folder.quotes === 1 ? 'cotización' : 'cotizaciones'}</span>` : ''}
                    ${folder.invoices ? `<span class="stat-pill is-invoice">${folder.invoices} factura${folder.invoices === 1 ? '' : 's'}</span>` : ''}
                    ${folder.total ? `<span class="stat-pill is-money">${formatMoney(folder.total)}</span>` : ''}
                    ${folder.trashed.length ? `<span class="stat-pill">${folder.trashed.length} en papelera</span>` : ''}
                    ${!folder.active.length ? '<span class="stat-pill">Sin documentos activos</span>' : ''}
                </div>
                <div class="client-docs">
                    ${latest
                        ? renderDocumentButton(latest) +
                            (hidden ? `<div class="empty-hint">+${hidden} documento(s) más · pulsa «Ver carpeta»</div>` : '')
                        : '<div class="empty-hint">Esta carpeta está vacía por ahora.</div>'}
                </div>
                <div class="client-actions">
                    <button class="btn btn-secondary btn-sm" type="button" data-new-doc="${escapeHtml(folder.name)}" data-new-id="${escapeHtml(folder.id)}">Nueva cotización</button>
                    <button class="btn btn-sm" type="button" data-open-folder="${escapeHtml(folder.name)}" data-folder-id="${escapeHtml(folder.id)}">Ver carpeta</button>
                </div>
            </article>
        `;
    }

    function render() {
        const folders = buildFolders();
        renderStats(folders);

        renderClientFilter();

        const visible = visibleFolders(folders);
        el.grid.innerHTML = visible.length
            ? visible.map(renderFolder).join('')
            : el.emptyCards.innerHTML;

        if (el.trashBtn) {
            el.trashBtn.textContent = state.view === 'trash'
                ? 'Volver a documentos'
                : `Papelera (${state.documents.filter(item => item.deletedAt).length})`;
        }
    }

    function openDetail(documentId) {
        const documentData = state.documents.find(item => item.id === documentId);
        if (!documentData) return;

        state.selectedDocumentId = documentId;

        const rows = (documentData.items || []).map(item => `
            <li>
                <span class="item-name">${escapeHtml(item.description || 'Sin descripción')}</span>
                <span>
                    <span class="item-qty">${escapeHtml(item.quantity || '')}${item.quantity ? ' × ' : ''}${escapeHtml(item.price || '')}</span>
                    <span class="item-total">${escapeHtml(item.total || '')}</span>
                </span>
            </li>
        `).join('');

        el.detail.innerHTML = `
            <div class="detail-head">
                <div>
                    <span class="detail-kicker">${documentType(documentData)}</span>
                    <h2 class="detail-title">${escapeHtml(documentData.clientName || 'Sin cliente')}</h2>
                </div>
                <button class="icon-btn" type="button" data-close-detail aria-label="Cerrar">×</button>
            </div>
            <dl class="detail-meta">
                <dt>Archivo</dt><dd>${escapeHtml(documentData.displayName || '—')}</dd>
                <dt>Fecha del documento</dt><dd>${escapeHtml(documentData.date || '—')}</dd>
                <dt>ID cliente</dt><dd>${escapeHtml(documentData.clientId || '—')}</dd>
                <dt>Última edición</dt><dd>${formatDate(documentData.updatedAt)}</dd>
                <dt>Total</dt><dd>${formatMoney(documentData.total)}</dd>
            </dl>
            ${rows ? `<ul class="detail-items">${rows}</ul>` : '<div class="empty-hint">Sin líneas guardadas.</div>'}
            <div class="detail-total"><span>Total</span><span>${formatMoney(documentData.total)}</span></div>
            <div class="detail-actions">
                <button class="btn btn-secondary btn-sm" type="button" data-action="open">Editar</button>
                <button class="btn btn-secondary btn-sm" type="button" data-action="duplicate">Duplicar</button>
                <button class="btn btn-secondary btn-sm is-wide" type="button" data-action="download">Descargar aviso original</button>
                ${documentData.deletedAt
                    ? `<button class="btn btn-secondary btn-sm is-wide" type="button" data-action="restore">Restaurar</button>
                       <button class="btn btn-sm is-wide" type="button" data-action="purge">Eliminar definitivamente</button>`
                    : '<button class="btn btn-sm is-wide" type="button" data-action="trash">Mover a la papelera</button>'}
            </div>
            <p class="detail-note">“Editar” abre el editor con estos datos cargados; al guardar se actualiza esta misma versión.</p>
        `;

        el.overlay.hidden = false;
    }

    function closeDetail() {
        el.overlay.hidden = true;
        state.selectedDocumentId = null;
    }

    function selectedDocument() {
        return state.documents.find(item => item.id === state.selectedDocumentId) || null;
    }

    function openEditor(documentData) {
        window.location.href = `cotizaciones.html?doc=${encodeURIComponent(documentData.id)}`;
    }

    async function duplicateDocument(documentData) {
        const now = new Date().toISOString();
        const copy = {
            ...documentData,
            id: makeId('doc'),
            createdAt: now,
            updatedAt: now,
            deletedAt: null,
            remote: false,
            displayName: (documentData.displayName || 'documento.json').replace(/\.json$/i, ' (copia).json')
        };

        closeDetail();
        await persistDocument(copy, { message: 'Documento duplicado.' });
    }

    async function trashDocument(documentData) {
        const updated = { ...documentData, deletedAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
        closeDetail();
        await persistDocument(updated, { message: 'Enviado a la papelera. Se conserva 30 días.' });
    }

    async function restoreDocument(documentData) {
        const updated = { ...documentData, deletedAt: null, updatedAt: new Date().toISOString() };
        closeDetail();
        await persistDocument(updated, { message: 'Documento restaurado.' });
    }

    async function purgeDocument(documentData) {
        if (!window.confirm(`¿Eliminar definitivamente "${documentData.displayName}"?`)) return;
        await window.pineappleDB.remove('documents', documentData.id);
        await window.pineappleDB.remove('files', documentData.id).catch(() => {});
        state.documents = state.documents.filter(item => item.id !== documentData.id);
        closeDetail();
        render();
        await pushDocumentToDatabase({ ...documentData, deletedAt: documentData.deletedAt || new Date().toISOString(), purged: true });
        toast('Documento eliminado definitivamente.');
    }

    function downloadDocument(documentData) {
        const payload = documentData.payload || {
            type: documentData.type,
            date: documentData.date,
            client: { id: documentData.clientId, name: documentData.clientName },
            items: documentData.items,
            useLetterhead: documentData.useLetterhead,
            letterheadHtml: documentData.letterheadHtml
        };

        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = documentData.displayName || 'documento.json';
        link.click();
        URL.revokeObjectURL(url);
    }

    function openPicker(documentData) {
        state.pendingMoveId = documentData.id;

        const options = state.clients
            .filter(client => !client.deletedAt)
            .sort((a, b) => a.name.localeCompare(b.name, 'es'))
            .map(client => `
                <button class="picker-option" type="button" data-pick="${escapeHtml(client.id)}">
                    <span>${escapeHtml(client.name)}</span>
                    <span class="picker-id">${escapeHtml(normalizeClientId(client.id))}</span>
                </button>
            `).join('');

        el.pickerList.innerHTML = `${options}<button class="picker-option" type="button" data-pick=""><span>Sin cliente</span><span class="picker-id">quitar</span></button>`;
        el.picker.hidden = false;
    }

    function closePicker() {
        el.picker.hidden = true;
        state.pendingMoveId = null;
    }

    async function moveDocument(clientId) {
        const documentData = state.documents.find(item => item.id === state.pendingMoveId);
        if (!documentData) return;

        const client = state.clients.find(item => normalizeClientId(item.id) === normalizeClientId(clientId));
        const updated = {
            ...documentData,
            clientId: client ? normalizeClientId(client.id) : '',
            clientName: client ? client.name : 'Sin cliente',
            updatedAt: new Date().toISOString()
        };

        closePicker();
        closeDetail();
        await persistDocument(updated, {
            message: client ? `Movido a la carpeta de ${client.name}.` : 'Documento movido a Sin cliente.'
        });
    }

    // La BASE DE DATOS es la fuente principal del dashboard: las carpetas,
    // facturas y cotizaciones se leen del servidor. IndexedDB solo se usa como
    // caché para poder ver algo mientras carga (o si no hay conexión).
    async function syncFromDatabase(options = {}) {
        if (state.syncing) return;
        state.syncing = true;

        const read = typeof fetchJsonOrNull === 'function'
            ? fetchJsonOrNull
            : (typeof fetchJson === 'function' ? fetchJson : null);

        let clientsOk = false;
        let docsOk = false;

        try {
            if (read) {
                const remoteClients = await read(CLIENTS_API);
                if (Array.isArray(remoteClients)) {
                    clientsOk = true;
                    const byName = new Map(state.clients.map(client => [clientKey(client.name), client]));
                    const now = new Date().toISOString();

                    for (const client of remoteClients) {
                        const name = typeof client.name === 'string' ? client.name.trim() : '';
                        const id = normalizeClientId(client.id || '');
                        if (!name || !id) continue;

                        const current = byName.get(clientKey(name));
                        if (current && normalizeClientId(current.id) === id) continue;

                        const merged = {
                            id: id,
                            name: name,
                            createdAt: current ? current.createdAt : now,
                            updatedAt: now
                        };
                        await window.pineappleDB.put('clients', merged);
                        byName.set(clientKey(name), merged);
                    }
                }
            }

            const remoteDocs = read ? await read(DOCS_API) : null;
            if (Array.isArray(remoteDocs)) {
                docsOk = true;

                // La base de datos manda: se reconstruye el estado con lo que
                // devuelve el servidor y se conserva en la caché local.
                const remoteRecords = remoteDocs
                    .map(normalizeRemoteDocument)
                    .filter(Boolean);

                if (remoteRecords.length) {
                    const local = new Map(state.documents.map(item => [item.id, item]));
                    for (const record of remoteRecords) {
                        await window.pineappleDB.put('documents', record);
                        local.set(record.id, record);
                    }
                    state.documents = [...local.values()];
                }
            }
        } catch (error) {
            /* Sin conexión: se muestran los datos guardados en la caché local. */
        } finally {
            state.syncing = false;
        }

        state.clients = await window.pineappleDB.getAll('clients');
        if (!state.syncing) {
            state.documents = await window.pineappleDB.getAll('documents');
        }

        // Aviso visible cuando el servidor no está disponible, para que no
        // parezca que "no guardó": el dashboard lo dice claramente.
        state.databaseOnline = docsOk;
        state.clientsOnline = clientsOk;
        renderConnectionState();

        render();
        if (!options.silent) applyUrlTarget();
    }

    // Muestra en pantalla si el dashboard está leyendo de la base de datos.
    // El aviso usa el mismo punto verde que la barra del cotizador.
    function renderConnectionState() {
        const online = state.databaseOnline === true;
        const unknown = state.databaseOnline === null;
        const clientsOk = state.clientsOnline === true;

        const badge = document.getElementById('db-state');
        if (!badge) return;

        badge.hidden = false;
        badge.className = `db-state${online ? ' is-online' : unknown ? '' : ' is-offline'}`;
        badge.textContent = online
            ? 'Base de datos conectada'
            : unknown
                ? 'Conectando con la base de datos…'
                : clientsOk
                    ? 'Sin conexión · trabajando con copia local'
                    : 'Sin conexión a la base de datos · mostrando copia local';
    }

    // Adapta un documento que llega del servidor al formato que usa el dashboard.
    function normalizeRemoteDocument(raw) {
        if (!raw || typeof raw !== 'object') return null;
        const id = raw.id || raw.docId || '';
        if (!id) return null;

        const items = Array.isArray(raw.items) ? raw.items : (raw.payload && Array.isArray(raw.payload.items) ? raw.payload.items : []);
        const client = raw.client || raw.payload?.client || {};

        return {
            id: id,
            clientId: normalizeClientId(raw.clientId || client.id || ''),
            clientName: raw.clientName || client.name || 'Sin cliente',
            type: raw.type || raw.payload?.type || 'COTIZACIÓN',
            date: raw.date || raw.payload?.date || '',
            items: items,
            total: raw.total ?? raw.payload?.total ?? 0,
            displayName: raw.displayName || raw.fileName || `${raw.type || 'Documento'}_${id}.json`,
            payload: raw.payload || { type: raw.type, date: raw.date, client: client, items: items },
            createdAt: raw.createdAt || raw.updatedAt || new Date().toISOString(),
            updatedAt: raw.updatedAt || raw.createdAt || new Date().toISOString(),
            deletedAt: raw.deletedAt || null,
            remote: true
        };
    }

    // Sube un documento (y su cliente) a la base de datos remota. Es tolerante a
    // fallos: si no hay conexión, el documento queda guardado localmente.
    async function pushClientToDatabase(client) {
        if (typeof fetchJson !== 'function' || !client || !client.name) return;
        try {
            await fetchJson(CLIENTS_API, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: client.name,
                    id: normalizeClientId(client.id)
                })
            });
        } catch (error) {
            /* El cliente queda local; se reintenta en la próxima sincronización. */
        }
    }

    // Devuelve true si el documento quedó guardado en la base de datos.
    async function pushDocumentToDatabase(documentData) {
        if (typeof fetchJson !== 'function' || !DOCS_API) return false;

        const client = state.clients.find(item =>
            normalizeClientId(item.id) === normalizeClientId(documentData.clientId));
        if (client) await pushClientToDatabase(client);

        try {
            await fetchJson(DOCS_API, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id: documentData.id,
                    clientId: normalizeClientId(documentData.clientId),
                    clientName: documentData.clientName,
                    type: documentData.type,
                    date: documentData.date,
                    items: documentData.items || [],
                    total: documentData.total || 0,
                    displayName: documentData.displayName,
                    deletedAt: documentData.deletedAt || null,
                    updatedAt: documentData.updatedAt,
                    createdAt: documentData.createdAt
                })
            });
            return true;
        } catch (error) {
            return false;
        }
    }

    // Persiste un documento localmente y, después, en la base de datos.
    async function persistDocument(documentData, options = {}) {
        await window.pineappleDB.put('documents', documentData);
        state.documents = state.documents.map(item => (item.id === documentData.id ? documentData : item));
        if (!state.documents.some(item => item.id === documentData.id)) state.documents.push(documentData);
        render();

        const uploaded = await pushDocumentToDatabase(documentData);
        if (uploaded) {
            const synced = { ...documentData, remote: true };
            await window.pineappleDB.put('documents', synced);
            state.documents = state.documents.map(item => (item.id === synced.id ? synced : item));
            renderConnectionState();
        }

        if (options.message) toast(options.message);
    }

    async function init() {
        try {
            const loaded = await Promise.all([
                window.pineappleDB.getAll('clients'),
                window.pineappleDB.getAll('documents')
            ]);
            state.clients = loaded[0];
            state.documents = loaded[1];
        } catch (error) {
            el.grid.innerHTML = `
                <div class="empty-state">
                    <h2>No se pudo abrir el almacén de documentos</h2>
                    <p>Tu navegador bloqueó IndexedDB (suele pasar en modo incógnito). Cierra la ventana privada e intenta otra vez.</p>
                </div>`;
            return;
        }

        render();

        applyUrlTarget();

        // Carga inicial desde la base de datos y refresco periódico.
        syncFromDatabase({ silent: true });
        window.addEventListener('focus', () => syncFromDatabase({ silent: true }));
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') syncFromDatabase({ silent: true });
        });
    }

    // Si la URL trae ?doc=<id> (y opcionalmente vista=carpeta), enfoca la carpeta
    // del cliente y abre el detalle del documento que acaba de exportarse.
    // Se puede reintentar (por ejemplo, justo después de desbloquear el dashboard).
    function applyUrlTarget() {
        const params = new URLSearchParams(window.location.search);
        const documentId = params.get('doc');
        if (!documentId) return false;

        const documentData = state.documents.find(item => item.id === documentId);
        if (!documentData) return false;

        if (params.get('vista') === 'carpeta') {
            // Aseguramos que la vista de documentos esté activa y que la carpeta
            // del cliente quede visible en la lista, sin filtros que la oculten.
            state.view = 'documents';
            state.clientFilter = '';
            render();
        }

        // Enfocar y resaltar la tarjeta del cliente en la lista.
        focusClientCard(documentData.clientName);

        // Abrir el detalle del documento exportado.
        openDetail(documentId);
        return true;
    }

    // Lleva la tarjeta de la carpeta a la vista y la resalta brevemente.
    function focusClientCard(clientName) {
        if (!clientName) return;
        const key = clientKey(clientName);
        const card = [...el.grid.querySelectorAll('.client-card')]
            .find(node => clientKey(node.dataset.folder) === key);
        if (!card) return;

        card.classList.add('is-target');
        card.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setTimeout(() => card.classList.remove('is-target'), 4000);
    }

    // Permite que el desbloqueo (script del candado) aplique el objetivo de la
    // URL cuando los datos ya estén cargados.
    window.pineappleApplyUrlTarget = applyUrlTarget;

    // API pública para que otras pestañas (el editor) puedan refrescar el
    // dashboard después de guardar un documento en la base de datos.
    window.pineappleDashboard = {
        refresh: options => syncFromDatabase(options),
        reload: async () => {
            state.clients = await window.pineappleDB.getAll('clients');
            state.documents = await window.pineappleDB.getAll('documents');
            render();
        }
    };

    document.addEventListener('click', async event => {
        const stat = event.target.closest('[data-stat]');
        if (stat) {
            const key = stat.dataset.stat;
            if (key === 'clients') {
                state.view = 'documents';
                state.sort = 'count';
            } else {
                state.view = state.view === key ? 'documents' : key;
            }
            render();
            return;
        }


        const documentButton = event.target.closest('[data-document]');
        if (documentButton) {
            openDetail(documentButton.dataset.document);
            return;
        }

        const newDoc = event.target.closest('[data-new-doc]');
        if (newDoc) {
            const params = new URLSearchParams({
                nuevo: '1',
                cliente: newDoc.dataset.newDoc,
                id: newDoc.dataset.newId || ''
            });
            window.location.href = `cotizaciones.html?${params.toString()}`;
            return;
        }

        // "Ver carpeta" abre la página con todas las cotizaciones del cliente.
        const openFolder = event.target.closest('[data-open-folder]');
        if (openFolder) {
            const params = new URLSearchParams({
                cliente: openFolder.dataset.openFolder,
                id: openFolder.dataset.folderId || ''
            });
            window.location.href = `carpeta.html?${params.toString()}`;
            return;
        }

        const action = event.target.closest('[data-action]');
        if (action) {
            const documentData = selectedDocument();
            if (!documentData) return;

            const name = action.dataset.action;
            if (name === 'open') openEditor(documentData);
            if (name === 'duplicate') await duplicateDocument(documentData);
            if (name === 'move') openPicker(documentData);
            if (name === 'download') downloadDocument(documentData);
            if (name === 'trash') await trashDocument(documentData);
            if (name === 'restore') await restoreDocument(documentData);
            if (name === 'purge') await purgeDocument(documentData);
            return;
        }

        const pick = event.target.closest('[data-pick]');
        if (pick) {
            await moveDocument(pick.dataset.pick);
            return;
        }

        if (event.target.closest('[data-close-detail]') || event.target === el.overlay) {
            closeDetail();
            return;
        }

        if (event.target === el.picker || event.target.closest('[data-close-picker]')) {
            closePicker();
            return;
        }

        if (event.target.closest('#trash-toggle')) {
            state.view = state.view === 'trash' ? 'documents' : 'trash';
            render();
        }
    });

    // Si la pestaña queda inactiva y vuelve a primer plano, recarga desde la BD.
    window.addEventListener('storage', event => {
        if (event.key === 'pineappleDocumentsChanged') syncFromDatabase({ silent: true });
    });

    // ---- Buscador de clientes ----
    // Se filtra mientras se escribe. El render es ligero (solo se vuelven a
    // pintar las tarjetas), así que no hace falta retrasar la entrada.
    if (el.clientFilter) {
        el.clientFilter.addEventListener('input', event => {
            state.clientFilter = event.target.value.trim();
            render();
        });

        el.clientFilter.addEventListener('keydown', event => {
            if (event.key === 'Escape' && state.clientFilter) {
                event.stopPropagation();
                state.clientFilter = '';
                el.clientFilter.value = '';
                render();
                el.clientFilter.blur();
            }
        });
    }

    if (el.clientFilterClear) {
        el.clientFilterClear.addEventListener('click', () => {
            state.clientFilter = '';
            if (el.clientFilter) {
                el.clientFilter.value = '';
                el.clientFilter.focus();
            }
            render();
        });
    }

    document.addEventListener('keydown', event => {
        if (event.key !== 'Escape') return;
        if (el.overlay && !el.overlay.hidden) closeDetail();
        if (el.picker && !el.picker.hidden) closePicker();
    });

    init();
})();
