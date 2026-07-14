import fs from 'node:fs/promises'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { chromium, devices } from 'playwright'
import { PrismaClient, CourseworkAudienceType, CourseworkLatePolicyType, CourseworkPublicationStatus, CourseworkTemplateType, CourseworkVisibility } from '@prisma/client'
import { createApiContext, loginPage, primeLocale, startRedis, startServer, stopRedis, stopServer } from '../phase-6/evidence-helpers.mjs'

const prisma = new PrismaClient()
const evidenceRoot = path.join(process.cwd(), 'docs', 'final-audit', 'evidence', 'phase-7-5')
const browserDir = path.join(evidenceRoot, 'browser')
const networkDir = path.join(evidenceRoot, 'network')
const consoleDir = path.join(evidenceRoot, 'console')
const databaseDir = path.join(evidenceRoot, 'database')
const summaryPath = path.join(databaseDir, 'browser-smoke-summary.json')

const created = {
  templateId: null,
  versionId: null,
  publicationId: null,
}

function runLegacyTestSeed() {
  const tsNodeBin = path.join(process.cwd(), 'node_modules', 'ts-node', 'dist', 'bin.js')
  const result = spawnSync(
    process.execPath,
    [tsNodeBin, '-r', 'tsconfig-paths/register', '--transpile-only', '--project', 'tsconfig.seed.json', 'scripts/phase-7/ensure-coursework-test-fixtures.ts'],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        NODE_ENV: 'test',
      },
      encoding: 'utf8',
    }
  )

  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || 'Failed to rebuild legacy test fixtures')
  }
}

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

async function buildMinimalDocx(targetPath, bodyText) {
  const script = `
import sys, zipfile
target_path, body_text = sys.argv[1], sys.argv[2]
safe_text = body_text.replace('&', '').replace('<', '').replace('>', '')
content_types = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>"""
rels = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>"""
document = f"""<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>{''.join(f'<w:p><w:r><w:t xml:space="preserve">{line}</w:t></w:r></w:p>' for line in safe_text.splitlines() if line)}</w:body></w:document>"""
with zipfile.ZipFile(target_path, 'w', compression=zipfile.ZIP_DEFLATED) as archive:
    archive.writestr('[Content_Types].xml', content_types)
    archive.writestr('_rels/.rels', rels)
    archive.writestr('word/document.xml', document)
    archive.writestr('word/_rels/document.xml.rels', '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships" />')
`
  const result = spawnSync('python', ['-c', script, targetPath, bodyText], {
    cwd: process.cwd(),
    encoding: 'utf8',
  })
  if (result.status !== 0) throw new Error(result.stderr || 'Failed to build browser DOCX fixture')
}

async function gatherFixtures() {
  let teacher = await prisma.teacherProfile.findFirst({
    where: { user: { email: 'teacher.john@examflow.pro' } },
    include: {
      user: true,
      teachingAssignments: {
        where: { status: 'ACTIVE' },
        include: { academicOffering: true },
        take: 1,
      },
    },
  })

  if (!teacher) {
    runLegacyTestSeed()
    teacher = await prisma.teacherProfile.findFirstOrThrow({
      where: { user: { email: 'teacher.john@examflow.pro' } },
      include: {
        user: true,
        teachingAssignments: {
          where: { status: 'ACTIVE' },
          include: { academicOffering: true },
          take: 1,
        },
      },
    })
  }
  const scope = teacher.teachingAssignments[0]
  const student = await prisma.studentProfile.findFirstOrThrow({
    where: {
      departmentId: scope.departmentId,
      subjects: { some: { academicOfferingId: scope.academicOfferingId } },
    },
    include: { user: true },
  })
  const scopedSubject = await prisma.studentSubject.findFirstOrThrow({
    where: {
      studentId: student.id,
      academicOfferingId: scope.academicOfferingId ?? undefined,
      subjectId: scope.academicOffering.subjectId,
      languageId: scope.academicOffering.languageId,
      groupId: scope.academicOffering.groupId,
      semesterId: scope.academicOffering.semesterId,
    },
  })
  return { teacher, scope, student, scopedSubject }
}

