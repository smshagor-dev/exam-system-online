# Phase 3 API

## Admin APIs

- `GET /api/admin/enrollments`
- `POST /api/admin/enrollments`
- `PATCH /api/admin/enrollments/:studentId`
- `GET /api/admin/enrollments/:studentId/timeline`
- `POST /api/admin/promotions`
- `POST /api/admin/promotions/preview`
- `POST /api/admin/promotions/bulk`
- `POST /api/admin/transfers`
- `POST /api/admin/leaves`
- `POST /api/admin/readmissions`
- `POST /api/admin/graduations`
- `PATCH /api/admin/graduations`

## Student API

- `GET /api/account/academic-history`

## Behavior

- Department admins are limited to managed departments
- Student timeline/history records are append-only
- Promotion validates progression and published results unless documented override is used
- Transfer closes the old enrollment and creates a validated replacement enrollment
- Leave closes active enrollment without deleting history
- Readmission reopens academic progression through a new active enrollment
- Graduation terminates active progression and records immutable graduation metadata

## Validated status

- API role checks and department isolation are proven by browser smoke evidence
- Student-facing academic history responses are sanitized to exclude internal audit metadata and private admin notes
