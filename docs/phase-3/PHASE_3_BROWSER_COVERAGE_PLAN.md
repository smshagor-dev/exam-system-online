# Phase 3 Browser Coverage Plan

Status note on 2026-07-11:

- This file remains the original execution plan.
- Per-case `PENDING` markers below are superseded by the final execution artifacts in `docs/phase-3/evidence/coverage-execution-summary.json`.
- Final grouped coverage totals are `175 PASS`, `0 FAIL`, `0 BLOCKED`.

Status: IN_PROGRESS

Target planned cases: 183

Current recorded baseline on 2026-07-11:

- Executed PASS cases already recorded: 21
- Enrollment: 3
- Promotion: 2
- Transfer: 1
- Leave: 1
- Readmission: 1
- Graduation: 2
- Academic history/timeline: 2
- Role/isolation/auth browser-visible: 5
- Legacy compatibility: 0
- Exam eligibility regression: 4
- General UI/error handling: 0

## Coverage Inventory

Already executed:

- Enrollment open/create/duplicate/timeline baseline
- Promotion valid/reject unpublished baseline
- Transfer valid group transfer baseline
- Leave valid medical leave baseline
- Readmission valid readmission baseline
- Graduation valid/reject unpublished baseline
- Student own history visible
- Teacher/student/anonymous/cross-department denial baseline
- DEF-003 regression browser checks for transferred, graduated, and leave-state students

Missing positive paths:

- Valid MSc enrollment browser/API evidence
- Valid MSc promotion evidence
- Valid language/program/department transfer evidence
- Academic leave and temporary leave evidence
- Readmission-to-new-context evidence
- Valid MSc graduation evidence
- Legacy-only browser-visible record flows

Missing negative paths:

- Enrollment inactive-context and manipulated-request cases
- Promotion invalid next-context, override, duplicate, leave, dropped, graduated cases
- Transfer inactive/invalid target cases
- Leave inactive/graduated/dropped/missing-reason cases
- Readmission invalid target context cases
- Graduation duplicate/invalid-cgpa/duplicate-certificate/date cases
- Broader exam-eligibility mismatch matrix

Missing role tests:

- Super admin browser-visible lifecycle access
- Department B inverse-scope browser checks
- Student foreign-history denial
- Unauthenticated protected-page redirects
- Secure denial messaging on lifecycle pages

Missing console/network evidence:

- Consolidated console/network captures for critical enrollment, promotion, transfer, leave, readmission, graduation, legacy, and exam flows

Missing legacy tests:

- Legacy-only profile, exam, result, coursework, ebook, and teacher-assignment visibility

Missing exam-regression tests:

- Wrong program/language/year/semester/group/subject mismatches
- Invalid-scope socket join and answer-save denial
- Historical result visibility after graduation

## Planned Cases

Legend:

- `EXECUTED` means evidence already exists in the repository.
- `PENDING` means planned but not yet executed in the expanded matrix.

### Enrollment (22 planned, minimum 18)

