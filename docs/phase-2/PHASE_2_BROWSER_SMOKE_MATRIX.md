# Phase 2 Browser Smoke Matrix

| Test ID | Page or API | Role | Expected result | Actual result | Status | Evidence | Defect ID |
| --- | --- | --- | --- | --- | --- | --- | --- |
| DL-001 | /admin/degree-levels | SUPER_ADMIN | Page loads without fatal error | Loaded degree-level page | PASS | docs/phase-2/evidence/DL-001-degree-levels-list.png |  |
| DL-002 | /admin/degree-levels | SUPER_ADMIN | Degree level created successfully | Degree level created through browser form | PASS | docs/phase-2/evidence/DL-002-bsc-created.png |  |
| DL-003 | /admin/degree-levels | SUPER_ADMIN | Degree level created successfully | Degree level created through browser form | PASS | docs/phase-2/evidence/DL-003-msc-created.png |  |
| DL-004 | /admin/degree-levels | SUPER_ADMIN | Duplicate code rejected | Degree level code already exists | PASS | docs/phase-2/evidence/DL-004-duplicate-degree.png |  |
| DL-005 | /admin/degree-levels | SUPER_ADMIN | Validation error shown | defaultYears: Number must be greater than 0 | PASS | docs/phase-2/evidence/DL-005-invalid-default-years.png |  |
| DLANG-001 | /admin/department-languages | SUPER_ADMIN | Mapping created | Created | PASS | docs/phase-2/evidence/DLANG-001-cse-english.png |  |
| DLANG-002 | /admin/department-languages | SUPER_ADMIN | Mapping created | Created | PASS | docs/phase-2/evidence/DLANG-002-cse-russian.png |  |
| DLANG-003 | /admin/department-languages | SUPER_ADMIN | Mapping created | Created | PASS | docs/phase-2/evidence/DLANG-003-eee-russian.png |  |
| SESS-001 | /admin/academic-sessions | SUPER_ADMIN | Current session created | Created | PASS | docs/phase-2/evidence/SESS-001-current-session.png |  |
| SESS-002 | /admin/academic-sessions | SUPER_ADMIN | Historical session created | Created | PASS | docs/phase-2/evidence/SESS-002-historical-session.png |  |
| PROG-001 | /admin/programs | SUPER_ADMIN | Program created | Created | PASS | docs/phase-2/evidence/PROG-001-bsc-cs.png |  |
| PROG-002 | /admin/programs | SUPER_ADMIN | Program created | Created | PASS | docs/phase-2/evidence/PROG-002-msc-ai.png |  |
| PROG-003 | /admin/programs | SUPER_ADMIN | Program created | Created | PASS | docs/phase-2/evidence/PROG-003-bsc-eee.png |  |
| PY-001 | /admin/program-years | SUPER_ADMIN | Program years created | Created Year 1-4 for BSc and Year 1-2 for MSc | PASS | docs/phase-2/evidence/PY-001-program-years.png |  |
| PS-001 | /admin/program-semesters | SUPER_ADMIN | Mappings created | Created mappings for BSc/MSc/EEE smoke setup | PASS | docs/phase-2/evidence/PS-001-program-semesters.png |  |
| CUR-001 | /admin/curriculum | SUPER_ADMIN | Curriculum items created | Created PF, DSA, ML, and EEE subject mappings | PASS | docs/phase-2/evidence/CUR-001-curriculum.png |  |
| GRP-001 | /admin/groups | SUPER_ADMIN | Groups created with normalized context | Created through browser forms | PASS | docs/phase-2/evidence/GRP-001-groups.png |  |
| OFF-001 | /admin/academic-offerings | SUPER_ADMIN | Offerings created | Created through browser forms | PASS | docs/phase-2/evidence/OFF-001-offerings.png |  |
| AUTH-DA-001 | /api/admin/programs | DEPARTMENT_ADMIN_A | 403 forbidden | 403 {"error":"Forbidden for this department"} | PASS | docs/phase-2/evidence/auth-dept-admin-a-program.txt |  |
| AUTH-DB-001 | /api/admin/department-languages | DEPARTMENT_ADMIN_B | 403 forbidden | 403 {"error":"Forbidden for this department"} | PASS | docs/phase-2/evidence/auth-dept-admin-b-language.txt |  |
| AUTH-T-001 | /api/admin/degree-levels | TEACHER | 403 forbidden | 403 {"error":"FORBIDDEN"} | PASS | docs/phase-2/evidence/auth-t-001.txt |  |
| AUTH-S-001 | /api/admin/degree-levels | STUDENT | 403 forbidden | 403 {"error":"FORBIDDEN"} | PASS | docs/phase-2/evidence/auth-s-001.txt |  |
| AUTH-U-001 | /api/admin/degree-levels | UNAUTHENTICATED | 401 unauthorized | 401 {"error":"UNAUTHORIZED"} | PASS | docs/phase-2/evidence/auth-unauth-degree-levels.txt |  |
| COMP-TA-001 | /teacher/assignments | TEACHER | Legacy assignments load | Teacher assignments page loaded | PASS | docs/phase-2/evidence/COMP-TA-001-teacher-assignments.png |  |
| COMP-EX-001 | /teacher/exams/create | TEACHER | Teacher exam creation page loads | Page loaded | PASS | docs/phase-2/evidence/COMP-EX-001-teacher-create-exam.png |  |
| COMP-SS-001 | /student/exams | STUDENT | Legacy student page loads without crash | Student exams page loaded | PASS | docs/phase-2/evidence/COMP-SS-001-student-exams.png |  |
| COMP-R-001 | /student/results | STUDENT | Results page loads without crash | Student results page loaded | PASS | docs/phase-2/evidence/COMP-R-001-student-results.png |  |