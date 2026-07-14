import {
  CourseworkAttemptStatus,
  CourseworkExtensionRequestStatus,
  CourseworkPublicationStatus,
  CourseworkSubmissionType,
  Prisma,
} from '@prisma/client'
import { rm, writeFile } from 'fs/promises'
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
import { parseCourseworkAiReviewPolicy } from './coursework-ai-review'
import { countCourseworkWords, extractCourseworkDocumentFromBuffer, extractReferencesSection, extractSectionNames } from './coursework-document'
import { runCourseworkAiReview } from '@/services/coursework-ai-review.service'

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

  const parsedAttachmentDocuments = []
  for (const file of attachments) {
    const extension = file.name.split('.').pop()?.toLowerCase() || ''
    if (!['docx', 'pdf', 'txt', 'md', 'markdown'].includes(extension)) {
      continue
    }

    let parsed
    try {
      parsed = await extractCourseworkDocumentFromBuffer({
        fileName: file.name,
        extension,
        mimeType: file.mimeType,
        bytes: file.bytes,
      })
    } catch (error) {
      return {
        ok: false as const,
        status: 400,
        error: `File ${file.name} is corrupted or unreadable: ${error instanceof Error ? error.message : 'document parsing failed'}`,
      }
    }

    if (!parsed.text.trim()) {
      return {
        ok: false as const,
        status: 400,
        error: `File ${file.name} did not contain readable content.`,
      }
    }

    parsedAttachmentDocuments.push(parsed)
  }

  const extractedText = [plainTextSubmission, richTextSubmission, ...parsedAttachmentDocuments.map((document) => document.text)]
    .filter(Boolean)
    .join('\n\n')
    .trim()
  const policy = parseCourseworkAiReviewPolicy(publication.metadata)
  const wordCount = countCourseworkWords(extractedText)
  const headingNames = parsedAttachmentDocuments.flatMap((document) => document.normalizedDocument.headings)
  const referenceCount = parsedAttachmentDocuments.flatMap((document) => document.normalizedDocument.references).length || extractReferencesSection(extractedText).split('\n').map((item) => item.trim()).filter(Boolean).length

  if (policy.minWords && wordCount < policy.minWords) {
    return {
      ok: false as const,
      status: 400,
      error: `Word count ${wordCount} is below the minimum ${policy.minWords}.`,
    }
  }
  if (policy.maxWords && wordCount > policy.maxWords) {
    return {
      ok: false as const,
      status: 400,
      error: `Word count ${wordCount} exceeds the maximum ${policy.maxWords}.`,
    }
  }
  if (policy.requireRepositoryLink && !repositoryUrl) {
    return {
      ok: false as const,
      status: 400,
      error: 'A repository link is required for this coursework.',
    }
  }
  if (policy.requiredAttachments && attachments.length < policy.requiredAttachments) {
    return {
      ok: false as const,
      status: 400,
      error: `At least ${policy.requiredAttachments} attachment(s) are required.`,
    }
  }
  if (policy.requiredSections.length > 0) {
    const combinedHeadings = headingNames.length > 0 ? headingNames : extractSectionNames(extractedText)
    const missingSections = policy.requiredSections.filter(
      (section) => !combinedHeadings.some((heading) => heading.toLowerCase().includes(section.toLowerCase()))
    )
    if (missingSections.length > 0) {
      return {
        ok: false as const,
        status: 400,
        error: `Required sections missing: ${missingSections.join(', ')}.`,
      }
    }
  }
  if (policy.minimumReferenceCount && referenceCount < policy.minimumReferenceCount) {
    return {
      ok: false as const,
      status: 400,
      error: `At least ${policy.minimumReferenceCount} reference(s) are required.`,
    }
  }

  await ensureCourseworkEnterpriseDir()
  const stagedFiles = attachments.map((file, index) => {
    const extension = file.name.split('.').pop()?.toLowerCase() || ''
    const safeBaseName = sanitizeCourseworkEnterpriseFileName(file.name.replace(/\.[^.]+$/, ''))
    const storedFileName = `${access.studentProfileId}-${publication.id}-${Date.now()}-${index}-${safeBaseName || 'attachment'}.${extension}`
    const storedPath = path.join(process.cwd(), 'public', 'uploads', 'coursework-enterprise', storedFileName)

    return {
      file,
      index,
      extension,
      storedFileName,
      storedPath,
      fileUrl: `/uploads/coursework-enterprise/${storedFileName}`,
    }
  })

  try {
    for (const stagedFile of stagedFiles) {
      await writeFile(stagedFile.storedPath, stagedFile.file.bytes)
    }
  } catch (error) {
    for (const stagedFile of stagedFiles) {
      await rm(stagedFile.storedPath, { force: true }).catch(() => {})
    }
    throw error
  }

  let attempt: Awaited<ReturnType<typeof prisma.courseworkAttempt.findUnique>>
  let transactionWasIdempotent = false
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
          transactionWasIdempotent = true
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
          previousAttemptId: latestAttempt?.id ?? null,
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
          metadata: {
            submissionValidation: {
              extractedWordCount: wordCount,
              referenceCount,
            },
          },
        },
      })

      for (const stagedFile of stagedFiles) {
        await tx.courseworkAttemptAttachment.create({
          data: {
            attemptId: createdAttempt.id,
            studentId: access.studentProfileId!,
            fileName: stagedFile.file.name,
            fileUrl: stagedFile.fileUrl,
            mimeType: stagedFile.file.mimeType || 'application/octet-stream',
            extension: stagedFile.extension,
            fileSizeBytes: stagedFile.file.size,
            malwareStatus: 'CLEAN',
            malwareDetails: 'Validated by enterprise coursework upload hook.',
            isPrimary: stagedFile.index === 0,
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
    for (const stagedFile of stagedFiles) {
      await rm(stagedFile.storedPath, { force: true }).catch(() => {})
    }
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
    transactionWasIdempotent = true
  }

  if (transactionWasIdempotent) {
    for (const stagedFile of stagedFiles) {
      await rm(stagedFile.storedPath, { force: true }).catch(() => {})
    }
    return {
      ok: true as const,
      status: 200,
      attempt,
      remainingAttempts:
        publication.allowUnlimitedAttempts || publication.maxAttempts == null
          ? null
          : Math.max(0, publication.maxAttempts - publication.attempts.length),
      late: attempt?.isLate ?? false,
      latePenaltyApplied: attempt?.latePenaltyApplied ?? 0,
      idempotent: true,
    }
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

  if (attempt?.id) {
    try {
      await runCourseworkAiReview({
        attemptId: attempt.id,
        trigger: 'SUBMISSION',
        requestedByUserId: input.studentUserId,
      })
    } catch (error) {
      await createCourseworkActivityLog({
        userId: input.studentUserId,
        action: 'coursework.ai-review.submit-failed',
        details: JSON.stringify({
          publicationId: publication.id,
          attemptId: attempt.id,
          message: error instanceof Error ? error.message : 'AI review failed',
        }),
      })
    }
  }

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
