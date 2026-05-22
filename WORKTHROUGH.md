# Travel PWA — 워크스루 (세션 인계 로그)

> **이 문서의 목적**
> Claude 세션이 끊겨도 다른 세션에서 컨텍스트를 잃지 않고 이어 작업할 수 있게 하는 단일 인계 문서.
> 모든 Claude 세션은 시작 시 이 문서를 읽고, 의미 있는 작업이 끝나면 맨 아래 **세션 로그**에 한 줄 이상을 추가한다.
> 세부 규칙은 [CLAUDE.md](CLAUDE.md) 참고.

---

## 1. 한눈에 보는 현재 상태 (2026-05-22 기준)

- **앱 정체성**: 도쿄 → 유럽 60일까지 커버하는 **멀티트립 오프라인 PWA**.
- **현재 버전**: `v26` (SW `CACHE_VERSION`, `index.html` 쿼리스트링과 일치 필요)
- **배포**: GitHub Pages, `main` 브랜치 root. 푸시하면 자동 반영.
- **호스팅 URL**: GitHub Pages (`<account>.github.io/<repo>/`) — 정확한 URL은 git remote 참고.
- **데이터**: 로컬 IndexedDB가 source of truth, Supabase는 로그인 시 미러 동기화.
- **포맷**: 빌드 도구 없음. 순수 HTML/CSS/ES2020. `?v=NN` 쿼리로 캐시 버스팅.

### 동작 검증된 핵심 시나리오
- 비행기 모드에서 앱 열기 → 모든 일정/지도/사진 표시
- 폰 홈화면에 설치 → 네이티브 앱처럼 standalone 실행
- 여러 여행 동시 관리 (도쿄, 유럽 등) + 여행 간 전환
- 로그인 없이도 로컬에서 전부 동작, 로그인 시 클라우드와 자동 동기화

---

## 2. 파일 구조 & 책임

```
travel/
├── index.html          5118줄. 단일 SPA 셸. 모든 UI/라우팅/상태가 여기.
├── manifest.json       PWA 메타데이터 (아이콘, theme, standalone)
├── sw.js               Service Worker. CACHE_VERSION + PRECACHE_URLS 관리.
├── .nojekyll           GitHub Pages용
├── js/
│   ├── seed.js         초기 여행 데이터 (도쿄, 유럽 60일 등)
│   ├── db.js           IndexedDB 래퍼 — window.TripDB.{init, trips, state, settings}
│   ├── ai.js           Claude API 호출 (day-fill, 일정 생성 등)
│   ├── supabase-config.js  공개키 (RLS로 보호)
│   ├── cloud.js        Supabase 클라이언트 래퍼 — window.Cloud
│   ├── sync.js         로컬 ↔ 클라우드 동기화. window.Sync
│   ├── notion-zip.js   Notion export ZIP 임포터
│   ├── maps.js         Google Maps + Leaflet OSM fallback, Day 폴리라인, 미니맵
│   └── emergency.js    countryCode 기반 비상정보 (응급/영사관/카드분실) — v25
├── icons/              icon.svg(마스터) + maskable + 192/512 PNG + apple-touch + favicon
├── scripts/            아이콘 생성 등 빌드 보조 (Python)
└── _archive/           v1 시절 백업 (index.v1.html 등) — 삭제 금지
```

### 외부 의존성
- **Supabase** (`js/supabase-config.js`의 URL/publishable key. RLS로 권한 통제)
- **Google Maps JS API** (`js/maps.js`. 키 없으면 Leaflet OSM으로 자동 fallback)
- **Anthropic API** (`js/ai.js`. 운영자 키 중앙 관리 — v13 참고)
- **외부 API**: 날씨, 환율 (SW에서 Network First → 캐시 fallback)

---

## 3. 데이터 모델 (IndexedDB)

`travel-app` DB, version 1, 3개 스토어:

