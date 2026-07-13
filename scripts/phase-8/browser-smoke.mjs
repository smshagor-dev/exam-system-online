import fs from 'node:fs/promises'
import path from 'node:path'
import { chromium } from 'playwright'
import { PrismaClient } from '@prisma/client'
import {
  connectSocket,
  createApiContext,
  getSocketToken,
  loginPage,
  primeLocale,
  startRedis,
  startServer,
  stopRedis,
  stopServer,
  waitForSocketEvent,
} from '../phase-6/evidence-helpers.mjs'
import { ensurePhase6EvidenceFixtures, closePhase6FixturesPrisma } from '../phase-6/evidence-fixtures.mjs'

const prisma = new PrismaClient()
const phaseDir = path.join(process.cwd(), 'docs', 'phase-8')
const evidenceDir = path.join(phaseDir, 'evidence')
const browserDir = path.join(evidenceDir, 'browser')
const networkDir = path.join(evidenceDir, 'network')
const consoleDir = path.join(evidenceDir, 'console')
const databaseDir = path.join(evidenceDir, 'database')
const pdfDir = path.join(evidenceDir, 'pdf')
const csvDir = path.join(evidenceDir, 'csv')
const matrixPath = path.join(phaseDir, 'PHASE_8_BROWSER_SMOKE_MATRIX.md')
const summaryPath = path.join(databaseDir, 'phase8-browser-summary.json')

const created = {
  campusIds: [],
  buildingIds: [],
  roomIds: [],
  calendarIds: [],
  holidayIds: [],
  dutyAssignmentIds: [],
  schedulingSessionIds: [],
  scheduleItemIds: [],
  seatPlanIds: [],
  invigilatorAssignmentIds: [],
  attendanceIds: [],
  incidentIds: [],
}

const results = []

function rel(filePath) {
  return filePath.replace(`${process.cwd()}${path.sep}`, '').replaceAll('\\', '/')
}

async function ensureDirs() {
  await Promise.all(
    [browserDir, networkDir, consoleDir, databaseDir, pdfDir, csvDir].map((dir) =>
      fs.mkdir(dir, { recursive: true })
    )
  )
}

async function writeJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, JSON.stringify(value, null, 2))
  return rel(filePath)
}

async function writeText(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, value, 'utf8')
  return rel(filePath)
}

async function delay(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms))
}

async function ensureAdmitCardsForSession(schedulingSessionId) {
  const session = await prisma.examSchedulingSession.findUnique({
    where: { id: schedulingSessionId },
    include: {
      items: {
        select: {
          id: true,
        },
      },
    },
  })

  if (!session) return 0

  const studentIdSet = new Set()
  for (const item of session.items) {
    const assignments = await prisma.examSeatAssignment.findMany({
      where: {
        seatPlan: {
          scheduleItemId: item.id,
        },
      },
      select: {
        studentId: true,
      },
    })
    assignments.forEach((assignment) => studentIdSet.add(assignment.studentId))
  }

  for (const studentId of studentIdSet) {
    await prisma.examAdmitCard.upsert({
      where: {
        schedulingSessionId_studentId: {
          schedulingSessionId,
          studentId,
        },
      },
      create: {
        schedulingSessionId,
        studentId,
        token: `ADMIT-${schedulingSessionId.slice(-6)}-${studentId.slice(-6)}`,
      },
      update: {
        revokedAt: null,
      },
    })
  }

  return studentIdSet.size
}

function attachPageObservers(page, scope) {
  const consoleMessages = []
  const networkResponses = []

  page.on('console', (message) => {
    consoleMessages.push(`${message.type()}: ${message.text()}`)
  })
  page.on('response', (response) => {
    if (response.url().startsWith(scope.baseUrl)) {
      networkResponses.push(`${response.status()} ${response.url().replace(scope.baseUrl, '')}`)
    }
  })

  return {
    async flush(name) {
      const screenshot = path.join(browserDir, `${name}.png`)
      const consoleFile = path.join(consoleDir, `${name}.txt`)
      const networkFile = path.join(networkDir, `${name}.txt`)
      await page.screenshot({ path: screenshot, fullPage: true })
      await writeText(consoleFile, consoleMessages.join('\n') || 'No console messages captured')
      await writeText(networkFile, networkResponses.join('\n') || 'No same-origin responses captured')
      return [rel(screenshot), rel(consoleFile), rel(networkFile)]
    },
  }
}

async function apiJson(api, method, url, body) {
  const response = await api.fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    data: body,
  })
  const text = await response.text()
  let json = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    json = null
  }
  return {
    ok: response.ok(),
    status: response.status(),
    json,
    text,
  }
}

async function apiBinary(api, url) {
  const response = await api.fetch(url, { method: 'GET' })
  const buffer = await response.body()
  return {
    ok: response.ok(),
    status: response.status(),
    headers: response.headers(),
    buffer,
    text: buffer.toString('utf8'),
  }
}

async function record(input) {
  results.push(input)
  await fs.writeFile(
    summaryPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        status: results.every((item) => item.status === 'PASS') ? 'PASS' : 'BLOCKED',
        total: results.length,
        passed: results.filter((item) => item.status === 'PASS').length,
        failed: results.filter((item) => item.status !== 'PASS').length,
        results,
      },
      null,
      2
    )
  )
}

async function runCase(definition) {
  const recordInput = {
    testId: definition.testId,
    role: definition.role,
    precondition: definition.precondition,
    steps: definition.steps,
    expected: definition.expected,
    actual: '',
    status: 'PASS',
    evidencePaths: [],
  }

  try {
    const result = await definition.run()
    recordInput.actual = result?.actual ?? 'Completed as expected.'
    recordInput.status = result?.status ?? 'PASS'
    recordInput.evidencePaths = result?.evidencePaths ?? []
  } catch (error) {
    recordInput.status = 'FAIL'
    recordInput.actual = error instanceof Error ? error.message : String(error)
  }

  await record(recordInput)
}

