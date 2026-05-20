// js/ai.js — AI 일정 생성 (Gemini / Claude / OpenAI)
// 브라우저에서 직접 호출. API 키는 IndexedDB의 settings 스토어에 저장.
(function () {
  const DEFAULTS = {
    gemini: 'gemini-2.5-flash',
    claude: 'claude-3-5-sonnet-latest',
    openai: 'gpt-4o-mini',
  };

  // 도쿄 데이터와 동일한 모양으로 채우도록 모델에 지시
  function systemPrompt() {
    const today = new Date();
    const todayISO = today.toISOString().slice(0, 10);
    const currentYear = today.getFullYear();
    return `당신은 한국어 여행 일정 생성기입니다. 사용자 요청을 받아 아래 JSON 스키마를 정확히 채워 반환하세요.
JSON 외 다른 텍스트(설명·코드펜스 포함)는 절대 출력하지 마세요.

오늘 날짜: ${todayISO} (현재 연도: ${currentYear})
사용자가 연도 없이 "6월 12일"처럼만 적었다면:
- 그 날짜가 ${todayISO} 이후라면 ${currentYear}년으로 해석
- 이미 지난 날짜라면 ${currentYear + 1}년으로 해석
연도를 명시했다면 그것을 우선 사용.

스키마:
{
  "emoji": "여행을 상징하는 이모지 1개",
  "name": "여행 이름 (예: 도쿄 가족여행)",
  "destination": "주요 목적지 (도시, 국가)",
  "countryCode": "ISO 2자리 (JP/KR/US 등)",
  "currency": "현지 통화 ISO 코드 (JPY/USD/EUR/THB 등)",
  "homeCurrency": "사용자 모국 통화 — 명시 안 했으면 KRW",
  "lat": 35.6762,
  "lon": 139.6503,
  "timezone": "Asia/Tokyo 같은 IANA 타임존",
  "startDate": "YYYY-MM-DD",
  "endDate": "YYYY-MM-DD",
  "days": [
    {
      "day": 1,
      "date": "YYYY-MM-DD",
      "dateLabel": "5/25 (월)",
      "theme": "이 날의 주제",
      "color": "#ff6b9d",
      "desc": "이 날 한 줄 설명",
      "items": [
        {
          "id": "d1-1",
          "time": "09:00",
          "icon": "이모지 1개",
          "title": "장소·활동 제목",
          "sub": "부제 (선택, 없으면 빈 문자열)",
          "desc": "상세 설명. \\n 으로 줄바꿈 가능",
          "cost": "예상 비용 (선택, 빈 문자열 가능)",
          "tip": "유용한 팁 (선택, 빈 문자열 가능)",
          "map": "구글맵 검색용 장소명 (선택, 없으면 빈 문자열)",
          "lat": 35.6580,
          "lon": 139.7016,
          "highlight": false
        }
      ],
      "routes": [
        { "from": "A 장소", "to": "B 장소", "mode": "train", "dur": "지하철 15분" }
      ]
    }
  ],
  "budget": {
    "items": [
      { "label": "교통비", "amount": 0 },
      { "label": "식비", "amount": 0 },
      { "label": "입장료", "amount": 0 },
      { "label": "쇼핑·예비비", "amount": 0 }
    ],
    "daily": { "1": 0 }
  }
}

규칙:
- color: day마다 ["#ff6b9d","#f5c842","#4fc3f7","#81c784","#c084fc","#ff8a65"] 순서대로 순환
- routes 배열은 items보다 정확히 1개 적게 (items[i] → items[i+1] 이동을 의미)
- routes의 mode는 "train"|"walk"|"plane" 중 하나
- id는 "d{day번호}-{n}" 형식 (예: d1-1, d1-2, d2-1)
- icon은 단일 이모지
- 시간은 24시간 형식 "HH:MM"
- date는 ISO "YYYY-MM-DD", dateLabel은 "M/D (요일)" (요일은 월/화/수/목/금/토/일)
- **각 item의 lat/lon은 그 장소의 실제 GPS 좌표 (숫자, 소수점 4자리)** — 지도 표시에 필수. 정확한 좌표를 모르면 가장 가까운 유명 랜드마크 좌표 사용. (예: 시부야 스카이 = 35.6580, 139.7022)
- trip 최상위 lat/lon은 목적지 도시 중심 좌표
- amount는 현지 통화 기준 정수
- 모든 텍스트는 한국어
- 하루 5~10개 활동 권장 (이동·식사 포함)
- 최종 출력은 순수 JSON 1개만`;
  }

  // 응답에서 JSON 추출 (코드펜스·잡설·잘림 대비)
  function parseJSON(text) {
    if (!text) throw new Error('AI 응답이 비어있습니다.');
    const fence = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    const raw = fence ? fence[1] : text;
    const start = raw.indexOf('{');
    if (start < 0) throw new Error('JSON을 찾을 수 없습니다.');
    let json = raw.slice(start);

    // 1차 시도: 그대로
    try { return JSON.parse(json); } catch {}

    // 2차 시도: 끝부분이 잘렸을 수 있음. 괄호 균형 맞춤 + trailing comma 정리.
    let depth = 0, bracketDepth = 0, inStr = false, esc = false, lastSafe = -1;
    for (let i = 0; i < json.length; i++) {
      const c = json[i];
      if (esc) { esc = false; continue; }
      if (c === '\\') { esc = true; continue; }
      if (c === '"') { inStr = !inStr; continue; }
      if (inStr) continue;
      if (c === '{') depth++;
      else if (c === '}') { depth--; if (depth === 0 && bracketDepth === 0) lastSafe = i; }
      else if (c === '[') bracketDepth++;
      else if (c === ']') bracketDepth--;
    }
    // 끝까지 갔는데 균형 안 맞으면, 마지막 안전 위치까지 자르고 누락된 닫는 괄호 추가
    if (lastSafe > 0 && lastSafe < json.length - 1) {
      json = json.slice(0, lastSafe + 1);
    } else if (depth > 0 || bracketDepth > 0) {
      // 마지막 콤마 제거 후 닫기
      json = json.replace(/,\s*$/, '');
      json += ']'.repeat(Math.max(0, bracketDepth)) + '}'.repeat(Math.max(0, depth));
    }
    return JSON.parse(json);
  }

  async function _gemini(key, model, sys, user) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`;
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: sys }] },
        contents: [{ role: 'user', parts: [{ text: user }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: 0.7,
          maxOutputTokens: 32768,
        },
      }),
    });
    if (!r.ok) throw new Error(`Gemini ${r.status}: ${(await r.text()).slice(0, 200)}`);
    const j = await r.json();
    const text = j.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('') || '';
    return parseJSON(text);
  }

  async function _claude(key, model, sys, user) {
    // anthropic-dangerous-direct-browser-access: 브라우저 직접 호출 허용 헤더
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model,
        max_tokens: 8192,
        system: sys,
        messages: [{ role: 'user', content: user + '\n\n순수 JSON만 출력.' }],
      }),
    });
    if (!r.ok) throw new Error(`Claude ${r.status}: ${(await r.text()).slice(0, 200)}`);
    const j = await r.json();
    const text = j.content?.[0]?.text || '';
    return parseJSON(text);
  }

  async function _openai(key, model, sys, user) {
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: sys },
          { role: 'user', content: user },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.7,
      }),
    });
    if (!r.ok) throw new Error(`OpenAI ${r.status}: ${(await r.text()).slice(0, 200)}`);
    const j = await r.json();
    const text = j.choices?.[0]?.message?.content || '';
    return parseJSON(text);
  }

  // 모델이 빠뜨릴 수 있는 필드 보강
  function sanitize(trip) {
    trip.id = trip.id || ('trip-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6));
    trip.emoji = trip.emoji || '✈️';
    trip.homeCurrency = trip.homeCurrency || 'KRW';
    trip.currency = trip.currency || 'USD';
    trip.timezone = trip.timezone || 'UTC';
    trip.lat = typeof trip.lat === 'number' ? trip.lat : 0;
    trip.lon = typeof trip.lon === 'number' ? trip.lon : 0;
    trip.days = Array.isArray(trip.days) ? trip.days : [];
    trip.budget = trip.budget || { items: [], daily: {} };
    trip.budget.items = Array.isArray(trip.budget.items) ? trip.budget.items : [];
    trip.budget.daily = trip.budget.daily && typeof trip.budget.daily === 'object' ? trip.budget.daily : {};
    trip.createdAt = trip.createdAt || Date.now();
    trip.updatedAt = Date.now();
    trip.isSeed = false;

    // 각 day와 items 보강
    trip.days.forEach((d, di) => {
      d.day = d.day || di + 1;
      d.color = d.color || '#4fc3f7';
      d.items = Array.isArray(d.items) ? d.items : [];
      d.routes = Array.isArray(d.routes) ? d.routes : [];
      d.items.forEach((it, ii) => {
        it.id = it.id || `d${d.day}-${ii + 1}`;
        it.icon = it.icon || '📍';
        it.time = it.time || '';
        it.title = it.title || '';
        it.sub = it.sub || '';
        it.desc = it.desc || '';
        if (typeof it.lat === 'string') it.lat = parseFloat(it.lat);
        if (typeof it.lon === 'string') it.lon = parseFloat(it.lon);
        if (typeof it.lat !== 'number' || isNaN(it.lat)) delete it.lat;
        if (typeof it.lon !== 'number' || isNaN(it.lon)) delete it.lon;
      });
    });

    return trip;
  }

  async function generateTrip(prompt, opts = {}) {
    const provider = opts.provider || (await TripDB.settings.get('aiProvider', 'gemini'));
    // 1순위: 명시 옵션 / 2순위: 사용자 개인 키 / 3순위: 운영자 중앙 키 (Supabase app_config)
    let key = opts.apiKey || (await TripDB.settings.get(`apiKey.${provider}`));
    if (!key && window.Cloud?.enabled && window.Cloud.appConfig) {
      try { key = await Cloud.appConfig.get(`apiKey.${provider}`); } catch {}
    }
    if (!key) {
      const e = new Error(`${provider.toUpperCase()} API 키가 없습니다. 설정에서 등록하거나 운영자에게 문의하세요.`);
      e.code = 'NO_KEY';
      e.provider = provider;
      throw e;
    }
    const model = opts.model || (await TripDB.settings.get(`model.${provider}`)) || DEFAULTS[provider];
    const sys = systemPrompt();
    let trip;
    if (provider === 'gemini') trip = await _gemini(key, model, sys, prompt);
    else if (provider === 'claude') trip = await _claude(key, model, sys, prompt);
    else if (provider === 'openai') trip = await _openai(key, model, sys, prompt);
    else throw new Error('알 수 없는 공급자: ' + provider);
    return sanitize(trip);
  }

  window.AI = {
    PROVIDERS: ['gemini', 'claude', 'openai'],
    DEFAULTS,
    generateTrip,
    sanitize,
  };
})();
