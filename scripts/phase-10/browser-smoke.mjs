import fs from 'node:fs/promises'
import path from 'node:path'
import { chromium, devices } from 'playwright'
import { PrismaClient } from '@prisma/client'
import {
  createApiContext,
  loginPage,
  primeLocale,
  startRedis,
  startServer,
  stopRedis,
  stopServer,
} from '../phase-6/evidence-helpers.mjs'

const prisma = new PrismaClient()
const phaseDir = path.join(process.cwd(), 'docs', 'phase-10')
const evidenceDir = path.join(phaseDir, 'evidence')
const browserDir = path.join(evidenceDir, 'browser')
const networkDir = path.join(evidenceDir, 'network')
const consoleDir = path.join(evidenceDir, 'console')
const databaseDir = path.join(evidenceDir, 'database')
const matrixPath = path.join(phaseDir, 'PHASE_10_BROWSER_SMOKE_MATRIX.md')
const summaryPath = path.join(databaseDir, 'phase10-browser-summary.json')

const results = []

function rel(filePath) {
  return filePath.replace(`${process.cwd()}${path.sep}`, '').replaceAll('\\', '/')
}

async function ensureDirs() {
  await Promise.all([browserDir, networkDir, consoleDir, databaseDir].map((dir) => fs.mkdir(dir, { recursive: true })))
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

async function record(input) {
  results.push(input)
  await writeJson(summaryPath, {
    generatedAt: new Date().toISOString(),
    status: results.every((item) => item.status === 'PASS') ? 'PASS' : 'BLOCKED',
    total: results.length,
    passed: results.filter((item) => item.status === 'PASS').length,
    failed: results.filter((item) => item.status !== 'PASS').length,
    results,
  })
}

async function runCase(definition) {
  const row = {
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
    const output = await definition.run()
    row.actual = output?.actual ?? 'Completed as expected.'
    row.status = output?.status ?? 'PASS'
    row.evidencePaths = output?.evidencePaths ?? []
  } catch (error) {
    row.status = 'FAIL'
    row.actual = error instanceof Error ? error.message : String(error)
  }

  await record(row)
}

async function buildMatrix() {
  const lines = [
    '# Phase 10 Browser Smoke Matrix',
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
  const cse = await prisma.department.findFirstOrThrow({
    where: { code: 'CSE' },
    include: { admin: true },
  })
  const eee = await prisma.department.findFirstOrThrow({
    where: { code: 'EEE' },
    include: { admin: true },
  })
  const offering = await prisma.academicOffering.findFirstOrThrow({
    where: {
      departmentId: cse.id,
      isActive: true,
      studentSubjects: { some: {} },
      teachingAssignments: { some: { status: 'ACTIVE' } },
    },
    include: {
      subject: true,
      program: true,
      group: true,
      teachingAssignments: {
        where: { status: 'ACTIVE' },
        include: {
          teacher: {
            include: {
              user: true,
            },
          },
        },
        orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
        take: 1,
      },
    },
  })
  const teacher = offering.teachingAssignments[0]?.teacher
  if (!teacher) {
    throw new Error('No active teaching assignment found for Phase 10 browser smoke')
  }
  const student = await prisma.studentProfile.findFirstOrThrow({
    where: {
      departmentId: cse.id,
      subjects: {
        some: { academicOfferingId: offering.id },
      },
    },
    include: { user: true },
  })

  return {
    departments: { cse, eee },
    offering,
    teacher,
    student,
    users: {
      cseAdmin: cse.admin,
      eeeAdmin: eee.admin,
    },
  }
}

function attachPageArtifacts(page, name) {
  const messages = []
  const responses = []

  page.on('console', (message) => {
    messages.push(`${message.type()}: ${message.text()}`)
  })
  page.on('response', (response) => {
    responses.push(`${response.status()} ${response.url()}`)
  })

  return async () => {
    const screenshotPath = path.join(browserDir, `${name}.png`)
    const consolePath = path.join(consoleDir, `${name}.txt`)
    const networkPath = path.join(networkDir, `${name}.txt`)
    await page.screenshot({ path: screenshotPath, fullPage: true })
    await writeText(consolePath, messages.join('\n') || 'No console output captured')
    await writeText(networkPath, responses.join('\n') || 'No network output captured')
    return [rel(screenshotPath), rel(consolePath), rel(networkPath)]
  }
}

async function apiJson(api, method, url, body, evidenceName) {
  const response = await api.fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    data: body,
  })
  const text = await response.text()
  let json = null
  try {
    json = JSON.parse(text)
  } catch {}

  const evidence = await writeJson(path.join(networkDir, `${evidenceName}.json`), {
    method,
    url,
    status: response.status(),
    json,
    text,
  })

  return { status: response.status(), json, text, evidence }
}

