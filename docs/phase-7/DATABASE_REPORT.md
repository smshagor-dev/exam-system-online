# Phase 7 Database Report

## Status

`PASS`

## Added Enterprise Models

- `CourseworkTemplate`
- `CourseworkTemplateVersion`
- `CourseworkRubric`
- `CourseworkRubricCriterion`
- `CourseworkRubricLevel`
- `CourseworkPublication`
- `CourseworkPublicationTarget`
- `CourseworkAttempt`
- `CourseworkAttemptAttachment`
- `CourseworkExtensionRequest`
- `CourseworkGrade`
- `CourseworkGradeCriterionScore`
- `CourseworkFeedbackAttachment`
- `CourseworkModerationDecision`

## Validation

- `npx prisma format`: PASS
- `npx prisma validate`: PASS
- `npx prisma generate`: PASS

## Notes

- browser and automated fixtures now cover submission, moderation, notification, extension, and viewport evidence against the enterprise coursework schema
