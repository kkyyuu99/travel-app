# Travel PWA — 세션 히스토리 (v1 → v21)

> **이 문서의 위치**: Claude.ai 웹 대화에서 진행된 v1~v21 개발 과정의 정돈된 기록.
> **요약본**: [WORKTHROUGH.md](WORKTHROUGH.md) §4 버전 히스토리.
> **이 문서**: 그때그때 사용자가 무엇을 요청했고, 어떻게 결정됐고, 어떻게 구현됐는지의 디테일.
>
> 원본 채팅 로그(`새 텍스트 문서.txt`)를 발화자·시점·결과로 재구조화한 것.

---

## 0. 초기 구상 (PWA 변환 결정)

### 사용자
> `tokyo.html` 한 파일이 있음. 오프라인에서 폰에 담아 쓰고 싶음.
> 안드로이드 앱으로 만들어야 하나?

### 결정
- **네이티브 앱(APK) 안 함** — 본인 폰 1대 위주, PWA로 90% 커버.
- **호스팅**: GitHub Pages (무료, 자동 HTTPS, PWA 설치 가능).
- **빌드 도구 없음** — 순수 HTML/CSS/JS.

### PWA vs APK 비교 (요약)
| 항목 | PWA | APK (TWA/네이티브) |
|---|---|---|
| 홈화면·전체화면·오프라인 | ✅ | ✅ |
| 빌드 시간 | 0초 | 5~30분 |
| 업데이트 | 푸시 즉시 | APK 재배포 |
| 깊은 OS 통합 (BG 위치, NFC 등) | ⚠️ | ✅ |

→ 도쿄 일정·날씨·환율 앱은 PWA 충분. 나중에 필요해지면 PWABuilder TWA 경로 열어둠.

---

## 1. v1 — PWA 변환

### 작업
1. `tokyo.html` → `index.html` 복사
2. `manifest.json` 생성 (이름·아이콘·테마컬러·standalone)
3. `sw.js` 생성 — Cache First + 날씨/환율 API는 Network First fallback
4. 아이콘 SVG 작성 → Pillow(PIL)로 PNG 변환 (cairosvg 없어서)
   - `icon.svg`, `icon-maskable.svg` (안전영역 50%)
   - `icon-192.png`, `icon-512.png`, `icon-maskable-512.png`
   - `apple-touch-icon.png` (180px), `favicon.png` (64px)
5. `index.html` `<head>`에 manifest 링크, theme-color, apple-mobile-web-app-* 메타 + SW 등록 스크립트
6. `.nojekyll` (GitHub Pages용 빈 파일)

### 결과
- 로컬 `python -m http.server 8766` 검증 — 핵심 파일 전부 200 OK
- 폰 설치: Android Chrome "앱 설치", iOS Safari "홈 화면에 추가"
- 캐시 갱신: `sw.js`의 `CACHE_VERSION` 올리고 push

---

## 2. v1.0 — 멀티트립 + AI + Supabase 도입

### 사용자
> 나중에 다른 여행에도 쓰고 싶음. 트리플 앱처럼 여행1·여행2로 여러 여행 관리·계획.

### 결정
- **앱 셸은 1개, 여행은 데이터(IndexedDB)로 분리**
- **동기화 스코프**: 폰 여러 대 + 가족 공유 필요 → Supabase 백엔드 도입
- 로컬 IndexedDB가 source of truth, 클라우드는 미러
- AI 트립 생성 기능 추가 (운영자 키 중앙 관리는 v13에서)

---

## 3. v2.2 — 클라우드 양방향 트립 동기화

### 작업
- `js/sync.js` 신규 (~347줄)
- 로컬 trip ID 그대로 두고 `cloud_id` 별도 필드로 매핑
- 로그인 시 자동: `Sync.pullAll()` + `Sync.pushAll()` → 토스트 "☁️ 동기화 완료 — N개 받음, M개 보냄"
- 새 트립 저장/이름 수정/삭제 시 fire-and-forget 클라우드 push
- 체크박스/메모는 `user_trip_state`로 per-user 동기화
- 다른 기기에서 `openTrip` 시 user_trip_state 1회 pull → 머지

