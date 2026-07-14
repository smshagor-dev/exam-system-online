# Data Cleanup Report

Date: 2026-07-14
Status: PASS

## Cleanup Tools

- Fixture cleanup: `scripts/production/cleanup-test-data.ts`
- Academic metadata cleanup: `scripts/production/cleanup-demo-academic-data.ts`
- Apply guard: `ALLOW_PRODUCTION_DATA_CLEANUP=true`

## Evidence

- `docs/production-release/data-cleanup-apply-summary.json`
- `docs/production-release/data-cleanup-dry-run-summary.json`
- `docs/production-release/evidence/academic-cleanup/academic-cleanup-inventory.json`
- `docs/production-release/evidence/academic-cleanup/academic-cleanup-apply-summary.json`
- `docs/production-release/evidence/academic-cleanup/academic-cleanup-dry-run-summary.json`
- `docs/production-release/backups/cleanup-backup-1784036207618.json`

## Final Production-Target Database Verification

| Check | Result |
| --- | --- |
| `fixture users` | `0` |
| `fixture teacher profiles` | `0` |
| `fixture student profiles` | `0` |
| `fixture exams` | `0` |
| `fixture coursework templates` | `0` |
| `fixture coursework publications` | `0` |
| `fixture attempts` | `0` |
| `fixture attempt attachments` | `0` |
| `fixture AI-review rubric data` | `0` |
| `orphan attachments` | `0` |
| `orphan fixture upload bytes` | `0` |
| `temporary clean-install users` | `0` |

## Structural Academic Metadata Disposition

The earlier heuristic fixture cleanup still reports legacy-looking codes by name. That heuristic output is no longer the release blocker. The authoritative structural review is the machine-readable academic inventory, which classifies records by source plus live relations instead of by names alone.

Final academic inventory result:

| Classification | Count |
| --- | --- |
| `REAL_REQUIRED_REFERENCE_DATA` | `40` |
| `SYSTEM_DEFAULT` | `1` |
| `DEMO_DATA` | `0` |
| `UNKNOWN_REQUIRES_MANUAL_DECISION` | `0` |

Confirmed demo cleanup result:

| Check | Result |
| --- | --- |
| `confirmed demo departments` | `0` |
| `confirmed demo subjects` | `0` |
| `confirmed demo groups` | `0` |
| `confirmed demo sessions` | `0` |
| `unclassified academic records` | `0` |

The 41 retained structural records are intentionally kept because they are still referenced by active academic offerings, groups, department-language mappings, scheduling structures, or the production default language. Evidence: `docs/production-release/evidence/academic-cleanup/academic-cleanup-inventory.json`.

## Outcome

Production-target cleanup is complete. Fixture data is back to zero, orphan uploads are zero, temporary release-verification users are removed, confirmed demo academic metadata is zero, and no unclassified academic records remain.
