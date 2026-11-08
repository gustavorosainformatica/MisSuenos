// Service Worker - Mis Sueños ERP PWA
// v30: Elimina cache agressivo de HTML e força Network-Only para navegação local,
// garantindo que qualquer alteração apareça imediatamente sem necessidade de Control + F5.
// v31: Expurgar cache agressivo, alinhar controles de janelas flutuantes e destravar redimensionamento
const CACHE_NAME = 'missuenos-pwa-v54';
const STATIC_ASSETS = [
  '/manifest.json',
  '/favicon.ico',
  '/icon-192.png',
  '/icon-512.png',
  '/logo.png'
];

// Instalação do Service Worker: ativa imediatamente e baixa apenas ícones estáticos
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch((err) => {
        console.warn('[PWA SW] Aviso ao pré-carregar ícones:', err);
      });
    })
  );
});

// Ativação: expurga imediatamente TODOS os caches antigos e recarrega janelas ativas
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          console.log('[PWA SW] Removendo cache obsoleto:', key);
          return caches.delete(key);
        })
      );
    }).then(() => {
      // Notifica e recarrega todas as janelas abertas do ERP
      return self.clients.matchAll({ type: 'window' }).then((clients) => {
        for (const client of clients) {
          try {
            client.navigate(client.url);
          } catch (e) {
            console.warn('[PWA SW] Falha ao recarregar cliente:', e);
          }
        }
      });
    })
  );
  self.clients.claim();
});

// Estratégia de requisições:
// 1. APIs (/api/*): 100% REDE SEMPRE
// 2. Páginas HTML e scripts (.js, .html, /): 100% REDE DIRETA (Network-First com fallback apenas se offline)
//    Nunca guarda index.html em cache persistente local para eliminar o problema de Ctrl+F5.
// 3. Imagens e ícones: Cache com revalidação
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  if (event.request.method !== 'GET') {
    return;
  }

  // 1. APIs do sistema nunca passam por cache
  if (url.pathname.startsWith('/api/')) {
    return event.respondWith(fetch(event.request));
  }

  // 2. Navegação, páginas HTML e scripts de configuração:
  // SEMPRE REDE DIRETA. Se offline, tenta o cache de emergência.
  const isNavegacaoOuHtml = event.request.mode === 'navigate' || url.pathname === '/' || url.pathname.endsWith('.html');
  const isScriptOuConfig = url.pathname.endsWith('.js') || url.pathname.endsWith('.json');

  if (isNavegacaoOuHtml || isScriptOuConfig) {
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          return networkResponse;
        })
        .catch(() => {
          return caches.match(event.request).then((cachedResponse) => {
            if (cachedResponse) return cachedResponse;
            if (isNavegacaoOuHtml) {
              return caches.match('/index.html') || caches.match('/');
            }
            return null;
          });
        })
    );
    return;
  }

  // 3. Imagens e ícones estáticos: cache rápido
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      return cachedResponse || fetch(event.request);
    })
  );
});
