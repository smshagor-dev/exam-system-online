# Academic Scope Dependency Map

## Purpose

This document records where the current academic scope is stored and consumed before Phase 2 introduces the normalized academic architecture.

## Current Legacy Scope Model

The current repository uses a repeated academic scope tuple instead of a reusable normalized offering model:

`departmentId + subjectId + languageId + groupId + academicYearId + semesterId`

Additional academic meaning is partially stored in:

- `StudentProfile.customFieldResponses.course`
- `AcademicYear.year`
- `Group.academicYearId`
- `Subject.departmentId`

## Current Storage Locations

### Prisma models

- `Department`: top-level organizational owner for subjects, teachers, students, exams, coursework, ebooks, and registration fields.
- `Subject`: linked to `departmentId`, optionally `languageId`.
- `Language`: global language master list, reused directly in teaching scope.
- `AcademicYear`: currently represents generic "Year 1", "Year 2", and is reused globally across departments and programs.
- `Semester`: currently global master list with no program-specific mapping.
- `Group`: only linked to `academicYearId`; no direct department, program, language, or semester context.
- `TeacherAssignment`: full legacy scope tuple stored directly.
- `StudentSubject`: enrollment-like scope tuple stored directly.
- `Exam`: full legacy scope tuple stored directly.
- `Question`: full legacy scope tuple stored directly.
- `EbookUpload`: full legacy scope tuple stored directly.
- `CourseworkRule`: full legacy scope tuple stored directly.
- `CourseworkAssignment`: full legacy scope tuple stored directly.
- `StudentProfile`: department stored directly, course stored indirectly in `customFieldResponses`.

## Dependency Map by Area

### Admin forms

- `src/app/admin/teachers/TeacherManager.tsx`
  Uses dependent selects in the order `department -> academicYear -> group -> language -> semester -> subject`.
  Teacher assignments are created from raw legacy fields.
- `src/app/admin/groups/page.tsx`
  Groups are managed only with `name`, `code`, and `academicYearId`.
- `src/app/admin/subjects/page.tsx`
  Subjects are scoped by `departmentId` and `languageId`.
- `src/app/admin/dashboard/page.tsx`
  Department-filtered counts assume scope is anchored by department relations.
- `src/app/admin/exams/page.tsx`, `src/app/admin/results/page.tsx`, `src/app/admin/ebooks/page.tsx`
  All visibility is filtered through legacy department ownership.

### API routes

- `src/app/api/admin/teachers/assign/route.ts`
  Creates teacher assignments using the full legacy tuple.
- `src/app/api/questions/route.ts`
  Filters and creates questions directly with `subjectId`, `languageId`, `groupId`, `academicYearId`, `semesterId`.
- `src/app/api/exams/route.ts`
  Creates exams from the legacy tuple and checks teacher assignment against the same tuple.
- `src/app/api/ebooks/route.ts`
  Uses teacher assignment scope to allow upload and filters records with the same fields.
- `src/app/api/coursework/rules/route.ts`
  Coursework rules are created and fetched using the legacy tuple.
- `src/app/api/coursework/assignments/route.ts`
  Coursework assignment access is validated through matching teacher assignment scope.
- `src/app/api/account/profile/route.ts`
  Student profile update validates `course`, `departmentId`, `subjectId`, `languageId`, `groupId`, `academicYearId`, `semesterId`.
- `src/app/api/auth/register/route.ts`
  Registration captures `course` plus the same legacy academic tuple.
- `src/app/api/public/departments|languages|years|semesters|groups|subjects`
  Public dependent-select endpoints expose the same legacy academic structure.

### Permission checks

- `src/lib/permissions.ts`
  `teacherCanAccessAssignment()` matches on `subjectId`, `languageId`, `groupId`, `academicYearId`, `semesterId`.
  `studentCanAccessExam()` checks department plus `StudentSubject` enrollment against the same tuple.
- `src/lib/admin-scope.ts`
  Department admin scope is based only on managed department IDs.

### Validation schemas

- `src/lib/validators.ts`
  `registerStudentSchema`, `registerTeacherSchema`, `createQuestionSchema`, `createExamSchema`, and related schemas all require legacy scope fields directly.
  `course` is hard-coded as `BACHELOR_OF_SCIENCE | MASTER_OF_SCIENCE`.

