import {
  CourseworkAttemptStatus,
  CourseworkGradeStatus,
  CourseworkLatePolicyType,
  CourseworkPenaltyType,
  CourseworkPublicationStatus,
  Prisma,
} from '@prisma/client/index'
import { createHash } from 'crypto'
import { mkdir } from 'fs/promises'
import path from 'path'
import { prisma } from './prisma'

export const COURSEWORK_ENTERPRISE_DIR = path.join(process.cwd(), 'public', 'uploads', 'coursework-enterprise')
export const MAX_COURSEWORK_ATTACHMENT_COUNT = 5
const COURSEWORK_ATTACHMENT_EXECUTABLE_EXTENSIONS = new Set([
  'exe',
  'msi',
  'bat',
  'cmd',
  'ps1',
  'sh',
  'com',
  'scr',
  'dll',
  'jar',
  'apk',
  'app',
])

const COURSEWORK_ATTACHMENT_MIME_ALLOWLIST: Record<string, string[]> = {
  pdf: ['application/pdf'],
  docx: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  pptx: ['application/vnd.openxmlformats-officedocument.presentationml.presentation'],
  zip: ['application/zip', 'application/x-zip-compressed'],
  rar: ['application/vnd.rar', 'application/x-rar-compressed'],
  txt: ['text/plain'],
  csv: ['text/csv', 'application/csv', 'text/plain'],
  png: ['image/png'],
  jpeg: ['image/jpeg'],
  jpg: ['image/jpeg'],
  mp4: ['video/mp4'],
  ts: ['application/typescript', 'text/typescript', 'video/mp2t'],
  js: ['application/javascript', 'text/javascript'],
  tsx: ['text/plain', 'application/octet-stream'],
  jsx: ['text/plain', 'application/octet-stream'],
  py: ['text/x-python', 'text/plain', 'application/octet-stream'],
  java: ['text/x-java-source', 'text/plain', 'application/octet-stream'],
  c: ['text/x-c', 'text/plain', 'application/octet-stream'],
  cpp: ['text/x-c++', 'text/plain', 'application/octet-stream'],
}

export const DEFAULT_ALLOWED_FILE_TYPES = [
  'pdf',
  'docx',
  'pptx',
  'zip',
  'rar',
  'txt',
  'csv',
  'png',
  'jpeg',
  'jpg',
  'mp4',
  'ts',
  'js',
  'tsx',
  'jsx',
  'py',
  'java',
  'c',
  'cpp',
]

export function sanitizeCourseworkEnterpriseFileName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').toLowerCase()
}

export function isExecutableCourseworkAttachmentExtension(extension: string) {
  return COURSEWORK_ATTACHMENT_EXECUTABLE_EXTENSIONS.has(extension.trim().toLowerCase())
}

export function isAllowedCourseworkAttachmentMimeType(extension: string, mimeType: string) {
  const normalizedExtension = extension.trim().toLowerCase()
  const normalizedMimeType = mimeType.trim().toLowerCase()
  const allowedMimeTypes = COURSEWORK_ATTACHMENT_MIME_ALLOWLIST[normalizedExtension]
  if (!allowedMimeTypes || allowedMimeTypes.length === 0) {
    return true
  }
  return allowedMimeTypes.includes(normalizedMimeType)
}

export function buildCourseworkAttachmentDownloadUrl(attachmentId: string) {
  return `/api/coursework/attachments/${attachmentId}`
}

export function normalizeAllowedFileTypes(input: unknown): string[] {
  if (!Array.isArray(input)) {
    return [...DEFAULT_ALLOWED_FILE_TYPES]
  }

  const normalized = Array.from(
    new Set(
      input
        .map((value) => String(value || '').trim().toLowerCase().replace(/^\./, ''))
        .filter(Boolean)
    )
  )

  return normalized.length > 0 ? normalized : [...DEFAULT_ALLOWED_FILE_TYPES]
}

export function buildCourseworkAttemptContentHash(input: {
  plainTextSubmission?: string | null
  richTextSubmission?: string | null
  externalLink?: string | null
  repositoryUrl?: string | null
  attachmentNames?: string[]
}) {
  const hash = createHash('sha256')
  hash.update(input.plainTextSubmission ?? '')
  hash.update('|')
  hash.update(input.richTextSubmission ?? '')
  hash.update('|')
  hash.update(input.externalLink ?? '')
  hash.update('|')
  hash.update(input.repositoryUrl ?? '')
  hash.update('|')
  for (const name of input.attachmentNames ?? []) {
    hash.update(name)
    hash.update('|')
  }
  return hash.digest('hex')
}

