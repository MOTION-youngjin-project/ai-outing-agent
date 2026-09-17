# 주차 연계 재추천: 2단계 설계

작성일: 2026-09-16. 범위: 2~7단계. 사진 업로드·분석은 8단계 이후다.

## 화면 흐름

추천 결과 → 여행 시작(남은 시간 확인) → 진행 중 여행 → 방문 완료 표시 → 주차 위치 저장 → 현장 상황 입력 → 변경안 확인 → 수락하여 적용 → 주차장 복귀 → 여행 종료.

- 진행 중 여행은 일반 추천 결과와 별도 패널로 유지한다. 새 추천을 요청해도 진행 중 여행을 덮어쓰지 않는다.
- 여행은 한 번에 하나만 진행한다. 다른 여행을 시작하려면 기존 여행을 종료한다.
- 장소별 방문 완료/취소와 남은 시간 수정이 가능하다.
- 주차 저장은 현재 위치를 얻은 뒤 확인하고 저장한다. 지도 중심을 움직여 보정할 수 있게 한다.
- 위치 권한 거부 시 지도에서 직접 선택할 수 있게 한다. 지도 연결까지 실패하면 저장 실패를 알리고 기존 주차 위치를 유지한다.
- 주차 위치는 한 곳만 유지하며 수정·삭제 가능하다.
- 변경안은 기존 일정 옆에 변경 이유·장소 순서·추정 시간을 표시한다. 수락 전에는 진행 중 일정을 변경하지 않는다.

## 저장 방식

초기 버전은 회원·비회원 모두 현재 브라우저 localStorage에 진행 중 여행 한 건을 저장한다. 기존 회원 추천 DB 저장·조회는 그대로 유지한다. 이 방식은 기기 간 동기화를 제공하지 않는다.

- 저장 키: motion.active-trip.v1. 화면에서 '이 기기에 저장'과 '여행 기록 삭제' 제공.
- 최초 마운트 후 복원 완료 전에는 저장하지 않는다. 초기 빈 상태로 기존 데이터를 덮어쓰지 않는다.
- JSON 손상·지원하지 않는 버전·유효하지 않은 좌표는 복원하지 않고 안내한다.
- 저장 실패 시 현재 화면에서는 계속 사용하되 새로고침 복원 불가를 안내한다.
- 여행 종료 시 진행 상태를 종료로 표시하고, 별도 삭제 동작으로 기기 저장값을 제거한다.
- 현재 GPS는 필요할 때만 조회하며 상시 추적하지 않는다. 저장된 주차 좌표와 여행 기록 삭제 방법을 표시한다.
- 사진 원본은 이번 범위에 저장하지 않는다.

## 데이터 계약

| 객체 | 필드 | 의미 |
|---|---|---|
| ActiveTrip | version, id, revision, status, startedAt, updatedAt | 저장 형식 버전, 여행 식별자, 변경 번호, active/completed |
| ActiveTrip | title, transportMode, remainingMinutes | 최초 사용자 요청 요약, 이동수단, 사용자가 확인한 남은 시간 |
| ActiveTrip | stops, parking, photoPreferences | 여행 장소, 주차 위치 0~1곳, 향후 확정된 촬영 취향 |
| TripStop | id, place, visitedAt | 안정적인 장소 ID, 기존 추천 장소 스냅샷, 방문 시각 또는 null |
| ParkingLocation | latitude, longitude, label, savedAt, source | 주차 좌표·이름·저장 시각·gps/map 구분 |
| TripSituation | reason, detail, affectedStopId | rain/crowded/closed/tired/other, 사용자 설명, 제외할 장소 |
| ReplanRequest | tripId, baseRevision, currentLocation, remainingMinutes, situation, visitedStops, remainingStops, parking, photoPreferences | 현재 상태의 재추천 요청 |
| ReplanProposal | id, tripId, baseRevision, proposedStops, returnToParking, explanation, estimatedMinutes, warnings | 수락 전 독립적인 변경안 |

장소 ID는 검증된 공급자 ID가 있으면 이를 사용하고, 없으면 여행 시작 시 생성해 계속 보존한다. 화면 배열 순번은 ID로 사용하지 않는다.

## 단계별 구현 범위

