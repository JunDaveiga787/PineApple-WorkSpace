/* PineApple Work Center — almacén local de documentos y clientes (IndexedDB) */
(function (global) {
    const DB_NAME = 'pineappleWorkCenter';
    const DB_VERSION = 1;

    let dbPromise = null;

    function openDatabase() {
        if (dbPromise) return dbPromise;

        dbPromise = new Promise((resolve, reject) => {
            if (!('indexedDB' in global)) {
                reject(new Error('Este navegador no soporta IndexedDB'));
                return;
            }

            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onupgradeneeded = event => {
                const db = event.target.result;

                if (!db.objectStoreNames.contains('clients')) {
                    const clients = db.createObjectStore('clients', { keyPath: 'id' });
                    clients.createIndex('nameKey', 'nameKey', { unique: false });
                }

                if (!db.objectStoreNames.contains('documents')) {
                    const documents = db.createObjectStore('documents', { keyPath: 'id' });
                    documents.createIndex('clientId', 'clientId', { unique: false });
                    documents.createIndex('updatedAt', 'updatedAt', { unique: false });
                }

                if (!db.objectStoreNames.contains('files')) {
                    db.createObjectStore('files', { keyPath: 'id' });
                }
            };

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });

        return dbPromise;
    }

    async function withStore(storeName, mode, runner) {
        const db = await openDatabase();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(storeName, mode);
            const store = transaction.objectStore(storeName);
            let result;

            transaction.oncomplete = () => resolve(result);
            transaction.onerror = () => reject(transaction.error);
            transaction.onabort = () => reject(transaction.error);

            try {
                result = runner(store);
            } catch (error) {
                reject(error);
            }
        });
    }

    function promisify(request) {
        return new Promise((resolve, reject) => {
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async function getAll(storeName) {
        const db = await openDatabase();
        return promisify(db.transaction(storeName, 'readonly').objectStore(storeName).getAll());
    }

    async function get(storeName, key) {
        const db = await openDatabase();
        return promisify(db.transaction(storeName, 'readonly').objectStore(storeName).get(key));
    }

    async function put(storeName, value) {
        await withStore(storeName, 'readwrite', store => store.put(value));
        return value;
    }

    async function putMany(storeName, values) {
        if (!values.length) return;
        await withStore(storeName, 'readwrite', store => values.forEach(value => store.put(value)));
    }

    async function remove(storeName, key) {
        await withStore(storeName, 'readwrite', store => store.delete(key));
    }

    async function clear(storeName) {
        await withStore(storeName, 'readwrite', store => store.clear());
    }

    global.pineappleDB = {
        getAll,
        get,
        put,
        putMany,
        remove,
        clear
    };
})(window);
