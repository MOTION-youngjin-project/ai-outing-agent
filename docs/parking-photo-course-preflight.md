# 주차 연계 재추천·포토 코스: 1단계 사전 점검

점검일: 2026-09-16. 기능 구현과 데이터 설계는 다음 단계에서 진행한다.

## 브랜치와 기존 작업

- 원격 develop을 fetch하여 최신 기준 `0e265ee402d145cad376678c9eb8129c2c052c91` 확인.
- 해당 커밋에서 `feature/parking-photo-course` 브랜치 생성.
- D:/motion의 현재 브랜치는 `feature/backend-followups`. 기존 추적 파일 30개 수정 및 다수 미추적 파일이 있어 전환하지 않았다.
- 기존 변경을 커밋·stash·삭제하지 않았으며 push와 병합도 하지 않았다.
- 구현 시작 전 기존 작업을 보존한 상태에서 새 브랜치로 옮길 방법과 변경 충돌을 확인해야 한다. 새 브랜치에는 현재 미커밋 기능이 포함되어 있지 않다.

## 확인한 연결 구조와 수정 범위

| 영역 | 현재 연결 | 후속 확장 위치 |
|---|---|---|
| 추천 화면 | src/app/page.tsx → POST /api/recommend | 여행 시작·방문 상태·변경안 확인 UI |
| 추천 처리 | src/app/api/recommend/route.ts → src/lib/services/recommendations.ts → src/lib/agent.ts | 여행 상태와 재추천 조건을 처리하는 별도 서비스 연결 |
| 저장 | 회원 추천을 DB에 저장, 비회원은 개인 이력 저장 생략 | 진행 중 여행 저장 방식은 2단계에서 설계 |
| 저장 계획 조회 | MyTravelPlans → /api/recommendations 및 /api/recommendations/[id] | 저장된 추천과 진행 중 여행 구분 |
| 주차 | ParkingBrowser·services/parking.ts·parking-data.ts | 주차 후보 조회와 실제 주차 위치 저장 구분 |
| 지도 | RecommendationMap·kakao-map-sdk.ts | 현재 위치 획득 재사용 검토, 주차 위치 보정·복귀 지점 추가 |
| 데이터 모델 | prisma/schema.prisma | 기존 추천 기록을 보존하며 여행 상태·촬영 취향 확장 검토 |

메인 화면은 /api/agent가 아니라 /api/recommend를 호출한다. 지도에는 이미 현재 위치 획득 기능이 있다. 현재 주차 거리·도보 시간은 직선거리 기반 추정치이므로 실제 경로 시간으로 취급하지 않는다.

## Next.js 및 검증 기준

설치된 node_modules/next/dist/docs/01-app/01-getting-started/ 아래 05-server-and-client-components.md와 15-route-handlers.md의 관련 내용을 확인했다. 위치·사진 선택·브라우저 저장은 Client Component에서 처리하고, DB·AI 호출과 비밀 키는 서버에 둔다. API는 app의 route.ts를 사용한다.

기존 검증 명령은 lint, build, self-check, kakao-check, parking-check, map-check가 있다. 이번 단계는 구조 점검과 브랜치 준비이므로 실행 검증은 하지 않았다. 기능 정상 동작을 새로 검증한 것으로 간주하지 않는다.

다음 단계: 화면 흐름과 데이터 구조 설계. 이번 단계에서는 앱 코드·DB 스키마·의존성을 변경하지 않았다.