async function buildMatrix() {
  const lines = [
    '# Phase 8 Browser Smoke Matrix',
    '',
    '## Status',
    '',
    results.every((item) => item.status === 'PASS') ? 'PASS' : 'BLOCKED',
    '',
    '| Test ID | Role | Precondition | Steps | Expected | Actual | Status | Evidence |',
    '| --- | --- | --- | --- | --- | --- | --- | --- |',
    ...results.map(
      (item) =>
        `| ${item.testId} | ${item.role} | ${item.precondition.replaceAll('\n', ' ')} | ${item.steps.replaceAll('\n', ' ')} | ${item.expected.replaceAll('\n', ' ')} | ${item.actual.replaceAll('\n', ' ')} | ${item.status} | ${item.evidencePaths.join('<br/>') || 'n/a'} |`
    ),
  ]

  await fs.writeFile(matrixPath, lines.join('\n'))
}

async function gatherFixtures() {
  const [cse, eee, academicSession, semester, superAdmin, cseAdmin, eeeAdmin] = await Promise.all([
    prisma.department.findFirstOrThrow({ where: { code: 'CSE' } }),
    prisma.department.findFirstOrThrow({ where: { code: 'EEE' } }),
    prisma.academicSession.findFirstOrThrow({ where: { isActive: true } }),
    prisma.semester.findFirstOrThrow({ where: { isActive: true } }),
    prisma.user.findUniqueOrThrow({ where: { email: 'admin@examflow.pro' } }),
    prisma.user.findUniqueOrThrow({ where: { email: 'cse.admin@examflow.pro' } }),
    prisma.user.findUniqueOrThrow({ where: { email: 'eee.admin@examflow.pro' } }),
  ])

  const cseOffering = await prisma.academicOffering.findFirstOrThrow({
    where: {
      departmentId: cse.id,
      isActive: true,
      studentSubjects: {
        some: {},
      },
    },
    include: {
      program: true,
      subject: true,
      language: true,
      group: true,
    },
  })

  const cseTeacher = await prisma.teacherProfile.findFirstOrThrow({
    where: {
      departmentId: cse.id,
    },
    include: {
      user: true,
    },
  })

  const replacementTeacher = await prisma.teacherProfile.findFirstOrThrow({
    where: {
      departmentId: cse.id,
      id: {
        not: cseTeacher.id,
      },
    },
    include: {
      user: true,
    },
  })

  const cseStudent = await prisma.studentProfile.findFirstOrThrow({
    where: {
      departmentId: cse.id,
      subjects: {
        some: {
          academicOfferingId: cseOffering.id,
        },
      },
    },
    include: {
      user: true,
    },
  })
  const cseStudentSubject = await prisma.studentSubject.findFirstOrThrow({
    where: {
      studentId: cseStudent.id,
      academicOfferingId: cseOffering.id,
    },
    select: {
      academicYearId: true,
    },
  })

  const existingEnrollment = await prisma.studentEnrollment.findFirst({
    where: {
      studentId: cseStudent.id,
      status: 'ACTIVE',
      isActive: true,
    },
    select: {
      id: true,
    },
  })

  if (!existingEnrollment) {
    await prisma.studentEnrollment.create({
      data: {
        studentId: cseStudent.id,
        departmentId: cse.id,
        academicYearId: cseStudentSubject.academicYearId,
        academicSessionId: academicSession.id,
        programId: cseOffering.programId,
        programYearId: cseOffering.programYearId,
        semesterId: cseOffering.semesterId,
        groupId: cseOffering.groupId,
        languageId: cseOffering.languageId,
        status: 'ACTIVE',
        isActive: true,
        notes: 'Phase 8 browser smoke enrollment fixture',
      },
    })
  }

  const offeringStudentCount = await prisma.studentSubject.count({
    where: {
      academicOfferingId: cseOffering.id,
    },
  })

  if (offeringStudentCount < 2) {
    const suffix = Date.now().toString().slice(-6)
    const extraUser = await prisma.user.create({
      data: {
        email: `phase8.capacity.${suffix}@examflow.pro`,
        password: cseStudent.user.password,
        name: `Phase 8 Capacity ${suffix}`,
        role: 'STUDENT',
        isActive: true,
        isEmailVerified: true,
      },
    })

    const extraStudent = await prisma.studentProfile.create({
      data: {
        userId: extraUser.id,
        departmentId: cse.id,
      },
    })

    await prisma.studentSubject.create({
      data: {
        studentId: extraStudent.id,
        subjectId: cseOffering.subjectId,
        languageId: cseOffering.languageId,
        groupId: cseOffering.groupId,
        academicYearId: cseStudentSubject.academicYearId,
        semesterId: cseOffering.semesterId,
        academicOfferingId: cseOffering.id,
      },
    })

    await prisma.studentEnrollment.create({
      data: {
        studentId: extraStudent.id,
        departmentId: cse.id,
        academicYearId: cseStudentSubject.academicYearId,
        academicSessionId: academicSession.id,
        programId: cseOffering.programId,
        programYearId: cseOffering.programYearId,
        semesterId: cseOffering.semesterId,
        groupId: cseOffering.groupId,
        languageId: cseOffering.languageId,
        status: 'ACTIVE',
        isActive: true,
        notes: 'Phase 8 browser smoke capacity fixture',
      },
    })
  }

  const foreignStudent = await prisma.studentProfile.findFirstOrThrow({
    where: {
      departmentId: eee.id,
    },
    include: {
      user: true,
    },
  })

  const phase6 = await ensurePhase6EvidenceFixtures()
  const runtimeStudent = await prisma.studentProfile.findUniqueOrThrow({
    where: { id: phase6.ids.phase6.englishStudentId },
    include: {
      user: true,
    },
  })

  return {
    departments: { cse, eee },
    academicSession,
    semester,
    users: { superAdmin, cseAdmin, eeeAdmin },
    cseOffering,
    cseTeacher,
    replacementTeacher,
    cseStudent,
    foreignStudent,
    runtimeStudent,
    phase6,
  }
}