export async function ensureCourseworkEnterpriseDir() {
  await mkdir(COURSEWORK_ENTERPRISE_DIR, { recursive: true })
}

export function getPublicationEffectiveDeadline(input: {
  dueAt?: Date | null
  approvedUntil?: Date | null
  hardCloseAt?: Date | null
}) {
  if (input.approvedUntil && (!input.hardCloseAt || input.approvedUntil <= input.hardCloseAt)) {
    return input.approvedUntil
  }
  return input.dueAt ?? null
}

export function evaluateCourseworkSubmissionTiming(input: {
  dueAt?: Date | null
  hardCloseAt?: Date | null
  approvedUntil?: Date | null
  submittedAt?: Date
  latePolicyType: CourseworkLatePolicyType
  lateGraceMinutes?: number | null
  latePenaltyType?: CourseworkPenaltyType | null
  latePenaltyValue?: number | null
}) {
  const submittedAt = input.submittedAt ?? new Date()
  const effectiveDeadline = getPublicationEffectiveDeadline(input)
  const hardCloseAt = input.hardCloseAt ?? null

  if (!effectiveDeadline) {
    return { allowed: true, isLate: false, penaltyApplied: 0, effectiveDeadline: null }
  }

  if (hardCloseAt && submittedAt > hardCloseAt) {
    return {
      allowed: false,
      isLate: true,
      penaltyApplied: 0,
      effectiveDeadline,
      reason: 'Submission window is closed',
    }
  }

  if (submittedAt <= effectiveDeadline) {
    return { allowed: true, isLate: false, penaltyApplied: 0, effectiveDeadline }
  }

  switch (input.latePolicyType) {
    case CourseworkLatePolicyType.NO_LATE_SUBMISSION:
    case CourseworkLatePolicyType.HARD_CLOSE:
      return {
        allowed: false,
        isLate: true,
        penaltyApplied: 0,
        effectiveDeadline,
        reason: 'Late submissions are not allowed',
      }
    case CourseworkLatePolicyType.GRACE_PERIOD: {
      const graceMs = Math.max(0, input.lateGraceMinutes ?? 0) * 60 * 1000
      if (submittedAt.getTime() <= effectiveDeadline.getTime() + graceMs) {
        return { allowed: true, isLate: true, penaltyApplied: 0, effectiveDeadline }
      }
      return {
        allowed: false,
        isLate: true,
        penaltyApplied: 0,
        effectiveDeadline,
        reason: 'Grace period has expired',
      }
    }
    case CourseworkLatePolicyType.LATE_WITHOUT_PENALTY:
      return { allowed: true, isLate: true, penaltyApplied: 0, effectiveDeadline }
    case CourseworkLatePolicyType.LATE_WITH_PENALTY:
      return {
        allowed: true,
        isLate: true,
        penaltyApplied: calculateLatePenalty({
          penaltyType: input.latePenaltyType,
          penaltyValue: input.latePenaltyValue,
          dueAt: effectiveDeadline,
          submittedAt,
        }),
        effectiveDeadline,
      }
    default:
      return { allowed: true, isLate: true, penaltyApplied: 0, effectiveDeadline }
  }
}

function calculateLatePenalty(input: {
  penaltyType?: CourseworkPenaltyType | null
  penaltyValue?: number | null
  dueAt: Date
  submittedAt: Date
}) {
  const penaltyValue = Math.max(0, input.penaltyValue ?? 0)
  if (!input.penaltyType || penaltyValue <= 0) {
    return 0
  }

  if (input.penaltyType === CourseworkPenaltyType.PERCENTAGE_DEDUCTION) {
    return penaltyValue
  }

  if (input.penaltyType === CourseworkPenaltyType.FIXED_MARKS_DEDUCTION) {
    return penaltyValue
  }

  const elapsedMs = Math.max(0, input.submittedAt.getTime() - input.dueAt.getTime())
  const lateDays = Math.max(1, Math.ceil(elapsedMs / (24 * 60 * 60 * 1000)))
  return penaltyValue * lateDays
}

