# Phase 4 Teacher Architecture Decision

## Decision

Phase 4 introduces a new normalized teacher architecture without redesigning Phase 2 or Phase 3 and without removing legacy `TeacherAssignment`.

Preferred runtime path:

`TeacherProfile -> TeacherDepartmentMembership -> TeachingAssignment -> TeachingAssignmentRole -> TeacherWorkloadEntry / TeacherSubstitution`

Compatibility path:

`TeacherProfile -> TeacherAssignment`

## Why this approach

- The repository already has a working `TeacherProfile` and many content models keyed by direct `teacherId`.
- Replacing those ownership fields in one phase would create high regression risk for exams, questions, coursework, ebooks, grading, and socket authorization.
- `AcademicOffering` already exists from Phase 2 and is the correct normalized anchor for professional teaching allocation.
- Keeping legacy assignments allows exact-match backfill and controlled parity verification.

## New entities

- `TeacherDepartmentMembership`
- `TeachingAssignment`
- `TeachingAssignmentRole`
- `TeacherWorkloadPolicy`
- `TeacherWorkloadEntry`
- `TeacherSubstitution`
- `TeachingAssignmentApproval`
- `TeacherAssignmentAuditLog`

## Core rules

- Teachers may have multiple department memberships.
- One primary membership is allowed at a time for active memberships.
- New teaching assignments prefer `AcademicOffering`.
- Assignment roles are structured, not free text.
- Active access requires valid assignment status and date range.
- Substitutions grant temporary access without overwriting original history.
- Legacy `TeacherAssignment` remains readable and is still populated where existing flows depend on it.

## Authorization decision

- Server-side authorization must resolve effective teacher access from the new assignment layer first.
- Legacy `TeacherAssignment` is the fallback when no normalized assignment exists.
- Direct `teacherId` ownership remains as author/creator history, not the only permission source.

## Migration strategy

- Add new models safely.
- Introduce centralized resolver in `src/lib/teacher-assignment.ts`.
- Backfill only exact matches from legacy assignments to normalized assignments.
- Preserve ambiguous or legacy-only rows and report them instead of inventing data.

## Non-goals for Phase 4

- Payroll or salary
- Full dashboard redesign
- Socket engine rewrite
- Automatic assignment invention
- Multilingual content translation

## Consequence

Phase 4 can harden teacher permissions, support multi-department membership and substitution, and keep the current exam system stable while preparing later phases for richer reporting and planning.
