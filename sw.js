// Travel PWA — Service Worker
// 캐시 버전을 올리면 모든 사용자가 새 번들을 받습니다.
const CACHE_VERSION = 'v7';
const STATIC_CACHE = `travel-static-${CACHE_VERSION}`;
const RUNTIME_CACHE = `travel-runtime-${CACHE_VERSION}`;

// 앱 셸 — 설치 시 미리 받아두는 정적 자원 (?v= 쿼리는 SW가 무시하도록 cacheFirst에서 처리)
const PRECACHE_URLS = [
  './',
  './index.html',
  './manifest.json',
  './js/seed.js?v=6',
  './js/db.js?v=6',
  './js/ai.js?v=6',
  './js/supabase-config.js?v=6',
  './js/cloud.js?v=6',
  './js/sync.js?v=6',
  './icons/icon.svg',
  './icons/icon-maskable.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon.png',
];

// Network First를 적용할 외부 API (실시간 데이터 + AI + 백엔드)
const NETWORK_FIRST_HOSTS = [
  'api.open-meteo.com',
  'api.frankfurter.app',
  'generativelanguage.googleapis.com',  // Gemini
  'api.anthropic.com',                   // Claude
  'api.openai.com',                      // OpenAI
  'ygusohacqkwzrwwlaefc.supabase.co',    // Supabase REST/Auth
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys
        .filter((k) => k !== STATIC_CACHE && k !== RUNTIME_CACHE)
        .map((k) => caches.delete(k))
    )).then(() => self.clients.claim())
  );
});

// 캐시에서 먼저, 없으면 네트워크, 받은 건 캐시에 저장
async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok && request.method === 'GET') {
      const cache = await caches.open(STATIC_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    // 오프라인이고 캐시도 없으면 — 네비게이션은 index.html로 fallback
    if (request.mode === 'navigate') {
      const fallback = await caches.match('./index.html');
      if (fallback) return fallback;
    }
    throw err;
  }
}

// 네트워크 먼저, 실패 시 캐시 fallback (날씨/환율 API용)
async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok && request.method === 'GET') {
      const cache = await caches.open(RUNTIME_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    const cached = await caches.match(request);
    if (cached) return cached;
    throw err;
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // 외부 API → Network First
  if (NETWORK_FIRST_HOSTS.includes(url.hostname)) {
    event.respondWith(networkFirst(request));
    return;
  }

  // 같은 출처(앱 자체) → Cache First
  if (url.origin === self.location.origin) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // 그 외(타사 폰트 등) → Cache First + 캐시 채워나가기
  event.respondWith(cacheFirst(request));
});

// 페이지에서 SW 즉시 갱신을 요청하면 받아준다
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
