# Phase 7 API Report

## Status

`PASS`

## Added Teacher APIs

- `GET/POST /api/teacher/coursework/templates`
- `GET/POST /api/teacher/coursework/publications`
- `PATCH /api/teacher/coursework/publications/[id]`
- `PATCH /api/teacher/coursework/publications/[id]/extensions/[requestId]`
- `POST /api/teacher/coursework/publications/[id]/grades`
- `GET /api/teacher/coursework/reports`

## Added Student APIs

- `GET /api/student/coursework/publications`
- `GET/POST /api/student/coursework/publications/[id]/attempts`
- `GET/POST/PATCH /api/student/coursework/publications/[id]/extensions`
- `POST /api/student/coursework/grades/[id]/review`

## Hardening

- publication transition validation
- duplicate-submit idempotency
- closed-assignment submission rejection
- published-grade immutability guard
- protected attachment delivery authorization
- student extension cancellation

## Verification

- `npm run phase7:test`
- `npm run phase7:verify`
- `npm run phase7:auth`
- `node scripts/phase-7/browser-smoke.mjs`
