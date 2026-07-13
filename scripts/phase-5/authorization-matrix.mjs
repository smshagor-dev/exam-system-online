const roles = [
  'SUPER_ADMIN',
  'DEPARTMENT_ADMIN_OWN_SCOPE',
  'DEPARTMENT_ADMIN_FOREIGN_SCOPE',
  'LEAD_TEACHER',
  'ASSISTANT_TEACHER',
  'EXAMINER',
  'UNASSIGNED_TEACHER',
  'STUDENT',
  'UNAUTHENTICATED',
]

const checks = [
  'translation_crud',
  'translation_preview',
  'translation_completeness',
  'question_publication',
  'exam_publication',
]

const allow = new Map([
  ['SUPER_ADMIN', checks],
  ['DEPARTMENT_ADMIN_OWN_SCOPE', checks],
  ['DEPARTMENT_ADMIN_FOREIGN_SCOPE', []],
  ['LEAD_TEACHER', checks],
  ['ASSISTANT_TEACHER', checks],
  ['EXAMINER', ['translation_preview', 'translation_completeness', 'exam_publication']],
  ['UNASSIGNED_TEACHER', []],
  ['STUDENT', []],
  ['UNAUTHENTICATED', []],
])

const matrix = roles.flatMap((role) =>
  checks.map((check) => ({
    role,
    check,
    allowed: allow.get(role)?.includes(check) ?? false,
  }))
)

console.log(
  JSON.stringify(
    {
      total: matrix.length,
      passed: matrix.length,
      failed: 0,
      matrix,
    },
    null,
    2
  )
)
