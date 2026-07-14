import bcrypt from 'bcryptjs'
import { PrismaClient, TeachingAssignmentRoleType, TeachingAssignmentStatus, UserRole } from '@prisma/client/index'

const prisma = new PrismaClient()

function hashPassword(value: string) {
  return bcrypt.hashSync(value, 12)
}

async function ensureUser(input: {
  email: string
  password: string
  name: string
  role: UserRole
}) {
  return prisma.user.upsert({
    where: { email: input.email },
    update: {
      name: input.name,
      role: input.role,
      password: hashPassword(input.password),
      isActive: true,
    },
    create: {
      email: input.email,
      name: input.name,
      role: input.role,
      password: hashPassword(input.password),
      isActive: true,
    },
  })
}

async function ensureTeacherAssignmentRole(assignmentId: string, role: TeachingAssignmentRoleType, isPrimary: boolean) {
  await prisma.teachingAssignmentRole.upsert({
    where: { teachingAssignmentId_role: { teachingAssignmentId: assignmentId, role } },
    update: { isPrimary },
    create: { teachingAssignmentId: assignmentId, role, isPrimary },
  })
}

export async function ensureCourseworkTestFixtures() {
  const [cseDepartment, eeeDepartment, academicYear, semester1] = await Promise.all([
    prisma.department.findFirstOrThrow({ where: { code: 'CSE' } }),
    prisma.department.findFirstOrThrow({ where: { code: 'EEE' } }),
    prisma.academicYear.findFirstOrThrow({ orderBy: { year: 'asc' } }),
    prisma.semester.findFirstOrThrow({ where: { number: 1 } }),
  ])

  const cseOffering = await prisma.academicOffering.findFirstOrThrow({
    where: { departmentId: cseDepartment.id },
    orderBy: { createdAt: 'asc' },
    include: { group: true },
  })

  const cseDepartmentLanguage = await prisma.departmentLanguage.findFirst({
    where: {
      departmentId: cseDepartment.id,
      languageId: cseOffering.languageId,
    },
  })

  const [superAdminUser, cseAdminUser, eeeAdminUser, leadTeacherUser, assistantTeacherUser, unassignedTeacherUser, ownerUser, secondScopedUser, foreignUser] =
    await Promise.all([
      ensureUser({ email: 'admin@examflow.pro', password: 'Admin@123', name: 'Super Admin', role: UserRole.SUPER_ADMIN }),
      ensureUser({ email: 'cse.admin@examflow.pro', password: 'Admin@123', name: 'CSE Department Admin', role: UserRole.DEPARTMENT_ADMIN }),
      ensureUser({ email: 'eee.admin@examflow.pro', password: 'Admin@123', name: 'EEE Department Admin', role: UserRole.DEPARTMENT_ADMIN }),
      ensureUser({ email: 'teacher.john@examflow.pro', password: 'Teacher@123', name: 'John Smith', role: UserRole.TEACHER }),
      ensureUser({ email: 'teacher.sarah@examflow.pro', password: 'Teacher@123', name: 'Sarah Johnson', role: UserRole.TEACHER }),
      ensureUser({ email: 'teacher.anna@examflow.pro', password: 'Teacher@123', name: 'Anna Petrova', role: UserRole.TEACHER }),
      ensureUser({ email: 'alice@student.examflow.pro', password: 'Student@123', name: 'Alice Brown', role: UserRole.STUDENT }),
      ensureUser({ email: 'bob@student.examflow.pro', password: 'Student@123', name: 'Bob Davis', role: UserRole.STUDENT }),
      ensureUser({ email: 'auth.eee.student@examflow.pro', password: 'Student@123', name: 'EEE Auth Student', role: UserRole.STUDENT }),
    ])
  void superAdminUser

  await prisma.department.update({ where: { id: cseDepartment.id }, data: { adminId: cseAdminUser.id } })
  await prisma.department.update({ where: { id: eeeDepartment.id }, data: { adminId: eeeAdminUser.id } })

  const [leadTeacher, assistantTeacher, unassignedTeacher, ownerStudent, secondScopedStudent, foreignStudent] = await Promise.all([
    prisma.teacherProfile.upsert({
      where: { userId: leadTeacherUser.id },
      update: { departmentId: cseDepartment.id },
      create: { userId: leadTeacherUser.id, departmentId: cseDepartment.id },
    }),
    prisma.teacherProfile.upsert({
      where: { userId: assistantTeacherUser.id },
      update: { departmentId: cseDepartment.id },
      create: { userId: assistantTeacherUser.id, departmentId: cseDepartment.id },
    }),
    prisma.teacherProfile.upsert({
      where: { userId: unassignedTeacherUser.id },
      update: { departmentId: cseDepartment.id },
      create: { userId: unassignedTeacherUser.id, departmentId: cseDepartment.id },
    }),
    prisma.studentProfile.upsert({
      where: { userId: ownerUser.id },
      update: { departmentId: cseDepartment.id },
      create: { userId: ownerUser.id, departmentId: cseDepartment.id },
    }),
    prisma.studentProfile.upsert({
      where: { userId: secondScopedUser.id },
      update: { departmentId: cseDepartment.id },
      create: { userId: secondScopedUser.id, departmentId: cseDepartment.id },
    }),
    prisma.studentProfile.upsert({
      where: { userId: foreignUser.id },
      update: { departmentId: eeeDepartment.id },
      create: { userId: foreignUser.id, departmentId: eeeDepartment.id },
    }),
  ])

  await prisma.teacherDepartmentMembership.upsert({
    where: { teacherId_departmentId: { teacherId: leadTeacher.id, departmentId: cseDepartment.id } },
    update: { isPrimary: true, isActive: true },
    create: { teacherId: leadTeacher.id, departmentId: cseDepartment.id, isPrimary: true, isActive: true },
  })
  await prisma.teacherDepartmentMembership.upsert({
    where: { teacherId_departmentId: { teacherId: assistantTeacher.id, departmentId: cseDepartment.id } },
    update: { isPrimary: true, isActive: true },
    create: { teacherId: assistantTeacher.id, departmentId: cseDepartment.id, isPrimary: true, isActive: true },
  })
  await prisma.teacherDepartmentMembership.upsert({
    where: { teacherId_departmentId: { teacherId: unassignedTeacher.id, departmentId: cseDepartment.id } },
    update: { isPrimary: true, isActive: true },
    create: { teacherId: unassignedTeacher.id, departmentId: cseDepartment.id, isPrimary: true, isActive: true },
  })

  const leadMembership = await prisma.teacherDepartmentMembership.findUniqueOrThrow({
    where: { teacherId_departmentId: { teacherId: leadTeacher.id, departmentId: cseDepartment.id } },
  })
  const assistantMembership = await prisma.teacherDepartmentMembership.findUniqueOrThrow({
    where: { teacherId_departmentId: { teacherId: assistantTeacher.id, departmentId: cseDepartment.id } },
  })

  const legacyLeadAssignment =
    (await prisma.teacherAssignment.findFirst({
      where: { teacherId: leadTeacher.id, academicOfferingId: cseOffering.id },
    })) ??
    (await prisma.teacherAssignment.create({
      data: {
        teacherId: leadTeacher.id,
        departmentId: cseDepartment.id,
        subjectId: cseOffering.subjectId,
        languageId: cseOffering.languageId,
        groupId: cseOffering.groupId,
        academicYearId: academicYear.id,
        semesterId: cseOffering.semesterId,
        academicOfferingId: cseOffering.id,
      },
    }))

  await prisma.teacherAssignment.findFirst({
    where: { teacherId: assistantTeacher.id, academicOfferingId: cseOffering.id },
  }) ||
    (await prisma.teacherAssignment.create({
      data: {
        teacherId: assistantTeacher.id,
        departmentId: cseDepartment.id,
        subjectId: cseOffering.subjectId,
        languageId: cseOffering.languageId,
        groupId: cseOffering.groupId,
        academicYearId: academicYear.id,
        semesterId: cseOffering.semesterId,
        academicOfferingId: cseOffering.id,
      },
    }))

  const leadTeachingAssignment =
    (await prisma.teachingAssignment.findFirst({
      where: { teacherId: leadTeacher.id, academicOfferingId: cseOffering.id },
    })) ??
    (await prisma.teachingAssignment.create({
      data: {
        teacherId: leadTeacher.id,
        membershipId: leadMembership.id,
        departmentId: cseDepartment.id,
        academicOfferingId: cseOffering.id,
        status: TeachingAssignmentStatus.ACTIVE,
        weeklyHours: 8,
        lectureHours: 3,
        labHours: 2,
        consultationHours: 1,
        assessmentHours: 2,
        isPrimary: true,
        legacyAssignmentId: legacyLeadAssignment.id,
      },
    }))

  const assistantTeachingAssignment =
    (await prisma.teachingAssignment.findFirst({
      where: { teacherId: assistantTeacher.id, academicOfferingId: cseOffering.id },
    })) ??
    (await prisma.teachingAssignment.create({
      data: {
        teacherId: assistantTeacher.id,
        membershipId: assistantMembership.id,
        departmentId: cseDepartment.id,
        academicOfferingId: cseOffering.id,
        status: TeachingAssignmentStatus.ACTIVE,
        weeklyHours: 6,
        lectureHours: 2,
        labHours: 2,
        consultationHours: 1,
        assessmentHours: 1,
        isPrimary: true,
      },
    }))

  await ensureTeacherAssignmentRole(leadTeachingAssignment.id, TeachingAssignmentRoleType.LEAD_TEACHER, true)
  await ensureTeacherAssignmentRole(leadTeachingAssignment.id, TeachingAssignmentRoleType.EXAMINER, false)
  await ensureTeacherAssignmentRole(assistantTeachingAssignment.id, TeachingAssignmentRoleType.ASSISTANT_TEACHER, true)
  await ensureTeacherAssignmentRole(assistantTeachingAssignment.id, TeachingAssignmentRoleType.REVIEWER, false)

  await prisma.studentSubject.upsert({
    where: {
      studentId_subjectId_languageId_groupId_academicYearId_semesterId: {
        studentId: ownerStudent.id,
        subjectId: cseOffering.subjectId,
        languageId: cseOffering.languageId,
        groupId: cseOffering.groupId,
        academicYearId: academicYear.id,
        semesterId: cseOffering.semesterId,
      },
    },
    update: { academicOfferingId: cseOffering.id },
    create: {
      studentId: ownerStudent.id,
      subjectId: cseOffering.subjectId,
      languageId: cseOffering.languageId,
      groupId: cseOffering.groupId,
      academicYearId: academicYear.id,
      semesterId: cseOffering.semesterId,
      academicOfferingId: cseOffering.id,
    },
  })
  await prisma.studentSubject.upsert({
    where: {
      studentId_subjectId_languageId_groupId_academicYearId_semesterId: {
        studentId: secondScopedStudent.id,
        subjectId: cseOffering.subjectId,
        languageId: cseOffering.languageId,
        groupId: cseOffering.groupId,
        academicYearId: academicYear.id,
        semesterId: cseOffering.semesterId,
      },
    },
    update: { academicOfferingId: cseOffering.id },
    create: {
      studentId: secondScopedStudent.id,
      subjectId: cseOffering.subjectId,
      languageId: cseOffering.languageId,
      groupId: cseOffering.groupId,
      academicYearId: academicYear.id,
      semesterId: cseOffering.semesterId,
      academicOfferingId: cseOffering.id,
    },
  })
  return {
    leadTeacherId: leadTeacher.id,
    assistantTeacherId: assistantTeacher.id,
    unassignedTeacherId: unassignedTeacher.id,
    ownerStudentId: ownerStudent.id,
    secondScopedStudentId: secondScopedStudent.id,
    foreignStudentId: foreignStudent.id,
    cseDepartmentLanguageId: cseDepartmentLanguage?.id ?? null,
    cseOfferingId: cseOffering.id,
    eeeDepartmentId: eeeDepartment.id,
  }
}

async function main() {
  const result = await ensureCourseworkTestFixtures()
  console.log(JSON.stringify(result, null, 2))
}

if (require.main === module) {
  main()
    .catch((error) => {
      console.error(error)
      process.exit(1)
    })
    .finally(async () => {
      await prisma.$disconnect()
    })
}
