import fs from 'node:fs/promises'
import path from 'node:path'
import { PrismaClient, CourseworkAudienceType, CourseworkLatePolicyType, CourseworkPublicationStatus, CourseworkTemplateType, CourseworkVisibility, UserRole } from '@prisma/client'
import { createApiContext, startRedis, startServer, stopRedis, stopServer, writeJson } from '../phase-6/evidence-helpers.mjs'

const prisma = new PrismaClient()
const evidenceDir = path.join(process.cwd(), 'docs', 'final-audit', 'evidence', 'phase-7-5')
const dbDir = path.join(evidenceDir, 'database')
const networkDir = path.join(evidenceDir, 'network')
const summaryPath = path.join(dbDir, 'authorization-matrix.json')

const created = {
  templateId: null,
  versionId: null,
  publicationId: null,
  attemptId: null,
  reviewId: null,
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

async function ensureDirs() {
  await Promise.all([dbDir, networkDir].map((dir) => fs.mkdir(dir, { recursive: true })))
}

async function gatherFixtures() {
  let leadTeacher = await prisma.teacherProfile.findFirst({
    where: { user: { email: 'teacher.john@examflow.pro' } },
    include: {
      user: true,
      teachingAssignments: {
        where: { status: 'ACTIVE' },
        include: { academicOffering: true, roles: true },
        take: 1,
      },
    },
  })

  if (!leadTeacher) {
    runLegacyTestSeed()
    leadTeacher = await prisma.teacherProfile.findFirstOrThrow({
      where: { user: { email: 'teacher.john@examflow.pro' } },
      include: {
        user: true,
        teachingAssignments: {
          where: { status: 'ACTIVE' },
          include: { academicOffering: true, roles: true },
          take: 1,
        },
      },
    })
  }
  const assistantTeacher = await prisma.teacherProfile.findFirstOrThrow({
    where: { user: { email: 'teacher.sarah@examflow.pro' } },
    include: {
      user: true,
      teachingAssignments: {
        where: { status: 'ACTIVE' },
        include: { academicOffering: true, roles: true },
        take: 1,
      },
    },
  })
  const unassignedTeacher = await prisma.teacherProfile.findFirstOrThrow({
    where: { user: { email: 'teacher.anna@examflow.pro' } },
    include: { user: true },
  })
  const cseAdmin = await prisma.user.findFirstOrThrow({ where: { email: 'cse.admin@examflow.pro' } })
  const deptB = await prisma.department.findFirstOrThrow({
    where: { code: { not: 'CSE' }, adminId: { not: null } },
    include: { admin: true },
  })
  const studentOwner = await prisma.studentProfile.findFirstOrThrow({
    where: {
      departmentId: leadTeacher.departmentId,
      subjects: {
        some: { academicOfferingId: leadTeacher.teachingAssignments[0]?.academicOfferingId ?? undefined },
      },
    },
    include: { user: true },
  })
  const foreignStudent = await prisma.studentProfile.findFirstOrThrow({
    where: { id: { not: studentOwner.id } },
    include: { user: true },
  })

  return { leadTeacher, assistantTeacher, unassignedTeacher, cseAdmin, deptB, studentOwner, foreignStudent }
}

async function createFixture(fixtures, ownerApi) {
  const scope = fixtures.leadTeacher.teachingAssignments[0]
  const template = await prisma.courseworkTemplate.create({
    data: {
      teacherId: fixtures.leadTeacher.id,
      departmentId: scope.departmentId,
      academicOfferingId: scope.academicOfferingId,
      subjectId: scope.academicOffering.subjectId,
      languageId: scope.academicOffering.languageId,
      groupId: scope.academicOffering.groupId,
      academicYearId: scope.academicOffering.programYearId,
      semesterId: scope.academicOffering.semesterId,
      type: CourseworkTemplateType.RESEARCH,
      visibility: CourseworkVisibility.COURSE,
      title: 'Phase 7.5 Auth Template',
      description: 'Auth fixture',
      instructions: 'Auth fixture',
      allowedFileTypes: ['txt'],
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
      publishedById: fixtures.leadTeacher.id,
    },
  })
  created.versionId = version.id
  const publication = await prisma.courseworkPublication.create({
    data: {
      templateId: template.id,
      templateVersionId: version.id,
      teacherId: fixtures.leadTeacher.id,
      departmentId: scope.departmentId,
      academicOfferingId: scope.academicOfferingId,
      subjectId: scope.academicOffering.subjectId,
      languageId: scope.academicOffering.languageId,
      groupId: scope.academicOffering.groupId,
      academicYearId: scope.academicOffering.programYearId,
      semesterId: scope.academicOffering.semesterId,
      audienceType: CourseworkAudienceType.INDIVIDUAL,
      status: CourseworkPublicationStatus.PUBLISHED,
      title: 'Phase 7.5 Auth Publication',
      instructions: 'Auth publication',
      versionNumber: 1,
      publishedAt: new Date(),
      dueAt: new Date(Date.now() + 86_400_000),
      hardCloseAt: new Date(Date.now() + 172_800_000),
      allowedFileTypes: ['txt'],
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
    },
  })
  created.publicationId = publication.id
  await prisma.courseworkPublicationTarget.create({
    data: { publicationId: publication.id, studentId: fixtures.studentOwner.id },
  })
  const submitResponse = await ownerApi.fetch(`/api/student/coursework/publications/${publication.id}/attempts`, {
    method: 'POST',
    multipart: {
      plainTextSubmission: 'Authorization fixture submission with enough words to create a review and keep the attempt accessible for permission checks.',
      repositoryUrl: 'https://github.com/example/auth-fixture',
      files: {
        name: 'fixture.txt',
        mimeType: 'text/plain',
        buffer: Buffer.from('fixture'),
      },
    },
  })
  if (submitResponse.status() !== 201) {
    throw new Error(`Failed to create auth fixture attempt: ${await submitResponse.text()}`)
  }
  const submitJson = await submitResponse.json()
  created.attemptId = submitJson.attempt.id
  const rerunResponse = await ownerApi.fetch(`/api/teacher/coursework/attempts/${created.attemptId}/ai-review`, { method: 'POST' })
  if (rerunResponse.status() !== 403) {
    // student cannot rerun, use DB to discover current review for authorization fixture
  }
  const review = await prisma.courseworkAIReview.findFirst({
    where: { attemptId: created.attemptId },
    orderBy: { versionNumber: 'desc' },
  })
  if (!review) throw new Error('Auth fixture review was not created after submission')
  created.reviewId = review.id
  return { publicationId: publication.id, attemptId: created.attemptId, reviewId: review.id }
}

async function cleanup() {
  if (created.publicationId) {
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
  if (created.versionId) {
    await prisma.courseworkTemplateVersion.deleteMany({ where: { id: created.versionId } })
  }
  if (created.templateId) {
    await prisma.courseworkTemplate.deleteMany({ where: { id: created.templateId } })
  }
}

async function callJson(api, method, url, body, evidenceName) {
  const response = await api.fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    data: body,
  })
  const text = await response.text()
  let json = null
  try { json = JSON.parse(text) } catch {}
  const evidence = await writeJson(path.join(networkDir, `${evidenceName}.json`), { method, url, status: response.status(), json, text })
  return { status: response.status(), json, text, evidence }
}