| Test ID | Category | Role | Page/API | Precondition | Expected result | Evidence type | Execution status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `P3-ENR-001` | Enrollment | Department Admin | `/admin/enrollments` | Authenticated department admin | Enrollment list loads | Screenshot + console/network | PENDING |
| `P3-ENR-002` | Enrollment | Department Admin | `/api/admin/enrollments?search=Grace` | Existing seeded student | Search by student name narrows results | Network + database | PENDING |
| `P3-ENR-003` | Enrollment | Department Admin | `/api/admin/enrollments?search=grace@student.test` | Existing seeded student | Search by student email narrows results | Network + database | PENDING |
| `P3-ENR-004` | Enrollment | Department Admin | `/api/admin/enrollments?departmentId=...` | CSE scope fixture | Department filter only returns matching records | Network + database | PENDING |
| `P3-ENR-005` | Enrollment | Department Admin | `/api/admin/enrollments?programId=...` | BSc program fixture | Program filter only returns matching records | Network + database | PENDING |
| `P3-ENR-006` | Enrollment | Department Admin | `/api/admin/enrollments` | Fresh unenrolled QA student | Valid BSc enrollment created | Network + database | PENDING |
| `P3-ENR-007` | Enrollment | Department Admin | `/api/admin/enrollments` | Fresh unenrolled QA student | Valid MSc enrollment created | Network + database | PENDING |
| `P3-ENR-008` | Enrollment | Department Admin | `/api/admin/enrollments` | Student already has active enrollment | Second active enrollment rejected | Network + database | EXECUTED |
| `P3-ENR-009` | Enrollment | Department Admin | `/api/admin/enrollments` | Fake student id | Missing student rejected | Network + database | PENDING |
| `P3-ENR-010` | Enrollment | Department Admin | `/api/admin/enrollments` | Manipulated invalid program id | Missing program rejected | Network + database | PENDING |
| `P3-ENR-011` | Enrollment | Department Admin | `/api/admin/enrollments` | Inactive program fixture | Inactive program rejected | Network + database | PENDING |
| `P3-ENR-012` | Enrollment | Department Admin | `/api/admin/enrollments` | Invalid or inactive session fixture | Invalid academic session rejected | Network + database | PENDING |
| `P3-ENR-013` | Enrollment | Department Admin | `/api/admin/enrollments` | Unsupported language fixture | Unsupported language rejected | Network + database | PENDING |
| `P3-ENR-014` | Enrollment | Department Admin | `/api/admin/enrollments` | Group from wrong program/department | Wrong group rejected | Network + database | PENDING |
| `P3-ENR-015` | Enrollment | Department Admin | `/api/admin/enrollments` | Mismatched semester/program semester | Wrong semester rejected | Network + database | PENDING |
| `P3-ENR-016` | Enrollment | Department Admin | `/api/admin/enrollments` | Cross-department student fixture | Cross-department context rejected | Network + database | PENDING |
| `P3-ENR-017` | Enrollment | Department Admin | `/api/admin/enrollments/[studentId]/timeline` | Newly created enrollment exists | Timeline contains enrollment event | Network + database | PENDING |
| `P3-ENR-018` | Enrollment | Department Admin | `/admin/enrollments` | Enrollment modal open | Parent select change clears invalid child state | Screenshot + browser log | PENDING |
| `P3-ENR-019` | Enrollment | Department Admin | `/api/admin/enrollments/[studentId]` | Existing enrollment fixture | Safe enrollment field update succeeds | Network + database | PENDING |
| `P3-ENR-020` | Enrollment | Department Admin | `/api/admin/enrollments/[studentId]` | Existing active enrollment fixture | Deactivate safely closes enrollment | Network + database | PENDING |
| `P3-ENR-021` | Enrollment | Department Admin | `/api/admin/enrollments` | Concurrent duplicate submit probe | Duplicate submit protection prevents double-active state | Network + database | PENDING |
| `P3-ENR-022` | Enrollment | Department Admin | `/api/admin/enrollments` and `/api/admin/enrollments/[studentId]` | Manipulated request body | Server validation rejects malformed lifecycle write | Network + database | PENDING |

### Promotion (23 planned, minimum 18)

