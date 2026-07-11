# Remaining Issues

## Blocking

- None

## Resolved in This Pass

- Unresolved `TeacherAssignment` and `StudentSubject` records are now fully classified and documented.
- Safe non-production backfill apply mode completed without unsafe inferred mappings.
- Phase 2 targeted automated coverage now exists for resolver preference, unsupported language rejection, wrong group/year/semester rejection, dependent-select helpers, and legacy exam-access fallback.
- Final browser smoke matrix, multi-role authorization checks, and compatibility page loads all passed.
- Browser/API defects found during the final QA pass were fixed before signoff.

## Non-Blocking Follow-Up

- Promotion remains partly legacy-driven until Phase 3 enrollment architecture exists.
- Historical program/group reconstruction for the accepted unresolved records remains a future cleanup item.
- Browser console evidence still shows hydration-mismatch warnings during some page loads; this did not block tested workflows but should be cleaned up in a later polish pass.
- `npx prisma generate` can fail on Windows while the active dev server is holding the Prisma query engine DLL open; rerun it after stopping the server if regeneration is needed again.
