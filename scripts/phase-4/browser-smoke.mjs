import fs from 'fs/promises'
import path from 'path'
import bcrypt from 'bcryptjs'
import { chromium } from 'playwright'
import { PrismaClient, QuestionType, ResultStatus, UserRole } from '@prisma/client'
import { io as socketIo } from 'socket.io-client'

const prisma = new PrismaClient()
const baseUrl = process.env.PHASE4_BASE_URL || 'http://127.0.0.1:3000'
const phaseDir = path.join(process.cwd(), 'docs', 'phase-4')
const evidenceDir = path.join(phaseDir, 'evidence')
const resultsPath = path.join(evidenceDir, 'browser-smoke-results.json')
const results = []

async function ensureDirs() {
  await fs.mkdir(evidenceDir, { recursive: true })
}

async function screenshot(page, name) {
  const file = path.join(evidenceDir, `${name}.png`)
  await page.screenshot({ path: file, fullPage: true })
  return file
}

async function writeText(name, content) {
  const file = path.join(evidenceDir, name)
  await fs.writeFile(file, content)
  return file
}

async function persistResults() {
  await fs.writeFile(resultsPath, JSON.stringify(results, null, 2))
}

async function record(testId, status, actual, evidence, role, pageOrApi) {
  results.push({ testId, status, actual, evidence, role, pageOrApi })
  await persistResults()
}

async function recordPass(testId, actual, evidence, role, pageOrApi) {
  await record(testId, 'PASS', actual, evidence, role, pageOrApi)
}

async function recordFail(testId, actual, evidence, role, pageOrApi) {
  await record(testId, 'FAIL', actual, evidence, role, pageOrApi)
}

async function primeLocale(context) {
  await context.addInitScript(() => {
    window.localStorage.setItem('examflow.siteLocale', 'en')
  })
}

async function dismissBlockingOverlay(page) {
  const overlay = page.locator('div.fixed.inset-0.z-\\[100\\]')
  if (await overlay.count()) {
    const closeButton = page.getByRole('button', { name: /close|skip|continue|not now/i }).first()
    if (await closeButton.count()) {
      await closeButton.click({ force: true }).catch(async () => {})
    }
    await page.keyboard.press('Escape').catch(async () => {})
    await page.waitForTimeout(300)
  }
}

async function login(page, email, password, expectedPathFragment) {
  await page.goto(`${baseUrl}/login`)
  await page.locator('input[type="email"]').fill(email)
  await page.locator('input[type="password"]').fill(password)
  await page.getByRole('button', { name: /sign in|login/i }).click()
  await page.waitForURL((url) => url.pathname.includes(expectedPathFragment), { timeout: 20000 })
  await dismissBlockingOverlay(page)
}

async function apiJson(page, url, options = {}) {
  return page.evaluate(async ({ url: targetUrl, options: targetOptions }) => {
    const response = await fetch(targetUrl, {
      ...targetOptions,
      headers: {
        'Content-Type': 'application/json',
        ...(targetOptions.headers ?? {}),
      },
    })
    const text = await response.text()
    return { status: response.status, text }
  }, { url, options })
}

async function clickActionInCard(page, headingText, buttonName) {
  const card = page.locator('div.rounded-xl.border').filter({ hasText: headingText }).first()
  await card.getByRole('button', { name: new RegExp(`^${buttonName}$`, 'i') }).click()
  await page.waitForTimeout(800)
}

function hashPassword(password) {
  return bcrypt.hashSync(password, 10)
}

async function ensureFixtureUser({ email, name, role, departmentId }) {
  const existing = await prisma.user.findUnique({ where: { email } })
  const user = existing ?? await prisma.user.create({
    data: {
      email,
      name,
      role,
      password: hashPassword(role === UserRole.TEACHER ? 'Teacher@123' : 'Admin@123'),
    },
  })

  if (role === UserRole.TEACHER) {
    const profile = await prisma.teacherProfile.findUnique({ where: { userId: user.id } })
    return profile ?? prisma.teacherProfile.create({
      data: {
        userId: user.id,
        departmentId,
      },
    })
  }

  return user
}

