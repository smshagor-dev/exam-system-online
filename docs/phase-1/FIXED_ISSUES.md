# Fixed Issues

## 1. CKEditor build failure
- Issue: Production build failed on CKEditor heading config typing.
- Severity: High
- Root cause: Heading option literals widened to `string` instead of the expected discriminated CKEditor heading models.
- Files changed:
  - `src/components/editor/RichTextEditor.tsx`
- Fix applied: Narrowed heading model and view literals with explicit `as const`.
- Validation performed:
  - `npm run build`
- Regression risk: Low
- Status: Fixed

## 2. React 19 effect-pattern violations in auth and shell flows
- Issue: Several client pages/components used synchronous state updates inside effects.
- Severity: Medium
- Root cause: Effect bodies were being used for render-time derivation and route-driven UI resets.
- Files changed:
  - `src/app/(auth)/login/page.tsx`
  - `src/app/(auth)/register/page.tsx`
  - `src/app/(auth)/verify-account/page.tsx`
  - `src/components/admin/AdminShell.tsx`
  - `src/components/student/StudentShell.tsx`
  - `src/components/i18n/LanguagePreferenceModal.tsx`
- Fix applied: Moved route-derived state to render-safe logic or user-event paths and simplified shell close behavior around navigation clicks.
- Validation performed:
  - `npm run build`
  - targeted `eslint`
- Regression risk: Medium
- Status: Fixed

## 3. Student exam attempt stability
- Issue: Attempt page had callback-order lint failures, weak typing, and fragile timer/socket cleanup.
- Severity: High
- Root cause: Socket callbacks referenced functions before declaration, intervals were cleared unsafely, and runtime payloads were left loosely typed.
- Files changed:
  - `src/app/student/exams/[id]/attempt/page.tsx`
  - `src/lib/socket.ts`
- Fix applied: Reworked socket lifecycle, typed exam payloads, centralized interval cleanup, and made autosave/countdown setup deterministic.
- Validation performed:
  - `npm run typecheck`
  - `npm run build`
  - targeted `eslint`
- Regression risk: Medium
- Status: Fixed

## 4. Typecheck workflow instability on Windows
- Issue: Baseline `tsc --noEmit` was failing before app-code checks completed.
- Severity: High
- Root cause: Windows/Next generated route type interaction was unreliable in direct repo-wide `tsc` runs.
- Files changed:
  - `package.json`
  - `tsconfig.typecheck.json`
- Fix applied: Added `next typegen && tsc --noEmit -p tsconfig.typecheck.json`.
- Validation performed:
  - `npm run typecheck`
- Regression risk: Low
- Status: Fixed

## 5. Student progress typing defects
- Issue: Progress pages/services failed typecheck because of nullable result typing mismatches.
- Severity: Medium
- Root cause: Optional and nullable result fields were modeled inconsistently between service output and page consumption.
- Files changed:
  - `src/services/student-progress.service.ts`
- Fix applied: Normalized result field shapes to consistent nullable values required by consuming pages.
- Validation performed:
  - `npm run typecheck`
  - `npm run build`
- Regression risk: Low
- Status: Fixed

## 6. Unsafe sample environment data
- Issue: `.env.example` contained a real-looking MongoDB credential.
- Severity: High
- Root cause: Sample env file was committed with a concrete Atlas URI.
- Files changed:
  - `.env.example`
- Fix applied: Replaced with placeholder credentials and added `AUTO_DB_PUSH=false`.
- Validation performed:
  - manual review
- Regression risk: Low
- Status: Fixed

## 7. Unsafe automatic schema push policy
- Issue: Server startup still auto-ran `prisma db push` unless a skip flag was set.
- Severity: High
- Root cause: Startup policy was opt-out rather than explicit opt-in.
- Files changed:
  - `server.js`
- Fix applied: Switched to `AUTO_DB_PUSH=true` opt-in behavior.
- Validation performed:
  - code review
  - `npm run build`
- Regression risk: Medium
- Status: Fixed

## 8. README architecture drift
- Issue: README still described Next.js 15 and MySQL.
- Severity: Medium
- Root cause: Docs lagged behind prior repo changes.
- Files changed:
  - `README.md`
- Fix applied: Updated framework version, database description, and script list to reflect current repo state.
- Validation performed:
  - manual review
- Regression risk: Low
- Status: Fixed
