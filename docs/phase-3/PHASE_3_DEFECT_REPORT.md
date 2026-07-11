# Phase 3 Defect Report

## DEF-001

- Requirement: lifecycle context validation must reject inactive academic entities
- Reproduction: create enrollment or transition into an inactive program, session, group, or department-language mapping
- Expected: operation rejected before any partial lifecycle record is written
- Actual before fix: inactive context records could pass through service-level resolution if IDs were otherwise valid
- Root cause: `resolveEnrollmentContext` validated identity and relationship shape, but not `isActive` state for several academic entities
- Files changed: `src/lib/student-lifecycle.ts`, `scripts/phase-3/lifecycle-tests.ts`
- Fix: added inactive-state checks for sessions, programs, program years, semesters, program semesters, groups, and department-language mappings
- Automated regression test: `ENR-006`, `ENR-008`, `ENR-011`, `ENR-014`
- Browser retest: not executed in this pass
- Status: FIXED

## DEF-002

- Requirement: leave and graduation states must not regain exam access through legacy fallback
- Reproduction: evaluate exam access for a student on leave or already graduated while legacy `StudentSubject` rows still exist
- Expected: access denied
- Actual before fix: permission logic could fall back to legacy scope when no active enrollment existed
- Root cause: `studentCanAccessExam` only preferred active enrollment and did not explicitly deny leave/graduation terminal states before legacy fallback
- Files changed: `src/lib/permissions.ts`, `scripts/phase-3/lifecycle-tests.ts`
- Fix: added explicit leave and graduation gating ahead of legacy fallback
- Automated regression test: `LEV-001`, `REA-001`, `ELG-002`
- Browser retest: not executed in this pass
- Status: FIXED

## DEF-003

- Requirement: browser-visible exam eligibility must honor active enrollment precedence and direct exam URLs must deny out-of-scope students securely
- Reproduction: sign in as a transferred student and open `/student/exams`, then browse directly to an old-scope exam detail URL; also sign in as a graduated or leave-state student and open `/student/exams`
- Expected: only target-scope live exams are shown, old-scope direct URLs deny safely, and graduated or leave-state students do not receive new exam attempts from the browser list
- Actual before fix: the student exam list was built from raw legacy `StudentSubject` rows and the direct detail page rendered without a permission check, so old-scope exam visibility could leak in the browser
- Root cause: `src/app/student/exams/page.tsx` queried directly from legacy subject scope instead of authoritative lifecycle scope, and `src/app/student/exams/[id]/page.tsx` did not enforce `studentCanAccessExam`
- Files changed: `src/lib/permissions.ts`, `src/app/student/exams/page.tsx`, `src/app/student/exams/[id]/page.tsx`, `scripts/phase-3/lifecycle-tests.ts`
- Fix: added `getStudentExamCatalogScope` to apply active-enrollment precedence and terminal-state blocking in the student exam catalog, and added a direct permission gate to the exam detail page
- Automated regression test: `ELG-003`, `ELG-004`
- Browser retest: `P3-ELG-UI-001`, `P3-ELG-UI-002`, `P3-ELG-UI-003`, `P3-ELG-UI-004`
- Evidence: `docs/phase-3/evidence/browser/P3-ELG-UI-001-victor-exam-list.png`, `docs/phase-3/evidence/browser/P3-ELG-UI-002-victor-old-direct-url-denied.png`, `docs/phase-3/evidence/browser/P3-ELG-UI-003-peggy-graduated-blocked.png`, `docs/phase-3/evidence/browser/P3-ELG-UI-004-sybil-leave-blocked.png`
- Status: FIXED
