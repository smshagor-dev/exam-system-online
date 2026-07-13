# Phase 8 Scheduling Dependency Map

## Existing Dependencies Reused

- Academic structure:
  - `AcademicSession`
  - `AcademicProgram`
  - `ProgramYear`
  - `ProgramSemester`
  - `AcademicOffering`
  - `Department`
  - `Subject`
  - `Language`
  - `Group`
- Student lifecycle:
  - `StudentProfile`
  - `StudentEnrollment`
  - `StudentSubject`
- Teacher architecture:
  - `TeacherProfile`
  - `TeachingAssignment`
  - `TeacherDepartmentMembership`
  - `TeacherSubstitution`
- Examination platform:
  - `Exam`
  - `ExamSession`
  - `StudentExamAttempt`
  - Phase 6 runtime and socket monitoring
- Notifications and audit:
  - `Notification`
  - `ActivityLog`
- Multilingual and UI shell:
  - existing admin, teacher, and student layouts

## Phase 8 Additions

- Calendar:
  - `ExamAcademicCalendar`
  - `ExamCalendarHoliday`
- Venues:
  - `ExamCampus`
  - `ExamBuilding`
  - `ExamRoom`
- Scheduling:
  - `ExamSchedulingSession`
  - `ExamScheduleItem`
- Seating:
  - `ExamSeatPlan`
  - `ExamSeatAssignment`
- Invigilation:
  - `ExamDutyAssignment`
  - `ExamInvigilatorAssignment`
- Operations:
  - `ExamAttendanceRecord`
  - `ExamAdmitCard`
  - `ExamIncident`

## Current Integration Boundaries

- Phase 6 runtime is reused for live invigilation visibility only.
- Phase 7 coursework models are not modified.
- Existing exam creation APIs remain intact; Phase 8 layers scheduling and operations around existing `Exam` and `AcademicOffering` data.
