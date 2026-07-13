# Phase 5 Defect Report

## Final Status

PASS

## Root Cause Classification

| Case(s) | Classification | Confirmed Root Cause | Resolution |
| --- | --- | --- | --- |
| `P5-QUE-011`, `P5-EXM-016` | `PRODUCT_DEFECT` | Publication queries filtered translations with `archivedAt: null`, which excluded older active base-language rows where `archivedAt` was unset. Validators then saw complete content as missing and returned `409`. | Updated translation-loading paths to treat unset `archivedAt` as active content and stopped route-level publication fetches from dropping base rows. |
| `P5-STD-018`, `P5-STD-019`, `P5-STD-020`, `P5-STD-021` | `PRODUCT_DEFECT` | Student delivery failures were downstream of the publication defect: exams remained `DRAFT`, so student detail routes returned denial/404 instead of academic-language content. | Fixing the publication allow-path restored scheduled exam delivery. Browser locale remained ignored and spoofed `languageId` remained ignored. |
| `P5-UI-054`, `P5-UI-055` | `HARNESS_DEFECT` | The browser smoke harness checked the page after a fixed `1s` delay while the PATCH request was still in flight, and it selected an item that correctly disappeared under `Missing only` after the list refreshed. | Updated the harness to wait for the actual PATCH response and to use the intentionally incomplete question fixture for the save-draft/mark-complete success path. |
| `phase5:verify` post-fixture run | `FIXTURE_DEFECT` | The verification script treated the intentional `P5 Evidence Broken...` negative fixture as a general multilingual integrity failure after `phase5:test` recreated it. | Updated the verifier to exclude the explicit negative fixture from PASS/fail integrity reporting. |

## Regression Coverage Added

- `scripts/phase-5/multilingual-content-tests.ts`
  - Incomplete question publication -> blocked
  - Complete question publication -> success
  - Incomplete exam publication -> blocked
  - Complete exam publication -> success

- `scripts/phase-5/browser-smoke.mjs`
  - Save draft waits for real PATCH completion
  - Mark complete waits for real PATCH completion
  - UI success path uses the intended incomplete fixture
  - Filtered result recording support via `--tests=...`
