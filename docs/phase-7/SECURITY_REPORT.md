# Phase 7 Security Report

## Status

`PASS`

## Implemented

- explicit coursework permission mapping in [src/lib/permissions.ts](/D:/Public/exam-system-online/src/lib/permissions.ts)
- scoped teacher access built on teaching assignments
- student publication access validation with target and scope checks
- DB-backed role validation for student coursework APIs
- student-facing coursework grade visibility restricted to published grades only
- protected coursework attachment delivery with authorization checks and `nosniff`
- attachment ownership, count, MIME, and executable validation
- duplicate-notification protection through dedupe windows

## Proven

- foreign students are denied targeted coursework access
- anonymous and foreign access to protected attachments is denied
- wrong users are not notified for scoped coursework events
- notification links resolve only to authorized coursework records
- students cannot see draft grades or moderation notes

## Evidence

- automated validation: `npm run phase7:auth`, `npm run phase7:qa`
- browser proof: `P7-BR-006`, `P7-BR-016`, `P7-MOD-001`, `P7-NOT-001`
- browser summary: [summary.json](/D:/Public/exam-system-online/docs/phase-7/evidence/browser/summary.json)
