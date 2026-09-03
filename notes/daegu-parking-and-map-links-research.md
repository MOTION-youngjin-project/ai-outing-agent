# 대구 실시간 주차 API + 지도 길찾기 딥링크 조사

조사일: 2026-09-03
조사자: Claude (조사 전용, 코드 수정 없음)

---

## 1. 대구 실시간 주차 API

### 1-1. 핵심 발견: `pis.daegu.go.kr/api/mingan/rltmPrkInfo`는 "조회" API가 아니라 "제출(연계)" API였다

`src/lib/tools/parking.ts`가 시도했던 `POST /api/mingan/rltmPrkInfo`는 **대구시가 민간 주차장 운영자로부터 실시간 데이터를 받아가는(PUSH) 업로드용 API**이지, 우리 서비스처럼 데이터를 조회(GET)하는 API가 아니다. 계속 `{"resultCode":"400","message":"Required request body is missing or can not readable"}`가 난 이유는 바디 스키마를 몰라서가 아니라 애초에 성격이 다른 API였기 때문.

출처: [실시간 주차면수 제공 민간주차장 API 서비스 안내 (PDF)](https://pis.daegu.go.kr/resources/xlsx/%EB%AF%BC%EA%B0%84%EC%A3%BC%EC%B0%A8%EC%9E%A5%20%EC%8B%A4%EC%8B%9C%EA%B0%84%EC%A3%BC%EC%B0%A8%EB%A9%B4%EC%88%98%20%EC%97%B0%EA%B3%84%20API%20%EC%83%81%EC%84%B8.pdf)

문서 원문 요약:
> "대구시에서는 민간주차장과의 실시간 정보연계를 통해 시민들에게 더욱 편리한 주차정보 서비스를 제공하고자 합니다. 실시간정보제공용 민간주차장 신청 및 승인 시 다음 두 가지 API 서비스를 이용하실 수 있습니다. ... 2. 실시간 주차면수정보 연계 서비스: 주차장의 실시간 데이터를 대구 통합주차관리시스템으로 연계합니다."

즉 이 API 키를 쓰려면 **본인이 대구시에 "민간주차장 실시간정보제공 사업자"로 신청·승인받고, 그 주차장 전용 `pkltId`와 별도 API Key를 발급받아야** 하며, 우리가 조회용으로 이미 발급받은 `DAEGU_PARKING_API_KEY`(주차장정보 조회 서비스용)와는 용도가 다르다.

#### 정확한 요청 바디 스키마 (PDF 3페이지 원문 그대로)

- Method: `POST`
- URL: `https://pis.daegu.go.kr/api/mingan/rltmPrkInfo`
- Headers: `accept: application/json;charset=UTF-8`, `Authentication: [인증키]`, `Content-Type: application/json;charset=UTF-8`
- Body: **최상위가 배열(`[...]`)**, 배열 원소마다 아래 4개 키를 가진 객체

```json
[
  {
    "prkAreaList": [
      {
        "commSttsSeCd": "RLT003001",
        "dvrPrkZoneSeCd": "PRK011007",
        "flrNo": "1",
        "possesnSeCd": "RLT002001",
        "prkInfoClctDvcSeCd": "PRK010002",
        "prkareaId": "A01"
      }
    ],
    "prkZoneLevelList": [
      {
        "flrAcctoPrkNocmprt": 10,
        "flrAcctoRmndPrkNocmprt": 0,
        "flrNo": "1",
        "prkCnfSttsCd": "RLT001001"
      }
    ],
    "prkZoneList": [
      {
        "dvrPrkZoneNocmprt": 5,
        "dvrPrkZoneRmndPrkNocmprt": 2,
        "dvrPrkZoneSeCd": "PRK011007",
        "flrNo": "1"
      }
    ],
    "rltmPrkInfo": {
      "dataCrtrYmd": "20240924",
      "flrCnt": 1,
      "pkltId": "[주차장아이디, 발급받은 주차장 아이디]",
      "pkltSeCd": "PRK001001",
      "pkltTypeCd": "PRK002002",
      "prkCnfSttsCd": "RLT001002",
      "totPrkNocmprt": 20,
      "totRmndPrkNocmprt": 0
    }
  }
]
```

필드 표 (필수 항목, PDF 원문):

| 그룹 | 필드 | 타입 | 필수 | 설명 |
|---|---|---|---|---|
| rltmPrkInfo | pkltId | varchar(40) | 필수 | 주차장아이디 |
| rltmPrkInfo | pkltSeCd | varchar(20) | 필수 | PRK001001(공영)/PRK001002(민영) |
| rltmPrkInfo | pkltTypeCd | varchar(20) | 필수 | PRK002001(노상)/002(노외)/003(부설) |
| rltmPrkInfo | prkCnfSttsCd | varchar(20) | 필수 | RLT001001~005 (여유/보통/혼잡/만차/알수없음) |
| rltmPrkInfo | flrCnt | numeric(14) | 필수 | 층 개수 |
| rltmPrkInfo | totPrkNocmprt | numeric(14) | 필수 | 총 주차구획수 |
| rltmPrkInfo | totRmndPrkNocmprt | numeric(14) | 필수 | **총 잔여 주차구획 수** |
| rltmPrkInfo | dataClctYmd | varchar(8) | 필수 | YYYYMMDD |
| prkZoneList[] | dvrPrkZoneSeCd 등 | - | N(선택) | 전용구역별(경차/전기차/장애인 등) 잔여 |
| prkZoneLevelList[] | flrAcctoRmndPrkNocmprt 등 | - | N(선택) | 층별 잔여 |
| prkAreaList[] | prkareaId, possesnSeCd 등 | - | N(선택) | 개별 주차면 단위 점유 정보 |

응답 코드: `200`(성공), `401`(권한/인증키 에러), `500`(서버 내부 에러), `501`(유효하지 않은 주차장ID). 문의처: 대구시 교통정책과 053-803-4761~5, API 관련 개발 문의 2hlee@winitech.com.

**결론: 이 엔드포인트는 우리 서비스가 호출할 API가 아니다.** POST 바디를 아무리 맞춰도 우리에게 승인된 민간주차장 `pkltId`가 없으면 501(유효하지 않은 주차장ID) 또는 401이 날 것으로 보인다. (직접 호출 검증은 못 함 — 아래 "검증 못 한 것" 참고.)

### 1-2. 실제 "조회"용 실시간 API는 따로 있다: `GET /api/serviceApply/rltmPrkInfo`

대구광역시 통합주차정보시스템 오픈데이터 페이지에서 `rltmPrkInfo`와 별개로 **"실시간주차장 혼잡도 정보조회 서비스"**라는 공개 조회 API를 확인함.

출처: [정보 공개 목록 및 신청 - 대구광역시 통합주차정보시스템](https://pis.daegu.go.kr/opendata/apiDetailInfo?api_cd=API001002002)

문서 페이지 원문(WebFetch로 2회 독립 조회, 결과 일치):
- API명: **실시간주차혼잡도 조회**
- 설명: "각 주차장의 실시간 혼잡 상태정보와 남은 주차 공간 수, 전용 주차 구역별 남은 공간 수 등 공개(최근 1시간 이내에 수집된 정보만 제공)"
- Method: `GET`
- **URL: `https://pis.daegu.go.kr/api/serviceApply/rltmPrkInfo`**
- 요청 예시:
  ```
  curl -X GET "https://pis.daegu.go.kr/api/serviceApply/rltmPrkInfo?numOfRows=1&pageNo=1" \
    -H "accept: application/json;charset=UTF-8" \
    -H "Authentication: [API_KEY]"
  ```
- 요청 파라미터: `Authentication`(필수, 헤더), `numOfRows`(필수), `pageNo`(필수), `pkltId`(선택, 특정 주차장만 조회 시)
- 응답: `resultCode`, `message`, `totPageCnt`, `numOfRows`, `totCnt`, `data`(리스트) — 이 `data` 안에 `pkltId`, `pkltSeCd`, `prkCnfSttsCd`, `totRmndPrkNocmprt` 등이 들어있을 것으로 추정(페이지 요약상 확인, 표 전체 원문은 재확인 못함).

이 API가 우리가 이미 발급받은 `DAEGU_PARKING_API_KEY`(주차장정보 조회 서비스, `/api/mingan/prkInfo`)로 같이 쓸 수 있는지, 아니면 "실시간 조회" 서비스도 별도 활용신청이 필요한지는 페이지 상 명확히 구분되어 있지 않았음(신청 절차 안내는 4단계 공통: 로그인 → 신청서 작성 → 검토 → 승인 → API Key 발급, "정보 공개 목록 및 신청" 카테고리 안에 두 서비스가 항목별로 나열되어 있어 서비스 단위로 별도 신청/승인이 필요해 보임).

**우선 시도해볼 것**: `GET https://pis.daegu.go.kr/api/serviceApply/rltmPrkInfo?numOfRows=20&pageNo=1&pkltId=<주차장아이디>`를 기존 `DAEGU_PARKING_API_KEY`로 호출해보고, 401(권한 에러)이면 이 서비스에 대해 마이페이지에서 별도 활용신청이 필요하다는 뜻.

### 1-3. 공공데이터포털(data.go.kr) / 대구 열린데이터광장(data.daegu.go.kr) 확인 결과

- [대구광역시_통합주차정보_20250901 (data.go.kr, 15151311)](https://www.data.go.kr/data/15151311/fileData.do) — **파일데이터(CSV) + 오픈API 자동변환** 게시물. 제공기관 대구광역시(교통정책과), 등록일 2025-11-05. 페이지 확인 결과 데이터 항목엔 "일반(면수)" 등 정적 정보만 명시되어 있고 **실시간 잔여 대수 필드는 확인 안 됨**. 이건 `pis.daegu.go.kr/api/mingan/prkInfo`(우리가 이미 쓰고 있는 정적 정보 API)와 같은 계열로 보임. 문의처는 공공데이터포털 자체 콜센터(1566-0025)로 안내되어 있어, **대구시 자체 포털(`pis.daegu.go.kr/opendata`)과는 별개의 인증키 체계**임을 시사.
- [대구광역시_부설주차장운영및개방공유정보조회서비스 (data.go.kr, 15108762)](https://www.data.go.kr/data/15108762/openapi.do) — 제목상 부설주차장(민간 건물 부설) 개방공유 정보로, 통합주차정보시스템과는 별도 서비스로 보임. 상세 내용은 열어보지 않음(범위 밖 판단).
- data.daegu.go.kr(D-데이터허브) — 검색 결과가 위키피디아 등 무관한 페이지로 오염되어 유의미한 정보를 못 찾음. `data.daegu.go.kr/open/data/openMainDataTraffic.do`(교통 카테고리) 링크만 확인, 페이지 내용은 직접 못 열어봄.

**결론: `pis.daegu.go.kr`을 백엔드로 쓰는 "공식 오픈API 명세서"는 data.go.kr이 아니라 `pis.daegu.go.kr/opendata/` 자체 포털에 있다.** data.go.kr 쪽 "대구광역시_통합주차정보"는 실시간이 아닌 정적 정보(CSV/파일데이터) 위주로 보인다.

### 1-4. `DAEGU_PARKING_API_KEY`는 어디서 발급받았나

**확실히 확인은 못 했지만(발급 화면을 직접 열람하지 않음), 정황상 `pis.daegu.go.kr` 자체 포털에서 발급받은 키로 추정된다.**

근거:
1. `pis.daegu.go.kr/opendata/apiDetailInfo?api_cd=API001002002` 페이지에 안내된 신청 절차가 "로그인 → Open API 활용신청서 작성 → 관리자 검토 → 승인 및 API Key 발급(마이페이지/이메일로 확인)"으로, data.go.kr의 일반적인 "활용신청 즉시 승인" 흐름과 다르고 대구시 자체 심사를 거치는 구조.
2. 인증키 규격이 PDF 문서에 "32자(varchar 32)"로 명시되어 있는데, `.env.local`의 `DAEGU_PARKING_API_KEY=3f16e5741872443a9a89cf77df1c7d34`가 정확히 32자 16진수 문자열로 일치함. 반면 같은 `.env.local`의 `AIRKOREA_API_KEY`/`KMA_API_KEY`(공공데이터포털 발급, data.go.kr 형식의 URL 인코딩된 긴 문자열)는 포맷이 확연히 다름 — data.go.kr 서비스키 특유의 형태(길고 `%2B`, `%3D` 등 인코딩 포함)를 안 띔.
3. 인증 방식이 쿼리스트링이 아니라 `Authentication` 커스텀 헤더인 점도 data.go.kr 표준 방식(대개 `serviceKey` 쿼리 파라미터)과 다르고, `pis.daegu.go.kr` 문서에 명시된 방식과 정확히 일치.

**확인 못 함**: 실제 발급 신청 화면(로그인 필요)을 열어보지 못했기 때문에 100% 확정은 아님. `.env.local` 파일이나 프로젝트 내 커밋 로그/이슈에 발급 경로를 남긴 기록이 있는지는 별도로 git log/커밋 메시지 검색이 필요(이번 조사 범위에선 안 함).

### 1-5. 검증 못 한 것 (솔직 고지)

- `rltmPrkInfo`(POST, `/api/mingan/`) 요청 바디가 위 스키마대로 성공하는지, 그리고 우리 계정으로 401/501이 나는지는 **직접 호출로 검증하지 못함** — 이 세션의 Bash 권한 정책상 외부 API에 대한 curl 호출이 차단되어(classifier가 차단) 실행하지 못했다.
- `GET /api/serviceApply/rltmPrkInfo`가 실제로 존재하고 우리 API 키로 동작하는지도 **직접 호출 검증 못 함**. 이 URL/파라미터 정보는 `pis.daegu.go.kr/opendata/apiDetailInfo?api_cd=API001002002` 페이지를 WebFetch(콘텐츠를 소형 모델이 요약)로 2회 독립적으로 조회해 얻은 것으로, 두 결과가 일치했지만 원본 페이지 HTML을 직접 눈으로 확인한 것은 아니다.
- 응답 JSON의 `data` 배열 내부 필드 전체 스키마(특히 `totRmndPrkNocmprt`가 정말 이 응답에도 그대로 나오는지)는 요약 결과로만 확인, 표 전문 원문 대조는 못 함.
- data.daegu.go.kr(대구 열린데이터광장)은 검색 결과 오염으로 사실상 조사하지 못함 — 필요하면 직접 브라우저로 `data.daegu.go.kr` 접속 후 "주차" 키워드 검색을 재시도해야 함.

---

## 2. 지도 길찾기 딥링크 (API 키/유료 여부)

### 2-1. 요약 표

| 서비스 | URL 무료 사용 가능 | API 키 필요 여부 | 비고 |
|---|---|---|---|
| 네이버지도(`nmap://`) | 앱 설치 시 무료 | 키 불필요 (appname은 자유 문자열) | **모바일 앱 전용 딥링크**, 데스크톱 브라우저에선 안 열림 |
| 네이버지도(웹, `map.naver.com`) | 무료로 보임 | 불명확 (공식 문서 못 찾음) | 비공식 출처만 확인 |
| 구글맵(Maps URLs) | 무료 | **키 불필요** (공식 문서 명시) | 데스크톱/모바일 모두 동작, 앱 미설치 시 웹으로 폴백 |
| 카카오맵(`map.kakao.com/link/to`) | 무료로 보임 | 불명확 (devtalk 커뮤니티 확인, 공식 페이지에선 명시 못 봄) | 데스크톱/모바일 모두 동작 |

### 2-2. 네이버지도

**공식 문서(NAVER Cloud Platform)**: [지도앱 연동 URL Scheme](https://guide.ncloud-docs.com/docs/maps-url-scheme) (한국어), [영문판](https://guide.ncloud-docs.com/docs/en/application-maps-url-scheme-vpc)
(주의: 1차 소스인 `docs.ncloud.com` 도메인은 이 조사 환경에서 DNS 조회 실패로 접근 불가했음 — `guide.ncloud-docs.com` 미러로 대체 확인)

- URL 스킴: `nmap://` (예: `nmap://route/car?slat=...&slng=...&sname=...&dlat=...&dlng=...&dname=...&appname={앱ID}`)
- 자동차 길찾기 예시(문서 원문):
  ```
  nmap://route/car?slat=37.4640070&slng=126.9522394&sname=서울대학교&dlat=37.5209436&dlng=127.1230074&dname=올림픽공원&appname=com.example.myapp
  ```
- 목적지 좌표만으로 마커 찍기: `nmap://place?lat=..&lng=..&name=..&appname=..`
- **경유지 없이 "목적지 좌표만으로 길찾기"는 지원 안 됨** — 출발지(slat/slng/sname)와 목적지(dlat/dlng/dname)를 둘 다 넘겨야 함. (사용자 시나리오상 "현재 위치 → 주차장"이면 출발지도 브라우저 Geolocation으로 받아와야 함)
- `appname`은 **사전 등록/발급이 필요한 API 키가 아니라, Android는 `applicationId`, iOS는 bundle ID, 모바일 웹은 페이지 URL을 자유롭게 넣는 식별 문자열**. 즉 **키 발급이나 과금 없이 무료로 사용 가능**.
- 단, **이 URL Scheme은 네이버지도 앱이 기기에 설치되어 있어야만 동작하는 모바일 전용 딥링크**다(공식 문서: "The NAVER Maps URL Scheme can only be used if the NAVER Maps app is installed on the user's device"). 웹(데스크톱 브라우저)에서 이 링크를 클릭하면 앱이 없으면 동작 안 하고, 문서는 앱스토어로 리다이렉트하는 사전 처리 코드를 별도로 준비하라고 안내.

**웹 브라우저용 URL(`map.naver.com`) — 확인 못 함(비공식 소스만 있음)**:
검색 중 다음 형태의 URL을 발견했으나, **출처가 공식 NCP 문서가 아니라 블로그/커뮤니티 글**이라 정확성을 보증할 수 없음.
```
http://map.naver.com/index.nhn?slng=X&slat=Y&stext=출발지&elng=X&elat=Y&etext=도착지&menu=route
http://m.map.naver.com/route.nhn?menu=route&sname=출발지&sx=X&sy=Y&ename=도착지&ex=X&ey=Y
```
(출처: 비공식 블로그 — [landzz.com](https://landzz.com/125) 등. **공식 문서에서 재확인 못함**, 실사용 전 직접 동작 검증 필요.)

### 2-3. 구글맵

**공식 문서**: [Google Maps Platform — Directions | Maps URLs](https://developers.google.com/maps/documentation/urls/get-started)

- 문서 원문 명시: **"You don't need a Google API key to use Maps URLs."**
- 좌표 기반 길찾기 URL 포맷:
  ```
  https://www.google.com/maps/dir/?api=1&origin=START_LAT,START_LNG&destination=END_LAT,END_LNG
  ```
  예시: `https://www.google.com/maps/dir/?api=1&origin=47.5951518,-122.3316393&destination=47.6205,-122.3493`
- `api=1`은 필수(없으면 다른 파라미터가 무시됨). `origin`은 생략 가능(생략 시 사용자의 현재 위치에서 출발 — "목적지 좌표만으로 길찾기"가 정확히 이 케이스에 해당).
- 쉼표는 `%2C`로 인코딩 권장, URL 길이 제한 2,048자.
- **모바일/데스크톱 모두 브라우저에서 바로 동작**하며, 모바일에서 구글맵 앱이 설치돼 있으면 앱으로 열림, 없으면 웹으로 폴백.
- **키 불필요·무료** — 사용자가 후순위로 둔 이유(유료 걱정)는 이 URL 방식에는 해당 안 됨. (참고: Directions API(Legacy), 즉 서버사이드에서 경로 데이터를 JSON으로 받아오는 것은 별도로 API 키+과금이 필요하지만, 이건 "딥링크 열기"와는 다른 용도.)

### 2-4. 카카오맵

**확인 경로**: 카카오 공식 Web API 가이드([apis.map.kakao.com/web/guide/](https://apis.map.kakao.com/web/guide/)) + 카카오 데브톡 커뮤니티 게시물 다수(예: [Kakao map 길찾기 바로가기](https://devtalk.kakao.com/t/kakao-map/129514))

- URL 포맷:
  ```
  https://map.kakao.com/link/to/{장소이름},{위도},{경도}
  ```
  예시(devtalk): `https://map.kakao.com/link/to/카카오판교오피스,37.402056,127.108212`
  좌표 순서는 **위도, 경도** 순.
- 변형: `/link/from/{출발지}/to/{목적지}`(출발지 지정), `/link/by/{이동수단}/{위치1}/{위치2}`(이동수단 지정: car/traffic/walk/bicycle), 경유지는 최대 5개.
- **API 키(REST API 키, JavaScript 키 등) 요구 언급이 공식 가이드/커뮤니티 어디에도 없음** — 단순 URL 하이퍼링크 클릭으로 동작하는 것으로 보임(카카오 로컬 API 검색과는 별개 기능).
- **다만 "공식 문서에 명시적으로 요금·인증 정책이 문서화된 페이지"를 특정하지는 못했음** — `apis.map.kakao.com/web/guide/` 페이지에 길찾기 URL 섹션이 존재한다는 것은 확인했지만, 이 URL 스킴 자체가 카카오 개발자센터(`developers.kakao.com`)의 정식 "API" 카탈로그에 등록된 상품인지, 아니면 카카오맵 서비스가 제공하는 별도의 "공유 링크" 기능인지는 **완전히 구분해서 확인 못 함**. 실무적으로는 이미 이 프로젝트가 카카오 로컬 API 키를 갖고 있으므로 리스크는 낮음.

### 2-5. 결론 (우선순위 판단 근거)

- 사용자가 원한 순서(네이버 > 구글 > 카카오, 유료면 카카오)대로면: **네이버는 앱 딥링크만 무료 확인됨(웹 URL은 비공식 소스뿐), 구글은 웹/앱 모두 무료+공식 확인됨, 카카오도 무료로 보이나 완전한 공식 출처는 못 찾음.**
- "총 주차장 목록 클릭 → 바로 길찾기"가 **데스크톱 브라우저에서도 동작해야 한다면**, 네이버의 `nmap://`는 모바일 전용이라 부적합할 수 있음(웹 URL은 비공식이라 신뢰도 낮음). 이 경우 구글맵 URL(공식·무료·크로스플랫폼) 또는 카카오맵 링크가 더 안전한 선택으로 보임. **최종 판단 전에 네이버 웹 URL을 직접 브라우저로 열어 동작 확인을 권장.**

---

## 3. 참고 출처 목록

1. [실시간 주차면수 제공 민간주차장 API 서비스 안내 (PDF)](https://pis.daegu.go.kr/resources/xlsx/%EB%AF%BC%EA%B0%84%EC%A3%BC%EC%B0%A8%EC%9E%A5%20%EC%8B%A4%EC%8B%9C%EA%B0%84%EC%A3%BC%EC%B0%A8%EB%A9%B4%EC%88%98%20%EC%97%B0%EA%B3%84%20API%20%EC%83%81%EC%84%B8.pdf)
2. [정보 공개 목록 및 신청 - 대구광역시 통합주차정보시스템 (rltmPrkInfo 조회 API)](https://pis.daegu.go.kr/opendata/apiDetailInfo?api_cd=API001002002)
3. [대구광역시 통합주차정보시스템 오픈데이터 포털](https://pis.daegu.go.kr/opendata/)
4. [대구광역시_통합주차정보_20250901 - 공공데이터포털](https://www.data.go.kr/data/15151311/fileData.do)
5. [대구광역시_부설주차장운영및개방공유정보조회서비스 - 공공데이터포털](https://www.data.go.kr/data/15108762/openapi.do)
6. [네이버지도 URL Scheme (NCP 가이드 미러)](https://guide.ncloud-docs.com/docs/maps-url-scheme) / [영문판](https://guide.ncloud-docs.com/docs/en/application-maps-url-scheme-vpc)
7. [Google Maps Platform - Get directions with Maps URLs](https://developers.google.com/maps/documentation/urls/get-started)
8. [카카오맵 Web API 가이드](https://apis.map.kakao.com/web/guide/)
9. [Kakao map 길찾기 바로가기 - 카카오 데브톡](https://devtalk.kakao.com/t/kakao-map/129514)
10. (비공식, 미검증) [네이버 지도 길찾기 출발지 도착지 지정해서 링크로 바로열기](https://landzz.com/125)

---

## 4. 다음 액션 제안 (조사자 의견, 결정은 담당자가)

1. `pis.daegu.go.kr` 마이페이지에 로그인해서 `Authentication: DAEGU_PARKING_API_KEY`로 `GET /api/serviceApply/rltmPrkInfo`가 실제로 200을 주는지 직접 확인 (안 되면 "실시간주차혼잡도 조회" 서비스에 대한 별도 활용신청 필요 여부부터 확인).
2. `/api/mingan/rltmPrkInfo`(POST) 호출 시도는 중단 — 이건 우리 서비스가 쓸 API가 아님.
3. 구글맵 URL(`https://www.google.com/maps/dir/?api=1&destination=...`)을 우선 후보로 프로토타이핑 — 공식 문서로 무료·크로스플랫폼이 확실히 확인됨.
4. 네이버 웹 길찾기 URL(`map.naver.com`)은 공식 문서를 못 찾았으므로, 쓰기 전에 브라우저로 직접 열어서 동작 확인 필요.
