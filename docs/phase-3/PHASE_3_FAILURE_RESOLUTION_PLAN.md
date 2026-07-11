# Phase 3 Failure Resolution Plan

Status note on 2026-07-11:

- This document is retained as the historical triage plan from the failing Phase 3 pass.
- The latest authoritative state is now `175 PASS`, `0 FAIL`, `0 BLOCKED` in `docs/phase-3/evidence/coverage-execution-summary.json`.
- Open-case tables below should be read as historical context, not current unresolved work.

Status: IN_PROGRESS

Built from:

- `docs/phase-3/evidence/coverage-execution-summary.json`
- `docs/phase-3/PHASE_3_COVERAGE_EXECUTION_REPORT.md`
- `docs/phase-3/PHASE_3_BROWSER_SMOKE_MATRIX.md`
- `docs/phase-3/PHASE_3_DEFECT_REPORT.md`
- `docs/phase-3/REMAINING_ISSUES.md`
- `docs/phase-3/PHASE_3_BROWSER_COVERAGE_PLAN.md`

Notes:

- This inventory is intentionally written before any further application changes in this pass.
- The current grouped runner explicitly force-records many cases as `BLOCKED` at the end of `scripts/phase-3/coverage-execution.mjs`, so not every open case is a product defect.
- Priorities follow the required order: authorization and exam-access first, then lifecycle integrity, then runner/evidence gaps.

## Summary Classification Totals

| Classification | Count |
| --- | ---: |
| `PRODUCT_DEFECT` | 6 |
| `VALIDATION_DEFECT` | 3 |
| `AUTHORIZATION_DEFECT` | 1 |
| `FIXTURE_DEFECT` | 2 |
| `HARNESS_DEFECT` | 20 |
| `EVIDENCE_DEFECT` | 2 |
| `MISSING_IMPLEMENTATION` | 3 |
| `ENVIRONMENT_BLOCKER` | 0 |
| `EXPECTED_UNSUPPORTED_CASE` | 0 |

## FAIL Inventory

