# 장소 평점/리뷰 및 분위기(mood) 데이터 소스 조사

조사일: 2026-09-07
조사 목적: 장소 상세 카드에 (1) 평점/리뷰수/리뷰 텍스트, (2) 분위기 태그(예: "조용한 분위기")를 **실존하는 데이터**로만 추가할 수 있는지 확인. 데이터가 없으면 조작하지 않고 비워둔다는 프로젝트 원칙 하에 조사.

현재 코드베이스 참고: `src/lib/services/places.ts`는 카카오 로컬 "키워드로 장소 검색" (`/v2/local/search/keyword.json`)만 사용 중이며, 소비 필드는 `id, place_name, category_name, road_address_name, address_name, phone, place_url, x, y`.

---

## 1. 카카오 로컬 API (Kakao Local API)

- **공식 문서**: https://developers.kakao.com/docs/latest/ko/local/dev-guide (요청 시 `http://developers.kakao.com/docs/ko/local/dev-guide` 로 302 리다이렉트됨 — 리다이렉트된 페이지에서 실제 스키마 확인)
- **인증 방식**: REST API 키 발급 필요(카카오 개발자 앱 등록). 요청 헤더에 `Authorization: KakaoAK ${REST_API_KEY}` 포함. 앱 등록 자체는 무료.
- **무료 쿼터**: 이 페이지에는 정확한 일일/월간 호출 한도가 나와 있지 않고, 별도 "[쿼터]" 섹션(`/docs/ko/getting-started/quota`)을 참조하라고만 되어 있음 — 해당 별도 페이지는 이번 조사에서 직접 확인하지 못함. (참고: 현재 코드가 이미 이 API를 프로덕션에서 쓰고 있으므로, 실제 한도는 카카오 개발자 콘솔의 앱 설정에서 확인 가능.)
- **응답 스키마(키워드 검색 `documents` 배열) 필드 (verbatim)**:
  `id`, `place_name`, `category_name`, `category_group_code`, `category_group_name`, `phone`, `address_name`, `road_address_name`, `x`, `y`, `place_url`, `distance`
- **평점/리뷰 필드**: **없음.** rating, review count, review text에 해당하는 필드가 스키마에 전혀 존재하지 않음.
- **분위기/테마 필드**: **없음.** `category_group_code`/`category_group_name`은 대분류 카테고리 코드(예: FD6=음식점, AT4=관광명소)일 뿐, 분위기·테마를 나타내지 않음.
- **커버리지**: 전국 대상 API. 대구 포함 (현재 프로젝트가 이미 대구 지역 검색에 이 API를 실사용 중이므로 확인됨).

**결론**: 카카오 로컬 API로는 평점/리뷰/분위기 데이터를 절대 얻을 수 없음. (참고로 카카오맵 웹/앱 페이지에는 사용자 평점·리뷰가 존재하지만, 이는 별도의 비공개 웹 서비스 데이터이며 공식 Local API로 노출되지 않음.)

---

## 2. 네이버 지역 검색 API (Naver Local Search API)

- **공식 문서**: https://developers.naver.com/docs/serviceapi/search/local/local.md (WebFetch 도구가 developers.naver.com에 직접 접근하지 못해, 프록시(r.jina.ai)를 경유해 같은 공식 문서 페이지 원문을 확인함)
- **인증 방식**: 네이버 개발자센터에서 애플리케이션 등록 필요, `Client ID`/`Client Secret`을 HTTP 헤더에 포함. 등록 자체 무료.
- **무료 쿼터**: 일 25,000회.
- **응답 필드 (verbatim, items 배열)**: `title`, `link`, `category`, `description`, `telephone`, `address`, `roadAddress`, `mapx`, `mapy`
  - 문서에 `telephone` 필드는 "값을 반환하지 않는 요소(하위 호환을 위해 유지)"라고 명시되어 있음 — 즉 사실상 죽은 필드.
- **평점/리뷰 필드**: **없음.** rating, review count, review text에 해당하는 필드 없음.
- **분위기/테마 필드**: **없음.** `category`는 업종 분류 문자열(예: "음식점>카페")일 뿐 분위기 정보 아님. `description`은 업체가 등록한 짧은 홍보 문구로, 구조화된 필드가 아니라 자유 텍스트.
- **커버리지**: 전국 대상. 대구 포함 여부는 문서에 지역 제한 명시가 없어 전국 서비스로 판단되나, 이번 조사에서 대구 지역 실제 검색 결과로 직접 검증하지는 못함.

**결론**: 네이버 지역 검색 API도 평점/리뷰/분위기 필드가 전혀 없음. 카카오와 사실상 동일한 한계.

