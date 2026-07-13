# Phase 6 Exam Engine Dependency Map

## Runtime path

- `server.js` bootstraps the custom Next.js server and calls `initSocketServer`.
- `src/server/socket-server.ts` owns teacher/student socket events, runtime coordination, timer leadership, submission, and monitoring broadcasts.
- `src/server/exam-runtime-store.ts` provides the distributed runtime store.
  - Redis mode uses `REDIS_URL` and the Socket.IO Redis adapter.
  - Memory mode is the fallback when Redis is not configured or not reachable.
- `src/server/exam-attempt-snapshot.ts` freezes exam/question/option translations at attempt start and persists the snapshot via `ActivityLog`.

## Persistence path

- Prisma MongoDB remains the source of truth for:
  - `Exam`
  - `ExamSession`
  - `StudentExamAttempt`
  - `StudentAnswer`
  - `ExamResult`
  - `ActivityLog`
- Redis/runtime cache carries:
  - exam runtime state
  - attempt runtime state
  - reconnect token
  - presence
  - answer cache
  - leader locks

## Client path

- `src/app/student/exams/[id]/attempt/page.tsx`
  - queues answer saves
  - replays queued saves on reconnect
  - consumes `exam:attempt_state`
  - sends `student:heartbeat`
- `src/app/teacher/exams/[id]/live/page.tsx`
  - consumes `exam:monitor_snapshot`
  - reflects runtime mode and live presence state
- `src/lib/socket.ts`
  - shared socket client with longer reconnect window

## Validation path

- `scripts/phase-6/runtime-tests.ts`
- `scripts/phase-6/verify-exam-engine.ts`
- `scripts/phase-6/authorization-matrix.mjs`

## Result path

- `src/lib/result-engine.ts` now prefers the frozen attempt snapshot when grading answers so later content edits do not alter active attempts.
