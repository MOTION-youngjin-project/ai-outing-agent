# 주차 연계 재추천 진행 기록

2026-09-16. 사용자 요청: 7단계까지 순서대로 진행하되 토큰이 부족할 것으로 보이면 다음 단계 시작 전에 중지.

## 작업 위치

- 구현 폴더: D:/motion-parking-photo
- 브랜치: feature/parking-photo-course
- 기준: origin/develop, 0e265ee
- D:/motion은 기존 미커밋 작업 그대로 보존. 사용자가 별도 작업 폴더 구현을 선택했다.
- 커밋·push·병합은 하지 않았다.

## 완료

2단계: parking-photo-course-design.md에 화면 흐름·데이터 계약·저장 방식·재추천 원칙·검증 기준 정리. 최초 D:/motion 분석과 최신 develop 구조의 차이는 문서 마지막에 보정했다.

3단계: 코스 상세에서 남은 시간과 이동수단을 선택해 여행 시작. 공통 패널에 여행 진행 상태 표시. 장소별 방문 완료/취소, 남은 시간 수정, 종료, 기록 삭제 지원. 한 번에 한 여행만 진행. 회원/비회원 모두 이 기기에 저장한다고 표시하며 새로고침 시 복원한다. 기존 추천·대화 저장 방식은 변경하지 않았다.

저장 스키마 검증, 손상 데이터 안내, 저장 실패 안내, 삭제 실패 시 상태 유지, 복원 전 덮어쓰기 방지 포함. 남은 시간은 자동 차감하지 않고 사용자가 수정한다.

## 검증

- npx tsx --test scripts/active-trip-check.ts: 6개 통과.
- 변경된 TS/TSX 파일 대상 ESLint: 통과.
- npx next typegen 후 npx tsc --noEmit: 통과. 첫 타입 검사는 생성 타입 부재로 실패했으나 typegen 후 해결.
- npm run build: 통과. Prisma 생성에 검증용 DATABASE_URL을 프로세스에만 지정했고 실제 DB 연결·마이그레이션은 하지 않았다.
- 실제 모바일 브라우저 조작 검증은 미실시. 외부 AI·지도 API와 실제 DB 실행 검증도 이번 단계에 포함하지 않았다.

## 다음 시작점

2026-09-17 기준 12단계 포토 코스 생성 구현 완료. 9·11단계 실제 Gemini 호출 및 12단계 자동차·대중교통 실연동 검증은 남아 있다. 다음은 13단계 통합 검증이다. 13단계에는 착수하지 않았다.

통합 검증(13), 실제 연동 검증(14), 지표·PR 정리(15) 순서로 진행.

6단계에서 TripStop에 sourceId·category·tags·reason·operatingHours·plannedVisitMinutes를 선택 필드로 확장했다. 기존 여행도 복원할 수 있다. 초기 코스의 sourceId는 db:장소ID, 새 대체 장소는 kakao:외부ID이며 이름·좌표로도 중복을 확인한다.

## 4단계 완료 내역

- ActiveTripPanel에 ParkingLocationPicker 연결. 여행 진행 중 주차 1곳 저장·수정·삭제.
- 현재 위치 버튼을 누를 때만 GPS 권한 요청. 정확도 표시, 거부·시간 초과·조회 실패 안내.
- 네이버 지도 중앙의 십자 표시로 위치를 맞추고 '지도 중앙 선택' 후 좌표 확인. 주차 위치 이름과 확인 체크 후 저장.
- GPS 또는 지도 후보는 저장 전까지 기존 주차 위치를 바꾸지 않는다. 취소 시 원본 보존.
- 지도 실패 시 재시도 또는 GPS 저장 가능. SDK 로딩 제한 12초와 실패 후 재시도 추가.
- 선택 parking 필드를 추가해 이전 v1 여행 데이터도 복원 가능. 주차 변경 실패 시 기존 화면·저장 좌표 모두 유지. 다른 여행으로 바뀌거나 종료한 뒤 도착한 변경은 거부.
- 저장 위치는 이 기기 localStorage에만 보관. DB·사진·재추천 기능은 변경하지 않았다.

### 4단계 검증

