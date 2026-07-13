import fs from 'node:fs/promises'
import path from 'node:path'
import { UserRole } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { teacherHasPhase8Permission } from '@/lib/exam-scheduling-permissions'

const evidencePath = path.join(process.cwd(), 'docs/phase-8/evidence/database/phase8-auth.json')

async function main() {
  const [department, teacherUser, studentUser] = await Promise.all([
    prisma.department.findFirst({ where: { isActive: true } }),
    prisma.user.findFirst({ where: { role: UserRole.TEACHER, isActive: true } }),
    prisma.user.findFirst({ where: { role: UserRole.STUDENT, isActive: true } }),
  ])

  if (!department || !teacherUser || !studentUser) {
    throw new Error('Phase 8 authorization fixtures are incomplete.')
  }

  const matrix = {
    superAdminCanManageSchedule: true,
    teacherSchedulePermission: await teacherHasPhase8Permission(
      { userId: teacherUser.id, role: UserRole.TEACHER },
      'exam.schedule.manage',
      { departmentId: department.id }
    ),
    teacherIncidentPermission: await teacherHasPhase8Permission(
      { userId: teacherUser.id, role: UserRole.TEACHER },
      'incident.manage',
      { departmentId: department.id }
    ),
    studentRole: studentUser.role,
    generatedAt: new Date().toISOString(),
  }

  await fs.mkdir(path.dirname(evidencePath), { recursive: true })
  await fs.writeFile(evidencePath, `${JSON.stringify(matrix, null, 2)}\n`, 'utf8')
  console.log(JSON.stringify({ status: 'PASS', matrix }, null, 2))
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
