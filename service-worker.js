/* service-worker.js - simple cache-first worker */
const CACHE_NAME = 'pan-resizer-v1';
const FILES_TO_CACHE = [
  '/',
  '/index.html',
  '/assets/css/style.css',
  '/assets/js/app.js',
  '/assets/js/ui.js',
  '/assets/js/validator.js',
  '/assets/js/imageProcessor.js',
  '/assets/images/logo.svg',
  '/assets/images/upload-illustration.svg',
  '/manifest.json'
];
self.addEventListener('install', (evt)=>{ evt.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(FILES_TO_CACHE))); self.skipWaiting(); });
self.addEventListener('activate',(evt)=>evt.waitUntil(self.clients.claim()));
self.addEventListener('fetch',(evt)=>{ evt.respondWith(caches.match(evt.request).then(resp => resp || fetch(evt.request))); });
