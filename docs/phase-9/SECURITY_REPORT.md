# Security Report

## Controls

- role and department-scoped permission checks for all admin Phase 9 routes
- student ownership checks for transcript, certificate, result, and appeal endpoints
- publication lock prevents late gradebook edits
- public verification reveals document validity only, not private files

## Evidence

- `docs/phase-9/evidence/database/phase9-auth.json`
- `docs/phase-9/evidence/network/phase9-browser-tenant-isolation.json`
