# Production Cleanup Inventory

Date: 2026-07-14
Status: PASS

## Classification Legend

- `REMOVE_FROM_PRODUCTION`
- `KEEP_FOR_CI`
- `KEEP_AS_DOCUMENTATION`
- `KEEP_AS_REQUIRED_PRODUCTION_OPERATION`
- `KEEP_AS_REQUIRED_SEED`

## Inventory

| Item | Location | Classification | Notes |
| --- | --- | --- | --- |
| Production-safe seed defaults | `prisma/seed-production.ts` | `KEEP_AS_REQUIRED_SEED` | Production seed keeps only system languages and global system settings. |
| Development demo seed | `prisma/seed-development.ts` | `KEEP_FOR_CI` | Guarded by `ALLOW_DEMO_SEED=true`; not a production entrypoint. |
| Test fixture seed | `prisma/seed-test.ts` | `KEEP_FOR_CI` | Guarded by `ALLOW_TEST_FIXTURES=true`; used only for maintained validation. |
| Legacy wrapper seed entrypoint | `prisma/seed.ts` | `KEEP_FOR_CI` | Retained only as an explicit non-production wrapper. |
| Demo credentials UI | `src/app/(auth)/login/page.tsx` | `REMOVE_FROM_PRODUCTION` | No runtime demo credentials are rendered. |
| AI settings test route | `src/app/api/ai-settings/test/route.ts` | `REMOVE_FROM_PRODUCTION` | Returns `404` in production mode. |
| Raw coursework upload URL access | `middleware.ts` | `REMOVE_FROM_PRODUCTION` | Raw `/uploads/coursework*` access is blocked. |
| Fixture coursework uploads | `public/uploads/coursework-enterprise/*` | `REMOVE_FROM_PRODUCTION` | Fixture/orphan files are removed by `scripts/production/cleanup-test-data.ts`. |
| Phase 7 fixture bootstrap | `scripts/phase-7/ensure-coursework-test-fixtures.ts` | `KEEP_FOR_CI` | Required so maintained coursework tests self-provision without production demo state. |
| Phase 7 regression suites | `scripts/phase-7/*` | `KEEP_FOR_CI` | Maintained coursework validation. |
| Phase 7.5 regression suites | `scripts/phase-7-5/*` | `KEEP_FOR_CI` | Maintained AI review validation, auth matrix, and browser smoke coverage. |
| Production academic cleanup inventory | `scripts/production/cleanup-demo-academic-data.ts` | `KEEP_AS_REQUIRED_PRODUCTION_OPERATION` | Safe dry-run/apply cleanup with deterministic classification and referential-integrity checks. |
| Production fixture cleanup | `scripts/production/cleanup-test-data.ts` | `KEEP_AS_REQUIRED_PRODUCTION_OPERATION` | Removes fixture users, uploads, coursework artifacts, and temporary validation data. |
| Release verification bootstrap | `scripts/production/bootstrap-release-verification.ts` | `KEEP_AS_REQUIRED_PRODUCTION_OPERATION` | Environment-guarded temporary bootstrap for isolated release verification only. |
| Mail verification | `scripts/production/verify-mail-transport.ts` | `KEEP_AS_REQUIRED_PRODUCTION_OPERATION` | Proves SMTP transport still works after dependency remediation. |
| Socket verification | `scripts/production/verify-socket-runtime.ts` | `KEEP_AS_REQUIRED_PRODUCTION_OPERATION` | Proves Socket.IO + Redis reconnect behavior after dependency remediation. |
| Clean-install verification | `scripts/production/verify-clean-install.ts` | `KEEP_AS_REQUIRED_PRODUCTION_OPERATION` | Proves isolated admin/teacher/student login, protected routes, logout, and denial flow. |
| Final audit evidence | `docs/final-audit/**` | `KEEP_AS_DOCUMENTATION` | Audit evidence only; excluded from deployment packaging. |
| Production release evidence | `docs/production-release/**` | `KEEP_AS_DOCUMENTATION` | Release evidence only; excluded from deployment packaging. |
| Docker / package ignore rules | `.dockerignore`, `.npmignore` | `KEEP_AS_REQUIRED_SEED` | Prevent docs, scripts, uploads, and local artifacts from entering deployment packages. |
| Structural academic metadata still present after cleanup | database academic catalog tables | `KEEP_AS_REQUIRED_PRODUCTION_OPERATION` | Fresh academic inventory classifies the remaining 41 records as `40 REAL_REQUIRED_REFERENCE_DATA`, `1 SYSTEM_DEFAULT`, `0 DEMO_DATA`, `0 UNKNOWN_REQUIRES_MANUAL_DECISION`. Evidence: `docs/production-release/evidence/academic-cleanup/academic-cleanup-inventory.json`. |
| SMTP admin test-email route | `src/app/api/admin/system-settings/test-email` | `KEEP_AS_REQUIRED_PRODUCTION_OPERATION` | Operational admin-only route retained intentionally and validated by `npm run production:verify-mail`. |

## Inventory Outcome

- Removed from production runtime: demo credentials, raw upload access, fixture uploads, and unsafe production seeding paths.
- Preserved for CI: maintained regression suites, explicit test/development seed wrappers, and fixture bootstrap helpers.
- Preserved for release operations: guarded cleanup and verification scripts used for production sign-off only.
- Structural academic metadata blocker is closed: confirmed demo academic records are `0`, unclassified academic records are `0`, and retained records are documented as production-valid in the academic cleanup inventory.
