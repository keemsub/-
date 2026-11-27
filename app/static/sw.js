// 뽀모도로 서비스 워커: 앱처럼 설치되고, 인터넷이 잠깐 끊겨도 첫 화면은 열리게 해요.
// 원칙: 항상 인터넷에서 먼저 받고(최신 유지), 실패할 때만 저장해 둔 것을 보여줘요.
const CACHE = "walkmodoro-v15";
const SHELL = [
  "/",
  "/static/style.css",
  "/static/avatar.js",
  "/static/sound.js",
  "/static/app.js",
  "/static/manifest.webmanifest",
  "/static/icons/icon-192.png",
  "/static/vendor/maplibre/maplibre-gl.js",
  "/static/vendor/maplibre/maplibre-gl.css",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  // 다른 사이트(지도 타일 등), 로그인, API, 저장 요청은 건드리지 않아요.
  if (event.request.method !== "GET" || url.origin !== location.origin) return;
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/auth/")) return;

  event.respondWith(
    fetch(event.request)
      .then((res) => {
        if (res.ok && (url.pathname === "/" || url.pathname.startsWith("/static/"))) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(url.pathname === "/" ? "/" : event.request, copy));
        }
        return res;
      })
      .catch(async () => {
        const cached = await caches.match(event.request, { ignoreSearch: true });
        if (cached) return cached;
        if (event.request.mode === "navigate") return caches.match("/");
        return Response.error();
      }),
  );
});