- active-trip-check.ts: 기존 6개 + 주차 관련 3개, 총 9개 통과.
- parking-location-browser-check.ts: 390×844 Edge 브라우저에서 GPS 확인·저장·복원·지도 보정·취소·삭제, 권한 거부/시간 초과 후 지도 선택, SDK 실패 후 GPS 저장 통과.
- 지도/GPS는 모의 응답. 실제 네이버 타일·도메인 키·휴대폰 GPS는 검증하지 않았다.
- 화면 증거: test-results/parking-location-mobile.png (검증용 지도 표시).
- 변경 파일 ESLint 경고/오류 없음. TypeScript 검사 및 npm run build 통과.
- 브라우저 검사: NEXT_PUBLIC_NAVER_MAP_CLIENT_ID=test-map-key로 3104번 개발 서버 시작 후 `npx tsx scripts/parking-location-browser-check.ts`. 실제 API 키 불필요. 기본 브라우저는 설치된 Edge, PLAYWRIGHT_CHANNEL로 변경 가능.
- 공식 SDK 계약 참고: https://navermaps.github.io/maps.js.ncp/docs/naver.maps.Map.html (getCenter, destroy).

## 5단계 완료 내역

- TripSituationForm: 비·혼잡·휴무·휴식·직접 입력 버튼, 최대 1,000자 설명, 변경 대상 장소, 남은 시간, 현재 위치 확인.
- 휴무·혼잡에는 미방문 대상 장소 필수, 직접 입력에는 공백이 아닌 설명 필수. 남은 시간은 1~1,440분 정수.
- GPS는 사용자 버튼 동작 때만 요청하며 정확도를 표시한다. 권한 거부·미지원·조회 실패 시 좌표가 있는 코스 장소를 현재 위치로 직접 선택할 수 있다. 해당 장소에 실제로 있는지 확인하도록 안내한다.
- 입력 내용을 바꾸면 확인 체크를 해제한다. 저장 전 GPS 위치는 재조회하며 저장 시 5분 이상 지난 위치를 거부한다.
- active-trip에 선택 situation 필드를 추가해 기존 v1 기록과 호환. 현장 상황·현재 좌표를 이 기기에 저장한다고 안내.
- confirmSituation(tripId, baseRevision, input): 여행 ID·버전·진행 상태·대상 장소·현재 위치를 검증. 성공 후 revision을 증가시켜 중복 제출/오래된 입력을 거부한다. 저장 실패 시 기존 시간과 상태 유지.
- 방문·남은 시간·주차 위치 변경 또는 여행 종료 시 situation을 무효화한다. 편집 취소는 기존 상황과 코스를 유지한다.
- 실제 재추천 API는 호출하지 않는다. 6단계는 trip.situation을 읽어 현재 trip.revision과 situation.baseRevision 일치, 위치 최신성, 장소 유효성을 서버에서도 재검증해야 한다.

### 5단계 검증

- active-trip-check.ts: 13개 통과 (기존 9개 + 현장 상황 4개).
- trip-situation-browser-check.ts: 390×844 Edge에서 GPS 성공/권한 거부, 직접 장소 선택, 휴무 대상 필수, 방문 장소 제외, 확인 체크 재설정, 저장·새로고침 복원, 공백 설명 거부, 취소, 여행 조건 변경 시 상황 무효화 통과.
- GPS와 인증 응답은 모의 응답. 실제 휴대폰 GPS·DB·AI 외부 호출은 검증하지 않았다.
- 화면: test-results/trip-situation-mobile.png.
- 변경 파일 ESLint, TypeScript, npm run build 통과.
- 검사 재실행: 3104 개발 서버에서 `npx tsx scripts/trip-situation-browser-check.ts`. SITUATION_TEST_ORIGIN으로 주소 변경 가능.

## 6~7단계 완료 (2026-09-17)

### 6. 남은 코스 재추천

