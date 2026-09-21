<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# 이 레포에서 작업하는 모든 AI 코딩 도구(Claude Code, Codex 등) 공통 규칙

브랜치 전략, 커밋 컨벤션, PR 절차는 [CONTRIBUTING.md](./CONTRIBUTING.md)를 따른다. 특히:

- `main`에 직접 push 금지. 작업은 `develop`에서 딴 `feature/fix/chore/xxx` 브랜치에서.
- **GitHub PR은 올리지 않는다.** 브랜치에서 작업한 뒤 `develop`에 직접 머지·푸시한다.
  사용자가 프론트·백엔드를 단독 담당해서 리뷰어가 없다 — PR은 승인 단계만 늘린다.
  `gh pr create`는 사용자가 명시적으로 요청할 때만. `develop → main`은 팀 상의 후에만.
- **병합 전에는 반드시 작업한 사람에게 "이 기능 다 됐다", "더 필요한 거 없다"는 확인을 받은 뒤에만 병합한다.** AI가 임의로 완료 여부를 판단해서 병합하지 않는다.
- 병합 직후 병합된 브랜치는 바로 삭제한다.
- 역할은 폴더별로 고정 배정하지 않는다 — 누구나 원하는 기능을 골라 작업한다.


## 문서·보고를 쓸 때

**작업 중 발견한 후속 조치는 실행 목록에 넣는다.** 경위 설명·부록·각주에만 적고 목록에서 빠뜨리지 않는다.

2026-09-21 핸드오프에서 "병합하고 안 지운 원격 브랜치 3개", "이전 핸드오프 gist가 public이라 서버 계정·배포 절차가 노출됨" 두 건을 에이전트가 직접 찾아내고도 부록에만 적었다. 사용자가 물어서야 드러났다. 목록만 읽는 다음 사람은 둘 다 놓쳤을 상황이었다.

- **"문서에 언급했다"와 "실행 목록에 넣었다"는 다르다.** 목록에 없으면 안 한 것이 된다.
- 뭔가 발견하면 그 자리에서 **"누가 언제 해야 하나"까지 판단해** 항목으로 추가한다. 근거·경위는 본문에 따로 적어도 되지만 **항목 자체는 반드시 목록에.**
- 사소해 보여도 마찬가지다(1초짜리 브랜치 삭제라도).
- 구두로만 말하고 문서에 안 넣었으면 안 넣은 것이다.

**핸드오프 문서를 gist로 올릴 때는 secret으로 만들고, 서버 계정명·홈 경로·프로덕션 도메인 같은 인프라 식별정보는 치환해서 올린다.** 미해결 취약점("재부팅하면 안 올라온다" 등)이 계정 정보와 같이 공개되면 그대로 공격 안내서가 된다.

## 버그를 쫓을 때

증상이 아니라 **실제로 찍힌 에러**에서 출발한다. 2026-09-11에 "추천이 안 나온다"를 프롬프트·스키마 문제로 의심하며 한참 헤맸는데, 진짜 원인(`unhandledRejection`으로 프로세스가 죽어 pm2가 25회 재시작)은 배포 직후부터 로그에 그대로 찍혀 있었다.

- **로그부터 집계한다.** 원인을 말하기 전에 `pm2 logs ai-outing-agent`(프로덕션)나 dev 서버 로그의 에러를 종류별로 세서 목록으로 보여준다. 재시작 횟수(`pm2 describe`)도 함께 본다. 그 목록의 각 항목이 설명될 때까지는 코드 추측을 보고하지 않는다.
- **재현 경로를 실제 사용 경로와 맞춘다.** 앱은 브라우저로 쓰므로 브라우저에서 먼저 재현한다. curl로 확인할 땐 본문을 UTF-8 파일로 써서 `--data-binary @파일`로 보낸다 — Git Bash에서 한글을 인라인으로 넘기면 CP949로 깨져 모델이 질문을 못 읽는다(실제로 이걸 앱 버그로 오인했다).
- **테스트는 한 번 실패시켜보고 가져온다.** 수정을 임시로 되돌렸을 때 그 테스트가 실제로 실패하는 것까지 확인하고 보고한다. `withTimeout` 오진을 이 방법으로 걸렀다 — 가드를 빼도 테스트가 통과하길래 가설이 틀린 걸 알았다.

에이전트 실행 트레이스는 LangSmith에 남는다(`LANGSMITH_*` 환경변수). 모델에 실제로 무슨 메시지·도구 인자가 갔는지는 API로 읽는다: `POST https://api.smith.langchain.com/api/v1/runs/query`에 `{"session":[프로젝트 id],"is_root":true}`로 실행 목록, `{"trace":"<id>"}`로 그 실행의 단계들.

에이전트 응답시간과 Gemini 쿼터(분당 5회·하루 20회, 프로젝트 단위)는 [docs/agent-latency-and-quota.md](./docs/agent-latency-and-quota.md)에 정리해뒀다. 추천이 느리거나 429가 나면 모델·프롬프트를 고치기 전에 여기부터 읽을 것.
