import { buildCourseworkAttachmentDownloadUrl } from '@/lib/coursework-enterprise'
import { prisma } from '@/lib/prisma'
import {
  buildAccessibleTeachingScopeFilters,
  getTeacherOfferingAssignments,
  getTeacherProfileByUserId,
} from '@/lib/teacher-assignment'
import type { Prisma } from '@prisma/client'

function serializeDate(value: Date | null | undefined) {
  return value ? value.toISOString() : null
}

export async function getTeacherEnterpriseCourseworkWorkspace(userId: string) {
  const teacherProfile = await getTeacherProfileByUserId(userId)
  if (!teacherProfile) {
    return null
  }

  const department = await prisma.department.findUnique({
    where: { id: teacherProfile.departmentId },
    select: { name: true },
  })

  const effectiveAssignments = await getTeacherOfferingAssignments({
    teacherProfileId: teacherProfile.id,
  })
  const scopeFilters = buildAccessibleTeachingScopeFilters(effectiveAssignments)

  const accessibleWhere: Prisma.CourseworkPublicationWhereInput =
    scopeFilters.length > 0
      ? {
          OR: [
            { teacherId: teacherProfile.id },
            ...scopeFilters,
          ],
        }
      : { teacherId: teacherProfile.id }

  const [legacyAssignments, templates, publications, extensionRequests, attempts, grades] = await Promise.all([
    prisma.teacherAssignment.findMany({
      where: { teacherId: teacherProfile.id },
      include: {
        subject: true,
        language: true,
        group: true,
        academicYear: true,
        semester: true,
        academicOffering: true,
      },
      orderBy: [{ academicYear: { year: 'asc' } }, { semester: { number: 'asc' } }, { subject: { name: 'asc' } }],
    }),
    prisma.courseworkTemplate.findMany({
      where: {
        OR: [
          { teacherId: teacherProfile.id },
          ...(scopeFilters.length > 0 ? scopeFilters : []),
        ],
      },
      include: {
        subject: true,
        language: true,
        group: true,
        academicYear: true,
        semester: true,
        academicOffering: true,
        rubric: {
          include: {
            criteria: {
              include: {
                levels: {
                  orderBy: { orderIndex: 'asc' },
                },
              },
              orderBy: { orderIndex: 'asc' },
            },
          },
        },
        versions: {
          orderBy: { versionNumber: 'desc' },
        },
      },
      orderBy: { updatedAt: 'desc' },
    }),
    prisma.courseworkPublication.findMany({
      where: accessibleWhere,
      include: {
        template: true,
        templateVersion: true,
        subject: true,
        language: true,
        group: true,
        academicYear: true,
        semester: true,
        academicOffering: true,
        targets: {
          include: {
            student: {
              include: {
                user: {
                  select: {
                    name: true,
                    email: true,
                  },
                },
              },
            },
          },
        },
        rubric: {
          include: {
            criteria: {
              include: {
                levels: {
                  orderBy: { orderIndex: 'asc' },
                },
              },
              orderBy: { orderIndex: 'asc' },
            },
          },
        },
        _count: {
          select: {
            attempts: true,
            extensionRequests: true,
            grades: true,
            targets: true,
          },
        },
      },
      orderBy: [{ updatedAt: 'desc' }],
    }),
    prisma.courseworkExtensionRequest.findMany({
      where: {
        publication: accessibleWhere,
      },
      include: {
        publication: {
          include: {
            subject: true,
            language: true,
            group: true,
            academicYear: true,
            semester: true,
          },
        },
        student: {
          include: {
            user: {
              select: {
                name: true,
                email: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.courseworkAttempt.findMany({
      where: {
        publication: accessibleWhere,
      },
      include: {
        publication: {
          include: {
            subject: true,
            language: true,
            group: true,
            academicYear: true,
            semester: true,
          },
        },
        student: {
          include: {
            user: {
              select: {
                name: true,
                email: true,
              },
            },
          },
        },
        attachments: true,
        grades: {
          include: {
            criterionScores: true,
            feedbackAttachments: true,
            moderationDecisions: true,
          },
          orderBy: { updatedAt: 'desc' },
        },
      },
      orderBy: { submittedAt: 'desc' },
    }),
    prisma.courseworkGrade.findMany({
      where: {
        publication: accessibleWhere,
      },
      include: {
        publication: {
          include: {
            subject: true,
            language: true,
            group: true,
            academicYear: true,
            semester: true,
          },
        },
        attempt: {
          include: {
            student: {
              include: {
                user: {
                  select: {
                    name: true,
                    email: true,
                  },
                },
              },
            },
          },
        },
        criterionScores: true,
        moderationDecisions: true,
      },
      orderBy: { updatedAt: 'desc' },
    }),
  ])

  return {
    teacherProfile: {
      id: teacherProfile.id,
      departmentName: department?.name ?? 'Unknown Department',
    },
    scopes: legacyAssignments.map((assignment) => ({
      academicOfferingId: assignment.academicOfferingId,
      subjectId: assignment.subjectId,
      subjectName: assignment.subject.name,
      languageId: assignment.languageId,
      languageName: assignment.language.name,
      groupId: assignment.groupId,
      groupName: assignment.group.name,
      academicYearId: assignment.academicYearId,
      academicYearName: assignment.academicYear.name,
      semesterId: assignment.semesterId,
      semesterName: assignment.semester.name,
    })),
    templates: templates.map((template) => ({
      id: template.id,
      type: template.type,
      visibility: template.visibility,
      title: template.title,
      description: template.description,
      instructions: template.instructions,
      allowedFileTypes: template.allowedFileTypes,
      maxFileSizeBytes: template.maxFileSizeBytes,
      maxAttempts: template.maxAttempts,
      allowUnlimitedAttempts: template.allowUnlimitedAttempts,
      allowTextSubmission: template.allowTextSubmission,
      allowRichTextSubmission: template.allowRichTextSubmission,
      allowFileUpload: template.allowFileUpload,
      allowExternalLink: template.allowExternalLink,
      allowGitRepository: template.allowGitRepository,
      latePolicyType: template.latePolicyType,
      lateGraceMinutes: template.lateGraceMinutes,
      latePenaltyType: template.latePenaltyType,
      latePenaltyValue: template.latePenaltyValue,
      reviewRequestsEnabled: template.reviewRequestsEnabled,
      subjectId: template.subjectId,
      subjectName: template.subject.name,
      languageId: template.languageId,
      languageName: template.language.name,
      groupId: template.groupId,
      groupName: template.group?.name ?? null,
      academicYearId: template.academicYearId,
      academicYearName: template.academicYear?.name ?? null,
      semesterId: template.semesterId,
      semesterName: template.semester?.name ?? null,
      academicOfferingId: template.academicOfferingId,
      rubric: template.rubric
        ? {
            id: template.rubric.id,
            title: template.rubric.title,
            totalMarks: template.rubric.totalMarks,
            criteria: template.rubric.criteria.map((criterion) => ({
              id: criterion.id,
              title: criterion.title,
              description: criterion.description,
              maximumMarks: criterion.maximumMarks,
              weight: criterion.weight,
              levels: criterion.levels.map((level) => ({
                id: level.id,
                title: level.title,
                description: level.description,
                score: level.score,
              })),
            })),
          }
        : null,
      versions: template.versions.map((version) => ({
        id: version.id,
        versionNumber: version.versionNumber,
        createdAt: serializeDate(version.createdAt),
        publishedAt: serializeDate(version.publishedAt),
      })),
    })),
    publications: publications.map((publication) => ({
      id: publication.id,
      templateId: publication.templateId,
      title: publication.title,
      description: publication.description,
      instructions: publication.instructions,
      status: publication.status,
      versionNumber: publication.versionNumber,
      dueAt: serializeDate(publication.dueAt),
      hardCloseAt: serializeDate(publication.hardCloseAt),
      scheduledFor: serializeDate(publication.scheduledFor),
      publishedAt: serializeDate(publication.publishedAt),
      closedAt: serializeDate(publication.closedAt),
      archivedAt: serializeDate(publication.archivedAt),
      allowedFileTypes: publication.allowedFileTypes,
      maxFileSizeBytes: publication.maxFileSizeBytes,
      maxAttempts: publication.maxAttempts,
      allowUnlimitedAttempts: publication.allowUnlimitedAttempts,
      allowTextSubmission: publication.allowTextSubmission,
      allowRichTextSubmission: publication.allowRichTextSubmission,
      allowFileUpload: publication.allowFileUpload,
      allowExternalLink: publication.allowExternalLink,
      allowGitRepository: publication.allowGitRepository,
      latePolicyType: publication.latePolicyType,
      lateGraceMinutes: publication.lateGraceMinutes,
      latePenaltyType: publication.latePenaltyType,
      latePenaltyValue: publication.latePenaltyValue,
      extensionEnabled: publication.extensionEnabled,
      reviewRequestsEnabled: publication.reviewRequestsEnabled,
      groupAssignmentEnabled: publication.groupAssignmentEnabled,
      subjectId: publication.subjectId,
      subjectName: publication.subject.name,
      languageId: publication.languageId,
      languageName: publication.language.name,
      groupId: publication.groupId,
      groupName: publication.group.name,
      academicYearId: publication.academicYearId,
      academicYearName: publication.academicYear.name,
      semesterId: publication.semesterId,
      semesterName: publication.semester.name,
      academicOfferingId: publication.academicOfferingId,
      targetCount: publication._count.targets,
      attemptCount: publication._count.attempts,
      extensionRequestCount: publication._count.extensionRequests,
      gradeCount: publication._count.grades,
      targets: publication.targets.map((target) => ({
        id: target.id,
        studentId: target.studentId,
        studentName: target.student.user.name,
        studentEmail: target.student.user.email,
      })),
    })),
    extensionRequests: extensionRequests.map((request) => ({
      id: request.id,
      publicationId: request.publicationId,
      status: request.status,
      requestedUntil: serializeDate(request.requestedUntil),
      approvedUntil: serializeDate(request.approvedUntil),
      reason: request.reason,
      teacherNote: request.teacherNote,
      decidedAt: serializeDate(request.decidedAt),
      cancelledAt: serializeDate(request.cancelledAt),
      createdAt: serializeDate(request.createdAt),
      studentName: request.student.user.name,
      studentEmail: request.student.user.email,
      title: request.publication.title,
      subjectName: request.publication.subject.name,
      groupName: request.publication.group.name,
    })),
    attempts: attempts.map((attempt) => ({
      id: attempt.id,
      publicationId: attempt.publicationId,
      title: attempt.publication.title,
      attemptNumber: attempt.attemptNumber,
      status: attempt.status,
      submissionType: attempt.submissionType,
      isLate: attempt.isLate,
      latePenaltyApplied: attempt.latePenaltyApplied,
      studentName: attempt.student.user.name,
      studentEmail: attempt.student.user.email,
      submittedAt: serializeDate(attempt.submittedAt),
      teacherLocked: attempt.teacherLocked,
      attachments: attempt.attachments.map((attachment) => ({
        id: attachment.id,
        fileName: attachment.fileName,
        downloadUrl: buildCourseworkAttachmentDownloadUrl(attachment.id),
        fileSizeBytes: attachment.fileSizeBytes,
        mimeType: attachment.mimeType,
        malwareStatus: attachment.malwareStatus,
      })),
      latestGrade: attempt.grades[0]
        ? {
            id: attempt.grades[0].id,
            status: attempt.grades[0].status,
            totalScore: attempt.grades[0].totalScore,
            percentage: attempt.grades[0].percentage,
          }
        : null,
    })),
    grades: grades.map((grade) => ({
      id: grade.id,
      publicationId: grade.publicationId,
      attemptId: grade.attemptId,
      title: grade.publication.title,
      studentName: grade.attempt.student.user.name,
      studentEmail: grade.attempt.student.user.email,
      status: grade.status,
      totalScore: grade.totalScore,
      percentage: grade.percentage,
      textFeedback: grade.textFeedback,
      privateNotes: grade.privateNotes,
      publishedAt: serializeDate(grade.publishedAt),
      criterionScores: grade.criterionScores.map((score) => ({
        criterionId: score.criterionId,
        selectedLevelId: score.selectedLevelId,
        score: score.score,
        feedback: score.feedback,
      })),
      moderationDecisions: grade.moderationDecisions.map((decision) => ({
        id: decision.id,
        status: decision.status,
        notes: decision.notes,
        decidedAt: serializeDate(decision.decidedAt),
      })),
    })),
  }
}

export async function getStudentEnterpriseCourseworkWorkspace(userId: string) {
  const profile = await prisma.studentProfile.findUnique({
    where: { userId },
    select: {
      id: true,
      departmentId: true,
      user: {
        select: {
          name: true,
          email: true,
        },
      },
      subjects: {
        select: {
          subjectId: true,
          languageId: true,
          groupId: true,
          academicYearId: true,
          semesterId: true,
          academicOfferingId: true,
        },
      },
    },
  })

  if (!profile) {
    return null
  }

  const scopeClauses: Prisma.CourseworkPublicationWhereInput[] = profile.subjects.map((subject) => ({
    departmentId: profile.departmentId,
    OR: subject.academicOfferingId
      ? [
          { academicOfferingId: subject.academicOfferingId },
          {
            subjectId: subject.subjectId,
            languageId: subject.languageId,
            groupId: subject.groupId,
            academicYearId: subject.academicYearId,
            semesterId: subject.semesterId,
          },
        ]
      : [
          {
            subjectId: subject.subjectId,
            languageId: subject.languageId,
            groupId: subject.groupId,
            academicYearId: subject.academicYearId,
            semesterId: subject.semesterId,
          },
        ],
  }))

  const publications = await prisma.courseworkPublication.findMany({
    where: {
      OR: [
        { targets: { some: { studentId: profile.id } } },
        ...(scopeClauses.length > 0 ? scopeClauses : [{ id: '__no_match__' }]),
      ],
    },
    include: {
      subject: true,
      language: true,
      group: true,
      academicYear: true,
      semester: true,
      rubric: {
        include: {
          criteria: {
            include: {
              levels: {
                orderBy: { orderIndex: 'asc' },
              },
            },
            orderBy: { orderIndex: 'asc' },
          },
        },
      },
      attempts: {
        where: { studentId: profile.id },
        include: {
          attachments: true,
          grades: {
            where: {
              status: 'PUBLISHED',
            },
            include: {
              criterionScores: true,
            },
            orderBy: { updatedAt: 'desc' },
          },
        },
        orderBy: { attemptNumber: 'desc' },
      },
      extensionRequests: {
        where: { studentId: profile.id },
        orderBy: { createdAt: 'desc' },
      },
    },
    orderBy: [{ dueAt: 'asc' }, { createdAt: 'desc' }],
  })

  return {
    profile: {
      id: profile.id,
      name: profile.user.name,
      email: profile.user.email,
    },
    publications: publications.map((publication) => ({
      id: publication.id,
      title: publication.title,
      description: publication.description,
      instructions: publication.instructions,
      status: publication.status,
      dueAt: serializeDate(publication.dueAt),
      hardCloseAt: serializeDate(publication.hardCloseAt),
      publishedAt: serializeDate(publication.publishedAt),
      closedAt: serializeDate(publication.closedAt),
      allowedFileTypes: publication.allowedFileTypes,
      maxFileSizeBytes: publication.maxFileSizeBytes,
      maxAttempts: publication.maxAttempts,
      allowUnlimitedAttempts: publication.allowUnlimitedAttempts,
      allowTextSubmission: publication.allowTextSubmission,
      allowRichTextSubmission: publication.allowRichTextSubmission,
      allowFileUpload: publication.allowFileUpload,
      allowExternalLink: publication.allowExternalLink,
      allowGitRepository: publication.allowGitRepository,
      latePolicyType: publication.latePolicyType,
      lateGraceMinutes: publication.lateGraceMinutes,
      latePenaltyType: publication.latePenaltyType,
      latePenaltyValue: publication.latePenaltyValue,
      extensionEnabled: publication.extensionEnabled,
      reviewRequestsEnabled: publication.reviewRequestsEnabled,
      subjectName: publication.subject.name,
      languageName: publication.language.name,
      groupName: publication.group.name,
      academicYearName: publication.academicYear.name,
      semesterName: publication.semester.name,
      rubric: publication.rubric
        ? {
            id: publication.rubric.id,
            title: publication.rubric.title,
            totalMarks: publication.rubric.totalMarks,
            criteria: publication.rubric.criteria.map((criterion) => ({
              id: criterion.id,
              title: criterion.title,
              description: criterion.description,
              maximumMarks: criterion.maximumMarks,
              weight: criterion.weight,
              levels: criterion.levels.map((level) => ({
                id: level.id,
                title: level.title,
                description: level.description,
                score: level.score,
              })),
            })),
          }
        : null,
      attempts: publication.attempts.map((attempt) => ({
        id: attempt.id,
        attemptNumber: attempt.attemptNumber,
        status: attempt.status,
        submissionType: attempt.submissionType,
        plainTextSubmission: attempt.plainTextSubmission,
        richTextSubmission: attempt.richTextSubmission,
        externalLink: attempt.externalLink,
        repositoryUrl: attempt.repositoryUrl,
        isLate: attempt.isLate,
        latePenaltyApplied: attempt.latePenaltyApplied,
        submittedAt: serializeDate(attempt.submittedAt),
        attachments: attempt.attachments.map((attachment) => ({
          id: attachment.id,
          fileName: attachment.fileName,
          downloadUrl: buildCourseworkAttachmentDownloadUrl(attachment.id),
          fileSizeBytes: attachment.fileSizeBytes,
          mimeType: attachment.mimeType,
          malwareStatus: attachment.malwareStatus,
        })),
        latestGrade: attempt.grades[0]
          ? {
              id: attempt.grades[0].id,
              status: attempt.grades[0].status,
              totalScore: attempt.grades[0].totalScore,
              percentage: attempt.grades[0].percentage,
              textFeedback: attempt.grades[0].textFeedback,
              criterionScores: attempt.grades[0].criterionScores.map((score) => ({
                criterionId: score.criterionId,
                selectedLevelId: score.selectedLevelId,
                score: score.score,
                feedback: score.feedback,
              })),
            }
          : null,
      })),
      extensionRequests: publication.extensionRequests.map((request) => ({
        id: request.id,
        status: request.status,
        requestedUntil: serializeDate(request.requestedUntil),
        approvedUntil: serializeDate(request.approvedUntil),
        reason: request.reason,
        teacherNote: request.teacherNote,
        createdAt: serializeDate(request.createdAt),
        cancelledAt: serializeDate(request.cancelledAt),
      })),
    })),
  }
}
