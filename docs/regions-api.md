# 지역 API

로컬 기본 주소: `http://localhost:3000`

## 지역 목록 조회

`GET /api/regions`

선택적 쿼리 파라미터:

| 이름 | 형식 | 설명 | 예시 |
|---|---|---|---|
| `level` | `sido`, `sigungu`, `eupmyeondong` | 행정구역 단계 | `level=sigungu` |
| `parentId` | 양의 정수 | 특정 상위 지역의 하위 지역 | `parentId=1` |
| `search` | 1~100자 문자열 | 지역명 부분 검색 | `search=수성` |

파라미터는 함께 사용할 수 있다.

```http
GET /api/regions?level=sigungu&parentId=1&search=구
```

성공 응답:

```json
{
  "count": 1,
  "data": [
    {
      "id": "7",
      "parentId": "1",
      "regionCode": "27260",
      "name": "수성구",
      "level": "sigungu",
      "latitude": null,
      "longitude": null,
      "createdAt": "2026-09-01T00:00:00.000Z"
    }
  ]
}
```

## 지역 상세 조회

`GET /api/regions/{id}`

상위 지역과 하위 지역 목록을 함께 반환한다.

```http
GET /api/regions/1
```

성공 응답 구조:

```json
{
  "data": {
    "id": "1",
    "name": "대구광역시",
    "parent": null,
    "children": []
  }
}
```

## 오류 응답

모든 오류는 동일한 구조를 사용한다.

```json
{
  "error": {
    "code": "INVALID_PARENT_ID",
    "message": "parentId는 양의 정수여야 합니다."
  }
}
```

| HTTP 상태 | 코드 | 조건 |
|---:|---|---|
| 400 | `INVALID_LEVEL` | 지원하지 않는 `level` |
| 400 | `INVALID_PARENT_ID` | `parentId`가 양의 정수가 아님 |
| 400 | `INVALID_SEARCH` | 검색어가 100자를 초과함 |
| 400 | `INVALID_REGION_ID` | 상세 경로의 ID가 양의 정수가 아님 |
| 404 | `REGION_NOT_FOUND` | 해당 ID의 지역이 없음 |
| 500 | `INTERNAL_ERROR` | 서버 또는 DB 오류 |

## 프론트 호출 예시

```ts
const response = await fetch("/api/regions?parentId=1");
const body = await response.json();

if (!response.ok) {
  throw new Error(body.error.message);
}

const regions = body.data;
```
