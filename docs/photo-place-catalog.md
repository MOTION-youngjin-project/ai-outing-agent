# 10단계 대구 촬영 장소 카탈로그

확인일: 2026-09-17. 구현: src/lib/data/daegu-photo-places.ts. 초기 6곳, 코드 관리 방식이며 DB 마이그레이션/운영 DB 입력 없음.

| 장소 | 분류 | 위치·특징 출처 |
|---|---|---|
| 김광석다시그리기길 | 야외 벽화·골목 | https://english.visitkorea.or.kr/svc/contents/contentsView.do?vcontsId=75464 |
| 수성못 | 야외 호수 | https://english.visitkorea.or.kr/svc/contents/contentsView.do?vcontsId=68482 |
| 아양기찻길 | 야외 철교 보행 구간 | https://english.visitkorea.or.kr/svc/contents/contentsView.do?vcontsId=60210 |
| 청라언덕 | 야외 정원·근대 건축 외관 | https://english.visitkorea.or.kr/svc/contents/contentsView.do?vcontsId=57452 |
| 대구미술관 | 실내, 촬영 허용 확인 필요 | https://english.visitkorea.or.kr/svc/contents/contentsView.do?vcontsId=78255 |
| 대구예술발전소 | 실내, 촬영 허용 확인 필요 | https://english.visitkorea.or.kr/svc/contents/contentsView.do?vcontsId=177434 |

## 출처와 해석

- 위 한국관광공사 페이지의 HTML 구조화 데이터 latitude/longitude를 읽어 대표 좌표를 확보했다. 촬영 포인트/입구 좌표가 아니며 임의 지오코딩 수치를 넣지 않았다.
- 주소·장소 특징은 공공 관광안내, 운영 안내는 시설 공식 홈페이지 우선. 미술관과 예술발전소의 VISITKOREA 10~18시 안내보다 공식 계절별 운영 안내를 우선했다.
- 대구미술관 공식 관람시간/휴관/입장 마감: https://daeguartmuseum.or.kr/index.do?menu_id=00000743
- 대구예술발전소 공식 관람안내: https://www.daeguartfactory.kr/front/ (입장 마감 문구가 모호하여 정확한 마감 분 단위는 확정하지 않음)
- 청라언덕 내부 임시휴관 안내 이력: https://english.visitkorea.or.kr/svc/contents/contentsView.do?vcontsId=248198 . 야외 외관 구간만 대상으로 하며 박물관 개방 여부를 다시 확인하도록 안내.
- 아양기찻길 세부 개방 시간은 미확인으로 명시. 카페가 있다는 이유로 야외 촬영 구간을 실내 대안으로 분류하지 않음.
- 태그·권장 시간대·체류 시간·구도 팁은 motion의 편집 제안이다. 공식 촬영 허가나 현장 실사 결과가 아니다. 특정 작품 전시/촬영 허가/일몰 시각/현재 영업 여부를 확정하지 않는다.

## 재사용 계약

- PhotoPlace: 독립 photo:slug 식별자, 이름/별칭/주소/대표좌표, 촬영 구간 실내외, 태그, 추천 시간대, 제안 체류분, 운영/휴무 안내, 촬영 팁/유의점, 출처/확인일.
- 기존 Prisma Place ID와 별개이며 임의로 연결하지 않는다. 향후 코스 생성에서는 이름·주소·대표좌표를 함께 활용해 실제 장소/입구와 경로를 확인한다.
- GET /api/photo-places: 전체 조회. tag(정의된 한국어 태그), environment(indoor/outdoor) 선택 조건. 교집합 필터, 빈 결과 허용. 미지원·중복 조건은 400.
- /photo에 서버 렌더링 목록 연결. 기존 사진 파일 입력 유지, 분석/취향 자동 추천과는 아직 연결하지 않음.
- 시간대는 daylight/before-sunset/after-sunset 구분만 저장한다. 12단계에서 방문 날짜/일몰/날씨와 조합해야 하며 현재 시각 기반 영업 여부 계산은 하지 않는다.

## 검증

- npx tsx --test scripts/photo-places-check.ts: 5개 통과 (실내 분류, 교집합, 빈 결과, 잘못된 조건, 실시간 상태 비확정).
- npx tsx scripts/photo-places-browser-check.ts: 6곳 표시, 상세 펼침, 운영 안내, 출처 링크, 사진 입력 공존, 모바일 가로 넘침 없음.
- npx tsx scripts/photo-input-browser-check.ts: 기존 사진 입력 회귀 통과.
- npx next typegen, npx tsc --noEmit, npm run lint, npm run build 통과.
- 화면 증거: test-results/photo-place-catalog-mobile.png. 실제 현장 실사 및 운영 DB 통합은 미실시.
