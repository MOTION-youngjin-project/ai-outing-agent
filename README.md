# AI Outing Agent

사용자의 위치·동반자·예산·상황을 자연어로 이해하고, 대기질·날씨·문화행사 같은 공공데이터를 실시간으로 조회해서 실내/야외 활동을 추천하는 AI 에이전트. 정적 DB 필터링이 아니라, AI가 상황을 스스로 판단해 다음 행동(어떤 도구를 호출할지)을 분기하는 것이 핵심.

예: "요즘 날씨가 별로네" → AI가 스스로 대기질부터 조회 → 나쁘면 실내 활동으로 자동 전환.

## 기술 스택

| 영역 | 기술 |
|---|---|
| 프론트+백엔드 | Next.js (App Router, API Route) |
| 에이전트 로직 | LangChain.js (`createAgent` + `tool()` + zod) |
| AI 모델 | Gemini API |
| RAG | 실내/가족동반 시설 안내 문서 벡터 검색 |
| DB | MySQL + Prisma ORM |
| 공공데이터 | 에어코리아(대기질), 기상청(날씨), 문화포털(공연/전시), 대구시 통합주차정보 |

## 폴더 구조 & 담당 영역

```
src/app/api/agent/route.ts   에이전트 API 엔드포인트
src/lib/agent.ts             LangChain 에이전트 조립 (모델 + 도구 + 시스템 프롬프트)
src/lib/tools/               공공데이터 도구 (대기질/날씨/문화행사 등, tool() + zod)
src/lib/rag/                 벡터DB 검색 (실내/가족동반 시설 문서)
src/lib/parking/             주차장 확장 모듈 (독립적으로 붙였다 뗄 수 있게 분리)
prisma/                      schema.prisma, 마이그레이션
```

팀 역할 분배 시 위 폴더 단위로 나누면 충돌 없이 작업 가능 (예: A=agent/tools, B=rag, C=prisma/DB, D=프론트 UI). 실제 담당자는 `.github/CODEOWNERS`에 채워 넣기.

## 시작하기

```bash
npm install
cp .env.example .env.local   # 키 채워넣기
npm run dev
```

## 협업 규칙

브랜치 전략, 커밋 컨벤션, PR 절차는 [CONTRIBUTING.md](./CONTRIBUTING.md) 참고.