export function computeCourseworkAttemptAvailability(input: {
  maxAttempts?: number | null
  allowUnlimitedAttempts?: boolean | null
  attemptsUsed: number
}) {
  if (input.allowUnlimitedAttempts) {
    return { allowed: true, remainingAttempts: null }
  }

  const maxAttempts = Math.max(1, input.maxAttempts ?? 1)
  const remainingAttempts = Math.max(0, maxAttempts - input.attemptsUsed)
  return {
    allowed: remainingAttempts > 0,
    remainingAttempts,
  }
}

export async function resolveNextCourseworkAttemptNumber(
  tx: Prisma.TransactionClient,
  publicationId: string,
  studentId: string
) {
  const latestAttempt = await tx.courseworkAttempt.findFirst({
    where: { publicationId, studentId },
    select: { attemptNumber: true },
    orderBy: { attemptNumber: 'desc' },
  })

  return (latestAttempt?.attemptNumber ?? 0) + 1
}

export function calculateCourseworkGradeTotals(input: {
  criterionScores: Array<{ awardedScore: number }>
  manualAdjustment?: number | null
  maxScore: number
  latePenaltyApplied?: number | null
}) {
  const rubricScore = input.criterionScores.reduce((sum, item) => sum + item.awardedScore, 0)
  const rawTotal = rubricScore + (input.manualAdjustment ?? 0)
  const totalScore = Math.max(0, rawTotal - (input.latePenaltyApplied ?? 0))
  const percentage = input.maxScore > 0 ? (totalScore / input.maxScore) * 100 : 0

  return {
    rubricScore,
    totalScore,
    percentage,
  }
}

export async function createCourseworkNotification(input: {
  userId: string
  title: string
  message: string
  link?: string | null
  type?: string
  dedupeWindowMs?: number
}) {
  const dedupeThreshold =
    typeof input.dedupeWindowMs === 'number' && input.dedupeWindowMs > 0
      ? new Date(Date.now() - input.dedupeWindowMs)
      : null

  if (dedupeThreshold) {
    const existing = await prisma.notification.findFirst({
      where: {
        userId: input.userId,
        title: input.title,
        message: input.message,
        link: input.link ?? null,
        type: input.type ?? 'info',
        createdAt: {
          gte: dedupeThreshold,
        },
      },
      orderBy: { createdAt: 'desc' },
    })
    if (existing) {
      return existing
    }
  }

  return prisma.notification.create({
    data: {
      userId: input.userId,
      title: input.title,
      message: input.message,
      link: input.link ?? null,
      type: input.type ?? 'info',
    },
  })
}

export async function dispatchCourseworkDueSoonNotifications(input?: {
  now?: Date
  windowMs?: number
  dedupeWindowMs?: number
  publicationIds?: string[]
}) {
  const now = input?.now ?? new Date()
  const windowMs = Math.max(60_000, input?.windowMs ?? 24 * 60 * 60 * 1000)
  const windowEnd = new Date(now.getTime() + windowMs)
  const dedupeWindowMs = Math.max(60_000, input?.dedupeWindowMs ?? windowMs)

  const publications = await prisma.courseworkPublication.findMany({
    where: {
      status: CourseworkPublicationStatus.PUBLISHED,
      ...(input?.publicationIds?.length
        ? {
            id: {
              in: input.publicationIds,
            },
          }
        : {}),
    },
    include: {
      targets: {
        include: {
          student: {
            include: {
              user: {
                select: {
                  id: true,
                },
              },
            },
          },
        },
      },
      extensionRequests: {
        where: {
          status: 'APPROVED',
        },
        select: {
          studentId: true,
          approvedUntil: true,
        },
      },
      attempts: {
        select: {
          studentId: true,
          status: true,
        },
      },
    },
  })

  const createdNotificationIds: string[] = []

  for (const publication of publications) {
    const explicitTargets = publication.targets.map((target) => target.student)
    const scopedStudents =
      explicitTargets.length > 0
        ? explicitTargets
        : await prisma.studentProfile.findMany({
            where: {
              departmentId: publication.departmentId,
              subjects: {
                some: publication.academicOfferingId
                  ? {
                      OR: [
                        { academicOfferingId: publication.academicOfferingId },
                        {
                          subjectId: publication.subjectId,
                          languageId: publication.languageId,
                          groupId: publication.groupId,
                          academicYearId: publication.academicYearId,
                          semesterId: publication.semesterId,
                        },
                      ],
                    }
                  : {
                      subjectId: publication.subjectId,
                      languageId: publication.languageId,
                      groupId: publication.groupId,
                      academicYearId: publication.academicYearId,
                      semesterId: publication.semesterId,
                    },
              },
            },
            include: {
              user: {
                select: {
                  id: true,
                },
              },
            },
          })

    for (const student of scopedStudents) {
      const approvedUntil =
        publication.extensionRequests.find((request) => request.studentId === student.id)?.approvedUntil ?? null
      const effectiveDeadline = getPublicationEffectiveDeadline({
        dueAt: publication.dueAt,
        approvedUntil,
        hardCloseAt: publication.hardCloseAt,
      })
      if (!effectiveDeadline || effectiveDeadline <= now || effectiveDeadline > windowEnd) {
        continue
      }

      const hasFinalSubmission = publication.attempts.some(
        (attempt) =>
          attempt.studentId === student.id &&
          (
            attempt.status === CourseworkAttemptStatus.SUBMITTED ||
            attempt.status === CourseworkAttemptStatus.LOCKED ||
            attempt.status === CourseworkAttemptStatus.AUTO_LOCKED
          )
      )
      if (hasFinalSubmission) {
        continue
      }

      const notification = await createCourseworkNotification({
        userId: student.user.id,
        title: 'Coursework due soon',
        message: `Coursework due soon: ${publication.title}`,
        link: `/student/coursework/${publication.id}/submit`,
        dedupeWindowMs,
      })
      createdNotificationIds.push(notification.id)
    }
  }

  return {
    createdCount: createdNotificationIds.length,
    notificationIds: createdNotificationIds,
    windowStart: now.toISOString(),
    windowEnd: windowEnd.toISOString(),
  }
}

