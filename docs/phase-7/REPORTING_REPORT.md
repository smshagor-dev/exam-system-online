# Phase 7 Reporting Report

## Status

`PASS`

## Implemented

- JSON reporting endpoint: `/api/teacher/coursework/reports`
- CSV export support for submission, missing students, grades, and extensions
- teacher reports UI at `/teacher/coursework/reports`
- publication-scoped reporting metrics for attempts, late submissions, grades, and extensions

## Proven

- teacher JSON reporting succeeds for the coursework publication scope
- grades CSV export succeeds for the same scope
- report links remain within authorized teacher workflows

## Evidence

- browser proof: `P7-BR-012`
- export artifact: [reports-grades.csv](/D:/Public/exam-system-online/docs/phase-7/evidence/network/reports-grades.csv)
- browser summary: [summary.json](/D:/Public/exam-system-online/docs/phase-7/evidence/browser/summary.json)
