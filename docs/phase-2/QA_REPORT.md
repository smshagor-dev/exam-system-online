# QA Report

## Automated Checks

- `npx prisma format`: PASS
- `npx prisma validate`: PASS
- `npx prisma generate`: BLOCKED IN FINAL PASS (`EPERM` Windows file lock from active dev server; had passed earlier before the final rerun)
- `npm run phase2:test`: PASS
- `npm run phase2:backfill:dry`: PASS
- `npm run phase2:verify`: PASS
- `npm run phase2:qa`: PASS

## Targeted Phase 2 Coverage Added

- Dependent-select helper filtering and stale-selection clearing
- Academic offering validation for unsupported language, wrong group, and wrong semester
- Resolver preference for a single exact offering candidate
- Manual mapping validation
- Legacy student exam access fallback

## Manual Smoke Status

- Full non-production browser smoke evidence exists in `docs/phase-2/PHASE_2_BROWSER_SMOKE_MATRIX.md`.
- Multi-role API authorization checks now pass for Super Admin, Department Admin A, Department Admin B, Teacher, Student, and unauthenticated access.
- Existing teacher/student compatibility pages load successfully against the mixed legacy/normalized dataset.
- Phase 2 QA status: PASS.
