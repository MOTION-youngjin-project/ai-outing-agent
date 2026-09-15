# Codex 기능 통합 브랜치 안내

이 브랜치는 2026-09-15 기준 최신 `origin/develop`(`1fa39d1`)에서 분기해 최근 Codex 작업 네 가지를 한 번에 검토할 수 있도록 통합한 브랜치다.

- 브랜치: `feature/codex-updates-bundle`
- 병합 대상: `develop`
- `main`에는 직접 병합하거나 푸시하지 않는다.

## 포함된 기능

| 기능 | 사용자 동작 | 주요 구현 |
|---|---|---|
| 추천 장소 상세 매칭 복구 | 상세보기가 없는 장소에서 `다시 찾기` 후 후보 선택 | 장소명·주소·좌표 점수 비교, 복수 후보 선택, 추천 결과 갱신 |
| 장소 생활정보 검색 | 상세 화면에서 생활정보 버튼 선택 | 네이버 웹문서에서 주차·셔틀·휴무·예약 등을 지연 조회, 규칙 우선 추출, 필요할 때만 Gemini 사용, 7일 DB 캐시 |
| 메인 시간별 날씨 | 메인 상단 날씨 배지 선택 | 기존 기상청 단기예보 응답에서 앞으로 최대 12시간의 온도·날씨·강수확률 표시, 추가 외부 호출 없음 |
| 장소 유형별 주변 추천 | 추천 카드에서 주변 장소 펼치기 | 관광지는 식당·카페·소품점, 음식점은 공원·산책로·카페 추천, 거리·예상 도보시간 표시 |

## 배포 전 설정

생활정보 검색을 사용하려면 배포 환경에 다음 값을 입력한다. 값은 저장소에 커밋하지 않는다.

```env
NAVER_SEARCH_CLIENT_ID=
NAVER_SEARCH_CLIENT_SECRET=
```

기존 `KAKAO_API_KEY`, `DATA_GO_KR_API_KEY`, `GEMINI_API_KEY`, `DATABASE_URL`도 필요하다. `GEMINI_API_KEY`가 없으면 생활정보의 AI 구조화를 건너뛰고 규칙 추출만 사용한다.

DB에는 `place_life_info_caches` 테이블이 추가된다. 배포 전에 Prisma 마이그레이션을 적용해야 한다.

```powershell
npx prisma migrate deploy
```

## 관리자 검토 순서

1. `develop...feature/codex-updates-bundle` 변경 파일을 확인한다.
2. 환경변수와 DB 마이그레이션 적용 가능 여부를 확인한다.
3. `npm ci`, 검사 스크립트, `npm run lint`, `npm run build`를 실행한다.
4. 배포 키가 있는 환경에서 실제 장소 상세 복구, 네이버 생활정보, 시간별 날씨, 음식점 주변 산책 추천을 확인한다.
5. 문제가 없으면 `develop` 대상 PR을 만들고 리뷰한다.
6. 저장소 규칙에 따라 작업자에게 완료 여부를 확인한 뒤에만 병합한다.

## AI 검토용 프롬프트

아래 내용을 관리자 AI 코딩 도구에 그대로 전달할 수 있다.

```text
이 저장소의 AGENTS.md와 CONTRIBUTING.md를 먼저 읽어라.
feature/codex-updates-bundle 브랜치를 최신 develop과 비교해 검토하라.

검토 대상은 다음 네 기능이다.
1. 추천 장소 상세 매칭 복구: 장소명·주소·좌표 비교, 복수 후보 선택, 실패 안내와 다시 찾기
2. 장소 생활정보 검색: 지연 조회, 네이버 검색 1회, 규칙 추출 우선, 선택적 Gemini, DB 캐시와 출처 표시
3. 메인 시간별 날씨: 날씨 배지 클릭, 최대 12시간 온도·날씨·강수확률, 기존 기상청 호출 재사용
4. 장소 유형별 주변 추천: 관광지→식당/카페/소품점, 음식점→공원/산책/카페, 거리와 예상 도보시간

특히 API 호출량, AI 토큰 제한, 캐시 만료, 입력 검증, 잘못된 장소 연결, 공유 추천의 수정 권한,
외부 URL 처리, Prisma 마이그레이션, 기존 추천·상세·날씨 화면 회귀 여부를 확인하라.

다음 명령을 실행하고 결과를 표로 보고하라.
- npx tsx scripts/place-match-recovery-check.ts
- npx tsx scripts/life-info-check.ts
- npx tsx scripts/hourly-weather-check.ts
- npx tsx scripts/nearby-check.ts
- npm run lint
- npm run build

문제를 발견하면 심각도, 파일, 원인, 수정안을 제시하라. 승인 없이 main이나 develop에 직접 푸시하거나 병합하지 마라.
README-CODEX-UPDATES.md와 docs/place-match-recovery.md, docs/life-info-search.md,
docs/hourly-weather-detail.md, docs/contextual-nearby.md도 함께 읽어라.
```

## 세부 문서

- `docs/place-match-recovery.md`
- `docs/life-info-search.md`
- `docs/hourly-weather-detail.md`
- `docs/contextual-nearby.md`
