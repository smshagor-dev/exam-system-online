# Phase 3 Database

## Added enums

- `StudentEnrollmentStatus`
- `StudentAcademicHistoryEventType`
- `StudentPromotionStatus`
- `StudentTransferType`
- `StudentLeaveType`

## Added models

- `StudentEnrollment`
- `StudentAcademicHistory`
- `StudentPromotion`
- `StudentTransfer`
- `StudentLeave`
- `StudentGraduation`

## Design notes

- History is append-only
- Student records are never deleted
- Active enrollment uniqueness is enforced in the lifecycle service
- Historical enrollments remain queryable after transfer, leave, readmission, and graduation
- Legacy `StudentSubject` is synchronized from academic offerings for backward compatibility

## Known implementation boundary

- MongoDB partial uniqueness for "one ACTIVE enrollment only" is not enforced at the database level in this phase; the lifecycle service enforces it transactionally

## Validated status

- `phase3:verify` reports zero integrity failures and zero warnings on the Phase 3 QA dataset
- Open leave detection now handles Mongo unset and null `readmittedAt` values consistently
