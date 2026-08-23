/* GlobalPulse Service Worker — v2
 * Strategy:
 *  - App shell (HTML/JS/CSS/JSON, same-origin): NETWORK-FIRST with cache
 *    fallback → users always get fresh code when online.
 *  - Third-party CDNs (fonts, Leaflet, Supabase lib): cache-first for speed.
 *  - Supabase/API traffic: never intercepted.
 */
const CACHE_NAME = 'globalpulse-v2';
const PRECACHE = [
    'index.html',
    'css/style.css',
    'css/leaflet-custom.css',
    'js/vendor/supabase.min.js',
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

    // Never intercept live data sources
    if (url.hostname.includes('supabase.co') ||
        url.hostname.includes('open-meteo.com') ||
        url.hostname.includes('er-api.com') ||
        url.hostname.includes('nominatim.openstreetmap.org') ||
        url.hostname.includes('restcountries.com')) {
        return;
    }

    const isSameOrigin = url.origin === location.origin;
    const isAppShell = isSameOrigin &&
        (request.mode === 'navigate' ||
            /\.(js|mjs|css|json|html)$/i.test(url.pathname));

    if (isAppShell) {
        // NETWORK-FIRST: fresh code wins; cache only serves offline fallback
        event.respondWith(
            fetch(request)
                .then((res) => {
                    const clone = res.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
                    return res;
                })
                .catch(() =>
                    caches.match(request).then((cached) =>
                        cached || (request.mode === 'navigate' ? caches.match('index.html') : undefined)
                    )
                )
        );
        return;
    }

    // Everything else (CDN libs, fonts, images): cache-first, refresh in background
    event.respondWith(
        caches.match(request).then((cached) => {
            const network = fetch(request).then((res) => {
                if (res.ok) {
                    const clone = res.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
                }
                return res;
            }).catch(() => cached);
            return cached || network;
        })
    );
});
