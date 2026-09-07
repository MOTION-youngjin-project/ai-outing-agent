// src/lib/agent.ts의 PLACE_TAGS와 같은 값 — 서버 전용 도구 모듈(langchain 등)을 클라이언트
// 번들에 끌어오지 않으려고 값만 여기 따로 둠. ResultsScreen(필터 칩)과 MyPageScreen(선호
// 조건 칩) 둘 다에서 쓴다.
export const FILTER_LABELS = ["실내", "야외", "데이트", "저비용"] as const;
