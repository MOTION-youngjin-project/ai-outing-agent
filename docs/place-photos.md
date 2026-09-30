# 장소 사진 자동 조회와 출처 표시

## 현재 구현

장소 ID로 DB의 이름·좌표를 읽고 사진을 별도 API로 조회한다. AI 호출, 유료 API,
DB 마이그레이션, 사진 파일 저장은 없다. 추천 결과를 기다리게 하지 않고 화면에서 나중에 표시한다.
사진 URL이 비어 있던 과거 추천·저장 코스도 장소 ID가 있으면 조회할 수 있다.

1. Wikidata의 이름/별칭과 저장된 장소명이 일치하고 좌표가 300m 이내인 항목의 P18 대표 사진 조회.
2. Commons의 300m 이내 사진 최대 12개 중 파일명/설명에 장소명이 포함된 사진 조회.
3. 관리자가 확인해 등록한 공식·점주 사진을 동일 장소 ID로 합침.
4. 사용 조건에 맞는 후보 중 출처에 기재된 촬영일이 최근인 사진 선택. 촬영일 미상은 뒤로 배치.

1·2는 자동 조회이며 3은 승인된 등록 목록이다. 공식 홈페이지 자동 크롤링이나
점주·사용자 공개 업로드/심사 화면은 구현하지 않았다. 현재 승인 목록은 비어 있다.
사진 공급자 메타데이터가 잘못 기재될 가능성은 있으며, 자동 판단이 모든 권리나 장소 일치를 보장하지 않는다.

## 이용 조건

자동 조회 사진은 CC BY 3.0/4.0, CC BY-SA 3.0/4.0, CC0 1.0만 허용한다.
출처·촬영자·라이선스가 없거나 별도 제한 표시가 있으면 제외한다.
이미지 호스트는 upload.wikimedia.org와 thumb.wikimedia.org로 제한한다.
외부 HTML은 실행하지 않고 텍스트로 표시한다. 사진을 자르거나 덧그리지 않고 비율 유지 축소한다.
사진 아래 "사진 출처·이용 조건"에서 제목·촬영자·크레딧·원본·라이선스·촬영일을 확인한다.
등록 사진에는 원본 및 이용허락 근거 링크가 필요하다.

기존 imageUrl이나 PlaceImage에 URL만 있고 이용 조건·촬영자 정보가 없는 사진은
자동으로 신뢰하지 않는다. 검토된 사진은 아래 등록 경로로 보완한다.

## 승인 사진 등록

`src/lib/data/approved-place-photos.json`에 관리자가 검토한 레코드를 추가한다.
이는 방문자가 아무 URL이나 제출하는 공개 API가 아니며 변경 배포 후 적용된다.
사진 촬영자/점주로부터 상업적 웹 표시 및 필요한 축소 표시 허락을 확인해야 한다.
점주라는 이유만으로 다른 촬영자의 사진을 허락할 수 있다고 간주하지 않는다.

필드 예시(실제 허락 자료와 장소 ID로 교체한 뒤 등록):

```json
{
  "placeId": "DB의 publicId",
  "source": "owner",
  "url": "https://example.com/photo.jpg",
  "sourceUrl": "https://example.com/photo-page",
  "title": "장소 전경",
  "author": "촬영자",
  "credit": "제공자 및 필요한 고지",
  "license": "상업적 웹 표시 허락",
  "licenseUrl": "https://example.com/permission",
  "permissionEvidence": "https://example.com/permission",
  "consentConfirmed": true,
  "reviewedAt": "2026-09-22T00:00:00Z",
  "capturedAt": "2026-09-01"
}
```

source는 `official` 또는 `owner`. 촬영일을 모르면 capturedAt은 null.
미래/잘못된 날짜는 촬영일로 쓰지 않는다. 업로드/수정 날짜를 촬영일로 대체하지 않는다.
허락 근거의 존재 여부만 코드로 확인하므로 실제 문서 검토는 관리자 책임이다.

## 갱신·장애

조회 성공은 서버 메모리 1시간, 결과 없음/실패는 5분 캐시한다. 만료 후 다음 조회에서 갱신한다.
예약 수집 작업은 없다. 동일 조회는 합치며 최대 동시 20개·캐시 300개로 제한한다.
브라우저 쿼리는 5분간 재사용한다. 서버 재시작 시 메모리 캐시는 비워진다.
사진 없거나 이미지 다운로드가 실패하면 기본 아이콘을 표시한다.

## 검증

```powershell
node --import tsx --experimental-test-module-mocks --test scripts/place-photo-check.tsx
# Playwright Chromium 설치 환경은 기본값. 이 PC에서는 설치된 Edge 사용:
$env:PLAYWRIGHT_CHANNEL='msedge'
npx tsx scripts/place-photo-browser-check.ts
npm run lint
npm run build
```

기본/확장 검사 8개 통과: 이용 조건 필터, 촬영일 정렬, 승인 등록, 장소 일치,
동시 조회/실패 캐시, 출처 렌더링, API 인증.
브라우저 컴포넌트 테스트 통과: 정상 사진, 없는/깨진 사진 대체, 출처 링크와 촬영일.
브라우저 테스트는 모의 이미지/API를 사용하며 로그인한 운영 사이트 전체 E2E 테스트는 아니다.

2026-09-22 실제 메타데이터 조회:
- 국립대구박물관: Trainholic / CC BY-SA 3.0 / 2015-10-25 촬영.
- 계산성당: 기여자 / CC BY-SA 4.0 / 2017-09-29 촬영. 기존 P18 2013년 사진보다 최근 후보 선택.
- 수성못: 조건에 맞는 결과 없음.

따라서 확보율 또는 최신성 개선 비율을 주장하지 않는다. 일반 매장·신규 가게는 누락될 수 있다.

## 남은 실행 목록

1. 사용자 비용 결정 후 개발 담당자가 유료 장소 사진 API 연결을 별도로 검토한다. 아직 연결/과금 없음.
2. 운영 담당자가 기존 DB 사진의 사용 근거를 검토하고 승인 목록에 등록한다.
3. 공개 사진 제출·업로드·관리자 심사 화면은 별도 구현 범위를 정한다.
4. 운영 담당자가 병합·배포 후 실제 로그인 화면과 사진 확보율을 확인한다. 현재 운영 배포 안 됨.

공식 참고: https://commons.wikimedia.org/wiki/Commons:Reusing_content_outside_Wikimedia
https://creativecommons.org/licenses/by/4.0/ · https://creativecommons.org/licenses/by-sa/3.0/