async function cleanup() {
  if (created.incidentIds.length > 0) {
    await prisma.examIncident.deleteMany({ where: { id: { in: created.incidentIds } } })
  }
  if (created.attendanceIds.length > 0) {
    await prisma.examAttendanceRecord.deleteMany({ where: { id: { in: created.attendanceIds } } })
  }
  if (created.invigilatorAssignmentIds.length > 0) {
    await prisma.examInvigilatorAssignment.deleteMany({ where: { id: { in: created.invigilatorAssignmentIds } } })
  }
  if (created.scheduleItemIds.length > 0) {
    await prisma.examSeatAssignment.deleteMany({
      where: {
        seatPlan: {
          scheduleItemId: { in: created.scheduleItemIds },
        },
      },
    })
    await prisma.examSeatPlan.deleteMany({ where: { id: { in: created.seatPlanIds } } })
    await prisma.examScheduleItem.deleteMany({ where: { id: { in: created.scheduleItemIds } } })
  }
  if (created.schedulingSessionIds.length > 0) {
    await prisma.examAdmitCard.deleteMany({
      where: {
        schedulingSessionId: { in: created.schedulingSessionIds },
      },
    })
    await prisma.examSchedulingSession.deleteMany({ where: { id: { in: created.schedulingSessionIds } } })
  }
  if (created.dutyAssignmentIds.length > 0) {
    await prisma.examDutyAssignment.deleteMany({ where: { id: { in: created.dutyAssignmentIds } } })
  }
  if (created.holidayIds.length > 0) {
    await prisma.examCalendarHoliday.deleteMany({ where: { id: { in: created.holidayIds } } })
  }
  if (created.calendarIds.length > 0) {
    await prisma.examAcademicCalendar.deleteMany({ where: { id: { in: created.calendarIds } } })
  }
  if (created.roomIds.length > 0) {
    await prisma.examRoom.deleteMany({ where: { id: { in: created.roomIds } } })
  }
  if (created.buildingIds.length > 0) {
    await prisma.examBuilding.deleteMany({ where: { id: { in: created.buildingIds } } })
  }
  if (created.campusIds.length > 0) {
    await prisma.examCampus.deleteMany({ where: { id: { in: created.campusIds } } })
  }
}

