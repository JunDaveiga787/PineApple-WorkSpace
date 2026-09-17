/* PineApple Work Center — helpers de almacenamiento y carpetas locales */
(function (global) {
    const CLIENTS_API = 'https://cornflowerblue-beaver-995948.hostingersite.com/api/clientes.php';
    const DOCS_API = 'https://cornflowerblue-beaver-995948.hostingersite.com/api/documentos.php';
    const FOLDER_DB = 'pineappleWorkCenterFolders';
    const moneyFormatter = new Intl.NumberFormat('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });

    /* Bloquea el zoom en TODA la página: además de la meta viewport y
       touch-action, corta el zoom con Ctrl/⌘ + rueda, los gestos de Safari
       (gesturestart/change), el doble toque y los atajos de teclado. */
    function lockPageZoom() {
        // Zoom con Ctrl/⌘ + rueda del ratón o trackpad.
        global.addEventListener('wheel', event => {
            if (event.ctrlKey || event.metaKey) event.preventDefault();
        }, { passive: false });

        // Zoom por gestos de Safari (pellizco) en iOS/macOS.
        ['gesturestart', 'gesturechange', 'gestureend'].forEach(name => {
            global.addEventListener(name, event => event.preventDefault(), { passive: false });
        });

        // Zoom con teclado: Ctrl/⌘ con +, -, =, 0.
        global.addEventListener('keydown', event => {
            if (!event.ctrlKey && !event.metaKey) return;
            if (['+', '-', '=', '0'].includes(event.key)) event.preventDefault();
        });

        // Doble toque que agranda la página en móvil.
        let lastTouchEnd = 0;
        global.addEventListener('touchend', event => {
            const now = Date.now();
            if (now - lastTouchEnd <= 300) event.preventDefault();
            lastTouchEnd = now;
        }, { passive: false });
    }

    lockPageZoom();

    function normalizeText(text = '') {
        return String(text)
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-z0-9]+/g, ' ')
            .trim();
    }

    function normalizeClientId(id = '') {
        const clean = String(id).replace(/^@+/, '').trim();
        return clean ? `@${clean}` : '';
    }

    function sanitizeSegment(name = '', fallback = 'Cliente') {
        const clean = String(name)
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[\\/:*?"<>|]+/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .replace(/\.+$/, '');
        return clean || fallback;
    }

    function parseVal(value) {
        if (value === null || value === undefined) return 0;
        const clean = String(value).replace(/[^0-9.-]+/g, '');
        const parsed = parseFloat(clean);
        return Number.isNaN(parsed) ? 0 : parsed;
    }

    function formatMoney(value) {
        const amount = Number(value) || 0;
        return `$${moneyFormatter.format(amount)}`;
    }

    function formatDate(value) {
        if (!value) return '—';
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return '—';
        return date.toLocaleDateString('es-DO', { day: '2-digit', month: '2-digit', year: 'numeric' });
    }

    function formatDateTime(value) {
        if (!value) return '—';
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return '—';
        return date.toLocaleString('es-DO', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    function fileStamp(value) {
        const date = value ? new Date(value) : new Date();
        const safeDate = Number.isNaN(date.getTime()) ? new Date() : date;
        const pad = number => String(number).padStart(2, '0');
        return `${safeDate.getFullYear()}-${pad(safeDate.getMonth() + 1)}-${pad(safeDate.getDate())}_${pad(safeDate.getHours())}${pad(safeDate.getMinutes())}`;
    }

    function makeId(prefix) {
        const random = Math.random().toString(36).slice(2, 8);
        return `${prefix}_${Date.now().toString(36)}${random}`;
    }

    function isSupported() {
        return typeof global.showDirectoryPicker === 'function';
    }

    /* Alias que usa el dashboard (admite escritura y elección de carpeta). */
    function supportsFolderPicker() {
        return typeof global.showDirectoryPicker === 'function';
    }

    async function fetchWithTimeout(url, options = {}, timeout = 6000) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);
        try {
            return await fetch(url, { ...options, signal: controller.signal });
        } finally {
            clearTimeout(timeoutId);
        }
    }

    async function fetchJsonOrNull(url) {
        try {
            const response = await fetchWithTimeout(url);
            if (!response.ok) return null;
            return await response.json();
        } catch (error) {
            return null;
        }
    }

    /* Igual que fetchJsonOrNull, pero lanza error para poder distinguir
       "sin datos" de "sin conexión" cuando el dashboard sincroniza clientes. */
    async function fetchJson(url, options = {}) {
        const response = await fetchWithTimeout(url, options);
        if (!response.ok) throw new Error(`La API respondió con ${response.status}`);
        return response.json();
    }

    /* Verifica que el navegador siga autorizando una carpeta ya elegida.
       Si el usuario concedió permiso antes, lo reutiliza sin volver a preguntar. */
    async function requestFolderPermission(handle) {
        if (!handle || typeof handle.queryPermission !== 'function') return false;
        try {
            const current = await handle.queryPermission({ mode: 'readwrite' });
            if (current === 'granted') return true;
            return (await handle.requestPermission({ mode: 'readwrite' })) === 'granted';
        } catch (error) {
            return false;
        }
    }

    /* Lee la carpeta recordada sin abrir el selector del sistema. */
    async function getStoredFolderHandle() {
        if (!isSupported() || !hasRememberedFolder()) return null;
        try {
            const directory = await global.showDirectoryPicker({ id: 'pineapple-invoices', mode: 'readwrite' });
            return (await requestFolderPermission(directory)) ? directory : null;
        } catch (error) {
            return null;
        }
    }

    function readStoredFolder() {
        try {
            const raw = JSON.parse(localStorage.getItem(FOLDER_DB) || 'null');
            if (!raw || typeof raw !== 'object') return null;
            const required = ['year', 'month', 'day', 'hour', 'minute', 'second'];
            const valid = required.every(key => Number.isInteger(raw[key]));
            return valid ? raw : null;
        } catch (error) {
            localStorage.removeItem(FOLDER_DB);
            return null;
        }
    }

    async function pickFolder() {
        if (!isSupported()) {
            throw new Error('unsupported');
        }

        const handle = await global.showDirectoryPicker({ mode: 'readwrite' });
        const permission = await handle.requestPermission({ mode: 'readwrite' });
        if (permission !== 'granted') {
            throw new Error('denied');
        }

        const now = new Date();
        localStorage.setItem(FOLDER_DB, JSON.stringify({
            year: now.getFullYear(),
            month: now.getMonth() + 1,
            day: now.getDate(),
            hour: now.getHours(),
            minute: now.getMinutes(),
            second: now.getSeconds()
        }));

        return handle;
    }

    function hasRememberedFolder() {
        return Boolean(readStoredFolder());
    }

    function getRelativeClientId(handle) {
        const parts = Array.isArray(handle.relativePath) ? handle.relativePath.filter(Boolean) : [];
        if (!parts.length) return '';
        const folderName = parts[parts.length - 1];
        const match = folderName.match(/^(Cliente\s*@\d+)/i);
        return match ? normalizeClientId(match[1].replace(/^Cliente\s*/i, '')) : '';
    }

    function getRelativeClientName(handle) {
        const parts = Array.isArray(handle.relativePath) ? handle.relativePath.filter(Boolean) : [];
        if (parts.length < 2) return '';
        const folderName = parts[parts.length - 2];
        return folderName.replace(/^Cliente\s*/i, '').replace(/\s*\(@\d+\)$/, '').trim();
    }

    async function getGrantedFolder() {
        if (!isSupported() || !hasRememberedFolder()) return null;
        try {
            const handle = await global.showDirectoryPicker({ id: 'pineapple-invoices', mode: 'readwrite' });
            const permission = await handle.requestPermission({ mode: 'readwrite' });
            if (permission !== 'granted') return null;
            return handle;
        } catch (error) {
            return null;
        }
    }

    async function ensureParentFolder(root) {
        const stored = readStoredFolder();
        if (!stored) return root;

        const pad = number => String(number).padStart(2, '0');
        const segments = [
            String(stored.year),
            `Mes ${pad(stored.month)}`,
            `Dia ${pad(stored.day)}`,
            `Hora ${pad(stored.hour)}-${pad(stored.minute)}-${pad(stored.second)}`
        ];

        let current = root;
        for (const segment of segments) {
            current = await current.getDirectoryHandle(segment, { create: true });
        }

        return current;
    }

    async function saveInClientFolder(root, client, fileName, contents) {
        const parent = await ensureParentFolder(root);
        const id = normalizeClientId(client?.id || '') || '@00';
        const name = sanitizeSegment(client?.name || 'Sin cliente', 'Sin cliente');
        const folderName = `Cliente @${id.replace(/^@/, '')} - ${name}`;

        const folder = await parent.getDirectoryHandle(folderName, { create: true });
        const fileHandle = await folder.getFileHandle(fileName, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(contents);
        await writable.close();

        return folderName;
    }

    async function ensurePermission() {
        const handle = readStoredFolder();
        if (!handle || typeof global.showDirectoryPicker !== 'function') return false;

        try {
            const directory = await global.showDirectoryPicker({ id: 'pineapple-invoices', mode: 'readwrite' });
            return (await directory.queryPermission({ mode: 'readwrite' })) === 'granted';
        } catch (error) {
            return false;
        }
    }

    global.pineappleStore = {
        CLIENTS_API,
        DOCS_API,
        normalizeText,
        normalizeClientId,
        sanitizeSegment,
        parseVal,
        formatMoney,
        formatDate,
        formatDateTime,
        fileStamp,
        makeId,
        isSupported,
        supportsFolderPicker,
        fetchWithTimeout,
        fetchJson,
        fetchJsonOrNull,
        readStoredFolder,
        hasRememberedFolder,
        pickFolder,
        getGrantedFolder,
        getStoredFolderHandle,
        requestFolderPermission,
        getRelativeClientId,
        getRelativeClientName,
        saveInClientFolder,
        ensurePermission
    };
})(window);
