import fs from 'node:fs/promises'
import path from 'node:path'
import { prisma } from '@/lib/prisma'
import { ensurePhase9Fixtures } from './fixtures'

const evidencePath = path.join(process.cwd(), 'docs/phase-9/evidence/database/phase9-auth.json')

async function main() {
  const helpers = await import('../phase-6/evidence-helpers.mjs')
  const fixtures = await ensurePhase9Fixtures()
  let redis = null
  let server = null
  let baseUrl = 'http://127.0.0.1:3000'

  try {
    const ready = await fetch(`${baseUrl}/api/health/ready`)
    if (!ready.ok) {
      throw new Error(`Unexpected readiness status ${ready.status}`)
    }
  } catch {
    redis = await helpers.startRedis('phase9-auth')
    server = await helpers.startServer({
      port: 3239,
      redisUrl: redis.redisUrl,
      logPrefix: 'phase9-auth-server',
    })
    baseUrl = server.baseUrl
  }

  let superAdminApi
  let cseAdminApi
  let eeeAdminApi
  let teacherApi
  let studentApi

  try {
    superAdminApi = await helpers.createApiContext(baseUrl, fixtures.users.superAdmin.email, 'Admin@123')
    cseAdminApi = await helpers.createApiContext(baseUrl, fixtures.users.cseAdmin.email, 'Admin@123')
    eeeAdminApi = await helpers.createApiContext(baseUrl, fixtures.users.eeeAdmin.email, 'Admin@123')
    teacherApi = await helpers.createApiContext(baseUrl, fixtures.teacher.user.email, 'Teacher@123')
    studentApi = await helpers.createApiContext(baseUrl, fixtures.student.user.email, 'Student@123')

    const officerResponse = await helpers.fetchJson(
      cseAdminApi,
      'POST',
      '/api/admin/results-enterprise/officers',
      {
        teacherId: fixtures.teacher.id,
        departmentId: fixtures.departments.cse.id,
        roleType: 'CONTROLLER_OF_EXAMINATION',
        isActive: true,
      },
      'phase9-auth-officer-create'
    )

    const superAdminAnalytics = await helpers.fetchJson(
      superAdminApi,
      'GET',
      `/api/admin/results-enterprise/analytics?departmentId=${fixtures.departments.cse.id}`,
      undefined,
      'phase9-auth-super-admin'
    )
    const teacherAnalytics = await helpers.fetchJson(
      teacherApi,
      'GET',
      `/api/admin/results-enterprise/analytics?departmentId=${fixtures.departments.cse.id}`,
      undefined,
      'phase9-auth-teacher'
    )
    const studentAnalytics = await helpers.fetchJson(
      studentApi,
      'GET',
      `/api/admin/results-enterprise/analytics?departmentId=${fixtures.departments.cse.id}`,
      undefined,
      'phase9-auth-student'
    )
    const foreignAdminAnalytics = await helpers.fetchJson(
      eeeAdminApi,
      'GET',
      `/api/admin/results-enterprise/analytics?departmentId=${fixtures.departments.cse.id}`,
      undefined,
      'phase9-auth-foreign-admin'
    )

    const payload = {
      status:
        officerResponse.status === 201 &&
        superAdminAnalytics.status === 200 &&
        teacherAnalytics.status === 200 &&
        studentAnalytics.status === 403 &&
        foreignAdminAnalytics.status === 403
          ? 'PASS'
          : 'BLOCKED',
      generatedAt: new Date().toISOString(),
      matrix: {
        superAdminAnalytics: superAdminAnalytics.status,
        departmentAdminOfficerCreate: officerResponse.status,
        teacherAnalytics: teacherAnalytics.status,
        studentAnalytics: studentAnalytics.status,
        foreignDepartmentAdminAnalytics: foreignAdminAnalytics.status,
      },
    }

    await fs.mkdir(path.dirname(evidencePath), { recursive: true })
    await fs.writeFile(evidencePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
    console.log(JSON.stringify(payload, null, 2))
  } finally {
    await superAdminApi?.dispose().catch(() => {})
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