- POST /api/trips/replan에 현재 여행 스냅샷과 장소당 체류 시간(5~120분)을 전달한다. 입력 크기 100KB 제한, 스키마·현재 위치 최신성·상황 revision·대상 장소·주차 위치 검증.
- 기존 runAgent에 여행 타이틀·자유 설명·현장 상황·현재 위치·제외 장소·촬영 취향을 전달한다. 기존 카카오 장소 매칭으로 대체 후보의 실제 위치를 확인한다.
- 현재 위치에서 5km 안의 후보 중 이미 방문했거나 휴무·혼잡으로 제외한 장소를 걸러낸다. 비에는 실내 태그 후보, 피로에는 한 곳을 제안한다. 휴무·혼잡은 대체 장소 이후의 기존 일정도 시간에 맞는 범위에서 보존한다.
- 주차한 차를 유지하는 여행이므로 자동차 모드는 남은 구간을 도보로 계산한다. 대중교통 선택은 기존 Transitous 서비스를 사용한다.
- 도보는 기존 Tmap 경로를 우선 사용한다. 조회 실패 시 직선거리×1.4/분당60m 추정임을 명시한다. 대중교통 경로를 못 찾으면 1km 이내만 도보 대체를 고려하고 장거리 시간을 만들지 않는다.
- 이동·사용자가 정한 체류·마지막 주차장 복귀 시간을 합산한다. 복귀 자체가 남은 시간을 넘으면 422 안내. 추가 방문이 안 맞거나 후보가 없으면 직접 복귀안을 사용자에게 제시한다. 후보 조회 실패는 502, 복귀 경로 미확인은 503으로 기존 코스를 유지한다.
- 운영시간·실내 태그는 참고 정보이며 실시간 영업·좌석·혼잡·촬영 가능 여부를 보장하지 않는다고 표시한다.

### 7. 변경안 확인·수락

- TripReplanPanel에서 기존/제안 코스, 변경 이유, 장소별 설명, 이동·체류 시간, 추정 안내를 비교한다.
- TripRouteMap에 방문 순서와 마지막 주차장을 동일 데이터로 표시한다. 실제 도로 경로선으로 오인하지 않도록 번호 마커만 사용한다.
- '기존 코스 유지'는 변경안을 닫고 원본을 보존한다. '이 코스로 변경'을 누를 때만 저장한다.
- 수락 시 여행 ID·revision·기한·주차 위치·출발지·시간 합계·제외/중복 장소를 재검증한다. 방문 완료 장소는 그대로 보존하고 남은 장소만 교체한다. 사진 취향도 보존한다.
- 저장 실패, 중복 수락, 다른 여행으로 전환, 요청 대기 중 여행 조건 변경 시 기존 코스를 보존한다. 편집/종료로 unmount되면 요청을 취소하고 늦은 응답을 버린다.
- 수락 후 진행 패널의 목록·지도와 localStorage를 함께 갱신하며 새로고침 복원한다. 최초 추천 결과 화면은 원본 기록으로 유지한다. 방문 상태 변경 뒤에도 '진행 코스 지도 보기'에서 최신 남은 장소를 확인할 수 있다.
- 후보안은 위치 조회 시점부터 최대 5분 안에만 수락 가능하다. 남은 시간은 기존 정책대로 사용자가 입력한 값이며 자동 차감하지 않는다.

### 검증과 실행 조건

- `npx tsx --test scripts/active-trip-check.ts scripts/trip-replan-check.ts`: 총 25개 통과.
- `node --import tsx --experimental-test-module-mocks scripts/trip-replan-provider-check.ts`: 실제 연결 코드의 AI 조건 전달·카카오 매칭·Tmap/Transitous 응답 변환·실패 대체 정책 통과. 외부 응답은 모의 데이터.
- `npx tsx scripts/trip-replan-browser-check.ts`: 실제 Route Handler 400/409/413/직접 복귀 200, 모바일 화면의 미수락 유지·거절·수락·방문 보존·목록/지도 일치·복원·오래된 응답 폐기 통과.
- 기존 parking-location-browser-check.ts 및 trip-situation-browser-check.ts 회귀 검사 통과.
- 전체 `npm run lint`, `npx tsc --noEmit`, `npm run build` 통과. 신규 API 포함 35개 정적 페이지 생성.
- 스크린샷: test-results/trip-replan-preview-mobile.png, trip-replan-applied-mobile.png. 지도는 '지도 SDK 모의 화면 · 검증용'으로 표시.
- 실제 외부 AI·카카오·Tmap·Transitous·지도 도메인 인증 및 실기기 GPS 호출은 미검증. 테스트는 API 키와 실제 DB 접속 없이 실행했다. 프로덕션 사용에는 기존 DATABASE_URL/Gemini/카카오/지도 환경 설정이 필요하며 도보 실경로에는 TMAP_APP_KEY가 필요하다.
- 브라우저 검사 서버: 3104 포트, NEXT_PUBLIC_NAVER_MAP_CLIENT_ID=test-map-key. REPLAN_TEST_ORIGIN으로 주소 변경 가능. 검증 후 서버 종료.
- 커밋·push·병합은 수행하지 않았다. 원래 D:/motion의 작업도 그대로 보존했다.