| Test ID | Category | Status | Expected result | Actual result | Evidence path | Classification | Root-cause hypothesis | Impl defect | Fixture defect | Harness defect | Missing feature | Environment blocker | Resolution action | Retest requirement | Priority |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `P3-TRF-006` | Transfer | FAIL | Valid department transfer succeeds | `403 Forbidden for this department` | `docs/phase-3/evidence/network/P3-TRF-006-department-transfer.txt` | `AUTHORIZATION_DEFECT` | Department-admin route guard rejects legitimate cross-department transfer target instead of permitting scoped lifecycle transition | Yes | No | No | No | No | Review transfer API auth strategy for department-transfer writes and align with accepted Phase 3 scope | Direct API rerun plus DB check for exactly one active enrollment | Critical |
| `P3-TRF-007` | Transfer | FAIL | Same-source transfer rejected | Returned `201` and created transfer | `docs/phase-3/evidence/network/P3-TRF-007-same-target.txt` | `FIXTURE_DEFECT` | Runner payload is not truly same-context; it changes group/program-year from active enrollment so service accepts it correctly | No | Yes | Yes | No | No | Fix runner to use exact active context for negative test and verify service still rejects real same-target transfer | Direct API rerun with corrected payload | High |
| `P3-REA-010` | Readmission | FAIL | Invalid year context rejected | Returned `201` with active enrollment | `docs/phase-3/evidence/network/P3-REA-010-invalid-year.txt` | `FIXTURE_DEFECT` | Runner sends only `studentId`, so route defaults to prior valid context instead of exercising invalid-year validation | No | Yes | Yes | No | No | Add explicit invalid academic context payload for readmission negative case | Direct API rerun with malformed context and DB check for no partial record | High |
| `P3-GRA-003` | Graduation | FAIL | Eligible BSc graduation succeeds | `400 Graduation requires all final-context results to be published` | `docs/phase-3/evidence/network/P3-GRA-003-valid-bsc.txt` | `PRODUCT_DEFECT` | Graduation validator likely requires results for every exam in final context, including unrelated live/manual fixtures, instead of required completed/published academic results | Yes | No | No | No | No | Narrow final-context graduation eligibility query to valid required results or align fixtures to only required final exams | API rerun plus DB verification | Critical |
| `P3-GRA-014` | Graduation | FAIL | Graduation closes active enrollment | Blocked by same `400` failure as `P3-GRA-003` | `docs/phase-3/evidence/network/P3-GRA-003-valid-bsc.txt` | `PRODUCT_DEFECT` | Same root cause as `P3-GRA-003` | Yes | No | No | No | No | Fix graduation success path first, then verify closure state | API rerun plus DB verification | Critical |
| `P3-GRA-015` | Graduation | FAIL | Graduation record exists | Blocked by same `400` failure as `P3-GRA-003` | `docs/phase-3/evidence/network/P3-GRA-003-valid-bsc.txt` | `PRODUCT_DEFECT` | Same root cause as `P3-GRA-003` | Yes | No | No | No | No | Fix graduation success path first, then verify record uniqueness | API rerun plus DB verification | Critical |
| `P3-GRA-016` | Graduation | FAIL | Graduation history event created | Blocked by same `400` failure as `P3-GRA-003` | `docs/phase-3/evidence/network/P3-GRA-003-valid-bsc.txt` | `PRODUCT_DEFECT` | Same root cause as `P3-GRA-003` | Yes | No | No | No | No | Fix graduation success path first, then verify timeline event | API rerun plus timeline check | Critical |
| `P3-HIS-006` | History | FAIL | Graduation event visible in timeline | Blocked by same `400` failure as `P3-GRA-003` | `docs/phase-3/evidence/network/P3-GRA-003-valid-bsc.txt` | `PRODUCT_DEFECT` | Same root cause as `P3-GRA-003` | Yes | No | No | No | No | Fix graduation flow first, then verify timeline | API rerun plus timeline check | Critical |
| `P3-LEG-010` | Legacy | FAIL | Active enrollment takes precedence over conflicting legacy scope | API returned `200`; assertion treated returned target-scope list as failure | `docs/phase-3/evidence/network/P3-LEG-010-uma-active-precedence.txt` | `HARNESS_DEFECT` | Check is looking for absence of old title only; actual body needs exact scope assertion and may already be correct | No | No | Yes | No | No | Parse full response and assert only active-enrollment-compatible exams are visible | API rerun with stronger assertions | Critical |
| `P3-LEG-011` | Legacy | FAIL | Legacy/new scope conflict handled safely | Same evidence as `P3-LEG-010`; assertion failed despite `200` | `docs/phase-3/evidence/network/P3-LEG-010-uma-active-precedence.txt` | `HARNESS_DEFECT` | Same as `P3-LEG-010`; likely missing DB/body safety assertions | No | No | Yes | No | No | Split this from `P3-LEG-010` into explicit conflict-safety assertions | API rerun plus DB/body verification | Critical |
| `P3-EXM-011` | Exam Eligibility | FAIL | Transferred student old-scope exam hidden | API returned `200`; runner flagged failure | `docs/phase-3/evidence/network/P3-EXM-011-victor-list.txt` | `HARNESS_DEFECT` | Current check likely fails because expected list is narrower than actual valid target-scope list; needs exact inclusion/exclusion assertions | No | No | Yes | No | No | Update runner to assert old-scope absence and target-scope presence without overfitting titles | API and browser rerun | Critical |
| `P3-EXM-013` | Exam Eligibility | FAIL | Transferred student target-scope exam allowed | API returned `200`; runner flagged failure | `docs/phase-3/evidence/network/P3-EXM-011-victor-list.txt` | `HARNESS_DEFECT` | Same as `P3-EXM-011` | No | No | Yes | No | No | Update runner expectation and verify exact target-scope visibility | API and browser rerun | Critical |
| `P3-HIS-008` | History | FAIL | Timeline events sorted chronologically | Timeline API returned `200` but chronology assertion failed | `docs/phase-3/evidence/network/P3-HIS-008-grace-chronology.txt` | `EVIDENCE_DEFECT` | Timeline ordering may be newest-first while runner assumes ascending; needs independent verification against intended contract | No | No | Yes | No | No | Inspect timeline ordering contract, then either fix API sort or runner expectation consistently | Timeline API rerun and contract confirmation | High |
| `P3-HIS-009` | History | FAIL | Previous/new context displayed correctly | Grouped with chronology check and failed together | `docs/phase-3/evidence/network/P3-HIS-008-grace-chronology.txt` | `EVIDENCE_DEFECT` | Runner only checks chronology, not context-field preservation, so failure reason is under-specified | No | No | Yes | No | No | Add targeted context assertions for transition fields and separate from chronology result | Timeline API rerun with field assertions | High |