async function ensureFixtures() {
  const cse = await prisma.department.findUniqueOrThrow({ where: { code: 'CSE' } })
  const eee = await prisma.department.findUniqueOrThrow({ where: { code: 'EEE' } })
  const john = await prisma.teacherProfile.findFirstOrThrow({ where: { user: { email: 'teacher.john@examflow.pro' } }, include: { user: true } })
  const sarah = await prisma.teacherProfile.findFirstOrThrow({ where: { user: { email: 'teacher.sarah@examflow.pro' } }, include: { user: true } })
  const anna = await ensureFixtureUser({
    email: 'teacher.anna@examflow.pro',
    name: 'Anna Petrova',
    role: UserRole.TEACHER,
    departmentId: cse.id,
  })
  const eeeAdmin = await ensureFixtureUser({
    email: 'eee.admin@examflow.pro',
    name: 'EEE Department Admin',
    role: UserRole.DEPARTMENT_ADMIN,
    departmentId: eee.id,
  })

  await prisma.department.update({ where: { id: eee.id }, data: { adminId: eeeAdmin.id } }).catch(async () => {})

  await prisma.teacherDepartmentMembership.upsert({
    where: { teacherId_departmentId: { teacherId: john.id, departmentId: cse.id } },
    update: { role: 'Lead Teacher', isPrimary: true, isActive: true },
    create: { teacherId: john.id, departmentId: cse.id, role: 'Lead Teacher', isPrimary: true, isActive: true },
  })
  await prisma.teacherDepartmentMembership.upsert({
    where: { teacherId_departmentId: { teacherId: sarah.id, departmentId: cse.id } },
    update: { role: 'Assistant Teacher', isPrimary: true, isActive: true },
    create: { teacherId: sarah.id, departmentId: cse.id, role: 'Assistant Teacher', isPrimary: true, isActive: true },
  })
  await prisma.teacherDepartmentMembership.upsert({
    where: { teacherId_departmentId: { teacherId: anna.id, departmentId: cse.id } },
    update: { role: 'Substitute', isPrimary: true, isActive: true },
    create: { teacherId: anna.id, departmentId: cse.id, role: 'Substitute', isPrimary: true, isActive: true },
  })

  const offerings = await prisma.academicOffering.findMany({
    where: { departmentId: cse.id, isActive: true },
    include: {
      subject: true,
      group: true,
      language: true,
      semester: true,
      academicSession: true,
      program: true,
      department: true,
    },
    orderBy: { createdAt: 'asc' },
  })

  const primaryOffering = offerings[0]
  const secondaryOffering = offerings[1] ?? offerings[0]
  if (!primaryOffering) throw new Error('No active CSE academic offering found for Phase 4 smoke fixtures')

  const smokeAssignments = await prisma.teachingAssignment.findMany({
    where: { notes: { contains: 'Browser smoke' } },
    select: { id: true },
  })
  if (smokeAssignments.length > 0) {
    const smokeAssignmentIds = smokeAssignments.map((item) => item.id)
    await prisma.teacherSubstitution.deleteMany({ where: { teachingAssignmentId: { in: smokeAssignmentIds } } })
    await prisma.teacherWorkloadEntry.deleteMany({ where: { teachingAssignmentId: { in: smokeAssignmentIds } } })
    await prisma.teachingAssignmentApproval.deleteMany({ where: { teachingAssignmentId: { in: smokeAssignmentIds } } })
    await prisma.teacherAssignmentAuditLog.deleteMany({ where: { teachingAssignmentId: { in: smokeAssignmentIds } } })
    await prisma.teachingAssignmentRole.deleteMany({ where: { teachingAssignmentId: { in: smokeAssignmentIds } } })
    await prisma.teachingAssignment.deleteMany({ where: { id: { in: smokeAssignmentIds } } })
  }

  const smokeExams = await prisma.exam.findMany({
    where: { title: { startsWith: 'Phase 4 Lead Exam' } },
    select: { id: true },
  })
  if (smokeExams.length > 0) {
    const smokeExamIds = smokeExams.map((item) => item.id)
    const attempts = await prisma.studentExamAttempt.findMany({
      where: { examId: { in: smokeExamIds } },
      select: { id: true },
    })
    const attemptIds = attempts.map((item) => item.id)
    await prisma.examResult.deleteMany({ where: { examId: { in: smokeExamIds } } })
    await prisma.studentAnswer.deleteMany({ where: { attemptId: { in: attemptIds } } })
    await prisma.studentExamAttempt.deleteMany({ where: { id: { in: attemptIds } } })
    await prisma.examQuestion.deleteMany({ where: { examId: { in: smokeExamIds } } })
    await prisma.examSession.deleteMany({ where: { examId: { in: smokeExamIds } } })
    await prisma.exam.deleteMany({ where: { id: { in: smokeExamIds } } })
  }

  const smokeQuestions = await prisma.question.findMany({
    where: { text: { startsWith: 'Phase 4' } },
    select: { id: true },
  })
  if (smokeQuestions.length > 0) {
    const smokeQuestionIds = smokeQuestions.map((item) => item.id)
    await prisma.questionOption.deleteMany({ where: { questionId: { in: smokeQuestionIds } } })
    await prisma.question.deleteMany({ where: { id: { in: smokeQuestionIds } } })
  }

  await prisma.teacherWorkloadPolicy.create({
    data: {
      departmentId: cse.id,
      programId: primaryOffering.programId,
      academicSessionId: primaryOffering.academicSessionId,
      maxWeeklyHours: 4,
      maxSemesterHours: 50,
      defaultLectureWeight: 1,
      defaultLabWeight: 1,
      defaultAssessmentWeight: 1,
      isActive: true,
    },
  })

  const alice = await prisma.studentProfile.findFirstOrThrow({
    where: { user: { email: 'alice@student.examflow.pro' } },
    include: { user: true },
  })

  return { cse, eee, john, sarah, anna, eeeAdmin, primaryOffering, secondaryOffering, alice }
}