export async function createCourseworkActivityLog(input: {
  userId: string
  action: string
  details?: string | null
  ipAddress?: string | null
}) {
  return prisma.activityLog.create({
    data: {
      userId: input.userId,
      action: input.action,
      details: input.details ?? null,
      ipAddress: input.ipAddress ?? null,
    },
  })
}

export function buildCourseworkTemplateVersionSnapshot(input: {
  type: string
  title: string
  description?: string | null
  instructions?: string | null
  allowedFileTypes: string[]
  maxFileSizeBytes: number
  maxAttempts?: number | null
  allowUnlimitedAttempts?: boolean | null
  allowTextSubmission?: boolean | null
  allowRichTextSubmission?: boolean | null
  allowFileUpload?: boolean | null
  allowExternalLink?: boolean | null
  allowGitRepository?: boolean | null
  dueDatePolicy?: Prisma.JsonValue | null
  latePolicyType: string
  lateGraceMinutes?: number | null
  latePenaltyType?: string | null
  latePenaltyValue?: number | null
  extensionPolicy?: Prisma.JsonValue | null
  reviewRequestsEnabled?: boolean | null
}) {
  return {
    type: input.type,
    title: input.title,
    description: input.description ?? null,
    instructions: input.instructions ?? null,
    allowedFileTypes: input.allowedFileTypes,
    maxFileSizeBytes: input.maxFileSizeBytes,
    maxAttempts: input.maxAttempts ?? null,
    allowUnlimitedAttempts: Boolean(input.allowUnlimitedAttempts),
    allowTextSubmission: Boolean(input.allowTextSubmission),
    allowRichTextSubmission: Boolean(input.allowRichTextSubmission),
    allowFileUpload: Boolean(input.allowFileUpload),
    allowExternalLink: Boolean(input.allowExternalLink),
    allowGitRepository: Boolean(input.allowGitRepository),
    dueDatePolicy: input.dueDatePolicy ?? null,
    latePolicyType: input.latePolicyType,
    lateGraceMinutes: input.lateGraceMinutes ?? null,
    latePenaltyType: input.latePenaltyType ?? null,
    latePenaltyValue: input.latePenaltyValue ?? null,
    extensionPolicy: input.extensionPolicy ?? null,
    reviewRequestsEnabled: Boolean(input.reviewRequestsEnabled),
  }
}

export function canEditCourseworkGrade(status: CourseworkGradeStatus) {
  return status === CourseworkGradeStatus.DRAFT || status === CourseworkGradeStatus.SUBMITTED
}

export function canStudentEditCourseworkAttempt(status: CourseworkAttemptStatus) {
  return status === CourseworkAttemptStatus.DRAFT || status === CourseworkAttemptStatus.RETURNED
}
