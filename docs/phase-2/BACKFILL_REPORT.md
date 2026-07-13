# Backfill Report

Mode: APPLY
Database: examflow_pro
Environment: development

## Result Summary
```json
{
  "teacherAssignments": {
    "total": 4,
    "resolved": 1,
    "acceptedUnresolved": 3,
    "ambiguous": 0,
    "failed": 0
  },
  "studentSubjects": {
    "total": 1534,
    "resolved": 2,
    "acceptedUnresolved": 6,
    "ambiguous": 0,
    "failed": 1526
  }
}
```

## Decision Notes
- The backfill only maps records when a validated manual mapping exists or exactly one compatible academic offering can be proven.
- Records listed as `EXPLICITLY_ACCEPTED_UNRESOLVED` remain legacy-only by design and are documented in the unresolved reports.