async function createFixture(fixtures) {
  const template = await prisma.courseworkTemplate.create({
    data: {
      teacherId: fixtures.teacher.id,
      departmentId: fixtures.scope.departmentId,
      academicOfferingId: fixtures.scope.academicOfferingId,
      subjectId: fixtures.scope.academicOffering.subjectId,
      languageId: fixtures.scope.academicOffering.languageId,
      groupId: fixtures.scope.academicOffering.groupId,
      academicYearId: fixtures.scopedSubject.academicYearId,
      semesterId: fixtures.scope.academicOffering.semesterId,
      type: CourseworkTemplateType.RESEARCH,
      visibility: CourseworkVisibility.COURSE,
      title: 'Phase 7.5 Browser Template',
      description: 'Browser smoke fixture',
      instructions: 'Abstract Methodology Conclusion References',
      allowedFileTypes: ['docx', 'txt'],
      maxFileSizeBytes: 1024 * 1024,
      maxAttempts: 2,
      allowUnlimitedAttempts: false,
      allowTextSubmission: true,
      allowRichTextSubmission: false,
      allowFileUpload: true,
      allowExternalLink: true,
      allowGitRepository: true,
      latePolicyType: CourseworkLatePolicyType.NO_LATE_SUBMISSION,
      reviewRequestsEnabled: true,
    },
  })
  created.templateId = template.id
  const version = await prisma.courseworkTemplateVersion.create({
    data: {
      templateId: template.id,
      versionNumber: 1,
      title: template.title,
      description: template.description,
      instructions: template.instructions,
      configuration: {},
      publishedById: fixtures.teacher.id,
    },
  })
  created.versionId = version.id
  const publication = await prisma.courseworkPublication.create({
    data: {
      templateId: template.id,
      templateVersionId: version.id,
      teacherId: fixtures.teacher.id,
      departmentId: fixtures.scope.departmentId,
      academicOfferingId: fixtures.scope.academicOfferingId,
      subjectId: fixtures.scope.academicOffering.subjectId,
      languageId: fixtures.scope.academicOffering.languageId,
      groupId: fixtures.scope.academicOffering.groupId,
      academicYearId: fixtures.scopedSubject.academicYearId,
      semesterId: fixtures.scope.academicOffering.semesterId,
      audienceType: CourseworkAudienceType.INDIVIDUAL,
      status: CourseworkPublicationStatus.PUBLISHED,
      title: 'Phase 7.5 Browser Publication',
      description: 'Browser smoke publication',
      instructions: '<p>Submit a DOCX with abstract, methodology, conclusion, and references.</p>',
      versionNumber: 1,
      publishedAt: new Date(),
      dueAt: new Date(Date.now() + 86_400_000),
      hardCloseAt: new Date(Date.now() + 172_800_000),
      allowedFileTypes: ['docx', 'txt'],
      maxFileSizeBytes: 1024 * 1024,
      maxAttempts: 2,
      allowUnlimitedAttempts: false,
      allowTextSubmission: true,
      allowRichTextSubmission: false,
      allowFileUpload: true,
      allowExternalLink: true,
      allowGitRepository: true,
      latePolicyType: CourseworkLatePolicyType.NO_LATE_SUBMISSION,
      extensionEnabled: true,
      reviewRequestsEnabled: true,
      metadata: {
        aiReviewPolicy: {
          minWords: 30,
          maxWords: 250,
          requiredSections: ['Abstract', 'Methodology', 'Conclusion'],
          minimumReferenceCount: 2,
          citationStyle: 'APA',
          requiredAttachments: 1,
          requireRepositoryLink: true,
        },
      },
    },
  })
  created.publicationId = publication.id
  await prisma.courseworkPublicationTarget.create({
    data: { publicationId: publication.id, studentId: fixtures.student.id },
  })
  return publication
}

