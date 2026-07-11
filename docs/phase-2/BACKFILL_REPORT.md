# Backfill Report

Mode: DRY RUN
Database: examflow_pro
Environment: development

## Result Summary
```json
{
  "teacherAssignments": {
    "total": 3,
    "resolved": 0,
    "acceptedUnresolved": 3,
    "ambiguous": 0,
    "failed": 0
  },
  "studentSubjects": {
    "total": 6,
    "resolved": 0,
    "acceptedUnresolved": 6,
    "ambiguous": 0,
    "failed": 0
  }
}
```

## Decision Notes
- The backfill only maps records when a validated manual mapping exists or exactly one compatible academic offering can be proven.
- Records listed as `EXPLICITLY_ACCEPTED_UNRESOLVED` remain legacy-only by design and are documented in the unresolved reports.