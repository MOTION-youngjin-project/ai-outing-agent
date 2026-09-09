# 타 팀 스택 조사 — Vertex AI / Transitous / Voyage AI+Pinecone / Google Search Grounding

조사일: 2026-09-09
조사 목적: 같은 수업의 다른 캡스톤 팀 발표 슬라이드에 나온 기술 스택(Vertex AI, Transitous, Voyage AI+Pinecone, Google Search Grounding, Google Maps 계열)을 우리 프로젝트가 실제로 겪고 있는 문제(LLM 무료 쿼터 고갈, 대중교통 길찾기 부재, RAG 설비, 할루시네이션)에 대입해서 "가져다 쓸 가치가 있는가"를 평가. 슬라이드에 있다고 좋은 게 아니라, 우리 문제를 실제로 푸는지가 기준.

**조사 방식 참고**: WebSearch + 1차 출처(Google 공식 docs, Transitous 공식 GitHub, Voyage AI/Pinecone 공식 pricing 페이지) 직접 fetch. 일부 Google 공식 페이지는 동적 렌더링/페이지 축약 때문에 WebFetch가 정확한 표(요금표, rate limit 표)를 못 읽어 검색 스니펫(2차 요약) 수준으로만 확인된 부분이 있음 — 해당 항목은 본문에 명시.

---

## 0. 우리 프로젝트 현재 구현 (비교 기준)

비교 없이 남의 스택만 설명하는 건 의미가 없어서, 먼저 코드로 확인한 현재 상태를 정리한다.

- **LLM**: `src/lib/agent.ts` — `@langchain/google-genai`의 `ChatGoogleGenerativeAI`, `GEMINI_API_KEY`(AI Studio 무료 API 키)로 직접 호출. 모델 폴백 체인 `gemini-3.6-flash → gemini-3.5-flash → gemini-3.1-flash-lite → gemini-3.5-flash-lite`, 시도당 25초 타임아웃, 실패 모델 60초 쿨다운 캐시(인메모리 Map).
- **RAG 임베딩**: `scripts/build-rag-index.ts`가 `GoogleGenerativeAIEmbeddings`(model: `gemini-embedding-001`, 같은 `GEMINI_API_KEY`)로 `src/lib/rag/documents.ts`의 하드코딩 문서 9건을 임베딩해서 `src/lib/rag/index.json`에 정적 캐싱.
- **RAG 검색**: `src/lib/tools/facilityInfo.ts` — 벡터 DB 없이 `index.json`을 통째로 읽어와 코사인 유사도를 for 루프로 직접 계산, top-3 반환. Pinecone은커녕 pgvector도 아니고 순수 JS 배열 순회.
- **RAG용 Prisma 테이블**: `prisma/schema.prisma`에 `RagDocument`/`RagChunk`(`embedding Json?` 컬럼 있음)/`RagRetrieval`이 정의돼 있지만, 실제 런타임 검색 경로(`facilityInfo.ts`)는 이 테이블을 안 쓰고 정적 `index.json`만 읽는다 — 스키마는 준비돼 있는데 배선이 안 된 상태로 보인다(이번 조사 범위 밖이라 사실 확인만 해두고 넘어감).
- **대중교통 길찾기**: 코드베이스 전체에 버스/지하철 관련 API 연동이 전혀 없음(확인됨).

---

## 1. Vertex AI — LLM 쿼터 문제의 해법인가

### 우리 문제
AI Studio 무료 API 키로 `gemini-3.6-flash`를 실측 하루 20회 소진 후 약한 모델로 순차 폴백, 소진 시 60~90초+ 걸려서야 최종 실패, 약한 폴백 모델이 정상적인 한글 입력을 "깨졌다"고 하거나 도시명을 틀리는 등 할루시네이션 관찰됨.

