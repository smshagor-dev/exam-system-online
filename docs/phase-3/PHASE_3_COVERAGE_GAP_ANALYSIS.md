# Phase 3 Coverage Gap Analysis

Initial self-reported status: PASS

Verified status before this evidence pass: BLOCKED

Assessment date: 2026-07-11

Coverage status values:

- `COVERED`
- `PARTIALLY_COVERED`
- `NOT_COVERED`

## Summary

The current Phase 3 implementation is substantial and the existing validation commands pass, but the evidence set is not yet broad enough to support a defensible final PASS against the stricter sign-off brief. The main gaps are incomplete invalid-path automation, partial lifecycle integrity verification, incomplete full-role API authorization proof, and a browser/API/manual matrix that is well below the required volume and scenario breadth.

## Requirement Matrix

| Requirement ID | Requirement | Current coverage | Evidence location | Missing coverage | Required action | Final status |
| --- | --- | --- | --- | --- | --- | --- |
| `ENR-001` | Create first active enrollment | Automated and browser covered | `scripts/phase-3/lifecycle-tests.ts`, `docs/phase-3/evidence/enrollment-create-grace.png` | More data-state assertions | Expand automated DB-state checks | `PARTIALLY_COVERED` |
| `ENR-002` | Reject second active enrollment | Automated and browser covered | `scripts/phase-3/lifecycle-tests.ts`, `docs/phase-3/evidence/enrollment-reject-second-active.png` | Rejection state verification | Assert no partial records after rejection | `PARTIALLY_COVERED` |
| `ENR-003` | Create BSc enrollment | Automated covered | `scripts/phase-3/lifecycle-tests.ts` | Separate explicit reporting | Split into structured enrollment cases | `PARTIALLY_COVERED` |
| `ENR-004` | Create MSc enrollment | Not covered | n/a | Entire scenario missing | Add postgraduate fixture and test | `NOT_COVERED` |
| `ENR-005` | Reject missing student | Not covered | n/a | Entire scenario missing | Add direct service/API rejection test | `NOT_COVERED` |
| `ENR-006` | Reject missing program | Partially covered by invalid context | `scripts/phase-3/lifecycle-tests.ts` | Explicit missing-program case | Add direct rejection test | `PARTIALLY_COVERED` |
| `ENR-007` | Reject inactive program | Not covered | n/a | No inactive program check proven | Add validation test if supported or document defect | `NOT_COVERED` |
| `ENR-008` | Reject invalid session | Not covered | n/a | Entire scenario missing | Add rejection test | `NOT_COVERED` |
| `ENR-009` | Reject invalid program year | Covered through context mismatch | `scripts/phase-3/lifecycle-tests.ts` | Needs explicit reporting | Add named case | `PARTIALLY_COVERED` |
| `ENR-010` | Reject invalid semester | Not covered | n/a | Entire scenario missing | Add rejection test | `NOT_COVERED` |
| `ENR-011` | Reject unsupported department language | Automated covered | `scripts/phase-3/lifecycle-tests.ts` | Stronger DB-state assertions | Add post-rejection state verification | `PARTIALLY_COVERED` |
| `ENR-012` | Reject wrong group | Automated covered | `scripts/phase-3/lifecycle-tests.ts` | Separate wrong-session/wrong-program variants | Add targeted cases | `PARTIALLY_COVERED` |
| `ENR-013` | Reject group from another program | Implicitly covered | `scripts/phase-3/lifecycle-tests.ts` | Needs explicit isolated case | Add targeted case | `PARTIALLY_COVERED` |
| `ENR-014` | Reject group from another session | Not covered | n/a | Entire scenario missing | Add targeted case | `NOT_COVERED` |
| `ENR-015` | Reject offering outside enrollment scope | Not covered | n/a | No offering-scope proof | Add service/API or verifier coverage | `NOT_COVERED` |
| `ENR-016` | Reject cross-department enrollment | Not covered | n/a | Entire scenario missing | Add direct rejection test | `NOT_COVERED` |
| `ENR-017` | Append academic history on creation | Automated covered | `scripts/phase-3/lifecycle-tests.ts` | Needs timestamp/context assertions | Expand assertions | `PARTIALLY_COVERED` |
| `ENR-018` | Preserve legacy StudentSubject compatibility | Automated covered | `scripts/phase-3/lifecycle-tests.ts` | Needs richer conflict coverage | Expand legacy test set | `PARTIALLY_COVERED` |
| `ENR-019` | Prefer active enrollment over legacy scope | Partially covered | `scripts/phase-3/lifecycle-tests.ts` | Negative conflict checks missing | Add explicit precedence/conflict cases | `PARTIALLY_COVERED` |
| `PRO-001` | Promote eligible student | Automated and browser covered | `scripts/phase-3/lifecycle-tests.ts`, `docs/phase-3/evidence/promotion-success-dave.png` | Broader assertions needed | Verify source closure/target activation/history | `PARTIALLY_COVERED` |
| `PRO-002` | Reject unpublished results | Automated and browser covered | `scripts/phase-3/lifecycle-tests.ts`, `docs/phase-3/evidence/promotion-reject-bob.png` | More state assertions | Verify no partial promotion state | `PARTIALLY_COVERED` |
| `PRO-003` | Reject missing required curriculum | Not covered | n/a | Entire scenario missing | Add direct rejection test | `NOT_COVERED` |
| `PRO-004` | Reject incomplete semester | Not covered | n/a | Entire scenario missing | Add direct rejection test | `NOT_COVERED` |
| `PRO-005` | Reject invalid next semester | Not covered | n/a | Entire scenario missing | Add direct rejection test | `NOT_COVERED` |
| `PRO-006` | Reject invalid next program year | Not covered | n/a | Entire scenario missing | Add direct rejection test | `NOT_COVERED` |
| `PRO-007` | Reject missing next group | Not covered | n/a | Entire scenario missing | Add direct rejection test | `NOT_COVERED` |
| `PRO-008` | Reject student on leave | Not covered | n/a | Entire scenario missing | Add direct rejection test | `NOT_COVERED` |
| `PRO-009` | Reject transferred student with stale enrollment | Not covered | n/a | Entire scenario missing | Add direct rejection test | `NOT_COVERED` |
| `PRO-010` | Reject dropped student | Not covered | n/a | Entire scenario missing | Add direct rejection test | `NOT_COVERED` |
| `PRO-011` | Reject graduated student | Not covered | n/a | Entire scenario missing | Add direct rejection test | `NOT_COVERED` |
| `PRO-012` | Reject promotion beyond program duration | Partially covered by logic, not test | `src/lib/student-lifecycle.ts` | No execution evidence | Add automated test | `PARTIALLY_COVERED` |
| `PRO-013` | Reject duplicate promotion | Not covered | n/a | Entire scenario missing | Add automated test | `NOT_COVERED` |
| `PRO-014` | Reject conflicting active enrollment | Not covered | n/a | Entire scenario missing | Add automated test | `NOT_COVERED` |
| `PRO-015` | Manual override requires reason | Not covered | n/a | Override succeeds without asserted reason policy | Add automated test and fix if needed | `NOT_COVERED` |
| `PRO-016` | Manual override records actor | Partially covered in service logic only | `src/lib/student-lifecycle.ts` | No verification proof | Add DB assertions | `PARTIALLY_COVERED` |
| `PRO-017` | Manual override records failed eligibility checks | Partially covered in audit payload only | `src/lib/student-lifecycle.ts` | No verification proof | Add DB assertions | `PARTIALLY_COVERED` |
| `PRO-018` | Promotion closes prior academic context safely | Not covered | n/a | Source close not explicitly asserted | Add DB assertions | `NOT_COVERED` |
| `PRO-019` | Promotion updates active enrollment | Partially covered | `scripts/phase-3/lifecycle-tests.ts` | Needs stronger assertions | Expand automated tests | `PARTIALLY_COVERED` |
| `PRO-020` | Promotion appends history | Automated covered | `scripts/phase-3/lifecycle-tests.ts` | More event-field validation needed | Expand assertions | `PARTIALLY_COVERED` |
| `PRO-021` | Promotion preserves legacy compatibility | Not covered | n/a | Entire scenario missing | Add legacy-sync assertions | `NOT_COVERED` |
| `TRN-001` | Valid group transfer | Automated and browser covered | `scripts/phase-3/lifecycle-tests.ts`, `docs/phase-3/evidence/transfer-success-bob.png` | Stronger source/target assertions | Expand test state checks | `PARTIALLY_COVERED` |
| `TRN-002` | Valid language-section transfer | Not covered | n/a | Entire scenario missing | Add automated test | `NOT_COVERED` |
| `TRN-003` | Valid department transfer | Not covered | n/a | Entire scenario missing | Add automated test | `NOT_COVERED` |
| `TRN-004` | Valid program transfer | Not covered | n/a | Entire scenario missing | Add automated test | `NOT_COVERED` |
| `TRN-005` | Reject same source and target | Partially covered by transfer-type guards | `src/lib/student-lifecycle.ts` | No execution evidence | Add automated test | `PARTIALLY_COVERED` |
| `TRN-006` | Reject inactive target program | Not covered | n/a | Entire scenario missing | Add test or defect doc | `NOT_COVERED` |
| `TRN-007` | Reject unsupported target language | Automated covered | `scripts/phase-3/lifecycle-tests.ts` | State assertions missing | Expand automated checks | `PARTIALLY_COVERED` |
| `TRN-008` | Reject invalid target group | Not covered | n/a | Entire scenario missing | Add automated test | `NOT_COVERED` |
| `TRN-009` | Reject invalid target year | Not covered | n/a | Entire scenario missing | Add automated test | `NOT_COVERED` |
| `TRN-010` | Reject invalid target semester | Not covered | n/a | Entire scenario missing | Add automated test | `NOT_COVERED` |
| `TRN-011` | Reject target group from another session | Not covered | n/a | Entire scenario missing | Add automated test | `NOT_COVERED` |
| `TRN-012` | Reject transfer for graduated student | Not covered | n/a | Entire scenario missing | Add automated test | `NOT_COVERED` |
| `TRN-013` | Reject transfer for dropped student | Not covered | n/a | Entire scenario missing | Add automated test | `NOT_COVERED` |
| `TRN-014` | Reject duplicate active enrollment | Partially covered by service logic | `src/lib/student-lifecycle.ts` | No execution evidence | Add automated test | `PARTIALLY_COVERED` |
| `TRN-015` | Close source enrollment correctly | Not covered | n/a | No explicit state check | Add automated assertions | `NOT_COVERED` |
| `TRN-016` | Create target enrollment correctly | Partially covered | `scripts/phase-3/lifecycle-tests.ts` | Needs fuller state checks | Expand automated assertions | `PARTIALLY_COVERED` |
| `TRN-017` | Append transfer history | Not covered | n/a | No explicit history validation | Add automated assertions | `NOT_COVERED` |
| `TRN-018` | Preserve previous academic context | Not covered | n/a | No prior-context field assertions | Add automated assertions | `NOT_COVERED` |
| `TRN-019` | Synchronize legacy StudentSubject safely | Not covered | n/a | Entire scenario missing | Add automated assertions | `NOT_COVERED` |
| `LEV-001` | Create medical leave | Automated and browser covered | `scripts/phase-3/lifecycle-tests.ts`, `docs/phase-3/evidence/leave-success-grace.png` | Stronger state assertions | Expand automated test | `PARTIALLY_COVERED` |
| `LEV-002` | Create academic leave | Not covered | n/a | Entire scenario missing | Add automated test | `NOT_COVERED` |
| `LEV-003` | Create temporary leave | Not covered | n/a | Entire scenario missing | Add automated test | `NOT_COVERED` |
| `LEV-004` | Reject leave for inactive enrollment | Partially covered with grouped rejection | `scripts/phase-3/lifecycle-tests.ts` | Needs isolated case | Add automated test | `PARTIALLY_COVERED` |
| `LEV-005` | Reject leave for graduated student | Not covered | n/a | Entire scenario missing | Add automated test | `NOT_COVERED` |
| `LEV-006` | Reject leave for dropped student | Not covered | n/a | Entire scenario missing | Add automated test | `NOT_COVERED` |
| `LEV-007` | Reject overlapping open leave | Automated covered | `scripts/phase-3/lifecycle-tests.ts` | Isolated data-state assertions missing | Expand automated test | `PARTIALLY_COVERED` |
| `LEV-008` | Reject end date before start date | Partially covered by service logic | `src/lib/student-lifecycle.ts` | No execution evidence | Add automated test | `PARTIALLY_COVERED` |
| `LEV-009` | Reject missing reason where required | Not covered | n/a | Entire scenario missing | Add API/schema coverage or document unsupported rule | `NOT_COVERED` |
| `LEV-010` | Update enrollment state | Partially covered | `scripts/phase-3/lifecycle-tests.ts` | Needs explicit assertions | Expand automated test | `PARTIALLY_COVERED` |
| `LEV-011` | Append leave history | Not covered | n/a | Entire scenario missing | Add history assertions | `NOT_COVERED` |
| `LEV-012` | Restrict exam eligibility during leave | Not covered | n/a | Entire scenario missing | Add eligibility regression case | `NOT_COVERED` |
| `LEV-013` | Preserve prior academic context | Not covered | n/a | Entire scenario missing | Add history/context assertions | `NOT_COVERED` |
| `REA-001` | Readmit student from approved leave | Automated and browser covered | `scripts/phase-3/lifecycle-tests.ts`, `docs/phase-3/evidence/readmission-success-grace.png` | Stronger state/history assertions | Expand automated test | `PARTIALLY_COVERED` |
| `REA-002` | Readmit student to original context | Not covered | n/a | Entire scenario missing | Add automated test | `NOT_COVERED` |
| `REA-003` | Readmit student to validated new context | Partially covered | `scripts/phase-3/lifecycle-tests.ts` | Needs isolated scenario reporting | Add explicit test | `PARTIALLY_COVERED` |
| `REA-004` | Reject student already active | Automated covered | `scripts/phase-3/lifecycle-tests.ts` | State assertions missing | Expand automated checks | `PARTIALLY_COVERED` |
| `REA-005` | Reject without valid leave/inactive state | Not covered | n/a | Entire scenario missing | Add automated test | `NOT_COVERED` |
| `REA-006` | Reject after graduation | Partially covered by service logic | `src/lib/student-lifecycle.ts` | No execution evidence | Add automated test | `PARTIALLY_COVERED` |
| `REA-007` | Reject inactive target program | Not covered | n/a | Entire scenario missing | Add test or defect doc | `NOT_COVERED` |
| `REA-008` | Reject invalid session | Not covered | n/a | Entire scenario missing | Add automated test | `NOT_COVERED` |
| `REA-009` | Reject invalid year | Not covered | n/a | Entire scenario missing | Add automated test | `NOT_COVERED` |
| `REA-010` | Reject invalid semester | Not covered | n/a | Entire scenario missing | Add automated test | `NOT_COVERED` |
| `REA-011` | Reject invalid group | Not covered | n/a | Entire scenario missing | Add automated test | `NOT_COVERED` |
| `REA-012` | Close leave record | Partially covered by service logic | `src/lib/student-lifecycle.ts` | No execution evidence | Add automated assertions | `PARTIALLY_COVERED` |
| `REA-013` | Reactivate or create correct enrollment | Partially covered | `scripts/phase-3/lifecycle-tests.ts` | Needs more assertions | Expand automated test | `PARTIALLY_COVERED` |
| `REA-014` | Append readmission history | Not covered | n/a | Entire scenario missing | Add history assertions | `NOT_COVERED` |
| `REA-015` | Restore exam eligibility where valid | Not covered | n/a | Entire scenario missing | Add eligibility regression case | `NOT_COVERED` |
| `GRD-001` | Graduate eligible BSc student | Automated and browser covered | `scripts/phase-3/lifecycle-tests.ts`, `docs/phase-3/evidence/graduation-success-hannah.png` | Stronger state/history assertions | Expand automated test | `PARTIALLY_COVERED` |
| `GRD-002` | Graduate eligible MSc student | Not covered | n/a | Entire scenario missing | Add postgraduate fixture and test | `NOT_COVERED` |
| `GRD-003` | Reject incomplete curriculum | Not covered | n/a | Entire scenario missing | Add automated test | `NOT_COVERED` |
| `GRD-004` | Reject unpublished results | Automated and browser covered | `scripts/phase-3/lifecycle-tests.ts`, `docs/phase-3/evidence/graduation-reject-frank.png` | Stronger state assertions | Expand automated test | `PARTIALLY_COVERED` |
| `GRD-005` | Reject missing final program year | Partially covered by logic | `src/lib/student-lifecycle.ts` | No execution evidence | Add automated test | `PARTIALLY_COVERED` |
| `GRD-006` | Reject student on active leave | Not covered | n/a | Entire scenario missing | Add automated test | `NOT_COVERED` |
| `GRD-007` | Reject dropped student | Not covered | n/a | Entire scenario missing | Add automated test | `NOT_COVERED` |
| `GRD-008` | Reject duplicate graduation | Automated covered | `scripts/phase-3/lifecycle-tests.ts` | State assertions missing | Expand automated test | `PARTIALLY_COVERED` |
| `GRD-009` | Reject duplicate certificate number | Not covered | n/a | Entire scenario missing | Add automated test if schema supports uniqueness | `NOT_COVERED` |
| `GRD-010` | Reject invalid CGPA range | Not covered | n/a | Entire scenario missing | Add validation test or defect doc | `NOT_COVERED` |
| `GRD-011` | Reject graduation date before enrollment | Not covered | n/a | Entire scenario missing | Add validation test or defect doc | `NOT_COVERED` |
| `GRD-012` | Close active enrollment | Partially covered | `scripts/phase-3/lifecycle-tests.ts` | Needs stronger assertions | Expand automated test | `PARTIALLY_COVERED` |
| `GRD-013` | Set graduation status | Not covered | n/a | No explicit status assertion | Add automated test | `NOT_COVERED` |
| `GRD-014` | Create graduation record | Partially covered | `scripts/phase-3/lifecycle-tests.ts` | Needs stronger assertions | Expand automated test | `PARTIALLY_COVERED` |
| `GRD-015` | Append graduation history | Not covered | n/a | Entire scenario missing | Add history assertions | `NOT_COVERED` |
| `GRD-016` | Remove new exam eligibility | Automated covered | `scripts/phase-3/lifecycle-tests.ts` | Needs broader path coverage | Expand eligibility suite | `PARTIALLY_COVERED` |
| `GRD-017` | Keep historical results accessible | Not covered | n/a | Entire scenario missing | Add API/page proof | `NOT_COVERED` |
| `GRD-018` | Student can view graduation history | Partially covered through student history page | `docs/phase-3/evidence/student-history-grace.png` | No graduation-specific student-history proof | Add browser/API case | `PARTIALLY_COVERED` |
| `AUTH-001` | Full lifecycle API matrix by role | Partially covered | `docs/phase-3/PHASE_3_BROWSER_SMOKE_MATRIX.md` | Only a few denial probes recorded | Add direct API authorization matrix | `PARTIALLY_COVERED` |
| `AUTH-002` | Super Admin allowed | Not covered | n/a | Entire matrix missing | Add direct API tests | `NOT_COVERED` |
| `AUTH-003` | Department Admin own-scope allowed | Partially covered through UI/browser flows | `docs/phase-3/evidence/*.png` | Direct API evidence missing | Add direct API tests | `PARTIALLY_COVERED` |
| `AUTH-004` | Department Admin cross-scope denied | Partially covered | `docs/phase-3/evidence/auth-eee-cross-scope.png` | Matrix incomplete across endpoints/methods | Add direct API tests | `PARTIALLY_COVERED` |
| `AUTH-005` | Teacher write denied | Partially covered | `docs/phase-3/evidence/auth-teacher-write-denied.png` | Matrix incomplete across endpoints/methods | Add direct API tests | `PARTIALLY_COVERED` |
| `AUTH-006` | Student write denied | Partially covered | `docs/phase-3/evidence/auth-student-write-denied.png` | Matrix incomplete across endpoints/methods | Add direct API tests | `PARTIALLY_COVERED` |
| `AUTH-007` | Student own history allowed | Partially covered | `docs/phase-3/evidence/student-history-grace.png` | API and foreign-history denial missing | Add direct API/browser tests | `PARTIALLY_COVERED` |
| `AUTH-008` | Unauthenticated denied | Partially covered | `docs/phase-3/PHASE_3_BROWSER_SMOKE_MATRIX.md` | Only one endpoint covered | Add direct API tests | `PARTIALLY_COVERED` |
| `LEG-001` | Legacy-only StudentSubject functional | Automated covered | `scripts/phase-3/lifecycle-tests.ts` | More surfaces missing | Expand legacy compatibility suite | `PARTIALLY_COVERED` |
| `LEG-002` | Legacy-only student exam list works | Not covered | n/a | Entire scenario missing | Add exam/API proof | `NOT_COVERED` |
| `LEG-003` | Legacy fallback works with no active enrollment | Automated covered | `scripts/phase-3/lifecycle-tests.ts` | More path coverage needed | Expand eligibility suite | `PARTIALLY_COVERED` |
| `LEG-004` | Active enrollment takes precedence | Partially covered | `scripts/phase-3/lifecycle-tests.ts` | Conflict policy not proven | Add targeted tests | `PARTIALLY_COVERED` |
| `LEG-005` | Conflicting active and legacy scope detected | Not covered | n/a | Entire scenario missing | Add targeted tests and verifier checks | `NOT_COVERED` |
| `LEG-006` | Legacy TeacherAssignment usable | Not covered | n/a | Entire scenario missing | Add teacher-assignment coverage | `NOT_COVERED` |
| `LEG-007` | Legacy question scope accessible | Not covered | n/a | Entire scenario missing | Add browser/API proof | `NOT_COVERED` |
| `LEG-008` | Legacy exam accessible | Not covered | n/a | Entire scenario missing | Add browser/API proof | `NOT_COVERED` |
| `LEG-009` | Legacy result accessible | Not covered | n/a | Entire scenario missing | Add browser/API proof | `NOT_COVERED` |
| `LEG-010` | Legacy coursework accessible | Not covered | n/a | Entire scenario missing | Add browser/API proof | `NOT_COVERED` |
| `LEG-011` | Legacy ebook accessible | Not covered | n/a | Entire scenario missing | Add browser/API proof | `NOT_COVERED` |
| `ELG-001` | Matching active enrollment allowed | Partially covered | `scripts/phase-3/lifecycle-tests.ts` | Missing route-level coverage | Add full exam-path coverage | `PARTIALLY_COVERED` |
| `ELG-002` | Matching legacy fallback allowed | Partially covered | `scripts/phase-3/lifecycle-tests.ts` | Missing route-level coverage | Add full exam-path coverage | `PARTIALLY_COVERED` |
| `ELG-003` | Wrong department denied | Not covered | n/a | Entire scenario missing | Add full exam-path coverage | `NOT_COVERED` |
| `ELG-004` | Wrong program denied | Not covered | n/a | Entire scenario missing | Add full exam-path coverage | `NOT_COVERED` |
| `ELG-005` | Wrong language denied | Not covered | n/a | Entire scenario missing | Add full exam-path coverage | `NOT_COVERED` |
| `ELG-006` | Wrong year denied | Not covered | n/a | Entire scenario missing | Add full exam-path coverage | `NOT_COVERED` |
| `ELG-007` | Wrong semester denied | Not covered | n/a | Entire scenario missing | Add full exam-path coverage | `NOT_COVERED` |
| `ELG-008` | Wrong group denied | Not covered | n/a | Entire scenario missing | Add full exam-path coverage | `NOT_COVERED` |
| `ELG-009` | Wrong subject denied | Not covered | n/a | Entire scenario missing | Add full exam-path coverage | `NOT_COVERED` |
| `ELG-010` | Student on leave denied | Not covered | n/a | Entire scenario missing | Add full exam-path coverage | `NOT_COVERED` |
| `ELG-011` | Transferred student old scope denied | Not covered | n/a | Entire scenario missing | Add full exam-path coverage | `NOT_COVERED` |
| `ELG-012` | Transferred student target scope allowed | Not covered | n/a | Entire scenario missing | Add full exam-path coverage | `NOT_COVERED` |
| `ELG-013` | Graduated student new exam attempt denied | Partially covered | `scripts/phase-3/lifecycle-tests.ts` | Missing route-level coverage | Add full exam-path coverage | `PARTIALLY_COVERED` |
| `ELG-014` | Dropped student denied | Not covered | n/a | Entire scenario missing | Add full exam-path coverage | `NOT_COVERED` |
| `ELG-015` | Inactive enrollment denied | Not covered | n/a | Entire scenario missing | Add full exam-path coverage | `NOT_COVERED` |
| `ELG-016` | Conflicting enrollment/legacy scope handled safely | Not covered | n/a | Entire scenario missing | Add targeted tests and verifier checks | `NOT_COVERED` |
| `INT-001` | Verifier checks full enrollment invariants | Partially covered | `scripts/phase-3/verify-student-lifecycle.ts` | Several context and relation checks missing | Expand verifier | `PARTIALLY_COVERED` |
| `INT-002` | Verifier checks full history invariants | Partially covered | `scripts/phase-3/verify-student-lifecycle.ts` | Ordering/gap/transition coverage missing | Expand verifier | `PARTIALLY_COVERED` |
| `INT-003` | Verifier checks full promotion invariants | Partially covered | `scripts/phase-3/verify-student-lifecycle.ts` | Target-context/override checks missing | Expand verifier | `PARTIALLY_COVERED` |
| `INT-004` | Verifier checks full transfer invariants | Partially covered | `scripts/phase-3/verify-student-lifecycle.ts` | Source-target relation checks missing | Expand verifier | `PARTIALLY_COVERED` |
| `INT-005` | Verifier checks full leave invariants | Partially covered | `scripts/phase-3/verify-student-lifecycle.ts` | Date/state linkage missing | Expand verifier | `PARTIALLY_COVERED` |
| `INT-006` | Verifier checks full readmission invariants | Not covered | n/a | No dedicated readmission verification | Expand verifier | `NOT_COVERED` |
| `INT-007` | Verifier checks full graduation invariants | Partially covered | `scripts/phase-3/verify-student-lifecycle.ts` | Program/date/certificate/history checks missing | Expand verifier | `PARTIALLY_COVERED` |
| `INT-008` | Verifier checks legacy/new consistency | Not covered | n/a | No conflict/exception classification | Expand verifier | `NOT_COVERED` |
| `EVD-001` | Browser/API/manual matrix reaches 100+ cases | Not covered | `docs/phase-3/PHASE_3_BROWSER_SMOKE_MATRIX.md` | Only 16 recorded cases | Expand QA harness and matrix | `NOT_COVERED` |
| `EVD-002` | Authorization matrix document exists | Not covered | n/a | Entire artifact missing | Create matrix with executed results | `NOT_COVERED` |
| `EVD-003` | Defect report exists | Not covered | n/a | Entire artifact missing | Create report during fixes | `NOT_COVERED` |
| `EVD-004` | Test data safety report exists | Not covered | n/a | Entire artifact missing | Create data-safety report | `NOT_COVERED` |
| `EVD-005` | Evidence index exists | Not covered | n/a | Entire artifact missing | Create evidence index | `NOT_COVERED` |

## Priority Gaps

1. Expand `phase3:test` into a structured suite with substantially broader invalid-path and state-verification coverage.
2. Expand `phase3:verify` so it checks the full lifecycle invariants expected by the sign-off brief, including legacy/new conflict reporting.
3. Add direct API authorization coverage for every relevant role and lifecycle endpoint/method combination.
4. Increase the browser/API/manual evidence count from 16 to a much broader matrix with real artifacts.
5. Update all Phase 3 reports so they reflect actual executed evidence rather than implementation completeness alone.

## Current Blocking Conclusion

Current Phase 3 status remains `BLOCKED` until the missing verification and evidence actions above are completed and executed successfully.