### 동기화 커버 범위
| 항목 | 상태 | 비고 |
|---|---|---|
| 트립 메타 (이름·기간·통화) | ✅ | `trips` |
| Days·Places·Routes | ✅ | 각자 테이블 (routes는 delete-then-insert) |
| Checked + Memos (per-user) | ✅ | `user_trip_state` |
| Expenses·Packing | ⏸️ | Day 4에서 |

### 결과
- 커밋 `571d38a`
- 라이브: `https://kkyyuu99.github.io/travel-app/`

---

## 4. 데이터 출처 표기 + 이메일/비밀번호 인증 (v9-ish)

### 사용자
> 날씨·환율 정확한 거 맞아? 출처 표기해줘야지. 그리고 이메일/비밀번호 + 인증번호 가입으로 바꾸고 싶어.

### 1) 데이터 출처 — 솔직히 정리
| 데이터 | API | 실제 출처 | 정확도 |
|---|---|---|---|
| 날씨 | Open-Meteo | ECMWF + DWD | 7~10일 정확, 16일 넘으면 평년값 수준. 1년+ 미래는 무의미 |
| 환율 | Frankfurter | ECB 참조환율 | 영업일 1회. 은행 실거래는 0.5~2% 더 불리. VND·TWD 등 미지원 |

- 환율 시트 하단: `업데이트: HH:MM · 출처: ECB (Frankfurter)` (frankfurter.dev 링크)
- 날씨 스트립 하단: `Open-Meteo (ECMWF/DWD)` 링크
- 16일+ 미래 트립이면 자동 ⚠️ 경고

### 2) 인증 흐름 개편 (cloud.js + 모달 재설계)
| 모드 | 흐름 |
|---|---|
| 로그인 | 이메일+비밀번호 → 즉시 |
| 회원가입 | 이메일+비밀번호(+이름) → 6자리 코드 메일 → 코드 입력 → 가입+로그인 |
| 비밀번호 찾기 | 이메일 → 재설정 코드 → 코드+새 비밀번호 → 변경+로그인 |

### 함정 (캐시 디버깅)
- 새 메서드 11개 추가 후 브라우저에 안 보임 → SW가 옛 캐시 서빙
- 해결: 스크립트 태그에 `?v=N` 쿼리 추가 + SW v6로 + PRECACHE_URLS도 같은 쿼리로
- **교훈**: 코드 변경 → `CACHE_VERSION`, `PRECACHE_URLS ?v=`, `index.html` 스크립트 태그 `?v=` 3곳 동시 갱신 필수

### 결과
- 커밋 `21d4750`

---

## 5. 테마 + 프로필 + 설정 재구성 (f68a0fb)

### 사용자
> 설정·프로필·다크/라이트/시스템 테마. 다음 과정도 다 진행해.

### 작업
- CSS 변수로 색 토큰 추출 → 다크(`#0d1117`) 디폴트, 라이트(`#fdfdfd`) 오버라이드, system은 `prefers-color-scheme` 따름
- 하드코딩된 색 → `var(--bg)` 등으로 교체
- 설정 화면 6 섹션: 계정&프로필 / 화면 / AI 공급자 / 통화 / 데이터 / 정보
- 프로필 카드 (표시 이름·자기소개) → `profiles` 테이블 + auth metadata 양쪽 저장
- `profiles.bio` 컬럼 추가 (Supabase 마이그레이션)
- Bootstrap에서 테마 가장 먼저 적용 (FOUC 방지) + `theme-color` 메타 동적 갱신
- 시스템 테마 변경 실시간 감지

### 결과
- 검증: dark `#0d1117`, light `#fdfdfd`, 영속 저장 OK

---

## 6. Day 3-7 통합 (01ba319) — sharing / cloud expenses·packing / Notion import / 데스크탑

### Day 3 — 트립 공유 (이메일 초대)
- 백엔드: 이메일로 사용자 찾기 RPC + `invite_to_trip` 안전 함수
- 트립 메뉴 "공유 / 멤버"
- 편집자/뷰어 역할, 멤버 제거

### Day 4 — 클라우드 expenses + packing CRUD
- 기존 로컬 IDB → `expenses`, `packing_items` 테이블
- `openTrip` 시 자동 pull-merge

### Day 5 — 노션 임포트 (실용 노선)
- **결정**: 노션 API는 MCP 서버 통해서만 → 클라이언트 직접 호출 불가
- Edge Function 프록시도 무거움 → **텍스트/마크다운 붙여넣기 → AI에게 트립 스키마로 변환** 요청 방식 채택
- 트립 목록 하단 "노션에서 가져오기" 버튼