| 단계 | 구현 파일 후보 | 완료 조건 |
|---|---|---|
| 3 여행 상태 | src/lib/active-trip.ts, src/components/ActiveTripPanel.tsx, src/app/page.tsx | 시작·완료 표시·남은 시간·종료·복원·삭제 |
| 4 주차 저장 | src/components/ParkingLocationPicker.tsx, ActiveTripPanel | GPS 저장·지도 보정·재확인·수정·삭제 |
| 5 상황 입력 | ActiveTripPanel内 입력 UI 또는 별도 TripSituationForm | 빠른 버튼·자유 입력·대상 장소·남은 시간·현재 위치 확인 |
| 6 재추천 | src/app/api/trips/replan/route.ts, src/lib/services/trip-replanning.ts | 방문 장소 보존·검증된 대체 후보·주차 복귀·시간 제약 |
| 7 변경안 적용 | src/components/TripReplanPreview.tsx, ActiveTripPanel | 이전/이후 비교·수락/취소·지도와 목록 일치 |

파일명은 구현 시 조정할 수 있다. 기존 agent.ts와 Prisma 스키마는 가급적 변경하지 않고 별도 서비스로 조합한다.

## 재추천 처리 원칙

1. POST /api/trips/replan은 유효한 좌표·남은 시간·배열 길이·문자열 길이·이동수단을 검증한다. 사용자 입력은 신뢰하지 않는다.
2. 재추천 후보는 기존 추천 도구와 장소 좌표 확인 서비스를 활용한다. 휴무·혼잡은 사용자 신고 상황으로만 처리하며 영구 장소 정보에 반영하지 않는다.
3. 이미 방문한 장소는 서버에서 기존 기록 그대로 보존하고 대체 후보에서 제외한다. 휴무 등 사용자가 제외한 장소도 후보에서 제외한다.
4. 모델은 대체 후보와 이유를 제안한다. 주차장 복귀 및 방문 기록 보존은 코드로 강제한다.
5. 현재 위치에서 남은 장소를 거쳐 저장 주차장으로 돌아오는 시간을 계산한다. 주차장까지의 복귀 시간도 남은 시간에 포함한다.
6. 실제 경로 API를 새로 도입하기 전에는 직선거리 기반 추정치임을 명시한다. 대중교통의 배차·환승·실제 소요시간을 임의로 만들지 않는다. 계산 불가능한 시간은 알 수 없음으로 표시한다.
7. 시간이 부족하면 장소 수를 줄이거나 바로 복귀를 제안한다. 복귀 자체가 남은 시간을 넘으면 불가능한 일정을 정상 코스로 반환하지 않고 안내한다.
8. 검증된 후보 또는 좌표가 부족하면 이유와 재시도를 제공한다. 기존 여행은 유지한다.
9. 사진 취향은 아직 UI가 없더라도 선택 필드로 보존한다. 확정된 값이 있다면 변경 요청에 함께 전달한다.

## 수락과 동시 변경

- 제안에는 tripId와 baseRevision을 포함한다.
- 응답 도착 전에 다른 여행으로 바뀌거나 방문·주차·시간 조건이 바뀌면 이전 제안을 폐기한다.
- 수락 시에도 현재 revision과 비교하고 일치할 때만 적용한다. 두 번 클릭해도 한 번만 적용한다.
- 방문 완료 장소는 보존하고 남은 장소만 바꾼다. 주차 복귀는 별도 최종 목적지로 유지한다.
- 지도에는 현재 위치·남은 장소·주차장을 같은 변경안에서 표시한다. 직선 연결이 있다면 실제 도로 경로로 표시하지 않는다.

## 검증 기준

- 3: 새로고침 복원, 손상 저장값, 저장 실패, 방문 완료 취소, 여행 교체 방지.
- 4: 권한 거부, GPS 시간 초과, 부정확한 위치 보정, 지도 실패, 주차 변경·삭제.
- 5: 빈 입력, 잘못된 남은 시간, 상황 대상 누락, 중복 요청 방지.
- 6: 방문 장소 재등장 방지, 신고 휴무 장소 제외, 마지막 주차장, 복귀 시간 부족, 후보 없음, 외부 API 실패.
- 7: 거절 시 원본 유지, 수락 후 목록/지도 일치, 이전 revision 응답 무시, 중복 수락 방지.
- 변경 단계에 맞는 테스트와 타입 검사·lint를 수행하고 통합 후 build를 확인한다.

## 최신 develop 기준 보정 및 현재 진행 상황

사용자가 별도 작업 폴더를 선택하여 D:/motion-parking-photo에 feature/parking-photo-course worktree를 만들었다. D:/motion의 기존 코드와 미커밋 작업은 이동하지 않았다. 위 파일 연결 표는 최초 로컬 점검 기준이며, 실제 작업 기준에서는 다음과 같이 달라진다.

