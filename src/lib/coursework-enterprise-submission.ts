import {
  CourseworkAttemptStatus,
  CourseworkExtensionRequestStatus,
  CourseworkPublicationStatus,
  CourseworkSubmissionType,
  Prisma,
} from '@prisma/client'
import { writeFile } from 'fs/promises'
import path from 'path'
import { studentCanAccessCourseworkPublication } from './permissions'
import { prisma } from './prisma'
import {
  buildCourseworkAttemptContentHash,
  isAllowedCourseworkAttachmentMimeType,
  isExecutableCourseworkAttachmentExtension,
  computeCourseworkAttemptAvailability,
  createCourseworkActivityLog,
  createCourseworkNotification,
  ensureCourseworkEnterpriseDir,
  evaluateCourseworkSubmissionTiming,
  MAX_COURSEWORK_ATTACHMENT_COUNT,
  resolveNextCourseworkAttemptNumber,
  sanitizeCourseworkEnterpriseFileName,
} from './coursework-enterprise'

export type CourseworkSubmissionAttachmentInput = {
  name: string
  mimeType: string
  size: number
  bytes: Buffer
}

export type SubmitCourseworkAttemptInput = {
  publicationId: string
  studentUserId: string
  plainTextSubmission?: string
  richTextSubmission?: string
  externalLink?: string
  repositoryUrl?: string
  idempotencyKey?: string | null
  attachments?: CourseworkSubmissionAttachmentInput[]
  submittedAtOverride?: Date
}

function inferSubmissionType(input: {
  plainTextSubmission?: string
  richTextSubmission?: string
  externalLink?: string
  repositoryUrl?: string
  fileCount: number
}) {
  const hasText = Boolean(input.plainTextSubmission?.trim())
  const hasRichText = Boolean(input.richTextSubmission?.trim())
  const hasExternalLink = Boolean(input.externalLink?.trim())
  const hasRepository = Boolean(input.repositoryUrl?.trim())
  const hasFiles = input.fileCount > 0

  const signals = [hasText, hasRichText, hasExternalLink, hasRepository, hasFiles].filter(Boolean).length
  if (signals > 1) {
    return CourseworkSubmissionType.MIXED
  }
  if (hasFiles) return CourseworkSubmissionType.FILE_UPLOAD
  if (hasRepository) return CourseworkSubmissionType.GIT_REPOSITORY
  if (hasExternalLink) return CourseworkSubmissionType.EXTERNAL_LINK
  if (hasRichText) return CourseworkSubmissionType.RICH_TEXT
  return CourseworkSubmissionType.TEXT
}

function isUniqueConstraintError(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  )
}