---

## 3. 한국관광공사 TourAPI (data.go.kr / api.visitkorea.or.kr / TourAPI 4.0)

- **공식 문서**:
  - 공공데이터포털 소개 페이지: https://www.data.go.kr/data/15101578/openapi.do (한국관광공사_국문 관광정보 서비스_GW)
  - TourAPI 4.0 포털: https://gwapi.visitkorea.or.kr/ 및 https://api.visitkorea.or.kr/
  - **접근 제약**: `gwapi.visitkorea.or.kr`와 `api.visitkorea.or.kr`는 JS로 렌더링되는 SPA/Swagger UI라서, WebFetch로는 정적 HTML(타이틀 "한국관광콘텐츠랩"만)만 받아지고 실제 Swagger 스키마(엔드포인트별 정확한 필드 목록)를 이번 조사에서 직접 확인하지 못함. 아래 `detailIntro2` 필드 목록은 **TourAPI 구버전(1.0) 스펙을 그대로 파싱하는 아카이브된 서드파티 라이브러리**(github.com/JoMingyu/TourAPI, 2018년 아카이브됨)에서 가져온 것이며, `detailCommon2`/`detailIntro2`/`detailInfo2`(2.0/4.0 네이밍)의 필드명이 1.0과 대체로 호환되는 것으로 알려져 있으나 **공식 Swagger로 직접 대조 검증은 못 했음**. 실제 도입 전 반드시 `gwapi.visitkorea.or.kr`의 Swagger UI를 브라우저로 열어 최신 필드 스펙을 재확인할 것.
- **인증 방식**: 공공데이터포털에서 활용신청 필요(무료). 개발 단계는 자동승인, 운영 단계 전환 시 심의승인 필요.
- **무료 쿼터**: 개발계정 기준 일 1,000건. 운영 전환(활용사례 등록) 시 트래픽 증가 신청 가능.
- **응답 필드 (참고용, 미검증 경고 있음)**:
  - `detailCommon` 계열 (공통정보조회): `content_type_id`, `overview`(개요/설명 텍스트), `tel`, `tel_owner`, `homepage`(홈페이지), `in_book` 등
  - `detailIntro` 계열 (소개정보조회, 콘텐츠 타입별로 필드 상이): `info_center`(문의 전화), `open_date`, `open_time`, `rest_date`, `parking`, `restroom_info`, `baby_carriage`, `credit_card`, `pet`, `sale_item`, `scale`, `fair_day`, `guide` 등
  - `detailImages`: `origin`, `small`
- **평점/리뷰 필드**: 조사한 어떤 자료에도 rating, review count, review text에 해당하는 필드가 언급되지 않음 → **"필드 없음"으로 판단**하나, 위와 같이 최신 Swagger 스펙을 직접 열람하지 못했으므로 최종 확인은 필요.
- **분위기/테마 필드**: **직접적인 "mood/분위기" 필드는 없음.** 다만 `overview`(개요, 자유서술형 소개글)와 `guide`(안내), `sale_item`, `info_center` 등은 사람이 읽고 요약하면 분위기를 유추할 수 있는 **비구조화 자유 텍스트**임 — 즉 "직접 필드"가 아니라 "산문을 읽고 요약/추측해야 하는" 케이스임을 명확히 구분해야 함.
- **커버리지**: 전국 대상, 대구 포함 (설명에 "전국의 다양한 관광정보"로 명시). 관광지·문화시설 위주라 일반 상업시설(카페, 식당 등)은 데이터가 없거나 부실할 수 있음(TourAPI는 관광지/문화시설/숙박/음식점 등 콘텐츠 타입이 나뉘어 있고, 이 프로젝트가 다루는 장소 유형에 따라 커버리지 편차가 클 수 있음 — 별도 검증 필요).

**결론**: TourAPI에도 정형화된 평점/리뷰 필드는 없음. 분위기도 마찬가지로 필드가 아니라 자유 텍스트(overview)를 사람/LLM이 요약해야 하는 방식뿐 — 이는 "실제 데이터"가 아니라 "요약 추론"에 해당하므로, 프로젝트의 "조작 금지" 원칙상 이걸 그대로 "실제 분위기 데이터"라고 표시하면 안 됨(요약이라는 것을 명시하지 않는 한).

---

## 4. Google Places API (New) — Place Details

- **공식 문서**:
  - 필드 목록: https://developers.google.com/maps/documentation/places/web-service/place-details
  - 과금 방식: https://developers.google.com/maps/documentation/places/web-service/usage-and-billing
  - 정확한 SKU별 단가: https://developers.google.com/maps/billing-and-pricing/pricing
