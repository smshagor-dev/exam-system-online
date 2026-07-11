# Phase 3 Security

## Verified in this pass

- Lifecycle create/update flows now reject inactive programs, sessions, groups, program years, program semesters, and inactive department-language mappings.
- Exam eligibility no longer allows active-leave or graduated students to bypass lifecycle state through legacy `StudentSubject` fallback.
- Student exam pages now apply active-enrollment precedence before legacy fallback and deny out-of-scope direct exam URLs safely.
- Automated tests now cover wrong-department exam denial, graduated-student denial, legacy fallback, and active-enrollment precedence.
- Executed API authorization evidence now verifies 78 endpoint-role checks with correct 401/403 behavior for anonymous, student, teacher, and foreign-scope department access.

## Still missing for full sign-off

- Full browser/manual evidence for student access boundaries and admin-scope boundaries
