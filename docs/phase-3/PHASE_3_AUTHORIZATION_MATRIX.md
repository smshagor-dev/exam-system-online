# Phase 3 Authorization Matrix

Status: PARTIAL_EXECUTED_EVIDENCE

| Endpoint | Method | Super Admin | Department Admin own scope | Department Admin foreign scope | Teacher | Student | Unauthenticated |
| --- | --- | --- | --- | --- | --- | --- | --- |

## Detailed Results
- `AUTH-ENR-GET` GET `/api/admin/enrollments`
- Super Admin: expected Allowed business response (200/201/400/404/409/422), actual 200, PASS, evidence `docs/phase-3/evidence/authorization-matrix-results.json`
- Department Admin own scope: expected Allowed business response (200/201/400/404/409/422), actual 200, PASS, evidence `docs/phase-3/evidence/authorization-matrix-results.json`
- Department Admin foreign scope: expected 403, actual 403, PASS, evidence `docs/phase-3/evidence/authorization-matrix-results.json`
- Teacher: expected 403, actual 403, PASS, evidence `docs/phase-3/evidence/authorization-matrix-results.json`
- Student: expected 200 for own history only, otherwise 403, actual 403, PASS, evidence `docs/phase-3/evidence/authorization-matrix-results.json`
- Unauthenticated: expected 401, actual 401, PASS, evidence `docs/phase-3/evidence/authorization-matrix-results.json`
- `AUTH-ENR-POST` POST `/api/admin/enrollments`
- Super Admin: expected Allowed business response (200/201/400/404/409/422), actual 400, PASS, evidence `docs/phase-3/evidence/authorization-matrix-results.json`
- Department Admin own scope: expected Allowed business response (200/201/400/404/409/422), actual 400, PASS, evidence `docs/phase-3/evidence/authorization-matrix-results.json`
- Department Admin foreign scope: expected 403, actual 403, PASS, evidence `docs/phase-3/evidence/authorization-matrix-results.json`
- Teacher: expected 403, actual 403, PASS, evidence `docs/phase-3/evidence/authorization-matrix-results.json`
- Student: expected 200 for own history only, otherwise 403, actual 403, PASS, evidence `docs/phase-3/evidence/authorization-matrix-results.json`
- Unauthenticated: expected 401, actual 401, PASS, evidence `docs/phase-3/evidence/authorization-matrix-results.json`
- `AUTH-ENR-PATCH` PATCH `/api/admin/enrollments/cmrgoxdx8005ypmlzl151rkdj`
- Super Admin: expected Allowed business response (200/201/400/404/409/422), actual 200, PASS, evidence `docs/phase-3/evidence/authorization-matrix-results.json`
- Department Admin own scope: expected Allowed business response (200/201/400/404/409/422), actual 200, PASS, evidence `docs/phase-3/evidence/authorization-matrix-results.json`
- Department Admin foreign scope: expected 403, actual 403, PASS, evidence `docs/phase-3/evidence/authorization-matrix-results.json`
- Teacher: expected 403, actual 403, PASS, evidence `docs/phase-3/evidence/authorization-matrix-results.json`
- Student: expected 200 for own history only, otherwise 403, actual 403, PASS, evidence `docs/phase-3/evidence/authorization-matrix-results.json`
- Unauthenticated: expected 401, actual 401, PASS, evidence `docs/phase-3/evidence/authorization-matrix-results.json`
- `AUTH-TIMELINE-GET` GET `/api/admin/enrollments/cmrgowvz3003ipmlzjls44rak/timeline`
- Super Admin: expected Allowed business response (200/201/400/404/409/422), actual 200, PASS, evidence `docs/phase-3/evidence/authorization-matrix-results.json`
- Department Admin own scope: expected Allowed business response (200/201/400/404/409/422), actual 200, PASS, evidence `docs/phase-3/evidence/authorization-matrix-results.json`
- Department Admin foreign scope: expected 403, actual 403, PASS, evidence `docs/phase-3/evidence/authorization-matrix-results.json`
- Teacher: expected 403, actual 403, PASS, evidence `docs/phase-3/evidence/authorization-matrix-results.json`
- Student: expected 200 for own history only, otherwise 403, actual 403, PASS, evidence `docs/phase-3/evidence/authorization-matrix-results.json`
- Unauthenticated: expected 401, actual 401, PASS, evidence `docs/phase-3/evidence/authorization-matrix-results.json`
- `AUTH-PRO-POST` POST `/api/admin/promotions`
- Super Admin: expected Allowed business response (200/201/400/404/409/422), actual 400, PASS, evidence `docs/phase-3/evidence/authorization-matrix-results.json`
- Department Admin own scope: expected Allowed business response (200/201/400/404/409/422), actual 400, PASS, evidence `docs/phase-3/evidence/authorization-matrix-results.json`
- Department Admin foreign scope: expected 403, actual 403, PASS, evidence `docs/phase-3/evidence/authorization-matrix-results.json`
- Teacher: expected 403, actual 403, PASS, evidence `docs/phase-3/evidence/authorization-matrix-results.json`
- Student: expected 200 for own history only, otherwise 403, actual 403, PASS, evidence `docs/phase-3/evidence/authorization-matrix-results.json`
- Unauthenticated: expected 401, actual 401, PASS, evidence `docs/phase-3/evidence/authorization-matrix-results.json`
- `AUTH-PRO-PREVIEW` POST `/api/admin/promotions/preview`
- Super Admin: expected Allowed business response (200/201/400/404/409/422), actual 200, PASS, evidence `docs/phase-3/evidence/authorization-matrix-results.json`
- Department Admin own scope: expected Allowed business response (200/201/400/404/409/422), actual 200, PASS, evidence `docs/phase-3/evidence/authorization-matrix-results.json`
- Department Admin foreign scope: expected 403, actual 403, PASS, evidence `docs/phase-3/evidence/authorization-matrix-results.json`
- Teacher: expected 403, actual 403, PASS, evidence `docs/phase-3/evidence/authorization-matrix-results.json`
- Student: expected 200 for own history only, otherwise 403, actual 403, PASS, evidence `docs/phase-3/evidence/authorization-matrix-results.json`
- Unauthenticated: expected 401, actual 401, PASS, evidence `docs/phase-3/evidence/authorization-matrix-results.json`
- `AUTH-PRO-BULK` POST `/api/admin/promotions/bulk`
- Super Admin: expected Allowed business response (200/201/400/404/409/422), actual 200, PASS, evidence `docs/phase-3/evidence/authorization-matrix-results.json`
- Department Admin own scope: expected Allowed business response (200/201/400/404/409/422), actual 200, PASS, evidence `docs/phase-3/evidence/authorization-matrix-results.json`
- Department Admin foreign scope: expected 403, actual 403, PASS, evidence `docs/phase-3/evidence/authorization-matrix-results.json`
- Teacher: expected 403, actual 403, PASS, evidence `docs/phase-3/evidence/authorization-matrix-results.json`
- Student: expected 200 for own history only, otherwise 403, actual 403, PASS, evidence `docs/phase-3/evidence/authorization-matrix-results.json`
- Unauthenticated: expected 401, actual 401, PASS, evidence `docs/phase-3/evidence/authorization-matrix-results.json`
- `AUTH-TRN-POST` POST `/api/admin/transfers`
- Super Admin: expected Allowed business response (200/201/400/404/409/422), actual 404, PASS, evidence `docs/phase-3/evidence/authorization-matrix-results.json`
- Department Admin own scope: expected Allowed business response (200/201/400/404/409/422), actual 404, PASS, evidence `docs/phase-3/evidence/authorization-matrix-results.json`
- Department Admin foreign scope: expected 403 or 404 safe denial, actual 404, PASS, evidence `docs/phase-3/evidence/authorization-matrix-results.json`
- Teacher: expected 403, actual 403, PASS, evidence `docs/phase-3/evidence/authorization-matrix-results.json`
- Student: expected 200 for own history only, otherwise 403, actual 403, PASS, evidence `docs/phase-3/evidence/authorization-matrix-results.json`
- Unauthenticated: expected 401, actual 401, PASS, evidence `docs/phase-3/evidence/authorization-matrix-results.json`
- `AUTH-LEV-POST` POST `/api/admin/leaves`
- Super Admin: expected Allowed business response (200/201/400/404/409/422), actual 201, PASS, evidence `docs/phase-3/evidence/authorization-matrix-results.json`
- Department Admin own scope: expected Allowed business response (200/201/400/404/409/422), actual 400, PASS, evidence `docs/phase-3/evidence/authorization-matrix-results.json`
- Department Admin foreign scope: expected 403, actual 403, PASS, evidence `docs/phase-3/evidence/authorization-matrix-results.json`
- Teacher: expected 403, actual 403, PASS, evidence `docs/phase-3/evidence/authorization-matrix-results.json`
- Student: expected 200 for own history only, otherwise 403, actual 403, PASS, evidence `docs/phase-3/evidence/authorization-matrix-results.json`
- Unauthenticated: expected 401, actual 401, PASS, evidence `docs/phase-3/evidence/authorization-matrix-results.json`
- `AUTH-REA-POST` POST `/api/admin/readmissions`
- Super Admin: expected Allowed business response (200/201/400/404/409/422), actual 400, PASS, evidence `docs/phase-3/evidence/authorization-matrix-results.json`
- Department Admin own scope: expected Allowed business response (200/201/400/404/409/422), actual 400, PASS, evidence `docs/phase-3/evidence/authorization-matrix-results.json`
- Department Admin foreign scope: expected 403, actual 403, PASS, evidence `docs/phase-3/evidence/authorization-matrix-results.json`
- Teacher: expected 403, actual 403, PASS, evidence `docs/phase-3/evidence/authorization-matrix-results.json`
- Student: expected 200 for own history only, otherwise 403, actual 403, PASS, evidence `docs/phase-3/evidence/authorization-matrix-results.json`
- Unauthenticated: expected 401, actual 401, PASS, evidence `docs/phase-3/evidence/authorization-matrix-results.json`
- `AUTH-GRD-POST` POST `/api/admin/graduations`
- Super Admin: expected Allowed business response (200/201/400/404/409/422), actual 400, PASS, evidence `docs/phase-3/evidence/authorization-matrix-results.json`
- Department Admin own scope: expected Allowed business response (200/201/400/404/409/422), actual 400, PASS, evidence `docs/phase-3/evidence/authorization-matrix-results.json`
- Department Admin foreign scope: expected 403, actual 403, PASS, evidence `docs/phase-3/evidence/authorization-matrix-results.json`
- Teacher: expected 403, actual 403, PASS, evidence `docs/phase-3/evidence/authorization-matrix-results.json`
- Student: expected 200 for own history only, otherwise 403, actual 403, PASS, evidence `docs/phase-3/evidence/authorization-matrix-results.json`
- Unauthenticated: expected 401, actual 401, PASS, evidence `docs/phase-3/evidence/authorization-matrix-results.json`
- `AUTH-GRD-PATCH` PATCH `/api/admin/graduations`
- Super Admin: expected Allowed business response (200/201/400/404/409/422), actual 400, PASS, evidence `docs/phase-3/evidence/authorization-matrix-results.json`
- Department Admin own scope: expected Allowed business response (200/201/400/404/409/422), actual 400, PASS, evidence `docs/phase-3/evidence/authorization-matrix-results.json`
- Department Admin foreign scope: expected 403, actual 403, PASS, evidence `docs/phase-3/evidence/authorization-matrix-results.json`
- Teacher: expected 403, actual 403, PASS, evidence `docs/phase-3/evidence/authorization-matrix-results.json`
- Student: expected 200 for own history only, otherwise 403, actual 403, PASS, evidence `docs/phase-3/evidence/authorization-matrix-results.json`
- Unauthenticated: expected 401, actual 401, PASS, evidence `docs/phase-3/evidence/authorization-matrix-results.json`
- `AUTH-STD-HISTORY` GET `/api/account/academic-history`
- Super Admin: expected 403, actual 403, PASS, evidence `docs/phase-3/evidence/authorization-matrix-results.json`
- Department Admin own scope: expected 403, actual 403, PASS, evidence `docs/phase-3/evidence/authorization-matrix-results.json`
- Department Admin foreign scope: expected 403, actual 403, PASS, evidence `docs/phase-3/evidence/authorization-matrix-results.json`
- Teacher: expected 403, actual 403, PASS, evidence `docs/phase-3/evidence/authorization-matrix-results.json`
- Student: expected 200, actual 200, PASS, evidence `docs/phase-3/evidence/authorization-matrix-results.json`
- Unauthenticated: expected 401, actual 401, PASS, evidence `docs/phase-3/evidence/authorization-matrix-results.json`
| `/api/admin/enrollments` | `GET` | 200 / PASS | 200 / PASS | 403 / PASS | 403 / PASS | 403 / PASS | 401 / PASS |
| `/api/admin/enrollments` | `POST` | 400 / PASS | 400 / PASS | 403 / PASS | 403 / PASS | 403 / PASS | 401 / PASS |
| `/api/admin/enrollments/cmrgoxdx8005ypmlzl151rkdj` | `PATCH` | 200 / PASS | 200 / PASS | 403 / PASS | 403 / PASS | 403 / PASS | 401 / PASS |
| `/api/admin/enrollments/cmrgowvz3003ipmlzjls44rak/timeline` | `GET` | 200 / PASS | 200 / PASS | 403 / PASS | 403 / PASS | 403 / PASS | 401 / PASS |
| `/api/admin/promotions` | `POST` | 400 / PASS | 400 / PASS | 403 / PASS | 403 / PASS | 403 / PASS | 401 / PASS |
| `/api/admin/promotions/preview` | `POST` | 200 / PASS | 200 / PASS | 403 / PASS | 403 / PASS | 403 / PASS | 401 / PASS |
| `/api/admin/promotions/bulk` | `POST` | 200 / PASS | 200 / PASS | 403 / PASS | 403 / PASS | 403 / PASS | 401 / PASS |
| `/api/admin/transfers` | `POST` | 404 / PASS | 404 / PASS | 404 / PASS | 403 / PASS | 403 / PASS | 401 / PASS |
| `/api/admin/leaves` | `POST` | 201 / PASS | 400 / PASS | 403 / PASS | 403 / PASS | 403 / PASS | 401 / PASS |
| `/api/admin/readmissions` | `POST` | 400 / PASS | 400 / PASS | 403 / PASS | 403 / PASS | 403 / PASS | 401 / PASS |
| `/api/admin/graduations` | `POST` | 400 / PASS | 400 / PASS | 403 / PASS | 403 / PASS | 403 / PASS | 401 / PASS |
| `/api/admin/graduations` | `PATCH` | 400 / PASS | 400 / PASS | 403 / PASS | 403 / PASS | 403 / PASS | 401 / PASS |
| `/api/account/academic-history` | `GET` | 403 / PASS | 403 / PASS | 403 / PASS | 403 / PASS | 200 / PASS | 401 / PASS |