### Day 6 — 데스크탑 + 60일 스케일
- `@media (min-width:900px)` 2-column 레이아웃, 트립 카드 그리드
- 60일 day-tabs 가로 스크롤 + 월 구분선 + 활성 탭 자동 스크롤

### Day 7 — 통합 검증 + push
- 헤드리스 브라우저 8단계 검증 모두 ✅
  - 모듈 로드 (db/cloud/sync/ai)
  - 테마 영속
  - 시드 트립 + Day 탭
  - 가계부 6 카테고리
  - 환율 시트 출처 표기
  - 준비물 15개 템플릿
  - 트립 메뉴 4 항목
  - 설정 6 섹션 + AI/테마 라디오

---

## 7. v10-v16 — Notion ZIP, Maps, 운영자 키, AI fill, Europe seed

> 채팅 로그에는 디테일이 적지만 커밋 메시지에서 추출:

| 버전 | 작업 |
|---|---|
| v10 | Notion ZIP 임포트, 인라인 맵, Realtime, Storage, 숙소/예약, 부모 가이드 |
| v11 | 사진 렌더 + 예약/숙소 편집 + 데스크탑 사이드바 + Notion ZIP 청크 처리 |
| v12 | Google Maps JS API 통합 (full trip map) |
| v13 | **운영자 API 키 중앙화 (SaaS 모델)** — 사용자가 키 입력 안 해도 됨 |
| v14 | 도쿄 좌표 + Day 폴리라인 + Leaflet OSM fallback |
| v15 | Day 미니맵, Day 필터, 오프라인 OSM 타일 프리페치 |
| v16 | 유럽 60일 seed + item 편집/추가 + AI fill empty day |

---

## 8. v17 — 노션 페이지 실제 반영

### 사용자
> 페이지 제목만 맞추지 말고 "2027_유럽 10000Km 여행" 페이지를 노션에서 읽어서 그걸 적용해줘.

### 작업
- Notion MCP로 메인 페이지 + 9개국 정보 DB + 관련 페이지 fetch
- `js/seed.js` 의 `EUROPE_SEED` 재구성
- 트립 처음 열 때 `notion_metadata`의 packing/reservations 자동 시드 + 버킷리스트 타임라인 상단 표시

### 반영된 내용
| 노션 섹션 | 어떻게 |
|---|---|
| 여행 제목 | "2027_유럽 10000Km 여행" |
| 버킷리스트 5개 | 톨레도·카르모나·호카곶·피렌체·이탈리아 농가숙박·마테호른 → Day 1 상단 "📋 버킷리스트" 카드 |
| 1년 체크리스트 | 항공권/렌터카/파라도르/알함브라 등 → 예약 시트 8개 자동 시드 |
| 패킹 ~50개 | 스위스 J타입 어댑터·국제운전면허증 등 → 준비물 27개 시드 |
| 9개국 자동차 정보 | 비넷·ZTL·기름값·치안 → Day 1+4 팁 메모 |
| 파리 행사 (5/17~5/20) | Day 1-4 |
| 자동차 픽업 | Day 5 (5/21) 렌터카 + 9개국 일주 시작 |
| 예산 | 항공 520만원, 리스 €6500, 숙박 €9000 등 |

### 남은 부분 (메모)
- 55개 빈 Day → AI로 채우거나 Notion ZIP 임포트
- 9개국 DB (톨게이트·마트·콘센트) → 별도 "여행 정보" 섹션 추가 필요
- 유럽_도시 DB 27개 → lodgings 자동 시드 가능

### 결과
- 커밋 `8d7a7e6`

---

## 9. v18 — 국가별 팁 reference + 벌크 AI day-fill

(커밋 `3529e5d` — 채팅 로그에 디테일 적음)

---

## 10. v19 — 커버 사진 + 다이어리

### 작업
- `cloud.js`에 diary CRUD + 커버 사진 헬퍼
- 트립 메뉴 2 항목 추가: "커버 사진 설정" / "여행 다이어리"
- 트립 카드 배경에 커버 (페이드 그라데이션), 디테일 헤더에도 (어두운 오버레이)
- 다이어리 entry: 📅 날짜 · ☀️ 날씨 · 😊 기분 · 하이라이트 한 줄 · 본문 · 사진 가로스크롤
- 사진 여러 장 즉시 업로드 (드래프트 → 저장 시 확정), 개별 제거 가능

