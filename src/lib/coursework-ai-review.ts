import type { Prisma } from '@prisma/client'

export type CourseworkAiReviewPolicy = {
  minWords: number | null
  maxWords: number | null
  requiredSections: string[]
  minimumReferenceCount: number | null
  citationStyle: string | null
  requiredFigures: number | null
  requiredTables: number | null
  requireRepositoryLink: boolean
  requiredAttachments: number | null
}

const DEFAULT_POLICY: CourseworkAiReviewPolicy = {
  minWords: null,
  maxWords: null,
  requiredSections: [],
  minimumReferenceCount: null,
  citationStyle: null,
  requiredFigures: null,
  requiredTables: null,
  requireRepositoryLink: false,
  requiredAttachments: null,
}

function asObject(value: Prisma.JsonValue | null | undefined) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }

  return value as Record<string, Prisma.JsonValue>
}

function asPositiveInteger(value: Prisma.JsonValue | undefined) {
  const number = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(number) || number <= 0) {
    return null
  }

  return Math.floor(number)
}

export function parseCourseworkAiReviewPolicy(metadata: Prisma.JsonValue | null | undefined): CourseworkAiReviewPolicy {
  const root = asObject(metadata)
  const rawPolicy = asObject(root?.aiReviewPolicy)

  if (!rawPolicy) {
    return { ...DEFAULT_POLICY }
  }

  return {
    minWords: asPositiveInteger(rawPolicy.minWords),
    maxWords: asPositiveInteger(rawPolicy.maxWords),
    requiredSections: Array.isArray(rawPolicy.requiredSections)
      ? Array.from(
          new Set(
            rawPolicy.requiredSections
              .map((value) => String(value || '').trim())
              .filter(Boolean)
          )
        )
      : [],
    minimumReferenceCount: asPositiveInteger(rawPolicy.minimumReferenceCount),
    citationStyle: typeof rawPolicy.citationStyle === 'string' && rawPolicy.citationStyle.trim()
      ? rawPolicy.citationStyle.trim().toUpperCase()
      : null,
    requiredFigures: asPositiveInteger(rawPolicy.requiredFigures),
    requiredTables: asPositiveInteger(rawPolicy.requiredTables),
    requireRepositoryLink: Boolean(rawPolicy.requireRepositoryLink),
    requiredAttachments: asPositiveInteger(rawPolicy.requiredAttachments),
  }
}

export function buildCourseworkAiReviewMetadata(policy: CourseworkAiReviewPolicy) {
  return {
    aiReviewPolicy: {
      minWords: policy.minWords,
      maxWords: policy.maxWords,
      requiredSections: policy.requiredSections,
      minimumReferenceCount: policy.minimumReferenceCount,
      citationStyle: policy.citationStyle,
      requiredFigures: policy.requiredFigures,
      requiredTables: policy.requiredTables,
      requireRepositoryLink: policy.requireRepositoryLink,
      requiredAttachments: policy.requiredAttachments,
    },
  }
}

export function mergeCourseworkMetadata(
  metadata: Prisma.JsonValue | null | undefined,
  aiReviewPolicy: CourseworkAiReviewPolicy
) {
  const root = asObject(metadata)

  return {
    ...(root ?? {}),
    ...buildCourseworkAiReviewMetadata(aiReviewPolicy),
  }
}

export function isCourseworkAiReviewReleased(
  audits: Array<{ action: string; createdAt?: Date | string | null }>
) {
  return audits.some((audit) => audit.action === 'RELEASED_TO_STUDENT')
}

export function getLatestCourseworkAiTeacherDecision(
  audits: Array<{ action: string; createdAt?: Date | string | null; details?: unknown }>
) {
  const ranked = audits
    .filter((audit) =>
      ['TEACHER_APPROVE', 'TEACHER_RETURN', 'TEACHER_REJECT', 'TEACHER_MANUAL_REVIEW'].includes(audit.action)
    )
    .sort((left, right) => {
      const leftTime = left.createdAt ? new Date(left.createdAt).getTime() : 0
      const rightTime = right.createdAt ? new Date(right.createdAt).getTime() : 0
      return rightTime - leftTime
    })

  return ranked[0] ?? null
}