| Test ID | Category | Role | Page/API | Precondition | Expected result | Evidence type | Execution status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `P3-PRO-001` | Promotion | Department Admin | `/admin/promotions` | Authenticated department admin | Promotion page loads | Screenshot + console/network | PENDING |
| `P3-PRO-002` | Promotion | Department Admin | `/admin/promotions` or preview API | Eligible student fixtures exist | Eligible-student filtering works | Screenshot or network | PENDING |
| `P3-PRO-003` | Promotion | Department Admin | `/api/admin/promotions/preview` | Valid target context | Preview shows next academic context | Network + database | PENDING |
| `P3-PRO-004` | Promotion | Department Admin | `/api/admin/promotions` | Eligible BSc student fixture | Valid BSc promotion succeeds | Network + database | PENDING |
| `P3-PRO-005` | Promotion | Department Admin | `/api/admin/promotions` | Eligible MSc student fixture | Valid MSc promotion succeeds | Network + database | PENDING |
| `P3-PRO-006` | Promotion | Department Admin | `/api/admin/promotions` | Unpublished result fixture | Unpublished result rejected | Network + database | EXECUTED |
| `P3-PRO-007` | Promotion | Department Admin | `/api/admin/promotions` | Missing curriculum fixture | Incomplete curriculum rejected | Network + database | PENDING |
| `P3-PRO-008` | Promotion | Department Admin | `/api/admin/promotions` | Missing target group context | Missing next group rejected | Network + database | PENDING |
| `P3-PRO-009` | Promotion | Department Admin | `/api/admin/promotions` | Invalid next semester context | Invalid next semester rejected | Network + database | PENDING |
| `P3-PRO-010` | Promotion | Department Admin | `/api/admin/promotions` | Invalid next year context | Invalid next year rejected | Network + database | PENDING |
| `P3-PRO-011` | Promotion | Department Admin | `/api/admin/promotions` | Beyond-duration target context | Promotion beyond duration rejected | Network + database | PENDING |
| `P3-PRO-012` | Promotion | Department Admin | `/api/admin/promotions` | Student currently on leave | Leave-state student rejected | Network + database | PENDING |
| `P3-PRO-013` | Promotion | Department Admin | `/api/admin/promotions` | Dropped student fixture | Dropped student rejected | Network + database | PENDING |
| `P3-PRO-014` | Promotion | Department Admin | `/api/admin/promotions` | Graduated student fixture | Graduated student rejected | Network + database | PENDING |
| `P3-PRO-015` | Promotion | Department Admin | `/api/admin/promotions` | Student already promoted to target | Duplicate promotion rejected | Network + database | PENDING |
| `P3-PRO-016` | Promotion | Department Admin | `/api/admin/promotions` | Manual override enabled without reason | Override without reason rejected | Network + database | PENDING |
| `P3-PRO-017` | Promotion | Department Admin | `/api/admin/promotions` | Override-eligible blocked student and reason | Authorized override with reason succeeds | Network + database | PENDING |
| `P3-PRO-018` | Promotion | Department Admin | database + timeline | Override action completed | Override actor and reason recorded | Database + network | PENDING |
| `P3-PRO-019` | Promotion | Department Admin | database | Promotion succeeded | Prior enrollment closes | Database | PENDING |
| `P3-PRO-020` | Promotion | Department Admin | database | Promotion succeeded | New active context exists | Database | PENDING |
| `P3-PRO-021` | Promotion | Department Admin | timeline | Promotion succeeded | History event created | Network + database | PENDING |
| `P3-PRO-022` | Promotion | Department Admin | `/api/admin/promotions/preview` | Bulk preview fixture list | Bulk preview returns eligible/blocked counts | Network | PENDING |
| `P3-PRO-023` | Promotion | Department Admin | `/api/admin/promotions/bulk` | Bulk promotion fixture list | Selected bulk promotion runs correctly | Network + database | PENDING |

### Transfer (18 planned, minimum 14)

| Test ID | Category | Role | Page/API | Precondition | Expected result | Evidence type | Execution status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `P3-TRF-001` | Transfer | Department Admin | `/admin/transfers` | Authenticated department admin | Transfer page loads | Screenshot + console/network | PENDING |
| `P3-TRF-002` | Transfer | Department Admin | `/api/admin/enrollments?search=...` | Active transfer fixture exists | Search active student works | Network + database | PENDING |
| `P3-TRF-003` | Transfer | Department Admin | `/api/admin/transfers` | Active BSc transfer fixture | Valid group transfer succeeds | Network + database | PENDING |
| `P3-TRF-004` | Transfer | Department Admin | `/api/admin/transfers` | Language-compatible fixture | Valid language-section transfer succeeds | Network + database | PENDING |
| `P3-TRF-005` | Transfer | Department Admin | `/api/admin/transfers` | Active BSc transfer fixture | Valid program transfer succeeds | Network + database | PENDING |
| `P3-TRF-006` | Transfer | Department Admin | `/api/admin/transfers` | Active BSc transfer fixture | Valid department transfer succeeds | Network + database | PENDING |
| `P3-TRF-007` | Transfer | Department Admin | `/api/admin/transfers` | Same source and target context | Same-source transfer rejected | Network + database | PENDING |
| `P3-TRF-008` | Transfer | Department Admin | `/api/admin/transfers` | Inactive target program fixture | Inactive target program rejected | Network + database | PENDING |
| `P3-TRF-009` | Transfer | Department Admin | `/api/admin/transfers` | Unsupported target language fixture | Unsupported target language rejected | Network + database | PENDING |
| `P3-TRF-010` | Transfer | Department Admin | `/api/admin/transfers` | Invalid target group fixture | Invalid target group rejected | Network + database | PENDING |
| `P3-TRF-011` | Transfer | Department Admin | `/api/admin/transfers` | Invalid semester context | Invalid semester rejected | Network + database | PENDING |
| `P3-TRF-012` | Transfer | Department Admin | `/api/admin/transfers` | Invalid session context | Invalid session rejected | Network + database | PENDING |
| `P3-TRF-013` | Transfer | Department Admin | `/api/admin/transfers` | Graduated student fixture | Graduated student rejected | Network + database | PENDING |
| `P3-TRF-014` | Transfer | Department Admin | `/api/admin/transfers` | Dropped student fixture | Dropped student rejected | Network + database | PENDING |
| `P3-TRF-015` | Transfer | Department Admin | database | Transfer succeeded | Source enrollment closes | Database | PENDING |
| `P3-TRF-016` | Transfer | Department Admin | database | Transfer succeeded | Target enrollment activates | Database | PENDING |
| `P3-TRF-017` | Transfer | Department Admin | timeline | Transfer succeeded | Transfer history event created | Network + database | PENDING |
| `P3-TRF-018` | Transfer | Department Admin | timeline | Transfer succeeded | Previous context preserved in record | Network + database | PENDING |