### 결과
- 커밋 `35a7f05`

---

## 11. v20 — Now 인디케이터 + Day 사진 갤러리

### 작업

**1) 타임라인 Now 인디케이터**
- 트립 오늘 Day 위에 "지금 · HH:MM" 마커
- 가장 가까운 지난 항목 = 현재 진행중 (펄스 링, `.is-current`)
- 자동 스크롤: 오늘 Day 열면 NOW 위치로
- 1분마다 자동 갱신
- 모든 항목 지나면 맨 끝에 "오늘 일정 완료"

**2) Day별 사진 갤러리 (체크리스트 뷰)**
- 일자별 자동 집계: 메모 `![](url)` + 다이어리 사진
- 정사각형 썸네일 그리드, 탭 시 전체화면 뷰어

### 결과
- 커밋 `b4c04b1`

---

## 12. v21 — 모바일 폴리시 + a11y + SW 프롬프트

### 사용자
> 직접 폰 모드로 브라우저 테스트까지 동작 점검해서 완벽하게 만들고, 더 개선할 점 찾아서 알아서 보완.

### 모바일 감사 (iPhone SE 375×812 뷰포트) — 발견 + 수정
| 발견 | 영향 | 조치 |
|---|---|---|
| 8개 모달 max-height 없음 | 작은 폰에서 잘림 | `.modal { max-height:90vh; overflow-y:auto }` |
| 12개 input font-size 14px | iOS 포커스 시 자동 줌 | 모바일 16px, 데스크탑 14px (미디어 쿼리) |
| 탭 타겟 크기 | OK | ✅ 모두 36px 이상 |

### 자율 추가 개선
| 개선 | 동작 |
|---|---|
| 🔄 SW 업데이트 배너 | 새 버전 감지 → 상단 알약 + "새로고침". 다른 탭 업데이트 시 자동 리로드 |
| 📡 오프라인 배너 | `navigator.onLine === false` 일 때 빨간 알약 |
| ESC 키 | 우선순위: 사진뷰어 → 편집모달 → 일반모달 → 시트 → 메뉴 |
| Body scroll lock | 모달 열림 시 배경 스크롤 차단 (MutationObserver) |
| 빈 트립 empty state | 🧳 + 따뜻한 안내 + AI 생성 / 노션 ZIP 두 갈래 |
| 햅틱 피드백 | 토스트 10ms, 체크 완료 20-40-20 패턴 |
| 토스트 a11y | `role="status" aria-live="polite"` |

### 검증 (모바일 375×812)
- 모달 max-height 690.2px / fits / overflow-y:auto ✅
- input font-size 16px ✅
- ESC 즉시 닫힘 ✅
- body lock 동작 ✅
- SW + 오프라인 배너 element 존재 ✅
- `haptic()` 동작 ✅
- Toast a11y 속성 ✅
- 빈 상태 인비팅 ✅

### 결과
- 커밋 `9a254e7`

---

## 12.5. v22 — Sticky Now 바 + 시간 파싱 버그 + 캐시 정돈

