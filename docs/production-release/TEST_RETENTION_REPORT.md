# Test Retention Report

Date: 2026-07-14
Status: PASS

## Retained For CI/CD

| Area | Files | Reason |
| --- | --- | --- |
| Coursework platform regression | `scripts/phase-7/coursework-platform-tests.ts`, `scripts/phase-7/verify-coursework-platform.ts`, `scripts/phase-7/authorization-matrix.ts` | Maintained Phase 7 validation coverage. |
| Coursework fixture bootstrap | `scripts/phase-7/ensure-coursework-test-fixtures.ts` | Allows tests to self-provision without relying on production demo seed data. |
| AI review regression | `scripts/phase-7-5/verify-ai-reviews.ts` | Maintained Phase 7.5 database and workflow validation. |
| AI review authorization | `scripts/phase-7-5/authorization-matrix.mjs` | Maintained access-control regression coverage. |
| AI review browser smoke | `scripts/phase-7-5/browser-smoke.mjs` | Maintained browser-level release confidence. |
| Core build validation | `npm run qa`, `npm run typecheck`, `npm run lint`, `npm run build` | Required baseline production validation. |

## Tests Removed

No maintained automated test suites were removed in this pass.

## Scripts Hardened Instead Of Removed

| File | Change |
| --- | --- |
| `scripts/phase-7/coursework-platform-tests.ts` | Uses explicit fixture bootstrap instead of relying on demo seed state. |
| `scripts/phase-7-5/verify-ai-reviews.ts` | Uses explicit fixture bootstrap and consistent lead-teacher lookup. |
| `scripts/phase-7-5/authorization-matrix.mjs` | Uses fixture bootstrap and corrected maintained expectations. |
| `scripts/phase-7-5/browser-smoke.mjs` | Uses fixture bootstrap instead of ambient demo seed assumptions. |

## Outcome

The release pass preserved maintained CI/CD coverage and removed the dependency on production-unsafe demo seed state. Regression retention is not a release blocker.
