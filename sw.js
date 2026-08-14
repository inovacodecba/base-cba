// Service worker do Base de Dados (ex-"Inventário CBA").
//
// Histórico: em 06/08/2026 descobrimos que o app ficava preso numa versão
// antiga mesmo após deploys corretos, porque (1) o cache estático nunca era
// invalidado (nome de CACHE fixo) e (2) a checagem "network-first" da
// navegação podia ser satisfeita pelo cache HTTP do próprio navegador em vez
// de ir à rede de verdade. Este arquivo corrige os dois pontos:
//   - CACHE tem um número de versão: sempre que este arquivo mudar, o
//     navegador detecta o novo Service Worker, ativa e apaga o cache antigo
//     automaticamente (sem precisar o usuário limpar nada na mão).
//   - fetch(..., { cache: "no-store" }) na navegação garante que o HTML
//     (que referencia o JS com hash da build) sempre venha da rede quando
//     há conexão — nunca de um cache HTTP desatualizado.
const CACHE = "base-de-dados-v1";
const CORE_ASSETS = ["/base-de-dados/", "/base-de-dados/index.html", "/base-de-dados/manifest.webmanifest"];

self.addEventListener("install", (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE_ASSETS)).catch(() => {}));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Network-first (sem cache HTTP) para navegação & Supabase; cache-first só
// para assets estáticos com nome versionado pelo Vite (index-XXXXXXXX.js),
// que são seguros porque o nome muda a cada build.
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (url.origin.includes("supabase.co") || e.request.mode === "navigate") {
    e.respondWith(
      fetch(e.request, { cache: "no-store" })
        .then((res) => {
          if (e.request.mode === "navigate") {
            const resClone = res.clone();
            caches.open(CACHE).then((c) => c.put(e.request, resClone));
          }
          return res;
        })
        .catch(() => caches.match(e.request))
    );
    return;
  }
  e.respondWith(
    caches.match(e.request).then((cached) => cached || fetch(e.request).then((res) => {
      const resClone = res.clone();
      caches.open(CACHE).then((c) => c.put(e.request, resClone));
      return res;
    }).catch(() => cached))
  );
});
