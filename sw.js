/* GlobalPulse Service Worker — offline-first static shell */
const CACHE_NAME = 'globalpulse-v1';
const PRECACHE = [
    'index.html',
    'css/style.css',
    'css/leaflet-custom.css',
    'data/countries.json'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) =>
            Promise.allSettled(PRECACHE.map((url) => cache.add(url)))
        ).then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
        ).then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    const { request } = event;
    if (request.method !== 'GET') return;

    const url = new URL(request.url);

    // Never cache Supabase / API traffic — always live
    if (url.hostname.includes('supabase.co') ||
        url.hostname.includes('open-meteo.com') ||
        url.hostname.includes('er-api.com') ||
        url.hostname.includes('nominatim.openstreetmap.org')) {
        return;
    }

    // Static assets & same-origin: cache-first, refresh in background
    event.respondWith(
        caches.match(request).then((cached) => {
            const network = fetch(request).then((res) => {
                if (res.ok && (url.origin === location.origin || url.hostname.includes('cdn'))) {
                    const clone = res.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
                }
                return res;
            }).catch(() => cached);
            return cached || network;
        })
    );
});
