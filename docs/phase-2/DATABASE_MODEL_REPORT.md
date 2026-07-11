# Database Model Report

## Added Models

- `DegreeLevel`
- `AcademicProgram`
- `DepartmentLanguage`
- `AcademicSession`
- `ProgramYear`
- `ProgramSemester`
- `ProgramSubject`
- `AcademicOffering`

## Changed Models

- `Department`
- `Subject`
- `Language`
- `Group`
- `Semester`
- `TeacherAssignment`
- `StudentSubject`
- `Exam`
- `Question`
- `EbookUpload`
- `CourseworkRule`
- `CourseworkAssignment`

## Key Additions

- Degree levels are now first-class records instead of hard-coded assumptions.
- Programs now carry duration and total semester metadata.
- Department-to-language support is explicit and enforceable.
- Academic sessions are separated from program years.
- Curriculum is represented through `ProgramSubject`.
- Reusable teaching scope is represented through `AcademicOffering`.

## Compatibility Fields

- Optional `academicOfferingId` was added to legacy scope-heavy models where low-risk.
- Legacy tuple fields remain in place during Phase 2.

## Index and Constraint Highlights

- Unique program codes.
- Unique department-language pairs.
- Unique program year per program and year number.
- Unique program semester mappings.
- Unique curriculum placement per program/year/semester/subject.
- Unique academic offering scope per session/program/language/year/semester/group/subject.