export async function submitCourseworkAttemptForStudent(input: SubmitCourseworkAttemptInput) {
  const access = await studentCanAccessCourseworkPublication(input.studentUserId, input.publicationId)
  if (!access.allowed || !access.studentProfileId) {
    return { ok: false as const, status: 403, error: access.reason || 'Forbidden' }
  }

  const publication = await prisma.courseworkPublication.findUnique({
    where: { id: input.publicationId },
    include: {
      teacher: {
        include: {
          user: {
            select: { id: true },
          },
        },
      },
      targets: true,
      extensionRequests: {
        where: {
          studentId: access.studentProfileId,
          status: CourseworkExtensionRequestStatus.APPROVED,
        },
        orderBy: { approvedUntil: 'desc' },
        take: 1,
      },
      attempts: {
        where: { studentId: access.studentProfileId },
        select: {
          id: true,
          attemptNumber: true,
          status: true,
          finalContentHash: true,
        },
        orderBy: { attemptNumber: 'desc' },
      },
    },
  })

  if (!publication) {
    return { ok: false as const, status: 404, error: 'Coursework publication not found' }
  }

  if (publication.status !== CourseworkPublicationStatus.PUBLISHED) {
    return { ok: false as const, status: 400, error: 'Coursework publication is not open for new submissions' }
  }

  const plainTextSubmission = String(input.plainTextSubmission || '').trim()
  const richTextSubmission = String(input.richTextSubmission || '').trim()
  const externalLink = String(input.externalLink || '').trim()
  const repositoryUrl = String(input.repositoryUrl || '').trim()
  const attachments = input.attachments ?? []

  if (!publication.allowTextSubmission && plainTextSubmission) {
    return { ok: false as const, status: 400, error: 'Plain text submissions are not allowed for this coursework' }
  }
  if (!publication.allowRichTextSubmission && richTextSubmission) {
    return { ok: false as const, status: 400, error: 'Rich text submissions are not allowed for this coursework' }
  }
  if (!publication.allowExternalLink && externalLink) {
    return { ok: false as const, status: 400, error: 'External links are not allowed for this coursework' }
  }
  if (!publication.allowGitRepository && repositoryUrl) {
    return { ok: false as const, status: 400, error: 'Repository submissions are not allowed for this coursework' }
  }
  if (!publication.allowFileUpload && attachments.length > 0) {
    return { ok: false as const, status: 400, error: 'File uploads are not allowed for this coursework' }
  }
  if (attachments.length > MAX_COURSEWORK_ATTACHMENT_COUNT) {
    return {
      ok: false as const,
      status: 400,
      error: `A maximum of ${MAX_COURSEWORK_ATTACHMENT_COUNT} attachments is allowed per submission`,
    }
  }
  if (!plainTextSubmission && !richTextSubmission && !externalLink && !repositoryUrl && attachments.length === 0) {
    return { ok: false as const, status: 400, error: 'At least one submission input is required' }
  }

  const finalContentHash = buildCourseworkAttemptContentHash({
    plainTextSubmission,
    richTextSubmission,
    externalLink,
    repositoryUrl,
    attachmentNames: attachments.map((file) => file.name),
  })

  const latestAttempt = publication.attempts[0] ?? null
  if (
    input.idempotencyKey &&
    latestAttempt &&
    latestAttempt.status === CourseworkAttemptStatus.SUBMITTED &&
    latestAttempt.finalContentHash === finalContentHash
  ) {
    const existingAttempt = await prisma.courseworkAttempt.findUnique({
      where: { id: latestAttempt.id },
      include: { attachments: true },
    })
    return {
      ok: true as const,
      status: 200,
      attempt: existingAttempt,
      remainingAttempts:
        publication.allowUnlimitedAttempts || publication.maxAttempts == null
          ? null
          : Math.max(0, publication.maxAttempts - publication.attempts.length),
      late: existingAttempt?.isLate ?? false,
      latePenaltyApplied: existingAttempt?.latePenaltyApplied ?? 0,
      idempotent: true,
    }
  }

  const availability = computeCourseworkAttemptAvailability({
    maxAttempts: publication.maxAttempts,
    allowUnlimitedAttempts: publication.allowUnlimitedAttempts,
    attemptsUsed: publication.attempts.length,
  })
  if (!availability.allowed) {
    return { ok: false as const, status: 400, error: 'Maximum attempts reached for this coursework' }
  }

  const submissionTiming = evaluateCourseworkSubmissionTiming({
    dueAt: publication.dueAt,
    hardCloseAt: publication.hardCloseAt,
    approvedUntil: publication.extensionRequests[0]?.approvedUntil ?? null,
    submittedAt: input.submittedAtOverride,
    latePolicyType: publication.latePolicyType,
    lateGraceMinutes: publication.lateGraceMinutes,
    latePenaltyType: publication.latePenaltyType,
    latePenaltyValue: publication.latePenaltyValue,
  })
  if (!submissionTiming.allowed) {
    return { ok: false as const, status: 400, error: submissionTiming.reason || 'Submission is not allowed right now' }
  }

  const allowedFileTypes = new Set(publication.allowedFileTypes.map((item) => item.trim().toLowerCase()))
  for (const file of attachments) {
    const extension = file.name.split('.').pop()?.toLowerCase() || ''
    if (isExecutableCourseworkAttachmentExtension(extension)) {
      return { ok: false as const, status: 400, error: `Executable attachment .${extension} is not allowed` }
    }
    if (!allowedFileTypes.has(extension)) {
      return { ok: false as const, status: 400, error: `File type .${extension || 'unknown'} is not allowed` }
    }
    if (!isAllowedCourseworkAttachmentMimeType(extension, file.mimeType || 'application/octet-stream')) {
      return {
        ok: false as const,
        status: 400,
        error: `File ${file.name} failed MIME validation for .${extension || 'unknown'}`,
      }
    }
    if (file.size > publication.maxFileSizeBytes) {
      return { ok: false as const, status: 400, error: `File ${file.name} exceeds the maximum allowed size` }
    }
  }

  await ensureCourseworkEnterpriseDir()

  let attempt: Awaited<ReturnType<typeof prisma.courseworkAttempt.findUnique>>
  try {
    attempt = await prisma.$transaction(async (tx) => {
      if (input.idempotencyKey) {
        const existingRequest = await tx.courseworkAttemptRequest.findUnique({
          where: {
            publicationId_studentId_idempotencyKey: {
              publicationId: publication.id,
              studentId: access.studentProfileId!,
              idempotencyKey: input.idempotencyKey,
            },
          },
          select: { attemptId: true },
        })
        if (existingRequest) {
          return tx.courseworkAttempt.findUnique({
            where: { id: existingRequest.attemptId },
            include: { attachments: true },
          })
        }
      }

      const attemptNumber = await resolveNextCourseworkAttemptNumber(tx, publication.id, access.studentProfileId!)
      const createdAttempt = await tx.courseworkAttempt.create({
        data: {
          publicationId: publication.id,
          studentId: access.studentProfileId!,
          targetId: publication.targets.find((target) => target.studentId === access.studentProfileId!)?.id ?? null,
          attemptNumber,
          status: CourseworkAttemptStatus.SUBMITTED,
          submissionType: inferSubmissionType({
            plainTextSubmission,
            richTextSubmission,
            externalLink,
            repositoryUrl,
            fileCount: attachments.length,
          }),
          plainTextSubmission: plainTextSubmission || null,
          richTextSubmission: richTextSubmission || null,
          externalLink: externalLink || null,
          repositoryUrl: repositoryUrl || null,
          isLate: submissionTiming.isLate,
          latePenaltyApplied: submissionTiming.penaltyApplied,
          submittedAt: input.submittedAtOverride ?? new Date(),
          finalContentHash,
        },
      })

      for (const [index, file] of attachments.entries()) {
        const extension = file.name.split('.').pop()?.toLowerCase() || ''
        const safeBaseName = sanitizeCourseworkEnterpriseFileName(file.name.replace(/\.[^.]+$/, ''))
        const storedFileName = `${access.studentProfileId}-${publication.id}-${createdAttempt.attemptNumber}-${Date.now()}-${index}-${safeBaseName || 'attachment'}.${extension}`
        const storedPath = path.join(process.cwd(), 'public', 'uploads', 'coursework-enterprise', storedFileName)
        await writeFile(storedPath, file.bytes)

        await tx.courseworkAttemptAttachment.create({
          data: {
            attemptId: createdAttempt.id,
            studentId: access.studentProfileId!,
            fileName: file.name,
            fileUrl: `/uploads/coursework-enterprise/${storedFileName}`,
            mimeType: file.mimeType || 'application/octet-stream',
            extension,
            fileSizeBytes: file.size,
            isPrimary: index === 0,
          },
        })
      }

      if (input.idempotencyKey) {
        await tx.courseworkAttemptRequest.create({
          data: {
            publicationId: publication.id,
            studentId: access.studentProfileId!,
            attemptId: createdAttempt.id,
            idempotencyKey: input.idempotencyKey,
          },
        })
      }

      return tx.courseworkAttempt.findUnique({
        where: { id: createdAttempt.id },
        include: { attachments: true },
      })
    })
  } catch (error) {
    if (!input.idempotencyKey || !isUniqueConstraintError(error)) {
      throw error
    }

    const existingRequest = await prisma.courseworkAttemptRequest.findUnique({
      where: {
        publicationId_studentId_idempotencyKey: {
          publicationId: publication.id,
          studentId: access.studentProfileId!,
          idempotencyKey: input.idempotencyKey,
        },
      },
      select: { attemptId: true },
    })
    if (!existingRequest) {
      throw error
    }
    attempt = await prisma.courseworkAttempt.findUnique({
      where: { id: existingRequest.attemptId },
      include: { attachments: true },
    })
  }

  const createdNotification = await createCourseworkNotification({
    userId: publication.teacher.user.id,
    title: 'Coursework submission received',
    message: `A student submitted an attempt for ${publication.title}.`,
    link: '/teacher/coursework',
    dedupeWindowMs: 60_000,
  })

  if (submissionTiming.isLate) {
    await createCourseworkNotification({
      userId: publication.teacher.user.id,
      title: 'Coursework late submission received',
      message: `A late submission was received for ${publication.title}.`,
      link: '/teacher/coursework',
      dedupeWindowMs: 60_000,
    })
  }

  await createCourseworkActivityLog({
    userId: input.studentUserId,
    action: 'coursework.attempt.submit',
    details: JSON.stringify({ publicationId: publication.id, attemptId: attempt?.id, late: submissionTiming.isLate, notificationId: createdNotification?.id ?? null }),
  })

  return {
    ok: true as const,
    status: 201,
    attempt,
    remainingAttempts: availability.remainingAttempts == null ? null : Math.max(0, availability.remainingAttempts - 1),
    late: submissionTiming.isLate,
    latePenaltyApplied: submissionTiming.penaltyApplied,
    idempotent: false,
  }
}
