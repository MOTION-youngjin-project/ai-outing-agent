# 협업 가이드

## 브랜치 전략 (GitHub Flow)

`main`은 항상 배포 가능한 상태로 유지. 모든 작업은 브랜치를 따서 PR로 병합한다.

```
main                        항상 안정 상태, 직접 push 금지
├─ feature/agent-air-quality   새 기능
├─ fix/parking-null-check      버그 수정
└─ chore/update-deps           설정/의존성/잡일
```

- 브랜치명: `<type>/<짧은-설명>` (kebab-case)
- `type`: `feature`, `fix`, `chore`, `docs`, `refactor` 중 하나
- 작업 시작 전 `main`에서 최신 pull 후 분기

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

1. 브랜치 push 후 PR 생성 (템플릿 자동 적용됨)
2. 최소 1명 리뷰 승인 필요
3. CI(lint + build) 통과 필수
4. Squash merge로 `main`에 병합 (커밋 히스토리 깔끔하게 유지)
5. 병합 후 브랜치 삭제

## 담당 영역이 겹치는 파일

- `src/lib/agent.ts` (시스템 프롬프트, 도구 조립): 여러 명이 동시에 건드리기 쉬우니 수정 전 채널에 공유
- `prisma/schema.prisma`: 마이그레이션 충돌 나기 쉬우니 스키마 변경은 미리 공지 후 진행
