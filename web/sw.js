var CACHE_VERSION = 'inventory-scanner-v3';
var PRECACHE_URLS = [
  './',
  './index.html',
  './app.js',
  './app.min.js',
  './styles.css',
  './styles.min.css',
  './assets/wasm/zxing_reader.wasm',
  './assets/vendor/zxing-wasm-reader.js',
  './assets/vendor/barcode-detector-ponyfill.js',
  './assets/vendor/zbar-wasm-inlined.js',
  './assets/vendor/quagga.min.js',
  './assets/vendor/html5-qrcode.min.js',
  './assets/workers/zxing-worker.js',
  './assets/workers/zbar-worker.js'
];

function precacheResources(urls) {
  return caches.open(CACHE_VERSION)
    .then(function (cache) {
      return Promise.all(urls.map(function (url) {
        return fetch(url, { cache: 'no-cache' })
          .then(function (response) {
            if (!response || !response.ok) { return null; }
            return cache.put(url, response);
          })
          .catch(function () { return null; });
      }));
    });
}

self.addEventListener('install', function (event) {
  event.waitUntil(
    precacheResources(PRECACHE_URLS)
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys()
      .then(function (keys) {
        return Promise.all(keys.map(function (key) {
          if (key !== CACHE_VERSION) {
            return caches.delete(key);
          }
          return null;
        }));
      })
      .then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (event) {
  var request = event.request;
  if (!request || request.method !== 'GET') { return; }
  var url = new URL(request.url);
  if (url.origin !== self.location.origin) { return; }

  event.respondWith(
    caches.match(request)
      .then(function (cached) {
        if (cached) { return cached; }
        return fetch(request)
          .then(function (response) {
            if (!response || response.status !== 200) { return response; }
            var copy = response.clone();
            caches.open(CACHE_VERSION).then(function (cache) { cache.put(request, copy); });
            return response;
          })
          .catch(function () { return cached; });
      })
  );
});
