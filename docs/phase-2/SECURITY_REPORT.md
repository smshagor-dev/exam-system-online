# Security Report

## Server-Side Controls

- Department-admin restrictions continue to be enforced server-side through managed department scope.
- Global mutation paths for degree levels and academic sessions remain limited to super admins.
- Academic offering validation is centralized in `src/lib/academic-scope.ts`.
- Group normalization changes are now validated server-side before create/update.

## Compatibility Risk Notes

- Legacy tuple fields still exist and remain a fallback path.
- Because the accepted unresolved legacy records remain legacy-only, some authorization and eligibility flows still depend on the old scope tuple.

## Current Security Finding

- No blocking authorization regression was detected in automated checks or the targeted Phase 2 runtime script.
- Full manual adversarial role testing is still required before calling the phase complete.
