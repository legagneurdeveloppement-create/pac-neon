// Service Worker Pac-Neon — cache les assets pour un démarrage offline
const CACHE_NAME = 'pac-neon-v1';
const ASSETS = [
  '/',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  '/favicon-32.png',
  '/favicon-16.png',
];

// Install : pré-cache les assets de base
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // On ignore les erreurs (assets optionnels)
      return Promise.allSettled(
        ASSETS.map((url) => cache.add(url).catch(() => {}))
      );
    })
  );
  self.skipWaiting();
});

// Activate : nettoie les anciens caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// Fetch : stratégie "stale-while-revalidate" pour les navigations,
// "cache-first" pour les assets statiques
self.addEventListener('fetch', (event) => {
  const req = event.request;

  // Ignorer les requêtes non-GET (POST, etc.)
  if (req.method !== 'GET') return;

  // Ignorer les requêtes cross-origin (Next.js dev HMR, etc.)
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Stratégie pour les navigations (HTML) : network-first avec fallback cache
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          // Mettre en cache la nouvelle version
          const clone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
          return res;
        })
        .catch(() => {
          // Offline : servir depuis le cache
          return caches.match(req).then((cached) => cached || caches.match('/'));
        })
    );
    return;
  }

  // Stratégie pour les assets statiques : cache-first
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        // Mettre en cache pour la prochaine fois
        if (res && res.status === 200) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
        }
        return res;
      }).catch(() => cached);
    })
  );
});