- 홈: 서버 page.tsx → HomeClient → InputScreen. 코스 상세: ResultsScreen.
- 지도: 기존 로컬의 Kakao RecommendationMap이 아닌 NaverMap 및 CourseMapView를 검토해야 한다.
- 장소: PlaceWithMeta의 placeId, latitude, longitude를 사용한다. 실제 자동차 경로 서비스 naverDirections도 이미 있으므로 6단계에서 재사용을 우선 검토한다.
- 3단계 구현: AppShell의 ActiveTripPanel, ResultsScreen의 StartTripButton, 별도 active-trip-store로 연결했다. 기존 채팅 store를 영속화하지 않는다.
- 실제 TripStop은 id/name/address/latitude/longitude/visitedAt의 최소 스냅샷이다. 4단계 주차와 이후 사진 필드는 아직 추가하지 않았다. 단계별로 저장 스키마 호환성을 유지해야 한다.
- 2026-09-17 기준 1~7단계 완료. 테스트 25개, 공급자 연결 검사와 모바일 크기 브라우저 검사(외부 응답은 모의 데이터), 전체 lint, 타입 검사, 빌드 통과. 8단계 이후는 미착수. 상세 진행 기록은 parking-photo-course-progress.md 참고.

## 8단계 입력 구현 확정 (2026-09-17)

참고 사진은 /photo, 현장 사진은 여행 상황 패널에 배치한다. 각 입력은 사진 1장을 메모리에만 보관하며 서버 업로드 및 영구 저장은 하지 않는다. JPEG/PNG/WebP, 최대 10MB, 4,000만 화소 및 각 변 12,000픽셀 제한을 적용한다. 잘못된 교체 파일은 기존 선택을 보존한다. 다음 단계에서 PhotoInput의 onChange를 분석 흐름에 연결한다. 현재 분석·취향 추출·추천 반영은 미구현이다.

## 9단계 현장 사진 분석 구현 (2026-09-17)

8단계의 현장 사진은 이제 명시적인 분석 요청에 한해 서버와 Gemini로 전송된다. 서버는 sharp 재인코딩으로 메타데이터를 제거하고 2048픽셀 이내 JPEG를 전송한다. 파일/DB 저장 및 응답 캐시는 하지 않는다. 참고 사진 /photo는 여전히 로컬 입력 전용이다.

분석은 readable/observedText/reason/detail/uncertainty 구조의 미확정 초안이다. 판독 불가이면 적용 버튼을 제공하지 않는다. 읽힌 휴무 날짜는 그대로 남기고 현재 휴무로 확정하지 않는다. 분석 후 사용자가 상황 입력 화면에서 설명 수정, 대상 장소·현재 위치·시간 확인을 마친 뒤 저장한다. 사진 삭제·교체나 여행 조건 변경은 미저장 초안을 폐기하며 확인한 기존 상황과 코스는 보존한다. 원문 및 사진은 여행 기록에 저장하지 않고 사용자 확정 설명만 저장한다.

## 11단계 취향 확인 및 12단계 연결 계약 (2026-09-17)

참고 사진의 취향 분석은 POST /api/photo-preferences/analyze로 분리했다. 현장 상황 분석과 이미지 검증/재인코딩을 공유하되 응답 스키마와 프롬프트는 다르다. photoTasteAnalysisSchema는 readable/tags/background/mood/composition/uncertainty이며 태그는 10단계 PHOTO_TAGS만 허용한다. 사진 속 장소를 그대로 찾거나 인물의 신원을 추론하지 않는다.

PhotoPreferenceEditor는 사진 없이 직접 선택도 허용한다. 사용자가 최종 확정한 PhotoPreferences는 tags(1~10개, 중복 제거)/focus/note(최대 500자) 구조다. usePhotoPreferences의 confirmed만 후속 코스 생성 입력으로 사용한다. 분석 결과나 편집 중인 임시 태그를 직접 사용하지 않는다. 수정/사진 교체/삭제 시 confirmed=null이 되므로 12단계의 제안도 당시 확정값과 비교하여 무효화해야 한다.

저장소는 Zustand 메모리 전용이며 사진이나 분석 설명을 담지 않는다. 클라이언트 화면 이동 시 확정 텍스트는 유지, 새로고침 시 초기화된다. 진행 중 ActiveTrip에는 아직 반영하지 않는다. 기존 ActiveTrip.photoPreferences는 문자열당 최대 100자이므로, 12단계에서 500자 선호 설명을 임의로 잘라 넣지 말고 별도 구조 필드와 호환성 검증으로 연결해야 한다. 코스 생성/여행 시작에 반영하기 전 title·방문 날짜·시간·이동수단과 함께 확정값 스냅샷을 받아야 한다.