### 조사 내용 (Google 공식 docs, LangChain 공식 docs/GitHub 기준)
1. **Vertex AI와 AI Studio는 완전히 다른 쿼터 체계**다. 같은 Gemini 모델이라도 두 플랫폼은 별도 GCP/과금 시스템으로 취급된다.
2. **Vertex AI에는 AI Studio 같은 "상시 무료 일일 한도"가 없다.** 대신: (a) 신규 GCP 계정 대상 90일/$300 크레딧, (b) "Express Mode" — 결제 계정 등록 없이 제한된 쿼터로 90일 체험 가능한 모드, 두 가지 임시 무료 경로만 존재한다(Google Cloud 공식 문서 확인). 즉 "쿼터가 더 넉넉한 무료 티어"가 아니라 "일정 기간 무료 체험 후 유료 전환" 구조다.
3. **과금 모델**: Vertex AI는 토큰당 종량제로, AI Studio 유료 티어와 가격대가 사실상 같다(둘 다 같은 Gemini 모델을 판다). Express Mode 기간이 끝나거나 한도를 넘으면 GCP 결제 계정(신용카드) 등록이 필요하다.
4. **마이그레이션 비용 (JS 기준, 우리 코드 기준으로 확인)**: Python `langchain-google-genai`는 4.0부터 `vertexai=True` 파라미터 하나로 같은 `ChatGoogleGenerativeAI` 클래스가 AI Studio/Vertex AI를 다 처리하도록 통합됐지만, **우리가 쓰는 JS 패키지(`@langchain/google-genai`)는 이 통합이 안 돼 있다.** JS 생태계에서 Vertex AI를 쓰려면 별도 패키지 `@langchain/google-vertexai`의 `ChatVertexAI` 클래스로 갈아타야 하고, 인증도 `GEMINI_API_KEY` 문자열이 아니라 서비스 계정 자격증명(`@langchain/google-gauth`, ADC)으로 바뀐다. `agent.ts`의 `buildAgent()`, 임베딩 쪽 `GoogleGenerativeAIEmbeddings`까지 모두 손봐야 하는 실질적 리팩터링이다.

### 결론: **도입 안 함 (Not worth it)**
Vertex AI는 "우리가 겪는 무료 쿼터 부족"에 대한 답이 아니다. 상시 무료 한도가 없고, 90일짜리 체험판을 위해 별도 패키지 전환 + 인증 방식 교체라는 실질적 마이그레이션 비용을 치르는 건 남는 장사가 아니다.

### 권장 사항
쿼터 문제는 이미 구현된 폴백 체인/쿨다운으로 완화 중이니 그대로 유지하고, 정말 안정적인 응답이 필요해지면 (Vertex AI로 옮기는 대신) **AI Studio 자체를 유료 티어로 전환**하는 쪽이 마이그레이션 비용이 없어 더 직접적인 해법이다 — 이건 코드 변경 없이 결제만 연결하면 된다. 이 결정은 코드 문제가 아니라 팀 회의에서 결정할 사안.

---

## 2. Transitous — 대중교통 길찾기

### 우리 문제
현재 버스/지하철 경로 안내 기능이 전혀 없음. 슬라이드에는 "대중교통·환승·보행"용으로 Transitous가 적혀 있었음.

### 조사 내용
1. **정체**: Transitous는 MOTIS 라우팅 엔진 기반, 전 세계 GTFS/GTFS-RT 피드(1,800+ 피드, 55개국 이상)를 모아 하나의 API로 라우팅하는 **커뮤니티 운영·무료·오픈소스** 프로젝트(공식 사이트 transitous.org, GitHub `public-transport/transitous` 확인). 유럽 중심이라는 우려가 있었으나, 실제로는 지역 제한 없이 전 세계 피드를 받는 구조다.
2. **한국 커버리지 (1차 출처: GitHub `feeds/kr.json` 파일 직접 확인)**:
   - `korea` 피드: **KTDB(Korea Transport Database, 국가대중교통DB)** 기반 전국 정적 GTFS 데이터(Dropbox 호스팅). 특정 도시를 명시하지 않은 **국가 표준 데이터셋**이라, 대구를 포함한 전국 버스가 들어있을 가능성이 높지만 이 파일 자체는 URL 하나만 가리키고 있어 실제 안에 대구가 포함돼 있는지는 데이터를 받아봐야 100% 확정된다.
   - `korail`(정적) / `korail`(GTFS-Realtime): 한국철도공사 전국 철도, 정적+실시간 둘 다 제공.
   - 대구도시철도공사(지하철) 전용 피드는 `kr.json`에 별도로 안 보임 — KTDB 안에 대구 지하철이 포함되는지는 이번 조사에서 확정 못 함.
3. **미검증**: 실제 라우팅 API에 대구 좌표로 질의해서 응답이 실제로 오는지는 이번 조사에서 호출까지는 안 해봄(문서/피드 목록 확인 수준). Rate limit도 공식 문서에 "무료(free to use)"라고만 돼 있고 정량적 제한은 못 찾음.

### 결론: **추가 조사 필요 (needs more investigation) — 다만 유망**
슬라이드가 근거 없는 얘기는 아니었다. 유럽 전용일 거라는 우려와 달리 한국 피드(KTDB 전국 + Korail)가 실제로 프로젝트에 등록돼 있는 게 1차 출처로 확인됐다. 다만 "대구 버스·지하철이 실제 응답에 잡히는지"는 문서 확인만으로는 확정할 수 없다.