## 8단계 완료 (2026-09-17)

- 홈의 '참고 사진 선택' 링크 → /photo 화면. 현장 상황 패널에도 같은 PhotoInput 컴포넌트 연결.
- 입력 영역별 사진 1장: 카메라 촬영/앨범 선택, 미리보기, 교체, 삭제, 같은 파일 재선택 지원.
- JPEG·PNG·WebP 실제 헤더와 MIME, 디코딩, 10MB 용량, 4,000만 화소/가로세로 12,000픽셀 제한 검사. HEIC 변환 안내. 오류나 선택창 취소 시 기존 사진 유지.
- 사진은 React 메모리와 임시 blob URL에서만 취급. 서버 전송/localStorage 저장 없음. 교체·삭제·화면 이동 시 URL 해제. 새로고침 시 사진 삭제. 분석 및 추천 반영은 아직 하지 않음.
- npx tsx --test scripts/photo-input-check.ts: 3개 통과.
- npx tsx scripts/photo-input-browser-check.ts: 입력·교체·삭제·재선택·잘못된 파일·URL 해제·미전송·미저장·새로고침 삭제 통과.
- npx tsx scripts/trip-situation-browser-check.ts: 현장 사진 선택/새로고침 삭제 및 기존 상황 입력 회귀 통과.
- npm run lint, npx tsc --noEmit, npm run build 통과. 실제 DB 연결 없이 검증용 DATABASE_URL 사용.
- 모바일 크기 브라우저 화면 확인: test-results/photo-input-mobile.png. 실제 휴대폰 카메라/권한 동작은 미검증.

## 9단계 구현 및 모의 응답 검증 완료 (2026-09-17)

- 현장 사진의 명시적인 분석 버튼 → POST /api/trips/scene-photo → 기존 GEMINI_API_KEY와 gemini-3.1-flash-lite를 사용한 구조화 분석 연결.
- 읽은 안내문, 제안 사유, 상황 설명 초안, 불확실성 반환. 날짜를 오늘로 임의 해석하거나 휴무·혼잡을 확정하지 않도록 프롬프트와 고정 안내 적용. 사진 속 지시문은 관찰 자료로만 취급.
- 분석 결과에서 '상황 입력에서 확인·수정'을 눌러도 저장하지 않음. 대상 장소/현재 위치/시간/사용자 확인 후 기존 상황 저장 흐름에 반영. 코스 변경은 기존 재추천·수락 절차를 계속 사용.
- 선택만으로는 전송하지 않음. 분석 버튼 클릭 시 서버 및 Gemini 전송 안내. 앱은 원본·분석 이미지를 파일/DB에 저장하지 않으며 no-store 응답. 외부 제공자 정책은 별도 적용. 확인한 상황 설명만 기존 여행 기록에 저장.
- 서버는 실제 수신 바이트 10MB 제한, MIME/시그니처 검사, sharp 디코딩/해상도 제한, EXIF/GPS 제거, 최대 2048픽셀 JPEG 재인코딩 적용. sharp 0.35.4를 직접 의존성으로 명시.
- 사진 교체·삭제/화면 이동/여행 revision 변경 시 분석과 사진 기반 초안 무효화. 취소 및 타임아웃, 판독 불가, 설정 누락, 잘못된 응답 안내 및 직접 입력 유지.
- scripts/scene-photo-check.ts: 서버 검증·메타데이터 제거·축소·오류 비노출 등 5개 통과.
- scripts/scene-photo-browser-check.ts: 모의 Gemini 응답으로 확인 전 여행 보존, 수정·대상 선택·확인 후 저장, 삭제 무효화, 실패 재시도, 판독 불가, 늦은 응답 폐기 통과.
- 기존 trip-situation-browser-check.ts 및 photo-input-browser-check.ts 회귀 통과. npm run lint, npx tsc --noEmit, npm run build 통과.
- 모바일 크기 화면 증거: test-results/scene-photo-confirmation.png. 실제 안내문 사진의 Gemini 인식 정확도와 실제 휴대폰 카메라는 미검증. 운영 키 설정 후 검증 필요.
- D:/motion 기존 작업은 보존. 커밋/push/병합하지 않음. 10단계는 미착수.
- 실제 로컬 API에 유효한 JPEG 요청: 키 미설정 시 503과 직접 입력 안내 반환 확인.

