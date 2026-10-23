// 離線快取：
// - 主畫面 index.html：有網路時先抓最新版（3 秒內沒回應就用快取），一打開就是新版
// - 其他檔案：先用快取（地下室沒訊號也能用），背景再更新
// - 安裝時逐檔快取，單一檔案失敗不會讓整個更新卡住
const CACHE = 'mep-inspect-v9';
const ASSETS = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png', './jspdf.umd.min.js', './html2canvas.min.js', './exceljs.min.js'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => Promise.all(ASSETS.map(a =>
    fetch(a, { cache: 'no-store' }).then(r => r.ok ? c.put(a, r) : null).catch(() => null)))));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

const isPage = req => req.mode === 'navigate' || /\/(index\.html)?$/.test(new URL(req.url).pathname);

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(caches.open(CACHE).then(async cache => {
    if (isPage(req)) {
      const net = fetch(req, { cache: 'no-store' }).then(res => { if (res && res.ok) cache.put('./index.html', res.clone()); return res; });
      const timeout = new Promise(r => setTimeout(r, 3000, null));
      const res = await Promise.race([net.catch(() => null), timeout]);
      if (res && res.ok) return res;
      e.waitUntil(net.catch(() => null));
      return (await cache.match('./index.html')) || (await net.catch(() => null)) ||
        new Response('離線中，請在有網路時開啟一次', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    }
    const hit = await cache.match(req, { ignoreSearch: true });
    const net = fetch(req).then(res => { if (res && res.ok) cache.put(req, res.clone()); return res; }).catch(() => null);
    if (hit) { e.waitUntil(net); return hit; }
    return (await net) || new Response('離線中', { status: 503 });
  }));
});
