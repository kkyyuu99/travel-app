// js/emergency.js — countryCode 기반 비상정보 (응급/영사관/카드분실)
// API: window.EMERGENCY_INFO.{countries, korea_global}
//      window.getEmergencyForTrip(trip) → [{ code, name, ... }, ...]
(function () {
  // 한국 공통 (전 세계 어디서나 동일)
  const korea_global = {
    consul_call_center: { name: '외교부 영사 콜센터 (24h)', tel: '+82-2-3210-0404',
      note: '한국에서 무료 전화: 02-3210-0404. 해외에서는 국가코드 +82 추가.' },
    safe_travel: { name: '해외안전여행 (등록·경보)', url: 'https://www.0404.go.kr' },
    cards: [
      { issuer: '현대카드', tel: '+82-2-3015-9000' },
      { issuer: '신한카드', tel: '+82-1544-7000' },
      { issuer: 'KB국민카드', tel: '+82-2-6300-7300' },
      { issuer: '삼성카드', tel: '+82-2-2000-8100' },
      { issuer: '하나카드', tel: '+82-1800-1111' },
      { issuer: '롯데카드', tel: '+82-2-1588-8100' },
      { issuer: '비씨카드', tel: '+82-2-1588-4000' },
      { issuer: 'NH농협카드', tel: '+82-1644-4000' },
      { issuer: '우리카드', tel: '+82-2-1588-9955' },
      { issuer: '씨티카드', tel: '+82-2-1566-1000' },
      { issuer: '트래블월렛', tel: '+82-1566-9527' },
      { issuer: 'VISA 글로벌 핫라인', tel: '+1-303-967-1090', note: '컬렉트콜 가능' },
      { issuer: 'MasterCard 글로벌', tel: '+1-636-722-7111' },
    ],
    insurance_tips: [
      '여행자보험 영문 증서 PDF 폰에 저장',
      '병원 진료 시 영수증·진단서·처방전 한국어/영문 모두 받아두기',
      '도난 시 24시간 안에 현지 경찰서 신고 → 도난신고서(police report) 받기 (보험 청구 필수)',
    ],
  };

  // 국가별 — 응급/경찰/한국 대사관·영사관
  const countries = {
    JP: {
      name: '일본', flag: '🇯🇵',
      emergency: { medical: '119', police: '110', fire: '119' },
      embassy: [
        { city: '도쿄', name: '주일본 대한민국 대사관', tel: '+81-3-3452-7611',
          address: '東京都 港区 南麻布 1-7-32', emergency_tel: '+81-90-1693-5773',
          url: 'https://overseas.mofa.go.kr/jp-ko/index.do' },
        { city: '오사카', name: '주오사카 총영사관', tel: '+81-6-4256-2345',
          emergency_tel: '+81-90-3050-0746' },
        { city: '후쿠오카', name: '주후쿠오카 총영사관', tel: '+81-92-771-0461',
          emergency_tel: '+81-90-1922-9778' },
      ],
      local_tips: [
        '119는 구급차 + 소방. 영어 가능하지만 한국어는 한정.',
        'JR역·지하철역 직원에게 도움 요청 가능 (영어 OK)',
        '의약품: 일반약은 「ドラッグストア」(드러그스토어)에서 구매. 한국 처방약 지참 필수.',
      ],
    },
    FR: {
      name: '프랑스', flag: '🇫🇷',
      emergency: { eu_unified: '112', medical: '15 (SAMU)', police: '17', fire: '18' },
      embassy: [
        { city: '파리', name: '주프랑스 대한민국 대사관', tel: '+33-1-4753-0101',
          emergency_tel: '+33-6-8095-9347',
          address: '125 rue de Grenelle, 75007 Paris' },
      ],
      local_tips: [
        '112가 EU 통합 응급번호 — 모든 EU에서 동일',
        '⚠️ 파리 지하철·관광지 소매치기 극심 — 가방 앞으로',
        '경찰 신고서: 도난 시 가까운 commissariat de police 방문',
      ],
    },
    ES: {
      name: '스페인', flag: '🇪🇸',
      emergency: { eu_unified: '112', medical: '061', police: '091 (국가경찰)', fire: '080' },
      embassy: [
        { city: '마드리드', name: '주스페인 대한민국 대사관', tel: '+34-91-353-2000',
          emergency_tel: '+34-648-924-695',
          address: 'Calle González Amigó 15, 28033 Madrid' },
      ],
      local_tips: [
        '⚠️ 바르셀로나 람블라스·마드리드 솔 광장 소매치기',
        '남부 차량 도난 — 차에 짐 절대 두지 말 것',
        '주민증 없으면 의무적으로 여권 휴대 (검문 가능)',
      ],
    },
    PT: {
      name: '포르투갈', flag: '🇵🇹',
      emergency: { eu_unified: '112', medical: '112', police: '112', fire: '112' },
      embassy: [
        { city: '리스본', name: '주포르투갈 대한민국 대사관', tel: '+351-21-793-7200',
          emergency_tel: '+351-91-079-5055' },
      ],
      local_tips: ['EasyToll 톨게이트 — 국경 진입 시 카드 연동 필수'],
    },
    IT: {
      name: '이탈리아', flag: '🇮🇹',
      emergency: { eu_unified: '112', medical: '118', police: '113 (국가경찰)', fire: '115' },
      embassy: [
        { city: '로마', name: '주이탈리아 대한민국 대사관', tel: '+39-06-802461',
          emergency_tel: '+39-335-185-0499',
          address: 'Via Barnaba Oriani 30, 00197 Roma' },
        { city: '밀라노', name: '주밀라노 총영사관', tel: '+39-02-2906-2641',
          emergency_tel: '+39-345-650-0245' },
      ],
      local_tips: [
        '⚠️ 로마·나폴리 소매치기 최악',
        '⚠️ ZTL 도심 통제구역 — 카메라 자동 벌금',
        '식당 자릿세(coperto) 영수증 확인',
      ],
    },
    CH: {
      name: '스위스', flag: '🇨🇭',
      emergency: { eu_unified: '112', medical: '144', police: '117', fire: '118' },
      embassy: [
        { city: '베른', name: '주스위스 대한민국 대사관', tel: '+41-31-356-2444',
          emergency_tel: '+41-79-825-9019' },
      ],
      local_tips: ['과속 단속 매우 엄격 — 1km/h 초과도 벌금', '비넷(Vignette) 없이 고속도로 진입 = 200CHF 벌금'],
    },
    AT: {
      name: '오스트리아', flag: '🇦🇹',
      emergency: { eu_unified: '112', medical: '144', police: '133', fire: '122' },
      embassy: [
        { city: '빈', name: '주오스트리아 대한민국 대사관', tel: '+43-1-478-1991',
          emergency_tel: '+43-664-527-0743' },
      ],
      local_tips: ['빈 시내 ZTL 유의', 'IG-L 환경제한속도 구간 속도위반 벌금'],
    },
    HU: {
      name: '헝가리', flag: '🇭🇺',
      emergency: { eu_unified: '112', medical: '104', police: '107', fire: '105' },
      embassy: [
        { city: '부다페스트', name: '주헝가리 대한민국 대사관', tel: '+36-1-462-3080',
          emergency_tel: '+36-30-925-3274' },
      ],
      local_tips: ['HUF 환전 — 공항 환전 절대 금지 (수수료 폭탄)', '택시 바가지 — Bolt 앱 이용 권장'],
    },
    CZ: {
      name: '체코', flag: '🇨🇿',
      emergency: { eu_unified: '112', medical: '155', police: '158', fire: '150' },
      embassy: [
        { city: '프라하', name: '주체코 대한민국 대사관', tel: '+420-234-090-411',
          emergency_tel: '+420-725-352-420' },
      ],
      local_tips: ['프라하 환전소 사기 주의 — "0% 수수료" 표지에 함정', '관광지 소매치기'],
    },
    GB: {
      name: '영국', flag: '🇬🇧',
      emergency: { eu_unified: '999', medical: '999 / 111(비응급)', police: '999', fire: '999' },
      embassy: [
        { city: '런던', name: '주영국 대한민국 대사관', tel: '+44-20-7227-5500',
          emergency_tel: '+44-78-7650-6895',
          address: '60 Buckingham Gate, London SW1E 6AJ' },
      ],
      local_tips: ['좌측 통행 — 횡단보도 양쪽 잘 보기', '런던 ULEZ 환경부담금 — 차량 진입 전 확인'],
    },
    GI: {
      name: '지블롤터 (영국령)', flag: '🇬🇮',
      emergency: { eu_unified: '112 / 999', medical: '112', police: '199', fire: '190' },
      embassy: [
        { city: '런던 (관할)', name: '주영국 대한민국 대사관 — 지블롤터 영사 관할',
          tel: '+44-20-7227-5500', emergency_tel: '+44-78-7650-6895' },
      ],
      local_tips: ['스페인 La Línea 국경에서 도보 입경', '공식 통화 GIP (파운드 1:1) — 유로도 통용'],
    },
    SI: {
      name: '슬로베니아', flag: '🇸🇮',
      emergency: { eu_unified: '112', medical: '112', police: '113', fire: '112' },
      embassy: [
        { city: '빈 (관할)', name: '주오스트리아 대한민국 대사관 — 슬로베니아 영사 관할',
          tel: '+43-1-478-1991', emergency_tel: '+43-664-527-0743' },
      ],
      local_tips: ['비넷 필수', '의료 시스템 우수'],
    },
  };

  // Trip의 countryCode 또는 countryCodes 배열로 lookup
  function getEmergencyForTrip(trip) {
    if (!trip) return [];
    const codes = trip.countryCodes && trip.countryCodes.length
      ? trip.countryCodes
      : (trip.countryCode ? [trip.countryCode] : []);
    const seen = new Set();
    const out = [];
    for (const c of codes) {
      if (seen.has(c)) continue;
      seen.add(c);
      const info = countries[c];
      if (info) out.push({ code: c, ...info });
    }
    return out;
  }

  window.EMERGENCY_INFO = { countries, korea_global };
  window.getEmergencyForTrip = getEmergencyForTrip;
})();
