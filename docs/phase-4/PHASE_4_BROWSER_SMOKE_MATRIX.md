# Phase 4 Browser Smoke Matrix

## Status

`PASS`

| Test ID | Role | Surface | Status | Actual | Evidence |
| --- | --- | --- | --- | --- | --- |
| P4-BR-001 | Department Admin | /admin/teacher-departments | PASS | Teacher department membership saved from admin UI | docs/phase-4/evidence/P4-BR-001-membership.png |
| P4-BR-002 | Department Admin | /admin/teaching-assignments | PASS | Lead and examiner assignment created from admin UI | docs/phase-4/evidence/P4-BR-002-lead-examiner-assignment.png |
| P4-BR-003 | Department Admin | /api/admin/teaching-assignments | PASS | Duplicate assignment request returned 409 | docs/phase-4/evidence/P4-BR-003-duplicate-rejection.txt |
| P4-BR-004 | Department Admin | /admin/teaching-assignments | PASS | Assignment workflow submit -> approve -> activate completed in admin UI | docs/phase-4/evidence/P4-BR-004-approval-activation.png |
| P4-BR-005 | Department Admin | /admin/teaching-assignments | PASS | Assistant/reviewer assignment activated, suspended, and completed | docs/phase-4/evidence/P4-BR-005-suspension-completion.png |
| P4-BR-006 | Department Admin | /api/admin/teaching-assignments | PASS | Cross-department assignment attempt returned 403 | docs/phase-4/evidence/P4-BR-006-cross-department-rejection.txt |
| P4-BR-007 | Department Admin | /admin/teacher-substitutions | PASS | Substitution created from admin UI | docs/phase-4/evidence/P4-BR-007-substitution-create.png |
| P4-BR-008 | Department Admin | /api/admin/teacher-substitutions | PASS | Overlapping substitution attempt returned 409 | docs/phase-4/evidence/P4-BR-008-overlap-rejection.txt |
| P4-BR-009 | Teacher | /teacher/assignments | PASS | Teacher assignments page renders normalized and legacy assignments | docs/phase-4/evidence/P4-BR-009-teacher-assignments.png |
| P4-BR-010 | Teacher | /teacher/workload | PASS | Teacher workload page renders | docs/phase-4/evidence/P4-BR-010-teacher-workload.png |
| P4-BR-011 | Department Admin | /admin/teacher-workload | PASS | Reporting page rendered and CSV export returned 200 | docs/phase-4/evidence/P4-BR-011-workload-report.png |
| P4-BR-012 | Teacher | /api/questions | PASS | Lead teacher question creation returned 201 | docs/phase-4/evidence/P4-BR-012-lead-question.txt |
| P4-BR-013 | Teacher | /api/exams | PASS | Lead teacher exam creation returned 201 | docs/phase-4/evidence/P4-BR-013-lead-exam.txt |
| P4-BR-014 | Teacher | /api/exams | PASS | Active substitute exam visibility returned 200 | docs/phase-4/evidence/P4-BR-014-substitute-exam-list.txt |
| P4-BR-015 | Teacher | /api/results/[id] | PASS | Substitute result review returned 200 | docs/phase-4/evidence/P4-BR-015-substitute-result-review.txt |
| P4-BR-016 | Teacher | socket teacher:join_exam_monitor | PASS | Substitute socket authorization result: connected | docs/phase-4/evidence/P4-BR-016-substitute-socket.txt |
| P4-BR-017 | Teacher | /api/results/[id] | PASS | Expired substitute denial returned 403 | docs/phase-4/evidence/P4-BR-017-expired-substitute-denial.txt |
| P4-BR-018 | Teacher | /api/questions | PASS | Foreign assignment question creation returned 403 | docs/phase-4/evidence/P4-BR-018-foreign-question-denial.txt |
| P4-BR-019 | Teacher | socket teacher:join_exam_monitor | PASS | Unassigned teacher socket denial: {"message":"Not allowed for this exam"} | docs/phase-4/evidence/P4-BR-019-unassigned-socket-denial.txt |