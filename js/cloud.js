// js/cloud.js — Supabase 클라이언트 래퍼
// auth + trips/days/places/expenses/packing CRUD를 한 곳에서 제공.
// 로컬 IndexedDB (db.js)는 캐시·오프라인 폴백으로 유지.
(function () {
  if (!window.supabase || !window.SUPABASE_CONFIG) {
    console.warn('[cloud] supabase JS 또는 config가 로드되지 않음. cloud 모듈 비활성.');
    window.Cloud = { enabled: false };
    return;
  }

  const client = window.supabase.createClient(
    window.SUPABASE_CONFIG.url,
    window.SUPABASE_CONFIG.publishableKey,
    {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    }
  );

  // ── Auth ───────────────────────────────────────────
  const auth = {
    client,
    async session() {
      const { data, error } = await client.auth.getSession();
      if (error) throw error;
      return data.session;
    },
    async user() {
      const session = await auth.session();
      return session?.user || null;
    },
    // 회원가입: 이메일+비밀번호 → 'signup' 타입 인증 메일 전송 (6자리 코드 포함)
    async signUp(email, password, displayName) {
      const { error } = await client.auth.signUp({
        email,
        password,
        options: {
          data: displayName ? { display_name: displayName } : undefined,
          emailRedirectTo: window.location.href,
        },
      });
      if (error) throw error;
    },
    // 회원가입 인증 코드 검증
    async verifySignupOtp(email, token) {
      const { error } = await client.auth.verifyOtp({ email, token, type: 'signup' });
      if (error) throw error;
    },
    // 이메일+비밀번호 로그인
    async signInWithPassword(email, password) {
      const { error } = await client.auth.signInWithPassword({ email, password });
      if (error) throw error;
    },
    // 비밀번호 재설정 요청 (인증 메일에 6자리 코드 포함)
    async sendPasswordResetCode(email) {
      const { error } = await client.auth.resetPasswordForEmail(email);
      if (error) throw error;
    },
    // 재설정 코드 검증 (성공 시 일시 세션 발급 → updatePassword 가능)
    async verifyRecoveryOtp(email, token) {
      const { error } = await client.auth.verifyOtp({ email, token, type: 'recovery' });
      if (error) throw error;
    },
    // 현재 세션에서 비밀번호 변경
    async updatePassword(newPassword) {
      const { error } = await client.auth.updateUser({ password: newPassword });
      if (error) throw error;
    },
    // 미인증 사용자 재발송
    async resendSignupCode(email) {
      const { error } = await client.auth.resend({ type: 'signup', email });
      if (error) throw error;
    },
    async signOut() {
      const { error } = await client.auth.signOut();
      if (error) throw error;
    },
    onChange(cb) {
      const { data } = client.auth.onAuthStateChange((event, session) => cb(event, session));
      return () => data.subscription.unsubscribe();
    },
  };

  // ── Trips ──────────────────────────────────────────
  const trips = {
    async list() {
      const { data, error } = await client
        .from('trips')
        .select('*')
        .order('start_date', { ascending: true });
      if (error) throw error;
      return data || [];
    },
    async get(id) {
      const { data, error } = await client.from('trips').select('*').eq('id', id).single();
      if (error) throw error;
      return data;
    },
    async create(trip) {
      const user = await auth.user();
      if (!user) throw new Error('로그인이 필요합니다');
      const payload = { ...trip, owner_id: user.id };
      delete payload.id; // id는 DB가 생성
      const { data, error } = await client.from('trips').insert(payload).select().single();
      if (error) throw error;
      return data;
    },
    async update(id, patch) {
      const { data, error } = await client.from('trips').update(patch).eq('id', id).select().single();
      if (error) throw error;
      return data;
    },
    async remove(id) {
      const { error } = await client.from('trips').delete().eq('id', id);
      if (error) throw error;
    },
  };

  // ── Days ───────────────────────────────────────────
  const days = {
    async listByTrip(tripId) {
      const { data, error } = await client
        .from('days')
        .select('*')
        .eq('trip_id', tripId)
        .order('day_number', { ascending: true });
      if (error) throw error;
      return data || [];
    },
    async upsert(d) {
      const { data, error } = await client.from('days').upsert(d, { onConflict: 'trip_id,day_number' }).select().single();
      if (error) throw error;
      return data;
    },
    async remove(id) {
      const { error } = await client.from('days').delete().eq('id', id);
      if (error) throw error;
    },
  };

  // ── Places ─────────────────────────────────────────
  const places = {
    async listByTrip(tripId) {
      const { data, error } = await client
        .from('places')
        .select('*')
        .eq('trip_id', tripId)
        .order('position', { ascending: true });
      if (error) throw error;
      return data || [];
    },
    async upsert(p) {
      const { data, error } = await client.from('places').upsert(p).select().single();
      if (error) throw error;
      return data;
    },
    async remove(id) {
      const { error } = await client.from('places').delete().eq('id', id);
      if (error) throw error;
    },
  };

  // ── Routes ─────────────────────────────────────────
  const routes = {
    async listByTrip(tripId) {
      const { data, error } = await client.from('routes').select('*').eq('trip_id', tripId);
      if (error) throw error;
      return data || [];
    },
    async upsert(r) {
      const { data, error } = await client.from('routes').upsert(r).select().single();
      if (error) throw error;
      return data;
    },
  };

  // ── Expenses ───────────────────────────────────────
  const expenses = {
    async listByTrip(tripId) {
      const { data, error } = await client
        .from('expenses')
        .select('*')
        .eq('trip_id', tripId)
        .order('paid_date', { ascending: true });
      if (error) throw error;
      return data || [];
    },
    async create(e) {
      const user = await auth.user();
      const payload = { ...e, paid_by: e.paid_by || user?.id };
      const { data, error } = await client.from('expenses').insert(payload).select().single();
      if (error) throw error;
      return data;
    },
    async update(id, patch) {
      const { data, error } = await client.from('expenses').update(patch).eq('id', id).select().single();
      if (error) throw error;
      return data;
    },
    async remove(id) {
      const { error } = await client.from('expenses').delete().eq('id', id);
      if (error) throw error;
    },
  };

  // ── Packing ────────────────────────────────────────
  const packing = {
    async listByTrip(tripId) {
      const { data, error } = await client
        .from('packing_items')
        .select('*')
        .eq('trip_id', tripId)
        .order('position', { ascending: true });
      if (error) throw error;
      return data || [];
    },
    async create(item) {
      const { data, error } = await client.from('packing_items').insert(item).select().single();
      if (error) throw error;
      return data;
    },
    async update(id, patch) {
      const { data, error } = await client.from('packing_items').update(patch).eq('id', id).select().single();
      if (error) throw error;
      return data;
    },
    async remove(id) {
      const { error } = await client.from('packing_items').delete().eq('id', id);
      if (error) throw error;
    },
  };

  // ── Members (공유) ────────────────────────────────
  const members = {
    async listByTrip(tripId) {
      const { data, error } = await client
        .from('trip_members_view')
        .select('*')
        .eq('trip_id', tripId)
        .order('joined_at', { ascending: true });
      if (error) throw error;
      return data || [];
    },
    // RPC를 통한 안전한 이메일 초대 (DB 함수가 owner 검증 + 사용자 조회 + 삽입)
    // 응답 status: 'invited' | 'user_not_found' | 'already_member' | 'self_invite'
    async invite(tripId, email, role = 'editor') {
      const { data, error } = await client.rpc('invite_to_trip', {
        p_trip_id: tripId, p_email: email, p_role: role,
      });
      if (error) throw error;
      return data;
    },
    async changeRole(tripId, userId, role) {
      const { error } = await client
        .from('trip_members')
        .update({ role })
        .eq('trip_id', tripId)
        .eq('user_id', userId);
      if (error) throw error;
    },
    async kick(tripId, userId) {
      const { error } = await client
        .from('trip_members')
        .delete()
        .eq('trip_id', tripId)
        .eq('user_id', userId);
      if (error) throw error;
    },
    async leave(tripId) {
      const user = await auth.user();
      if (!user) throw new Error('로그인 필요');
      const { error } = await client
        .from('trip_members')
        .delete()
        .eq('trip_id', tripId)
        .eq('user_id', user.id);
      if (error) throw error;
    },
  };

  // ── User trip state (체크·메모) ───────────────────
  const userState = {
    async get(tripId) {
      const user = await auth.user();
      if (!user) return { checked_items: {}, memos: {} };
      const { data, error } = await client
        .from('user_trip_state')
        .select('*')
        .eq('trip_id', tripId)
        .eq('user_id', user.id)
        .maybeSingle();
      if (error) throw error;
      return data || { trip_id: tripId, user_id: user.id, checked_items: {}, memos: {} };
    },
    async put(s) {
      const user = await auth.user();
      const payload = { ...s, user_id: user.id };
      const { data, error } = await client
        .from('user_trip_state')
        .upsert(payload, { onConflict: 'trip_id,user_id' })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
  };

  // ── Realtime (공유 트립 실시간 변경 감지) ───────
  const realtime = {
    // 현재 구독 핸들 (트립 1개에 대해 1개 채널)
    _channel: null,
    // tripCloudId의 모든 관련 테이블 변경을 구독. 콜백: ({table, eventType, new, old})
    subscribe(tripCloudId, cb) {
      this.unsubscribe();
      this._channel = client.channel('trip-' + tripCloudId)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'trips', filter: `id=eq.${tripCloudId}` },
            (p) => cb({ table: 'trips', ...p }))
        .on('postgres_changes', { event: '*', schema: 'public', table: 'days', filter: `trip_id=eq.${tripCloudId}` },
            (p) => cb({ table: 'days', ...p }))
        .on('postgres_changes', { event: '*', schema: 'public', table: 'places', filter: `trip_id=eq.${tripCloudId}` },
            (p) => cb({ table: 'places', ...p }))
        .on('postgres_changes', { event: '*', schema: 'public', table: 'expenses', filter: `trip_id=eq.${tripCloudId}` },
            (p) => cb({ table: 'expenses', ...p }))
        .on('postgres_changes', { event: '*', schema: 'public', table: 'packing_items', filter: `trip_id=eq.${tripCloudId}` },
            (p) => cb({ table: 'packing_items', ...p }))
        .on('postgres_changes', { event: '*', schema: 'public', table: 'lodgings', filter: `trip_id=eq.${tripCloudId}` },
            (p) => cb({ table: 'lodgings', ...p }))
        .on('postgres_changes', { event: '*', schema: 'public', table: 'reservations', filter: `trip_id=eq.${tripCloudId}` },
            (p) => cb({ table: 'reservations', ...p }))
        .subscribe();
    },
    unsubscribe() {
      if (this._channel) {
        client.removeChannel(this._channel);
        this._channel = null;
      }
    },
  };

  // ── Storage (사진 첨부) ───────────────────────────
  const storage = {
    async uploadTripPhoto(tripCloudId, file, opts = {}) {
      const user = await auth.user();
      if (!user) throw new Error('로그인 필요');
      if (!tripCloudId) throw new Error('동기화된 트립이어야 사진 업로드 가능');
      const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
      const path = `${tripCloudId}/${user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error } = await client.storage.from('trip-photos').upload(path, file, {
        cacheControl: '3600',
        contentType: file.type || 'image/jpeg',
        upsert: false,
      });
      if (error) throw error;
      const { data } = client.storage.from('trip-photos').getPublicUrl(path);
      return { path, publicUrl: data.publicUrl };
    },
    async deletePhoto(path) {
      const { error } = await client.storage.from('trip-photos').remove([path]);
      if (error) throw error;
    },
  };

  // ── Lodgings (숙소) ───────────────────────────────
  const lodgings = {
    async listByTrip(tripId) {
      const { data, error } = await client.from('lodgings').select('*').eq('trip_id', tripId).order('check_in', { ascending: true });
      if (error) throw error;
      return data || [];
    },
    async upsert(l) {
      const { data, error } = await client.from('lodgings').upsert(l).select().single();
      if (error) throw error;
      return data;
    },
    async remove(id) {
      const { error } = await client.from('lodgings').delete().eq('id', id);
      if (error) throw error;
    },
  };

  // ── Reservations (예약) ───────────────────────────
  const reservations = {
    async listByTrip(tripId) {
      const { data, error } = await client.from('reservations').select('*').eq('trip_id', tripId).order('start_date', { ascending: true });
      if (error) throw error;
      return data || [];
    },
    async upsert(r) {
      const { data, error } = await client.from('reservations').upsert(r).select().single();
      if (error) throw error;
      return data;
    },
    async remove(id) {
      const { error } = await client.from('reservations').delete().eq('id', id);
      if (error) throw error;
    },
  };

  // ── 연결 상태 ──────────────────────────────────────
  async function ping() {
    try {
      const { error } = await client.from('exchange_rates').select('base').limit(1);
      return !error;
    } catch {
      return false;
    }
  }

  window.Cloud = {
    enabled: true,
    client,
    auth,
    trips,
    days,
    places,
    routes,
    expenses,
    packing,
    members,
    userState,
    realtime,
    storage,
    lodgings,
    reservations,
    ping,
  };
})();
