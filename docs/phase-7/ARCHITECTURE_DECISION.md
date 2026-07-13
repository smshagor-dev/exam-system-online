# Phase 7 Architecture Decision

## Decision

Phase 7 enterprise coursework is implemented additively on top of the legacy coursework system.

## Why

- preserve Phase 5 coursework compatibility
- avoid regressing Phase 6 exam runtime
- keep translation-era coursework records readable
- allow enterprise workflows to evolve without breaking old `/api/coursework/*` endpoints

## Implemented Layers

- additive Prisma entities for templates, publications, attempts, attachments, extensions, grades, moderation, and rubrics
- shared workflow logic in `src/lib/coursework-enterprise.ts`
- shared teacher/student workspace aggregation in `src/lib/coursework-enterprise-workspace.ts`
- dedicated Phase 7 APIs under `/api/teacher/coursework/*` and `/api/student/coursework/*`
- separate UI routes for enterprise coursework while legacy coursework views remain accessible

## Tradeoffs

- some enterprise features are present in backend form before full UI completion
- browser harness currently proves route reachability and evidence capture, not every final workflow assertion

## Status

`ACTIVE`
