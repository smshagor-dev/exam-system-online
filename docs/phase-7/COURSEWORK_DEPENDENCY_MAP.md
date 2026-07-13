# Phase 7 Coursework Dependency Map

## Status

Phase 7 is `READY`, but the current coursework platform is still a legacy Phase 5-era implementation.

This document audits the current coursework system and identifies the additive expansion points required for the Phase 7 enterprise coursework, rubric, grading, reporting, and workflow platform.

## Audit Date

July 13, 2026

## Current Coursework Scope

The existing system already supports a limited coursework flow:

- teacher-scoped shared coursework rules per academic scope
- one coursework assignment per student per academic scope
- one file-based student submission flow
- AI-based accept/reject validation for DOCX uploads
- post-deadline access requests that act as extension approvals
- teacher review pages for submissions and access requests
- translation support for coursework rules and assignments

It does not yet support the full Phase 7 enterprise feature set:

- reusable assignment templates
- assignment lifecycle states beyond implicit create/update
- group assignments
- rubric engine
- grading workflow
- moderation and approval workflow
- multiple attempt history with teacher locking
- rich text, link, repo, and multi-attachment submissions
- report exports and coursework analytics
- fine-grained coursework RBAC permissions

## Core Data Model Dependencies

Current Prisma models:

- `CourseworkRule`
  Purpose:
  shared rules per `teacherId + subjectId + languageId + groupId + academicYearId + semesterId`
  Current fields:
  `rules`, `useAiValidation`, `submissionDeadline`
  Limitation:
  behaves like a per-scope rule sheet, not a reusable template or publishable coursework artifact.

- `CourseworkAssignment`
  Purpose:
  per-student coursework title bound to a teacher-owned scope
  Current fields:
  `teacherId`, `studentId`, scope ids, optional `ruleId`, `title`, `rules`
  Limitation:
  only one assignment per student/scope due to unique constraint on teacher/student/scope tuple.
  This blocks multiple assignments in the same course scope and prevents versioned publishing.

- `CourseworkSubmission`
  Purpose:
  stores a single uploaded submission record
  Current fields:
  `fileName`, `fileUrl`, `fileSizeBytes`, `extractedText`, `status`, `aiFeedback`
  Limitation:
  no attempt number, no resubmission workflow, no multi-file attachments, no grading data, no late metadata.

- `CourseworkAccessRequest`
  Purpose:
  student asks for access after deadline
  Current fields:
  `message`, `status`, `extensionDeadline`, `teacherNote`, `reviewedAt`
  Limitation:
  acts like a narrow extension mechanism, but not a full audited extension workflow with expiry/cancel states.

- `CourseworkRuleTranslation`
  Purpose:
  translated `rules` content

- `CourseworkAssignmentTranslation`
  Purpose:
  translated `title` and `rules`

Related cross-phase models:

- `TeacherProfile`
- `StudentProfile`
- `TeacherAssignment`
- `AcademicOffering`
- `StudentSubject`
- `Notification`
- `ActivityLog`
- `Language`
- `Department`
- `Group`
- `AcademicYear`
- `Semester`

## Schema-Level Constraints That Matter For Phase 7

- `CourseworkAssignment` is uniquely constrained by teacher + student + scope.
  Impact:
  one student cannot currently receive two different assignments in the same subject/language/group/year/semester scope.

- `CourseworkRule` is uniquely constrained by teacher + scope.
  Impact:
  the current model represents one shared scope rule, not a catalog of coursework templates or assignment definitions.

- `CourseworkSubmission` has no attempt identity.
  Impact:
  history exists only as raw repeated rows, not structured attempt progression.

- no coursework grading tables exist.
  Impact:
  rubric scoring, feedback publication, moderation, approval, and review are not modeled yet.

- no coursework attachment child tables exist.
  Impact:
  submissions are limited to one uploaded file path per row.

## Current API Surface

### Teacher APIs

- `src/app/api/coursework/rules/route.ts`
  Current behavior:
  teacher saves or updates one shared coursework rule for a scope.
  Dependencies:
  `auth`, `teacherProfile`, `teacherAssignment`, `courseworkRule`, `courseworkRuleTranslation`, `getAiConfig`.
  Hidden coupling:
  updates all matching `CourseworkAssignment.rules` rows after shared rule save.

- `src/app/api/coursework/assignments/route.ts`
  Current behavior:
  teacher assigns or updates one student title for a scope.
  Dependencies:
  `teacherAssignment`, `studentProfile.subjects`, `courseworkRule`, `courseworkAssignment`, translation upserts.
  Hidden coupling:
  requires shared rules to exist first.

- `src/app/api/coursework/access-requests/[id]/route.ts`
  Current behavior:
  teacher approves or rejects a late access request with an extension deadline.
  Dependencies:
  `teacherProfile`, `courseworkAccessRequest`, parent `assignment.rule.submissionDeadline`.
  Limitation:
  approval writes only `APPROVED` or `REJECTED`; no moderation or audit trail beyond row update.