### Leave (14 planned, minimum 12)

| Test ID | Category | Role | Page/API | Precondition | Expected result | Evidence type | Execution status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `P3-LEV-001` | Leave | Department Admin | `/admin/leaves` | Authenticated department admin | Leave page loads | Screenshot + console/network | PENDING |
| `P3-LEV-002` | Leave | Department Admin | `/api/admin/leaves` | Active student fixture | Medical leave succeeds | Network + database | PENDING |
| `P3-LEV-003` | Leave | Department Admin | `/api/admin/leaves` | Active student fixture | Academic leave succeeds | Network + database | PENDING |
| `P3-LEV-004` | Leave | Department Admin | `/api/admin/leaves` | Active student fixture | Temporary leave succeeds | Network + database | PENDING |
| `P3-LEV-005` | Leave | Department Admin | `/api/admin/leaves` | Inactive/no-active student fixture | Inactive student rejected | Network + database | PENDING |
| `P3-LEV-006` | Leave | Department Admin | `/api/admin/leaves` | Graduated student fixture | Graduated student rejected | Network + database | PENDING |
| `P3-LEV-007` | Leave | Department Admin | `/api/admin/leaves` | Dropped student fixture | Dropped student rejected | Network + database | PENDING |
| `P3-LEV-008` | Leave | Department Admin | `/api/admin/leaves` | Student already on open leave | Overlapping leave rejected | Network + database | PENDING |
| `P3-LEV-009` | Leave | Department Admin | `/api/admin/leaves` | Invalid date range | Invalid date range rejected | Network + database | PENDING |
| `P3-LEV-010` | Leave | Department Admin | `/api/admin/leaves` | Missing reason payload | Missing reason rejected or defect recorded | Network + database | PENDING |
| `P3-LEV-011` | Leave | Department Admin | database | Leave succeeded | Enrollment status changes to leave/inactive | Database | PENDING |
| `P3-LEV-012` | Leave | Student | exam access page/API | Leave fixture exists | Exam access removed | Browser + network | PENDING |
| `P3-LEV-013` | Leave | Department Admin | timeline | Leave succeeded | Timeline event created | Network + database | PENDING |
| `P3-LEV-014` | Leave | Department Admin | `/admin/leaves` or API view | Open leave fixtures exist | Active-leave filtering works | Screenshot or network | PENDING |

### Readmission (16 planned, minimum 12)

