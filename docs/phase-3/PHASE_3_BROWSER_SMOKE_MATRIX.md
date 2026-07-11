# Phase 3 Browser Smoke Matrix

Current status: EXPANDED_EVIDENCE_BLOCKED

Smoke baseline totals:

- PASS: 21
- FAIL: 0
- BLOCKED: 0

Expanded coverage execution on 2026-07-11:

- PASS: 138
- FAIL: 14
- BLOCKED: 23
- Authoritative execution summary: `docs/phase-3/evidence/coverage-execution-summary.json`
- Narrative report: `docs/phase-3/PHASE_3_COVERAGE_EXECUTION_REPORT.md`

Note:

- This matrix still records the original smoke subset below.
- The larger execution pass now exists and substantially expands evidence coverage, but the final state remains blocked because the expanded run still contains unresolved FAIL and BLOCKED cases.

## Results

| Test ID | Role | Page/API | Expected | Actual | Evidence | Status |
| --- | --- | --- | --- | --- | --- | --- |
| `AUTH-LOGIN-ADMIN` | Department Admin | `/login` | Admin can sign in | Admin reached dashboard | `evidence/auth-login-admin.png` | PASS |
| `ENR-001` | Department Admin | `/admin/enrollments` | Create enrollment | Grace enrollment created | `evidence/enrollment-create-grace.png` | PASS |
| `ENR-002` | Department Admin | `/admin/enrollments` | Reject second active enrollment | Duplicate submit left exactly one active enrollment | `evidence/enrollment-reject-second-active.png` | PASS |
| `ENR-003` | Department Admin | `/admin/enrollments` | View lifecycle timeline | Grace timeline rendered | `evidence/enrollment-timeline-grace.png` | PASS |
| `PRO-001` | Department Admin | `/admin/promotions` | Promote eligible student | Dave promoted into `CSE-Y2-A` | `evidence/promotion-success-dave.png` | PASS |
| `PRO-002` | Department Admin | `/admin/promotions` | Reject invalid promotion | Bob rejection surfaced unpublished-result rule | `evidence/promotion-reject-bob.png` | PASS |
| `TRN-001` | Department Admin | `/admin/transfers` | Transfer student | Bob transferred into `CSE-Y1-B` | `evidence/transfer-success-bob.png` | PASS |
| `LEV-001` | Department Admin | `/admin/leaves` | Create leave and close active enrollment | Grace leave created | `evidence/leave-success-grace.png` | PASS |
| `REA-001` | Department Admin | `/admin/readmissions` | Readmit eligible student | Grace readmitted into active enrollment | `evidence/readmission-success-grace.png` | PASS |
| `GRD-001` | Department Admin | `/admin/graduation` | Reject invalid graduation | Frank rejection surfaced unpublished-result rule | `evidence/graduation-reject-frank.png` | PASS |
| `GRD-002` | Department Admin | `/admin/graduation` | Graduate eligible student | Hannah graduation completed | `evidence/graduation-success-hannah.png` | PASS |
| `AUTH-EEE-403` | Department Admin | `/api/admin/enrollments/[studentId]/timeline` | Cross-scope access denied | Returned `403` | `evidence/auth-eee-cross-scope.png` | PASS |
| `AUTH-TEACHER-403` | Teacher | `/api/admin/enrollments` | Teacher lifecycle write denied | Returned `403` | `evidence/auth-teacher-write-denied.png` | PASS |
| `STD-001` | Student | `/student/academic-history` | Student own history visible | Grace history rendered | `evidence/student-history-grace.png` | PASS |
| `AUTH-STUDENT-403` | Student | `/api/admin/enrollments` | Student lifecycle write denied | Returned `403` | `evidence/auth-student-write-denied.png` | PASS |
| `AUTH-ANON-401` | Unauthenticated | `/api/admin/enrollments` | Anonymous lifecycle access denied | Returned `401` | n/a | PASS |
| `P3-ELG-UI-001` | Student | `/student/exams` | Transferred student only sees target-scope live exams | Victor sees `BSc Y1B Exam` and `Victor Target Scope Exam`; old `BSc Semester 1 Exam` is absent | `evidence/browser/P3-ELG-UI-001-victor-exam-list.png` | PASS |
| `P3-ELG-UI-002` | Student | `/student/exams/[id]` | Direct URL to old-scope exam is denied safely | Old-scope exam detail returns a `404` page for Victor | `evidence/browser/P3-ELG-UI-002-victor-old-direct-url-denied.png` | PASS |
| `P3-ELG-UI-003` | Student | `/student/exams` | Graduated student cannot start new exams from browser list | Peggy sees graduated-state banner and no new attempts | `evidence/browser/P3-ELG-UI-003-peggy-graduated-blocked.png` | PASS |
| `P3-ELG-UI-004` | Student | `/student/exams` | Student on leave cannot start new exams from browser list | Sybil sees active-leave banner and no new attempts | `evidence/browser/P3-ELG-UI-004-sybil-leave-blocked.png` | PASS |
| `P3-HIS-UI-001` | Student | `/student/academic-history` | Student own academic history remains visible after lifecycle events | Grace academic history page renders successfully | `evidence/browser/P3-HIS-UI-001-grace-history.png` | PASS |
