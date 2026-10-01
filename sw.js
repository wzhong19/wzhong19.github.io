/* ============================================================
 * Service Worker：离线缓存（PWA）
 * 策略：
 *   - 同源静态资源：cache-first（命中缓存直接返回，未命中请求后回写）
 *   - 有道词典音频：stale-while-revalidate（听过一次就离线可用）
 *     注意：页面 <audio> 不设 crossOrigin，请求走 no-cors 模式，
 *     SW 里 fetch 返回的是 opaque 响应（status=0，res.ok 恒 false），
 *     必须按 res.type==="opaque" 判断后才可写入缓存，否则永远缓存不上。
 * ============================================================ */
const CACHE = "word-flashcards-v3";
const ASSETS = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icon.svg",
  "./icon-192.png",
  "./icon-512.png"
];

/* 安装：预缓存全部静态资源 */
self.addEventListener("install", e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

/* 激活：清理旧版本缓存（v1/v2 全部删除） */
self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/* 请求拦截 */
self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  const url = new URL(e.request.url);

  /* 有道音频：stale-while-revalidate（兼容 no-cors 的 opaque 响应） */
  if (url.hostname === "dict.youdao.com" && url.pathname === "/dictvoice") {
    e.respondWith(
      caches.match(e.request).then(cached => {
        const fetchPromise = fetch(e.request).then(res => {
          if (res && (res.ok || res.type === "opaque")) {
            const copy = res.clone();
            caches.open(CACHE).then(c => c.put(e.request, copy));
          }
          return res;
        }).catch(() => cached || new Response("", { status: 504 }));
        return cached || fetchPromise;
      })
    );
    return;
  }

  /* 同源：cache-first */
  if (url.origin === location.origin) {
    e.respondWith(
      caches.match(e.request, { ignoreSearch: true }).then(cached => {
        if (cached) return cached;
        return fetch(e.request).then(res => {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, copy));
          return res;
        }).catch(() => caches.match("./index.html"));
      })
    );
    return;
  }

  /* 其他第三方请求：网络优先，失败兜底 */
  e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
});