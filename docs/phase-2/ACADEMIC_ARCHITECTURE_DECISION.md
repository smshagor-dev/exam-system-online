# Academic Architecture Decision

## Status

Accepted for Phase 2 implementation.

## Decision Summary

Phase 2 introduces a normalized academic foundation built around reusable `AcademicOffering` records while keeping existing legacy scope fields in place for compatibility.

## Why `DegreeLevel` is a model

`DegreeLevel` is implemented as a model instead of an enum because:

- administrators may need additional levels later without a schema rewrite;
- the system needs metadata such as `code`, `description`, `defaultYears`, `sortOrder`, and active state;
- Phase 2 must not hard-code only BSc and MSc throughout the application.

## Why `AcademicProgram` exists

The current repository has no first-class representation of a program, which makes it impossible to model:

- BSc and MSc offerings professionally;
- duration and semester totals by program;
- future curriculum management;
- future student enrollment history;
- future teacher workload by program context.

`AcademicProgram` becomes the stable parent for program years, program semesters, curriculum, groups, and offerings.

## Why `DepartmentLanguage` exists

Departments can teach in multiple languages, but the current schema does not enforce valid department-language combinations. `DepartmentLanguage` exists to:

- prevent unsupported teaching-language combinations;
- support multilingual academic administration;
- give `AcademicOffering` a validated language context tied to the department.

## Why `AcademicSession` differs from `ProgramYear`

These are different concepts:

- `AcademicSession` is the calendar-based cohort window such as `2026-2027`.
- `ProgramYear` is the structural year inside a program such as `Year 3 of BSc Computer Science`.

Keeping them separate prevents the current overloading problem where `AcademicYear` acts like a program year while the wider system also needs academic sessions for historical offerings.

## Why `ProgramSubject` exists

Subjects should not automatically belong to all programs. `ProgramSubject` defines curriculum membership and carries curriculum-level metadata such as:

- year and semester placement;
- credit hours;
- theory/practical hours;
- required vs elective state;
- display order.

This gives the system a safe validation point before offerings, assignments, and future enrollment logic use a subject in a program context.

## Why `AcademicOffering` exists

The repository currently duplicates academic scope across many models. `AcademicOffering` exists to represent one valid teaching context:

- one session;
- one program;
- one department;
- one supported language;
- one program year;
- one semester;
- one group;
- one curriculum subject.

This becomes the reusable anchor for future teacher assignment, student enrollment, exams, coursework, ebooks, and reporting.

## Why repeated scope fields are risky

The current design repeats the same academic tuple across many models. This creates several risks:

- inconsistent combinations can be stored in different modules;
- department-language compatibility is not enforced centrally;
- group context is inferred rather than guaranteed;
- permission logic must re-check the same rules repeatedly;
- future migrations become more expensive because many tables must be updated together.

## Legacy Compatibility Strategy

Phase 2 keeps existing fields such as `departmentId`, `subjectId`, `languageId`, `groupId`, `academicYearId`, and `semesterId` in place for now.

The compatibility approach is:

- add optional `academicOfferingId` where safe;
- prefer offering-based resolution when present;
- fall back to legacy scope when offering links are missing;
- centralize compatibility logic in `src/lib/academic-scope.ts`;
- document unresolved legacy mappings instead of inventing program data.

## Future Teacher Assignment Usage

Future phases will treat `AcademicOffering` as the preferred teaching-scope record. Phase 2 only adds this capability conservatively:

- teacher assignments may reference an offering when safely mapped;
- legacy direct fields remain available;
- permission checks can evolve toward offering-first validation without breaking existing routes.

## Future Student Enrollment Usage

Future enrollment will use program-aware structures rather than a flat `StudentSubject` tuple. Phase 2 prepares this by introducing:

- programs;
- sessions;
- program years;
- curriculum mappings;
- offerings.

Student enrollment history itself remains a later-phase concern.

## Migration Direction for Exams, Questions, Coursework, and Ebooks

Phase 2 does not fully refactor these modules. Instead it prepares them by:

- introducing optional offering links where low-risk;
- keeping current behavior operational;
- centralizing validation and scope resolution for future migrations.

## Rejected Alternatives

### Store BSc and MSc as strings

Rejected because string-only values are not extensible, cannot carry metadata, and would continue the current promotion and validation fragility.

### Store all scope directly on `Exam`

Rejected because it duplicates scope again and does not solve teacher assignment, curriculum, or enrollment reuse.

### Use group name as primary academic context

Rejected because names and codes are identifiers, not normalized academic truth. The current promotion job already shows the risk of relying on group names and codes heuristically.

### Duplicate all academic fields across every module

Rejected because that is the current problem. It increases integrity risk and complicates future migrations.

### Replace all legacy fields in one destructive migration

Rejected because too many existing modules currently depend on the legacy tuple. The repository needs an additive compatibility phase first.

## Phase Boundary

Phase 2 introduces the academic foundation only. It does not complete:

- full student enrollment history architecture;
- full teacher workload architecture;
- multilingual question translation delivery;
- full refactoring of the exam engine;
- full coursework publication redesign.
