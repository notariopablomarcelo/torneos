// @ts-nocheck
/// <reference lib="webworker" />
/* global __APP_VERSION__ */

// Service Worker propio. Workbox solo nos inyecta el manifest (debe encontrar
// el literal `self.__WB_MANIFEST` en el código fuente); el resto del SW lo
// manejamos a mano para tener control fino del caché y la estrategia de fetch.

const CACHE_NAME = `torneos-${__APP_VERSION__}`;
const MANIFEST = self.__WB_MANIFEST || [];

self.addEventListener('install', (event) => {
	self.skipWaiting();
	event.waitUntil(
		caches
			.open(CACHE_NAME)
			.then((cache) => cache.addAll(['/', '/index.html']).catch(() => {}))
	);
	// Precache del manifest completo en segundo plano (no bloquea install).
	caches.open(CACHE_NAME).then((cache) =>
		Promise.allSettled(MANIFEST.map((e) => cache.add(e.url)))
	);
});

self.addEventListener('message', (event) => {
	if (event.data && event.data.type === 'SKIP_WAITING') {
		self.skipWaiting();
	}
});

self.addEventListener('activate', (event) => {
	event.waitUntil(
		(async () => {
			const claves = await caches.keys();
			await Promise.all(
				claves
					.filter((k) => k !== CACHE_NAME && k.startsWith('torneos-'))
					.map((k) => caches.delete(k))
			);
			await self.clients.claim();
		})()
	);
});

self.addEventListener('fetch', (event) => {
	const req = event.request;
	if (req.method !== 'GET') return;

	const url = new URL(req.url);
	if (url.origin !== self.location.origin) return;

	// Assets inmutables: cache-first.
	if (url.pathname.startsWith('/_app/immutable/')) {
		event.respondWith(
			caches.match(req).then(
				(cached) =>
					cached ||
					fetch(req).then((res) => {
						if (res.ok) {
							const copia = res.clone();
							caches.open(CACHE_NAME).then((c) => c.put(req, copia));
						}
						return res;
					})
			)
		);
		return;
	}

	// Navegación / HTML: network-first con fallback al index del caché.
	if (req.mode === 'navigate' || req.headers.get('accept')?.includes('text/html')) {
		event.respondWith(
			fetch(req).catch(() =>
				caches.match('/index.html').then((c) => c || Response.error())
			)
		);
		return;
	}

	// Resto: network-first con fallback al caché.
	event.respondWith(
		fetch(req)
			.then((res) => {
				if (res.ok) {
					const copia = res.clone();
					caches.open(CACHE_NAME).then((c) => c.put(req, copia));
				}
				return res;
			})
			.catch(() => caches.match(req).then((c) => c || Response.error()))
	);
});
