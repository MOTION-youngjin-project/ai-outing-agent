# 협업 가이드

## 브랜치 전략

`main`은 최종 안정 버전만, `develop`은 작업 통합용. 각자 하고 싶은 기능을 골라 `develop`에서 브랜치 따고, 다 되면 `develop`으로 PR. `develop`이 문제없이 안정되면 그때 `develop → main`으로 병합.

```
main                          배포/최종 안정 버전, develop에서 검증된 것만 병합
└─ develop                    작업 통합 브랜치, 직접 push 금지
   ├─ feature/agent-air-quality   새 기능
   ├─ fix/parking-null-check      버그 수정
   └─ chore/update-deps           설정/의존성/잡일
```

- 브랜치명: `<type>/<짧은-설명>` (kebab-case)
- `type`: `feature`, `fix`, `chore`, `docs`, `refactor` 중 하나
- 작업 시작 전 `develop`에서 최신 pull 후 분기 (`main`이 아님)
- 역할은 미리 나누지 않음 — 원하는 기능 브랜치를 아무나 잡아서 작업

## GitHub Desktop으로 작업하기

이 팀은 커맨드라인 대신 GitHub Desktop을 사용한다.

**처음 한 번만**

1. `File > Clone Repository` → `MOTION-youngjin-project/ai-outing-agent` 클론
2. 상단 `Current Branch` 드롭다운 → `develop` 선택
3. 터미널(VSCode 하단)에서:
   ```bash
   npm install
   cp .env.example .env.local
   ```
   `.env.local`에 `GEMINI_API_KEY` 등 키 채워넣기 (키는 팀 채널에서 별도 공유)
4. `npm run dev`로 `localhost:3000` 뜨는지 확인

**작업할 때마다**

1. `Current Branch` → `develop` → 상단 `Fetch origin`/`Pull origin`으로 최신화
2. `Current Branch` → `New Branch`(`Ctrl+Shift+N`) → **`develop` 기준으로** `feature/기능이름` 브랜치 생성
3. 코드 작업 후 `Changes` 탭에서 커밋 메시지 작성(형식은 아래 커밋 컨벤션 참고) → `Commit to feature/기능이름`
4. 상단 `Publish branch`(최초) 또는 `Push origin`
5. 상단 `Create Pull Request` → 브라우저에서 **base를 반드시 `develop`으로 지정** (`main` 아님)
6. 리뷰 요청 → 아래 PR 절차대로 병합

## PR 대상 정리

- 평소 작업: `feature/xxx` → `develop`
- `develop`이 충분히 안정됐다고 판단될 때: `develop` → `main` (이건 팀 상의 후 진행)

## 커밋 컨벤션 (Conventional Commits)

```
<type>: <설명>

feat: 대기질 조회 도구 추가
fix: 지역명 미입력 시 기본값 처리
chore: langchain 버전 업데이트
docs: README 폴더 구조 설명 추가
refactor: agent.ts 프롬프트 분리
```

`type`: `feat`, `fix`, `chore`, `docs`, `refactor`, `test`

## PR 절차

1. 브랜치 push 후 `develop`을 대상으로 PR 생성 (템플릿 자동 적용됨)
2. 최소 1명 리뷰 승인 필요
3. CI(lint + build) 통과 필수
4. 병합 전 반드시 작업한 사람에게 "이 기능 다 됐다", "더 필요한 거 없다"는 확인을 받은 뒤에만 병합 (사람이 직접 병합하든 Claude Code 등 AI에게 맡기든 동일하게 적용)
5. Squash merge로 `develop`에 병합 (커밋 히스토리 깔끔하게 유지)
6. 병합 직후 브랜치 바로 삭제

## 겹치기 쉬운 파일

- `src/lib/agent.ts` (시스템 프롬프트, 도구 조립): 여러 명이 동시에 건드리기 쉬우니 수정 전 채널에 공유
- `prisma/schema.prisma`: 마이그레이션 충돌 나기 쉬우니 스키마 변경은 미리 공지 후 진행
