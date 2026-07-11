# Repository Audit

## Status
BLOCKED

## Baseline
- Branch: `main`
- Working tree at audit start: clean
- Node.js: `v24.14.0`
- npm: `11.6.2`
- Next.js: `16.2.10`
- React: `19.2.0`
- React DOM: `19.2.0`

## Audit findings

### Build blockers found
- CKEditor config typing in `src/components/editor/RichTextEditor.tsx`
- `useSearchParams()` nullability issues in auth pages
- Student progress typing mismatches in `src/services/student-progress.service.ts`
- Exam creation page passing a removed prop after form cleanup

### TypeScript and generated-type issues found
- Direct `tsc --noEmit` against current repo layout was unstable on Windows when paired with generated Next route validator files.
- Student progress types used optional/null combinations inconsistently.
- Auth and middleware still used avoidable `any` casts.

### React 19 and runtime issues found
- Synchronous state updates inside effects in auth/shell/i18n components.
- Exam attempt page used callback values before declaration and had fragile interval/socket cleanup behavior.

### Environment and safety issues found
- `.env.example` contained a real-looking MongoDB Atlas credential and must be treated as exposed.
- `server.js` still defaulted to running `prisma db push` unless a skip flag was set.

### Documentation inconsistencies found
- README still claimed Next.js 15.
- README still described MySQL even though Prisma schema and runtime use MongoDB.

### Lint debt still present after this pass
- `46` errors remain.
- Most remaining errors are `@typescript-eslint/no-explicit-any`.
- Main affected areas:
  - `src/app/api/admin/**`
  - `src/app/api/questions/**`
  - `src/app/api/results/**`
  - `src/app/admin/**Manager.tsx`
  - `src/server/socket-server.ts`
  - `src/server/exam-events.ts`
  - `src/services/question.service.ts`
  - `src/app/teacher/exams/[id]/live/page.tsx`

## Audit conclusion
The repository is now build-stable on Next.js 16 and source typecheck-stable with the added `typecheck` workflow, but it is not ready for a clean Phase 1 signoff because repo-wide lint and Prisma client generation are still not fully green.
