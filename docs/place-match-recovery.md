# 장소 상세보기 매칭 복구

AI 추천명과 카카오 공식 장소명이 달라 `placeId`가 생성되지 않던 경우를 복구한다.

## 변경 사항

- 첫 검색에서 확정하지 못하면 장소명·지역·구/군을 조합해 다시 검색한다.
- 이름 유사도, 주소 구/군, 인접 코스 장소와의 좌표 거리를 함께 평가한다.
- 한 후보가 충분히 우세하면 자동 연결한다.
- 후보 점수가 비슷하면 자동 연결하지 않고 사용자가 공식 장소명과 주소를 보고 선택한다.
- 계속 찾지 못하면 상세보기를 제공할 수 없다는 이유와 `다시 찾기` 버튼을 표시한다.
- 선택 결과를 해당 추천의 `recommendationJson`에 저장해 새로고침 후에도 상세 페이지를 연다.
- 공유받은 읽기 전용 추천에서는 원본 추천을 변경하지 못하게 재검색을 제한한다.

## 범위

- 기존 `KAKAO_API_KEY`를 사용하며 새로운 환경변수·DB 마이그레이션·패키지는 없다.
- 추천 결과 유효기간이 끝났거나 추천 소유자가 아니면 변경할 수 없다.
- 복구한 결과는 추천 JSON에 반영한다. 기존 경로 행을 재작성하지 않으므로 과거 경로 스냅샷만 사용하는 예외 경로에는 포함되지 않을 수 있다.

## 검증

```powershell
npx tsx scripts/place-match-recovery-check.ts
npx eslint src/lib/services/matching.ts src/lib/services/places.ts src/lib/services/recommendations.ts src/app/api/recommend/[runId]/place-match/route.ts src/components/PlaceMatchRecovery.tsx src/components/screens/ResultsScreen.tsx scripts/place-match-recovery-check.ts
npm run build
```

PR 대상은 `develop`이며 `main`에는 직접 병합하지 않는다.
