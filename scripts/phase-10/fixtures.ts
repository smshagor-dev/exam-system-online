import { TeachingAssignmentStatus, UserRole } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { ensurePhase9Fixtures } from '../phase-9/fixtures'

export async function ensurePhase10Fixtures() {
  const phase9 = await ensurePhase9Fixtures()

  const offering = await prisma.academicOffering.findUniqueOrThrow({
    where: { id: phase9.offering.id },
    include: {
      subject: true,
      program: true,
      group: true,
      language: true,
      teachingAssignments: {
        where: { status: TeachingAssignmentStatus.ACTIVE },
        include: {
          teacher: {
            include: {
              user: true,
            },
          },
          roles: true,
        },
        orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
        take: 1,
      },
      teacherAssignments: {
        include: {
          teacher: {
            include: {
              user: true,
            },
          },
        },
        orderBy: { createdAt: 'asc' },
        take: 1,
      },
    },
  })

  const modernTeacher = offering.teachingAssignments[0]?.teacher ?? null
  const legacyTeacher = offering.teacherAssignments[0]?.teacher ?? null
  const teacher = modernTeacher ?? legacyTeacher ?? phase9.teacher

  const [superAdmin, cseAdmin, eeeAdmin] = await Promise.all([
    prisma.user.findFirstOrThrow({ where: { role: UserRole.SUPER_ADMIN, isActive: true } }),
    phase9.departments.cse.adminId
      ? prisma.user.findUniqueOrThrow({ where: { id: phase9.departments.cse.adminId } })
      : prisma.user.findFirstOrThrow({ where: { role: UserRole.DEPARTMENT_ADMIN, isActive: true } }),
    phase9.departments.eee.adminId
      ? prisma.user.findUniqueOrThrow({ where: { id: phase9.departments.eee.adminId } })
      : prisma.user.findFirstOrThrow({
          where: {
            role: UserRole.DEPARTMENT_ADMIN,
            isActive: true,
            id: { not: phase9.departments.cse.adminId ?? undefined },
          },
        }),
  ])

  return {
    ...phase9,
    offering,
    teacher,
    users: {
      superAdmin,
      cseAdmin,
      eeeAdmin,
    },
  }
}
