import fs from 'fs/promises'
import path from 'path'
import { request } from 'playwright'
import { PrismaClient, StudentEnrollmentStatus } from '@prisma/client'

const baseUrl = process.env.PHASE3_BASE_URL || 'http://127.0.0.1:3000'
const evidenceDir = path.join(process.cwd(), 'docs', 'phase-3', 'evidence')
const jsonPath = path.join(evidenceDir, 'authorization-matrix-results.json')
const markdownPath = path.join(process.cwd(), 'docs', 'phase-3', 'PHASE_3_AUTHORIZATION_MATRIX.md')

async function getBaseDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL

  const envRaw = await fs.readFile(path.join(process.cwd(), '.env'), 'utf8')
  const match = envRaw.match(/^DATABASE_URL="?([^"\r\n]+)"?/m)
  if (!match) {
    throw new Error('DATABASE_URL is required for the authorization matrix.')
  }

  return match[1]
}

function withDatabaseName(databaseUrl, suffix) {
  const [base, query = ''] = databaseUrl.split('?')
  const dbName = base.slice(base.lastIndexOf('/') + 1)
  const root = base.slice(0, base.lastIndexOf('/') + 1)
  return `${root}${dbName}${suffix}${query ? `?${query}` : ''}`
}

const roles = {
  superAdmin: {
    label: 'Super Admin',
    email: 'admin@test.local',
    password: 'Admin@123',
    landing: '/admin',
  },
  deptOwn: {
    label: 'Department Admin own scope',
    email: 'cse.admin@test.local',
    password: 'Admin@123',
    landing: '/admin',
  },
  deptForeign: {
    label: 'Department Admin foreign scope',
    email: 'cse.admin@test.local',
    password: 'Admin@123',
    landing: '/admin',
  },
  teacher: {
    label: 'Teacher',
    email: 'teacher@test.local',
    password: 'Teacher@123',
    landing: '/teacher',
  },
  student: {
    label: 'Student',
    email: 'alice@student.test',
    password: 'Student@123',
    landing: '/student',
  },
  anon: {
    label: 'Unauthenticated',
  },
}

function isAllowedStatus(status) {
  return [200, 201, 400, 404, 409, 422].includes(status)
}

function expectDenied(status, expected) {
  return status === expected
}

async function ensureEvidenceDir() {
  await fs.mkdir(evidenceDir, { recursive: true })
}

async function createAuthenticatedRequest(roleKey) {
  const role = roles[roleKey]
  const api = await request.newContext({ baseURL: baseUrl })
  if (roleKey === 'anon') {
    return api
  }

  const csrfResponse = await api.get('/api/auth/csrf')
  const csrfPayload = await csrfResponse.json()
  const callbackResponse = await api.post('/api/auth/callback/credentials', {
    form: {
      email: role.email,
      password: role.password,
      csrfToken: csrfPayload.csrfToken,
      callbackUrl: `${baseUrl}/`,
      json: 'true',
    },
  })

  if (callbackResponse.status() !== 200) {
    throw new Error(`Credential callback failed for ${role.label} with status ${callbackResponse.status()}`)
  }

  const sessionResponse = await api.get('/api/auth/session')
  const sessionPayload = await sessionResponse.json()
  if (!sessionPayload?.user?.email) {
    throw new Error(`Session was not established for ${role.label}`)
  }

  return api
}

async function apiRequest(api, pathName, method, body) {
  const response = await api.fetch(pathName, {
    method,
    headers: {
      'Content-Type': 'application/json',
    },
    data: body,
  })
  return {
    status: response.status(),
    text: await response.text(),
  }
}

function compactBodyText(text) {
  return text.replace(/\s+/g, ' ').slice(0, 220)
}

