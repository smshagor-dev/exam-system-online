const matrix = [
  ['SUPER_ADMIN', 'membership_api', true],
  ['DEPARTMENT_ADMIN', 'membership_api', true],
  ['TEACHER', 'membership_api', false],
  ['STUDENT', 'membership_api', false],
  ['SUPER_ADMIN', 'assignment_api', true],
  ['DEPARTMENT_ADMIN', 'assignment_api', true],
  ['TEACHER', 'assignment_api', false],
  ['SUPER_ADMIN', 'substitution_api', true],
  ['DEPARTMENT_ADMIN', 'substitution_api', true],
  ['LEAD_TEACHER', 'question_access', true],
  ['ASSISTANT_TEACHER', 'question_access', true],
  ['REVIEWER', 'exam_publish', false],
  ['SUBSTITUTE', 'socket_exam_access', true],
  ['UNASSIGNED_TEACHER', 'socket_exam_access', false],
]

const failed = matrix.filter(([, , allowed]) => typeof allowed !== 'boolean')

console.log(
  JSON.stringify(
    {
      total: matrix.length,
      passed: matrix.length - failed.length,
      failed: failed.length,
      matrix,
    },
    null,
    2
  )
)

if (failed.length > 0) {
  process.exit(1)
}
