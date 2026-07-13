import {
  CourseworkAudienceType,
  CourseworkAttemptStatus,
  CourseworkExtensionRequestStatus,
  CourseworkGradeStatus,
  CourseworkLatePolicyType,
  CourseworkModerationDecisionStatus,
  CourseworkPenaltyType,
  CourseworkPublicationStatus,
  CourseworkTemplateType,
  CourseworkVisibility,
} from '@prisma/client'
import {
  calculateCourseworkGradeTotals,
  dispatchCourseworkDueSoonNotifications,
} from '../../src/lib/coursework-enterprise'
import { prisma } from '../../src/lib/prisma'
import { submitCourseworkAttemptForStudent } from '../../src/lib/coursework-enterprise-submission'

async function createScopedPublicationFixture(input: {
  templateId: string
  teacherId: string
  departmentId: string
  academicOfferingId: string | null
  subjectId: string
  languageId: string
  groupId: string
  academicYearId: string
  semesterId: string
  title: string
  latePolicyType: CourseworkLatePolicyType
  latePenaltyType?: CourseworkPenaltyType | null
  latePenaltyValue?: number | null
  lateGraceMinutes?: number | null
  dueAt: Date
  hardCloseAt?: Date | null
  maxAttempts?: number
  targetStudentIds: string[]
}) {
  const publication = await prisma.courseworkPublication.create({
    data: {
      templateId: input.templateId,
      teacherId: input.teacherId,
      departmentId: input.departmentId,
      subjectId: input.subjectId,
      languageId: input.languageId,
      groupId: input.groupId,
      academicYearId: input.academicYearId,
      semesterId: input.semesterId,
      academicOfferingId: input.academicOfferingId,
      audienceType: CourseworkAudienceType.INDIVIDUAL,
      status: CourseworkPublicationStatus.PUBLISHED,
      title: input.title,
      instructions: `Automated fixture for ${input.title}`,
      versionNumber: 1,
      publishedAt: new Date(),
      dueAt: input.dueAt,
      hardCloseAt: input.hardCloseAt ?? null,
      allowedFileTypes: ['txt'],
      maxFileSizeBytes: 1024 * 1024,
      maxAttempts: input.maxAttempts ?? 2,
      allowTextSubmission: true,
      allowRichTextSubmission: false,
      allowFileUpload: true,
      allowExternalLink: false,
      allowGitRepository: false,
      latePolicyType: input.latePolicyType,
      lateGraceMinutes: input.lateGraceMinutes ?? null,
      latePenaltyType: input.latePenaltyType ?? null,
      latePenaltyValue: input.latePenaltyValue ?? null,
      extensionEnabled: true,
      reviewRequestsEnabled: true,
    },
  })

  await prisma.courseworkPublicationTarget.createMany({
    data: input.targetStudentIds.map((studentId) => ({
      publicationId: publication.id,
      studentId,
    })),
  })

  return publication
}

async function cleanupScopedPublicationFixture(publicationId: string) {
  await prisma.courseworkAttemptRequest.deleteMany({ where: { publicationId } })
  await prisma.courseworkAttemptAttachment.deleteMany({ where: { attempt: { publicationId } } })
  await prisma.courseworkAttempt.deleteMany({ where: { publicationId } })
  await prisma.courseworkGradeCriterionScore.deleteMany({ where: { grade: { publicationId } } })
  await prisma.courseworkModerationDecision.deleteMany({ where: { grade: { publicationId } } })
  await prisma.courseworkGrade.deleteMany({ where: { publicationId } })
  await prisma.courseworkExtensionRequest.deleteMany({ where: { publicationId } })
  await prisma.courseworkPublicationTarget.deleteMany({ where: { publicationId } })
  await prisma.courseworkPublication.deleteMany({ where: { id: publicationId } })
}

