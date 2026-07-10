# ExamFlow Pro Operations Structure

Date: 2026-07-11
Repo: `D:\Public\exam-system-online`

## Purpose

This document defines a practical operations structure for local development, QA, staging, and production readiness of ExamFlow Pro.

## 1. System Overview

Core runtime pieces:

- Next.js application under `src/app`
- custom Node server at [server.js](/D:/Public/exam-system-online/server.js:1)
- Socket.IO server initialized from [src/server/socket-server.ts](/D:/Public/exam-system-online/src/server/socket-server.ts:1)
- Prisma ORM with schema at [prisma/schema.prisma](/D:/Public/exam-system-online/prisma/schema.prisma:1)
- scheduled academic promotion job at [server/student-promotion-cron.js](/D:/Public/exam-system-online/server/student-promotion-cron.js:1)

## 2. Environment Structure

### Development

Purpose:

- active feature work
- local QA
- schema iteration

Entry command:

```powershell
npm run dev
```

Important behavior:

- uses `server.js` instead of plain `next dev`
- runs `prisma db push` automatically on boot unless `SKIP_DB_MIGRATIONS=true`
- loads Socket.IO and the student promotion scheduler

### Pre-release QA

Purpose:

- prove the branch is safe to release

Required gates:

```powershell
npm run build
npm run lint
```

Recommended manual smoke tests:

- login, register, verify-account, forgot-password
- admin CRUD for departments, groups, subjects, years, languages
- teacher assignment and question-bank flow
- teacher create exam flow
- student join exam, auto-save, submit, result view
- coursework and ebook access for teacher/student
- AI settings save/test flow if enabled

### Production

Purpose:

- serve the built Next.js app with custom server and sockets

Start command:

```powershell
$env:NODE_ENV='production'
node server.js
```

Production rules:

- do not rely on boot-time `db push` as the only schema control in shared environments
- validate cron behavior and timezone configuration before go-live
- keep real secrets in deployment environment variables, not in tracked files

## 3. Startup Flow

The app currently starts in this order:

1. `server.js` begins boot.
2. Database setup runs unless `SKIP_DB_MIGRATIONS=true`.
3. Next app prepares.
4. HTTP server starts listening.
5. Socket.IO server attaches in development runtime.
6. academic promotion scheduler starts.

Operational implication:

- a bad DB connection or unwanted `db push` can block startup
- background logic is coupled to app boot, so releases should include scheduler awareness

## 4. Configuration Structure

Primary config file:

- [.env.example](/D:/Public/exam-system-online/.env.example:1)

Expected config groups:

- database
- auth secrets
- app URL and socket URL
- SMTP fallback
- promotion timezone
- host and port

Recommended policy:

- `.env.example` must contain placeholders only
- `.env` is local-only
- production secrets should come from deployment environment config
- when SMTP is configured in admin settings, DB-backed values should override env fallback

## 5. Roles And Ownership

### Engineering

Owns:

- feature code
- schema changes
- lint/build health
- socket and exam flow correctness

### QA

Owns:

- release gate verification
- regression testing for auth, exams, results, and admin CRUD
- documenting pass/fail evidence

### Operations / Release Owner

Owns:

- environment variable correctness
- deployment execution
- backup and rollback readiness
- scheduled job awareness

## 6. QA Structure

### Daily developer checks

Run during active work:

```powershell
npm run lint
```

Focus areas:

- new `any` usage
- effect-driven state writes
- route and auth regressions

### Pre-merge checks

Run before merging:

```powershell
npm run build
npm run lint
```

If the branch changes exams or sockets, add manual live-flow verification.

### Pre-release checklist

- env placeholders are clean
- DB target is correct
- Prisma schema matches intended release
- build passes
- lint passes or has approved exceptions
- student exam flow tested
- teacher grading/review tested
- result publication tested
- auth recovery flow tested
- cron configuration reviewed

## 7. Scheduled Job Operations

Student promotion job source:

- [server/student-promotion-cron.js](/D:/Public/exam-system-online/server/student-promotion-cron.js:189)

Structure:

- checks timezone from `ACADEMIC_PROMOTION_TIMEZONE`
- skips until September
- records completion state in `systemSetting`
- runs only once per year

Operations checklist:

- verify academic year records before September rollover
- verify group mappings exist for the next year
- confirm student custom field `course` values remain normalized
- review completion state after the job runs
- confirm blocked-student behavior is intentional for completed programs

## 8. Release Structure

Recommended release sequence:

1. Freeze feature changes for the release window.
2. Confirm clean secrets and environment values.
3. Run `npm run build`.
4. Run `npm run lint`.
5. Execute manual smoke tests for admin, teacher, and student roles.
6. Back up the production database.
7. Deploy application code.
8. Start app in production mode.
9. Verify login, dashboard, socket connection, and exam attempt basics.
10. Review logs for scheduler or boot errors.

## 9. Incident Response Structure

### App fails to boot

Check:

- env values
- DB connectivity
- automatic `prisma db push` side effects
- Node startup logs from `server.js`

### Exam session instability

Check:

- browser console
- socket connection/auth token route
- `src/server/socket-server.ts`
- student attempt page auto-save and timer behavior

### Auth or verification failure

Check:

- auth env secrets
- SMTP setup source of truth
- verify/reset API routes
- DB-backed system settings

### Data promotion issue

Check:

- `systemSetting` state for `student-academic-promotion-job`
- academic year and group mappings
- affected student profiles and subject links

## 10. Current Gaps

As of 2026-07-11, this operations structure exists, but the branch still has release blockers:

- build is failing
- lint is failing
- sample env hygiene needs cleanup
- server boot and scheduler behavior need explicit release discipline

## 11. Recommended Next Improvements

Short-term:

- add a dedicated `qa` script that runs build plus lint
- sanitize `.env.example`
- separate dev-only and prod-safe startup behavior

Medium-term:

- move cron execution behind an explicit feature flag or worker process
- add smoke-test scripts for auth and exam flows
- document rollback and backup steps for production
