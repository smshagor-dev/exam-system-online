# Phase 5 Multilingual Content Dependency Map

## Purpose

This document records the current language-dependent content model and every major read/write path that must be updated for Phase 5 multilingual delivery.

Per the Phase 5 brief, this audit is completed before any new multilingual code changes are introduced.

## Audit Date

- Date: 2026-07-11
- Repository state: working tree already contains unrelated Phase 4 changes in progress; this audit does not modify or reinterpret those changes

## Current Language Model

The application already uses normalized academic language scope for most scheduling and access control:

- `AcademicOffering.languageId`
- `StudentEnrollment.languageId`
- `StudentSubject.languageId`
- `Exam.languageId`
- `Question.languageId`
- `TeacherAssignment.languageId`
- `CourseworkRule.languageId`
- `CourseworkAssignment.languageId`
- `EbookUpload.languageId`
- `Group.languageId`
- `DepartmentLanguage.departmentId + languageId`

This means Phase 5 should preserve `languageId` as the academic delivery language for scope and authorization, while moving content text itself into translation tables.

## Current Single-Language Content Fields

These fields currently store language-bound text directly on the primary record.

### Exam Content

- `Exam.title`
- `Exam.description`
- `Exam.instructions`
- `Exam.languageId`

Current implication:
- an exam is both the logical assessment and the language-specific rendered version

### Question Content

- `Question.text`
- `Question.expectedAnswer`
- `Question.explanation`
- `Question.keywords`
- `Question.languageId`

Current implication:
- a question record is already language-specific
- short-answer grading depends on language-bound `expectedAnswer`

### Question Option Content

- `QuestionOption.text`
- `QuestionOption.isCorrect`
- `QuestionOption.orderIndex`

Current implication:
- option correctness is logical, but option label text is stored in the same row and is not translatable

### Coursework Content

- `CourseworkRule.rules`
- `CourseworkAssignment.title`
- `CourseworkAssignment.rules`
- `CourseworkAssignment.languageId`

Current implication:
- coursework rule text and assignment titles are duplicated as language-specific payload, not shared logical content with translations

### Ebook Content

- `EbookUpload.title`
- `EbookUpload.description`
- `EbookUpload.languageId`

Current implication:
- each ebook upload is a single-language content record with no translation overlay

### Review And Feedback Content

- `StudentAnswer.teacherFeedback`
- `StudentAnswer.aiSuggestedFeedback`
- `CourseworkSubmission.aiFeedback`
- `CourseworkAccessRequest.message`
- `CourseworkAccessRequest.teacherNote`

Current implication:
- review and workflow text has no language metadata today
- Phase 5 must decide which of these are academic-content translations and which are actor-authored free text

## Existing Scope And Authorization Dependencies

### `src/lib/academic-scope.ts`

Current responsibilities:

- validates requested `languageId` inside department scope
- validates group language compatibility
- resolves `AcademicOffering` into legacy language-aware scope
- keeps `languageId` central to subject, group, semester, and offering validation

Phase 5 dependency:

- multilingual content must not weaken this file
- supported translation languages must still be constrained by department and offering scope rules

### `src/lib/permissions.ts`

Current language-dependent behavior:

- `getStudentExamCatalogScope()` filters subjects by active enrollment language
- `buildStudentExamScopeConditions()` includes `languageId` in exam discovery
- `teacherCanAccessAssignment()` and teacher exam/question checks use scope language
- `studentCanAccessExam()` enforces exam-language compatibility with enrollment

Phase 5 dependency:

- `languageId` remains the delivery language key for authorization
- translation resolution must happen after scope authorization, not instead of it

### `src/server/socket-server.ts`

Current language-dependent behavior:

- teacher exam access checks use exam scope language
- `student:join_exam` and `student:start_attempt` trust current exam payload shape
- live exam events do not validate translation completeness
- `teacher:review_answer` stores direct feedback string only

Phase 5 dependency:

- socket exam joins must resolve the student-facing translation before emitting question payloads
- socket authorization must reject missing or wrong-language delivery

## API Write Paths That Persist Single-Language Content

### `src/app/api/questions/route.ts`

Current writes:

- creates `Question` with direct `text`, `expectedAnswer`, `explanation`, `keywords`
- creates `QuestionOption` rows with direct `text`
- input schema requires `languageId` plus single-language content body

Phase 5 impact:

- must split logical question identity from translation records
- must split logical option identity from translatable option labels
- validation contract changes from one language body to source language plus translation set

### `src/app/api/questions/[id]/route.ts`

Current reads:

- returns `Question` with `options`

Phase 5 impact:

- current response leaks base record text shape
- read contract must resolve a translation set or a specific requested language