### 권장 사항
채택 여부를 결정하기 전에, Transitous 공개 라우팅 API(transitous.org/doc/ 안내 엔드포인트)에 대구 내 실제 좌표 두 곳으로 경로 조회를 한 번 테스트해서 응답에 실제 버스/지하철 노선이 나오는지 확인할 것. 이 한 번의 호출 테스트로 이 항목의 결론이 "채택"과 "폐기" 어느 쪽으로든 바로 확정될 수 있다.

---

## 3. Voyage AI + Pinecone — RAG

### 우리 문제 아님, 비교 검토 요청
우리는 이미 RAG가 동작 중(Google `gemini-embedding-001` 임베딩 + 정적 JSON 코사인 유사도). 다른 팀은 Voyage AI 임베딩 + Pinecone 벡터 DB를 쓴다는 슬라이드 내용이 있어, 바꿀 이유가 있는지 비교.

### 조사 내용 (공식 pricing/docs 기준)
1. **Voyage AI**: `voyage-4`/`voyage-4-large`/`voyage-4-lite`는 계정당 무료 토큰 2억 개, 다국어 특화 `voyage-multilingual-2`는 무료 토큰 5천만 개. 무료 티어 소진 후 $0.02~0.12/백만 토큰. 공식 모델 개요 페이지에 "multilingual(다국어) 지원"이라고만 적혀 있고, **한국어 특정 벤치마크/품질 수치는 공식 문서에서 확인 못 함(미검증)**.
2. **Pinecone**: 무료 Starter 플랜 — 저장 2GB, 월 write 200만 유닛/read 100만 유닛, 인덱스 5개까지. 유료 최저가 Builder $20/월. **가입 시 신용카드 요구 여부는 공식 pricing 페이지에서 명시적으로 확인 못 함(미검증)**.
3. **규모 비교**: 우리 문서는 현재 9건. Voyage 무료 토큰(2억/5천만)이든 Google 임베딩(무료)이든 이 규모에서는 애초에 한도에 걸릴 일이 없다 — "무료 대 무료"라 실질적 차이가 없다.

### 결론: **도입 안 함 (Not worth it, 현재 규모 기준)**
바꿀 강한 이유가 없다. Google 임베딩은 이미 쓰는 API 키를 재사용하고 무료인 반면, Voyage AI로 바꾸면 새 API 키/의존성만 늘어난다. Pinecone도 마찬가지 — 문서 9건에 벡터 DB는 과함. 지금은 정적 JSON + 수기 코사인 유사도로 충분히 커버되고, 이게 이 규모에 맞는 선택이다.

### 권장 사항
문서량이 실제로 수천 건 이상으로 늘어나 "매 요청마다 JSON 전체 로드+순회"가 느려지는 시점이 오면, 그때도 Pinecone(새 외부 서비스)보다 먼저 **이미 스키마로 준비돼 있는 `RagChunk.embedding` 컬럼과 우리가 이미 쓰는 MySQL을 실제로 배선하는 것**이 새 벡터 DB를 들이는 것보다 우선순위가 높다 — 이미 있는 인프라를 쓰는 게 새 서비스 추가보다 이 프로젝트 규모에 맞다. Voyage AI로의 임베딩 모델 교체는 "Gemini 임베딩의 한국어 검색 품질이 실측으로 부족하다"가 확인되는 시점에 재검토할 사안이며, 현재는 그런 문제가 확인된 바 없다.

---

## 4. Google Search Grounding — 할루시네이션 감소책인가

### 우리 문제
쿼터 소진 후 약한 폴백 모델이 정상 한글 입력을 "깨졌다"고 주장하거나 도시명을 잘못 말하는 등 할루시네이션 관찰됨.

