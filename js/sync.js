// js/sync.js — 로컬 IndexedDB ↔ Supabase 클라우드 동기화
// 전략:
//  - 로컬이 사용자에게 보이는 source. 클라우드는 동기화 미러.
//  - 로그인 시 1) 클라우드 → 로컬 풀, 2) 로컬에만 있는 것 → 클라우드 푸시
//  - 로컬 트립 id (예: "tokyo-2026-05")는 그대로, 클라우드 행은 별도 UUID(cloud_id)
//  - 사용자별 상태(checked/memos)는 user_trip_state로 분리 동기화
(function () {
  if (!window.Cloud || !window.Cloud.enabled) {
    window.Sync = { enabled: false };
    return;
  }

  const uid = () => (crypto.randomUUID ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = Math.random() * 16 | 0;
        return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
      }));

  // ── 변환: 로컬 trip → 클라우드 row ──────────────
  function tripLocalToCloud(t, ownerId) {
    return {
      id: t.cloud_id || uid(),
      owner_id: ownerId,
      emoji: t.emoji || '✈️',
      name: t.name || '제목 없음',
      destination: t.destination || null,
      country_codes: Array.isArray(t.countryCodes) ? t.countryCodes
                    : (t.countryCode ? [t.countryCode] : []),
      currency: t.currency || 'USD',
      home_currency: t.homeCurrency || 'KRW',
      lat: typeof t.lat === 'number' ? t.lat : null,
      lon: typeof t.lon === 'number' ? t.lon : null,
      timezone: t.timezone || 'UTC',
      start_date: t.startDate,
      end_date: t.endDate,
      is_seed: !!t.isSeed,
      metadata: {
        local_id: t.id,  // 역참조용
        budget: t.budget || null,
      },
      notion_page_id: t.notion_page_id || null,
    };
  }

  function dayLocalToCloud(d, tripCloudId) {
    return {
      id: d.cloud_id || uid(),
      trip_id: tripCloudId,
      day_number: d.day,
      date: d.date,
      date_label: d.dateLabel || null,
      theme: d.theme || null,
      color: d.color || null,
      description: d.desc || null,
    };
  }

  function placeLocalToCloud(it, tripCloudId, dayCloudId, position) {
    return {
      id: it.cloud_id || uid(),
      trip_id: tripCloudId,
      day_id: dayCloudId,
      position,
      time: it.time || null,
      icon: it.icon || null,
      title: it.title || '',
      subtitle: it.sub || null,
      description: it.desc || null,
      cost: it.cost || null,
      tip: it.tip || null,
      google_map_query: it.map || null,
      reservation_code: it.reservation_code || null,
      highlight: !!it.highlight,
      priority: it.priority || null,
      estimated_minutes: it.estimated_minutes || null,
      tags: Array.isArray(it.tags) ? it.tags : [],
      visit_status: it.visit_status || '방문예정',
      rating: it.rating || null,
      metadata: { local_id: it.id },
    };
  }

  function routeLocalToCloud(r, tripCloudId, dayCloudId, position) {
    return {
      id: r.cloud_id || uid(),
      trip_id: tripCloudId,
      day_id: dayCloudId,
      from_place: r.from || null,
      to_place: r.to || null,
      mode: r.mode || 'train',
      duration: r.dur || null,
      position,
    };
  }

  // ── 변환: 클라우드 row → 로컬 trip ──────────────
  function tripCloudToLocal(c, days, places, routes) {
    const placesByDay = {};
    (places || []).forEach(p => {
      if (!p.day_id) return;
      (placesByDay[p.day_id] = placesByDay[p.day_id] || []).push(p);
    });
    Object.values(placesByDay).forEach(arr => arr.sort((a, b) => (a.position||0) - (b.position||0)));

    const routesByDay = {};
    (routes || []).forEach(r => {
      if (!r.day_id) return;
      (routesByDay[r.day_id] = routesByDay[r.day_id] || []).push(r);
    });
    Object.values(routesByDay).forEach(arr => arr.sort((a, b) => (a.position||0) - (b.position||0)));

    const sortedDays = [...(days || [])].sort((a, b) => a.day_number - b.day_number);
    const localId = c.metadata?.local_id || c.id;

    return {
      id: localId,
      cloud_id: c.id,
      emoji: c.emoji || '✈️',
      name: c.name,
      destination: c.destination || '',
      countryCode: (c.country_codes || [])[0] || '',
      countryCodes: c.country_codes || [],
      currency: c.currency || 'USD',
      homeCurrency: c.home_currency || 'KRW',
      lat: c.lat == null ? 0 : Number(c.lat),
      lon: c.lon == null ? 0 : Number(c.lon),
      timezone: c.timezone || 'UTC',
      startDate: c.start_date,
      endDate: c.end_date,
      isSeed: !!c.is_seed,
      notion_page_id: c.notion_page_id || null,
      budget: c.metadata?.budget || { items: [], daily: {} },
      days: sortedDays.map(d => ({
        day: d.day_number,
        cloud_id: d.id,
        date: d.date,
        dateLabel: d.date_label || '',
        theme: d.theme || '',
        color: d.color || '#4fc3f7',
        desc: d.description || '',
        items: (placesByDay[d.id] || []).map(p => ({
          id: p.metadata?.local_id || p.id,
          cloud_id: p.id,
          time: p.time || '',
          icon: p.icon || '',
          title: p.title || '',
          sub: p.subtitle || '',
          desc: p.description || '',
          cost: p.cost || '',
          tip: p.tip || '',
          map: p.google_map_query || '',
          reservation_code: p.reservation_code || '',
          highlight: !!p.highlight,
          priority: p.priority || null,
          tags: p.tags || [],
          visit_status: p.visit_status || '방문예정',
        })),
        routes: (routesByDay[d.id] || []).map(r => ({
          cloud_id: r.id,
          from: r.from_place || '',
          to: r.to_place || '',
          mode: r.mode || 'train',
          dur: r.duration || '',
        })),
      })),
      createdAt: c.created_at ? Date.parse(c.created_at) : Date.now(),
      updatedAt: c.updated_at ? Date.parse(c.updated_at) : Date.now(),
    };
  }

  // ── 단일 트립 클라우드 푸시 (upsert) ────────────
  async function pushTrip(local) {
    const user = await Cloud.auth.user();
    if (!user) throw new Error('로그인 필요');

    // 1) trips upsert
    const tripRow = tripLocalToCloud(local, user.id);
    const { data: tripCloud, error: tErr } = await Cloud.client
      .from('trips').upsert(tripRow).select().single();
    if (tErr) throw tErr;
    local.cloud_id = tripCloud.id;

    // 2) days upsert
    const dayRows = (local.days || []).map(d => dayLocalToCloud(d, tripCloud.id));
    if (dayRows.length) {
      const { data: dayResults, error: dErr } = await Cloud.client
        .from('days').upsert(dayRows, { onConflict: 'trip_id,day_number' }).select();
      if (dErr) throw dErr;
      // 각 로컬 day에 cloud_id 매핑
      const byNumber = new Map(dayResults.map(r => [r.day_number, r.id]));
      local.days.forEach(d => { d.cloud_id = byNumber.get(d.day); });
    }

    // 3) places upsert (모든 day의 items를 평탄화)
    const placeRows = [];
    (local.days || []).forEach(d => {
      (d.items || []).forEach((it, i) => {
        placeRows.push(placeLocalToCloud(it, tripCloud.id, d.cloud_id, i));
      });
    });
    if (placeRows.length) {
      const { data: placeResults, error: pErr } = await Cloud.client
        .from('places').upsert(placeRows).select();
      if (pErr) throw pErr;
      // 매핑: cloud_id를 로컬 item에 반영. metadata.local_id로 역참조.
      const byLocalId = new Map(placeResults.map(r => [r.metadata?.local_id, r.id]));
      local.days.forEach(d => {
        (d.items || []).forEach(it => {
          const cid = byLocalId.get(it.id);
          if (cid) it.cloud_id = cid;
        });
      });
    }

    // 4) routes upsert
    // 기존 routes를 위해 먼저 day_id별 삭제 후 재삽입 (인덱스 변화 가능성)
    const routeRows = [];
    (local.days || []).forEach(d => {
      (d.routes || []).forEach((r, i) => {
        routeRows.push(routeLocalToCloud(r, tripCloud.id, d.cloud_id, i));
      });
    });
    if (routeRows.length) {
      const { error: rErr } = await Cloud.client
        .from('routes')
        .delete()
        .eq('trip_id', tripCloud.id);
      if (rErr) console.warn('routes 삭제 실패 (무시):', rErr.message);
      const { error: r2Err } = await Cloud.client.from('routes').insert(routeRows);
      if (r2Err) throw r2Err;
    }

    // 5) 로컬 IDB에 cloud_id 매핑 저장
    await TripDB.trips.put(local);
    return local;
  }

  // ── 단일 트립 클라우드 풀 ────────────────────────
  async function pullTrip(cloudId) {
    const [{ data: tRow, error: tErr },
           { data: dRows, error: dErr },
           { data: pRows, error: pErr },
           { data: rRows, error: rErr }] = await Promise.all([
      Cloud.client.from('trips').select('*').eq('id', cloudId).single(),
      Cloud.client.from('days').select('*').eq('trip_id', cloudId),
      Cloud.client.from('places').select('*').eq('trip_id', cloudId),
      Cloud.client.from('routes').select('*').eq('trip_id', cloudId),
    ]);
    if (tErr) throw tErr;
    if (dErr || pErr || rErr) console.warn('nested fetch warning', dErr, pErr, rErr);
    return tripCloudToLocal(tRow, dRows || [], pRows || [], rRows || []);
  }

  // ── 클라우드 전체 풀 → 로컬 머지 ─────────────────
  async function pullAll() {
    const { data: tripRows, error } = await Cloud.client
      .from('trips').select('*');
    if (error) throw error;
    if (!tripRows || tripRows.length === 0) return { pulled: 0 };

    let pulled = 0;
    for (const t of tripRows) {
      try {
        const local = await pullTrip(t.id);
        // 기존 로컬에 같은 cloud_id가 있으면 덮어쓰기, 없으면 새로
        const existing = await TripDB.trips.get(local.id);
        if (existing && existing.cloud_id && existing.cloud_id !== local.cloud_id) {
          // ID 충돌 (다른 클라우드 트립이 같은 로컬 id 사용) — 새 local id 부여
          local.id = local.cloud_id;
        }
        await TripDB.trips.put(local);
        pulled++;
      } catch (e) {
        console.warn(`풀 실패 (cloud_id=${t.id}):`, e.message);
      }
    }
    return { pulled };
  }

  // ── 로컬 전체 푸시 (cloud_id 없는 것만) ──────────
  async function pushAll() {
    const trips = await TripDB.trips.all();
    let pushed = 0;
    for (const t of trips) {
      if (t.cloud_id) continue; // 이미 동기화됨
      try {
        await pushTrip(t);
        pushed++;
      } catch (e) {
        console.warn(`푸시 실패 (id=${t.id}):`, e.message);
      }
    }
    return { pushed };
  }

  // ── 로그인 시 전체 동기화 ──────────────────────
  async function syncOnSignIn() {
    if (!(await Cloud.auth.user())) return { pulled: 0, pushed: 0 };
    const pull = await pullAll();
    const push = await pushAll();
    return { ...pull, ...push };
  }

  // ── 단일 트립 클라우드 삭제 ──────────────────────
  async function deleteTrip(cloudId) {
    const { error } = await Cloud.client.from('trips').delete().eq('id', cloudId);
    if (error) throw error;
  }

  // ── 사용자 상태(체크·메모) 클라우드 동기화 ──────
  async function pushUserState(tripCloudId, state) {
    const user = await Cloud.auth.user();
    if (!user) return;
    await Cloud.client.from('user_trip_state').upsert({
      trip_id: tripCloudId,
      user_id: user.id,
      checked_items: state.checked || {},
      memos: state.memos || {},
    }, { onConflict: 'trip_id,user_id' });
  }

  async function pullUserState(tripCloudId) {
    const user = await Cloud.auth.user();
    if (!user) return null;
    const { data, error } = await Cloud.client
      .from('user_trip_state')
      .select('*')
      .eq('trip_id', tripCloudId)
      .eq('user_id', user.id)
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  window.Sync = {
    enabled: true,
    uid,
    pushTrip,
    pullTrip,
    pullAll,
    pushAll,
    syncOnSignIn,
    deleteTrip,
    pushUserState,
    pullUserState,
  };
})();