### `src/app/api/exams/route.ts`

Current writes:

- creates `Exam` with direct `title`, `description`, `instructions`, `languageId`
- teacher creation flow assumes one scope language equals one content version

Phase 5 impact:

- exam metadata must move to translation rows
- exam creation must validate translation completeness for the academic language

### `src/app/api/exams/[id]/route.ts`

Current reads:

- returns `Exam` and optionally `questions.question.text`
- student mode strips correctness flags but still delivers direct question/option text from single-language records

Current writes:

- `PATCH` accepts raw exam body updates

Phase 5 impact:

- read path must resolve translated exam title, description, instructions, question text, and option text
- student payload must not fall back to another language silently
- patch contract must stop allowing accidental direct writes to obsolete text fields

### `src/app/api/coursework/rules/route.ts`

Current writes:

- upserts `CourseworkRule.rules`
- propagates rule text into `CourseworkAssignment.rules`

Phase 5 impact:

- rules need logical identity plus translated text
- assignment snapshots must define whether they copy translated text or reference translation rows

### `src/app/api/coursework/assignments/route.ts`

Current writes:

- upserts `CourseworkAssignment.title`
- copies `CourseworkRule.rules` into assignment

Phase 5 impact:

- assignment title must become translatable content
- rule text copy behavior needs an explicit multilingual snapshot strategy

### `src/app/api/coursework/submissions/route.ts`

Current reads:

- checks assignment and rule presence
- uses `activeRules` from direct rule or assignment string
- returns direct `aiFeedback` or default English system messages

Phase 5 impact:

- rule matching for AI validation must use the student delivery language
- user-facing system messages may need localization, but academic content text must definitely be language-safe

### `src/app/api/coursework/access-requests/route.ts`

Current writes:

- stores student free-text access request message

Phase 5 impact:

- not a translation-table candidate by default, but should be documented as user-authored text adjacent to multilingual coursework flows

### `src/app/api/coursework/access-requests/[id]/route.ts`

Current writes:

- stores teacher free-text note and extension approval metadata

Phase 5 impact:

- not a translation-table candidate by default, but appears on student pages and should be language-handled intentionally

### `src/app/api/ebooks/route.ts`

Current writes:

- creates `EbookUpload` with direct `title` and `description`
- derives `languageId` from teacher assignment

Phase 5 impact:

- ebook metadata must become translatable if one logical upload serves multiple academic languages
- if files themselves remain language-specific, metadata translations still need separate handling

## API Read Paths That Deliver Academic Content

### Student Exam Delivery

Files:

- `src/app/api/exams/[id]/route.ts`
- `src/app/student/exams/page.tsx`
- `src/app/student/exams/[id]/page.tsx`
- `src/app/student/exams/[id]/attempt/page.tsx`
- `src/server/socket-server.ts`

Current direct fields rendered:

- `exam.title`
- `exam.description`
- `exam.instructions`
- `question.text`
- `option.text`

Phase 5 risk:

- these are the highest-risk wrong-language delivery surfaces
- no student-facing fetch currently verifies translation completeness

### Student Results Delivery

Files:

- `src/app/api/results/route.ts`
- `src/app/api/results/[id]/route.ts`
- `src/lib/result-engine.ts`

Current direct fields rendered or exposed:

- `exam.title`
- `question.text`
- `question.expectedAnswer`
- `question.options[].text`
- `studentAnswer.teacherFeedback`

Phase 5 risk:

- published results may expose source-language question text instead of the student language
- short-answer expected answers and review feedback need explicit language handling

### Student Coursework Delivery

Files:

- `src/app/student/coursework/page.tsx`
- `src/app/api/coursework/submissions/route.ts`
- `src/app/api/coursework/access-requests/route.ts`
- `src/app/api/coursework/access-requests/[id]/route.ts`

Current direct fields rendered:

- `assignment.title`
- `assignment.rule?.rules ?? assignment.rules`
- `submission.aiFeedback`
- `accessRequest.message`
- `accessRequest.teacherNote`

Phase 5 risk:

- coursework titles and rule text are still single-language
- approval workflow text is user-authored and should be kept distinct from translated academic content

### Teacher Question Bank And Exam Creation

Files:

- `src/app/teacher/questions/QuestionBankManager.tsx`
- `src/app/teacher/questions/QuestionCreateForm.tsx`
- `src/app/teacher/exams/create/CreateExamForm.tsx`

Current direct fields rendered or submitted:

- `question.text`
- `option.text`
- `exam.title`
- `exam.description`
- `exam.instructions`
- `expectedAnswer`

Phase 5 risk:

- current teacher flows assume each question and exam exists in only one language
- creating multilingual content will require new authoring UX and translation completeness checks