### Exam eligibility

- `src/lib/permissions.ts`
  Student exam access depends on exact tuple equality between `Exam` and `StudentSubject`.
- `src/app/api/exams/route.ts`
  Teacher exam creation is blocked unless a matching `TeacherAssignment` exists.
- `src/server/socket-server.ts`
  Real-time student exam join/start flow calls `studentCanAccessExam()` and inherits the same scope rules.

### Question filtering

- `src/app/api/questions/route.ts`
  Question bank filtering is driven by `subjectId`, `groupId`, `academicYearId`, `semesterId`.
- `src/app/teacher/questions/**`
  Route segments and forms reflect the legacy question scope shape.

### Teacher assignments

- `TeacherAssignment` model in `prisma/schema.prisma`
  Core authoritative teaching scope record today.
- `src/app/admin/teachers/TeacherManager.tsx`
  Assignment UI writes raw tuple data.
- `src/lib/permissions.ts`
  Teacher authorization uses `TeacherAssignment` as the gate.
- `src/app/api/ebooks/route.ts`, `src/app/api/exams/route.ts`, `src/app/api/coursework/assignments/route.ts`
  Each relies on teacher assignment matching.

### Student subjects

- `StudentSubject` model in `prisma/schema.prisma`
  Current enrollment-like record tying a student to the legacy tuple.
- `src/lib/permissions.ts`
  Student exam eligibility uses `StudentSubject`.
- `src/components/student/StudentYearProgressBoard.tsx`, `src/components/student/StudentSubjectProgressPage.tsx`, `src/services/student-progress.service.ts`
  Student progress is grouped and reported through the current subject/year/semester records.

### Coursework

- `CourseworkRule` and `CourseworkAssignment`
  Both duplicate the same scope tuple.
- `src/app/api/coursework/rules/route.ts`
  Teacher-defined rules are scoped directly by tuple.
- `src/app/api/coursework/assignments/route.ts`
  Assignment publishing and student assignment creation depend on tuple matching.

### Ebooks

- `EbookUpload`
  Stores the full tuple directly.
- `src/app/api/ebooks/route.ts`
  Upload authorization and listing depend on teacher assignment tuple equality.

### Academic promotion

- `server/student-promotion-cron.js`
  Uses `customFieldResponses.course` to infer program duration.
  Uses `AcademicYear.year` to move `StudentSubject` records to the next year.
  Uses `Group.academicYearId` plus group name/code heuristics to infer next group.
  No program-aware validation exists.

### Seed data

- `prisma/seed.ts`
  Seeds global `AcademicYear`, `Semester`, and `Language`.
  Creates groups without department/program/language context.
  Creates teacher assignments, student subjects, questions, and exams with the raw tuple.
  Assumes course values only indirectly through demo student flows.

### Reports and results

- `src/services/result.service.ts`
  Depends on exams and attempts, which are currently scoped through the legacy exam tuple.
- `src/app/api/results/**`
  Result access flows indirectly depend on the exam scope model.

### Socket events

- `src/server/socket-server.ts`
  Exam live session authorization is coupled to the current exam and student-subject legacy scope.
- `src/server/exam-events.ts`
  Emits exam-centric events that assume exam scope has already been resolved elsewhere.

## Key Structural Weaknesses Discovered

- Academic program does not exist as a first-class entity.
- Degree level does not exist as a first-class entity.
- Department language support is implicit, not enforced.
- `AcademicYear` is overloaded and currently means program year, not academic session.
- `Group` is under-modeled and cannot independently prove valid academic context.
- The same academic scope is duplicated across multiple models, increasing drift risk.
- Promotion logic depends on free-text course values stored in custom profile data.
- Teacher and student permissions are tightly coupled to duplicated raw scope fields.

## Backward Compatibility Requirements Identified

The following modules depend on the legacy tuple and must continue working during Phase 2:

- Admin CRUD
- Teacher assignment
- Question bank
- Exam creation
- Student exam eligibility
- Exam attempt and Socket.IO flows
- Results
- Coursework
- Ebooks
- Notifications
- Academic promotion
- Seed data

## Phase 2 Design Implication

Phase 2 must introduce normalized academic entities additively and then layer a compatibility resolver on top. A destructive replacement of the legacy tuple would break existing permissions, assignment flows, and student eligibility logic.