## BLOCKED Inventory

| Test ID | Category | Status | Expected result | Actual result | Evidence path | Classification | Root-cause hypothesis | Impl defect | Fixture defect | Harness defect | Missing feature | Environment blocker | Resolution action | Retest requirement | Priority |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `P3-PRO-017` | Promotion | BLOCKED | Authorized override with reason succeeds | Grouped runner did not execute safe evidence | n/a | `MISSING_IMPLEMENTATION` | Override flow may exist in service tests but is not covered end-to-end in runner/API path | Yes | No | Yes | Yes | No | Verify override endpoint support and add targeted execution path | Direct API rerun plus DB check | High |
| `P3-PRO-018` | Promotion | BLOCKED | Override actor and reason recorded | Not executed | n/a | `MISSING_IMPLEMENTATION` | Audit/timeline evidence not yet wired in grouped runner | Yes | No | Yes | Yes | No | Add audit/timeline assertions after override execution | API rerun plus timeline/audit check | High |
| `P3-TRF-004` | Transfer | BLOCKED | Valid language-section transfer succeeds | Not executed | n/a | `HARNESS_DEFECT` | Runner omitted safe repeatable case despite fixtures existing | No | No | Yes | No | No | Add targeted language-transfer case to runner | API rerun plus DB check | High |
| `P3-LEV-010` | Leave | BLOCKED | Missing reason rejected or defect recorded | Not executed | n/a | `VALIDATION_DEFECT` | Leave API may currently allow null reason because service treats it optional | Yes | No | Yes | No | No | Confirm request validation contract and enforce if mandatory | Direct API rerun | High |
| `P3-GRA-009` | Graduation | BLOCKED | Dropped student rejected | Not executed | n/a | `HARNESS_DEFECT` | Negative graduation case never isolated in grouped runner | No | No | Yes | No | No | Add dedicated dropped-student graduation case | Direct API rerun | High |
| `P3-AUTH-BR-016` | Auth | BLOCKED | No foreign department data visible in UI | Not executed | n/a | `HARNESS_DEFECT` | Browser scan not implemented in grouped pass | No | No | Yes | No | No | Add department-admin browser evidence scan | Browser rerun | Critical |
| `P3-AUTH-BR-017` | Auth | BLOCKED | Secure error message shown on denial | Not executed | n/a | `HARNESS_DEFECT` | Denial-message browser capture missing | No | No | Yes | No | No | Add browser denial-flow capture | Browser rerun | Critical |
| `P3-LEG-001` | Legacy | BLOCKED | Legacy-only student profile loads | Captured under admin session, not student session | `docs/phase-3/evidence/browser/P3-LEG-001-trent-profile.png` | `HARNESS_DEFECT` | Wrong browser role used; evidence is invalid for case | No | No | Yes | No | No | Re-run under actual legacy student session | Browser rerun | High |
| `P3-LEG-002` | Legacy | BLOCKED | Legacy `StudentSubject` remains visible/usable | Not executed | n/a | `HARNESS_DEFECT` | API/browser compatibility check omitted | No | No | Yes | No | No | Add legacy history/progress/API checks | API/browser rerun | High |
| `P3-LEG-009` | Legacy | BLOCKED | Legacy ebook record loads | Not executed | n/a | `HARNESS_DEFECT` | Ebook compatibility case omitted from runner | No | No | Yes | No | No | Add student-facing ebook/API execution | Browser/API rerun | Medium |
| `P3-EXM-005` | Exam Eligibility | BLOCKED | Wrong language denied | Not executed | n/a | `HARNESS_DEFECT` | Negative eligibility case omitted | No | No | Yes | No | No | Add direct exam-detail denial test | API rerun | Critical |
| `P3-EXM-009` | Exam Eligibility | BLOCKED | Wrong subject denied | Not executed | n/a | `HARNESS_DEFECT` | Negative eligibility case omitted | No | No | Yes | No | No | Add direct exam-detail denial test | API rerun | Critical |
| `P3-EXM-018` | Exam Eligibility | BLOCKED | Socket join denied for invalid scope | Not executed | n/a | `MISSING_IMPLEMENTATION` | No socket-level negative coverage path exists in grouped runner yet | Yes | No | Yes | Yes | No | Add socket join denial test with invalid-scope student | Browser/log/network rerun | Critical |
| `P3-EXM-019` | Exam Eligibility | BLOCKED | Answer save denied after invalidated access | Not executed | n/a | `MISSING_IMPLEMENTATION` | No answer-save negative coverage path exists yet | Yes | No | Yes | Yes | No | Add protected answer-save regression | Browser/log/network rerun | Critical |
| `P3-UI-001` | UI | BLOCKED | Loading state appears safely | Not executed | n/a | `HARNESS_DEFECT` | Browser runner does not capture slow-load state | No | No | Yes | No | No | Add throttled or staged capture | Browser rerun | Medium |
| `P3-UI-003` | UI | BLOCKED | Validation error state shown | Not executed | n/a | `HARNESS_DEFECT` | Invalid-form browser case omitted | No | No | Yes | No | No | Add form validation browser capture | Browser rerun | Medium |
| `P3-UI-005` | UI | BLOCKED | Network/server error handled safely | Not executed | n/a | `HARNESS_DEFECT` | Failure-mode browser capture omitted | No | No | Yes | No | No | Add intercepted failing request scenario | Browser rerun | Medium |
| `P3-UI-006` | UI | BLOCKED | Duplicate submit prevented | Not executed | n/a | `HARNESS_DEFECT` | Duplicate-submit UI case omitted | No | No | Yes | No | No | Add browser double-submit assertion | Browser rerun | Medium |
| `P3-UI-007` | UI | BLOCKED | Form resets after success | Not executed | n/a | `HARNESS_DEFECT` | Success-reset UI case omitted | No | No | Yes | No | No | Add post-submit form-state capture | Browser rerun | Medium |
| `P3-UI-008` | UI | BLOCKED | Stale child selections cleaned up | Not executed | n/a | `HARNESS_DEFECT` | Dependent-select UI case omitted | No | No | Yes | No | No | Add browser dependent-select flow | Browser rerun | Medium |
| `P3-UI-009` | UI | BLOCKED | Refresh retains safe state | Not executed | n/a | `HARNESS_DEFECT` | Refresh-stability UI case omitted | No | No | Yes | No | No | Add refresh workflow capture | Browser rerun | Medium |
| `P3-UI-010` | UI | BLOCKED | No hydration warning or critical console error | Not executed | n/a | `HARNESS_DEFECT` | Console-only browser audit omitted | No | No | Yes | No | No | Add console scan across key pages | Browser rerun | Medium |

## Priority Order For This Pass

1. `P3-TRF-006`, `P3-GRA-003/014/015/016`, `P3-HIS-006`, `P3-LEG-010/011`, `P3-EXM-011/013`, `P3-AUTH-BR-016/017`, `P3-EXM-005/009/018/019`
2. `P3-TRF-007`, `P3-REA-010`, `P3-LEV-010`, `P3-GRA-009`, `P3-HIS-008/009`
3. Remaining runner/evidence-only browser and legacy gaps

## Retest Strategy

1. Add targeted filtering support to `scripts/phase-3/coverage-execution.mjs` so only open cases and immediate regressions rerun first.
2. Re-run independent verification for each FAIL case before changing status.
3. Repair product defects first, then eliminate hardcoded `BLOCKED` runner gaps by implementing real targeted execution.
4. Produce `docs/phase-3/evidence/failure-retest-summary.json` before any full-suite rerun.
