# Phase 2 Completion Baseline

| Command | Status | Duration | Warnings | Errors | Affected records |
| --- | --- | --- | --- | --- | --- |
| git status | PASS | 0.33s | None | None | worktree changes only |
| git branch --show-current | PASS | 0.15s | None | None | repository metadata |
| node --version | PASS | 0.12s | None | None | toolchain metadata |
| npm --version | PASS | 0.76s | None | None | toolchain metadata |
| npx prisma validate | PASS | 3.08s | Prisma major update available | None | schema validation |
| npx prisma generate | PASS | 4.92s | None | None | generated Prisma client |
| npm run typecheck | PASS | 9.11s | None | None | TypeScript route and app types |
| npm run lint | PASS | 21.82s | None | None | lint status only |
| npm run build | PASS | 75.84s | None | None | Next production build output |
| npm run qa | PASS | 107.50s | None | None | combined typecheck/lint/build |
| npm run phase2:backfill:dry | PASS | 7.59s | None | None | 3 teacher assignments, 6 student subjects reviewed |
| npm run phase2:verify | PASS | 7.86s | accepted unresolved records reported; command emitted warnings | None | integrity report and unresolved classifications |
| npm run phase2:qa | PASS | 195.46s | accepted unresolved records reported; command emitted warnings | None | phase 2 targeted tests + full QA chain |
