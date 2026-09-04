const errorResponse = {
  description: "요청 오류 또는 서버 오류",
  content: {
    "application/json": {
      schema: { $ref: "#/components/schemas/Error" },
    },
  },
};

const regionParameters = [
  {
    name: "regionId",
    in: "query",
    description: "regions 테이블의 지역 ID (region과 둘 중 하나 사용)",
    schema: { type: "integer", minimum: 1, example: 7 },
  },
  {
    name: "region",
    in: "query",
    description: "호환용 지역명. 신규 프론트엔드는 regionId 사용 권장",
    schema: { type: "string", example: "대구광역시" },
  },
];

export const openApiDocument = {
  openapi: "3.1.0",
  info: {
    title: "AI Outing Agent API",
    version: "0.1.0",
    description: "나들이 추천 서비스의 지역·날씨·대기질·문화행사·주차·AI API 명세",
  },
  servers: [{ url: "/", description: "현재 실행 중인 서버" }],
  tags: [
    { name: "기준 데이터" },
    { name: "외부 데이터" },
    { name: "AI" },
  ],
  paths: {
    "/api/data-sources": {
      get: {
        tags: ["기준 데이터"],
        summary: "데이터 제공처 목록 조회",
        responses: {
          "200": { description: "조회 성공", content: { "application/json": { schema: { $ref: "#/components/schemas/DataSourceListResponse" } } } },
          "500": errorResponse,
        },
      },
    },
    "/api/regions": {
      get: {
        tags: ["기준 데이터"],
        summary: "지역 목록 조회",
        parameters: [
          { name: "level", in: "query", schema: { type: "string", enum: ["sido", "sigungu", "eupmyeondong"] } },
          { name: "parentId", in: "query", schema: { type: "integer", minimum: 1 } },
          { name: "search", in: "query", schema: { type: "string", maxLength: 100 }, example: "수성" },
        ],
        responses: {
          "200": { description: "조회 성공", content: { "application/json": { schema: { $ref: "#/components/schemas/RegionListResponse" } } } },
          "400": errorResponse,
          "500": errorResponse,
        },
      },
    },
    "/api/regions/{id}": {
      get: {
        tags: ["기준 데이터"],
        summary: "지역 상세 조회",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer", minimum: 1 }, example: 7 }],
        responses: {
          "200": { description: "조회 성공. 상위 및 하위 지역 포함" },
          "400": errorResponse,
          "404": errorResponse,
          "500": errorResponse,
        },
      },
    },
    "/api/weather": {
      get: {
        tags: ["외부 데이터"],
        summary: "단기예보 조회",
        description: "기상청 데이터를 조회하며 regionId 사용 시 결과를 DB에 저장하고 30분간 캐시합니다.",
        parameters: regionParameters,
        responses: { "200": { description: "조회 성공" }, "400": errorResponse, "503": errorResponse, "500": errorResponse },
      },
    },
    "/api/air-quality": {
      get: {
        tags: ["외부 데이터"],
        summary: "실시간 대기질 조회",
        description: "AirKorea PM10 평균을 DB에 저장하고 1시간 캐시합니다. 외부 호출 실패 시 이전 스냅샷을 stale 상태로 반환합니다.",
        parameters: regionParameters,
        responses: {
          "200": { description: "조회 성공", content: { "application/json": { schema: { $ref: "#/components/schemas/AirQualityResponse" } } } },
          "400": errorResponse,
          "404": errorResponse,
          "502": errorResponse,
          "503": errorResponse,
          "500": errorResponse,
        },
      },
    },
    "/api/cultural-events": {
      get: {
        tags: ["외부 데이터"],
        summary: "문화행사 검색",
        parameters: [
          { name: "dtype", in: "query", required: true, schema: { type: "string", enum: ["연극", "뮤지컬", "오페라", "음악", "콘서트", "국악", "무용", "전시", "기타"] }, example: "전시" },
          { name: "keyword", in: "query", schema: { type: "string", maxLength: 100 }, example: "대구" },
        ],
        responses: { "200": { description: "최대 5개의 행사 조회 성공" }, "400": errorResponse, "502": errorResponse },
      },
    },
    "/api/parking": {
      get: {
        tags: ["외부 데이터"],
        summary: "대구 구·군별 주차장 조회",
        description: "지도 API 없이 지정한 대구 구·군의 주차장을 무료 여부, 실시간 정보 지원, 주차 규모 기준으로 정렬해 최대 5개 반환합니다. 가까운 거리순 결과가 아닙니다.",
        parameters: [{ name: "district", in: "query", required: true, schema: { type: "string", enum: ["중구", "동구", "서구", "남구", "북구", "수성구", "달서구", "달성군", "군위군"] }, example: "수성구" }],
        responses: {
          "200": { description: "조회 성공", content: { "application/json": { schema: { $ref: "#/components/schemas/ParkingListResponse" } } } },
          "400": errorResponse,
          "500": errorResponse,
        },
      },
    },
    "/api/places": {
      get: {
        tags: ["외부 데이터"],
        summary: "네이버 장소 검색 및 캐시",
        description: "NAVER API HUB 지역 검색 결과를 places와 place_source_records에 24시간 캐시합니다. NAVER_API_HUB_CLIENT_ID와 NAVER_API_HUB_CLIENT_SECRET이 필요합니다.",
        parameters: [{ name: "query", in: "query", required: true, schema: { type: "string", maxLength: 100 }, example: "대구미술관" }],
        responses: { "200": { description: "장소 검색 성공" }, "400": errorResponse, "502": errorResponse, "503": errorResponse },
      },
    },
    "/api/recommend": {
      post: {
        tags: ["AI"],
        summary: "추천 생성 및 DB 저장",
        description: "AI 추천을 생성하고 agent_runs, recommendation_routes, route_places에 기록합니다. transportMode이 car이면 지도 API 없이 추천 장소와 같은 구·군의 주차장을 무료 여부, 실시간 정보 지원, 규모 기준으로 최대 3개 제공합니다. 거리와 도보시간은 계산하지 않습니다. 주차장 조회가 실패해도 장소 추천은 반환합니다.",
        requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/RecommendationRequest" }, examples: { car: { summary: "자동차 이용 추천", value: { transportMode: "car", history: [{ role: "user", content: "대구 동구 율하역 1번출구에서 자동차로 데이트할 장소를 추천해줘" }] } }, transit: { summary: "대중교통 이용 추천", value: { transportMode: "public_transit", history: [{ role: "user", content: "대구에서 데이트할 장소를 추천해줘" }] } } } } } },
        responses: {
          "200": { description: "추천 생성 및 저장 성공. 자동차 모드에서는 각 대구 장소에 parkingOptions가 포함될 수 있습니다.", content: { "application/json": { schema: { $ref: "#/components/schemas/RecommendationRunResponse" } } } },
          "400": errorResponse,
          "500": errorResponse,
        },
      },
    },
    "/api/agent": {
      post: {
        tags: ["AI"],
        summary: "AI 나들이 추천 대화",
        description: "전체 대화 내역을 전달합니다. GEMINI_API_KEY가 필요합니다.",
        requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/ChatRequest" } } } },
        responses: {
          "200": { description: "추천 응답", content: { "application/json": { schema: { type: "object", required: ["recommendation"], properties: { recommendation: { $ref: "#/components/schemas/Recommendation" } } } } } },
          "400": errorResponse,
          "500": errorResponse,
        },
      },
    },
    "/api/suggest": {
      post: {
        tags: ["AI"],
        summary: "다음 대화 문장 제안",
        requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/ChatRequest" } } } },
        responses: { "200": { description: "제안 성공. 보조 기능 실패 시 빈 문자열", content: { "application/json": { schema: { type: "object", properties: { suggestion: { type: "string" } } } } } }, "400": errorResponse },
      },
    },
  },
  components: {
    schemas: {
      Error: {
        type: "object",
        properties: {
          error: { oneOf: [{ type: "string" }, { type: "object", properties: { code: { type: "string" }, message: { type: "string" }, details: { type: "object", additionalProperties: true } } }] },
        },
      },
      Region: {
        type: "object",
        properties: {
          id: { type: "string", example: "7" }, parentId: { type: ["string", "null"] }, code: { type: "string" }, name: { type: "string", example: "수성구" }, level: { type: "string" }, latitude: { type: ["string", "null"] }, longitude: { type: ["string", "null"] },
        },
      },
      RegionListResponse: { type: "object", properties: { count: { type: "integer" }, data: { type: "array", items: { $ref: "#/components/schemas/Region" } } } },
      DataSourceListResponse: { type: "object", properties: { count: { type: "integer" }, data: { type: "array", items: { type: "object", additionalProperties: true } } } },
      ChatTurn: { type: "object", required: ["role", "content"], properties: { role: { type: "string", enum: ["user", "assistant"] }, content: { type: "string" } } },
      ChatRequest: { type: "object", required: ["history"], properties: { history: { type: "array", minItems: 1, items: { $ref: "#/components/schemas/ChatTurn" }, example: [{ role: "user", content: "대구에서 오늘 갈 만한 곳 추천해줘" }] } } },
      RecommendationRequest: {
        type: "object",
        required: ["history"],
        properties: {
          history: { type: "array", minItems: 1, items: { $ref: "#/components/schemas/ChatTurn" } },
          transportMode: {
            type: "string",
            enum: ["car", "public_transit", "walk"],
            description: "car일 때만 주차장 후보를 자동 조회합니다. 생략하면 마지막 사용자 메시지에서 자동차·자차·주차 등의 표현을 감지합니다.",
            default: "public_transit",
          },
        },
      },
      ParkingSpot: {
        type: "object",
        required: ["name", "address", "capacity", "fee", "hasRealtime"],
        properties: {
          name: { type: "string", example: "율하동 1177 공한지주차장" },
          address: { type: "string", example: "대구광역시 동구 율하동 1177" },
          capacity: { type: "integer", minimum: 0, example: 8 },
          fee: { type: "string", example: "요금정보 없음" },
          hasRealtime: { type: "boolean", description: "실시간 데이터 제공 가능 여부이며 현재 빈 주차면 수 자체는 아닙니다." },
        },
      },
      ParkingListResponse: {
        type: "object",
        required: ["spots"],
        properties: { spots: { type: "array", maxItems: 5, items: { $ref: "#/components/schemas/ParkingSpot" } } },
      },
      RecommendationPlace: {
        type: "object",
        required: ["name", "oneLineDescription", "reason"],
        properties: {
          name: { type: "string" },
          oneLineDescription: { type: "string" },
          reason: { type: "string" },
          address: { type: "string" },
          operatingHours: { type: "string" },
          fee: { type: "string" },
          features: { type: "array", items: { type: "string" } },
          imageUrl: { type: "string", format: "uri" },
          daeguDistrict: { type: "string", enum: ["중구", "동구", "서구", "남구", "북구", "수성구", "달서구", "달성군", "군위군"] },
          parkingOptions: { type: "array", maxItems: 3, description: "자동차 모드일 때 지도 좌표 없이 같은 구·군에서 점수로 선정한 후보. 구·군을 알 수 없거나 조회가 실패하면 빈 배열입니다.", items: { $ref: "#/components/schemas/ParkingOption" } },
          parkingNotice: { type: "string", description: "거리 기반 결과가 아니라는 제한 또는 주차장 조회 불가 사유" },
        },
      },
      ParkingOption: {
        type: "object",
        allOf: [
          { $ref: "#/components/schemas/ParkingSpot" },
          {
            type: "object",
            required: ["distanceM", "walkingMinutes", "selectionBasis"],
            properties: {
              distanceM: { type: "null", description: "지도 연동 전에는 항상 null" },
              walkingMinutes: { type: "null", description: "경로 API 연동 전에는 항상 null" },
              selectionBasis: { type: "string", const: "same_district_score", description: "같은 구·군에서 무료 여부, 실시간 지원, 규모로 정렬" },
            },
          },
        ],
      },
      Recommendation: {
        type: "object",
        required: ["needsMoreInfo", "message"],
        properties: {
          needsMoreInfo: { type: "boolean" },
          message: { type: "string" },
          places: { type: "array", items: { $ref: "#/components/schemas/RecommendationPlace" } },
        },
      },
      RecommendationRunResponse: {
        type: "object",
        required: ["recommendation", "agentRunId", "recommendationRouteId"],
        properties: {
          recommendation: { $ref: "#/components/schemas/Recommendation" },
          agentRunId: { type: "string", format: "uuid" },
          recommendationRouteId: { type: ["string", "null"] },
        },
      },
      AirQualitySnapshot: {
        type: "object",
        required: ["id", "pm10Value", "overallGrade", "freshnessStatus"],
        properties: {
          id: { type: "string" },
          pm10Value: { type: ["number", "null"] },
          overallGrade: { type: "string" },
          freshnessStatus: { type: "string", enum: ["fresh", "stale"] },
        },
      },
      AirQualityResponse: {
        type: "object",
        required: ["data"],
        properties: {
          data: {
            type: "object",
            required: ["source", "cache", "snapshot", "regionId", "requestedRegionName"],
            properties: {
              source: { type: "string", const: "AIRKOREA" },
              cache: { type: "string", enum: ["fresh", "stale"] },
              snapshot: { $ref: "#/components/schemas/AirQualitySnapshot" },
              regionId: { type: ["string", "null"] },
              requestedRegionName: { type: "string" },
            },
          },
        },
      },
    },
  },
} as const;