- **인증 방식**: Google Cloud 프로젝트 + API 키 필요, 결제 계정(신용카드) 등록 필수 (사용량이 무료 크레딧 이내여도 결제 정보 등록은 필요).
- **평점/리뷰 필드 (verbatim, SKU 구분)**:
  - **Place Details Enterprise SKU**: `rating`(평점), `userRatingCount`(리뷰 수), `websiteUri`
  - **Place Details Enterprise + Atmosphere SKU**: `reviews`(리뷰 텍스트 원문), `reviewSummary`(리뷰 요약), `editorialSummary`(편집 요약)
  - → **평점, 리뷰 수, 리뷰 텍스트 모두 실제 필드로 존재함.**
- **분위기/테마 관련 필드 (Enterprise + Atmosphere SKU)**: `allowsDogs`, `goodForChildren`, `goodForGroups`, `goodForWatchingSports`, `liveMusic`, `outdoorSeating`, `reservable`, `restroom`, `dineIn`, `takeout`, `delivery`, `curbsidePickup`, `paymentOptions`, `parkingOptions`, `servesBeer`/`servesWine`/`servesCoffee` 등 음식 서비스 옵션, `neighborhoodSummary`(주변 지역 요약), `generativeSummary`(AI 생성 요약)
  - 이 중 "조용한/활기찬" 같은 한국어 정성적 무드 태그에 직접 대응하는 필드는 없음. `liveMusic`, `outdoorSeating` 등 불리언 속성이나 `generativeSummary`/`reviewSummary`(자연어 요약, Google이 AI로 생성) 정도가 그나마 분위기 추론에 쓸만한 근거 데이터.
- **가격 (공식 pricing 페이지 확인, CPM = 1,000건당 USD)**:
  | 월 호출량 구간 | Enterprise (rating/userRatingCount 포함) | Enterprise + Atmosphere (reviews 포함) |
  |---|---|---|
  | ~100,000 | $20.00 | $25.00 |
  | 100,001~500,000 | $16.00 | $20.00 |
  | 500,001~1,000,000 | $12.00 | $15.00 |
  | 1,000,001~5,000,000 | $6.00 | $7.50 |
  | 5,000,000+ | $1.51 | $2.28 |
  - 즉 리뷰 텍스트까지 가져오려면 건당 약 $0.025 (첫 구간 기준).
  - **무료 크레딧**: usage-and-billing 문서에 "매월 $200 크레딧이 2025년 2월 28일까지 자동 적용"이라는 문구가 있음 — 즉 **이 $200 월 크레딧 정책은 이미 만료된 것으로 보임(2025-02-28 종료)**. 현재(2026-09) 시점 최신 무료 크레딧/무료 티어 정책은 이 페이지에서 명확히 확인하지 못했으며, Google Cloud 콘솔의 최신 청구 페이지에서 별도 확인 필요. → **유료 API로 간주하고 접근해야 함.**
- **한국/대구 커버리지**: Google Places는 전 세계 대상이며 한국 주요 도시(서울 등)는 리뷰 데이터가 상당히 축적되어 있으나, **대구 지역 관광지/문화시설의 리뷰 커버리지는 서울 대비 상대적으로 옅을 가능성이 높음** — 이번 조사는 문서 확인 위주였고 대구 특정 장소로 실제 API 응답을 테스트하지는 않았음(결제 계정 없이는 실호출 불가). 도입 전 실제 대구 장소 표본으로 커버리지 확인 필요.

**결론**: 조사한 4개 API 중 **평점·리뷰수·리뷰텍스트를 실제 정형 필드로 제공하는 곳은 Google Places API (New)뿐**. 단, 유료(건당 과금)이고 대구 지역 커버리지는 별도 검증 필요.

---

## 요약 표

| API | 인증/비용 | 무료 쿼터 | rating 필드 | review count 필드 | review text 필드 | mood/분위기 필드 | 대구 커버리지 |
|---|---|---|---|---|---|---|---|
| 카카오 로컬 | 무료(키 발급) | 문서상 미기재(별도 쿼터 페이지 미확인) | 없음 | 없음 | 없음 | 없음 | 확인됨(현재 사용 중) |
| 네이버 지역검색 | 무료(키 발급) | 25,000회/일 | 없음 | 없음 | 없음 | 없음 | 미확인(전국 서비스로 추정) |
| TourAPI (관광공사) | 무료(신청) | 1,000회/일(개발), 운영 시 증량 신청 | 없음(미확인 자료 기준) | 없음 | 없음 | 없음(자유 텍스트 `overview`만 존재, 요약 필요) | 명시("전국"), 콘텐츠 유형별 편차 있을 수 있음 |
| Google Places API (New) | 유료, 결제계정 필요 | 명확한 현재 무료 티어 미확인($200/월 크레딧은 2025-02-28 종료로 보임) | **있음** (`rating`) | **있음** (`userRatingCount`) | **있음** (`reviews`) | 직접 필드는 없음, `generativeSummary`/`reviewSummary`(자연어)가 근사치 | 미확인(전세계 서비스, 대구 표본 실측 필요) |

