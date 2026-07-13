# Phase 9 Result Dependency Map

## Status

`IN_PROGRESS`

## Existing Dependencies Reviewed

- Exam runtime and exam results:
  - `Exam`
  - `StudentExamAttempt`
  - `StudentAnswer`
  - `ExamResult`
  - `src/lib/result-engine.ts`
- Coursework assessment:
  - `CourseworkPublication`
  - `CourseworkAttempt`
  - `CourseworkGrade`
  - `CourseworkModerationDecision`
- Academic structure:
  - `AcademicOffering`
  - `ProgramSubject`
  - `AcademicProgram`
  - `AcademicSession`
  - `ProgramYear`
  - `ProgramSemester`
  - `Semester`
  - `Group`
- Student lifecycle and graduation:
  - `StudentEnrollment`
  - `StudentAcademicHistory`
  - `StudentGraduation`
  - `src/lib/student-lifecycle.ts`
- Scheduling and attendance:
  - `ExamScheduleItem`
  - `ExamAttendanceRecord`
  - `ExamSeatAssignment`
- Access control and notifications:
  - `User`
  - `TeacherProfile`
  - `StudentProfile`
  - `Notification`
  - `src/lib/permissions.ts`
  - `src/lib/teacher-assignment.ts`
- Output utilities:
  - `src/lib/pdf.ts`
  - `src/lib/csv.ts`

## Phase 9 Additive Layer

- Gradebook:
  - per-offering gradebook
  - weighted grade components
  - per-student component entries
- Result lifecycle:
  - calculated result records
  - audited transitions from draft to archive
- GPA/CGPA:
  - grading scales and grade bands
  - department result policy
  - repeated/improvement replacement logic
- Degree audit and graduation:
  - audit snapshots
  - graduation candidate workflow
  - certificate issuance linked to `StudentGraduation`
- Student documents:
  - transcript records
  - marksheet records
  - certificate registry
- Review and appeals:
  - result appeal workflow
- Reporting:
  - analytics summaries with JSON/CSV/PDF export

## Design Constraints

- Reuse existing `ExamResult`, `CourseworkGrade`, `ProgramSubject`, `StudentEnrollment`, and `StudentGraduation` data.
- Do not redesign prior phase models unless a blocker requires it.
- Enforce department isolation server-side.
- Keep document generation private and verification token-based.