| Test ID | Category | Role | Page/API | Precondition | Expected result | Evidence type | Execution status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `P3-REA-001` | Readmission | Department Admin | `/admin/readmissions` | Authenticated department admin | Readmission page loads | Screenshot + console/network | PENDING |
| `P3-REA-002` | Readmission | Department Admin | `/admin/readmissions` or API source query | Student on leave fixture exists | Student on leave can be found | Screenshot or network | PENDING |
| `P3-REA-003` | Readmission | Department Admin | `/api/admin/readmissions` | Open leave fixture | Readmission to original context succeeds | Network + database | PENDING |
| `P3-REA-004` | Readmission | Department Admin | `/api/admin/readmissions` | Open leave fixture | Readmission to new valid context succeeds | Network + database | PENDING |
| `P3-REA-005` | Readmission | Department Admin | `/api/admin/readmissions` | Already-active student fixture | Already-active student rejected | Network + database | PENDING |
| `P3-REA-006` | Readmission | Department Admin | `/api/admin/readmissions` | Student with no leave/inactive state | Missing leave/inactive state rejected | Network + database | PENDING |
| `P3-REA-007` | Readmission | Department Admin | `/api/admin/readmissions` | Graduated student fixture | Graduated student rejected | Network + database | PENDING |
| `P3-REA-008` | Readmission | Department Admin | `/api/admin/readmissions` | Inactive target program fixture | Inactive target program rejected | Network + database | PENDING |
| `P3-REA-009` | Readmission | Department Admin | `/api/admin/readmissions` | Invalid session context | Invalid session rejected | Network + database | PENDING |
| `P3-REA-010` | Readmission | Department Admin | `/api/admin/readmissions` | Invalid year context | Invalid year rejected | Network + database | PENDING |
| `P3-REA-011` | Readmission | Department Admin | `/api/admin/readmissions` | Invalid semester context | Invalid semester rejected | Network + database | PENDING |
| `P3-REA-012` | Readmission | Department Admin | `/api/admin/readmissions` | Invalid group context | Invalid group rejected | Network + database | PENDING |
| `P3-REA-013` | Readmission | Department Admin | database | Readmission succeeded | Open leave closes | Database | PENDING |
| `P3-REA-014` | Readmission | Department Admin | database | Readmission succeeded | Enrollment becomes active | Database | PENDING |
| `P3-REA-015` | Readmission | Student | exam access page/API | Readmission fixture exists | Exam access restored | Browser + network | PENDING |
| `P3-REA-016` | Readmission | Department Admin | timeline | Readmission succeeded | History event created | Network + database | PENDING |

### Graduation (19 planned, minimum 14)

| Test ID | Category | Role | Page/API | Precondition | Expected result | Evidence type | Execution status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `P3-GRA-001` | Graduation | Department Admin | `/admin/graduation` | Authenticated department admin | Graduation page loads | Screenshot + console/network | PENDING |
| `P3-GRA-002` | Graduation | Department Admin | `/admin/graduation` or API source query | Eligible graduation fixtures exist | Eligible student can be found | Screenshot or network | PENDING |
| `P3-GRA-003` | Graduation | Department Admin | `/api/admin/graduations` | Final-semester BSc with published result | BSc graduation succeeds | Network + database | PENDING |
| `P3-GRA-004` | Graduation | Department Admin | `/api/admin/graduations` | Final-semester MSc with published result | MSc graduation succeeds | Network + database | PENDING |
| `P3-GRA-005` | Graduation | Department Admin | `/api/admin/graduations` | Incomplete curriculum fixture | Incomplete curriculum rejected | Network + database | PENDING |
| `P3-GRA-006` | Graduation | Department Admin | `/api/admin/graduations` | Unpublished result fixture | Unpublished results rejected | Network + database | EXECUTED |
| `P3-GRA-007` | Graduation | Department Admin | `/api/admin/graduations` | Missing final-year context | Missing final year rejected | Network + database | PENDING |
| `P3-GRA-008` | Graduation | Department Admin | `/api/admin/graduations` | Student on leave fixture | Leave-state student rejected | Network + database | PENDING |
| `P3-GRA-009` | Graduation | Department Admin | `/api/admin/graduations` | Dropped student fixture | Dropped student rejected | Network + database | PENDING |
| `P3-GRA-010` | Graduation | Department Admin | `/api/admin/graduations` | Already graduated student fixture | Duplicate graduation rejected | Network + database | PENDING |
| `P3-GRA-011` | Graduation | Department Admin | `/api/admin/graduations` | Duplicate certificate number | Duplicate certificate rejected | Network + database | PENDING |
| `P3-GRA-012` | Graduation | Department Admin | `/api/admin/graduations` | Invalid CGPA payload | Invalid CGPA rejected | Network + database | PENDING |
| `P3-GRA-013` | Graduation | Department Admin | `/api/admin/graduations` | Invalid graduation date/payload | Invalid graduation date rejected | Network + database | PENDING |
| `P3-GRA-014` | Graduation | Department Admin | database | Graduation succeeded | Active enrollment closes | Database | PENDING |
| `P3-GRA-015` | Graduation | Department Admin | database | Graduation succeeded | Graduation record exists | Database | PENDING |
| `P3-GRA-016` | Graduation | Department Admin | timeline | Graduation succeeded | History event created | Network + database | PENDING |
| `P3-GRA-017` | Graduation | Student | `/student/academic-history` or results | Graduated student fixture | Student-facing graduation state visible | Browser + network | PENDING |
| `P3-GRA-018` | Graduation | Student | `/student/exams` | Graduated student fixture | New exam attempts denied | Browser + network | EXECUTED |
| `P3-GRA-019` | Graduation | Student | `/student/results/[id]` | Published historical result exists | Historical result remains accessible | Browser + network | PENDING |

