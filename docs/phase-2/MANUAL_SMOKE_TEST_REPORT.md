# Manual Smoke Test Report

## Status

PASS

## Environment Used

- Current non-production backfill database: `examflow_pro`
- Runtime environment: `NODE_ENV=development`
- Pre-apply backup: `docs/phase-2/backups/examflow_pro_pre_apply_backup.json`
- Isolated targeted-test database: `examflow_pro_phase2_tests`

## Executed Evidence

- Safe apply-mode Phase 2 backfill executed on `examflow_pro` with `ALLOW_PHASE2_BACKFILL=true`.
- Targeted non-production runtime checks executed in `scripts/phase-2/targeted-tests.ts`.
- Full browser smoke and multi-role API authorization matrix executed through `scripts/phase-2/browser-qa.mjs`.
- Captured browser/admin evidence recorded in `docs/phase-2/PHASE_2_BROWSER_SMOKE_MATRIX.md` and `docs/phase-2/evidence/`.
- Verified at runtime:
  - unsupported department-language rejection
  - wrong group rejection
  - wrong semester rejection
  - single-candidate resolver preference
  - manual mapping validation
  - legacy student exam-access fallback
  - offering-linked student exam access
  - dependent-select filtering/child clearing helpers

## Decision

- The required browser/admin create-flow matrix, multi-role API authorization checks, and compatibility page loads were completed successfully on non-production data.
- Phase 2 manual smoke testing therefore passes.
