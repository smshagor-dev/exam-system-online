# Phase 3 Architecture

Phase 3 extends the Phase 2 normalized academic structure without redesigning it.

## Lifecycle modules

- `StudentEnrollment`: preferred current academic context
- `StudentAcademicHistory`: append-only lifecycle timeline
- `StudentPromotion`: audited promotion log
- `StudentTransfer`: transfer log with source and target context
- `StudentLeave`: leave and readmission tracking
- `StudentGraduation`: graduation and alumni progression

## Compatibility rules

- `StudentProfile` remains intact
- `StudentSubject` remains active for legacy compatibility
- Exam, result, auth, and socket flows are preserved
- Active enrollment is preferred over legacy-only scope when both exist
- Lifecycle transitions synchronize legacy `StudentSubject` records from academic offerings

## Primary implementation surfaces

- Service layer: `src/lib/student-lifecycle.ts`
- Validation: `src/lib/validators.ts`
- Permissions: `src/lib/permissions.ts`
- Admin APIs: `src/app/api/admin/enrollments`, `promotions`, `transfers`, `leaves`, `readmissions`, `graduations`
- Student API: `src/app/api/account/academic-history`
- Admin UI: `src/app/admin/enrollments`, `promotions`, `transfers`, `leaves`, `readmissions`, `graduation`
- Timeline/history UI: `src/app/admin/academic-history`, `src/app/admin/student-timeline`, `src/app/student/academic-history`

## Final status

- Phase 3 architecture is operational and validated as PASS.
- Admin lifecycle pages execute real workflow mutations through validated APIs.