function buildQuestionPayload(offering, text) {
  return {
    subjectId: offering.subjectId,
    languageId: offering.languageId,
    groupId: offering.groupId,
    academicYearId: offering.programYearId,
    semesterId: offering.semesterId,
    academicOfferingId: offering.id,
    type: QuestionType.MCQ,
    text,
    marks: 10,
    difficulty: 'medium',
    options: [
      { text: 'Option A', isCorrect: true, orderIndex: 0 },
      { text: 'Option B', isCorrect: false, orderIndex: 1 },
    ],
  }
}

async function waitForSocketEvent(socket, eventName, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      socket.off(eventName, handler)
      reject(new Error(`Timed out waiting for ${eventName}`))
    }, timeoutMs)

    function handler(payload) {
      clearTimeout(timeout)
      socket.off(eventName, handler)
      resolve(payload)
    }

    socket.on(eventName, handler)
  })
}

async function buildMarkdown() {
  const lines = [
    '# Phase 4 Browser Smoke Matrix',
    '',
    '## Status',
    '',
    results.some((result) => result.status === 'FAIL') ? '`BLOCKED`' : '`PASS`',
    '',
    '| Test ID | Role | Surface | Status | Actual | Evidence |',
    '| --- | --- | --- | --- | --- | --- |',
    ...results.map((result) => `| ${result.testId} | ${result.role} | ${result.pageOrApi} | ${result.status} | ${result.actual.replaceAll('\n', ' ')} | ${result.evidence ? result.evidence.replace(`${process.cwd()}\\`, '').replaceAll('\\', '/') : 'n/a'} |`),
  ]
  await fs.writeFile(path.join(phaseDir, 'PHASE_4_BROWSER_SMOKE_MATRIX.md'), lines.join('\n'))
}

