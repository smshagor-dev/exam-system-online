import { TeachingAssignmentRoleType, TeachingAssignmentStatus, TeacherWorkloadCategory } from '@prisma/client/index'
import { calculateAssignmentWorkload, calculateTeacherWeeklyWorkload, validateWorkloadLimit } from '../../src/lib/teacher-workload'

type TestResult = {
  id: string
  pass: boolean
  details: string
}

function runTests() {
  const results: TestResult[] = []

  const assignmentWorkload = calculateAssignmentWorkload({
    lectureHours: 3,
    labHours: 2,
    consultationHours: 1,
    assessmentHours: 2,
  })

  results.push({
    id: 'P4-WLD-001',
    pass: assignmentWorkload.totalHours === 8,
    details: `Expected 8 total hours, received ${assignmentWorkload.totalHours}`,
  })

  const weekly = calculateTeacherWeeklyWorkload(
    [{ weeklyHours: 4, lectureHours: 2 }],
    [{ category: TeacherWorkloadCategory.ADMINISTRATION, hours: 3 }],
    { maxWeeklyHours: 10 }
  )

  results.push({
    id: 'P4-WLD-002',
    pass: weekly.totalHours === 9 && weekly.overLimit === false,
    details: `Expected 9 hours below limit, received ${weekly.totalHours}`,
  })

  const limited = validateWorkloadLimit(14, 10)
  results.push({
    id: 'P4-WLD-003',
    pass: limited.allowed === false && limited.overBy === 4,
    details: `Expected overload by 4, received ${limited.overBy}`,
  })

  results.push({
    id: 'P4-ROL-001',
    pass:
      TeachingAssignmentRoleType.LEAD_TEACHER === 'LEAD_TEACHER' &&
      TeachingAssignmentStatus.ACTIVE === 'ACTIVE',
    details: 'Role and status enums should be generated from Prisma schema',
  })

  const passed = results.filter((result) => result.pass).length
  const failed = results.length - passed

  console.log(
    JSON.stringify(
      {
        total: results.length,
        passed,
        failed,
        results,
      },
      null,
      2
    )
  )

  if (failed > 0) {
    process.exit(1)
  }
}

runTests()