### Academic History and Timeline (12 planned, minimum 10)

| Test ID | Category | Role | Page/API | Precondition | Expected result | Evidence type | Execution status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `P3-HIS-001` | History | Department Admin | timeline | Enrollment fixture exists | Enrollment event visible | Network + database | PENDING |
| `P3-HIS-002` | History | Department Admin | timeline | Promotion fixture exists | Promotion event visible | Network + database | PENDING |
| `P3-HIS-003` | History | Department Admin | timeline | Transfer fixture exists | Transfer event visible | Network + database | PENDING |
| `P3-HIS-004` | History | Department Admin | timeline | Leave fixture exists | Leave event visible | Network + database | PENDING |
| `P3-HIS-005` | History | Department Admin | timeline | Readmission fixture exists | Readmission event visible | Network + database | PENDING |
| `P3-HIS-006` | History | Department Admin | timeline | Graduation fixture exists | Graduation event visible | Network + database | PENDING |
| `P3-HIS-007` | History | Department Admin | timeline or audit data | Override fixture exists | Manual override event visible | Network + database | PENDING |
| `P3-HIS-008` | History | Department Admin | timeline | Multi-event fixture exists | Events sorted chronologically | Network + database | PENDING |
| `P3-HIS-009` | History | Department Admin | timeline | Transition fixture exists | Previous/new context displayed correctly | Network + database | PENDING |
| `P3-HIS-010` | History | Student | `/student/academic-history` | Student own history exists | Student view hides private admin details | Browser + network | PENDING |
| `P3-HIS-011` | History | Student | foreign history URL/API | Other student exists | Student cannot open another student history | Browser + network | PENDING |
| `P3-HIS-012` | History | Department Admin | timeline | Transition fixture exists | No duplicate timeline event | Network + database | PENDING |

### Role and Isolation (17 planned, minimum 16)

| Test ID | Category | Role | Page/API | Precondition | Expected result | Evidence type | Execution status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `P3-AUTH-BR-001` | Auth/Role | Super Admin | `/admin/enrollments` | Super admin authenticated | Enrollment page opens | Screenshot + console/network | PENDING |
| `P3-AUTH-BR-002` | Auth/Role | Super Admin | `/api/admin/promotions` | Valid promotion fixture | Super admin can perform promotion | Network + database | PENDING |
| `P3-AUTH-BR-003` | Auth/Role | Department Admin A | `/admin/students` | CSE admin authenticated | Own-scope students visible | Screenshot + network | PENDING |
| `P3-AUTH-BR-004` | Auth/Role | Department Admin A | `/api/admin/enrollments` | Own-scope fixture | Own-scope enrollment management allowed | Network + database | PENDING |
| `P3-AUTH-BR-005` | Auth/Role | Department Admin A | foreign-scope enrollment action | EEE fixture exists | Department B enrollment denied | Browser/API + network | PENDING |
| `P3-AUTH-BR-006` | Auth/Role | Department Admin A | foreign-scope promotion action | EEE fixture exists | Department B promotion denied | Browser/API + network | PENDING |
| `P3-AUTH-BR-007` | Auth/Role | Department Admin B | foreign-scope records | CSE fixture exists | Department B denied Department A records | Browser/API + network | PENDING |
| `P3-AUTH-BR-008` | Auth/Role | Teacher | `/admin/enrollments` | Teacher authenticated | Teacher denied lifecycle write page | Browser + screenshot | PENDING |
| `P3-AUTH-BR-009` | Auth/Role | Teacher | direct admin URL/API | Teacher authenticated | Direct lifecycle URL denied securely | Browser + network | PENDING |
| `P3-AUTH-BR-010` | Auth/Role | Student | `/student/academic-history` | Student authenticated | Student opens own history | Browser + network | EXECUTED |
| `P3-AUTH-BR-011` | Auth/Role | Student | foreign history route/API | Another student exists | Student denied another student history | Browser + network | PENDING |
| `P3-AUTH-BR-012` | Auth/Role | Student | `/admin/enrollments` | Student authenticated | Student denied admin enrollment page | Browser + network | PENDING |
| `P3-AUTH-BR-013` | Auth/Role | Student | `/admin/promotions` | Student authenticated | Student denied promotion page | Browser + network | PENDING |
| `P3-AUTH-BR-014` | Auth/Role | Unauthenticated | `/admin/enrollments` | No session | Enrollment URL redirects or denies | Browser + network | PENDING |
| `P3-AUTH-BR-015` | Auth/Role | Unauthenticated | `/student/academic-history` | No session | History URL redirects or denies | Browser + network | PENDING |
| `P3-AUTH-BR-016` | Auth/Role | Department Admin | UI data scan | Foreign department fixtures exist | No foreign department data visible in UI | Screenshot + browser log | PENDING |
| `P3-AUTH-BR-017` | Auth/Role | Teacher/Student/Department Admin | denied flow | Denial flow executed | Secure error message shown on denial | Browser + screenshot | PENDING |

