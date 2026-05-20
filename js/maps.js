// js/maps.js — Google Maps JS API 동적 로더 + 지오코딩 + 트립 지도 렌더
//
// 사용자가 설정에서 API 키를 등록하면:
//   - 트립 메뉴 "전체 지도 보기" → 모든 places 마커 표시 (Day별 색)
//   - 새 item 추가 시 지오코딩 가능
//
// 보안: API 키는 IndexedDB(settings)에만 저장. Supabase에 보내지 않음.
// 권장: GCP Cloud Console에서 HTTP 리퍼러 제한 + 할당량 설정.
(function () {
  let _loaderPromise = null;
  let _loadedKey = null;
  const _geocodeCache = new Map(); // query → {lat, lon, formatted}

  function loadGoogleMaps(apiKey) {
    if (!apiKey) return Promise.reject(new Error('API 키가 필요합니다'));
    if (window.google?.maps && _loadedKey === apiKey) {
      return Promise.resolve(window.google.maps);
    }
    if (_loaderPromise && _loadedKey === apiKey) return _loaderPromise;

    _loadedKey = apiKey;
    _loaderPromise = new Promise((resolve, reject) => {
      const cbName = '__gmaps_cb_' + Date.now();
      window[cbName] = () => {
        delete window[cbName];
        resolve(window.google.maps);
      };
      const script = document.createElement('script');
      script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&libraries=places&callback=${cbName}&language=ko&region=KR&loading=async`;
      script.async = true;
      script.defer = true;
      script.onerror = () => reject(new Error('구글맵 스크립트 로드 실패'));
      document.head.appendChild(script);
    });
    return _loaderPromise;
  }

  async function getApiKey() {
    if (!window.TripDB) return null;
    // 1순위: 사용자 개인 키 / 2순위: 운영자 중앙 키 (Supabase app_config)
    const personal = await TripDB.settings.get('googleMapsApiKey', null);
    if (personal) return personal;
    if (window.Cloud?.enabled && window.Cloud.appConfig) {
      try { return await Cloud.appConfig.get('apiKey.googleMaps'); } catch { return null; }
    }
    return null;
  }

  // 지오코딩 — 장소명 → 좌표
  // 캐싱: 메모리 + IndexedDB settings
  async function geocode(query) {
    if (!query) return null;
    const cacheKey = 'geo:' + query.toLowerCase().trim();
    if (_geocodeCache.has(cacheKey)) return _geocodeCache.get(cacheKey);

    // IDB 캐시 확인
    const idbCached = await TripDB.settings.get(cacheKey);
    if (idbCached) {
      _geocodeCache.set(cacheKey, idbCached);
      return idbCached;
    }

    const apiKey = await getApiKey();
    if (!apiKey) throw new Error('API 키가 없습니다');
    await loadGoogleMaps(apiKey);

    const geocoder = new google.maps.Geocoder();
    return new Promise((resolve, reject) => {
      geocoder.geocode({ address: query }, async (results, status) => {
        if (status === 'OK' && results[0]) {
          const loc = results[0].geometry.location;
          const out = {
            lat: loc.lat(),
            lon: loc.lng(),
            formatted: results[0].formatted_address,
          };
          _geocodeCache.set(cacheKey, out);
          await TripDB.settings.set(cacheKey, out);
          resolve(out);
        } else if (status === 'REQUEST_DENIED' || status === 'OVER_QUERY_LIMIT' || status === 'INVALID_REQUEST') {
          // API 미활성화·빌링·할당량 등 — 에러로 throw해서 호출자가 알리게
          const err = new Error('Geocoding ' + status);
          err.gmapsStatus = status;
          reject(err);
        } else {
          // ZERO_RESULTS 등 — null 캐싱하지 않음 (사용자가 텍스트 수정 시 재시도 가능)
          resolve(null);
        }
      });
    });
  }

  // 좌표 있는 마커만 수집 (지오코딩 없이)
  function collectMarkers(trip) {
    const markers = [];
    for (const day of (trip.days || [])) {
      for (const item of (day.items || [])) {
        if (typeof item.lat === 'number' && typeof item.lon === 'number') {
          markers.push({
            lat: item.lat, lon: item.lon,
            title: item.title, day: day.day,
            color: day.color || '#4fc3f7',
            icon: item.icon || '📍', sub: item.sub || '', time: item.time || '',
          });
        }
      }
    }
    return markers;
  }

  // Leaflet 폴백 — Maps 키 없거나 비빌링 상황. lat/lon이 이미 있는 항목만 표시.
  function renderTripMapLeaflet(container, trip) {
    if (!window.L) {
      container.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:100%;padding:24px;text-align:center;color:rgba(255,255,255,0.6)">Leaflet 라이브러리 로드 실패. 페이지 새로고침.</div>`;
      return { markerCount: 0, engine: 'leaflet' };
    }
    const markers = collectMarkers(trip);
    if (markers.length === 0) {
      container.innerHTML = `
        <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;padding:24px;text-align:center;color:rgba(255,255,255,0.6);gap:8px">
          <div style="font-size:36px">🗺️</div>
          <div style="font-size:13px">지도에 표시할 좌표가 없어요.<br>구글맵 API 키를 설정하면 자동 지오코딩 가능, 또는 일정을 다시 AI로 생성하면 좌표가 함께 들어옵니다.</div>
        </div>`;
      return { markerCount: 0, engine: 'leaflet' };
    }

    // 기존 Leaflet 인스턴스 정리 (재렌더 대응)
    if (container._lmap) { try { container._lmap.remove(); } catch {} container._lmap = null; }
    container.innerHTML = '';
    container.style.background = '#fff'; // OSM 타일은 밝은 배경에서 잘 보임

    const center = [markers[0].lat, markers[0].lon];
    const map = L.map(container, { zoomControl: true, attributionControl: true }).setView(center, 12);
    container._lmap = map;
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19, attribution: '© OpenStreetMap',
    }).addTo(map);

    // Day별 폴리라인
    const byDay = new Map();
    markers.forEach(m => {
      if (!byDay.has(m.day)) byDay.set(m.day, []);
      byDay.get(m.day).push(m);
    });
    for (const [day, list] of byDay) {
      const color = list[0].color;
      if (list.length >= 2) {
        L.polyline(list.map(m => [m.lat, m.lon]), {
          color, weight: 3, opacity: 0.6,
        }).addTo(map);
      }
    }

    // 마커 (color circle marker + popup)
    markers.forEach(m => {
      const cm = L.circleMarker([m.lat, m.lon], {
        radius: 9, fillColor: m.color, color: 'white', weight: 2, fillOpacity: 1,
      }).addTo(map);
      cm.bindPopup(`
        <div style="font-family:sans-serif;max-width:200px;color:#222">
          <div style="font-size:11px;color:#888;margin-bottom:2px">Day ${m.day} · ${m.time}</div>
          <div style="font-weight:700;font-size:13px">${m.icon} ${m.title}</div>
          ${m.sub ? `<div style="font-size:11px;color:#666;margin-top:2px">${m.sub}</div>` : ''}
        </div>
      `);
    });

    const bounds = L.latLngBounds(markers.map(m => [m.lat, m.lon]));
    map.fitBounds(bounds, { padding: [30, 30] });

    return { markerCount: markers.length, engine: 'leaflet' };
  }

  // 트립 전체 지도 렌더 — 키 있으면 Google, 없으면 Leaflet 폴백
  async function renderTripMap(container, trip, opts = {}) {
    const apiKey = await getApiKey();
    if (!apiKey) {
      // 키 없으면 Leaflet으로 (좌표 있는 항목만)
      return renderTripMapLeaflet(container, trip);
    }
    try {
      await loadGoogleMaps(apiKey);
    } catch (e) {
      // 스크립트 로드 실패 → Leaflet 폴백
      return renderTripMapLeaflet(container, trip);
    }

    container.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:rgba(255,255,255,0.5)">지도 로딩 중...</div>';

    // 1) 모든 마커 좌표 수집 (캐시 우선, 없으면 지오코딩)
    const markers = [];
    let geocodedNow = 0;
    let apiError = null;
    for (const day of (trip.days || [])) {
      for (const item of (day.items || [])) {
        let lat = item.lat, lon = item.lon;
        if (typeof lat !== 'number' || typeof lon !== 'number') {
          if (item.map) {
            try {
              const result = await geocode(item.map);
              if (result) {
                lat = result.lat; lon = result.lon;
                geocodedNow++;
                if (geocodedNow > 10) await new Promise(r => setTimeout(r, 50));
              }
            } catch (e) {
              apiError = e;
              break; // API 자체 문제면 더 시도 안 함
            }
          }
        }
        if (typeof lat === 'number' && typeof lon === 'number') {
          markers.push({
            lat, lon, title: item.title, day: day.day,
            color: day.color || '#4fc3f7',
            icon: item.icon || '📍', sub: item.sub || '', time: item.time || '',
          });
        }
      }
      if (apiError) break;
    }

    if (apiError) {
      const isDenied = apiError.gmapsStatus === 'REQUEST_DENIED';
      container.innerHTML = `
        <div style="display:flex;flex-direction:column;justify-content:center;align-items:center;height:100%;padding:24px;text-align:center;color:rgba(255,255,255,0.7);font-size:13px;line-height:1.7">
          <div style="font-size:36px;margin-bottom:12px">⚙️</div>
          <div style="font-weight:700;font-size:14px;margin-bottom:8px">${isDenied ? 'API가 활성화되지 않음' : '구글맵 오류'}</div>
          ${isDenied ? `
            <div style="margin-bottom:12px">GCP 프로젝트에 다음 API들을 켜야 합니다:</div>
            <ul style="text-align:left;font-size:12px;color:rgba(255,255,255,0.6);line-height:1.9;list-style:none;padding:0;margin:0 0 12px">
              <li>✓ <b>Maps JavaScript API</b></li>
              <li>✓ <b>Geocoding API</b></li>
              <li>✓ Billing 계정 연결</li>
            </ul>
            <a href="https://console.cloud.google.com/apis/library?filter=category:maps" target="_blank" style="color:#4fc3f7;font-size:12px;text-decoration:none">→ GCP API 라이브러리 열기</a>
          ` : `<div style="font-size:11px;color:rgba(255,255,255,0.5)">${apiError.message}</div>`}
        </div>`;
      return { markerCount: 0, error: apiError.message };
    }

    if (markers.length === 0) {
      container.innerHTML = `
        <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;padding:24px;text-align:center;color:rgba(255,255,255,0.6);gap:8px">
          <div style="font-size:36px">🗺️</div>
          <div style="font-size:13px">지도에 표시할 장소가 없어요.<br>일정에 <b>구글맵 검색어(map)</b>가 있어야 마커로 보입니다.</div>
        </div>`;
      return { markerCount: 0 };
    }

    // 2) 지도 생성 + 마커 표시
    container.innerHTML = '';
    const bounds = new google.maps.LatLngBounds();
    markers.forEach(m => bounds.extend({ lat: m.lat, lng: m.lon }));
    const map = new google.maps.Map(container, {
      center: bounds.getCenter(),
      zoom: 12,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: true,
      gestureHandling: 'greedy',
    });
    map.fitBounds(bounds, { top: 40, bottom: 40, left: 20, right: 20 });

    const info = new google.maps.InfoWindow();
    markers.forEach((m, idx) => {
      const pin = new google.maps.Marker({
        position: { lat: m.lat, lng: m.lon },
        map,
        title: m.title,
        label: { text: String(m.day), color: 'white', fontSize: '11px', fontWeight: '700' },
        icon: {
          path: 'M -1, 0 a 1,1 0 1,0 2,0 a 1,1 0 1,0 -2,0',
          fillColor: m.color,
          fillOpacity: 1,
          strokeColor: 'white',
          strokeWeight: 2,
          scale: 12,
        },
      });
      pin.addListener('click', () => {
        info.setContent(`
          <div style="color:#222;font-family:sans-serif;max-width:200px">
            <div style="font-size:11px;color:#888;margin-bottom:2px">Day ${m.day} · ${m.time}</div>
            <div style="font-weight:700;font-size:13px">${m.icon} ${m.title}</div>
            ${m.sub ? `<div style="font-size:11px;color:#666;margin-top:2px">${m.sub}</div>` : ''}
          </div>
        `);
        info.open(map, pin);
      });
    });

    // Day별 폴리라인 (동선 시각화)
    const byDay = new Map();
    markers.forEach(m => {
      if (!byDay.has(m.day)) byDay.set(m.day, []);
      byDay.get(m.day).push(m);
    });
    for (const [day, list] of byDay) {
      if (list.length < 2) continue;
      new google.maps.Polyline({
        path: list.map(m => ({ lat: m.lat, lng: m.lon })),
        geodesic: true,
        strokeColor: list[0].color,
        strokeWeight: 3,
        strokeOpacity: 0.65,
        map,
      });
    }

    return { markerCount: markers.length, geocodedNow, engine: 'google' };
  }

  // ── Day별 미니맵 (Leaflet, 작은 인라인) ────────────
  // 사용자가 지정한 dayObj의 items만 핀 + 그날 폴리라인.
  function renderDayMiniMap(container, dayObj) {
    if (!window.L) return false;
    const items = (dayObj.items || []).filter(it => typeof it.lat === 'number' && typeof it.lon === 'number');
    if (items.length === 0) return false;

    // 기존 인스턴스 정리
    if (container._lmap) { container._lmap.remove(); container._lmap = null; }
    container.innerHTML = '';
    container.style.background = '#fff';

    const map = L.map(container, {
      zoomControl: false, attributionControl: false, dragging: true, scrollWheelZoom: false,
      doubleClickZoom: false, touchZoom: true, keyboard: false,
    });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18 }).addTo(map);

    const color = dayObj.color || '#4fc3f7';
    items.forEach((it, i) => {
      L.circleMarker([it.lat, it.lon], {
        radius: 7, fillColor: color, color: 'white', weight: 2, fillOpacity: 1,
      }).addTo(map).bindTooltip(`${i+1}. ${it.title}`, { direction: 'top' });
    });
    if (items.length >= 2) {
      L.polyline(items.map(it => [it.lat, it.lon]), { color, weight: 3, opacity: 0.7 }).addTo(map);
    }
    map.fitBounds(L.latLngBounds(items.map(it => [it.lat, it.lon])), { padding: [20, 20] });

    container._lmap = map;
    // 컨테이너 사이즈 변경 시 invalidate (탭 전환 등)
    setTimeout(() => map.invalidateSize(), 100);
    return true;
  }

  // ── 오프라인 OSM 타일 사전 캐싱 ────────────────────
  // bbox×zoom 범위의 타일 URL들을 fetch → SW가 자동 캐싱.
  // 진행상황은 onProgress(done, total) 콜백으로.
  async function prefetchOfflineTiles(trip, opts = {}) {
    const items = (trip.days || []).flatMap(d => d.items || [])
      .filter(it => typeof it.lat === 'number' && typeof it.lon === 'number');
    if (items.length === 0) throw new Error('좌표 있는 일정이 없습니다');

    const minLat = Math.min(...items.map(it => it.lat));
    const maxLat = Math.max(...items.map(it => it.lat));
    const minLon = Math.min(...items.map(it => it.lon));
    const maxLon = Math.max(...items.map(it => it.lon));
    const zooms = opts.zooms || [10, 11, 12, 13];
    const onProgress = opts.onProgress || (() => {});

    // 위경도 → 타일 좌표
    function deg2tile(lat, lon, z) {
      const n = 2 ** z;
      const x = Math.floor((lon + 180) / 360 * n);
      const lat_rad = lat * Math.PI / 180;
      const y = Math.floor((1 - Math.log(Math.tan(lat_rad) + 1 / Math.cos(lat_rad)) / Math.PI) / 2 * n);
      return { x, y };
    }

    const urls = [];
    for (const z of zooms) {
      const a = deg2tile(maxLat, minLon, z);
      const b = deg2tile(minLat, maxLon, z);
      const x0 = Math.min(a.x, b.x), x1 = Math.max(a.x, b.x);
      const y0 = Math.min(a.y, b.y), y1 = Math.max(a.y, b.y);
      for (let x = x0; x <= x1; x++) {
        for (let y = y0; y <= y1; y++) {
          // OSM 부하 분산: a/b/c 서브도메인 순환
          const sub = 'abc'[(x + y) % 3];
          urls.push(`https://${sub}.tile.openstreetmap.org/${z}/${x}/${y}.png`);
        }
      }
    }

    onProgress(0, urls.length);
    let done = 0;
    let aborted = false;
    const controller = { abort: () => { aborted = true; } };

    // 동시 8개 fetch (OSM 부하 정책 — 분당 ~1500건 제한 안 넘기게)
    const concurrency = 6;
    async function worker(slice) {
      for (const url of slice) {
        if (aborted) return;
        try { await fetch(url, { cache: 'force-cache' }); }
        catch {}
        done++;
        onProgress(done, urls.length);
        // 작은 딜레이로 rate-limit 회피
        if (done % 30 === 0) await new Promise(r => setTimeout(r, 100));
      }
    }
    const slices = Array.from({ length: concurrency }, (_, i) =>
      urls.filter((_, j) => j % concurrency === i)
    );
    const promise = Promise.all(slices.map(worker)).then(() => ({ aborted, total: urls.length, done }));
    return { promise, controller, total: urls.length };
  }

  window.MapsKit = {
    loadGoogleMaps,
    getApiKey,
    geocode,
    renderTripMap,
    renderDayMiniMap,
    prefetchOfflineTiles,
  };
})();