| 스토어 | keyPath | 내용 |
|---|---|---|
| `trips` | `id` | 여행 정의 — `id`, `title`, `dates`, `days[]`, `lodgings[]`, `reservations[]`, `cover`, `tips` |
| `tripState` | `tripId` | 사용자별 동적 상태 — `checked{}`, `memos{}`, `expenses{}`, `photos{}`, `diary{}` |
| `settings` | `key` | 앱 전역 설정 (테마, 활성 trip, 프로필 등) |

클라우드 동기화 시 로컬 `id` (예: `"tokyo-2026-05"`) 유지, 별도 `cloud_id`(UUID)로 매핑.

---

## 4. 버전 히스토리

상세 디테일은 [SESSION_HISTORY.md](SESSION_HISTORY.md) (v1~v21 사용자 요청·결정·구현 기록).
빠른 요약은 아래 + `git log --oneline`:

| 버전 | 핵심 변경 |
|---|---|
| v1   | Claude.ai 웹에서 단일 `tokyo.html`로 시작 → PWA 변환 (manifest/sw/icons) |
| v1.0 | 멀티트립 + AI + Supabase 백엔드 도입 (구조적 리팩토링) |
| v3–7 | 공유, 클라우드 expenses/packing, Notion 임포트, 데스크탑 사이드바 |
| v10  | Notion ZIP, 인라인 맵, Realtime, Storage, 숙소/예약, 부모 가이드 |
| v11  | 사진 렌더 + 예약/숙소 편집 + Notion ZIP 청크 처리 |
| v12  | Google Maps JS API 통합 |
| v13  | 운영자 API 키 중앙화 (SaaS 형태) |
| v14  | 도쿄 좌표 + Day 폴리라인 + Leaflet OSM fallback |
| v15  | Day 미니맵, Day 필터, 오프라인 OSM 타일 프리페치 |
| v16  | 유럽 60일 seed + item 편집/추가 + AI fill empty day |
| v17  | Notion `2027_유럽 10000Km 여행` 페이지 → seed 반영 |
| v18  | 국가별 팁 reference + 벌크 AI day-fill |
| v19  | 여행 커버 사진 + 다이어리 UI |
| v20  | Now indicator + Day별 사진 갤러리 |
| v21  | 모바일 폴리시 — 모달/입력 수정 + SW 업데이트 프롬프트 + a11y |
| v22  | Sticky Now 바 (오늘 Day 상단 고정) + 시간 파싱 버그 수정 + 캐시 정돈 |
| v23  | 🎞️ 추억 모드 — 트립 종료 후 자동 슬라이드쇼 (커버·다이어리·체크·지출·클로징) |
| v24  | 🏙️ 노션 도시 후보 — 유럽 트립 메뉴에서 20개 도시 reference (역할 필터 + 노션 deep link). openTrip seed merge 로직 추가 |
| v25  | 🆘 비상정보 (12개국+한국, 응급/영사관/카드분실) + ↗ 1일치 일정 공유 (Web Share API + 클립보드 fallback) |
| v26  | 자율 polish — tripCountdown "N/M일차" + "N일 전 종료" + D-Day 우선순위 정리. v22~v25 stress test 통과 |

---

## 5. 로컬 개발 / 검증

```powershell
# 로컬 서버 (SW는 file:// 에서 등록 안 됨, 반드시 http로)
cd D:\GoogleDrive\Dev\travel
python -m http.server 8766
# → http://localhost:8766/index.html
```

`.claude/launch.json`에 동일 설정 있음.

### 변경 후 체크리스트
1. `sw.js`의 `CACHE_VERSION` 올렸나? (`v21` → `v22`)
2. `PRECACHE_URLS`의 `?v=NN`과 `index.html`의 스크립트 태그 `?v=NN` 일치하나?
3. 비행기 모드로 켜봐서 오프라인 동작 확인했나?
4. 폰 Chrome에서 SW 업데이트 프롬프트 떴을 때 새로고침 → 변경사항 반영되나?

---

## 6. 배포

```powershell
cd D:\GoogleDrive\Dev\travel
git add .
git commit -m "vNN: 변경 요약"
git push
# GitHub Pages 자동 빌드 (1~2분)
```

`main` 브랜치 root가 GitHub Pages의 publish source.

---

## 7. 알려진 이슈 / TODO