### Legacy Compatibility (12 planned, minimum 10)

| Test ID | Category | Role | Page/API | Precondition | Expected result | Evidence type | Execution status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `P3-LEG-001` | Legacy | Student | profile/dashboard/progress | Legacy-only student exists | Legacy-only student profile loads | Browser + network | PENDING |
| `P3-LEG-002` | Legacy | Student | progress/history/exam APIs | Legacy-only student exists | Legacy `StudentSubject` remains visible/usable | Browser/API + database | PENDING |
| `P3-LEG-003` | Legacy | Student | `/student/exams` | Legacy-only student exists | Legacy fallback sees eligible exam | Browser + network | PENDING |
| `P3-LEG-004` | Legacy | Teacher | teacher page/API | Legacy-compatible assignment exists | Legacy teacher assignment page loads | Browser + network | PENDING |
| `P3-LEG-005` | Legacy | Teacher/Admin | question page/API | Legacy-compatible subject fixture exists | Legacy question record loads | Browser/API | PENDING |
| `P3-LEG-006` | Legacy | Student/Teacher | exam detail/API | Legacy-compatible exam exists | Legacy exam record loads | Browser/API | PENDING |
| `P3-LEG-007` | Legacy | Student | result detail/API | Published result exists | Legacy result record loads | Browser/API | PENDING |
| `P3-LEG-008` | Legacy | Student | coursework page/API | Legacy-compatible coursework fixture exists | Legacy coursework record loads | Browser/API | PENDING |
| `P3-LEG-009` | Legacy | Student | ebook page/API | Legacy-compatible ebook fixture exists | Legacy ebook record loads | Browser/API | PENDING |
| `P3-LEG-010` | Legacy | Student | `/student/exams` | Active enrollment + conflicting legacy scope | Active enrollment takes precedence | Browser + network | PENDING |
| `P3-LEG-011` | Legacy | Student | conflict scope API/page | Conflict fixture exists | Legacy/new scope conflict handled safely | Browser/API + database | PENDING |
| `P3-LEG-012` | Legacy | Student/Teacher | mixed legacy fixtures | Accepted legacy-only records remain functional | Browser/API | PENDING |

### Exam Eligibility Regression (20 planned, minimum 16)

