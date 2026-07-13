# Phase 5 Multilingual Architecture Decision

## Status

- Date: 2026-07-11
- State: approved for implementation
- Input: `docs/phase-5/MULTILINGUAL_CONTENT_DEPENDENCY_MAP.md`

## Decision Summary

We will preserve the existing academic scope language model and add translation tables for academic content.

The core rule is:

- scope records keep `languageId` for authorization and delivery routing
- content records gain translation children for rendered text
- student-facing delivery fails closed if the required language translation is missing

## Why This Direction

The current system already uses `languageId` consistently in:

- enrollments
- teacher assignments
- offerings
- groups
- exam access checks
- socket authorization

Replacing that model with free-form translation lookup would increase risk and weaken the protections already implemented in `academic-scope.ts`, `permissions.ts`, and `socket-server.ts`.

The safer approach is to separate:

- logical entity identity
- academic delivery language
- translatable text payload

## Content Model Decisions

### Exams

Keep on `Exam`:

- scope fields
- schedule fields
- visibility/result settings
- `languageId` as required delivery language

Move to `ExamTranslation`:

- `title`
- `description`
- `instructions`

Rules:

- one logical exam may have many translations
- the translation for `Exam.languageId` is mandatory before student delivery

### Questions

Keep on `Question`:

- scope fields
- teacher ownership
- question type
- marks
- difficulty
- image URL if it is language-neutral
- `languageId` as required delivery language

Move to `QuestionTranslation`:

- `text`
- `expectedAnswer`
- `explanation`
- `keywords`

Rules:

- the translation for `Question.languageId` is mandatory for active student use
- short-answer grading reads the translation aligned to the exam delivery language

### Question Options

Keep on `QuestionOption`:

- `questionId`
- `isCorrect`
- `orderIndex`
- image URL if present

Move to `QuestionOptionTranslation`:

- `text`

Rules:

- correctness remains language-neutral
- option text is resolved per delivery language

### Coursework

Keep on `CourseworkRule` and `CourseworkAssignment`:

- scope and ownership fields
- `languageId`
- AI and deadline settings

Move to translation tables:

- `CourseworkRuleTranslation.rules`
- `CourseworkAssignmentTranslation.title`

Snapshot decision:

- assignment title stays assignment-specific and translatable
- assignment rule text remains a snapshot copy for submission stability, but the snapshot is stored in translation rows rather than one string field

This preserves the current behavior where submissions continue to evaluate against the rule text visible when the assignment was issued.

### Ebooks

Keep on `EbookUpload`:

- file metadata
- ownership and academic scope
- `languageId`

Move to `EbookUploadTranslation`:

- `title`
- `description`

Rule:

- the file itself remains whatever language the upload represents today
- metadata becomes translatable without inventing file-level translation support

## Migration And Backfill Decisions

### Existing Records

Current direct text fields become the source-language translation for the record’s existing `languageId`.

Backfill rules:

- create one translation row per record using current direct field values
- keep direct legacy fields temporarily during migration if needed for rollout safety
- once reads are switched, treat direct fields as deprecated compatibility fields only

### Missing Translations

For student-facing delivery:

- no fallback to another academic language
- return explicit incomplete-translation errors

For teacher/admin authoring:

- show missing-translation state in UI
- allow draft save when non-required translations are absent

## Authorization Decisions

### Student Language Resolution

Student access keeps current behavior:

- enrollment and subject scope decide allowed `languageId`
- exam and coursework access checks still match on scope language

Translation resolution happens only after access is granted.

### Teacher Access

Teacher ownership and delegated scope checks remain unchanged at the logical record level.

Translation editing is allowed only if the teacher already has access to the underlying scoped entity.

### Socket Delivery

Socket exam join flow must:

1. validate exam access
2. resolve the student delivery language from the exam scope
3. verify translation completeness for exam, questions, and options
4. emit only the resolved translated payload

If any required translation is missing, the socket flow returns an authorization-style denial rather than leaking partial content.

## API Contract Decisions

### Create And Update DTOs

New academic content APIs will accept:

- scope fields
- one required source translation for the scoped `languageId`
- optional additional translations

Shape direction:

- `sourceLanguageId`
- `translations[]`
- each translation keyed by `languageId`

The scoped `languageId` must either:

- equal `sourceLanguageId`, or
- have a complete translation payload present

### Read DTOs

Read APIs will return:

- resolved translated content for student delivery
- full translation sets for teacher/admin management when requested

Student APIs must never expose untranslated content from another language.

## Feedback And Free-Text Decisions

The following are not treated as multilingual academic translation tables in Phase 5:

- `CourseworkAccessRequest.message`
- `CourseworkAccessRequest.teacherNote`
- `StudentAnswer.teacherFeedback`
- `StudentAnswer.aiSuggestedFeedback`
- `CourseworkSubmission.aiFeedback`

Reason:

- these are actor-authored workflow messages, not canonical academic content
- translating them automatically would create correctness and provenance problems

However:

- their APIs must remain explicit about language ambiguity
- they should not be mixed into academic-content translation models

## UI Decisions

### Teacher Authoring

Teacher pages for questions, exams, coursework, and ebooks will:

- default to the scoped academic language
- allow adding translations for department-supported languages
- show translation completeness state
- block student-servable publication or activation when the scoped language translation is incomplete

### Student Delivery

Student pages will:

- render only resolved translated payloads
- treat missing translations as access-blocking errors

## Testing Decisions

Phase 5 testing must prove:

- wrong-language content is never delivered to students
- question options preserve correctness across translations
- short-answer grading uses the correct translated expected answer
- socket join and attempt start fail when translations are incomplete
- coursework rule snapshots stay stable after later translation edits
- legacy source-language records still work after backfill

## Schema Direction

Expected new tables:

- `ExamTranslation`
- `QuestionTranslation`
- `QuestionOptionTranslation`
- `CourseworkRuleTranslation`
- `CourseworkAssignmentTranslation`
- `EbookUploadTranslation`

Expected relation pattern:

- unique on `[parentId, languageId]`
- index on `languageId`
- cascade delete with logical parent

## Compatibility Strategy

Implementation should proceed in this order:

1. add translation tables
2. backfill from legacy direct fields
3. add translation-aware read helpers
4. switch student delivery reads first
5. switch teacher authoring writes
6. retire direct text-field dependence

## Non-Goals For Phase 5

This phase does not introduce:

- machine translation
- automatic teacher-feedback translation
- multilingual PDF or DOCX file transformation
- per-student dynamic fallback chains across academic languages

## Final Decision

Phase 5 will use a translation-table architecture layered on top of the existing language-scoped academic model.

That keeps current authorization semantics intact, avoids wrong-language leakage, and gives the system a clear migration path from single-language content records to multilingual academic delivery.