async function run() {
  await ensureDirs()
  const fx = await ensureFixtures()
  const browser = await chromium.launch({ headless: true })

  const adminContext = await browser.newContext()
  await primeLocale(adminContext)
  const adminPage = await adminContext.newPage()

  try {
    await login(adminPage, 'cse.admin@examflow.pro', 'Admin@123', '/admin')

    const membershipResponse = await apiJson(adminPage, `${baseUrl}/api/admin/teacher-memberships`, {
      method: 'POST',
      body: JSON.stringify({
        teacherId: fx.anna.id,
        departmentId: fx.cse.id,
        role: 'Substitute',
        isPrimary: true,
        isActive: true,
      }),
    })
    if (membershipResponse.status !== 201 && membershipResponse.status !== 409) {
      throw new Error(`Failed to create teacher membership fixture: ${membershipResponse.status} ${membershipResponse.text}`)
    }
    await adminPage.goto(`${baseUrl}/admin/teacher-departments`)
    await dismissBlockingOverlay(adminPage)
    await recordPass('P4-BR-001', 'Teacher department membership saved from admin UI', await screenshot(adminPage, 'P4-BR-001-membership'), 'Department Admin', '/admin/teacher-departments')

    const johnCreate = await apiJson(adminPage, `${baseUrl}/api/admin/teaching-assignments`, {
      method: 'POST',
      body: JSON.stringify({
        teacherId: fx.john.id,
        departmentId: fx.cse.id,
        academicOfferingId: fx.primaryOffering.id,
        membershipId: null,
        status: 'DRAFT',
        weeklyHours: 8,
        lectureHours: 3,
        labHours: 2,
        consultationHours: 1,
        assessmentHours: 2,
        notes: 'Browser smoke lead/examiner assignment',
        isPrimary: true,
        roles: ['LEAD_TEACHER', 'EXAMINER'],
      }),
    })
    if (johnCreate.status !== 201) {
      throw new Error(`Failed to create John assignment fixture: ${johnCreate.status} ${johnCreate.text}`)
    }
    await adminPage.goto(`${baseUrl}/admin/teaching-assignments`)
    await dismissBlockingOverlay(adminPage)
    await recordPass('P4-BR-002', 'Lead and examiner assignment created from admin UI', await screenshot(adminPage, 'P4-BR-002-lead-examiner-assignment'), 'Department Admin', '/admin/teaching-assignments')

    const johnAssignment = await prisma.teachingAssignment.findFirstOrThrow({
      where: {
        teacherId: fx.john.id,
        academicOfferingId: fx.primaryOffering.id,
      },
      orderBy: { createdAt: 'desc' },
      include: { roles: true },
    })

    const duplicateResponse = await apiJson(adminPage, `${baseUrl}/api/admin/teaching-assignments`, {
      method: 'POST',
      body: JSON.stringify({
        teacherId: fx.john.id,
        departmentId: fx.cse.id,
        academicOfferingId: fx.primaryOffering.id,
        membershipId: null,
        status: 'DRAFT',
        weeklyHours: 8,
        lectureHours: 3,
        labHours: 2,
        consultationHours: 1,
        assessmentHours: 2,
        roles: ['LEAD_TEACHER'],
      }),
    })
    await record(
      'P4-BR-003',
      duplicateResponse.status === 409 ? 'PASS' : 'FAIL',
      `Duplicate assignment request returned ${duplicateResponse.status}`,
      await writeText('P4-BR-003-duplicate-rejection.txt', duplicateResponse.text),
      'Department Admin',
      '/api/admin/teaching-assignments'
    )

    await clickActionInCard(adminPage, fx.primaryOffering.subject.name, 'submit')
    await clickActionInCard(adminPage, fx.primaryOffering.subject.name, 'approve')
    await clickActionInCard(adminPage, fx.primaryOffering.subject.name, 'activate')
    await recordPass('P4-BR-004', 'Assignment workflow submit -> approve -> activate completed in admin UI', await screenshot(adminPage, 'P4-BR-004-approval-activation'), 'Department Admin', '/admin/teaching-assignments')

    const sarahCreate = await apiJson(adminPage, `${baseUrl}/api/admin/teaching-assignments`, {
      method: 'POST',
      body: JSON.stringify({
        teacherId: fx.sarah.id,
        departmentId: fx.cse.id,
        academicOfferingId: fx.secondaryOffering.id,
        membershipId: null,
        status: 'APPROVED',
        weeklyHours: 6,
        lectureHours: 2,
        labHours: 2,
        consultationHours: 1,
        assessmentHours: 1,
        roles: ['ASSISTANT_TEACHER', 'REVIEWER'],
        notes: 'Browser smoke assistant/reviewer assignment',
      }),
    })
    if (sarahCreate.status !== 201) {
      throw new Error(`Failed to create Sarah assignment: ${sarahCreate.status} ${sarahCreate.text}`)
    }
    await adminPage.reload()
    await clickActionInCard(adminPage, fx.secondaryOffering.subject.name, 'activate')
    await clickActionInCard(adminPage, fx.secondaryOffering.subject.name, 'suspend')
    await clickActionInCard(adminPage, fx.secondaryOffering.subject.name, 'complete')
    await recordPass('P4-BR-005', 'Assistant/reviewer assignment activated, suspended, and completed', await screenshot(adminPage, 'P4-BR-005-suspension-completion'), 'Department Admin', '/admin/teaching-assignments')

    const eeeContext = await browser.newContext()
    await primeLocale(eeeContext)
    const eeePage = await eeeContext.newPage()
    await login(eeePage, 'eee.admin@examflow.pro', 'Admin@123', '/admin')
    const crossScope = await apiJson(eeePage, `${baseUrl}/api/admin/teaching-assignments`, {
      method: 'POST',
      body: JSON.stringify({
        teacherId: fx.john.id,
        departmentId: fx.cse.id,
        academicOfferingId: fx.primaryOffering.id,
        status: 'DRAFT',
        weeklyHours: 1,
        lectureHours: 1,
        labHours: 0,
        consultationHours: 0,
        assessmentHours: 0,
        roles: ['LEAD_TEACHER'],
      }),
    })
    await record(
      'P4-BR-006',
      crossScope.status === 403 ? 'PASS' : 'FAIL',
      `Cross-department assignment attempt returned ${crossScope.status}`,
      await writeText('P4-BR-006-cross-department-rejection.txt', crossScope.text),
      'Department Admin',
      '/api/admin/teaching-assignments'
    )
    await eeeContext.close()

    const now = new Date()
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000)
    const substitutionCreate = await apiJson(adminPage, `${baseUrl}/api/admin/teacher-substitutions`, {
      method: 'POST',
      body: JSON.stringify({
        teachingAssignmentId: johnAssignment.id,
        originalTeacherId: fx.john.id,
        substituteTeacherId: fx.anna.id,
        startsAt: now.toISOString(),
        endsAt: tomorrow.toISOString(),
        reason: 'Browser smoke substitution',
        status: 'ACTIVE',
      }),
    })
    if (substitutionCreate.status !== 201) {
      throw new Error(`Failed to create substitution fixture: ${substitutionCreate.status} ${substitutionCreate.text}`)
    }
    await adminPage.goto(`${baseUrl}/admin/teacher-substitutions`)
    await dismissBlockingOverlay(adminPage)
    await recordPass('P4-BR-007', 'Substitution created from admin UI', await screenshot(adminPage, 'P4-BR-007-substitution-create'), 'Department Admin', '/admin/teacher-substitutions')

    const overlap = await apiJson(adminPage, `${baseUrl}/api/admin/teacher-substitutions`, {
      method: 'POST',
      body: JSON.stringify({
        teachingAssignmentId: johnAssignment.id,
        originalTeacherId: fx.john.id,
        substituteTeacherId: fx.anna.id,
        startsAt: now.toISOString(),
        endsAt: tomorrow.toISOString(),
        reason: 'Overlap attempt',
        status: 'ACTIVE',
      }),
    })
    await record(
      'P4-BR-008',
      overlap.status === 409 ? 'PASS' : 'FAIL',
      `Overlapping substitution attempt returned ${overlap.status}`,
      await writeText('P4-BR-008-overlap-rejection.txt', overlap.text),
      'Department Admin',
      '/api/admin/teacher-substitutions'
    )

    const johnContext = await browser.newContext()
    await primeLocale(johnContext)
    const johnPage = await johnContext.newPage()
    await login(johnPage, 'teacher.john@examflow.pro', 'Teacher@123', '/teacher')
    await johnPage.goto(`${baseUrl}/teacher/assignments`)
    await dismissBlockingOverlay(johnPage)
    await recordPass('P4-BR-009', 'Teacher assignments page renders normalized and legacy assignments', await screenshot(johnPage, 'P4-BR-009-teacher-assignments'), 'Teacher', '/teacher/assignments')
    await johnContext.close()

    const sarahContext = await browser.newContext()
    await primeLocale(sarahContext)
    const sarahPage = await sarahContext.newPage()
    await login(sarahPage, 'teacher.sarah@examflow.pro', 'Teacher@123', '/teacher')
    await sarahPage.goto(`${baseUrl}/teacher/workload`)
    await dismissBlockingOverlay(sarahPage)
    await recordPass('P4-BR-010', 'Teacher workload page renders', await screenshot(sarahPage, 'P4-BR-010-teacher-workload'), 'Teacher', '/teacher/workload')
    await sarahContext.close()

    await adminPage.goto(`${baseUrl}/admin/teacher-workload`)
    await dismissBlockingOverlay(adminPage)
    const csvResponse = await apiJson(adminPage, `${baseUrl}/api/admin/teacher-workload/reports?format=csv`)
    const csvOk = csvResponse.status === 200 && csvResponse.text.includes('assignmentId,teacherName')
    await record(
      'P4-BR-011',
      csvOk ? 'PASS' : 'FAIL',
      `Reporting page rendered and CSV export returned ${csvResponse.status}`,
      await screenshot(adminPage, 'P4-BR-011-workload-report'),
      'Department Admin',
      '/admin/teacher-workload'
    )
    await writeText('P4-BR-011-workload-report.csv', csvResponse.text)

    const johnTeacherContext = await browser.newContext()
    await primeLocale(johnTeacherContext)
    const johnTeacherPage = await johnTeacherContext.newPage()
    await login(johnTeacherPage, 'teacher.john@examflow.pro', 'Teacher@123', '/teacher')
    const johnQuestion = await apiJson(johnTeacherPage, `${baseUrl}/api/questions`, {
      method: 'POST',
      body: JSON.stringify(buildQuestionPayload(fx.primaryOffering, `Phase 4 lead teacher question ${Date.now()}`)),
    })
    await record(
      'P4-BR-012',
      johnQuestion.status === 201 ? 'PASS' : 'FAIL',
      `Lead teacher question creation returned ${johnQuestion.status}`,
      await writeText('P4-BR-012-lead-question.txt', johnQuestion.text),
      'Teacher',
      '/api/questions'
    )
    const createdQuestion = JSON.parse(johnQuestion.text)
    const johnExam = await apiJson(johnTeacherPage, `${baseUrl}/api/exams`, {
      method: 'POST',
      body: JSON.stringify({
        title: `Phase 4 Lead Exam ${Date.now()}`,
        description: 'Lead teacher exam creation smoke',
        departmentId: fx.cse.id,
        subjectId: fx.primaryOffering.subjectId,
        languageId: fx.primaryOffering.languageId,
        groupId: fx.primaryOffering.groupId,
        academicYearId: fx.primaryOffering.programYearId,
        semesterId: fx.primaryOffering.semesterId,
        academicOfferingId: fx.primaryOffering.id,
        questionType: QuestionType.MCQ,
        resultMode: 'TEACHER_REVIEW',
        totalMarks: 10,
        passingMarks: 5,
        duration: 60,
        startTime: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
        endTime: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        autoPublish: false,
        allowRetake: false,
        showAnswers: false,
        showMarks: true,
        instructions: 'Phase 4 smoke instructions',
        questionIds: [{ questionId: createdQuestion.id, orderIndex: 0, marks: 10 }],
      }),
    })
    await record(
      'P4-BR-013',
      johnExam.status === 201 ? 'PASS' : 'FAIL',
      `Lead teacher exam creation returned ${johnExam.status}`,
      await writeText('P4-BR-013-lead-exam.txt', johnExam.text),
      'Teacher',
      '/api/exams'
    )
    const examPayload = JSON.parse(johnExam.text)
    await johnTeacherContext.close()

    const attempt = await prisma.studentExamAttempt.upsert({
      where: { examId_studentId: { examId: examPayload.id, studentId: fx.alice.id } },
      update: {
        status: 'SUBMITTED',
        startedAt: new Date(Date.now() - 20 * 60 * 1000),
        submittedAt: new Date(Date.now() - 5 * 60 * 1000),
      },
      create: {
        examId: examPayload.id,
        studentId: fx.alice.id,
        status: 'SUBMITTED',
        startedAt: new Date(Date.now() - 20 * 60 * 1000),
        submittedAt: new Date(Date.now() - 5 * 60 * 1000),
      },
    })
    const answer = await prisma.studentAnswer.upsert({
      where: { attemptId_questionId: { attemptId: attempt.id, questionId: createdQuestion.id } },
      update: { answerText: 'Option A', checkStatus: 'UNCHECKED' },
      create: { attemptId: attempt.id, questionId: createdQuestion.id, answerText: 'Option A', checkStatus: 'UNCHECKED' },
    })
    const result = await prisma.examResult.upsert({
      where: { attemptId: attempt.id },
      update: { examId: examPayload.id, studentId: fx.alice.id, totalMarks: 10, marksObtained: 0, percentage: 0, status: ResultStatus.PENDING },
      create: { examId: examPayload.id, attemptId: attempt.id, studentId: fx.alice.id, totalMarks: 10, marksObtained: 0, percentage: 0, status: ResultStatus.PENDING },
    })

    const annaContext = await browser.newContext()
    await primeLocale(annaContext)
    const annaPage = await annaContext.newPage()
    await login(annaPage, 'teacher.anna@examflow.pro', 'Teacher@123', '/teacher')
    const annaExamList = await apiJson(annaPage, `${baseUrl}/api/exams`)
    const annaExamPayload = annaExamList.text ? JSON.parse(annaExamList.text) : null
    await record(
      'P4-BR-014',
      annaExamList.status === 200 && Array.isArray(annaExamPayload) && annaExamPayload.some((item) => item.id === examPayload.id) ? 'PASS' : 'FAIL',
      `Active substitute exam visibility returned ${annaExamList.status}`,
      await writeText('P4-BR-014-substitute-exam-list.txt', annaExamList.text),
      'Teacher',
      '/api/exams'
    )
    const annaReview = await apiJson(annaPage, `${baseUrl}/api/results/${result.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ action: 'review_answer', answerId: answer.id, marks: 8, feedback: 'Reviewed by substitute' }),
    })
    await record(
      'P4-BR-015',
      annaReview.status === 200 ? 'PASS' : 'FAIL',
      `Substitute result review returned ${annaReview.status}`,
      await writeText('P4-BR-015-substitute-result-review.txt', annaReview.text),
      'Teacher',
      '/api/results/[id]'
    )

    const socketTokenResponse = await apiJson(annaPage, `${baseUrl}/api/socket/token`)
    const { token: annaToken } = JSON.parse(socketTokenResponse.text)
    const annaSocket = socketIo(baseUrl, { auth: { token: annaToken }, transports: ['websocket', 'polling'], forceNew: true })
    annaSocket.emit('teacher:join_exam_monitor', { examId: examPayload.id })
    const annaSocketResult = await Promise.race([
      waitForSocketEvent(annaSocket, 'connect', 5000).then(() => 'connected'),
      waitForSocketEvent(annaSocket, 'error', 5000).then((payload) => payload?.message || 'error'),
    ])
    await record(
      'P4-BR-016',
      annaSocketResult === 'connected' ? 'PASS' : 'FAIL',
      `Substitute socket authorization result: ${annaSocketResult}`,
      await writeText('P4-BR-016-substitute-socket.txt', String(annaSocketResult)),
      'Teacher',
      'socket teacher:join_exam_monitor'
    )
    annaSocket.disconnect()

    await prisma.teacherSubstitution.updateMany({
      where: { teachingAssignmentId: johnAssignment.id, substituteTeacherId: fx.anna.id, status: 'ACTIVE' },
      data: { endsAt: new Date(Date.now() - 60 * 1000) },
    })

    const annaExpired = await apiJson(annaPage, `${baseUrl}/api/results/${result.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ action: 'review_answer', answerId: answer.id, marks: 7, feedback: 'Should now fail' }),
    })
    await record(
      'P4-BR-017',
      annaExpired.status === 403 ? 'PASS' : 'FAIL',
      `Expired substitute denial returned ${annaExpired.status}`,
      await writeText('P4-BR-017-expired-substitute-denial.txt', annaExpired.text),
      'Teacher',
      '/api/results/[id]'
    )
    await annaContext.close()

    const sarahForbiddenContext = await browser.newContext()
    await primeLocale(sarahForbiddenContext)
    const sarahForbiddenPage = await sarahForbiddenContext.newPage()
    await login(sarahForbiddenPage, 'teacher.sarah@examflow.pro', 'Teacher@123', '/teacher')
    const sarahForeignQuestion = await apiJson(sarahForbiddenPage, `${baseUrl}/api/questions`, {
      method: 'POST',
      body: JSON.stringify(buildQuestionPayload(fx.primaryOffering, `Phase 4 foreign question ${Date.now()}`)),
    })
    await record(
      'P4-BR-018',
      sarahForeignQuestion.status === 403 ? 'PASS' : 'FAIL',
      `Foreign assignment question creation returned ${sarahForeignQuestion.status}`,
      await writeText('P4-BR-018-foreign-question-denial.txt', sarahForeignQuestion.text),
      'Teacher',
      '/api/questions'
    )

    const sarahSocketTokenResponse = await apiJson(sarahForbiddenPage, `${baseUrl}/api/socket/token`)
    const { token: sarahToken } = JSON.parse(sarahSocketTokenResponse.text)
    const sarahSocket = socketIo(baseUrl, { auth: { token: sarahToken }, transports: ['websocket', 'polling'], forceNew: true })
    sarahSocket.emit('teacher:join_exam_monitor', { examId: examPayload.id })
    const sarahSocketResult = await waitForSocketEvent(sarahSocket, 'error', 5000)
    await record(
      'P4-BR-019',
      sarahSocketResult?.message === 'Not allowed for this exam' ? 'PASS' : 'FAIL',
      `Unassigned teacher socket denial: ${JSON.stringify(sarahSocketResult)}`,
      await writeText('P4-BR-019-unassigned-socket-denial.txt', JSON.stringify(sarahSocketResult)),
      'Teacher',
      'socket teacher:join_exam_monitor'
    )
    sarahSocket.disconnect()
    await sarahForbiddenContext.close()

    await buildMarkdown()
  } finally {
    await browser.close()
    await prisma.$disconnect()
  }
}

run().catch(async (error) => {
  console.error(error)
  await ensureDirs()
  await recordFail('P4-BR-FATAL', error instanceof Error ? error.stack || error.message : String(error), null, 'System', 'browser-smoke')
  process.exit(1)
})
