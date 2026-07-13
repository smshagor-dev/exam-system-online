import { UserRole } from '@prisma/client'
import { prisma } from '@/lib/prisma'

export async function ensurePhase9Fixtures() {
  const [cse, eee, academicSession, semester] = await Promise.all([
    prisma.department.findFirstOrThrow({
      where: { code: 'CSE' },
      include: { admin: true },
    }),
    prisma.department.findFirstOrThrow({
      where: { code: 'EEE' },
      include: { admin: true },
    }),
    prisma.academicSession.findFirstOrThrow({ where: { isActive: true } }),
    prisma.semester.findFirstOrThrow({ where: { isActive: true } }),
  ])

  const offering = await prisma.academicOffering.findFirstOrThrow({
    where: {
      departmentId: cse.id,
      isActive: true,
      studentSubjects: {
        some: {},
      },
    },
    include: {
      subject: true,
      program: true,
      programSubject: true,
      group: true,
    },
  })

  const teacher = await prisma.teacherProfile.findFirstOrThrow({
    where: {
      departmentId: cse.id,
    },
    include: {
      user: true,
    },
  })

  const student = await prisma.studentProfile.findFirstOrThrow({
    where: {
      departmentId: cse.id,
      subjects: {
        some: {
          academicOfferingId: offering.id,
        },
      },
    },
    include: {
      user: true,
      enrollments: {
        where: {
          status: 'ACTIVE',
          isActive: true,
        },
        orderBy: {
          enrolledAt: 'desc',
        },
        take: 1,
      },
    },
  })

  const foreignStudent = await prisma.studentProfile.findFirstOrThrow({
    where: {
      departmentId: eee.id,
    },
    include: {
      user: true,
    },
  })

  const [superAdmin, cseAdmin, eeeAdmin] = await Promise.all([
    prisma.user.findFirstOrThrow({ where: { role: UserRole.SUPER_ADMIN, isActive: true } }),
    cse.adminId
      ? prisma.user.findUniqueOrThrow({ where: { id: cse.adminId } })
      : prisma.user.findFirstOrThrow({ where: { role: UserRole.DEPARTMENT_ADMIN, isActive: true } }),
    eee.adminId
      ? prisma.user.findUniqueOrThrow({ where: { id: eee.adminId } })
      : prisma.user.findFirstOrThrow({
          where: {
            role: UserRole.DEPARTMENT_ADMIN,
            isActive: true,
            id: {
              not: cse.adminId ?? undefined,
            },
          },
        }),
  ])

  if (!student.enrollments.length) {
    const studentSubject = await prisma.studentSubject.findFirstOrThrow({
      where: {
        studentId: student.id,
        academicOfferingId: offering.id,
      },
    })

    await prisma.studentEnrollment.create({
      data: {
        studentId: student.id,
        departmentId: cse.id,
        academicYearId: studentSubject.academicYearId,
        academicSessionId: academicSession.id,
        programId: offering.programId,
        programYearId: offering.programYearId,
        semesterId: offering.semesterId,
        groupId: offering.groupId,
        languageId: offering.languageId,
        status: 'ACTIVE',
        isActive: true,
        notes: 'Phase 9 fixture enrollment',
      },
    })
  }

  return {
    departments: { cse, eee },
    academicSession,
    semester,
    offering,
    teacher,
    student,
    foreignStudent,
    users: { superAdmin, cseAdmin, eeeAdmin },
  }
}
