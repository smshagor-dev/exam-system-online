# Phase 6 Database Report

## Summary

Dedicated immutable snapshot persistence was introduced in this pass.

## Existing collections used

- `ExamSession`
  - persisted pause state
  - persisted timer offset
  - restart-safe timer reconstruction
- `StudentExamAttempt`
  - source of truth for attempt ownership and submission state
- `StudentAnswer`
  - idempotent answer upsert target
- `ActivityLog`
  - reconnect activity
  - disconnect activity
  - security events
  - legacy snapshot evidence fallback

## New collections

- `ExamAttemptSnapshot`
- `ExamQuestionSnapshot`
- `ExamOptionSnapshot`

## Notes

- Grading now prefers the dedicated snapshot collections first.
- `ActivityLog` snapshot entries are still written for compatibility and audit continuity.
- Phase 6 verifier now backfills missing snapshots for legacy active/submitted attempts before checking integrity.
