# Phase 4 Teacher Assignment Dependency Map

## Prisma models

- `TeacherProfile`: single home department plus legacy assignment owner.
- `TeacherAssignment`: current legacy teaching scope keyed by `teacherId + subjectId + languageId + groupId + academicYearId + semesterId`.
- `AcademicOffering`: normalized Phase 2 offering context; already referenced by `TeacherAssignment`, `Exam`, `Question`, `EbookUpload`, `CourseworkRule`, `CourseworkAssignment`, `StudentSubject`.
- Teacher-owned content with direct `teacherId`: `Exam`, `Question`, `EbookUpload`, `CourseworkRule`, `CourseworkAssignment`.

## APIs

- `src/app/api/admin/teachers/route.ts`: teacher creation scoped to single `departmentId`.
- `src/app/api/admin/teachers/assign/route.ts`: writes legacy `TeacherAssignment` only.
- `src/app/api/questions/route.ts`: teacher question listing and creation; direct `teacherId` ownership plus `teacherCanAccessAssignment`.
- `src/app/api/questions/[id]/route.ts`: question mutation guarded by `teacherOwnsQuestion`.
- `src/app/api/exams/route.ts`: teacher exam listing and creation; direct `teacherId` ownership plus `teacherCanAccessAssignment`.
- `src/app/api/exams/[id]/route.ts`: exam mutation guarded by `teacherOwnsExam`.
- `src/app/api/results/route.ts`: teacher review/reporting filtered by `exam.teacherId`.
- `src/app/api/coursework/**`: coursework teacher flows filtered by `teacherId` and legacy assignment scope.
- `src/app/api/ebooks/**`: upload and management flow depends on legacy `TeacherAssignment.id`.

## Admin pages

- `src/app/admin/teachers/page.tsx`
- `src/app/admin/teachers/TeacherManager.tsx`

Current behavior:

- Single primary department assumption.
- Legacy assignment creation UI with dependent `department -> year -> group -> language -> semester -> subject`.
- No approval, workload, substitution, or conflict management.

## Teacher pages

- `src/app/teacher/assignments/page.tsx`: renders `TeacherProfile.assignments`.
- `src/app/teacher/dashboard/page.tsx`: teacher stats from direct `teacherId` content ownership.
- `src/app/teacher/questions/**`, `src/app/teacher/exams/**`, `src/app/teacher/coursework/**`, `src/app/teacher/ebooks/**`, `src/app/teacher/reviews/**`: all assume direct ownership or legacy assignment scope.

## Permission checks

- `src/lib/permissions.ts`
  - `teacherCanAccessAssignment`: legacy `TeacherAssignment` lookup only.
  - `teacherOwnsExam`: direct `exam.teacherId`.
  - `teacherOwnsQuestion`: direct `question.teacherId`.
- `src/lib/academic-scope.ts`: offering-to-legacy scope resolver already available and reusable for Phase 4.

## Question ownership

- `Question.teacherId` remains author/owner.
- Creation access currently depends on legacy assignment matching.

## Exam ownership

- `Exam.teacherId` remains creator/owner.
- Teacher listing, editing, live pages, result pages, and socket events currently key off direct exam owner.

## Grading access

- `ResultReview.reviewerId` stores actual reviewer user.
- Review and result APIs still filter through `exam.teacherId`, not assignment role.

## Coursework access

- `CourseworkRule.teacherId` and `CourseworkAssignment.teacherId` store direct legacy owner.
- Coursework workspace builds student scope from `TeacherProfile.assignments`.

## Ebook access

- Upload API requires `TeacherAssignment.id`.
- `EbookUpload.teacherId` stores direct uploader owner.

## Socket teacher events

- `src/server/socket-server.ts`
  - `teacher:start_exam`
  - `teacher:join_exam_monitor`
  - `teacher:pause_exam`
  - `teacher:end_exam`
  - `teacher:publish_result`
  - `teacher:review_answer`

Previous state:

- Authorization depended on `userRole === TEACHER` and direct exam ownership only.

## Legacy fallback paths

- Legacy `TeacherAssignment` is the only persisted assignment structure before Phase 4.
- `AcademicOffering` already exists and can anchor the new architecture.
- All downstream content models still require compatibility because they persist legacy teacher ownership fields.

## Phase 4 migration implication

- Keep `TeacherAssignment` readable and writable for compatibility/backfill parity.
- Introduce centralized resolver so permissions, sockets, and reporting can prefer `TeachingAssignment` while falling back to legacy data.