### Student APIs

- `src/app/api/coursework/submissions/route.ts`
  Current behavior:
  student uploads one DOCX file to one assignment.
  Dependencies:
  `auth`, `studentProfile`, `courseworkAssignment`, optional approved `courseworkAccessRequest`, `mammoth`, `validateCourseworkWithAi`.
  Validation today:
  student ownership, DOCX-only type, max 10MB, readable extracted text, deadline/approved extension, AI optional acceptance check.
  Limitation:
  no multi-format upload matrix, no malware placeholder flag, no rich text, no repository URL, no attempt locking.

- `src/app/api/coursework/access-requests/route.ts`
  Current behavior:
  student requests post-deadline access.
  Dependencies:
  `studentProfile`, `courseworkAssignment`, latest access request.
  Limitation:
  only works after original deadline and only for personal assignments.

## Current UI Entry Points

### Teacher Pages

- `src/app/teacher/coursework/page.tsx`
  Uses `TeacherCourseworkOverview`.
  Purpose:
  read-only overview of rules, assignments, and latest submission statuses.

- `src/app/teacher/coursework/create/page.tsx`
  Uses `TeacherCourseworkManager`.
  Purpose:
  save shared rules and per-student titles.
  Current workflow:
  select scope -> save shared rules -> assign title per student.

- `src/app/teacher/coursework/submitted/page.tsx`
  Uses `TeacherCourseworkSubmissionsView`.
  Purpose:
  browse submissions and approve/reject access requests.

### Student Pages

- `src/app/student/coursework/page.tsx`
  Uses `StudentCourseworkManager`.
  Purpose:
  see assigned coursework, upload DOCX, request extra access after deadline.

## Current UI Components

- `src/components/teacher/TeacherCourseworkManager.tsx`
  Current assumptions:
  one shared rule per scope and one assignment title per student/scope.
  No publish workflow, no template selection, no rubric UI, no grading UI.

- `src/components/teacher/TeacherCourseworkOverview.tsx`
  Current assumptions:
  latest submission only, aggregate accepted/pending/rejected counts only.

- `src/components/teacher/TeacherCourseworkSubmissionsView.tsx`
  Current assumptions:
  submission review is file-download plus AI accept/reject visibility.
  No mark entry, rubric scoring, moderation, annotation, or grade publication.

- `src/components/student/StudentCourseworkManager.tsx`
  Current assumptions:
  DOCX upload only, latest submission only, access request instead of full extension workflow.

## Workspace Query Layer

- `src/lib/coursework-teacher.ts`
  Primary teacher aggregation helper.
  Pulls:
  teacher profile, assigned academic scopes, matching students, rules, assignments, submissions, and access requests.
  Hidden coupling:
  coursework visibility is still based on direct `teacherId` ownership and legacy teacher-assignment scope filters.

- `src/lib/coursework.ts`
  Current helpers:
  upload directory path, max size, file-name sanitation, deadline formatting, access request status formatting.
  Limitation:
  file policy is hard-coded for one upload path and one global size limit.

## File Upload Dependencies

- upload path:
  `public/uploads/coursework`
- helper:
  `src/lib/coursework.ts`
- server extraction:
  `mammoth` in `src/app/api/coursework/submissions/route.ts`
- AI validator:
  `src/services/coursework-ai.service.ts`

Current file behavior:

- only DOCX accepted
- max 10MB
- file stored on local disk
- extracted plain text used for AI validation
- no attachment ownership table
- no malware placeholder field
- no content hash or duplicate detection

Phase 7 implication:

the current storage path can be reused initially, but Phase 7 needs attachment entities and richer metadata rather than one file path on `CourseworkSubmission`.

## Notification Dependencies

Current coursework APIs do not create coursework notifications.

Existing reusable infrastructure:

- `Notification` Prisma model
- existing notification creation pattern in `src/lib/result-engine.ts`

Phase 7 implication:

coursework publish/update/submission/grade/extension notifications should reuse `Notification` rather than introducing a separate messaging system.

## Activity/Audit Dependencies

Reusable infrastructure:

- `ActivityLog` Prisma model

Current coursework APIs do not consistently audit:

- rule save
- assignment create/update
- submission create
- extension approval/rejection
- grading/moderation actions

Phase 7 implication:

extension decisions, grading state transitions, moderation actions, and publish events should all be audited here or in additive coursework-specific audit tables.

## Translation Dependencies

Current translation integration is active and must not regress.

Translation-related files:

- `CourseworkRuleTranslation`
- `CourseworkAssignmentTranslation`
- `src/lib/phase5-translations.ts`
- `src/app/api/teacher/translations/[entity]/route.ts`
- `src/app/api/teacher/translations/[entity]/[parentId]/route.ts`
- `src/components/teacher/TeacherTranslationWorkspace.tsx`

