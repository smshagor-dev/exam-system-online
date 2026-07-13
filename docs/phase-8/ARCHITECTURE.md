# Phase 8 Architecture

## Status

`BLOCKED`

## Summary

Phase 8 is implemented as an additive scheduling and invigilation layer on top of the current academic offering, teacher assignment, student lifecycle, notification, and exam runtime architecture.

## Main Components

- Data model:
  - calendars and holidays
  - campuses, buildings, and rooms
  - scheduling sessions and schedule items
  - seat plans and seat assignments
  - invigilation duty and per-exam invigilator assignment
  - attendance, admit cards, and incidents
- Backend logic:
  - conflict detection for student groups, rooms, and holidays
  - automatic scheduling generator
  - seat plan generation
  - admit card issuance
  - live invigilation dashboard aggregation
  - report aggregation
- UI:
  - admin calendar, venue, and scheduling pages
  - teacher invigilation page
  - student admit cards page

## Current State

- additive schema: implemented
- primary APIs: implemented
- first admin/teacher/student UI layer: implemented
- automation scaffolding: implemented
- full browser matrix and final evidence pack: not yet complete