async function apiMultipart(api, url, multipart, evidenceName) {
  const response = await api.fetch(url, {
    method: 'POST',
    multipart,
  })
  const text = await response.text()
  let json = null
  try {
    json = JSON.parse(text)
  } catch {}

  const evidence = await writeJson(path.join(networkDir, `${evidenceName}.json`), {
    method: 'POST',
    url,
    status: response.status(),
    json,
    text,
  })

  return { status: response.status(), json, text, evidence }
}

async function main() {
  await ensureDirs()
  const fixtures = await gatherFixtures()
  let redis = null
  let server = null
  let baseUrl = 'http://127.0.0.1:3000'

  try {
    const ready = await fetch(`${baseUrl}/api/health/ready`)
    if (!ready.ok) {
      throw new Error(`Unexpected readiness status ${ready.status}`)
    }
  } catch {
    redis = await startRedis('phase10-browser')
    server = await startServer({
      port: 3251,
      redisUrl: redis.redisUrl,
      logPrefix: 'phase10-browser-server',
    })
    baseUrl = server.baseUrl
  }

  const browser = await chromium.launch({ headless: true })
  let adminApi
  let teacherApi
  let studentApi

  try {
    adminApi = await createApiContext(baseUrl, fixtures.users.cseAdmin.email, 'Admin@123')
    teacherApi = await createApiContext(baseUrl, fixtures.teacher.user.email, 'Teacher@123')
    studentApi = await createApiContext(baseUrl, fixtures.student.user.email, 'Student@123')

    const adminContext = await browser.newContext({ colorScheme: 'light', viewport: { width: 1440, height: 960 } })
    const teacherContext = await browser.newContext({ colorScheme: 'light', viewport: { width: 1366, height: 900 } })
    const studentTabletContext = await browser.newContext({
      ...devices['iPad Pro 11'],
      colorScheme: 'dark',
    })
    const studentMobileContext = await browser.newContext({
      ...devices['Pixel 7'],
      colorScheme: 'dark',
    })

    await Promise.all([
      primeLocale(adminContext, 'en'),
      primeLocale(teacherContext, 'en'),
      primeLocale(studentTabletContext, 'en'),
      primeLocale(studentMobileContext, 'en'),
    ])

    const adminPage = await adminContext.newPage()
    const teacherPage = await teacherContext.newPage()
    const studentTabletPage = await studentTabletContext.newPage()
    const studentMobilePage = await studentMobileContext.newPage()

    await loginPage(adminPage, baseUrl, fixtures.users.cseAdmin.email, 'Admin@123', '/admin')
    await loginPage(teacherPage, baseUrl, fixtures.teacher.user.email, 'Teacher@123', '/teacher')
    await loginPage(studentTabletPage, baseUrl, fixtures.student.user.email, 'Student@123', '/student')
    await loginPage(studentMobilePage, baseUrl, fixtures.student.user.email, 'Student@123', '/student')

    const adminArtifacts = attachPageArtifacts(adminPage, 'phase10-admin-lms')
    const teacherArtifacts = attachPageArtifacts(teacherPage, 'phase10-teacher-lms')
    const studentTabletArtifacts = attachPageArtifacts(studentTabletPage, 'phase10-student-lms-tablet')
    const studentMobileArtifacts = attachPageArtifacts(studentMobilePage, 'phase10-student-course-mobile')

    await runCase({
      testId: 'P10-BR-001',
      role: 'Department Admin',
      precondition: 'Authenticated department admin session exists.',
      steps: 'Open the Phase 10 LMS admin page on desktop light mode.',
      expected: 'The Enterprise LMS admin page renders successfully.',
      run: async () => {
        await adminPage.goto(`${baseUrl}/admin/lms`, { waitUntil: 'networkidle' })
        const body = (await adminPage.textContent('body')) || ''
        return {
          actual: body.includes('Enterprise LMS') ? 'Admin LMS dashboard rendered.' : 'Admin LMS heading missing.',
          status: body.includes('Enterprise LMS') ? 'PASS' : 'FAIL',
          evidencePaths: await adminArtifacts(),
        }
      },
    })

    const suffix = Date.now()
    const createCourse = await apiJson(
      adminApi,
      'POST',
      '/api/admin/lms/courses',
      {
        departmentId: fixtures.departments.cse.id,
        programId: fixtures.offering.programId,
        academicOfferingId: fixtures.offering.id,
        subjectId: fixtures.offering.subjectId,
        semesterId: fixtures.offering.semesterId,
        groupId: fixtures.offering.groupId,
        languageId: fixtures.offering.languageId,
        code: `P10-BROWSER-${suffix}`,
        title: `Phase 10 Browser Course ${suffix}`,
        summary: 'Course created during browser smoke.',
        credits: 3,
        version: {
          title: 'Browser Version 1.0',
          sections: [
            {
              title: 'Browser Section',
              lessons: [
                {
                  title: 'Watch and Resume',
                  type: 'VIDEO',
                  estimatedMinutes: 20,
                },
              ],
            },
          ],
        },
      },
      'phase10-browser-course-create'
    )
    const lessonId = createCourse.json?.versions?.[0]?.sections?.[0]?.lessons?.[0]?.id
    const courseId = createCourse.json?.id
    if (createCourse.status !== 201 || !lessonId || !courseId) {
      throw new Error(`Course creation failed for browser smoke: ${createCourse.text}`)
    }

    await runCase({
      testId: 'P10-BR-002',
      role: 'Department Admin',
      precondition: 'A valid academic offering is available for the CSE department.',
      steps: 'Create a Phase 10 LMS course with a lesson through the admin API.',
      expected: 'Course creation succeeds and returns a lesson id.',
      run: async () => ({
        actual: `status=${createCourse.status}; courseId=${courseId}; lessonId=${lessonId}`,
        status: createCourse.status === 201 ? 'PASS' : 'FAIL',
        evidencePaths: [createCourse.evidence],
      }),
    })

    await runCase({
      testId: 'P10-BR-003',
      role: 'Teacher',
      precondition: 'Authenticated teacher session exists for the same academic offering.',
      steps: 'Open the teacher LMS workspace on desktop light mode.',
      expected: 'The teaching workspace loads without critical UI failures.',
      run: async () => {
        await teacherPage.goto(`${baseUrl}/teacher/lms`, { waitUntil: 'networkidle' })
        const body = (await teacherPage.textContent('body')) || ''
        return {
          actual: body.includes('LMS Teaching Workspace') ? 'Teacher LMS page rendered.' : 'Teacher LMS heading missing.',
          status: body.includes('LMS Teaching Workspace') ? 'PASS' : 'FAIL',
          evidencePaths: await teacherArtifacts(),
        }
      },
    })

    const materialUpload = await apiMultipart(
      teacherApi,
      `/api/teacher/lms/lessons/${lessonId}/materials/upload`,
      {
        type: 'PDF',
        title: 'Phase 10 Material',
        description: 'Material uploaded during browser smoke.',
        sortOrder: '1',
        file: {
          name: 'phase10-material.txt',
          mimeType: 'text/plain',
          buffer: Buffer.from('phase10 browser material', 'utf8'),
        },
      },
      'phase10-browser-material-upload'
    )
    const videoCreate = await apiMultipart(
      teacherApi,
      `/api/teacher/lms/lessons/${lessonId}/videos`,
      {
        title: 'Phase 10 Video',
        sourceType: 'UPLOAD',
        durationSeconds: '600',
        thumbnailUrl: 'https://example.com/phase10-video.png',
        file: {
          name: 'phase10-video.mp4',
          mimeType: 'video/mp4',
          buffer: Buffer.from('phase10 browser video', 'utf8'),
        },
      },
      'phase10-browser-video-create'
    )
    const publishLesson = await apiJson(
      teacherApi,
      'POST',
      `/api/teacher/lms/lessons/${lessonId}/publish`,
      undefined,
      'phase10-browser-lesson-publish'
    )

    await runCase({
      testId: 'P10-BR-004',
      role: 'Teacher',
      precondition: 'A Phase 10 lesson exists.',
      steps: 'Upload learning material, attach a video asset, and publish the lesson.',
      expected: 'Material upload, video creation, and publication all succeed.',
      run: async () => ({
        actual: `material=${materialUpload.status}; video=${videoCreate.status}; publish=${publishLesson.status}`,
        status:
          materialUpload.status === 201 &&
          videoCreate.status === 201 &&
          publishLesson.status === 200
            ? 'PASS'
            : 'FAIL',
        evidencePaths: [materialUpload.evidence, videoCreate.evidence, publishLesson.evidence],
      }),
    })

    const scheduleLive = await apiJson(
      teacherApi,
      'POST',
      `/api/teacher/lms/lessons/${lessonId}/live-classes`,
      {
        provider: 'JITSI',
        title: 'Phase 10 Live Class',
        description: 'Live class scheduled during browser smoke.',
        startAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        endAt: new Date(Date.now() + 90 * 60 * 1000).toISOString(),
        joinUrl: 'https://meet.jit.si/phase10-browser-smoke',
        hostUrl: 'https://meet.jit.si/phase10-browser-smoke?host=true',
        recordingUrl: 'https://example.com/phase10-live-recording',
      },
      'phase10-browser-live-class'
    )
    const liveClassId = scheduleLive.json?.id
    if (scheduleLive.status !== 201 || !liveClassId) {
      throw new Error(`Live class scheduling failed: ${scheduleLive.text}`)
    }

    await runCase({
      testId: 'P10-BR-005',
      role: 'Teacher',
      precondition: 'The lesson has been published.',
      steps: 'Schedule a live class for the published lesson.',
      expected: 'The live class is created with a join url.',
      run: async () => ({
        actual: `status=${scheduleLive.status}; liveClassId=${liveClassId}`,
        status: scheduleLive.status === 201 ? 'PASS' : 'FAIL',
        evidencePaths: [scheduleLive.evidence],
      }),
    })

    await studentTabletPage.goto(`${baseUrl}/student/lms`, { waitUntil: 'networkidle' })
    const studentListBody = (await studentTabletPage.textContent('body')) || ''
    const videoId = videoCreate.json?.id
    if (!videoId) {
      throw new Error('Video asset id missing from browser smoke')
    }

    const firstProgress = await apiJson(
      studentApi,
      'POST',
      `/api/student/lms/videos/${videoId}/progress`,
      {
        lastPositionSeconds: 120,
        watchedSecondsDelta: 120,
        durationSeconds: 600,
      },
      'phase10-browser-video-progress-initial'
    )
    const resumeProgress = await apiJson(
      studentApi,
      'POST',
      `/api/student/lms/videos/${videoId}/progress`,
      {
        lastPositionSeconds: 420,
        watchedSecondsDelta: 300,
        durationSeconds: 600,
      },
      'phase10-browser-video-progress-resume'
    )

    await runCase({
      testId: 'P10-BR-006',
      role: 'Student',
      precondition: 'A published video lesson is available to the student.',
      steps: 'Open the student LMS page on tablet dark mode, watch the video, and resume playback.',
      expected: 'The course appears in the student LMS, and video progress persists across resumes.',
      run: async () => ({
        actual: `pageHasCourse=${studentListBody.includes('Phase 10 Browser Course')}; first=${firstProgress.status}; resume=${resumeProgress.status}; resumeCount=${resumeProgress.json?.resumeCount ?? 0}`,
        status:
          studentListBody.includes('Phase 10 Browser Course') &&
          firstProgress.status === 200 &&
          resumeProgress.status === 200 &&
          Number(resumeProgress.json?.resumeCount ?? 0) >= 2
            ? 'PASS'
            : 'FAIL',
        evidencePaths: [firstProgress.evidence, resumeProgress.evidence, ...(await studentTabletArtifacts())],
      }),
    })

    const joinLive = await apiJson(
      studentApi,
      'POST',
      `/api/student/lms/live-classes/${liveClassId}/join`,
      {
        status: 'ATTENDED',
        joinedAt: new Date(Date.now() + 65 * 60 * 1000).toISOString(),
        leftAt: new Date(Date.now() + 85 * 60 * 1000).toISOString(),
      },
      'phase10-browser-live-join'
    )
    const lessonProgress = await apiJson(
      studentApi,
      'POST',
      `/api/student/lms/lessons/${lessonId}/progress`,
      {
        completionPercent: 100,
        readingProgressPercent: 100,
        assignmentCompleted: true,
        attendanceCompleted: true,
        quizCompleted: true,
        isCompleted: true,
      },
      'phase10-browser-lesson-progress'
    )

    await runCase({
      testId: 'P10-BR-007',
      role: 'Student',
      precondition: 'A live class has been scheduled for the lesson.',
      steps: 'Join the live class and update learning progress.',
      expected: 'Attendance and lesson progress are recorded successfully.',
      run: async () => ({
        actual: `join=${joinLive.status}; lessonProgress=${lessonProgress.status}; attendance=${joinLive.json?.status ?? 'unknown'}`,
        status:
          joinLive.status === 200 &&
          lessonProgress.status === 200 &&
          joinLive.json?.status === 'ATTENDED'
            ? 'PASS'
            : 'FAIL',
        evidencePaths: [joinLive.evidence, lessonProgress.evidence],
      }),
    })

    const threadCreate = await apiJson(
      studentApi,
      'POST',
      '/api/student/lms/discussions',
      {
        courseId,
        lessonId,
        title: 'Phase 10 discussion thread',
        body: 'Testing the discussion flow.',
      },
      'phase10-browser-discussion-thread'
    )
    const threadId = threadCreate.json?.id
    if (threadCreate.status !== 201 || !threadId) {
      throw new Error(`Discussion thread create failed: ${threadCreate.text}`)
    }
    const replyCreate = await apiJson(
      studentApi,
      'POST',
      `/api/student/lms/discussions/${threadId}/replies`,
      {
        body: 'Replying to the Phase 10 discussion thread.',
      },
      'phase10-browser-discussion-reply'
    )

    await runCase({
      testId: 'P10-BR-008',
      role: 'Student',
      precondition: 'The student can access the lesson discussion area.',
      steps: 'Create a discussion thread and post a reply.',
      expected: 'Both discussion actions succeed and are persisted.',
      run: async () => ({
        actual: `thread=${threadCreate.status}; reply=${replyCreate.status}`,
        status: threadCreate.status === 201 && replyCreate.status === 201 ? 'PASS' : 'FAIL',
        evidencePaths: [threadCreate.evidence, replyCreate.evidence],
      }),
    })

    await studentMobilePage.goto(`${baseUrl}/student/lms/${courseId}`, { waitUntil: 'networkidle' })
    const studentDetailBody = (await studentMobilePage.textContent('body')) || ''
    const courseRecord = await prisma.phase10Course.findUniqueOrThrow({
      where: { id: courseId },
      include: {
        lessons: {
          include: {
            lessonProgress: true,
            discussionThreads: { include: { replies: true } },
          },
        },
      },
    })

    await runCase({
      testId: 'P10-BR-009',
      role: 'Student',
      precondition: 'The student has created progress and discussion data for the course.',
      steps: 'Open the course detail page on mobile dark mode and inspect persisted progress data.',
      expected: 'The mobile course page renders, and progress/discussion records are present.',
      run: async () => ({
        actual: `pageHasLesson=${studentDetailBody.includes('Watch and Resume')}; progressRows=${courseRecord.lessons[0]?.lessonProgress.length ?? 0}; threadReplies=${courseRecord.lessons[0]?.discussionThreads[0]?.replies.length ?? 0}`,
        status:
          studentDetailBody.includes('Watch and Resume') &&
          (courseRecord.lessons[0]?.lessonProgress.length ?? 0) > 0 &&
          (courseRecord.lessons[0]?.discussionThreads[0]?.replies.length ?? 0) > 0
            ? 'PASS'
            : 'FAIL',
        evidencePaths: await studentMobileArtifacts(),
      }),
    })

    await buildMatrix()

    await adminContext.close()
    await teacherContext.close()
    await studentTabletContext.close()
    await studentMobileContext.close()
  } finally {
    await adminApi?.dispose().catch(() => {})
    await teacherApi?.dispose().catch(() => {})
    await studentApi?.dispose().catch(() => {})
    await browser.close().catch(() => {})
    if (server) {
      await stopServer(server).catch(() => {})
    }
    if (redis) {
      await stopRedis(redis).catch(() => {})
    }
    await prisma.$disconnect().catch(() => {})
  }

  if (!results.every((item) => item.status === 'PASS')) {
    console.error('[phase10:browser] BLOCKED')
    process.exit(1)
  }

  console.log('[phase10:browser] PASS')
}

main().catch(async (error) => {
  await ensureDirs()
  await writeText(path.join(consoleDir, 'phase10-browser-smoke-error.txt'), String(error?.stack || error))
  try {
    await prisma.$disconnect()
  } catch {}
  console.error('[phase10:browser] FAIL', error)
  process.exit(1)
})
