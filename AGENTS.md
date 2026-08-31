<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# 이 레포에서 작업하는 모든 AI 코딩 도구(Claude Code, Codex 등) 공통 규칙

브랜치 전략, 커밋 컨벤션, PR 절차는 [CONTRIBUTING.md](./CONTRIBUTING.md)를 따른다. 특히:

- `main`에 직접 push 금지. 작업은 `develop`에서 딴 `feature/fix/chore/xxx` 브랜치에서.
- PR은 평소 `feature/xxx → develop`, `develop → main`은 팀 상의 후에만.
- **병합 전에는 반드시 작업한 사람에게 "이 기능 다 됐다", "더 필요한 거 없다"는 확인을 받은 뒤에만 병합한다.** AI가 임의로 완료 여부를 판단해서 병합하지 않는다.
- 병합 직후 병합된 브랜치는 바로 삭제한다.
- 역할은 폴더별로 고정 배정하지 않는다 — 누구나 원하는 기능을 골라 작업한다.

