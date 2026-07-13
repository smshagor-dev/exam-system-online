# Phase 4 API Report

## Added APIs

- `/api/admin/teacher-memberships`
- `/api/admin/teaching-assignments`
- `/api/admin/teaching-assignments/[id]`
- `/api/admin/teacher-substitutions`
- `/api/admin/workload-policies`
- `/api/admin/teacher-workload/reports`

## Notes

- All routes enforce admin scope server-side.
- Department admins are limited to managed departments.
- Teacher-facing authorization now prefers normalized teaching assignments and falls back to legacy assignments.
- Teacher exam, question, result, substitution, and socket authorization now use the Phase 4 assignment resolver for substitute access.