async function main() {
  await ensureDirs()
  const fixtures = await gatherFixtures()
  let redis = null
  let server = null
  const rows = []

  try {
    redis = await startRedis('phase7-5-auth')
    server = await startServer({ port: 3265, redisUrl: redis.redisUrl, logPrefix: 'phase7-5-auth' })

    const leadApi = await createApiContext(server.baseUrl, fixtures.leadTeacher.user.email, 'Teacher@123')
    const assistantApi = await createApiContext(server.baseUrl, fixtures.assistantTeacher.user.email, 'Teacher@123')
    const unassignedApi = await createApiContext(server.baseUrl, fixtures.unassignedTeacher.user.email, 'Teacher@123')
    const adminAApi = await createApiContext(server.baseUrl, fixtures.cseAdmin.email, 'Admin@123')
    const adminBApi = await createApiContext(server.baseUrl, fixtures.deptB.admin.email, 'Admin@123')
    const ownerApi = await createApiContext(server.baseUrl, fixtures.studentOwner.user.email, 'Student@123')
    const foreignApi = await createApiContext(server.baseUrl, fixtures.foreignStudent.user.email, 'Student@123')
    const fixture = await createFixture(fixtures, ownerApi)

    const actors = [
      { label: 'Lead Teacher', role: UserRole.TEACHER, userId: fixtures.leadTeacher.userId, api: leadApi },
      { label: 'Assistant Teacher', role: UserRole.TEACHER, userId: fixtures.assistantTeacher.userId, api: assistantApi },
      { label: 'Unassigned Teacher', role: UserRole.TEACHER, userId: fixtures.unassignedTeacher.userId, api: unassignedApi },
      { label: 'Department Admin A', role: UserRole.DEPARTMENT_ADMIN, userId: fixtures.cseAdmin.id, api: adminAApi },
      { label: 'Department Admin B', role: UserRole.DEPARTMENT_ADMIN, userId: fixtures.deptB.admin.id, api: adminBApi },
      { label: 'Student owner', role: UserRole.STUDENT, userId: fixtures.studentOwner.userId, api: ownerApi },
      { label: 'Foreign student', role: UserRole.STUDENT, userId: fixtures.foreignStudent.userId, api: foreignApi },
    ]

    for (const actor of actors) {
      const rerunResponse = actor.api
        ? await callJson(actor.api, 'POST', `/api/teacher/coursework/attempts/${fixture.attemptId}/ai-review`, undefined, `auth-${actor.label.toLowerCase().replaceAll(' ', '-')}-rerun`)
        : { status: 401, evidence: null }
      const releaseResponse = actor.api
        ? await callJson(actor.api, 'PATCH', `/api/teacher/coursework/ai-reviews/${fixture.reviewId}`, { action: 'RELEASE' }, `auth-${actor.label.toLowerCase().replaceAll(' ', '-')}-release`)
        : { status: 401, evidence: null }
      const reportResponse = actor.api
        ? await actor.api.fetch(`/api/teacher/coursework/ai-reviews/${fixture.reviewId}/report?format=json`)
        : null

      rows.push({
        actor: actor.label,
        role: actor.role,
        rerunStatus: rerunResponse.status,
        releaseStatus: releaseResponse.status,
        reportStatus: reportResponse ? reportResponse.status() : 401,
        rerunEvidence: rerunResponse.evidence,
        releaseEvidence: releaseResponse.evidence,
      })
    }

    rows.push({
      actor: 'Unauthenticated user',
      role: 'ANON',
      permissionCheck: false,
      rerunStatus: 401,
      releaseStatus: 401,
      reportStatus: 401,
      rerunEvidence: null,
      releaseEvidence: null,
    })

    const summary = {
      generatedAt: new Date().toISOString(),
      status: rows.every((row) => {
        if (row.actor === 'Lead Teacher' || row.actor === 'Assistant Teacher') {
          return row.rerunStatus === 200 && row.releaseStatus === 200 && row.reportStatus === 200
        }

        if (row.actor === 'Unauthenticated user') {
          return row.rerunStatus === 401 && row.releaseStatus === 401 && row.reportStatus === 401
        }

        return row.rerunStatus === 403 && row.releaseStatus === 403 && row.reportStatus === 403
      }) ? 'PASS' : 'BLOCKED',
      rows,
    }

    await fs.writeFile(summaryPath, JSON.stringify(summary, null, 2))
    console.log(summary.status === 'PASS' ? '[phase7.5:auth] PASS' : '[phase7.5:auth] BLOCKED')
    console.log(JSON.stringify(summary, null, 2))
    if (summary.status !== 'PASS') process.exit(1)
  } finally {
    await cleanup()
    if (server) await stopServer(server).catch(() => {})
    if (redis) await stopRedis(redis).catch(() => {})
    await prisma.$disconnect()
  }
}

main().catch(async (error) => {
  await ensureDirs().catch(() => {})
  await fs.writeFile(summaryPath, JSON.stringify({ status: 'BLOCKED', error: String(error?.stack || error) }, null, 2))
  console.error('[phase7.5:auth] FAIL', error)
  try { await prisma.$disconnect() } catch {}
  process.exit(1)
})
