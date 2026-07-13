# Phase 5 Database Report

## Status

BLOCKED

## Added Models

- `ExamTranslation`
- `QuestionTranslation`
- `QuestionOptionTranslation`
- `CourseworkRuleTranslation`
- `CourseworkAssignmentTranslation`
- `EbookUploadTranslation`

## Updated Parent Models

- `Language`
- `Exam`
- `Question`
- `QuestionOption`
- `CourseworkRule`
- `CourseworkAssignment`
- `EbookUpload`

## Compatibility Approach

- Legacy direct text fields remain in place.
- Translation tables are additive.
- Existing records can be backfilled without deleting source text.

## Remaining Database Gaps

- `isComplete` flags are not implemented on translation rows.
- Coursework translation shape is narrower than the Phase 5 target.
- Ebook translation shape is narrower than the Phase 5 target.
- No publication-state completeness columns exist yet.
