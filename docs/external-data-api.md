# 대기질·날씨 API

API 키는 브라우저에 전달하지 않고 Next.js 서버의 `.env`에만 둔다.

```env
AIRKOREA_API_KEY="공공데이터포털 인증키(Encoding)"
KMA_API_KEY="공공데이터포털 인증키(Encoding)"
```

## 기상청 단기예보

```http
GET /api/weather?regionId=7
```

`regionId` 요청 결과는 `weather_snapshots`에 저장한다. 같은 지역을 30분 안에 다시
요청하면 외부 API를 재호출하지 않고 저장된 최신 스냅샷을 반환한다. 응답의 `cache`는
첫 호출에서 `miss`, 캐시 사용 시 `hit`이다.

응답 예시:

```json
{
  "data": {
    "source": "KMA",
    "region": "대구",
    "grid": { "nx": 89, "ny": 91 },
    "forecastAt": "202609030900",
    "temperatureC": "26",
    "precipitationProbability": "30",
    "precipitationType": "0",
    "sky": "4"
  }
}
```

## 에어코리아 시도별 대기질

```http
GET /api/air-quality?regionId=7
```

측정소별 PM10·PM2.5 목록을 반환한다. `AIRKOREA_API_KEY`가 없으면 HTTP 503과
`API_KEY_NOT_CONFIGURED` 오류를 반환한다.

## 공통 오류

```json
{
  "error": {
    "code": "REGION_REQUIRED",
    "message": "region 파라미터가 필요합니다."
  }
}
```

| HTTP 상태 | 의미 |
|---:|---|
| 400 | 지역 누락 또는 지원하지 않는 지역 |
| 502 | 공공데이터 API 연결·응답 오류 |
| 503 | 서버 환경변수에 API 키가 없음 |
| 500 | 예상하지 못한 서버 오류 |

## 문화행사

```http
GET /api/cultural-events?dtype=전시&keyword=대구
```

`dtype` 허용값은 `연극`, `뮤지컬`, `오페라`, `음악`, `콘서트`, `국악`, `무용`,
`전시`, `기타`이다. 문화포털 원본 API가 지역 필터를 별도로 제공하지 않으므로 지역명은
`keyword`에 전달한다.

## 대구 주차정보

```http
GET /api/parking?district=수성구
```

대구광역시 9개 구·군만 지원하며 주차장명, 주소, 전체 면수, 요금과 실시간 정보 지원
여부를 반환한다.

## 지역 전달 규격

프론트는 지역 선택 후 지역명 대신 `regions.id`를 `regionId`로 전달한다. ID를 사용하면
동명이인 지역 문제를 피하고 DB의 FK와 바로 연결할 수 있다. 시·군·구를 선택하면 서버가
상위 시·도 이름으로 변환하여 공공데이터 API를 호출한다.

기존 `region=대구` 방식도 개발 테스트 호환을 위해 지원하지만 신규 프론트 코드에서는
`regionId`를 사용한다.
