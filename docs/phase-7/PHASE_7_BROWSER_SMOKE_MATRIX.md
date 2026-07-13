# Phase 7 Browser Smoke Matrix

## Status

`PASS`

## Latest Run

- executed at: `2026-07-13T13:41:37.244Z`
- overall harness status: `PASS`
- structured workflow cases executed: `20`
- browser summary: [summary.json](/D:/Public/exam-system-online/docs/phase-7/evidence/browser/summary.json)

## Proven Cases

- `P7-BR-001` teacher login and enterprise coursework overview
- `P7-BR-002` enterprise template creation with rubric persistence
- `P7-BR-003` valid assignment lifecycle `DRAFT -> SCHEDULED -> PUBLISHED`
- `P7-BR-004` invalid lifecycle rejection after archive
- `P7-BR-005` eligible student positive access to publication and submit route
- `P7-BR-006` foreign student denial for targeted coursework visibility and attempts API access
- `P7-BR-007` student text/link/repository/attachment submission persistence
- `P7-BR-008` extension request creation
- `P7-BR-009` teacher extension approval
- `P7-BR-010` published grade visibility in grading studio
- `P7-BR-011` student history visibility with private notes hidden
- `P7-BR-012` teacher JSON report and CSV export
- `P7-BR-013` closed-publication submission rejection
- `P7-BR-014` duplicate-submit idempotency
- `P7-BR-015` returned submission, resubmission, and attempt-limit enforcement
- `P7-BR-016` protected attachment delivery and ownership isolation
- `P7-LATE-001` late-policy enforcement with extension-specific reopening
- `P7-MOD-001` moderation chain `DRAFT -> SUBMITTED_FOR_MODERATION -> CHANGES_REQUESTED -> RESUBMITTED -> APPROVED -> PUBLISHED`
- `P7-NOT-001` notification matrix and duplicate-notification protection
- `P7-VIEW-001` light/dark plus desktop/tablet/mobile viewport matrix

## Evidence

- browser screenshots: `docs/phase-7/evidence/browser/*.png`
- console captures: `docs/phase-7/evidence/console/*.json`
- network captures: `docs/phase-7/evidence/network/*.json`
- viewport/theme matrix: [viewport-theme-matrix.json](/D:/Public/exam-system-online/docs/phase-7/evidence/database/viewport-theme-matrix.json)

## Notes

- The raw summary records `9` console errors across the whole run; these came from intentional negative authorization and validation cases.
- `P7-VIEW-001` passed with no critical console errors, no failed network requests, and no horizontal overflow across all required theme and viewport combinations.