> 새 세션은 여기에 발견한 이슈를 추가하고, 해결한 항목은 줄에 ✅를 붙여 처리.

- (없음 — 새 세션이 발견하면 여기 추가)

---

## 8. 의사결정 로그 (왜 그렇게 했는가)

- **APK/네이티브 빌드 안 함** — 본인 폰 위주, PWA로 90% 커버. 필요해지면 PWABuilder TWA 경로.
- **빌드 도구 없음** — 단순성 우선. 캐시 버스팅은 `?v=NN` 쿼리.
- **로컬 first, 클라우드 미러** — 비행기에서도 동작이 1순위. 로그인은 옵셔널.
- **Supabase publishable key 커밋 OK** — RLS로 권한 통제. 절대 노출 금지는 **service_role 키**.
- **`_archive/` 유지** — v1 시절 백업. 회귀 시 비교용.
- **`index.html` 단일 거대 파일** — 5000줄 넘지만 의도적. 빌드 없이 1파일 = 캐시/배포 단순.

---

## 9. 세션 로그

> **포맷**: `### YYYY-MM-DD — 한 줄 요약`
> 그 아래 2~6줄로:
> - 무엇을 했는지 (커밋 해시 인용 OK)
> - 왜 했는지 (사용자가 명시한 이유)
> - 다음 세션이 알아야 할 잔여 작업 / 함정
>
> **앞에 쓴 항목을 지우지 말 것.** 이 파일은 append-only 로그.

### 2026-05-22 — 워크스루/세션 인계 체계 도입
- 사용자가 다른 Claude 세션에서도 컨텍스트 끊김 없이 이어 작업할 수 있게 `WORKTHROUGH.md` (이 파일) 와 `CLAUDE.md` (세션 시작 시 자동 로드되는 지침) 도입.
- 현재 상태(v21)를 스냅샷으로 박아둠. 파일 구조, 데이터 모델, 버전 히스토리, 배포 절차 정리.
- **다음 세션 주의**: 작업 시작 시 이 문서 §1~§7을 먼저 읽고, 종료 시 §9에 한 항목 추가. 규칙은 `CLAUDE.md` 참고.

### 2026-05-22 — 원본 채팅 로그 → SESSION_HISTORY.md 로 정돈
- 사용자가 보관 중이던 `새 텍스트 문서.txt` (Claude.ai 웹 대화 raw paste)를 `SESSION_HISTORY.md` 로 재구조화.
- v1 PWA 시작 → v21 모바일 폴리시까지 14개 섹션 (초기 구상, 각 버전별 사용자 요청·결정·구현·결과, 캐시 갱신 함정 부록 포함).
- §4 버전 히스토리에서 `SESSION_HISTORY.md` 로 링크.
- 원본 `새 텍스트 문서.txt`는 사용자 확인 후 삭제 완료 (정돈본인 `SESSION_HISTORY.md`만 유지).

### 2026-05-22 — v22+v23 한 커밋 (Sticky Now 바 + 추억 모드)
- **v22 (sticky-now)**: 오늘 Day일 때 topbar 아래 sticky 띠 — `🔵 현재시각 / 다음 N항목 / ETA / 진행률 N/M`. 1분마다 자동 갱신.
- **v22 (parse 버그)**: `parse("10:58")` 이 658 대신 68 반환하던 reduce 버그 수정 ([index.html](index.html) `renderTimeline`). Now 인디케이터 + sticky-now 둘 다 영향.
- **v22 (캐시 정돈)**: PRECACHE_URLS `?v=12`→`?v=23`, index.html 스크립트 `?v=21`→`?v=23`, `CACHE_VERSION` v23. 3곳 동시.
- **v23 (추억 모드)**: 트립 메뉴 "🎞️ 추억 모드" → 풀스크린 슬라이드쇼 (cover → diary entries → checks summary → expenses summary → closing). 6초 자동, 좌우 탭, 일시정지, ESC 닫기. 트립 종료 후뿐 아니라 진행 중에도 미리보기 가능.
- 검증: 모바일 375×812에서 sticky 36px 정상, 추억 슬라이드 4개 (도쿄 비로그인 시 cover/checks/expenses/closing — diary는 클라우드 only), 콘솔 에러 0.
- **다음 세션 주의**: v24 (27개 도시 lodgings 시드)는 SESSION_HISTORY §14에 적힌 그대로 보류 — 노션 `유럽_도시 DB` (15fc3011...) + `숙박전용` relation 쿼리 필요. 도쿄 여행 후 진행.

