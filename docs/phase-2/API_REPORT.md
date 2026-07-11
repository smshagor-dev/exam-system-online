# API Report

## Added Admin APIs

- `/api/admin/degree-levels`
- `/api/admin/degree-levels/[id]`
- `/api/admin/academic-sessions`
- `/api/admin/academic-sessions/[id]`
- `/api/admin/programs`
- `/api/admin/programs/[id]`
- `/api/admin/department-languages`
- `/api/admin/department-languages/[id]`
- `/api/admin/program-years`
- `/api/admin/program-years/[id]`
- `/api/admin/program-semesters`
- `/api/admin/program-semesters/[id]`
- `/api/admin/program-subjects`
- `/api/admin/program-subjects/[id]`
- `/api/admin/academic-offerings`
- `/api/admin/academic-offerings/[id]`

## Legacy Integration Changes

- Teacher assignment creation accepts optional `academicOfferingId`.
- Exam creation accepts optional `academicOfferingId`.
- Question creation accepts optional `academicOfferingId`.

## Phase 2 API Hardening Completed

- Group create/update now validates normalized department/program/language/session/program-year context server-side.
- Academic offering validation remains centralized in `src/lib/academic-scope.ts`.
- Phase 2 backfill and verification scripts now enforce explicit decisions for unresolved legacy records instead of leaving them as open warnings.

## Authorization Notes

- Super-admin-only mutation remains enforced for degree levels and academic sessions.
- Department-bound resources continue to respect department-admin ownership.

## Status

- Automated typecheck, lint, build, verify, and targeted Phase 2 runtime checks passed.
- Full multi-role browser/manual API smoke testing is still incomplete, so Phase 2 is not yet signed off.
