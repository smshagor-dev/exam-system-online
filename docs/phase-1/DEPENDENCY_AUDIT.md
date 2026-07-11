# Dependency Audit

## Framework and core packages
- `next@16.2.10`
- `react@19.2.0`
- `react-dom@19.2.0`
- `eslint-config-next@16.2.10`
- `next-auth@5.0.0-beta.31`
- `@auth/prisma-adapter@2.11.2`
- `prisma@5.22.0`
- `@prisma/client@5.22.0`
- `socket.io@4.8.3`
- `socket.io-client@4.8.3`
- `nodemailer@7.0.13`

## npm outdated summary
- Latest stable Next.js 16.x target was already installed at baseline.
- No framework package upgrades were required during this pass.
- Newer major versions exist for some packages, but they were intentionally deferred because they were outside the Phase 1 stabilization scope.

## npm audit summary
- High:
  - `nodemailer`
    - inherited through `next-auth` / `@auth/core`
    - audit output reported no safe non-breaking fix in the current chain
  - `ws`
    - inherited through Socket.IO engine packages
    - `npm audit fix` is available, but should be validated carefully because it changes transitive runtime behavior
- Moderate:
  - `postcss`
    - inherited through Next.js
    - `npm audit fix --force` would require a breaking downgrade path and is not appropriate for this stabilization pass

## Classification
- Required for Next.js 16:
  - None during this pass, because the repo already matched latest stable `16.2.10`.
- Security-related:
  - Audit findings reviewed and documented.
  - No safe non-breaking package changes were applied in this pass.
- Compatibility-related:
  - Validation scripts, API typing, and shutdown paths were stabilized.
- Optional and deferred:
  - Major package upgrades outside the current stabilization goal.

## Conclusion
Dependency state is acceptable for the Phase 1 PASS baseline because build, typecheck, lint, Prisma validation, Prisma generate, and QA all pass. The unresolved advisories remain a release-planning concern, not a Phase 1 blocker.
