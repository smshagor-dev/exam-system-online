# Phase 3 Completion Baseline

## Current models

- `StudentEnrollment`
- `StudentAcademicHistory`
- `StudentPromotion`
- `StudentTransfer`
- `StudentLeave`
- `StudentGraduation`

## Current APIs

- `GET /api/admin/enrollments`
- `POST /api/admin/enrollments`
- `GET /api/admin/enrollments/:studentId/timeline`
- `POST /api/admin/promotions`
- `POST /api/admin/transfers`
- `POST /api/admin/leaves`
- `POST /api/admin/readmissions`
- `POST /api/admin/graduations`
- `PATCH /api/admin/graduations`
- `GET /api/account/academic-history`

## Current UI capabilities

- Admin pages exist for enrollments, promotions, transfers, leaves, graduation, academic history, and timeline
- Student self-history page exists
- Current admin lifecycle pages are read-first reporting surfaces
- No complete lifecycle workflow forms are present yet
- No bulk promotion preview/execution UI is present yet

## Missing operations

- enrollment create/edit/deactivate workflow form
- promotion eligibility preview and bulk action workflow
- transfer workflow form with target context controls
- leave workflow form and overlap prevention UI
- readmission admin page/form
- graduation eligibility workflow and controlled alumni transition UI
- richer admin timeline filters and per-student drill-down workflow

## Validation gaps

- one-active-enrollment is service-enforced, not integrity-verified yet
- leave overlap protection is not implemented yet
- readmission eligibility is minimal and needs stronger prior-state checks
- graduation eligibility still needs curriculum/result/block/leave validation depth
- transfer/program/session/language boundary validations need end-to-end regression proof

## Authorization gaps

- direct multi-role API evidence is missing
- teacher write denial is not yet recorded as evidence
- student write denial is not yet recorded as evidence
- cross-department denial matrix is not yet recorded

## Testing gaps

- no dedicated `phase3:test`
- no lifecycle integrity verifier
- no browser smoke matrix
- no stored API authorization evidence
- no exam compatibility regression evidence for lifecycle states

## Legacy compatibility behavior

- legacy `StudentSubject` fallback remains active
- active enrollment is intended to be preferred for eligibility
- lifecycle service syncs `StudentSubject` from matching academic offerings
- promotion cron still uses legacy promotion logic and has not yet been made lifecycle-safe

## Completion blockers at baseline

1. Operational workflow forms are incomplete.
2. Automated lifecycle and integrity test suites are missing.
3. Browser smoke and multi-role authorization evidence are missing.
4. Legacy promotion cron compatibility boundary is undocumented in runtime behavior.