### 조사 내용 (Google 공식 블로그/docs 기준)
1. **정체**: Gemini가 프롬프트에 따라 자동으로 Google 검색을 실행하고, 검색 결과를 근거로 답변하며 인라인 출처 링크(`url_citation`)를 붙이는 기능. 공식 목적이 "최신 정보 반영 + 할루시네이션 감소"로 명시돼 있음.
2. **가용성**: 구글 공식 블로그("Gemini API and Google AI Studio now offer Grounding with Google Search")에서 확인 — **AI Studio의 plain Gemini Developer API 키에서도 바로 쓸 수 있다. Vertex AI 전용 기능이 아니다.**
3. **비용**: 검색 스니펫 기준(원문 페이지의 정확한 표는 WebFetch로 렌더링 실패, 미검증) Gemini 3.x 계열은 월 5,000회 무료(3.x 전체 모델 공유), 초과 시 $14/1,000 grounded 쿼리. 다른 자료에는 $35/1,000이라는 숫자도 있어 세대별로 다를 수 있음 — **실제 적용 전 `ai.google.dev/gemini-api/docs/pricing`을 팀에서 직접 열어 재확인 필요**.
4. **우리 문제와의 관련성**: 우리가 겪는 할루시네이션은 "모델이 최신 웹 정보를 몰라서"가 아니라 **"쿼터 소진 후 약한 모델로 강제 폴백되면서 생기는 추론 품질 저하"**다. Grounding은 최신 사실 확인용 기능이지, 약한 모델 자체의 기본 추론 능력을 끌어올려주는 기능이 아니다 — 우리가 관찰한 증상(한글 입력을 "깨졌다"고 주장, 도시명 오답)의 원인과 Grounding이 해결하는 문제가 서로 다르다.

### 결론: **도입 안 함 (지금 문제에는 Not worth it) / 별개 용도로는 needs more investigation**
AI Studio 키로 바로 쓸 수 있고 월 5,000회 무료라는 점은 매력적이지만, 지금 겪는 할루시네이션의 진짜 원인(약한 폴백 모델)을 고치지 못한다. 오히려 요청마다 실제 검색을 트리거하면 25초 타임아웃 안에서 지연이 늘어날 위험도 있다(미검증, 실측 필요).

### 권장 사항
지금 문제(폴백 모델 품질)의 해법으로는 채택하지 않는다. 다만 "행사 임시 휴관", "최신 운영시간 변경" 같은 사실 확인 용도로는 별개 기능으로 나중에 검토할 여지는 있다 — 그때는 지연 시간 실측이 선행돼야 한다.

---

## 5. Google Maps / Places (New) / Routes — 참고용, 이번 세션에 이미 결론남

이번 세션에서 지도 렌더링은 **네이버 지도(Dynamic Map + Directions 15)**, 장소 검색은 **카카오 로컬 API**로 이미 결정했다(별도 재검토 대상 아님). Google Maps JS API / Places API (New) / Routes API는 처음부터 GCP 결제 계정(신용카드) 등록이 필수라 학생 프로젝트 초기 진입장벽이 높다는 이유로 이번에 검토·채택하지 않았다 — 이 문서에는 맥락 기록 목적으로만 남긴다. 이 항목은 이번 조사에서 시간을 들이지 않았다.

---

## 종합 결론

| 항목 | 판정 | 핵심 이유 |
|---|---|---|
| Vertex AI | **도입 안 함** | 상시 무료 한도 없음(90일 체험뿐), 결제 계정 필요, JS 패키지·인증 방식 전면 교체 비용 |
| Transitous | **추가 조사 필요(유망)** | 한국 피드(KTDB+Korail) 등록 확인됨, 다만 대구 실응답은 미확인 — 실제 호출 테스트 1회면 결론 남 |
| Voyage AI + Pinecone | **도입 안 함(현 규모)** | 이미 무료 임베딩 사용 중이라 차이 없음, 문서 9건에 벡터 DB 불필요, 이미 있는 `RagChunk` 테이블 배선이 우선 |
| Google Search Grounding | **도입 안 함(현 문제엔)** | 원인(폴백 모델 품질 저하)과 무관한 기능, 별개 용도로만 재검토 여지 |

---

## 조사 한계 (투명성 고지)

- WebFetch가 여러 Google/Vertex 공식 페이지(정확한 요금표, rate limit 표)를 동적 렌더링/페이지 축약 때문에 완전히 읽지 못해, 일부 수치(Grounding 정확한 단가, AI Studio 모델별 정확한 RPD)는 검색 스니펫(2차 요약) 기준으로만 확인했다 — 실제 도입 여부를 최종 결정하기 전에는 팀에서 원문 페이지를 직접 열어 재확인할 것.
- Transitous 실제 라우팅 API 호출(대구 좌표)은 이번 조사에서 실행하지 않았다 — 공식 문서/GitHub 피드 목록만 확인.
- Pinecone 무료 티어 가입 시 신용카드 요구 여부, Voyage AI의 한국어 특정 벤치마크 수치는 확인하지 못했다.
- 항목 5(Google Maps 계열)는 지침에 따라 재조사하지 않고 이번 세션의 기존 결정만 기록했다.