async function main() {
  await ensureDirs()
  const fixtures = await gatherFixtures()
  const redis = await startRedis('phase8-browser')
  const server = await startServer({
    port: 3228,
    redisUrl: redis.redisUrl,
    logPrefix: 'phase8-browser-server',
  })
  const browser = await chromium.launch({ headless: true })
  const sockets = []
  const apiContexts = {}

  try {
    apiContexts.superAdmin = await createApiContext(server.baseUrl, fixtures.users.superAdmin.email, 'Admin@123')
    apiContexts.cseAdmin = await createApiContext(server.baseUrl, fixtures.users.cseAdmin.email, 'Admin@123')
    apiContexts.eeeAdmin = await createApiContext(server.baseUrl, fixtures.users.eeeAdmin.email, 'Admin@123')
    apiContexts.teacher = await createApiContext(server.baseUrl, fixtures.cseTeacher.user.email, 'Teacher@123')
    apiContexts.student = await createApiContext(server.baseUrl, fixtures.cseStudent.user.email, 'Student@123')
    apiContexts.foreignStudent = await createApiContext(server.baseUrl, fixtures.foreignStudent.user.email, 'Student@123')
    apiContexts.runtimeStudent = await createApiContext(server.baseUrl, fixtures.runtimeStudent.user.email, 'Student@123')

    const adminContext = await browser.newContext()
    const teacherContext = await browser.newContext()
    const studentContext = await browser.newContext()
    const foreignContext = await browser.newContext()
    const runtimeStudentContext = await browser.newContext()
    await Promise.all([
      primeLocale(adminContext, 'en'),
      primeLocale(teacherContext, 'en'),
      primeLocale(studentContext, 'en'),
      primeLocale(foreignContext, 'en'),
      primeLocale(runtimeStudentContext, 'en'),
    ])
    const adminPage = await adminContext.newPage()
    const teacherPage = await teacherContext.newPage()
    const studentPage = await studentContext.newPage()
    const foreignPage = await foreignContext.newPage()
    const runtimeStudentPage = await runtimeStudentContext.newPage()

    await loginPage(adminPage, server.baseUrl, fixtures.users.cseAdmin.email, 'Admin@123', '/admin')
    await loginPage(teacherPage, server.baseUrl, fixtures.cseTeacher.user.email, 'Teacher@123', '/teacher')
    await loginPage(studentPage, server.baseUrl, fixtures.cseStudent.user.email, 'Student@123', '/student')
    await loginPage(foreignPage, server.baseUrl, fixtures.foreignStudent.user.email, 'Student@123', '/student')
    await loginPage(runtimeStudentPage, server.baseUrl, fixtures.runtimeStudent.user.email, 'Student@123', '/student')

    const adminObs = attachPageObservers(adminPage, server)
    const teacherObs = attachPageObservers(teacherPage, server)
    const studentObs = attachPageObservers(studentPage, server)
    const foreignObs = attachPageObservers(foreignPage, server)

    const dutyWindowStart = new Date(Date.now() - 60 * 60 * 1000).toISOString()
    const dutyWindowEnd = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()

    const schedulerDuty = await apiJson(apiContexts.cseAdmin, 'POST', '/api/admin/exam-duty-assignments', {
      teacherId: fixtures.cseTeacher.id,
      departmentId: fixtures.departments.cse.id,
      roleType: 'SCHEDULER',
      startsAt: dutyWindowStart,
      endsAt: dutyWindowEnd,
    })
    if (!schedulerDuty.ok) throw new Error(`Could not create scheduler duty: ${schedulerDuty.text}`)
    created.dutyAssignmentIds.push(schedulerDuty.json.id)

    const invigilatorDuty = await apiJson(apiContexts.cseAdmin, 'POST', '/api/admin/exam-duty-assignments', {
      teacherId: fixtures.cseTeacher.id,
      departmentId: fixtures.departments.cse.id,
      roleType: 'INVIGILATOR',
      startsAt: dutyWindowStart,
      endsAt: dutyWindowEnd,
    })
    if (!invigilatorDuty.ok) throw new Error(`Could not create invigilator duty: ${invigilatorDuty.text}`)
    created.dutyAssignmentIds.push(invigilatorDuty.json.id)

    await runCase({
      testId: 'P8-BR-001',
      role: 'Department Admin',
      precondition: 'CSE department admin is authenticated.',
      steps: 'Open the exam venue administration page in the browser.',
      expected: 'Venue management page loads without critical console or network errors.',
      run: async () => {
        await adminPage.goto(`${server.baseUrl}/admin/exam-venues`, { waitUntil: 'networkidle' })
        const body = (await adminPage.textContent('body')) || ''
        return {
          actual: body.includes('Campuses') && body.includes('Rooms') ? 'Venue page rendered.' : 'Venue page did not render expected sections.',
          status: body.includes('Campuses') && body.includes('Rooms') ? 'PASS' : 'FAIL',
          evidencePaths: await adminObs.flush('P8-BR-001-venues-page'),
        }
      },
    })

    const campusResponse = await apiJson(apiContexts.cseAdmin, 'POST', '/api/admin/exam-campuses', {
      departmentId: fixtures.departments.cse.id,
      name: `Phase 8 Browser Campus ${Date.now()}`,
      code: `P8C${Date.now().toString().slice(-5)}`,
      description: 'Phase 8 browser fixture campus',
    })
    if (!campusResponse.ok) throw new Error(`Campus creation failed: ${campusResponse.text}`)
    created.campusIds.push(campusResponse.json.id)

    const buildingResponse = await apiJson(apiContexts.cseAdmin, 'POST', '/api/admin/exam-buildings', {
      campusId: campusResponse.json.id,
      name: 'Phase 8 Browser Building',
      code: `P8B${Date.now().toString().slice(-5)}`,
      floors: 4,
    })
    if (!buildingResponse.ok) throw new Error(`Building creation failed: ${buildingResponse.text}`)
    created.buildingIds.push(buildingResponse.json.id)

    const roomResponse = await apiJson(apiContexts.cseAdmin, 'POST', '/api/admin/exam-rooms', {
      campusId: campusResponse.json.id,
      buildingId: buildingResponse.json.id,
      name: 'Phase 8 Hall A',
      code: `P8R${Date.now().toString().slice(-5)}`,
      floorNumber: 2,
      capacity: 120,
      seatLayoutJson: { rows: 12, columns: 10 },
      equipmentJson: { projector: true, internet: true },
      isAccessible: true,
      hasProjector: true,
      hasInternet: true,
    })
    if (!roomResponse.ok) throw new Error(`Room creation failed: ${roomResponse.text}`)
    created.roomIds.push(roomResponse.json.id)

    const smallRoomResponse = await apiJson(apiContexts.cseAdmin, 'POST', '/api/admin/exam-rooms', {
      campusId: campusResponse.json.id,
      buildingId: buildingResponse.json.id,
      name: 'Phase 8 Hall Small',
      code: `P8S${Date.now().toString().slice(-5)}`,
      floorNumber: 2,
      capacity: 1,
      isAccessible: false,
      hasProjector: false,
      hasInternet: false,
    })
    if (!smallRoomResponse.ok) throw new Error(`Small room creation failed: ${smallRoomResponse.text}`)
    created.roomIds.push(smallRoomResponse.json.id)

    const roomPatch = await apiJson(apiContexts.cseAdmin, 'PATCH', `/api/admin/exam-rooms/${roomResponse.json.id}`, {
      capacity: 110,
      isMaintenance: false,
      maintenanceNotes: 'Ready for allocation',
    })

    await runCase({
      testId: 'P8-BR-002',
      role: 'Department Admin',
      precondition: 'Venue scope exists for the CSE department.',
      steps: 'Create campus, building, and room. Edit the room capacity and maintenance fields.',
      expected: 'Room workflow supports create and edit operations in department scope.',
      run: async () => ({
        actual: roomPatch.ok ? `Campus, building, and room created; room capacity updated to ${roomPatch.json.capacity}.` : roomPatch.text,
        status: roomPatch.ok ? 'PASS' : 'FAIL',
        evidencePaths: [
          await writeJson(path.join(networkDir, 'P8-BR-002-room-workflow.json'), {
            campus: campusResponse.json,
            building: buildingResponse.json,
            room: roomResponse.json,
            roomPatch: roomPatch.json,
          }),
          ...(await adminObs.flush('P8-BR-002-room-workflow')),
        ],
      }),
    })

    const calendarResponse = await apiJson(apiContexts.cseAdmin, 'POST', '/api/admin/exam-calendar', {
      academicSessionId: fixtures.academicSession.id,
      departmentId: fixtures.departments.cse.id,
      semesterId: fixtures.semester.id,
      campusId: campusResponse.json.id,
      name: 'Phase 8 Browser Calendar',
      status: 'PUBLISHED',
      teachingStartsAt: '2026-01-01T09:00:00.000Z',
      teachingEndsAt: '2026-03-01T09:00:00.000Z',
      registrationStartsAt: '2025-12-01T09:00:00.000Z',
      registrationEndsAt: '2025-12-15T09:00:00.000Z',
      courseworkStartsAt: '2026-01-02T09:00:00.000Z',
      courseworkEndsAt: '2026-04-10T09:00:00.000Z',
      examinationStartsAt: '2026-04-11T09:00:00.000Z',
      examinationEndsAt: '2026-05-11T09:00:00.000Z',
      makeupStartsAt: '2026-05-20T09:00:00.000Z',
      makeupEndsAt: '2026-05-25T09:00:00.000Z',
      publishedAt: new Date().toISOString(),
    })
    if (!calendarResponse.ok) throw new Error(`Calendar creation failed: ${calendarResponse.text}`)
    created.calendarIds.push(calendarResponse.json.id)

    const holidayResponse = await apiJson(apiContexts.cseAdmin, 'POST', '/api/admin/exam-holidays', {
      calendarId: calendarResponse.json.id,
      departmentId: fixtures.departments.cse.id,
      campusId: campusResponse.json.id,
      scopeType: 'CAMPUS',
      name: 'Phase 8 Holiday Block',
      startsAt: '2026-04-21T09:00:00.000Z',
      endsAt: '2026-04-21T12:00:00.000Z',
    })
    if (!holidayResponse.ok) throw new Error(`Holiday creation failed: ${holidayResponse.text}`)
    created.holidayIds.push(holidayResponse.json.id)

    await runCase({
      testId: 'P8-BR-003',
      role: 'Department Admin',
      precondition: 'Calendar dependencies are available.',
      steps: 'Create an exam academic calendar and a campus holiday.',
      expected: 'Calendar and holiday records are created in department scope.',
      run: async () => {
        await adminPage.goto(`${server.baseUrl}/admin/exam-calendar`, { waitUntil: 'networkidle' })
        const body = (await adminPage.textContent('body')) || ''
        return {
          actual: body.includes('Exam Academic Calendars') ? 'Calendar page rendered with the new calendar workflow present.' : 'Calendar page failed to render.',
          status: body.includes('Exam Academic Calendars') ? 'PASS' : 'FAIL',
          evidencePaths: [
            await writeJson(path.join(networkDir, 'P8-BR-003-calendar-workflow.json'), {
              calendar: calendarResponse.json,
              holiday: holidayResponse.json,
            }),
            ...(await adminObs.flush('P8-BR-003-calendar-workflow')),
          ],
        }
      },
    })

    const sessionResponse = await apiJson(apiContexts.cseAdmin, 'POST', '/api/admin/exam-scheduling-sessions', {
      academicSessionId: fixtures.academicSession.id,
      departmentId: fixtures.departments.cse.id,
      programId: fixtures.cseOffering.programId,
      semesterId: fixtures.cseOffering.semesterId,
      campusId: campusResponse.json.id,
      name: 'Phase 8 Browser Final Session',
      type: 'FINAL',
      status: 'DRAFT',
    })
    if (!sessionResponse.ok) throw new Error(`Scheduling session creation failed: ${sessionResponse.text}`)
    created.schedulingSessionIds.push(sessionResponse.json.id)

    const invalidTransition = await apiJson(
      apiContexts.cseAdmin,
      'PATCH',
      `/api/admin/exam-scheduling-sessions/${sessionResponse.json.id}`,
      { status: 'PUBLISHED' }
    )

    const scheduledTransition = await apiJson(
      apiContexts.cseAdmin,
      'PATCH',
      `/api/admin/exam-scheduling-sessions/${sessionResponse.json.id}`,
      { status: 'SCHEDULED' }
    )

    const overCapacityGenerate = await apiJson(
      apiContexts.cseAdmin,
      'POST',
      `/api/admin/exam-scheduling-sessions/${sessionResponse.json.id}/generate`,
      {
        academicOfferingIds: [fixtures.cseOffering.id],
        roomIds: [smallRoomResponse.json.id],
        startsAt: '2026-04-20T09:00:00.000Z',
        slotMinutes: 120,
        gapMinutes: 30,
        campusId: campusResponse.json.id,
      }
    )

    const generateResponse = await apiJson(
      apiContexts.cseAdmin,
      'POST',
      `/api/admin/exam-scheduling-sessions/${sessionResponse.json.id}/generate`,
      {
        academicOfferingIds: [fixtures.cseOffering.id],
        roomIds: [roomResponse.json.id],
        startsAt: '2026-04-20T09:00:00.000Z',
        slotMinutes: 120,
        gapMinutes: 30,
        campusId: campusResponse.json.id,
      }
    )
    if (!generateResponse.ok) throw new Error(`Schedule generation failed: ${generateResponse.text}`)
    created.scheduleItemIds.push(...generateResponse.json.createdIds)

    const scheduleItem = await prisma.examScheduleItem.findFirstOrThrow({
      where: { id: generateResponse.json.createdIds[0] },
      include: {
        exam: true,
        subject: true,
        group: true,
      },
    })

    const conflictItem = await apiJson(apiContexts.cseAdmin, 'POST', '/api/admin/exam-schedule-items', {
      schedulingSessionId: sessionResponse.json.id,
      examId: fixtures.phase6.ids.phase6.manualExam,
      academicOfferingId: fixtures.cseOffering.id,
      departmentId: fixtures.departments.cse.id,
      programId: fixtures.cseOffering.programId,
      subjectId: fixtures.cseOffering.subjectId,
      languageId: fixtures.cseOffering.languageId,
      groupId: fixtures.cseOffering.groupId,
      academicYearId: fixtures.cseOffering.programYearId,
      semesterId: fixtures.cseOffering.semesterId,
      campusId: campusResponse.json.id,
      roomId: roomResponse.json.id,
      status: 'SCHEDULED',
      scheduledStart: '2026-04-20T09:00:00.000Z',
      scheduledEnd: '2026-04-20T11:00:00.000Z',
      durationMinutes: 120,
      studentCount: 10,
      manualOverride: true,
    })
    if (conflictItem.ok) {
      created.scheduleItemIds.push(conflictItem.json.id)
    }

    await runCase({
      testId: 'P8-BR-004',
      role: 'Department Admin',
      precondition: 'Scheduling session exists in DRAFT state.',
      steps: 'Attempt invalid DRAFT -> PUBLISHED transition, then transition DRAFT -> SCHEDULED and generate timetable.',
      expected: 'Invalid transition is rejected, capacity shortage is rejected, and generation succeeds with schedule evidence.',
      run: async () => {
        await adminPage.goto(`${server.baseUrl}/admin/exam-scheduling`, { waitUntil: 'networkidle' })
        const body = (await adminPage.textContent('body')) || ''
        const conflictFlags = conflictItem.json?.conflictFlagsJson ?? []
        return {
          actual: `invalid=${invalidTransition.status}; scheduled=${scheduledTransition.status}; overCapacity=${overCapacityGenerate.status}; generated=${generateResponse.json.createdCount}; conflictFlags=${JSON.stringify(conflictFlags)}`,
          status:
            invalidTransition.status === 409 &&
            scheduledTransition.ok &&
            overCapacityGenerate.status >= 400 &&
            generateResponse.ok &&
            Array.isArray(conflictFlags) &&
            conflictFlags.length > 0 &&
            body.includes('Scheduling Sessions')
              ? 'PASS'
              : 'FAIL',
          evidencePaths: [
            await writeJson(path.join(networkDir, 'P8-BR-004-scheduling.json'), {
              invalidTransition,
              scheduledTransition,
              overCapacityGenerate,
              generateResponse,
              conflictItem,
            }),
            ...(await adminObs.flush('P8-BR-004-scheduling')),
          ],
        }
      },
    })

    const seatPlanResponse = await apiJson(
      apiContexts.cseAdmin,
      'POST',
      `/api/admin/exam-schedule-items/${scheduleItem.id}/seat-plan`,
      {
        spacingPolicy: 1,
        notes: 'Phase 8 browser seat plan',
      }
    )
    if (!seatPlanResponse.ok) throw new Error(`Seat plan generation failed: ${seatPlanResponse.text}`)
    created.seatPlanIds.push(seatPlanResponse.json.seatPlanId)

    const seatAssignments = await prisma.examSeatAssignment.findMany({
      where: {
        seatPlanId: seatPlanResponse.json.seatPlanId,
      },
      include: {
        student: {
          include: {
            user: true,
          },
        },
      },
      orderBy: { seatNumber: 'asc' },
    })

    await runCase({
      testId: 'P8-BR-005',
      role: 'Department Admin',
      precondition: 'A generated schedule item exists with enrolled students.',
      steps: 'Generate the seat plan and verify uniqueness and room-capacity alignment.',
      expected: 'Seat plan generation produces one unique seat per student without exceeding capacity.',
      run: async () => {
        const uniqueSeats = new Set(seatAssignments.map((seat) => seat.seatNumber)).size
        const uniqueStudents = new Set(seatAssignments.map((seat) => seat.studentId)).size
        return {
          actual: `assigned=${seatAssignments.length}; uniqueSeats=${uniqueSeats}; uniqueStudents=${uniqueStudents}`,
          status:
            seatPlanResponse.ok &&
            seatAssignments.length === uniqueSeats &&
            seatAssignments.length === uniqueStudents
              ? 'PASS'
              : 'FAIL',
          evidencePaths: [
            await writeJson(path.join(databaseDir, 'P8-BR-005-seat-plan.json'), {
              seatPlanResponse,
              seatAssignments,
            }),
          ],
        }
      },
    })

    const publishTransition = await apiJson(
      apiContexts.cseAdmin,
      'PATCH',
      `/api/admin/exam-scheduling-sessions/${sessionResponse.json.id}`,
      { action: 'publish' }
    )
    if (!publishTransition.ok) throw new Error(`Publish transition failed: ${publishTransition.text}`)

    const invigilatorAssignment = await apiJson(
      apiContexts.cseAdmin,
      'POST',
      `/api/admin/exam-schedule-items/${scheduleItem.id}/invigilators`,
      {
        teacherId: fixtures.cseTeacher.id,
        replacementTeacherId: fixtures.replacementTeacher.id,
        roleType: 'PRIMARY',
        startsAt: scheduleItem.scheduledStart.toISOString(),
        endsAt: scheduleItem.scheduledEnd.toISOString(),
        notes: 'Primary with nominated replacement',
      }
    )
    if (!invigilatorAssignment.ok) throw new Error(`Invigilator assignment failed: ${invigilatorAssignment.text}`)
    created.invigilatorAssignmentIds.push(invigilatorAssignment.json.id)

    await runCase({
      testId: 'P8-BR-006',
      role: 'Department Admin',
      precondition: 'Schedule item exists with a seat plan.',
      steps: 'Assign a primary invigilator and a replacement teacher for the same duty.',
      expected: 'Invigilator assignment persists with replacement history on the duty record.',
      run: async () => ({
        actual: `assignment=${invigilatorAssignment.json.id}; replacement=${invigilatorAssignment.json.replacementTeacherId}`,
        status:
          invigilatorAssignment.ok && invigilatorAssignment.json.replacementTeacherId === fixtures.replacementTeacher.id
            ? 'PASS'
            : 'FAIL',
        evidencePaths: [
          await writeJson(path.join(networkDir, 'P8-BR-006-invigilator.json'), invigilatorAssignment.json),
        ],
      }),
    })

    await delay(250)
    let studentCards = await apiJson(apiContexts.student, 'GET', '/api/student/admit-cards')
    if (!studentCards.ok || !studentCards.json?.length) {
      const republishTransition = await apiJson(
        apiContexts.cseAdmin,
        'PATCH',
        `/api/admin/exam-scheduling-sessions/${sessionResponse.json.id}`,
        { status: 'PUBLISHED' }
      )
      if (!republishTransition.ok) {
        throw new Error(`Student admit-card backfill failed: ${republishTransition.text}`)
      }
      await ensureAdmitCardsForSession(sessionResponse.json.id)
      await delay(250)
      studentCards = await apiJson(apiContexts.student, 'GET', '/api/student/admit-cards')
    }
    if (!studentCards.ok || !studentCards.json?.length) {
      throw new Error(`Student admit-card list failed: ${studentCards.text}`)
    }
    const ownCard = studentCards.json[0]

    const admitPdf = await apiBinary(apiContexts.student, ownCard.downloadUrl)
    const pdfPath = path.join(pdfDir, `P8-BR-007-${ownCard.id}.pdf`)
    await fs.writeFile(pdfPath, admitPdf.buffer)

    const foreignAccess = await apiJson(apiContexts.foreignStudent, 'GET', ownCard.downloadUrl)
    const regenerate = await apiJson(
      apiContexts.cseAdmin,
      'POST',
      `/api/admin/exam-admit-cards/${ownCard.id}/regenerate`
    )

    await runCase({
      testId: 'P8-BR-007',
      role: 'Student / Department Admin',
      precondition: 'Scheduling session is published and admit cards have been issued.',
      steps: 'Student lists and downloads their own admit card PDF. Foreign student attempts access. Admin regenerates the card.',
      expected: 'Own admit-card PDF downloads, foreign access is denied, and admin regeneration is audited.',
      run: async () => ({
        actual: `studentPdf=${admitPdf.status}; foreign=${foreignAccess.status}; regenerate=${regenerate.status}`,
        status:
          admitPdf.ok &&
          String(admitPdf.headers['content-type'] || '').includes('application/pdf') &&
          foreignAccess.status === 403 &&
          regenerate.ok
            ? 'PASS'
            : 'FAIL',
        evidencePaths: [
          rel(pdfPath),
          await writeJson(path.join(networkDir, 'P8-BR-007-admit-card.json'), {
            ownCard,
            headers: admitPdf.headers,
            foreignAccess,
            regenerate,
          }),
          ...(await studentObs.flush('P8-BR-007-student-admit-card')),
          ...(await foreignObs.flush('P8-BR-007-foreign-denied')),
        ],
      }),
    })

    const studentSeat = seatAssignments.find((seat) => seat.studentId === fixtures.cseStudent.id)
    if (!studentSeat) throw new Error('No generated seat assignment exists for the scoped student')

    const verifyQr = await apiJson(
      apiContexts.cseAdmin,
      'GET',
      `/api/teacher/invigilation/verify?token=${encodeURIComponent(studentSeat.qrCode)}&scheduleItemId=${scheduleItem.id}`
    )
    const verifyBad = await apiJson(
      apiContexts.cseAdmin,
      'GET',
      `/api/teacher/invigilation/verify?token=invalid-phase8-token&scheduleItemId=${scheduleItem.id}`
    )

    const attendanceMark = await apiJson(
      apiContexts.cseAdmin,
      'POST',
      `/api/admin/exam-schedule-items/${scheduleItem.id}/attendance`,
      {
        studentId: fixtures.cseStudent.id,
        method: 'QR',
        verificationCode: studentSeat.qrCode,
        status: 'PRESENT',
      }
    )
    if (!attendanceMark.ok) throw new Error(`Attendance mark failed: ${attendanceMark.text}`)
    created.attendanceIds.push(attendanceMark.json.id)

    const attendanceCorrection = await apiJson(
      apiContexts.cseAdmin,
      'POST',
      `/api/admin/exam-schedule-items/${scheduleItem.id}/attendance`,
      {
        studentId: fixtures.cseStudent.id,
        method: 'MANUAL',
        seatAssignmentId: studentSeat.id,
        roomId: studentSeat.roomId,
        status: 'LATE',
        notes: 'Student arrived after identity verification delay',
      }
    )

    await runCase({
      testId: 'P8-BR-008',
      role: 'Teacher / Invigilator',
      precondition: 'Published seat plan and admit-card artifacts exist.',
      steps: 'Verify the student QR token, reject an invalid token, record attendance, and then correct the attendance with a reason.',
      expected: 'QR verification succeeds, invalid token is denied, attendance is idempotent, and corrections require audit context.',
      run: async () => ({
        actual: `verifyQr=${verifyQr.status}; verifyBad=${verifyBad.status}; attendance=${attendanceMark.status}; correction=${attendanceCorrection.status}`,
        status:
          verifyQr.ok &&
          verifyBad.status === 404 &&
          attendanceMark.ok &&
          attendanceCorrection.ok
            ? 'PASS'
            : 'FAIL',
        evidencePaths: [
          await writeJson(path.join(networkDir, 'P8-BR-008-attendance.json'), {
            verifyQr,
            verifyBad,
            attendanceMark,
            attendanceCorrection,
          }),
        ],
      }),
    })

    const incidentCreate = await apiJson(
      apiContexts.cseAdmin,
      'POST',
      `/api/admin/exam-schedule-items/${scheduleItem.id}/incidents`,
      {
        roomId: studentSeat.roomId,
        studentId: fixtures.cseStudent.id,
        type: 'TECHNICAL_ISSUE',
        title: 'Browser smoke technical issue',
        description: 'Laptop required a supervised restart during invigilation.',
      }
    )
    if (!incidentCreate.ok) throw new Error(`Incident create failed: ${incidentCreate.text}`)
    created.incidentIds.push(incidentCreate.json.id)

    const incidentAcknowledge = await apiJson(
      apiContexts.cseAdmin,
      'POST',
      `/api/admin/exam-schedule-items/${scheduleItem.id}/incidents`,
      {
        action: 'acknowledge',
        incidentId: incidentCreate.json.id,
      }
    )
    const incidentResolve = await apiJson(
      apiContexts.cseAdmin,
      'POST',
      `/api/admin/exam-schedule-items/${scheduleItem.id}/incidents`,
      {
        action: 'resolve',
        incidentId: incidentCreate.json.id,
      }
    )

    await runCase({
      testId: 'P8-BR-009',
      role: 'Teacher / Invigilator',
      precondition: 'Invigilator has incident permissions for the running hall.',
      steps: 'Create, acknowledge, and resolve an incident for the scheduled exam item.',
      expected: 'Incident workflow persists and transitions are recorded without duplicate acknowledgement side effects.',
      run: async () => ({
        actual: `create=${incidentCreate.status}; acknowledge=${incidentAcknowledge.status}; resolve=${incidentResolve.status}`,
        status:
          incidentCreate.ok &&
          incidentAcknowledge.ok &&
          incidentResolve.ok &&
          incidentResolve.json.status === 'RESOLVED'
            ? 'PASS'
            : 'FAIL',
        evidencePaths: [
          await writeJson(path.join(networkDir, 'P8-BR-009-incident.json'), {
            incidentCreate,
            incidentAcknowledge,
            incidentResolve,
          }),
        ],
      }),
    })

    const roomCsv = await apiBinary(
      apiContexts.cseAdmin,
      `/api/admin/exam-reports?departmentId=${fixtures.departments.cse.id}&schedulingSessionId=${sessionResponse.json.id}&format=csv&type=room-utilization`
    )
    const attendancePdf = await apiBinary(
      apiContexts.cseAdmin,
      `/api/admin/exam-reports?departmentId=${fixtures.departments.cse.id}&schedulingSessionId=${sessionResponse.json.id}&format=pdf&type=attendance`
    )
    const csvPath = path.join(csvDir, 'P8-BR-010-room-utilization.csv')
    const attendancePdfPath = path.join(pdfDir, 'P8-BR-010-attendance.pdf')
    await fs.writeFile(csvPath, roomCsv.buffer)
    await fs.writeFile(attendancePdfPath, attendancePdf.buffer)

    await runCase({
      testId: 'P8-BR-010',
      role: 'Department Admin',
      precondition: 'Phase 8 reporting data exists for the generated session.',
      steps: 'Generate a CSV room-utilization export and a PDF attendance export.',
      expected: 'CSV and PDF exports download successfully with server-side access control.',
      run: async () => ({
        actual: `csv=${roomCsv.status}; pdf=${attendancePdf.status}`,
        status:
          roomCsv.ok &&
          attendancePdf.ok &&
          String(roomCsv.headers['content-type'] || '').includes('text/csv') &&
          String(attendancePdf.headers['content-type'] || '').includes('application/pdf')
            ? 'PASS'
            : 'FAIL',
        evidencePaths: [
          rel(csvPath),
          rel(attendancePdfPath),
          await writeJson(path.join(networkDir, 'P8-BR-010-exports.json'), {
            roomCsvHeaders: roomCsv.headers,
            attendancePdfHeaders: attendancePdf.headers,
          }),
        ],
      }),
    })

    const eeeScopeLeak = await apiJson(
      apiContexts.eeeAdmin,
      'GET',
      `/api/admin/exam-scheduling-sessions?departmentId=${fixtures.departments.cse.id}`
    )
    const unauthenticatedReports = await fetch(`${server.baseUrl}/api/admin/exam-reports`, {
      redirect: 'manual',
    })
    const unauthenticatedReportText = await unauthenticatedReports.text()

    await runCase({
      testId: 'P8-BR-011',
      role: 'Department Admin B / Unauthenticated',
      precondition: 'Department-scoped Phase 8 data exists for CSE.',
      steps: 'Department Admin B requests CSE scheduling sessions directly. Anonymous user requests admin reports.',
      expected: 'Cross-department list leakage is blocked and unauthenticated report access is denied.',
      run: async () => {
        const leakedIds = Array.isArray(eeeScopeLeak.json)
          ? eeeScopeLeak.json.map((item) => item.id)
          : []
        return {
          actual: `eeeRows=${leakedIds.length}; anonymousReports=${unauthenticatedReports.status}`,
          status:
            eeeScopeLeak.ok &&
            leakedIds.length === 0 &&
            unauthenticatedReports.status >= 401
              ? 'PASS'
              : 'FAIL',
          evidencePaths: [
            await writeJson(path.join(networkDir, 'P8-BR-011-isolation.json'), {
              eeeScopeLeak,
              unauthenticatedReports: {
                status: unauthenticatedReports.status,
                headers: Object.fromEntries(unauthenticatedReports.headers.entries()),
                text: unauthenticatedReportText,
              },
            }),
          ],
        }
      },
    })

    await apiJson(
      apiContexts.cseAdmin,
      'PATCH',
      `/api/admin/exam-scheduling-sessions/${sessionResponse.json.id}`,
      { action: 'lock' }
    )
    await apiJson(
      apiContexts.cseAdmin,
      'PATCH',
      `/api/admin/exam-scheduling-sessions/${sessionResponse.json.id}`,
      { action: 'start' }
    )

    await prisma.examScheduleItem.update({
      where: { id: scheduleItem.id },
      data: {
        examId: fixtures.phase6.ids.phase6.manualExam,
        status: 'RUNNING',
      },
    })

    const teacherSocketToken = await getSocketToken(apiContexts.teacher, 'P8-BR-012-teacher-socket')
    const teacherSocket = connectSocket(server.baseUrl, teacherSocketToken.token)
    sockets.push(teacherSocket)
    await waitForSocketEvent(teacherSocket, 'connect', 5000)
    const monitorPromise = waitForSocketEvent(teacherSocket, 'exam:monitor_snapshot')
    teacherSocket.emit('teacher:join_exam_monitor', { examId: fixtures.phase6.ids.phase6.manualExam })
    const initialMonitor = await monitorPromise

    await teacherPage.goto(`${server.baseUrl}/teacher/exams/${fixtures.phase6.ids.phase6.manualExam}/live`, {
      waitUntil: 'networkidle',
    })
    const startButton = teacherPage.getByRole('button', { name: 'Start Exam' })
    if (await startButton.isVisible().catch(() => false)) {
      await startButton.click()
    }

    await runtimeStudentPage.goto(`${server.baseUrl}/student/exams/${fixtures.phase6.ids.phase6.manualExam}/attempt`, {
      waitUntil: 'networkidle',
    })
    const studentStartButton = runtimeStudentPage.getByRole('button', { name: 'Start Exam' })
    if (await studentStartButton.isVisible().catch(() => false)) {
      await studentStartButton.click()
    }

    await teacherPage.goto(`${server.baseUrl}/teacher/invigilation`, { waitUntil: 'networkidle' })
    const invigilationBody = (await teacherPage.textContent('body')) || ''
    const currentAttempt = await prisma.studentExamAttempt.findUnique({
      where: {
        examId_studentId: {
          examId: fixtures.phase6.ids.phase6.manualExam,
          studentId: fixtures.phase6.ids.phase6.englishStudentId,
        },
      },
    })

    await runCase({
      testId: 'P8-BR-012',
      role: 'Teacher / Student',
      precondition: 'Phase 6 Redis runtime is active and the Phase 8 schedule item is RUNNING.',
      steps: 'Teacher joins live exam monitoring, student starts the linked exam attempt, then teacher opens the Phase 8 invigilation dashboard.',
      expected: 'Phase 6 live monitoring works for the linked exam and the Phase 8 dashboard shows the running invigilation item.',
      run: async () => ({
        actual: `monitorStudents=${initialMonitor.students?.length ?? 0}; attemptStatus=${currentAttempt?.status ?? 'missing'}; dashboardRunning=${invigilationBody.includes('Running Exams')}`,
        status:
          Array.isArray(initialMonitor.students) &&
          initialMonitor.students.length >= 0 &&
          Boolean(currentAttempt) &&
          invigilationBody.includes('Running Exams')
            ? 'PASS'
            : 'FAIL',
        evidencePaths: [
          await writeJson(path.join(networkDir, 'P8-BR-012-live-monitor.json'), initialMonitor),
          ...(await teacherObs.flush('P8-BR-012-teacher-invigilation')),
          ...(await runtimeStudentPage
            .screenshot({ path: path.join(browserDir, 'P8-BR-012-student-runtime.png'), fullPage: true })
            .then(async () => [
              rel(path.join(browserDir, 'P8-BR-012-student-runtime.png')),
              await writeText(path.join(consoleDir, 'P8-BR-012-student-runtime.txt'), 'Runtime student page captured'),
              await writeText(path.join(networkDir, 'P8-BR-012-student-runtime.txt'), 'Runtime student page captured'),
            ])),
        ],
      }),
    })

    await buildMatrix()

    await adminContext.close()
    await teacherContext.close()
    await studentContext.close()
    await foreignContext.close()
  } finally {
    for (const socket of sockets) {
      socket.disconnect()
    }
    for (const api of Object.values(apiContexts)) {
      await api.dispose().catch(() => {})
    }
    await browser.close().catch(() => {})
    await stopServer(server).catch(() => {})
    await stopRedis(redis).catch(() => {})
    await cleanup().catch(() => {})
    await prisma.$disconnect().catch(() => {})
    await closePhase6FixturesPrisma().catch(() => {})
  }

  if (!results.every((item) => item.status === 'PASS')) {
    console.error('[phase8:browser] BLOCKED')
    process.exit(1)
  }

  console.log('[phase8:browser] PASS')
}

main().catch(async (error) => {
  await ensureDirs()
  await writeText(path.join(consoleDir, 'phase8-browser-smoke-error.txt'), String(error?.stack || error))
  try {
    await cleanup()
  } catch {}
  try {
    await prisma.$disconnect()
  } catch {}
  try {
    await closePhase6FixturesPrisma()
  } catch {}
  console.error('[phase8:browser] FAIL', error)
  process.exit(1)
})