| Test ID | Category | Role | Page/API | Precondition | Expected result | Evidence type | Execution status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `P3-EXM-001` | Exam Eligibility | Student | `/student/exams` | Matching active-enrollment fixture | Matching active enrollment sees exam | Browser + network | PENDING |
| `P3-EXM-002` | Exam Eligibility | Student | `/student/exams` | Legacy-only fixture | Legacy fallback sees exam without enrollment | Browser + network | PENDING |
| `P3-EXM-003` | Exam Eligibility | Student | wrong-department exam detail/API | Wrong-department exam exists | Wrong department denied | Browser/API + network | PENDING |
| `P3-EXM-004` | Exam Eligibility | Student | wrong-program exam detail/API | Wrong-program exam exists | Wrong program denied | Browser/API + network | PENDING |
| `P3-EXM-005` | Exam Eligibility | Student | wrong-language exam detail/API | Wrong-language exam exists | Wrong language denied | Browser/API + network | PENDING |
| `P3-EXM-006` | Exam Eligibility | Student | wrong-year exam detail/API | Wrong-year exam exists | Wrong year denied | Browser/API + network | PENDING |
| `P3-EXM-007` | Exam Eligibility | Student | wrong-semester exam detail/API | Wrong-semester exam exists | Wrong semester denied | Browser/API + network | PENDING |
| `P3-EXM-008` | Exam Eligibility | Student | wrong-group exam detail/API | Wrong-group exam exists | Wrong group denied | Browser/API + network | PENDING |
| `P3-EXM-009` | Exam Eligibility | Student | wrong-subject exam detail/API | Wrong-subject exam exists | Wrong subject denied | Browser/API + network | PENDING |
| `P3-EXM-010` | Exam Eligibility | Student | `/student/exams` | Leave-state fixture exists | Student on leave denied | Browser + network | EXECUTED |
| `P3-EXM-011` | Exam Eligibility | Student | `/student/exams` | Transferred student fixture exists | Old-scope exam hidden | Browser + network | EXECUTED |
| `P3-EXM-012` | Exam Eligibility | Student | `/student/exams/[id]` | Transferred student fixture exists | Old direct URL denied | Browser + network | EXECUTED |
| `P3-EXM-013` | Exam Eligibility | Student | `/student/exams` | Transferred student fixture exists | Target-scope exam allowed | Browser + network | EXECUTED |
| `P3-EXM-014` | Exam Eligibility | Student | `/student/exams` | Graduated fixture exists | Graduated student denied new attempt | Browser + network | EXECUTED |
| `P3-EXM-015` | Exam Eligibility | Student | exam detail/API | Dropped student fixture | Dropped student denied | Browser/API + network | PENDING |
| `P3-EXM-016` | Exam Eligibility | Student | exam detail/API | Inactive enrollment fixture | Inactive enrollment denied | Browser/API + network | PENDING |
| `P3-EXM-017` | Exam Eligibility | Student | `/api/results/[id]` | Foreign result exists | Unauthorized result access denied | Browser/API + network | PENDING |
| `P3-EXM-018` | Exam Eligibility | Student | socket join | Invalid-scope exam and socket token | Socket join denied for invalid scope | Browser/log + network | PENDING |
| `P3-EXM-019` | Exam Eligibility | Student | socket answer save | Invalidated or unauthorized attempt | Answer save denied after invalidated access | Browser/log + network | PENDING |
| `P3-EXM-020` | Exam Eligibility | Student | `/student/results/[id]` | Graduated student with published result | Historical result remains accessible after graduation | Browser + network | PENDING |

### General UI and Error Handling (10 planned, minimum 8)

| Test ID | Category | Role | Page/API | Precondition | Expected result | Evidence type | Execution status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `P3-UI-001` | UI/Error | Department Admin | lifecycle page load | Slow-loading page capture | Loading state appears safely | Screenshot + console | PENDING |
| `P3-UI-002` | UI/Error | Student/Admin | page with no records | Empty state appears safely | Screenshot + network | PENDING |
| `P3-UI-003` | UI/Error | Department Admin | invalid form submit | Validation error state shown | Screenshot + network | PENDING |
| `P3-UI-004` | UI/Error | Teacher/Student/Anon | protected page | Unauthorized state shown | Screenshot + network | PENDING |
| `P3-UI-005` | UI/Error | Department Admin | failing request flow | Network/server error handled safely | Screenshot + network | PENDING |
| `P3-UI-006` | UI/Error | Department Admin | duplicate submit flow | Duplicate submit prevented | Screenshot + network | PENDING |
| `P3-UI-007` | UI/Error | Department Admin | successful create flow | Form resets after success | Screenshot + browser log | PENDING |
| `P3-UI-008` | UI/Error | Department Admin | dependent select flow | Stale child selections cleaned up | Screenshot + browser log | PENDING |
| `P3-UI-009` | UI/Error | Student/Admin | browser refresh on safe page | Refresh retains safe state | Screenshot + network | PENDING |
| `P3-UI-010` | UI/Error | Student/Admin | lifecycle page render | No hydration warning or critical console error | Console capture | PENDING |

## Planned Totals

- Enrollment: 22
- Promotion: 23
- Transfer: 18
- Leave: 14
- Readmission: 16
- Graduation: 19
- Academic history/timeline: 12
- Role/isolation/auth browser-visible: 17
- Legacy compatibility: 12
- Exam eligibility regression: 20
- General UI/error handling: 10

Planned overall total: 183

Execution target for strict final Phase 3 PASS:

- At least 128 real executed and recorded cases
- All critical lifecycle paths executed
- DEF-003 regression re-confirmed
- No unresolved critical console/network errors