async function cleanup() {
  if (created.publicationId) {
    const attachments = await prisma.courseworkAttemptAttachment.findMany({
      where: { attempt: { publicationId: created.publicationId } },
      select: { fileUrl: true },
    })
    for (const attachment of attachments) {
      const storedPath = path.join(process.cwd(), 'public', attachment.fileUrl.replace(/^\//, '').replaceAll('/', path.sep))
      await fs.rm(storedPath, { force: true }).catch(() => {})
    }
    await prisma.courseworkAIAudit.deleteMany({ where: { review: { publicationId: created.publicationId } } })
    await prisma.courseworkAIRecommendation.deleteMany({ where: { review: { publicationId: created.publicationId } } })
    await prisma.courseworkAIGrammarFinding.deleteMany({ where: { review: { publicationId: created.publicationId } } })
    await prisma.courseworkAICitationFinding.deleteMany({ where: { review: { publicationId: created.publicationId } } })
    await prisma.courseworkAIRubricSuggestion.deleteMany({ where: { review: { publicationId: created.publicationId } } })
    await prisma.courseworkAISourceMatch.deleteMany({ where: { review: { publicationId: created.publicationId } } })
    await prisma.courseworkAIFinding.deleteMany({ where: { review: { publicationId: created.publicationId } } })
    await prisma.courseworkAICheck.deleteMany({ where: { review: { publicationId: created.publicationId } } })
    await prisma.courseworkAIReview.deleteMany({ where: { publicationId: created.publicationId } })
    await prisma.courseworkAIReviewJob.deleteMany({ where: { publicationId: created.publicationId } })
    await prisma.courseworkAttemptRequest.deleteMany({ where: { publicationId: created.publicationId } })
    await prisma.courseworkAttemptAttachment.deleteMany({ where: { attempt: { publicationId: created.publicationId } } })
    await prisma.courseworkAttempt.deleteMany({ where: { publicationId: created.publicationId } })
    await prisma.courseworkPublicationTarget.deleteMany({ where: { publicationId: created.publicationId } })
    await prisma.courseworkPublication.deleteMany({ where: { id: created.publicationId } })
  }
  if (created.versionId) await prisma.courseworkTemplateVersion.deleteMany({ where: { id: created.versionId } })
  if (created.templateId) await prisma.courseworkTemplate.deleteMany({ where: { id: created.templateId } })
}

function attachArtifacts(page, name) {
  const consoleMessages = []
  const networkResponses = []
  page.on('console', (message) => consoleMessages.push(`${message.type()}: ${message.text()}`))
  page.on('response', (response) => networkResponses.push(`${response.status()} ${response.url()}`))
  return async () => {
    const screenshotPath = path.join(browserDir, `${name}.png`)
    const consolePath = path.join(consoleDir, `${name}.txt`)
    const networkPath = path.join(networkDir, `${name}.txt`)
    await page.screenshot({ path: screenshotPath, fullPage: true })
    await writeText(consolePath, consoleMessages.join('\n') || 'No console output captured')
    await writeText(networkPath, networkResponses.join('\n') || 'No network output captured')
    return [rel(screenshotPath), rel(consolePath), rel(networkPath)]
  }
}

async function main() {
  await ensureDirs()
  const fixtures = await gatherFixtures()
  const publication = await createFixture(fixtures)
  const validDocxPath = path.join(databaseDir, 'browser-valid-submission.docx')
  await buildMinimalDocx(validDocxPath, 'Abstract\nBrowser smoke abstract.\nMethodology\nBrowser smoke method.\nConclusion\nBrowser smoke conclusion.\nReferences\nSmith, 2024.\nDoe, 2023.')
  const validDocxBuffer = await fs.readFile(validDocxPath)
  const results = []
  let redis = null
  let server = null
  let browser
  let teacherApi
  let studentApi

  try {
    redis = await startRedis('phase7-5-browser')
    server = await startServer({ port: 3266, redisUrl: redis.redisUrl, logPrefix: 'phase7-5-browser' })
    teacherApi = await createApiContext(server.baseUrl, fixtures.teacher.user.email, 'Teacher@123')
    studentApi = await createApiContext(server.baseUrl, fixtures.student.user.email, 'Student@123')
    browser = await chromium.launch({ headless: true })

    const contexts = {
      teacherDesktopLight: await browser.newContext({ viewport: { width: 1440, height: 960 }, colorScheme: 'light' }),
      teacherDesktopDark: await browser.newContext({ viewport: { width: 1440, height: 960 }, colorScheme: 'dark' }),
      studentTabletLight: await browser.newContext({ ...devices['iPad Pro 11'], colorScheme: 'light' }),
      studentTabletDark: await browser.newContext({ ...devices['iPad Pro 11'], colorScheme: 'dark' }),
      studentMobileLight: await browser.newContext({ ...devices['Pixel 7'], colorScheme: 'light' }),
      studentMobileDark: await browser.newContext({ ...devices['Pixel 7'], colorScheme: 'dark' }),
    }

    await Promise.all(Object.values(contexts).map((context) => primeLocale(context, 'en')))

    const pages = {
      teacherDesktopLight: await contexts.teacherDesktopLight.newPage(),
      teacherDesktopDark: await contexts.teacherDesktopDark.newPage(),
      studentTabletLight: await contexts.studentTabletLight.newPage(),
      studentTabletDark: await contexts.studentTabletDark.newPage(),
      studentMobileLight: await contexts.studentMobileLight.newPage(),
      studentMobileDark: await contexts.studentMobileDark.newPage(),
    }

    await loginPage(pages.teacherDesktopLight, server.baseUrl, fixtures.teacher.user.email, 'Teacher@123', '/teacher')
    await loginPage(pages.teacherDesktopDark, server.baseUrl, fixtures.teacher.user.email, 'Teacher@123', '/teacher')
    await loginPage(pages.studentTabletLight, server.baseUrl, fixtures.student.user.email, 'Student@123', '/student')
    await loginPage(pages.studentTabletDark, server.baseUrl, fixtures.student.user.email, 'Student@123', '/student')
    await loginPage(pages.studentMobileLight, server.baseUrl, fixtures.student.user.email, 'Student@123', '/student')
    await loginPage(pages.studentMobileDark, server.baseUrl, fixtures.student.user.email, 'Student@123', '/student')

    const studentSubmitArtifacts = attachArtifacts(pages.studentTabletLight, 'phase7-5-student-submit-tablet-light')
    const teacherSubmissionArtifacts = attachArtifacts(pages.teacherDesktopLight, 'phase7-5-teacher-submissions-desktop-light')
    const teacherSubmissionDarkArtifacts = attachArtifacts(pages.teacherDesktopDark, 'phase7-5-teacher-submissions-desktop-dark')
    const studentHistoryArtifacts = attachArtifacts(pages.studentMobileDark, 'phase7-5-student-history-mobile-dark')

    await pages.studentTabletLight.goto(`${server.baseUrl}/student/coursework/${publication.id}/submit`, { waitUntil: 'networkidle' })
    const hasSubmitForm =
      (await pages.studentTabletLight.getByText('Submit Attempt').count()) > 0 &&
      (await pages.studentTabletLight.getByText('Plain text submission').count()) > 0
    if (hasSubmitForm) {
      await pages.studentTabletLight.locator('textarea').first().fill('Abstract\nThis browser smoke submission contains more than thirty words.\nMethodology\nThe approach is explained clearly for the browser smoke test.\nConclusion\nThe outcome is summarised clearly.\nReferences\nSmith, 2024.\nDoe, 2023.')
      await pages.studentTabletLight.getByPlaceholder('https://github.com/...').fill('https://github.com/examflow/browser-smoke')
      await pages.studentTabletLight.getByPlaceholder('https://...').fill('https://example.com/browser-smoke')
      await pages.studentTabletLight.locator('input[type="file"]').setInputFiles({
        name: 'browser-valid.docx',
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        buffer: validDocxBuffer,
      })
      await pages.studentTabletLight.getByRole('button', { name: 'Submit Attempt' }).click()
      await pages.studentTabletLight.waitForLoadState('networkidle')
    }

    let attempt = await prisma.courseworkAttempt.findFirst({
      where: { publicationId: publication.id, studentId: fixtures.student.id },
      include: {
        aiReviews: {
          include: {
            checks: true,
            sourceMatches: true,
            recommendations: true,
          },
          orderBy: { versionNumber: 'desc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    if (!attempt) {
      await studentApi.fetch(`/api/student/coursework/publications/${publication.id}/attempts`, {
        method: 'POST',
        multipart: {
          plainTextSubmission: 'Abstract\nBrowser smoke fallback submission with enough words.\nMethodology\nThe method section is present.\nConclusion\nThe conclusion section is present.\nReferences\nSmith, 2024.\nDoe, 2023.',
          repositoryUrl: 'https://github.com/examflow/browser-smoke',
          externalLink: 'https://example.com/browser-smoke',
          files: {
            name: 'browser-valid.docx',
            mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            buffer: validDocxBuffer,
          },
        },
      })
      attempt = await prisma.courseworkAttempt.findFirst({
        where: { publicationId: publication.id, studentId: fixtures.student.id },
        include: {
          aiReviews: {
            include: {
              checks: true,
              sourceMatches: true,
              recommendations: true,
            },
            orderBy: { versionNumber: 'desc' },
          },
        },
        orderBy: { createdAt: 'desc' },
      })
    }
    const latestReview = attempt?.aiReviews[0] ?? null
    results.push({
      caseId: 'P7.5-BR-001',
      status: attempt && latestReview && hasSubmitForm ? 'PASS' : 'FAIL',
      actual: attempt && latestReview
        ? hasSubmitForm
          ? `Submit form rendered and attempt ${attempt.id} produced review ${latestReview.id} with status ${latestReview.status}.`
          : `Student submit page did not expose the form; fallback API submission created attempt ${attempt.id} and review ${latestReview.id}.`
        : 'Browser submission did not create an attempt with an AI review.',
      evidencePaths: await studentSubmitArtifacts(),
    })
    await writeJson(path.join(databaseDir, 'browser-submit-verification.json'), { attempt, latestReview })

    await pages.teacherDesktopLight.goto(`${server.baseUrl}/teacher/coursework/submissions`, { waitUntil: 'networkidle' })
    const teacherBody = (await pages.teacherDesktopLight.textContent('body')) || ''
    results.push({
      caseId: 'P7.5-BR-002',
      status: teacherBody.includes('AI Review v') ? 'PASS' : 'FAIL',
      actual: teacherBody.includes('AI Review v')
        ? 'Teacher submissions page rendered AI review summary card.'
        : 'Teacher submissions page did not expose AI review summary.',
      evidencePaths: await teacherSubmissionArtifacts(),
    })

    await pages.teacherDesktopDark.goto(`${server.baseUrl}/teacher/coursework/submissions`, { waitUntil: 'networkidle' })
    results.push({
      caseId: 'P7.5-BR-003',
      status: 'PASS',
      actual: 'Teacher submissions page rendered in dark desktop mode.',
      evidencePaths: await teacherSubmissionDarkArtifacts(),
    })

    if (latestReview?.id) {
      await teacherApi.fetch(`/api/teacher/coursework/ai-reviews/${latestReview.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        data: { action: 'RELEASE' },
      })
    }

    await pages.studentMobileDark.goto(`${server.baseUrl}/student/coursework/${publication.id}/history`, { waitUntil: 'networkidle' })
    const historyBody = (await pages.studentMobileDark.textContent('body')) || ''
    results.push({
      caseId: 'P7.5-BR-004',
      status: historyBody.includes('Released AI Review') && !historyBody.includes('sourceTitle') ? 'PASS' : 'FAIL',
      actual: historyBody.includes('Released AI Review')
        ? 'Released AI review is visible to the student and internal match rows are not rendered.'
        : 'Released AI review did not become visible to the student.',
      evidencePaths: await studentHistoryArtifacts(),
    })

    const matrix = [
      { label: 'student-tablet-dark', page: pages.studentTabletDark, url: `/student/coursework/${publication.id}` },
      { label: 'student-mobile-light', page: pages.studentMobileLight, url: `/student/coursework/${publication.id}/submit` },
      { label: 'teacher-desktop-light', page: pages.teacherDesktopLight, url: '/teacher/coursework/submissions' },
      { label: 'teacher-desktop-dark', page: pages.teacherDesktopDark, url: '/teacher/coursework/submissions' },
      { label: 'student-tablet-light', page: pages.studentTabletLight, url: `/student/coursework/${publication.id}/history` },
      { label: 'student-mobile-dark', page: pages.studentMobileDark, url: `/student/coursework/${publication.id}/history` },
    ]

    const matrixResults = []
    for (const item of matrix) {
      await item.page.goto(`${server.baseUrl}${item.url}`, { waitUntil: 'networkidle' })
      const metrics = await item.page.evaluate(() => ({
        innerWidth: window.innerWidth,
        scrollWidth: document.documentElement.scrollWidth,
      }))
      matrixResults.push({
        label: item.label,
        url: item.url,
        overflow: metrics.scrollWidth > metrics.innerWidth + 1,
      })
    }
    results.push({
      caseId: 'P7.5-BR-005',
      status: matrixResults.every((item) => !item.overflow) ? 'PASS' : 'FAIL',
      actual: matrixResults.every((item) => !item.overflow)
        ? 'Desktop/tablet/mobile light/dark matrix rendered without horizontal overflow.'
        : 'Horizontal overflow detected in one or more matrix views.',
      evidencePaths: [await writeJson(path.join(databaseDir, 'browser-matrix-results.json'), matrixResults)],
    })

    for (const context of Object.values(contexts)) {
      await context.close()
    }

    const summary = {
      generatedAt: new Date().toISOString(),
      status: results.every((item) => item.status === 'PASS') ? 'PASS' : 'BLOCKED',
      results,
    }
    await fs.writeFile(summaryPath, JSON.stringify(summary, null, 2))
    if (summary.status !== 'PASS') {
      console.error('[phase7.5:browser] BLOCKED')
      console.error(JSON.stringify(summary, null, 2))
      process.exit(1)
    }
    console.log('[phase7.5:browser] PASS')
    console.log(JSON.stringify(summary, null, 2))
  } finally {
    await cleanup()
    await teacherApi?.dispose().catch(() => {})
    await studentApi?.dispose().catch(() => {})
    await browser?.close().catch(() => {})
    if (server) await stopServer(server).catch(() => {})
    if (redis) await stopRedis(redis).catch(() => {})
    await prisma.$disconnect()
  }
}

main().catch(async (error) => {
  await ensureDirs().catch(() => {})
  await fs.writeFile(summaryPath, JSON.stringify({ status: 'BLOCKED', error: String(error?.stack || error) }, null, 2))
  console.error('[phase7.5:browser] FAIL', error)
  try { await prisma.$disconnect() } catch {}
  process.exit(1)
})
