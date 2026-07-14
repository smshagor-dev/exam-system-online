# Dependency Audit

Date: 2026-07-14
Status: PASS

## Commands Executed

- `npm audit --omit=dev --json`
- `npm outdated`
- `npm run typecheck`
- `npm run build`
- `npm run phase7.5:auth`
- `npm run production:verify-mail`
- `npm run production:verify-socket`
- `node scripts/phase-7-5/browser-smoke.mjs`

## Before / After

| Audit snapshot | Critical | High | Moderate |
| --- | --- | --- | --- |
| Before remediation | `0` | `5` | `5` |
| After remediation | `0` | `0` | `2` |

## Applied Remediation

| Package path | Action | Final version |
| --- | --- | --- |
| `nodemailer` | Direct upgrade | `9.0.3` |
| `ws` | Root override validated through Socket.IO runtime | `8.21.0` |
| root `postcss` | Direct upgrade | `8.5.19` |
| `smtp-server` typings | Dev-only type support for verification script | `@types/smtp-server` |

## Post-Remediation Dependency State

| Package | Classification | Reachability | Notes |
| --- | --- | --- | --- |
| `nodemailer@9.0.3` | `DIRECT_DEPENDENCY`, `PATCH_AVAILABLE` | `REACHABLE_IN_PRODUCTION` | Upgraded and validated with `npm run production:verify-mail` (`messagesCaptured: 1`). |
| `ws@8.21.0` via `engine.io` / `engine.io-client` / `socket.io-adapter` | `TRANSITIVE_DEPENDENCY`, `PATCH_AVAILABLE` | `REACHABLE_IN_PRODUCTION` | Resolved via validated root override; reconnect proof passed with `npm run production:verify-socket`. |
| auth mail peer range (`next-auth@5.0.0-beta.31` expecting `nodemailer ^7.0.7`) | `TRANSITIVE_DEPENDENCY`, `BREAKING_UPGRADE_REQUIRED` | `NOT_REACHABLE` as a vulnerability path | `npm ls` reports an optional peer-range mismatch, not an active security advisory. Auth, mail, and browser verification all passed with `nodemailer@9.0.3`. |
| `next@16.2.10 -> postcss@8.4.31` | `TRANSITIVE_DEPENDENCY`, `FALSE_POSITIVE_OR_NON_EXPLOITABLE` for this release gate | No known request-driven exploit path in this app | `npm audit` still reports the advisory, but only through Next’s bundled copy. The suggested “fix” is a downgrade to `next@9.3.3`, which is non-actionable. Root `postcss` is already `8.5.19`. |

## Residual Findings

Current `npm audit --omit=dev --json` output:

| Package | Severity | Classification | Result |
| --- | --- | --- | --- |
| `next` | `moderate` | `TRANSITIVE_DEPENDENCY`, `FALSE_POSITIVE_OR_NON_EXPLOITABLE` for this deployment profile | Non-blocking residual |
| bundled `postcss` under `next` | `moderate` | `TRANSITIVE_DEPENDENCY`, `FALSE_POSITIVE_OR_NON_EXPLOITABLE` for this deployment profile | Non-blocking residual |

There are no remaining `Critical` or `High` production vulnerabilities.

## Validation After Changes

| Check | Result |
| --- | --- |
| `npm run typecheck` | `PASS` |
| `npm run build` | `PASS` |
| `npm run phase7.5:auth` | `PASS` |
| `npm run production:verify-mail` | `PASS` |
| `npm run production:verify-socket` | `PASS` |
| `node scripts/phase-7-5/browser-smoke.mjs` | `PASS` |

## Outcome

The dependency blocker is closed. Production vulnerabilities are reduced to `0 critical`, `0 high`, and `2 moderate` residual advisories tied to Next’s bundled `postcss` copy, with no actionable safe upgrade path short of an invalid framework downgrade.