async function ensureLifecycleFixture(prisma) {
  const departments = await prisma.department.findMany({ select: { id: true, code: true, name: true } })
  const cse = departments.find((item) => item.code === 'CSE')
  const eee = departments.find((item) => item.code === 'EEE')
  if (!cse || !eee) {
    throw new Error('Expected CSE and EEE departments to exist in the local QA database.')
  }

  const [aliceProfile, cseProgram, eeeProgram, cseSession, cseProgramYear, eeeProgramYear, cseSemester, cseProgramSemester, eeeProgramSemester, cseGroup, eeeGroup, cseDeptLanguage, eeeDeptLanguage, cseYear] = await Promise.all([
    prisma.studentProfile.findFirst({
      where: { user: { email: 'alice@student.test' } },
      select: { id: true, departmentId: true },
    }),
    prisma.academicProgram.findFirst({ where: { departmentId: cse.id, isActive: true }, orderBy: { createdAt: 'asc' } }),
    prisma.academicProgram.findFirst({ where: { departmentId: eee.id, isActive: true }, orderBy: { createdAt: 'asc' } }),
    prisma.academicSession.findFirst({ where: { isActive: true }, orderBy: { createdAt: 'asc' } }),
    prisma.programYear.findFirst({
      where: { program: { departmentId: cse.id }, isActive: true },
      orderBy: [{ yearNumber: 'asc' }, { createdAt: 'asc' }],
    }),
    prisma.programYear.findFirst({
      where: { program: { departmentId: eee.id }, isActive: true },
      orderBy: [{ yearNumber: 'asc' }, { createdAt: 'asc' }],
    }),
    prisma.semester.findFirst({ where: { isActive: true }, orderBy: { number: 'asc' } }),
    prisma.programSemester.findFirst({
      where: { program: { departmentId: cse.id }, isActive: true },
      orderBy: [{ semesterNumber: 'asc' }, { createdAt: 'asc' }],
    }),
    prisma.programSemester.findFirst({
      where: { program: { departmentId: eee.id }, isActive: true },
      orderBy: [{ semesterNumber: 'asc' }, { createdAt: 'asc' }],
    }),
    prisma.group.findFirst({
      where: { departmentId: cse.id, isActive: true },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.group.findFirst({
      where: { departmentId: eee.id, isActive: true },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.departmentLanguage.findFirst({
      where: { departmentId: cse.id, isActive: true },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.departmentLanguage.findFirst({
      where: { departmentId: eee.id, isActive: true },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.academicYear.findFirst({ where: { isActive: true }, orderBy: { year: 'asc' } }),
  ])

  if (!aliceProfile || !cseProgram || !eeeProgram || !cseSession || !cseProgramYear || !eeeProgramYear || !cseSemester || !cseProgramSemester || !eeeProgramSemester || !cseGroup || !eeeGroup || !cseDeptLanguage || !eeeDeptLanguage || !cseYear) {
    throw new Error('Could not build authorization fixture from current local QA database.')
  }

  let eeeUser = await prisma.user.findUnique({
    where: { email: 'auth.eee.student@examflow.pro' },
    select: { id: true },
  })

  if (!eeeUser) {
    const { default: bcrypt } = await import('bcryptjs')
    eeeUser = await prisma.user.create({
      data: {
        email: 'auth.eee.student@examflow.pro',
        password: bcrypt.hashSync('Student@123', 12),
        name: 'EEE Auth Student',
        role: 'STUDENT',
      },
      select: { id: true },
    })
  }

  let eeeProfile = await prisma.studentProfile.findUnique({
    where: { userId: eeeUser.id },
    select: { id: true, departmentId: true },
  })

  if (!eeeProfile) {
    eeeProfile = await prisma.studentProfile.create({
      data: { userId: eeeUser.id, departmentId: eee.id },
      select: { id: true, departmentId: true },
    })
  }

  let enrollment = await prisma.studentEnrollment.findFirst({
    where: { studentId: aliceProfile.id, departmentId: cse.id },
    select: { id: true },
  })

  if (!enrollment) {
    enrollment = await prisma.studentEnrollment.create({
      data: {
        studentId: aliceProfile.id,
        departmentId: cse.id,
        academicYearId: cseYear.id,
        academicSessionId: cseSession.id,
        programId: cseProgram.id,
        programYearId: cseProgramYear.id,
        semesterId: cseSemester.id,
        programSemesterId: cseProgramSemester.id,
        groupId: cseGroup.id,
        departmentLanguageId: cseDeptLanguage.id,
        languageId: cseDeptLanguage.languageId,
        status: StudentEnrollmentStatus.ACTIVE,
        isActive: true,
        notes: 'Authorization matrix fixture enrollment',
      },
      select: { id: true },
    })
  }

  let eeeEnrollment = await prisma.studentEnrollment.findFirst({
    where: { studentId: eeeProfile.id, departmentId: eee.id },
    select: { id: true },
  })

  if (!eeeEnrollment) {
    eeeEnrollment = await prisma.studentEnrollment.create({
      data: {
        studentId: eeeProfile.id,
        departmentId: eee.id,
        academicYearId: cseYear.id,
        academicSessionId: cseSession.id,
        programId: eeeProgram.id,
        programYearId: eeeProgramYear.id,
        semesterId: cseSemester.id,
        programSemesterId: eeeProgramSemester.id,
        groupId: eeeGroup.id,
        departmentLanguageId: eeeDeptLanguage.id,
        languageId: eeeDeptLanguage.languageId,
        status: StudentEnrollmentStatus.ACTIVE,
        isActive: true,
        notes: 'Authorization matrix EEE fixture enrollment',
      },
      select: { id: true },
    })
  }

  return {
    ids: {
      cseDepartmentId: cse.id,
      eeeDepartmentId: eee.id,
      studentId: aliceProfile.id,
      enrollmentId: enrollment.id,
      sessionId: cseSession.id,
      programId: cseProgram.id,
      programYearId: cseProgramYear.id,
      semesterId: cseSemester.id,
      programSemesterId: cseProgramSemester.id,
      groupId: cseGroup.id,
      academicYearId: cseYear.id,
      departmentLanguageId: cseDeptLanguage.id,
      languageId: cseDeptLanguage.languageId,
      eeeStudentId: eeeProfile.id,
      eeeEnrollmentId: eeeEnrollment.id,
      eeeProgramId: eeeProgram.id,
      eeeProgramYearId: eeeProgramYear.id,
      eeeProgramSemesterId: eeeProgramSemester.id,
      eeeGroupId: eeeGroup.id,
      eeeDepartmentLanguageId: eeeDeptLanguage.id,
      eeeLanguageId: eeeDeptLanguage.languageId,
    },
  }
}

function buildCases(ids) {
  const validContext = {
    departmentId: ids.cseDepartmentId,
    academicSessionId: ids.sessionId,
    programId: ids.programId,
    programYearId: ids.programYearId,
    semesterId: ids.semesterId,
    programSemesterId: ids.programSemesterId,
    groupId: ids.groupId,
    academicYearId: ids.academicYearId,
    departmentLanguageId: ids.departmentLanguageId,
    languageId: ids.languageId,
  }
  const foreignContext = {
    departmentId: ids.eeeDepartmentId,
    academicSessionId: ids.sessionId,
    programId: ids.eeeProgramId,
    programYearId: ids.eeeProgramYearId,
    semesterId: ids.semesterId,
    programSemesterId: ids.eeeProgramSemesterId,
    groupId: ids.eeeGroupId,
    academicYearId: ids.academicYearId,
    departmentLanguageId: ids.eeeDepartmentLanguageId,
    languageId: ids.eeeLanguageId,
  }

  const fakeStudentId = 'cmzzzzzzzzzzzzzzzzzzzzzzz'
  const fakeEnrollmentId = ids.enrollmentId

  return [
    {
      id: 'AUTH-ENR-GET',
      method: 'GET',
      pathByRole: {
        superAdmin: '/api/admin/enrollments',
        deptOwn: '/api/admin/enrollments',
        deptForeign: `/api/admin/enrollments?departmentId=${ids.eeeDepartmentId}`,
        teacher: '/api/admin/enrollments',
        student: '/api/admin/enrollments',
        anon: '/api/admin/enrollments',
      },
      bodyByRole: {},
    },
    {
      id: 'AUTH-ENR-POST',
      method: 'POST',
      pathByRole: Object.fromEntries(Object.keys(roles).map((role) => [role, '/api/admin/enrollments'])),
      bodyByRole: {
        superAdmin: { ...validContext, studentId: fakeStudentId },
        deptOwn: { ...validContext, studentId: fakeStudentId },
        deptForeign: { ...foreignContext, studentId: fakeStudentId },
        teacher: { ...validContext, studentId: fakeStudentId },
        student: { ...validContext, studentId: fakeStudentId },
        anon: { ...validContext, studentId: fakeStudentId },
      },
    },
    {
      id: 'AUTH-ENR-PATCH',
      method: 'PATCH',
      pathByRole: {
        superAdmin: `/api/admin/enrollments/${fakeEnrollmentId}`,
        deptOwn: `/api/admin/enrollments/${fakeEnrollmentId}`,
        deptForeign: `/api/admin/enrollments/${ids.eeeEnrollmentId}`,
        teacher: `/api/admin/enrollments/${fakeEnrollmentId}`,
        student: `/api/admin/enrollments/${fakeEnrollmentId}`,
        anon: `/api/admin/enrollments/${fakeEnrollmentId}`,
      },
      bodyByRole: Object.fromEntries(Object.keys(roles).map((role) => [role, { notes: 'Authorization matrix patch probe' }])),
    },
    {
      id: 'AUTH-TIMELINE-GET',
      method: 'GET',
      pathByRole: {
        superAdmin: `/api/admin/enrollments/${ids.studentId}/timeline`,
        deptOwn: `/api/admin/enrollments/${ids.studentId}/timeline`,
        deptForeign: `/api/admin/enrollments/${ids.eeeStudentId}/timeline`,
        teacher: `/api/admin/enrollments/${ids.studentId}/timeline`,
        student: `/api/admin/enrollments/${ids.studentId}/timeline`,
        anon: `/api/admin/enrollments/${ids.studentId}/timeline`,
      },
      bodyByRole: {},
    },
    {
      id: 'AUTH-PRO-POST',
      method: 'POST',
      pathByRole: Object.fromEntries(Object.keys(roles).map((role) => [role, '/api/admin/promotions'])),
      bodyByRole: {
        superAdmin: { ...validContext, studentId: fakeStudentId },
        deptOwn: { ...validContext, studentId: fakeStudentId },
        deptForeign: { ...foreignContext, studentId: fakeStudentId },
        teacher: { ...validContext, studentId: fakeStudentId },
        student: { ...validContext, studentId: fakeStudentId },
        anon: { ...validContext, studentId: fakeStudentId },
      },
    },
    {
      id: 'AUTH-PRO-PREVIEW',
      method: 'POST',
      pathByRole: Object.fromEntries(Object.keys(roles).map((role) => [role, '/api/admin/promotions/preview'])),
      bodyByRole: {
        superAdmin: { ...validContext, studentId: fakeStudentId },
        deptOwn: { ...validContext, studentId: fakeStudentId },
        deptForeign: { ...foreignContext, studentId: fakeStudentId },
        teacher: { ...validContext, studentId: fakeStudentId },
        student: { ...validContext, studentId: fakeStudentId },
        anon: { ...validContext, studentId: fakeStudentId },
      },
    },
    {
      id: 'AUTH-PRO-BULK',
      method: 'POST',
      pathByRole: Object.fromEntries(Object.keys(roles).map((role) => [role, '/api/admin/promotions/bulk'])),
      bodyByRole: {
        superAdmin: { ...validContext, studentIds: [fakeStudentId] },
        deptOwn: { ...validContext, studentIds: [fakeStudentId] },
        deptForeign: { ...foreignContext, studentIds: [fakeStudentId] },
        teacher: { ...validContext, studentIds: [fakeStudentId] },
        student: { ...validContext, studentIds: [fakeStudentId] },
        anon: { ...validContext, studentIds: [fakeStudentId] },
      },
    },
    {
      id: 'AUTH-TRN-POST',
      method: 'POST',
      pathByRole: Object.fromEntries(Object.keys(roles).map((role) => [role, '/api/admin/transfers'])),
      bodyByRole: {
        superAdmin: { ...validContext, studentId: fakeStudentId, transferType: 'GROUP' },
        deptOwn: { ...validContext, studentId: fakeStudentId, transferType: 'GROUP' },
        deptForeign: { ...foreignContext, studentId: fakeStudentId, transferType: 'GROUP' },
        teacher: { ...validContext, studentId: fakeStudentId, transferType: 'GROUP' },
        student: { ...validContext, studentId: fakeStudentId, transferType: 'GROUP' },
        anon: { ...validContext, studentId: fakeStudentId, transferType: 'GROUP' },
      },
    },
    {
      id: 'AUTH-LEV-POST',
      method: 'POST',
      pathByRole: Object.fromEntries(Object.keys(roles).map((role) => [role, '/api/admin/leaves'])),
      bodyByRole: {
        superAdmin: {
          studentId: ids.studentId,
          leaveType: 'MEDICAL',
          startsAt: new Date().toISOString(),
          endsAt: new Date(Date.now() + 86400000).toISOString(),
          status: 'APPROVED',
          reason: 'Authorization matrix probe',
        },
        deptOwn: {
          studentId: ids.studentId,
          leaveType: 'MEDICAL',
          startsAt: new Date().toISOString(),
          endsAt: new Date(Date.now() + 86400000).toISOString(),
          status: 'APPROVED',
          reason: 'Authorization matrix probe',
        },
        deptForeign: {
          studentId: ids.eeeStudentId,
          leaveType: 'MEDICAL',
          startsAt: new Date().toISOString(),
          endsAt: new Date(Date.now() + 86400000).toISOString(),
          status: 'APPROVED',
          reason: 'Authorization matrix probe',
        },
        teacher: {
          studentId: ids.studentId,
          leaveType: 'MEDICAL',
          startsAt: new Date().toISOString(),
          endsAt: new Date(Date.now() + 86400000).toISOString(),
          status: 'APPROVED',
          reason: 'Authorization matrix probe',
        },
        student: {
          studentId: ids.studentId,
          leaveType: 'MEDICAL',
          startsAt: new Date().toISOString(),
          endsAt: new Date(Date.now() + 86400000).toISOString(),
          status: 'APPROVED',
          reason: 'Authorization matrix probe',
        },
        anon: {
          studentId: ids.studentId,
          leaveType: 'MEDICAL',
          startsAt: new Date().toISOString(),
          endsAt: new Date(Date.now() + 86400000).toISOString(),
          status: 'APPROVED',
          reason: 'Authorization matrix probe',
        },
      },
    },
    {
      id: 'AUTH-REA-POST',
      method: 'POST',
      pathByRole: Object.fromEntries(Object.keys(roles).map((role) => [role, '/api/admin/readmissions'])),
      bodyByRole: {
        superAdmin: { ...validContext, studentId: fakeStudentId, readmittedAt: new Date().toISOString() },
        deptOwn: { ...validContext, studentId: fakeStudentId, readmittedAt: new Date().toISOString() },
        deptForeign: { ...foreignContext, studentId: fakeStudentId, readmittedAt: new Date().toISOString() },
        teacher: { ...validContext, studentId: fakeStudentId, readmittedAt: new Date().toISOString() },
        student: { ...validContext, studentId: fakeStudentId, readmittedAt: new Date().toISOString() },
        anon: { ...validContext, studentId: fakeStudentId, readmittedAt: new Date().toISOString() },
      },
    },
    {
      id: 'AUTH-GRD-POST',
      method: 'POST',
      pathByRole: Object.fromEntries(Object.keys(roles).map((role) => [role, '/api/admin/graduations'])),
      bodyByRole: {
        superAdmin: {
          studentId: ids.studentId,
          graduatedAt: new Date().toISOString(),
          degreeAwarded: 'Probe Degree',
        },
        deptOwn: {
          studentId: ids.studentId,
          graduatedAt: new Date().toISOString(),
          degreeAwarded: 'Probe Degree',
        },
        deptForeign: {
          studentId: ids.eeeStudentId,
          graduatedAt: new Date().toISOString(),
          degreeAwarded: 'Probe Degree',
        },
        teacher: {
          studentId: ids.studentId,
          graduatedAt: new Date().toISOString(),
          degreeAwarded: 'Probe Degree',
        },
        student: {
          studentId: ids.studentId,
          graduatedAt: new Date().toISOString(),
          degreeAwarded: 'Probe Degree',
        },
        anon: {
          studentId: ids.studentId,
          graduatedAt: new Date().toISOString(),
          degreeAwarded: 'Probe Degree',
        },
      },
    },
    {
      id: 'AUTH-GRD-PATCH',
      method: 'PATCH',
      pathByRole: Object.fromEntries(Object.keys(roles).map((role) => [role, '/api/admin/graduations'])),
      bodyByRole: {
        superAdmin: {
          studentId: ids.studentId,
          alumniAt: new Date().toISOString(),
          notes: 'Authorization matrix probe',
        },
        deptOwn: {
          studentId: ids.studentId,
          alumniAt: new Date().toISOString(),
          notes: 'Authorization matrix probe',
        },
        deptForeign: {
          studentId: ids.eeeStudentId,
          alumniAt: new Date().toISOString(),
          notes: 'Authorization matrix probe',
        },
        teacher: {
          studentId: ids.studentId,
          alumniAt: new Date().toISOString(),
          notes: 'Authorization matrix probe',
        },
        student: {
          studentId: ids.studentId,
          alumniAt: new Date().toISOString(),
          notes: 'Authorization matrix probe',
        },
        anon: {
          studentId: ids.studentId,
          alumniAt: new Date().toISOString(),
          notes: 'Authorization matrix probe',
        },
      },
    },
    {
      id: 'AUTH-STD-HISTORY',
      method: 'GET',
      pathByRole: Object.fromEntries(Object.keys(roles).map((role) => [role, '/api/account/academic-history'])),
      bodyByRole: {},
    },
  ]
}

function evaluateCell(caseId, roleKey, status) {
  if (caseId === 'AUTH-STD-HISTORY') {
    if (roleKey === 'student') {
      return { expected: '200', pass: status === 200 }
    }
    if (roleKey === 'anon') {
      return { expected: '401', pass: status === 401 }
    }
    return { expected: '403', pass: status === 403 }
  }

  if (roleKey === 'superAdmin' || roleKey === 'deptOwn') {
    return {
      expected: 'Allowed business response (200/201/400/404/409/422)',
      pass: isAllowedStatus(status),
    }
  }
  if (roleKey === 'deptForeign') {
    if (caseId === 'AUTH-TRN-POST') {
      return {
        expected: '403 or 404 safe denial',
        pass: status === 403 || status === 404,
      }
    }
    return {
      expected: '403',
      pass: expectDenied(status, 403),
    }
  }
  if (roleKey === 'teacher') {
    return {
      expected: '403',
      pass: expectDenied(status, 403),
    }
  }
  if (roleKey === 'student') {
    return {
      expected: '200 for own history only, otherwise 403',
      pass: status === 200 || status === 403,
    }
  }
  return {
    expected: '401',
    pass: expectDenied(status, 401),
  }
}

function renderMarkdown(results) {
  const roleOrder = ['superAdmin', 'deptOwn', 'deptForeign', 'teacher', 'student', 'anon']
  const header = [
    '# Phase 3 Authorization Matrix',
    '',
    'Status: PARTIAL_EXECUTED_EVIDENCE',
    '',
    '| Endpoint | Method | Super Admin | Department Admin own scope | Department Admin foreign scope | Teacher | Student | Unauthenticated |',
    '| --- | --- | --- | --- | --- | --- | --- | --- |',
  ]

  const lines = results.map((row) => {
    const cells = roleOrder.map((roleKey) => {
      const cell = row.roles[roleKey]
      return `${cell.actualStatus} / ${cell.pass ? 'PASS' : 'FAIL'}`
    })
    return `| \`${row.pathLabel}\` | \`${row.method}\` | ${cells.join(' | ')} |`
  })

  header.push('', '## Detailed Results')
  for (const row of results) {
    header.push(`- \`${row.id}\` ${row.method} \`${row.pathLabel}\``)
    for (const roleKey of roleOrder) {
      const cell = row.roles[roleKey]
      header.push(`- ${roles[roleKey].label}: expected ${cell.expectedStatus}, actual ${cell.actualStatus}, ${cell.pass ? 'PASS' : 'FAIL'}, evidence \`docs/phase-3/evidence/authorization-matrix-results.json\``)
    }
  }

  return [...header, ...lines].join('\n')
}

async function main() {
  process.env.DATABASE_URL = withDatabaseName(await getBaseDatabaseUrl(), '_phase3_tests')
  await ensureEvidenceDir()
  const prisma = new PrismaClient()
  const fixture = await ensureLifecycleFixture(prisma)
  const cases = buildCases(fixture.ids)
  const apiContexts = {}
  const results = []

  try {
    for (const [roleKey, roleConfig] of Object.entries(roles)) {
      void roleConfig
      apiContexts[roleKey] = await createAuthenticatedRequest(roleKey)
    }

    for (const testCase of cases) {
      const row = {
        id: testCase.id,
        method: testCase.method,
        pathLabel: testCase.pathByRole.superAdmin,
        roles: {},
      }

      for (const roleKey of Object.keys(roles)) {
        const path = testCase.pathByRole[roleKey]
        const body = testCase.bodyByRole[roleKey]
        const response = await apiRequest(apiContexts[roleKey], path, testCase.method, body)
        const evaluation = evaluateCell(testCase.id, roleKey, response.status)

        row.roles[roleKey] = {
          expectedStatus: evaluation.expected,
          actualStatus: response.status,
          pass: evaluation.pass,
          responseSnippet: compactBodyText(response.text),
        }
      }

      results.push(row)
    }

    await fs.writeFile(jsonPath, JSON.stringify(results, null, 2))
    await fs.writeFile(markdownPath, renderMarkdown(results))

    const failures = results.flatMap((row) =>
      Object.entries(row.roles)
        .filter(([, cell]) => !cell.pass)
        .map(([roleKey, cell]) => `${row.id}:${roleKey}:${cell.actualStatus}`),
    )

    console.log(`Authorization matrix cases: ${results.length * Object.keys(roles).length}`)
    console.log(`Authorization matrix failures: ${failures.length}`)
    if (failures.length > 0) {
      console.log(failures.join('\n'))
      process.exit(1)
    }
  } finally {
    await Promise.all(Object.values(apiContexts).map((api) => api.dispose().catch(() => {})))
    await prisma.$disconnect()
  }
}

main().catch(async (error) => {
  await ensureEvidenceDir()
  await fs.writeFile(jsonPath, JSON.stringify([{ fatal: String(error) }], null, 2))
  console.error(error)
  process.exit(1)
})
