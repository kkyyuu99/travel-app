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

  // 트립 전체 지도 렌더
  // container: HTMLElement
  // trip: { days: [{day, color, items: [{title, map, lat, lon}]}] }
  async function renderTripMap(container, trip, opts = {}) {
    const apiKey = await getApiKey();
    if (!apiKey) throw new Error('API 키가 없습니다. 설정에서 등록하세요.');
    await loadGoogleMaps(apiKey);

    container.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:rgba(255,255,255,0.5)">지오코딩 중...</div>';

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
      // 핀: 색상 커스텀 (Google Maps기본 svg pin URL)
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

    return { markerCount: markers.length, geocodedNow };
  }

  window.MapsKit = {
    loadGoogleMaps,
    getApiKey,
    geocode,
    renderTripMap,
  };
})();