### Teacher Coursework And Ebook Delivery

Files:

- `src/app/teacher/coursework/page.tsx`
- `src/app/api/coursework/rules/route.ts`
- `src/app/api/coursework/assignments/route.ts`
- `src/app/api/ebooks/route.ts`

Current direct fields rendered or submitted:

- coursework `rules`
- coursework `title`
- ebook `title`
- ebook `description`

Phase 5 risk:

- teacher workspace currently reads and writes direct text without translation abstraction

## Validation Layer Dependencies

### `src/lib/validators.ts`

Current schema assumptions:

- `createQuestionSchema` requires one `languageId` plus one `text` body and option text list
- `createExamSchema` requires one `languageId` plus one `title` and `instructions`

Phase 5 impact:

- validators are currently the central single-language contract
- new DTOs must distinguish:
  - logical entity scope
  - source language
  - available translations
  - required academic delivery language

## Result Engine Dependencies

### `src/lib/result-engine.ts`

Current language-sensitive behavior:

- auto-grading reads `question.expectedAnswer`
- MCQ grading reads `question.options`
- result publishing creates fixed system notification text

Phase 5 impact:

- grading must always use the translation or normalized answer set intended for the exam language
- if answer matching remains string-based, translation alignment becomes part of grading correctness

## Seed And Backfill Dependencies

### `prisma/seed.ts`

Current seed assumptions:

- questions are inserted with direct `languageId`, `text`, `expectedAnswer`, and option text
- exams are inserted with direct `title`, `description`, `instructions`, and `languageId`

Phase 5 impact:

- seed data must create translation rows
- existing records require a backfill path that treats current direct text as the source-language translation

## Legacy And Scope Preservation Requirements

The Phase 5 brief requires preserving existing academic scope behavior. Based on the current code, these constraints must remain true after migration:

- `languageId` on exams, assignments, offerings, enrollments, and teacher assignments still drives authorization
- students must never receive content in a language outside their active enrollment scope
- teacher ownership and delegated scope checks must remain language-aware
- socket joins and result access must continue to enforce scope before content resolution

## High-Risk Migration Areas

The following areas are the most likely to break if translation resolution is incomplete:

1. Student exam fetch and attempt bootstrap
2. Socket `student:join_exam` and `student:start_attempt`
3. Short-answer grading against `expectedAnswer`
4. Student results payload when `showAnswers` is enabled
5. Coursework rule snapshots copied into assignments
6. Teacher exam creation from a language-scoped question list
7. Option correctness preservation while moving option labels into translations

## Recommended Phase 5 Design Boundaries

Based on the current dependency map, the safest architecture direction is:

- keep academic scope `languageId` on logical records for authorization and delivery routing
- add translation tables for exams, questions, question options, coursework content, and ebook metadata
- resolve one concrete delivery language at API and socket response boundaries
- fail closed when a required translation is missing for student delivery
- treat teacher/student free-text messages separately from translatable academic content unless the Phase 5 design explicitly expands their scope

## Files Audited

- `prisma/schema.prisma`
- `prisma/seed.ts`
- `src/lib/academic-scope.ts`
- `src/lib/permissions.ts`
- `src/lib/result-engine.ts`
- `src/lib/validators.ts`
- `src/server/socket-server.ts`
- `src/app/api/questions/route.ts`
- `src/app/api/questions/[id]/route.ts`
- `src/app/api/exams/route.ts`
- `src/app/api/exams/[id]/route.ts`
- `src/app/api/results/route.ts`
- `src/app/api/results/[id]/route.ts`
- `src/app/api/coursework/rules/route.ts`
- `src/app/api/coursework/assignments/route.ts`
- `src/app/api/coursework/submissions/route.ts`
- `src/app/api/coursework/access-requests/route.ts`
- `src/app/api/coursework/access-requests/[id]/route.ts`
- `src/app/api/ebooks/route.ts`
- `src/app/teacher/questions/QuestionBankManager.tsx`
- `src/app/teacher/questions/QuestionCreateForm.tsx`
- `src/app/teacher/exams/create/CreateExamForm.tsx`
- `src/app/teacher/coursework/page.tsx`
- `src/app/student/exams/page.tsx`
- `src/app/student/exams/[id]/page.tsx`
- `src/app/student/exams/[id]/attempt/page.tsx`
- `src/app/student/coursework/page.tsx`

## Exit Criteria For This Audit Step

This dependency map is complete enough to begin the next required Phase 5 step:

- write `docs/phase-5/MULTILINGUAL_ARCHITECTURE_DECISION.md`
- then implement schema and service changes against the documented dependency surfaces above
