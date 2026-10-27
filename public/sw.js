// Service Worker Pac-Neon — cache les assets pour un démarrage offline
const CACHE_NAME = 'pac-neon-v2';
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
  // Forcer la prise de contrôle immédiate
  self.skipWaiting();
});

// Activate : nettoie les anciens caches ET prend le contrôle immédiatement
self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      // Supprimer tous les anciens caches
      caches.keys().then((keys) =>
        Promise.all(
          keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
        )
      ),
      // Prendre le contrôle de tous les clients immédiatement
      self.clients.claim(),
    ])
  );
});

// Fetch : stratégies selon le type de requête
self.addEventListener('fetch', (event) => {
  const req = event.request;

  // Ignorer les requêtes non-GET (POST, etc.)
  if (req.method !== 'GET') return;

  // Ignorer les requêtes cross-origin (Next.js dev HMR, etc.)
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Stratégie pour les navigations (HTML) : network-first STRICT
  // On veut toujours la dernière version si online, sinon fallback cache
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

  // Stratégie pour les assets statiques (chunks hashés _next/static/*)
  // Ces URLs sont uniques par build, donc cache-first est sûr
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(
      caches.match(req).then((cached) => {
        if (cached) return cached;
        return fetch(req).then((res) => {
          if (res && res.status === 200) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
          }
          return res;
        }).catch(() => cached);
      })
    );
    return;
  }

  // Autres assets (images, manifest, etc.) : stale-while-revalidate
  event.respondWith(
    caches.match(req).then((cached) => {
      const fetchPromise = fetch(req).then((res) => {
        if (res && res.status === 200) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
        }
        return res;
      }).catch(() => cached);
      return cached || fetchPromise;
    })
  );
});
