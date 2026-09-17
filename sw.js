const CACHE_NAME = 'pineapple-app-v42';
const APP_FILES = [
    './',
    './index.html',
    './dashboard.css',
    './dashboard.js',
    './cotizaciones.html',
    './style.css',
    './manifest.webmanifest',
    './carpeta.html',
    './carpeta.css',
    './carpeta.js',
    './db.js',
    './storage.js'
];

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(APP_FILES))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys()
            .then(keys => Promise.all(
                keys
                    .filter(key => key !== CACHE_NAME)
                    .map(key => caches.delete(key))
            ))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', event => {
    if (event.request.method !== 'GET') return;

    if (new URL(event.request.url).origin !== self.location.origin) return;

    // El HTML de navegación se consulta primero en la red. Así una PWA no se
    // queda mostrando una versión vieja del Dashboard tras una actualización.
    if (event.request.mode === 'navigate') {
        event.respondWith(
            fetch(event.request)
                .then(response => {
                    if (response.ok) {
                        const copy = response.clone();
                        caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
                    }
                    return response;
                })
                .catch(() => caches.match(event.request))
        );
        return;
    }

    event.respondWith(
        caches.match(event.request).then(cachedResponse => {
            const networkResponse = fetch(event.request).then(response => {
                const responseToCache = response.clone();
                caches.open(CACHE_NAME).then(cache => cache.put(event.request, responseToCache));
                return response;
            });

            return cachedResponse || networkResponse.catch(() => caches.match(event.request));
        })
    );
});