---

## 권장 사항

1. **평점/리뷰 데이터**: 카카오·네이버·TourAPI 세 곳 모두 정형 필드가 전혀 없다는 것이 문서상 명확히 확인됨. 유일하게 실제 데이터를 가진 곳은 **Google Places API (New)의 Enterprise/Enterprise+Atmosphere SKU**이지만, (a) 건당 과금(리뷰 포함 시 $22.5~$25/1,000건), (b) 결제 계정 등록 필요, (c) 대구 지역 커버리지 미검증이라는 세 가지 도입 장벽이 있음. 이 프로젝트가 예산·인프라상 유료 API 도입을 결정하지 않는 한, **평점/리뷰수/리뷰텍스트는 "데이터 소스 없음"으로 보고 UI에서 비워두는 것이 원칙에 맞음.** 도입한다면 Google Places API가 유일한 현실적 선택지이며, 최소한 대구 관광지 표본 몇 곳으로 실제 호출해 커버리지부터 확인한 뒤 비용 대비 가치를 판단해야 함.

2. **분위기(mood) 데이터**: 어떤 API에도 "mood"/"atmosphere" 같은 직접 필드는 없음. TourAPI의 `overview`(개요)나 Google의 `reviewSummary`/`generativeSummary`처럼 **자유 텍스트를 사람/LLM이 읽고 요약해야만 얻어지는 형태뿐**임. 이는 "실제 필드값"이 아니라 "생성/추론된 라벨"이므로, 프로젝트의 "실존 데이터만, 조작 금지" 원칙과 정확히 상충함. 만약 "조용한 분위기" 같은 태그를 붙이고 싶다면, 이는 사실상 새로운 데이터를 **생성(generate)**하는 것이지 외부 API에서 **가져오는(fetch)** 것이 아니므로, 반드시 "AI가 리뷰/설명을 요약해 추정한 태그"임을 UI에 명시해야 함 — 아무 API도 이 필드를 있는 그대로 제공하지 않음.

3. **결론**: 현재 시점에서는 두 기능 모두 "진짜 데이터 없음 → 비워둠"이 가장 낮은 리스크의 선택. 굳이 하나를 고른다면, 평점/리뷰는 Google Places API 유료 도입(비용·커버리지 검증 후)이 유일한 실데이터 경로이고, 분위기 태그는 애초에 어느 API에도 실존 필드가 없으므로 "제공하지 않음"으로 명확히 하는 것을 권장함.

---

## 조사 한계 (투명성 고지)

- 카카오 로컬 API의 정확한 쿼터 수치는 별도 "쿼터" 문서 페이지를 직접 열람하지 못해 확인 못함.
- TourAPI 4.0의 `detailCommon2`/`detailIntro2`/`detailInfo2` 정확한 필드 스펙은 공식 Swagger UI(`gwapi.visitkorea.or.kr`)가 JS 렌더링 SPA라 WebFetch로 열람이 안 되어, 2018년에 아카이브된 서드파티 라이브러리(TourAPI 1.0 기준)를 참고 자료로 대체함. **실제 도입 전 반드시 브라우저로 Swagger UI를 직접 열어 최신 필드명을 재확인할 것.**
- 네이버 지역 검색 API는 프록시(r.jina.ai)를 경유해 공식 문서 원문을 확인했음(직접 fetch는 차단됨).
- Google Places API의 "무료 월 크레딧" 최신 정책은 확인한 페이지에 2025-02-28 종료 문구만 있어 2026-09 현재 유효한 무료 티어 여부는 불확실 — 실제 도입 시 Google Cloud Console에서 최신 청구/무료 크레딧 정책을 재확인 필요.
- 모든 API의 "대구 지역 커버리지"는 카카오(현재 프로덕션 사용 중이라 확인됨)를 제외하고는 문서상의 "전국 서비스" 서술에 의존했으며, 실제 대구 표본 호출 테스트는 수행하지 않음(TourAPI/네이버는 무료지만 이번 조사 범위를 벗어남, Google은 결제 계정이 없어 호출 불가).
