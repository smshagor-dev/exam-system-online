import {
  CourseworkAudienceType,
  CourseworkLatePolicyType,
  CourseworkPublicationStatus,
  CourseworkTemplateType,
  CourseworkVisibility,
  UserRole,
} from '@prisma/client'
import { teacherHasCourseworkPermission, studentCanAccessCourseworkPublication } from '../../src/lib/permissions'
import { prisma } from '../../src/lib/prisma'

async function main() {
  const createdIds: Record<string, string> = {}
  const leadTeacher = await prisma.teacherProfile.findFirst({
    where: {
      teachingAssignments: {
        some: {
          status: 'ACTIVE',
          roles: {
            some: { role: 'LEAD_TEACHER' },
          },
        },
      },
    },
    include: {
      user: true,
      teachingAssignments: {
        where: {
          status: 'ACTIVE',
          roles: {
            some: { role: 'LEAD_TEACHER' },
          },
        },
        include: { academicOffering: true },
        take: 1,
      },
    },
  })

  const assistantTeacher = await prisma.teacherProfile.findFirst({
    where: {
      teachingAssignments: {
        some: {
          status: 'ACTIVE',
          roles: {
            some: { role: 'ASSISTANT_TEACHER' },
          },
        },
      },
    },
    include: {
      user: true,
      teachingAssignments: {
        where: {
          status: 'ACTIVE',
          roles: {
            some: { role: 'ASSISTANT_TEACHER' },
          },
        },
        include: { academicOffering: true },
        take: 1,
      },
    },
  })

  const student = await prisma.studentProfile.findFirst({
    include: { user: true },
  })

  if (!leadTeacher?.teachingAssignments[0] || !assistantTeacher?.teachingAssignments[0] || !student?.userId) {
    throw new Error('Seeded actors required for Phase 7 auth matrix were not found')
  }

  const leadScope = leadTeacher.teachingAssignments[0].academicOffering
  const assistantScope = assistantTeacher.teachingAssignments[0].academicOffering

  const scopedStudent = await prisma.studentProfile.findFirst({
    where: {
      departmentId: leadTeacher.teachingAssignments[0].departmentId,
      subjects: {
        some: leadTeacher.teachingAssignments[0].academicOfferingId
          ? {
              OR: [
                {
                  academicOfferingId: leadTeacher.teachingAssignments[0].academicOfferingId,
                },
                {
                  subjectId: leadTeacher.teachingAssignments[0].academicOffering.subjectId,
                  languageId: leadTeacher.teachingAssignments[0].academicOffering.languageId,
                  groupId: leadTeacher.teachingAssignments[0].academicOffering.groupId,
                  academicYearId: leadTeacher.teachingAssignments[0].academicOffering.programYearId,
                  semesterId: leadTeacher.teachingAssignments[0].academicOffering.semesterId,
                },
              ],
            }
          : {
              subjectId: leadTeacher.teachingAssignments[0].academicOffering.subjectId,
              languageId: leadTeacher.teachingAssignments[0].academicOffering.languageId,
              groupId: leadTeacher.teachingAssignments[0].academicOffering.groupId,
              academicYearId: leadTeacher.teachingAssignments[0].academicOffering.programYearId,
              semesterId: leadTeacher.teachingAssignments[0].academicOffering.semesterId,
            },
      },
    },
    include: { user: true },
  })

  const foreignStudent = await prisma.studentProfile.findFirst({
    where: {
      NOT: {
        id: scopedStudent?.id ?? '__no_match__',
      },
    },
    include: { user: true },
  })

  if (!scopedStudent?.userId || !foreignStudent?.userId) {
    throw new Error('Seeded students required for positive and negative Phase 7 auth checks were not found')
  }

  const [leadManage, leadPublish, assistantManage, assistantPublish] = await Promise.all([
    teacherHasCourseworkPermission(
      { userId: leadTeacher.userId, role: UserRole.TEACHER },
      'coursework.manage',
      {
        academicOfferingId: leadTeacher.teachingAssignments[0].academicOfferingId,
        subjectId: leadScope.subjectId,
        languageId: leadScope.languageId,
        groupId: leadScope.groupId,
        academicYearId: leadScope.programYearId,
        semesterId: leadScope.semesterId,
      }
    ),
    teacherHasCourseworkPermission(
      { userId: leadTeacher.userId, role: UserRole.TEACHER },
      'coursework.publish',
      {
        academicOfferingId: leadTeacher.teachingAssignments[0].academicOfferingId,
        subjectId: leadScope.subjectId,
        languageId: leadScope.languageId,
        groupId: leadScope.groupId,
        academicYearId: leadScope.programYearId,
        semesterId: leadScope.semesterId,
      }
    ),
    teacherHasCourseworkPermission(
      { userId: assistantTeacher.userId, role: UserRole.TEACHER },
      'coursework.manage',
      {
        academicOfferingId: assistantTeacher.teachingAssignments[0].academicOfferingId,
        subjectId: assistantScope.subjectId,
        languageId: assistantScope.languageId,
        groupId: assistantScope.groupId,
        academicYearId: assistantScope.programYearId,
        semesterId: assistantScope.semesterId,
      }
    ),
    teacherHasCourseworkPermission(
      { userId: assistantTeacher.userId, role: UserRole.TEACHER },
      'coursework.publish',
      {
        academicOfferingId: assistantTeacher.teachingAssignments[0].academicOfferingId,
        subjectId: assistantScope.subjectId,
        languageId: assistantScope.languageId,
        groupId: assistantScope.groupId,
        academicYearId: assistantScope.programYearId,
        semesterId: assistantScope.semesterId,
      }
    ),
  ])

  try {
    const scopedTemplate = await prisma.courseworkTemplate.create({
      data: {
        teacherId: leadTeacher.id,
        departmentId: leadTeacher.teachingAssignments[0].departmentId,
        academicOfferingId: leadTeacher.teachingAssignments[0].academicOfferingId,
        subjectId: leadScope.subjectId,
        languageId: leadScope.languageId,
        groupId: leadScope.groupId,
        academicYearId: leadScope.programYearId,
        semesterId: leadScope.semesterId,
        type: CourseworkTemplateType.HOMEWORK,
        visibility: CourseworkVisibility.COURSE,
        title: 'Phase 7 Auth Fixture Template',
        description: 'Temporary auth fixture template',
        instructions: 'Temporary auth fixture instructions',
        allowedFileTypes: ['txt'],
        maxFileSizeBytes: 1024 * 1024,
        maxAttempts: 1,
        allowUnlimitedAttempts: false,
        allowTextSubmission: true,
        allowRichTextSubmission: false,
        allowFileUpload: false,
        allowExternalLink: false,
        allowGitRepository: false,
        latePolicyType: CourseworkLatePolicyType.NO_LATE_SUBMISSION,
        reviewRequestsEnabled: true,
      },
    })
    createdIds.templateId = scopedTemplate.id

    const scopedVersion = await prisma.courseworkTemplateVersion.create({
      data: {
        templateId: scopedTemplate.id,
        versionNumber: 1,
        title: scopedTemplate.title,
        description: scopedTemplate.description,
        instructions: scopedTemplate.instructions,
        configuration: {
          allowedFileTypes: scopedTemplate.allowedFileTypes,
          maxAttempts: scopedTemplate.maxAttempts,
        },
        publishedById: leadTeacher.id,
      },
    })
    createdIds.versionId = scopedVersion.id

    const publishedPublication = await prisma.courseworkPublication.create({
      data: {
        templateId: scopedTemplate.id,
        templateVersionId: scopedVersion.id,
        teacherId: leadTeacher.id,
        departmentId: leadTeacher.teachingAssignments[0].departmentId,
        academicOfferingId: leadTeacher.teachingAssignments[0].academicOfferingId,
        subjectId: leadScope.subjectId,
        languageId: leadScope.languageId,
        groupId: leadScope.groupId,
        academicYearId: leadScope.programYearId,
        semesterId: leadScope.semesterId,
        audienceType: CourseworkAudienceType.INDIVIDUAL,
        status: CourseworkPublicationStatus.PUBLISHED,
        title: 'Phase 7 Auth Fixture Publication',
        instructions: 'Published auth fixture',
        versionNumber: 1,
        publishedAt: new Date(),
        dueAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        allowedFileTypes: ['txt'],
        maxFileSizeBytes: 1024 * 1024,
        maxAttempts: 1,
        allowTextSubmission: true,
        allowRichTextSubmission: false,
        allowFileUpload: false,
        allowExternalLink: false,
        allowGitRepository: false,
        latePolicyType: CourseworkLatePolicyType.NO_LATE_SUBMISSION,
        extensionEnabled: true,
        reviewRequestsEnabled: true,
      },
    })
    createdIds.publishedPublicationId = publishedPublication.id

    const draftPublication = await prisma.courseworkPublication.create({
      data: {
        templateId: scopedTemplate.id,
        templateVersionId: scopedVersion.id,
        teacherId: leadTeacher.id,
        departmentId: leadTeacher.teachingAssignments[0].departmentId,
        academicOfferingId: leadTeacher.teachingAssignments[0].academicOfferingId,
        subjectId: leadScope.subjectId,
        languageId: leadScope.languageId,
        groupId: leadScope.groupId,
        academicYearId: leadScope.programYearId,
        semesterId: leadScope.semesterId,
        audienceType: CourseworkAudienceType.INDIVIDUAL,
        status: CourseworkPublicationStatus.DRAFT,
        title: 'Phase 7 Auth Fixture Draft',
        instructions: 'Draft auth fixture',
        versionNumber: 1,
        allowedFileTypes: ['txt'],
        maxFileSizeBytes: 1024 * 1024,
        maxAttempts: 1,
        allowTextSubmission: true,
        allowRichTextSubmission: false,
        allowFileUpload: false,
        allowExternalLink: false,
        allowGitRepository: false,
        latePolicyType: CourseworkLatePolicyType.NO_LATE_SUBMISSION,
        extensionEnabled: true,
        reviewRequestsEnabled: true,
      },
    })
    createdIds.draftPublicationId = draftPublication.id

    await prisma.courseworkPublicationTarget.createMany({
      data: [
        {
          publicationId: publishedPublication.id,
          studentId: scopedStudent.id,
        },
        {
          publicationId: draftPublication.id,
          studentId: scopedStudent.id,
        },
      ],
    })

    const [studentAccess, foreignStudentAccess, draftStudentAccess] = await Promise.all([
      studentCanAccessCourseworkPublication(scopedStudent.userId, publishedPublication.id),
      studentCanAccessCourseworkPublication(foreignStudent.userId, publishedPublication.id),
      studentCanAccessCourseworkPublication(scopedStudent.userId, draftPublication.id),
    ])

    if (!leadManage || !leadPublish) {
      throw new Error('Lead teacher should have coursework manage and publish permissions')
    }
    if (!assistantManage) {
      throw new Error('Assistant teacher should have coursework manage permission')
    }
    if (assistantPublish) {
      throw new Error('Assistant teacher should not have coursework publish permission by default')
    }
    if (!studentAccess.allowed) {
      throw new Error(`Eligible student should have access to the published coursework fixture: ${studentAccess.reason ?? 'unknown reason'}`)
    }
    if (foreignStudentAccess.allowed) {
      throw new Error('Foreign student should not have access to an individually targeted coursework fixture')
    }
    if (draftStudentAccess.allowed) {
      throw new Error('Students should not have access to unpublished coursework fixtures')
    }

    console.log('[phase7:auth] PASS')
    console.log(
      JSON.stringify(
        {
          leadTeacher: leadTeacher.user.email,
          assistantTeacher: assistantTeacher.user.email,
          student: student.user.email,
          leadManage,
          leadPublish,
          assistantManage,
          assistantPublish,
          scopedStudent: scopedStudent.user.email,
          foreignStudent: foreignStudent.user.email,
          studentAccess,
          foreignStudentAccess,
          draftStudentAccess,
        },
        null,
        2
      )
    )
  } finally {
    if (createdIds.publishedPublicationId || createdIds.draftPublicationId) {
      await prisma.courseworkPublicationTarget.deleteMany({
        where: {
          publicationId: {
            in: [createdIds.publishedPublicationId, createdIds.draftPublicationId].filter(Boolean) as string[],
          },
        },
      })
    }
    if (createdIds.publishedPublicationId || createdIds.draftPublicationId) {
      await prisma.courseworkPublication.deleteMany({
        where: {
          id: {
            in: [createdIds.publishedPublicationId, createdIds.draftPublicationId].filter(Boolean) as string[],
          },
        },
      })
    }
    if (createdIds.versionId) {
      await prisma.courseworkTemplateVersion.deleteMany({
        where: { id: createdIds.versionId },
      })
    }
    if (createdIds.templateId) {
      await prisma.courseworkTemplate.deleteMany({
        where: { id: createdIds.templateId },
      })
    }
  }
}

main()
  .catch((error) => {
    console.error('[phase7:auth] FAIL', error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
