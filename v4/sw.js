/**
 * sw.js — Service Worker
 * DaniDoces PWA — Cache offline total
 */

const CACHE_NAME = 'danidoces-v1';

const ARQUIVOS_CACHE = [
  '/',
  '/index.html',
  '/css/style.css',
  '/js/db.js',
  '/js/ui.js',
  '/js/sync.js',
  '/manifest.json',
  'https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800;900&family=Pacifico&display=swap'
];

// ─── Install: pré-cache dos arquivos estáticos ────────────────────────────────
self.addEventListener('install', (event) => {
  console.log('[SW] Instalando...');
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ARQUIVOS_CACHE).catch((err) => {
        console.warn('[SW] Falha ao cachear alguns arquivos:', err);
      });
    }).then(() => {
      return self.skipWaiting();
    })
  );
});

// ─── Activate: limpa caches antigas ──────────────────────────────────────────
self.addEventListener('activate', (event) => {
  console.log('[SW] Ativando...');
  event.waitUntil(
    caches.keys().then((chaves) => {
      return Promise.all(
        chaves
          .filter((chave) => chave !== CACHE_NAME)
          .map((chave) => {
            console.log('[SW] Removendo cache antigo:', chave);
            return caches.delete(chave);
          })
      );
    }).then(() => {
      return self.clients.claim();
    })
  );
});

// ─── Fetch: estratégia Cache First, fallback para rede ───────────────────────
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Requisições para o GAS (API) — sempre tenta rede, nunca cacheia
  if (url.hostname.includes('script.google.com')) {
    event.respondWith(
      fetch(event.request).catch(() => {
        return new Response(
          JSON.stringify({ erro: 'Sem conexão com a internet' }),
          { headers: { 'Content-Type': 'application/json' } }
        );
      })
    );
    return;
  }

  // Arquivos estáticos do app — Cache First
  event.respondWith(
    caches.match(event.request).then((resposta) => {
      if (resposta) {
        // Encontrado no cache — retorna e atualiza em background
        const fetchAtualizado = fetch(event.request).then((respostaRede) => {
          if (respostaRede && respostaRede.status === 200) {
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, respostaRede.clone());
            });
          }
          return respostaRede;
        }).catch(() => {});

        return resposta;
      }

      // Não está no cache — tenta rede
      return fetch(event.request).then((respostaRede) => {
        if (!respostaRede || respostaRede.status !== 200 || respostaRede.type === 'opaque') {
          return respostaRede;
        }

        const respostaClone = respostaRede.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, respostaClone);
        });

        return respostaRede;
      }).catch(() => {
        // Fallback offline: retorna index.html para navegação
        if (event.request.mode === 'navigate') {
          return caches.match('/index.html');
        }
        return new Response('Offline', { status: 503 });
      });
    })
  );
});

// ─── Background Sync (quando suportado) ──────────────────────────────────────
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-dados') {
    console.log('[SW] Background sync iniciado');
    // Notifica os clientes para fazer sync
    event.waitUntil(
      self.clients.matchAll().then((clients) => {
        clients.forEach((client) => {
          client.postMessage({ tipo: 'BACKGROUND_SYNC' });
        });
      })
    );
  }
});

// ─── Mensagens do app ─────────────────────────────────────────────────────────
self.addEventListener('message', (event) => {
  if (event.data && event.data.tipo === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