### 2026-05-22 — v24 노션 도시 후보 (유럽 트립 보강)
- 원래 v24 "27개 lodgings 시드"는 노션 숙박전용 DB가 거의 비어있고(1행), 23개 도시를 빈 lodging row로 박는 게 사용자 부담 큼.
- 대신 country_tips 패턴 따라 **트립 메뉴 "🏙️ 노션 도시 후보"** 모달로 전환. 20개 도시 (스페인 17 + 지블롤터 + 프랑스 + 슬로베니아), 역할별 필터 (베이스캠프/경유지/반나절), 카드 탭하면 노션 페이지 deep link 열림.
- `openTrip()` 시 seed의 `notion_metadata`를 트립 객체에 머지하는 라인 추가 — 트립이 IndexedDB에 옛 데이터로 박혀있어도 최신 seed reference 데이터(country_tips, notion_cities 등)는 자동 반영. 사용자 편집은 보존 (trip 값이 seed 덮음).
- 검증: 모바일 375×812에서 20개 카드, 필터 4개 (전체 20 / 베이스캠프 5 / 경유지 4 / 반나절 11), ESC 닫힘, country-tips 회귀 없음, 콘솔 에러 0.
- **함정 발견**: 페이지 캐시 갱신이 SW unregister + caches.delete만으로 안 됨. `window.location.replace('...?nocache=...')`로 강제 navigate해야 새 코드 로드. v22~23 검증 때 같은 패턴 사용해도 비슷한 함정 가능.

### 2026-05-22 — v25 비상정보 카드 + 1일치 공유
- **🆘 비상정보** (트립 메뉴): `js/emergency.js` 신규 — 12개국 (JP·FR·ES·PT·IT·CH·AT·HU·CZ·GB·GI·SI) 응급/경찰/소방 번호 + 한국 대사관/영사관 전화·주소·24h emergency 번호 + 한국 공통 (영사 콜센터·해외안전여행) + 13개 카드 분실신고 (현대·신한·KB·삼성·하나·롯데·BC·NH·우리·씨티·트래블월렛·VISA·MC). 전부 `tel:` 링크라 폰에서 한 탭으로 전화.
- **↗ 1일치 공유** (Day 헤더 우측 상단 버튼): `shareCurrentDay()` — Web Share API 우선 (모바일에서 시스템 공유 시트 → 카톡 선택), 실패 시 클립보드 복사 fallback. 텍스트 포맷: `📅 DAY N · 날짜 / 🎯 테마 / 시간·아이콘·제목·서브 · 메모 첫줄`.
- 캐시 v25 통일, sw.js PRECACHE에 emergency.js 추가.
- 검증: 도쿄 트립 → 2 섹션 (🇯🇵 일본 + 🇰🇷 한국 공통), 22개 tel 링크, 1일치 공유 텍스트 정상 포맷.
- **함정 없음**, 콘솔 에러 0.

### 2026-05-22 — v26 자율 polish (5라운드 후 안정화)
- 모바일 375×812에서 14개 트립 메뉴 항목 click-through, Day 탭 전환, 체크리스트 뷰 전환 — **전부 정상, 가로 오버플로 없음, 콘솔 에러 0**. v22~v25에 새로 추가한 기능들이 깨끗하게 통합됨.
- 발견된 진짜 issue 1개 — `tripCountdown` 라벨 정리:
  - 기존: "여행 중" / "${dFromEnd}일 후" (애매함)
  - 개선: "여행 중 · N/M일차" / "${dFromEnd}일 전 종료" / "D-Day 🎉" 우선순위 최상
- 검증: D-Day 1일/다일, 여행 중 3/6일차, D-3, 4일 전 종료 모두 정상.