## 10단계 완료 (2026-09-17)

- 공식 출처를 확인한 대구 장소 6곳의 주소·대표좌표·실내외 촬영 구간·운영/휴무·태그·추천 시간대·촬영 팁·출처/확인일 추가.
- /photo 촬영 장소 목록과 GET /api/photo-places 필터 조회 연결. 실내 후보는 미술관/예술발전소의 허용 구간에 한정하며 현장 촬영 허용 확인을 명시.
- 소스 관리 카탈로그 방식. 기존 운영 DB와 여행/재추천 로직은 변경하지 않음. 취향 분석/자동 코스 생성은 후속 단계.
- 단위/API 검사 5개, 모바일 카탈로그 및 기존 사진 입력 브라우저 검사, 타입 검사·린트·빌드 통과.
- 상세 출처·좌표 확보 방법·운영시간 상충 처리·재사용 계약: photo-place-catalog.md.
- 다음 단계: 11번 취향 태그 확인. 원본 D:/motion 보존, 커밋/push/병합 없음.

## 11단계 구현 및 모의 응답 검증 완료 (2026-09-17)

- /photo에 참고 사진 분석 → 배경/분위기/구도 설명과 태그 제안 → 사용자 수정·확정 연결.
- POST /api/photo-preferences/analyze: 기존 Gemini 설정 및 이미지 바이트 검증/EXIF 제거/축소 경로 재사용. 사진 속 장소 식별·인물 신원 추론을 하지 않도록 구성.
- 10단계와 동일한 촬영 태그 10개 사용. 1개 이상 선택, 중요 요소(배경/분위기/구도/색감/전체 느낌), 선호 설명 최대 500자 지원.
- 분석 없이 직접 입력 가능. 판독 불가/실패/시간 초과는 직접 선택·재시도 안내. 사진 교체/삭제·화면 이탈 시 진행 중 요청 취소 및 늦은 응답 무시.
- 분석 초안은 자동 확정되지 않음. 사용자가 확정 버튼을 눌러야 저장. 태그·요소·설명 변경 시 확정 해제. 사진 교체/삭제는 이전 취향 초기화.
- 확정 텍스트는 photo-preferences-store의 confirmed에만 보관. 같은 탭의 클라이언트 화면 이동에서 유지하며 새로고침/초기화 시 삭제. 사진·분석 초안은 이 저장소/DB/localStorage에 저장하지 않음.
- photo-preferences-check.ts 3개 + 공유 처리 회귀 scene-photo-check.ts 5개 통과.
- photo-preferences-browser-check.ts, 기존 photo-input/scene-photo/photo-places 브라우저 검사 통과. 타입 검사·린트·빌드 통과.
- 실제 로컬 API: 키 미설정 시 503 및 수동 선택 안내 확인. Gemini 실제 사진 인식 정확도는 미검증. 화면 증거 test-results/photo-preferences-mobile.png.
- 다음 단계는 12번. 진행 중 여행과 코스는 아직 이 취향으로 변경하지 않음. D:/motion 보존, 커밋/push/병합 없음.

## 12단계 완료 (2026-09-17)

- 확정 취향 + 제목/날짜/출발 시각/시간 예산/이동수단/출발 장소로 최대 3곳 포토 코스 생성. 시간표·촬영 팁·출처 표시 및 확인 후 여행 시작 연결.
- 일몰 계산, 밝은 시간/노을/야경 배치, 실내 정규 운영시간, 이동·대기·체류 및 자동차 출발지 복귀 포함. 실제 주차 위치는 여행 시작 후 직접 저장.
- 취향/조건 수정 시 제안 무효화, 늦은 응답 폐기, 만료/시작 시각 확인, 기존 여행 보호. 전체 500자 취향 설명과 촬영 안내 저장·복원, 재추천에 전달.
- 신규/기존 단위 검사 총 33개, 신규 브라우저 검사와 기존 4개 브라우저 검사, 실제 로컬 도보 API 검사 통과. 타입 검사·전체 lint·build 통과.
- 상세 동작/제약/검증: photo-course-generation.md. 미래 방문일 배차·실제 날씨·공휴일/임시 휴관은 자동 확인하지 않음. 실제 자동차/대중교통 연동은 후속 검증 필요.
- 다음은 13단계 통합 검증. D:/motion 보존, 커밋/push/병합 없음.
