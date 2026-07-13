import fs from 'node:fs/promises'
import path from 'node:path'
import { prisma } from '@/lib/prisma'
import { ensurePhase10Fixtures } from './fixtures'

const evidencePath = path.join(process.cwd(), 'docs/phase-10/evidence/database/phase10-auth.json')

function buildCoursePayload(fixtures: Awaited<ReturnType<typeof ensurePhase10Fixtures>>, suffix: string) {
  return {
    departmentId: fixtures.departments.cse.id,
    programId: fixtures.offering.programId,
    academicOfferingId: fixtures.offering.id,
    subjectId: fixtures.offering.subjectId,
    semesterId: fixtures.offering.semesterId,
    groupId: fixtures.offering.groupId,
    languageId: fixtures.offering.languageId,
    code: `P10-AUTH-${suffix}`,
    title: `Phase 10 Auth ${suffix}`,
    summary: 'Authorization matrix validation course.',
    credits: 3,
    version: {
      title: 'Auth Version 1.0',
      sections: [
        {
          title: 'Auth Section',
          lessons: [
            {
              title: 'Auth Lesson',
              type: 'VIDEO',
            },
          ],
        },
      ],
    },
  }
}

async function main() {
  const helpers = await import('../phase-6/evidence-helpers.mjs')
  const fixtures = await ensurePhase10Fixtures()
  let redis = null
  let server = null
  let baseUrl = 'http://127.0.0.1:3000'

  try {
    const ready = await fetch(`${baseUrl}/api/health/ready`)
    if (!ready.ok) {
      throw new Error(`Unexpected readiness status ${ready.status}`)
    }
  } catch {
    redis = await helpers.startRedis('phase10-auth')
    server = await helpers.startServer({
      port: 3250,
      redisUrl: redis.redisUrl,
      logPrefix: 'phase10-auth-server',
    })
    baseUrl = server.baseUrl
  }

  let cseAdminApi
  let eeeAdminApi
  let teacherApi
  let studentApi

  try {
    cseAdminApi = await helpers.createApiContext(baseUrl, fixtures.users.cseAdmin.email, 'Admin@123')
    eeeAdminApi = await helpers.createApiContext(baseUrl, fixtures.users.eeeAdmin.email, 'Admin@123')
    teacherApi = await helpers.createApiContext(baseUrl, fixtures.teacher.user.email, 'Teacher@123')
    studentApi = await helpers.createApiContext(baseUrl, fixtures.student.user.email, 'Student@123')

    const suffix = String(Date.now())
    const adminCreate = await helpers.fetchJson(
      cseAdminApi,
      'POST',
      '/api/admin/lms/courses',
      buildCoursePayload(fixtures, suffix),
      'phase10-auth-admin-create'
    )
    const teacherCreate = await helpers.fetchJson(
      teacherApi,
      'POST',
      '/api/admin/lms/courses',
      buildCoursePayload(fixtures, `${suffix}-T`),
      'phase10-auth-teacher-create'
    )
    const foreignAdminCreate = await helpers.fetchJson(
      eeeAdminApi,
      'POST',
      '/api/admin/lms/courses',
      buildCoursePayload(fixtures, `${suffix}-F`),
      'phase10-auth-foreign-admin-create'
    )
    const studentCreate = await helpers.fetchJson(
      studentApi,
      'POST',
      '/api/admin/lms/courses',
      buildCoursePayload(fixtures, `${suffix}-S`),
      'phase10-auth-student-create'
    )
    const foreignAdminRead = await helpers.fetchJson(
      eeeAdminApi,
      'GET',
      `/api/admin/lms/courses?departmentId=${fixtures.departments.cse.id}`,
      undefined,
      'phase10-auth-foreign-admin-read'
    )

    let teacherPublishStatus = 0
    if (teacherCreate.status === 201) {
      const lessonId = teacherCreate.json?.versions?.[0]?.sections?.[0]?.lessons?.[0]?.id
      if (lessonId) {
        const publish = await teacherApi.fetch(`/api/teacher/lms/lessons/${lessonId}/publish`, {
          method: 'POST',
          timeout: 120000,
        })
        teacherPublishStatus = publish.status()
        await fs.mkdir(path.join(process.cwd(), 'docs/phase-10/evidence/network'), { recursive: true })
        await fs.writeFile(
          path.join(process.cwd(), 'docs/phase-10/evidence/network/phase10-auth-teacher-publish.json'),
          JSON.stringify({ status: publish.status(), lessonId }, null, 2)
        )
      }
    }

    const payload = {
      status:
        adminCreate.status === 201 &&
        teacherCreate.status === 201 &&
        teacherPublishStatus === 200 &&
        foreignAdminCreate.status === 403 &&
        foreignAdminRead.status === 403 &&
        studentCreate.status === 403
          ? 'PASS'
          : 'BLOCKED',
      generatedAt: new Date().toISOString(),
      matrix: {
        departmentAdminCreate: adminCreate.status,
        teacherCreate: teacherCreate.status,
        teacherPublish: teacherPublishStatus,
        foreignDepartmentAdminCreate: foreignAdminCreate.status,
        foreignDepartmentAdminRead: foreignAdminRead.status,
        studentCreate: studentCreate.status,
      },
    }

    await fs.mkdir(path.dirname(evidencePath), { recursive: true })
    await fs.writeFile(evidencePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
    console.log(JSON.stringify(payload, null, 2))
  } finally {
    await cseAdminApi?.dispose().catch(() => {})
    await eeeAdminApi?.dispose().catch(() => {})
    await teacherApi?.dispose().catch(() => {})
    await studentApi?.dispose().catch(() => {})
    if (server) {
      await helpers.stopServer(server).catch(() => {})
    }
    if (redis) {
      await helpers.stopRedis(redis).catch(() => {})
    }
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
}).finally(async () => {
  await prisma.$disconnect().catch(() => {})
})
