# Remaining Issues

## Status
No Phase 1 blockers remain.

## Residual follow-up items

## 1. Upstream dependency advisories remain open
- `npm audit --omit=dev` still reports:
  - high: `nodemailer`
  - high: `ws`
  - moderate: `postcss` through the Next.js dependency tree
- Current impact:
  - validation and production build are green
  - no safe non-breaking local fix was available in the current dependency chain
- Recommended handling:
  - track these in release/security planning
  - revisit when safe upstream package updates land

## 2. Automated behavioral coverage is still limited
- `npm run qa` now passes because typecheck, lint, and build all pass.
- There is still no broader integration or end-to-end regression suite for exam-taking, result publishing, and admin CRUD flows.

## Recommendation
Phase 2 can start. Keep the dependency advisories visible, but they are no longer blocking the Phase 1 stabilization baseline.
