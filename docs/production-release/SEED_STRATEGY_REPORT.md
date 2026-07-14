# Seed Strategy Report

Date: 2026-07-14
Status: PASS

## Final Seed Split

| Seed file | Purpose | Production-safe |
| --- | --- | --- |
| `prisma/seed-production.ts` | Minimal required defaults only | Yes |
| `prisma/seed-development.ts` | Explicit development demo seed wrapper | No |
| `prisma/seed-test.ts` | Explicit test fixture seed wrapper | No |
| `prisma/seed.ts` | Legacy demo seed logic retained behind explicit wrappers | No |

## Production Seed Result

Executed on 2026-07-14:

- `npm run db:seed` -> `PASS`
- Ensured `systemLanguage` defaults: `3`
- Ensured global `systemSetting` record: `1`

## Production Safety Guards

- Production seed refuses to run when `ALLOW_DEMO_SEED=true` or `ALLOW_TEST_FIXTURES=true`.
- Development and test seed wrappers refuse `NODE_ENV=production`.
- `package.json` production seed entrypoints now target `prisma/seed-production.ts`.

## Outcome

The production seed no longer creates demo users, default passwords, fake coursework, fake exams, or sample AI-review data.
