// Service worker: deja la app disponible sin señal.
// - La página y sus archivos: primero la red (para recibir cambios) y, si no hay o tarda, la copia guardada.
// - Librerías, tipografías y mosaicos del mapa: primero la copia guardada.
// - Supabase y /api nunca se guardan: los datos del grupo los conserva la propia página.
const VERSION = 'merida-v3';
const TILES = 'merida-mapa';
const SHELL = [
  '/', '/assets/styles.css', '/assets/config.js', '/assets/app.js', '/assets/grupo.js', '/assets/avisos.js',
  '/assets/docs.js', '/assets/cuentas.js', '/assets/hoy.js', '/assets/tabbar.js', '/assets/mapa.js', '/favicon.svg',
  '/manifest.webmanifest', '/icons/icon-192.png',
];
const STATIC_HOSTS = ['cdn.jsdelivr.net', 'cdnjs.cloudflare.com', 'fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(VERSION)
      .then((cache) => Promise.allSettled(SHELL.map((url) => cache.add(url))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION && k !== TILES).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

const save = (cacheName, request, response) => {
  if (response && (response.ok || response.type === 'opaque')) {
    caches.open(cacheName).then((cache) => cache.put(request, response.clone())).catch(() => {});
  }
  return response;
};

const cacheFirst = (cacheName, request) =>
  caches.match(request).then((hit) => hit || fetch(request).then((res) => save(cacheName, request, res)));

// Red primero, con 4 s de paciencia antes de usar la copia guardada.
const networkFirst = (request, fallbackUrl) => {
  const cached = caches.match(request).then((hit) => hit || (fallbackUrl ? caches.match(fallbackUrl) : undefined));
  const network = fetch(request).then((res) => save(VERSION, request, res));
  const patience = new Promise((resolve) => setTimeout(resolve, 4000)).then(() => cached);
  return Promise.race([network.catch(() => cached), patience.then((hit) => hit || network)])
    .then((res) => res || cached)
    .then((res) => res || Response.error());
};

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.hostname.endsWith('supabase.co') || url.pathname.startsWith('/api/')) return;
  if (url.hostname === 'tile.openstreetmap.org') return event.respondWith(cacheFirst(TILES, request));
  if (STATIC_HOSTS.includes(url.hostname)) return event.respondWith(cacheFirst(VERSION, request));
  if (url.origin !== self.location.origin) return;
  event.respondWith(networkFirst(request, request.mode === 'navigate' ? '/' : undefined));
});