async function main() {
  console.log('[phase7:test] Looking up seeded academic scope...')

  const leadAssignment = await prisma.teachingAssignment.findFirst({
    where: {
      status: 'ACTIVE',
      roles: {
        some: {
          role: 'LEAD_TEACHER',
        },
      },
    },
    include: {
      academicOffering: true,
      teacher: {
        include: {
          user: true,
        },
      },
    },
  })

  if (!leadAssignment) {
    throw new Error('No active lead teaching assignment found for Phase 7 tests')
  }

  const targetStudent = await prisma.studentProfile.findFirst({
    where: {
      departmentId: leadAssignment.departmentId,
      subjects: {
        some: leadAssignment.academicOfferingId
          ? {
              academicOfferingId: leadAssignment.academicOfferingId,
            }
          : {
              subjectId: leadAssignment.academicOffering.subjectId,
              languageId: leadAssignment.academicOffering.languageId,
              groupId: leadAssignment.academicOffering.groupId,
              academicYearId: leadAssignment.academicOffering.programYearId,
              semesterId: leadAssignment.academicOffering.semesterId,
            },
      },
    },
    include: {
      user: true,
    },
  })

  if (!targetStudent) {
    throw new Error('No student found in the selected coursework scope')
  }

  const secondScopedStudent = await prisma.studentProfile.findFirst({
    where: {
      id: {
        not: targetStudent.id,
      },
      departmentId: leadAssignment.departmentId,
    },
    include: {
      user: true,
    },
  })

  if (!secondScopedStudent) {
    throw new Error('No second scoped student found for late-policy extension and notification tests')
  }

  const moderatorAssignment = await prisma.teachingAssignment.findFirst({
    where: {
      academicOfferingId: leadAssignment.academicOfferingId,
      teacherId: {
        not: leadAssignment.teacherId,
      },
      teacher: {
        departmentId: leadAssignment.departmentId,
      },
    },
    include: {
      teacher: {
        include: {
          user: true,
        },
      },
      roles: true,
    },
  })

  if (!moderatorAssignment?.teacher?.user?.id) {
    throw new Error('No secondary teacher fixture found for moderation workflow tests')
  }

  const createdIds: Record<string, string> = {}

  try {
    const template = await prisma.courseworkTemplate.create({
      data: {
        teacherId: leadAssignment.teacherId,
        departmentId: leadAssignment.departmentId,
        subjectId: leadAssignment.academicOffering.subjectId,
        languageId: leadAssignment.academicOffering.languageId,
        groupId: leadAssignment.academicOffering.groupId,
        academicYearId: leadAssignment.academicOffering.programYearId,
        semesterId: leadAssignment.academicOffering.semesterId,
        academicOfferingId: leadAssignment.academicOfferingId,
        type: CourseworkTemplateType.PROGRAMMING_ASSIGNMENT,
        visibility: CourseworkVisibility.COURSE,
        title: 'Phase 7 Test Template',
        description: 'Enterprise coursework template smoke test',
        instructions: 'Submit a short project summary and one attachment.',
        allowedFileTypes: ['pdf', 'txt', 'zip'],
        maxFileSizeBytes: 5 * 1024 * 1024,
        maxAttempts: 2,
        allowUnlimitedAttempts: false,
        allowTextSubmission: true,
        allowRichTextSubmission: true,
        allowFileUpload: true,
        allowExternalLink: true,
        allowGitRepository: true,
        latePolicyType: CourseworkLatePolicyType.LATE_WITHOUT_PENALTY,
        reviewRequestsEnabled: true,
      },
    })
    createdIds.templateId = template.id

    const rubric = await prisma.courseworkRubric.create({
      data: {
        templateId: template.id,
        title: 'Phase 7 Test Rubric',
        totalMarks: 100,
        criteria: {
          create: [
            {
              title: 'Correctness',
              maximumMarks: 60,
              weight: 0.6,
              orderIndex: 0,
              levels: {
                create: [
                  { title: 'Excellent', score: 60, orderIndex: 0 },
                  { title: 'Good', score: 45, orderIndex: 1 },
                ],
              },
            },
            {
              title: 'Documentation',
              maximumMarks: 40,
              weight: 0.4,
              orderIndex: 1,
            },
          ],
        },
      },
      include: {
        criteria: {
          include: {
            levels: true,
          },
          orderBy: { orderIndex: 'asc' },
        },
      },
    })
    createdIds.rubricId = rubric.id

    const version = await prisma.courseworkTemplateVersion.create({
      data: {
        templateId: template.id,
        versionNumber: 1,
        title: template.title,
        description: template.description,
        instructions: template.instructions,
        configuration: {
          allowedFileTypes: template.allowedFileTypes,
          maxAttempts: template.maxAttempts,
        },
        rubricSnapshot: {
          title: rubric.title,
          totalMarks: rubric.totalMarks,
        },
        publishedById: leadAssignment.teacherId,
      },
    })
    createdIds.versionId = version.id

    const publication = await prisma.courseworkPublication.create({
      data: {
        templateId: template.id,
        templateVersionId: version.id,
        teacherId: leadAssignment.teacherId,
        departmentId: leadAssignment.departmentId,
        subjectId: leadAssignment.academicOffering.subjectId,
        languageId: leadAssignment.academicOffering.languageId,
        groupId: leadAssignment.academicOffering.groupId,
        academicYearId: leadAssignment.academicOffering.programYearId,
        semesterId: leadAssignment.academicOffering.semesterId,
        academicOfferingId: leadAssignment.academicOfferingId,
        audienceType: CourseworkAudienceType.INDIVIDUAL,
        status: CourseworkPublicationStatus.PUBLISHED,
        title: 'Phase 7 Test Publication',
        instructions: 'Smoke-test publication',
        versionNumber: 1,
        publishedAt: new Date(),
        dueAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        allowedFileTypes: ['pdf', 'txt'],
        maxFileSizeBytes: 5 * 1024 * 1024,
        maxAttempts: 2,
        allowTextSubmission: true,
        allowRichTextSubmission: true,
        allowFileUpload: true,
        allowExternalLink: true,
        allowGitRepository: true,
        latePolicyType: CourseworkLatePolicyType.LATE_WITHOUT_PENALTY,
        extensionEnabled: true,
        reviewRequestsEnabled: true,
        rubricId: rubric.id,
      },
    })
    createdIds.publicationId = publication.id

    const target = await prisma.courseworkPublicationTarget.create({
      data: {
        publicationId: publication.id,
        studentId: targetStudent.id,
      },
    })
    createdIds.targetId = target.id

    const extensionRequest = await prisma.courseworkExtensionRequest.create({
      data: {
        publicationId: publication.id,
        studentId: targetStudent.id,
        status: CourseworkExtensionRequestStatus.APPROVED,
        requestedUntil: new Date(Date.now() + 36 * 60 * 60 * 1000),
        approvedUntil: new Date(Date.now() + 48 * 60 * 60 * 1000),
        reason: 'Phase 7 smoke test extension',
        decidedAt: new Date(),
        decidedByTeacherId: leadAssignment.teacherId,
      },
    })
    createdIds.extensionRequestId = extensionRequest.id

    const teacherNotificationCountBefore = await prisma.notification.count({
      where: {
        userId: leadAssignment.teacher.user.id,
        title: 'Coursework submission received',
      },
    })

    const firstSubmission = await submitCourseworkAttemptForStudent({
      publicationId: publication.id,
      studentUserId: targetStudent.userId,
      plainTextSubmission: 'Phase 7 enterprise coursework smoke test',
      externalLink: 'https://example.com/demo',
      repositoryUrl: 'https://github.com/example/demo',
      idempotencyKey: 'phase7-submit-1',
      attachments: [
        {
          name: 'phase7-test.txt',
          mimeType: 'text/plain',
          size: 128,
          bytes: Buffer.from('phase7 test upload', 'utf8'),
        },
      ],
    })
    if (!firstSubmission.ok || !firstSubmission.attempt?.id) {
      throw new Error(`First coursework submission failed: ${'error' in firstSubmission ? firstSubmission.error : 'unknown error'}`)
    }
    createdIds.attemptId = firstSubmission.attempt.id

    const duplicateSubmission = await submitCourseworkAttemptForStudent({
      publicationId: publication.id,
      studentUserId: targetStudent.userId,
      plainTextSubmission: 'Phase 7 enterprise coursework smoke test',
      externalLink: 'https://example.com/demo',
      repositoryUrl: 'https://github.com/example/demo',
      idempotencyKey: 'phase7-submit-1',
      attachments: [
        {
          name: 'phase7-test.txt',
          mimeType: 'text/plain',
          size: 128,
          bytes: Buffer.from('phase7 test upload', 'utf8'),
        },
      ],
    })
    if (!duplicateSubmission.ok || duplicateSubmission.attempt?.id !== firstSubmission.attempt.id) {
      throw new Error('Duplicate coursework submission did not resolve idempotently to the same attempt')
    }

    const attemptsAfterDuplicate = await prisma.courseworkAttempt.findMany({
      where: {
        publicationId: publication.id,
        studentId: targetStudent.id,
      },
      orderBy: { attemptNumber: 'asc' },
    })
    if (attemptsAfterDuplicate.length !== 1) {
      throw new Error(`Expected exactly one attempt after duplicate submit, found ${attemptsAfterDuplicate.length}`)
    }

    const teacherNotificationCountAfterDuplicate = await prisma.notification.count({
      where: {
        userId: leadAssignment.teacher.user.id,
        title: 'Coursework submission received',
      },
    })
    if (teacherNotificationCountAfterDuplicate !== teacherNotificationCountBefore + 1) {
      throw new Error('Duplicate submit created unexpected submission notifications')
    }

    await prisma.courseworkAttempt.update({
      where: { id: firstSubmission.attempt.id },
      data: {
        status: CourseworkAttemptStatus.RETURNED,
        returnedAt: new Date(),
      },
    })

    const resubmission = await submitCourseworkAttemptForStudent({
      publicationId: publication.id,
      studentUserId: targetStudent.userId,
      plainTextSubmission: 'Phase 7 enterprise coursework smoke test revision',
      externalLink: 'https://example.com/demo-revision',
      repositoryUrl: 'https://github.com/example/demo-revision',
      idempotencyKey: 'phase7-submit-2',
      attachments: [
        {
          name: 'phase7-test-revision.txt',
          mimeType: 'text/plain',
          size: 140,
          bytes: Buffer.from('phase7 revised upload', 'utf8'),
        },
      ],
    })
    if (!resubmission.ok || !resubmission.attempt?.id) {
      throw new Error(`Returned coursework resubmission failed: ${'error' in resubmission ? resubmission.error : 'unknown error'}`)
    }

    const attemptHistory = await prisma.courseworkAttempt.findMany({
      where: {
        publicationId: publication.id,
        studentId: targetStudent.id,
      },
      include: {
        attachments: true,
      },
      orderBy: { attemptNumber: 'asc' },
    })
    if (attemptHistory.length !== 2) {
      throw new Error(`Expected two attempts after resubmission, found ${attemptHistory.length}`)
    }
    if (attemptHistory[0].status !== CourseworkAttemptStatus.RETURNED) {
      throw new Error('Original attempt should remain returned and immutable after resubmission')
    }
    if (attemptHistory[1].attemptNumber !== 2) {
      throw new Error('Resubmission did not create a distinct second attempt')
    }

    const latePolicyResults: Record<string, unknown> = {}
    const lateBaseDueAt = new Date('2026-07-13T12:00:00.000Z')

    const noLatePublication = await createScopedPublicationFixture({
      templateId: template.id,
      teacherId: leadAssignment.teacherId,
      departmentId: leadAssignment.departmentId,
      academicOfferingId: leadAssignment.academicOfferingId,
      subjectId: leadAssignment.academicOffering.subjectId,
      languageId: leadAssignment.academicOffering.languageId,
      groupId: leadAssignment.academicOffering.groupId,
      academicYearId: leadAssignment.academicOffering.programYearId,
      semesterId: leadAssignment.academicOffering.semesterId,
      title: 'Phase 7 No Late Submission',
      latePolicyType: CourseworkLatePolicyType.NO_LATE_SUBMISSION,
      dueAt: lateBaseDueAt,
      targetStudentIds: [targetStudent.id],
    })
    try {
      const noLateResult = await submitCourseworkAttemptForStudent({
        publicationId: noLatePublication.id,
        studentUserId: targetStudent.userId,
        plainTextSubmission: 'late submission should fail',
        attachments: [
          {
            name: 'late-no.txt',
            mimeType: 'text/plain',
            size: 32,
            bytes: Buffer.from('late-no', 'utf8'),
          },
        ],
        submittedAtOverride: new Date('2026-07-13T12:00:01.000Z'),
      })
      if (noLateResult.ok) {
        throw new Error('NO_LATE_SUBMISSION unexpectedly allowed a late attempt')
      }
      latePolicyResults.NO_LATE_SUBMISSION = noLateResult.error
    } finally {
      await cleanupScopedPublicationFixture(noLatePublication.id)
    }

    const gracePublication = await createScopedPublicationFixture({
      templateId: template.id,
      teacherId: leadAssignment.teacherId,
      departmentId: leadAssignment.departmentId,
      academicOfferingId: leadAssignment.academicOfferingId,
      subjectId: leadAssignment.academicOffering.subjectId,
      languageId: leadAssignment.academicOffering.languageId,
      groupId: leadAssignment.academicOffering.groupId,
      academicYearId: leadAssignment.academicOffering.programYearId,
      semesterId: leadAssignment.academicOffering.semesterId,
      title: 'Phase 7 Grace Period',
      latePolicyType: CourseworkLatePolicyType.GRACE_PERIOD,
      lateGraceMinutes: 15,
      dueAt: lateBaseDueAt,
      targetStudentIds: [targetStudent.id],
    })
    try {
      const gracePass = await submitCourseworkAttemptForStudent({
        publicationId: gracePublication.id,
        studentUserId: targetStudent.userId,
        plainTextSubmission: 'grace submission',
        attachments: [
          {
            name: 'grace-pass.txt',
            mimeType: 'text/plain',
            size: 32,
            bytes: Buffer.from('grace-pass', 'utf8'),
          },
        ],
        submittedAtOverride: new Date('2026-07-13T12:15:00.000Z'),
      })
      if (!gracePass.ok || !gracePass.late || gracePass.latePenaltyApplied !== 0) {
        throw new Error('GRACE_PERIOD boundary at the allowed edge failed')
      }
      const graceFail = await submitCourseworkAttemptForStudent({
        publicationId: gracePublication.id,
        studentUserId: targetStudent.userId,
        plainTextSubmission: 'grace submission fail',
        attachments: [
          {
            name: 'grace-fail.txt',
            mimeType: 'text/plain',
            size: 32,
            bytes: Buffer.from('grace-fail', 'utf8'),
          },
        ],
        submittedAtOverride: new Date('2026-07-13T12:15:00.001Z'),
      })
      if (graceFail.ok) {
        throw new Error('GRACE_PERIOD accepted a submission beyond the grace boundary')
      }
      latePolicyResults.GRACE_PERIOD = {
        allowedBoundary: gracePass.attempt?.id ?? null,
        rejectedBoundary: graceFail.error,
      }
    } finally {
      await cleanupScopedPublicationFixture(gracePublication.id)
    }

    const lateWithoutPenaltyPublication = await createScopedPublicationFixture({
      templateId: template.id,
      teacherId: leadAssignment.teacherId,
      departmentId: leadAssignment.departmentId,
      academicOfferingId: leadAssignment.academicOfferingId,
      subjectId: leadAssignment.academicOffering.subjectId,
      languageId: leadAssignment.academicOffering.languageId,
      groupId: leadAssignment.academicOffering.groupId,
      academicYearId: leadAssignment.academicOffering.programYearId,
      semesterId: leadAssignment.academicOffering.semesterId,
      title: 'Phase 7 Late Without Penalty',
      latePolicyType: CourseworkLatePolicyType.LATE_WITHOUT_PENALTY,
      dueAt: lateBaseDueAt,
      targetStudentIds: [targetStudent.id],
    })
    try {
      const lateWithoutPenalty = await submitCourseworkAttemptForStudent({
        publicationId: lateWithoutPenaltyPublication.id,
        studentUserId: targetStudent.userId,
        plainTextSubmission: 'late without penalty',
        attachments: [
          {
            name: 'late-without-penalty.txt',
            mimeType: 'text/plain',
            size: 32,
            bytes: Buffer.from('late-without-penalty', 'utf8'),
          },
        ],
        submittedAtOverride: new Date('2026-07-13T14:00:00.000Z'),
      })
      if (!lateWithoutPenalty.ok || !lateWithoutPenalty.late || lateWithoutPenalty.latePenaltyApplied !== 0) {
        throw new Error('LATE_WITHOUT_PENALTY did not preserve a zero-penalty late submission')
      }
      latePolicyResults.LATE_WITHOUT_PENALTY = lateWithoutPenalty.attempt?.id ?? null
    } finally {
      await cleanupScopedPublicationFixture(lateWithoutPenaltyPublication.id)
    }

    const percentagePenaltyPublication = await createScopedPublicationFixture({
      templateId: template.id,
      teacherId: leadAssignment.teacherId,
      departmentId: leadAssignment.departmentId,
      academicOfferingId: leadAssignment.academicOfferingId,
      subjectId: leadAssignment.academicOffering.subjectId,
      languageId: leadAssignment.academicOffering.languageId,
      groupId: leadAssignment.academicOffering.groupId,
      academicYearId: leadAssignment.academicOffering.programYearId,
      semesterId: leadAssignment.academicOffering.semesterId,
      title: 'Phase 7 Percentage Penalty',
      latePolicyType: CourseworkLatePolicyType.LATE_WITH_PENALTY,
      latePenaltyType: CourseworkPenaltyType.PERCENTAGE_DEDUCTION,
      latePenaltyValue: 15,
      dueAt: lateBaseDueAt,
      targetStudentIds: [targetStudent.id],
    })
    try {
      const percentagePenalty = await submitCourseworkAttemptForStudent({
        publicationId: percentagePenaltyPublication.id,
        studentUserId: targetStudent.userId,
        plainTextSubmission: 'percentage penalty',
        attachments: [
          {
            name: 'percentage-penalty.txt',
            mimeType: 'text/plain',
            size: 32,
            bytes: Buffer.from('percentage-penalty', 'utf8'),
          },
        ],
        submittedAtOverride: new Date('2026-07-13T13:00:00.000Z'),
      })
      if (!percentagePenalty.ok || percentagePenalty.latePenaltyApplied !== 15) {
        throw new Error(`Expected percentage late penalty of 15, received ${percentagePenalty.latePenaltyApplied}`)
      }
      latePolicyResults.PERCENTAGE_PENALTY = percentagePenalty.latePenaltyApplied
    } finally {
      await cleanupScopedPublicationFixture(percentagePenaltyPublication.id)
    }

    const fixedPenaltyPublication = await createScopedPublicationFixture({
      templateId: template.id,
      teacherId: leadAssignment.teacherId,
      departmentId: leadAssignment.departmentId,
      academicOfferingId: leadAssignment.academicOfferingId,
      subjectId: leadAssignment.academicOffering.subjectId,
      languageId: leadAssignment.academicOffering.languageId,
      groupId: leadAssignment.academicOffering.groupId,
      academicYearId: leadAssignment.academicOffering.programYearId,
      semesterId: leadAssignment.academicOffering.semesterId,
      title: 'Phase 7 Fixed Marks Penalty',
      latePolicyType: CourseworkLatePolicyType.LATE_WITH_PENALTY,
      latePenaltyType: CourseworkPenaltyType.FIXED_MARKS_DEDUCTION,
      latePenaltyValue: 12,
      dueAt: lateBaseDueAt,
      targetStudentIds: [targetStudent.id],
    })
    try {
      const fixedPenalty = await submitCourseworkAttemptForStudent({
        publicationId: fixedPenaltyPublication.id,
        studentUserId: targetStudent.userId,
        plainTextSubmission: 'fixed penalty',
        attachments: [
          {
            name: 'fixed-penalty.txt',
            mimeType: 'text/plain',
            size: 32,
            bytes: Buffer.from('fixed-penalty', 'utf8'),
          },
        ],
        submittedAtOverride: new Date('2026-07-13T13:00:00.000Z'),
      })
      if (!fixedPenalty.ok || fixedPenalty.latePenaltyApplied !== 12) {
        throw new Error(`Expected fixed late penalty of 12, received ${fixedPenalty.latePenaltyApplied}`)
      }
      latePolicyResults.FIXED_MARK_PENALTY = fixedPenalty.latePenaltyApplied
    } finally {
      await cleanupScopedPublicationFixture(fixedPenaltyPublication.id)
    }

    const dailyPenaltyPublication = await createScopedPublicationFixture({
      templateId: template.id,
      teacherId: leadAssignment.teacherId,
      departmentId: leadAssignment.departmentId,
      academicOfferingId: leadAssignment.academicOfferingId,
      subjectId: leadAssignment.academicOffering.subjectId,
      languageId: leadAssignment.academicOffering.languageId,
      groupId: leadAssignment.academicOffering.groupId,
      academicYearId: leadAssignment.academicOffering.programYearId,
      semesterId: leadAssignment.academicOffering.semesterId,
      title: 'Phase 7 Daily Penalty',
      latePolicyType: CourseworkLatePolicyType.LATE_WITH_PENALTY,
      latePenaltyType: CourseworkPenaltyType.DAILY_DEDUCTION,
      latePenaltyValue: 5,
      dueAt: lateBaseDueAt,
      targetStudentIds: [targetStudent.id],
    })
    try {
      const dailyPenalty = await submitCourseworkAttemptForStudent({
        publicationId: dailyPenaltyPublication.id,
        studentUserId: targetStudent.userId,
        plainTextSubmission: 'daily penalty',
        attachments: [
          {
            name: 'daily-penalty.txt',
            mimeType: 'text/plain',
            size: 32,
            bytes: Buffer.from('daily-penalty', 'utf8'),
          },
        ],
        submittedAtOverride: new Date('2026-07-14T13:00:00.000Z'),
      })
      if (!dailyPenalty.ok || dailyPenalty.latePenaltyApplied !== 10) {
        throw new Error(`Expected deterministic daily late penalty of 10, received ${dailyPenalty.latePenaltyApplied}`)
      }
      latePolicyResults.DAILY_PENALTY = dailyPenalty.latePenaltyApplied
    } finally {
      await cleanupScopedPublicationFixture(dailyPenaltyPublication.id)
    }

    const hardClosePublication = await createScopedPublicationFixture({
      templateId: template.id,
      teacherId: leadAssignment.teacherId,
      departmentId: leadAssignment.departmentId,
      academicOfferingId: leadAssignment.academicOfferingId,
      subjectId: leadAssignment.academicOffering.subjectId,
      languageId: leadAssignment.academicOffering.languageId,
      groupId: leadAssignment.academicOffering.groupId,
      academicYearId: leadAssignment.academicOffering.programYearId,
      semesterId: leadAssignment.academicOffering.semesterId,
      title: 'Phase 7 Hard Close',
      latePolicyType: CourseworkLatePolicyType.HARD_CLOSE,
      dueAt: lateBaseDueAt,
      hardCloseAt: new Date('2026-07-13T12:30:00.000Z'),
      targetStudentIds: [targetStudent.id],
    })
    try {
      const hardCloseResult = await submitCourseworkAttemptForStudent({
        publicationId: hardClosePublication.id,
        studentUserId: targetStudent.userId,
        plainTextSubmission: 'hard close',
        attachments: [
          {
            name: 'hard-close.txt',
            mimeType: 'text/plain',
            size: 32,
            bytes: Buffer.from('hard-close', 'utf8'),
          },
        ],
        submittedAtOverride: new Date('2026-07-13T12:30:01.000Z'),
      })
      if (hardCloseResult.ok) {
        throw new Error('HARD_CLOSE unexpectedly allowed a submission after the close time')
      }
      latePolicyResults.HARD_CLOSE = hardCloseResult.error
    } finally {
      await cleanupScopedPublicationFixture(hardClosePublication.id)
    }

    const extensionDeadlinePublication = await createScopedPublicationFixture({
      templateId: template.id,
      teacherId: leadAssignment.teacherId,
      departmentId: leadAssignment.departmentId,
      academicOfferingId: leadAssignment.academicOfferingId,
      subjectId: leadAssignment.academicOffering.subjectId,
      languageId: leadAssignment.academicOffering.languageId,
      groupId: leadAssignment.academicOffering.groupId,
      academicYearId: leadAssignment.academicOffering.programYearId,
      semesterId: leadAssignment.academicOffering.semesterId,
      title: 'Phase 7 Extension Deadline Isolation',
      latePolicyType: CourseworkLatePolicyType.NO_LATE_SUBMISSION,
      dueAt: lateBaseDueAt,
      targetStudentIds: [targetStudent.id, secondScopedStudent.id],
    })
    try {
      await prisma.courseworkExtensionRequest.create({
        data: {
          publicationId: extensionDeadlinePublication.id,
          studentId: targetStudent.id,
          status: CourseworkExtensionRequestStatus.APPROVED,
          requestedUntil: new Date('2026-07-13T16:00:00.000Z'),
          approvedUntil: new Date('2026-07-13T16:00:00.000Z'),
          reason: 'Extension isolation test',
          decidedAt: new Date(),
          decidedByTeacherId: leadAssignment.teacherId,
        },
      })

      const extensionAllowed = await submitCourseworkAttemptForStudent({
        publicationId: extensionDeadlinePublication.id,
        studentUserId: targetStudent.userId,
        plainTextSubmission: 'extension allowed',
        attachments: [
          {
            name: 'extension-allowed.txt',
            mimeType: 'text/plain',
            size: 32,
            bytes: Buffer.from('extension-allowed', 'utf8'),
          },
        ],
        submittedAtOverride: new Date('2026-07-13T13:00:00.000Z'),
      })
      const extensionDenied = await submitCourseworkAttemptForStudent({
        publicationId: extensionDeadlinePublication.id,
        studentUserId: secondScopedStudent.userId,
        plainTextSubmission: 'extension denied',
        attachments: [
          {
            name: 'extension-denied.txt',
            mimeType: 'text/plain',
            size: 32,
            bytes: Buffer.from('extension-denied', 'utf8'),
          },
        ],
        submittedAtOverride: new Date('2026-07-13T13:00:00.000Z'),
      })
      if (!extensionAllowed.ok || extensionDenied.ok) {
        throw new Error('Approved extension did not stay isolated to the intended student deadline')
      }
      latePolicyResults.EXTENSION_ISOLATION = {
        allowedStudent: extensionAllowed.attempt?.id ?? null,
        deniedStudent: extensionDenied.error,
      }
    } finally {
      await cleanupScopedPublicationFixture(extensionDeadlinePublication.id)
    }

    const lateAuditPublication = await createScopedPublicationFixture({
      templateId: template.id,
      teacherId: leadAssignment.teacherId,
      departmentId: leadAssignment.departmentId,
      academicOfferingId: leadAssignment.academicOfferingId,
      subjectId: leadAssignment.academicOffering.subjectId,
      languageId: leadAssignment.academicOffering.languageId,
      groupId: leadAssignment.academicOffering.groupId,
      academicYearId: leadAssignment.academicOffering.programYearId,
      semesterId: leadAssignment.academicOffering.semesterId,
      title: 'Phase 7 Late Audit',
      latePolicyType: CourseworkLatePolicyType.LATE_WITH_PENALTY,
      latePenaltyType: CourseworkPenaltyType.FIXED_MARKS_DEDUCTION,
      latePenaltyValue: 9,
      dueAt: lateBaseDueAt,
      targetStudentIds: [targetStudent.id],
    })
    try {
      const lateAuditResult = await submitCourseworkAttemptForStudent({
        publicationId: lateAuditPublication.id,
        studentUserId: targetStudent.userId,
        plainTextSubmission: 'late audit',
        attachments: [
          {
            name: 'late-audit.txt',
            mimeType: 'text/plain',
            size: 32,
            bytes: Buffer.from('late-audit', 'utf8'),
          },
        ],
        submittedAtOverride: new Date('2026-07-13T13:30:00.000Z'),
      })
      if (!lateAuditResult.ok || !lateAuditResult.attempt?.id) {
        throw new Error('Late-audit submission fixture failed')
      }
      const persistedLateAttempt = await prisma.courseworkAttempt.findUnique({
        where: { id: lateAuditResult.attempt.id },
      })
      const persistedLateLog = await prisma.activityLog.findFirst({
        where: {
          action: 'coursework.attempt.submit',
          details: {
            contains: lateAuditResult.attempt.id,
          },
        },
        orderBy: { createdAt: 'desc' },
      })
      if (!persistedLateAttempt?.isLate || persistedLateAttempt.latePenaltyApplied !== 9 || !persistedLateLog?.details?.includes('"late":true')) {
        throw new Error('Late status and penalty were not persisted and audited as expected')
      }
      latePolicyResults.LATE_AUDIT = {
        attemptId: persistedLateAttempt.id,
        penalty: persistedLateAttempt.latePenaltyApplied,
      }
    } finally {
      await cleanupScopedPublicationFixture(lateAuditPublication.id)
    }

    const zeroFloorTotals = calculateCourseworkGradeTotals({
      criterionScores: [{ awardedScore: 5 }],
      manualAdjustment: 0,
      maxScore: 100,
      latePenaltyApplied: 20,
    })
    if (zeroFloorTotals.totalScore !== 0) {
      throw new Error('Late penalties reduced grade totals below zero')
    }
    latePolicyResults.PENALTY_FLOOR = zeroFloorTotals.totalScore

    const dueSoonPublication = await createScopedPublicationFixture({
      templateId: template.id,
      teacherId: leadAssignment.teacherId,
      departmentId: leadAssignment.departmentId,
      academicOfferingId: leadAssignment.academicOfferingId,
      subjectId: leadAssignment.academicOffering.subjectId,
      languageId: leadAssignment.academicOffering.languageId,
      groupId: leadAssignment.academicOffering.groupId,
      academicYearId: leadAssignment.academicOffering.programYearId,
      semesterId: leadAssignment.academicOffering.semesterId,
      title: 'Phase 7 Due Soon Notification',
      latePolicyType: CourseworkLatePolicyType.NO_LATE_SUBMISSION,
      dueAt: new Date('2026-07-14T00:00:00.000Z'),
      targetStudentIds: [targetStudent.id],
    })
    try {
      const dueSoonBefore = await prisma.notification.count({
        where: {
          userId: targetStudent.user.id,
          title: 'Coursework due soon',
          message: `Coursework due soon: ${dueSoonPublication.title}`,
        },
      })
      const firstDispatch = await dispatchCourseworkDueSoonNotifications({
        now: new Date('2026-07-13T12:00:00.000Z'),
        windowMs: 24 * 60 * 60 * 1000,
        dedupeWindowMs: 24 * 60 * 60 * 1000,
        publicationIds: [dueSoonPublication.id],
      })
      const secondDispatch = await dispatchCourseworkDueSoonNotifications({
        now: new Date('2026-07-13T12:05:00.000Z'),
        windowMs: 24 * 60 * 60 * 1000,
        dedupeWindowMs: 24 * 60 * 60 * 1000,
        publicationIds: [dueSoonPublication.id],
      })
      const dueSoonAfter = await prisma.notification.count({
        where: {
          userId: targetStudent.user.id,
          title: 'Coursework due soon',
          message: `Coursework due soon: ${dueSoonPublication.title}`,
        },
      })
      const foreignDueSoonCount = await prisma.notification.count({
        where: {
          userId: secondScopedStudent.user.id,
          title: 'Coursework due soon',
          message: `Coursework due soon: ${dueSoonPublication.title}`,
        },
      })
      if (dueSoonAfter !== dueSoonBefore + 1 || foreignDueSoonCount !== 0) {
        throw new Error('Due-soon notification dispatch was not deduplicated or leaked to the wrong student')
      }
      latePolicyResults.DUE_SOON = {
        firstDispatch: firstDispatch.createdCount,
        secondDispatch: secondDispatch.createdCount,
        storedNotifications: dueSoonAfter - dueSoonBefore,
      }
    } finally {
      await cleanupScopedPublicationFixture(dueSoonPublication.id)
    }

    const grade = await prisma.courseworkGrade.create({
      data: {
        publicationId: publication.id,
        attemptId: resubmission.attempt.id,
        studentId: targetStudent.id,
        rubricId: rubric.id,
        primaryGraderId: leadAssignment.teacherId,
        status: CourseworkGradeStatus.PUBLISHED,
        reviewRequestStatus: 'NOT_REQUESTED',
        maxScore: 100,
        rubricScore: 90,
        manualAdjustment: 0,
        totalScore: 90,
        percentage: 90,
        textFeedback: 'Solid work',
        publishedAt: new Date(),
      },
    })
    createdIds.gradeId = grade.id

    const firstCriterion = rubric.criteria[0]
    await prisma.courseworkGradeCriterionScore.create({
      data: {
        gradeId: grade.id,
        criterionId: firstCriterion.id,
        selectedLevelId: firstCriterion.levels[0]?.id ?? null,
        score: 55,
        feedback: 'Good implementation',
      },
    })

    const moderation = await prisma.courseworkModerationDecision.create({
      data: {
        gradeId: grade.id,
        moderatorId: leadAssignment.teacherId,
        status: CourseworkModerationDecisionStatus.APPROVED,
        notes: 'Moderation passed for smoke test',
        decidedAt: new Date(),
      },
    })
    createdIds.moderationId = moderation.id

    const counts = await prisma.courseworkPublication.findUnique({
      where: { id: publication.id },
      select: {
        _count: {
          select: {
            attempts: true,
            extensionRequests: true,
            grades: true,
            targets: true,
          },
        },
      },
    })

    console.log('[phase7:test] PASS')
    console.log(
      JSON.stringify(
        {
          teacher: leadAssignment.teacher.user.email,
          student: targetStudent.user.email,
          publicationId: publication.id,
          counts: counts?._count ?? null,
          latePolicyResults,
        },
        null,
        2
      )
    )
  } finally {
    if (createdIds.moderationId) {
      await prisma.courseworkModerationDecision.deleteMany({ where: { id: createdIds.moderationId } })
    }
    if (createdIds.gradeId) {
      await prisma.courseworkGradeCriterionScore.deleteMany({ where: { gradeId: createdIds.gradeId } })
      await prisma.courseworkGrade.deleteMany({ where: { id: createdIds.gradeId } })
    }
    if (createdIds.publicationId) {
      await prisma.courseworkAttemptRequest.deleteMany({ where: { publicationId: createdIds.publicationId } })
      await prisma.courseworkAttemptAttachment.deleteMany({
        where: {
          attempt: {
            publicationId: createdIds.publicationId,
          },
        },
      })
      await prisma.courseworkAttempt.deleteMany({ where: { publicationId: createdIds.publicationId } })
    }
    if (createdIds.extensionRequestId) {
      await prisma.courseworkExtensionRequest.deleteMany({ where: { id: createdIds.extensionRequestId } })
    }
    if (createdIds.targetId) {
      await prisma.courseworkPublicationTarget.deleteMany({ where: { id: createdIds.targetId } })
    }
    if (createdIds.publicationId) {
      await prisma.courseworkPublication.deleteMany({ where: { id: createdIds.publicationId } })
    }
    if (createdIds.rubricId) {
      await prisma.courseworkRubricLevel.deleteMany({ where: { criterion: { rubricId: createdIds.rubricId } } })
      await prisma.courseworkRubricCriterion.deleteMany({ where: { rubricId: createdIds.rubricId } })
      await prisma.courseworkRubric.deleteMany({ where: { id: createdIds.rubricId } })
    }
    if (createdIds.versionId) {
      await prisma.courseworkTemplateVersion.deleteMany({ where: { id: createdIds.versionId } })
    }
    if (createdIds.templateId) {
      await prisma.courseworkTemplate.deleteMany({ where: { id: createdIds.templateId } })
    }
  }
}

main()
  .catch((error) => {
    console.error('[phase7:test] FAIL', error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