Current translation entities:

- `coursework-rules`
- `coursework-assignments`

Phase 7 implication:

new coursework template, rubric, feedback, and publishable assignment entities must either:

- integrate with the multilingual architecture using additive translation tables, or
- clearly remain language-neutral where appropriate.

Phase 5 translation behavior must remain intact for existing coursework entities.

## Permissions And RBAC Dependencies

Current enforcement is coarse:

- route-level role checks via `requireRole(UserRole.TEACHER)` or `requireRole(UserRole.STUDENT)`
- ownership/scope checks inside coursework APIs
- teacher scope still tied to `TeacherAssignment`

Current gap:

there is no explicit coursework permission layer for:

- `coursework.read`
- `coursework.manage`
- `coursework.grade`
- `coursework.publish`
- `coursework.review`
- `coursework.extension`
- `coursework.report`

Phase 7 implication:

RBAC should be additive on top of:

- `UserRole`
- `TeacherAssignmentRoleType`
- teacher offering/scope validation from Phase 4

Assistant teacher, reviewer, moderator, and department approval flows should reuse Phase 4 teacher-assignment architecture instead of bypassing it.

## Tenant Isolation Dependencies

Current isolation is mostly indirect through scope ownership:

- teacher ownership by `teacherId`
- student ownership by `studentId`
- departmental filtering
- scope matching via subject/language/group/year/semester

Current leakage risk areas to review in Phase 7:

- file download URLs are plain public paths
- no attachment ownership table yet
- reporting endpoints do not yet exist
- grading/moderation entities do not yet exist

Phase 7 implication:

tenant isolation will need to be explicit for:

- attachments
- reports
- grading records
- rubric records
- extension and review workflows

## Result Engine Integration

Current state:

- no coursework grading integration exists in `src/lib/result-engine.ts`
- result engine is exam-focused and should not be modified in a way that regresses Phase 6

Phase 7 implication:

coursework grading should be implemented in additive coursework grading services, not by folding coursework logic into the exam result engine.

## Browser Surface Dependencies

Existing browser-tested coursework surface already exists from Phase 5:

- teacher coursework overview/create/submitted pages
- student coursework page
- coursework translation preview coverage

Phase 7 browser QA must extend, not replace, these surfaces and should cover:

- create assignment
- publish assignment
- multiple attempts
- late policy handling
- extension workflow
- rubric grading
- grade publication
- student review
- notifications
- desktop/tablet/mobile
- light/dark mode

## Current Legacy Behavior That Must Be Preserved

- existing `CourseworkRule` and `CourseworkAssignment` records must stay readable
- teacher coursework pages must keep working for legacy scope-based assignments
- student coursework page must not lose access to existing assignments/submissions
- translation APIs for coursework rules and assignments must remain compatible
- existing `/api/coursework/*` endpoints must not be removed

## Phase 7 Design Constraints Derived From This Audit

Recommended additive approach:

- keep legacy models and APIs readable
- add new enterprise entities instead of mutating legacy rows into incompatible shapes
- bridge legacy `CourseworkRule` and `CourseworkAssignment` into new template/publication entities where needed
- treat current system as `legacy personal coursework assignment` support

Likely additive entities needed:

- coursework templates
- coursework publications / versions
- rubric definitions / rubric criteria / rubric levels
- submission attempts
- submission attachments
- submission external resources
- grading sheets
- grading rubric scores
- feedback attachments / notes
- moderation decisions
- extension requests with richer states
- coursework reports / exports or report services
- coursework audit log entries

## High-Risk Change Areas

- `CourseworkAssignment` uniqueness assumptions across teacher and student UIs
- translation previews and completeness rules from Phase 5
- teacher scope ownership from Phase 4
- student visibility filters from Phase 3 lifecycle and enrollment constraints
- local file upload behavior and public URL exposure
- direct role checks that are too coarse for assistant/reviewer/moderator workflows

## Recommended Implementation Order

1. Additive schema for templates, lifecycle, attempts, rubric, grading, moderation, and attachments
2. Query/service layer for enterprise coursework without breaking legacy reads
3. RBAC helpers for coursework permissions
4. Teacher create/publish/manage workflow
5. Student submission workflow with multiple attempt types
6. Grading and rubric workflow
7. Notifications and reports
8. Browser QA, auth matrix, verify scripts, and final docs

## Summary

The current coursework system is a useful legacy base, but it is not yet an enterprise coursework platform.

Phase 7 should preserve:

- legacy coursework rules
- legacy student assignments
- existing translation support
- current teacher/student coursework pages

Phase 7 must add:

- publishable assignment definitions
- richer submissions and attempts
- rubric and grading engines
- moderation and approval workflow
- reports, notifications, and explicit coursework RBAC

This should be done additively to avoid regressions in Phases 3 through 6.
