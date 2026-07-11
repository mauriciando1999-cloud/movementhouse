const CACHE_NAME = 'movement-house-v1';

// Archivos estáticos básicos que queremos guardar en la memoria del teléfono
const urlsToCache = [
  './',
  './index-user.html',
  './config.js',
  './app.js',
  './manifest.json'
];

// 1. Instalar el Service Worker y guardar archivos iniciales
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        return cache.addAll(urlsToCache);
      })
  );
  self.skipWaiting();
});

// 2. Limpiar cachés viejos si actualizas la app
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// 3. Estrategia: "Network First" (Intenta ir a internet, si falla usa caché)
self.addEventListener('fetch', event => {
  // Ignorar peticiones a Supabase (No queremos cachear la base de datos)
  if (event.request.url.includes('supabase.co')) {
    return;
  }

  event.respondWith(
    fetch(event.request).catch(() => {
      return caches.match(event.request);
    })
  );
});