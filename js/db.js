// IndexedDB 래퍼 — 여행·여행상태·설정 저장
// API: window.TripDB.{init, trips, state, settings}
(function () {
  const DB_NAME = 'travel-app';
  const DB_VERSION = 1;
  let _dbPromise = null;

  function open() {
    if (_dbPromise) return _dbPromise;
    _dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('trips')) {
          db.createObjectStore('trips', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('tripState')) {
          // tripState: { tripId, checked: {}, memos: {}, expenses: {} }
          db.createObjectStore('tripState', { keyPath: 'tripId' });
        }
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings', { keyPath: 'key' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return _dbPromise;
  }

  function tx(store, mode = 'readonly') {
    return open().then((db) => db.transaction(store, mode).objectStore(store));
  }

  function reqToPromise(req) {
    return new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  // ── Trips ───────────────────────────────────────
  const trips = {
    async all() {
      const store = await tx('trips');
      const list = await reqToPromise(store.getAll());
      // 시작일 순 정렬
      return list.sort((a, b) => (a.startDate || '').localeCompare(b.startDate || ''));
    },
    async get(id) {
      const store = await tx('trips');
      return reqToPromise(store.get(id));
    },
    async put(trip) {
      trip.updatedAt = Date.now();
      const store = await tx('trips', 'readwrite');
      await reqToPromise(store.put(trip));
      return trip;
    },
    async remove(id) {
      const store = await tx('trips', 'readwrite');
      await reqToPromise(store.delete(id));
      // 같이 상태도 삭제
      const stateStore = await tx('tripState', 'readwrite');
      await reqToPromise(stateStore.delete(id));
    },
  };

  // ── Trip state (체크·메모·지출) ──────────────────
  const state = {
    async get(tripId) {
      const store = await tx('tripState');
      const s = await reqToPromise(store.get(tripId));
      return s || { tripId, checked: {}, memos: {}, expenses: {} };
    },
    async put(s) {
      const store = await tx('tripState', 'readwrite');
      await reqToPromise(store.put(s));
      return s;
    },
    async patch(tripId, partial) {
      const cur = await state.get(tripId);
      const merged = { ...cur, ...partial, tripId };
      return state.put(merged);
    },
  };

  // ── Settings (단일 키-값 저장소) ────────────────
  // settings 예: { key: 'aiProvider', value: 'gemini' }
  // API 키는 'apiKey.gemini' 같은 키로 저장
  const settings = {
    async get(key, fallback = null) {
      const store = await tx('settings');
      const row = await reqToPromise(store.get(key));
      return row ? row.value : fallback;
    },
    async set(key, value) {
      const store = await tx('settings', 'readwrite');
      await reqToPromise(store.put({ key, value }));
      return value;
    },
    async all() {
      const store = await tx('settings');
      const rows = await reqToPromise(store.getAll());
      return rows.reduce((acc, r) => { acc[r.key] = r.value; return acc; }, {});
    },
  };

  // ── 초기 시드 ──────────────────────────────────
  // 첫 실행 시 도쿄 데이터를 한 번만 넣음. 사용자가 지우면 다시 안 넣음.
  async function seedIfFirstRun() {
    const seeded = await settings.get('seeded.v1', false);
    if (seeded) return false;
    if (window.TOKYO_SEED) {
      await trips.put({ ...window.TOKYO_SEED });
    }
    await settings.set('seeded.v1', true);
    return true;
  }

  async function init() {
    await open();
    await seedIfFirstRun();
  }

  window.TripDB = { init, open, trips, state, settings };
})();