### 작업 (2026-05-22, 도쿄 D-3)
- **Sticky Now 바** ([index.html](index.html#L155) `#sticky-now`): 오늘 Day일 때만 topbar 바로 아래 sticky로 `🔵 HH:MM · 다음: HH:MM 항목명 · M분 후 · N/M` 표시. 1분 자동 갱신. 모든 항목 지나면 "🎉 오늘 일정 완료". 항목 없으면 "오늘 일정 없음".
- **시간 파싱 버그 수정** ([index.html](index.html) `renderTimeline.parse`): `"10:58".split(':').map(Number).reduce((h,m,i)=>i?h+m:h*60)` 가 `658` 대신 `68`을 반환하던 버그 (reduce 콜백 인자 순서 + 초기값 누락). v20 Now 인디케이터부터 잠재돼 있었음 — 모든 항목이 "지나간" 것으로 표시됐을 수 있음.
- **캐시 동기화**: PRECACHE_URLS의 `?v=12` → `?v=23` (8개 JS), `index.html` 스크립트 태그 `?v=21` → `?v=23` (8개), `CACHE_VERSION` → `v23`. 3곳 통일.

### 발견
- **PRECACHE가 그동안 무용했음** — 페이지가 `?v=21` 요청하는데 캐시에 `?v=12`로 박혀 있어서 매번 fetch 후 재캐싱. 정상화.

---

## 12.6. v23 — 추억 모드 (Memories slideshow)

### 작업 (같은 commit)
- 트립 메뉴에 "🎞️ 추억 모드" 추가
- `#memories-overlay` 풀스크린 모달 ([index.html](index.html#L812) CSS + #L1821 HTML)
- `openMemoriesSheet()` → `buildMemorySlides()` 가 자동 큐레이션:
  1. **Cover**: 트립명 + 기간 + 커버사진 배경 + Day/항목 수
  2. **Diary entries** (각 entry당 1슬라이드, 클라우드 로그인 시): 날짜 + 날씨/기분 + 하이라이트 + 본문 + 사진 그리드
  3. **Checks summary**: N/M 완료 + 퍼센트 + ⭐ 하이라이트 완료 항목 리스트
  4. **Expenses summary** (지출 있을 때): 총합 + 카테고리별 (로컬 expenses 우선, 비면 Cloud.expenses)
  5. **Closing**: 종료일 지났으면 "🌅 잘 다녀왔어요 / 다음은 어디로?", 진행 중이면 "✨ 진행 중 / 다이어리 한 줄 추천"
- 6초 자동 진행 + 도트 인디케이터 progress fill (Instagram Story 스타일)
- 좌/우 화면 절반 탭으로 prev/next, ⏸ 일시정지 토글, ESC 닫기 (우선순위 최상위)
- 추억이 없으면 ("📭 아직 추억이 없어요" + 안내) 빈 상태 표시

### 의도
- 도쿄 출발 D-3 시점에 미리 만들어두면 여행 끝나자마자 즉시 가치 (다이어리·체크가 차오를수록 풍성해짐)

---

## 13. 도쿄 출발 D-4 — 폰 검증 체크리스트 (당시 남긴 것)

> v21 시점에서 사용자에게 남긴 권장 사항. 현재 시점(2026-05-22)에 일부는 완료됐을 수 있음.

- [ ] 앱 닫고 다시 열기 → v21 자동 업데이트 ("🔄 새 버전" 배너 → 새로고침)
- [ ] GCP 두 API 활성화 + 새 키 발급 → 운영자 키로 등록
- [ ] 회원가입 → 도쿄 트립 클라우드 동기화
- [ ] 트립 메뉴 → 📦 오프라인 지도 받기 (도쿄 권역)
- [ ] 비행기 모드 켜고 지도 열어서 오프라인 동작 확인 (📡 오프라인 배너 떠야 정상)
- [ ] 트립 메뉴 → 🖼️ 커버 사진 설정 → 도쿄 풍경 한 장

---

## 14. 다음 후보 (당시 제안, 미실행)

| 항목 | 효용 |
|---|---|
| 🎞️ 추억 모드 | 트립 종료 후 자동 슬라이드쇼 (다이어리+체크+지출 요약) |
| 27개 유럽 도시 lodgings 시드 | 노션 도시 DB 기반 (Europe 트립용) |
| Places autocomplete | 새 item 입력 시 Google Places 자동완성 |
| 진행률 위젯 → 푸시 알림 | "오늘 5개 중 3개 완료, 2개 남음" |
| 9개국 정보 별도 화면 | 톨게이트·마트·콘센트 reference 뷰 |

---

## 부록 — 캐시 갱신 함정 (반복 발견)

여러 차례 같은 버그로 시간을 잃었음. 정리:

**증상**: 코드를 바꿨는데 브라우저에 옛 동작이 그대로 보임.

**원인**: SW가 옛 캐시를 서빙. HTTP 캐시도 거듦.

**해결 (반드시 동시 갱신)**:
1. `sw.js` 의 `CACHE_VERSION` (`v21` → `v22`)
2. `sw.js` 의 `PRECACHE_URLS` 안 모든 `?v=NN`
3. `index.html` 의 `<script src="js/xxx.js?v=NN">` 전부

한 곳이라도 어긋나면 일부 파일이 옛 버전으로 캐시 됨. 디버깅 1순위 의심.
