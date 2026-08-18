/**
 * src/lib/permissions.ts
 * Server-side permission checks. NEVER trust client-side role.
 * Import and call these in route handlers and server components.
 */

import {
  AttemptStatus,
  CourseworkPublicationStatus,
  TeachingAssignmentRoleType,
  UserRole,
} from '@prisma/client/index'
import { prisma } from './prisma'
import {
  getTeacherProfileByUserId,
  validateTeacherOfferingAccess,
} from './teacher-assignment'

const STUDENT_EXAM_ACCESS_EXAM_CACHE_TTL_MS = 30_000
const STUDENT_EXAM_ACCESS_PROFILE_CACHE_TTL_MS = 30_000
const STUDENT_EXAM_ACCESS_CONTEXT_CACHE_TTL_MS = 3_000

export type PermissionContext = {
  userId: string
  role: UserRole
}

export type CourseworkPermission =
  | 'coursework.read'
  | 'coursework.manage'
  | 'coursework.grade'
  | 'coursework.publish'
  | 'coursework.review'
  | 'coursework.extension'
  | 'coursework.report'

const COURSEWORK_PERMISSION_ROLE_MAP: Record<CourseworkPermission, TeachingAssignmentRoleType[]> = {
  'coursework.read': [
    TeachingAssignmentRoleType.LEAD_TEACHER,
    TeachingAssignmentRoleType.ASSISTANT_TEACHER,
    TeachingAssignmentRoleType.LECTURER,
    TeachingAssignmentRoleType.LAB_INSTRUCTOR,
    TeachingAssignmentRoleType.EXAMINER,
    TeachingAssignmentRoleType.REVIEWER,
    TeachingAssignmentRoleType.MODERATOR,
    TeachingAssignmentRoleType.COURSE_COORDINATOR,
    TeachingAssignmentRoleType.SUBSTITUTE,
  ],
  'coursework.manage': [
    TeachingAssignmentRoleType.LEAD_TEACHER,
    TeachingAssignmentRoleType.ASSISTANT_TEACHER,
    TeachingAssignmentRoleType.LECTURER,
    TeachingAssignmentRoleType.LAB_INSTRUCTOR,
    TeachingAssignmentRoleType.COURSE_COORDINATOR,
    TeachingAssignmentRoleType.SUBSTITUTE,
  ],
  'coursework.grade': [
    TeachingAssignmentRoleType.LEAD_TEACHER,
    TeachingAssignmentRoleType.ASSISTANT_TEACHER,
    TeachingAssignmentRoleType.EXAMINER,
    TeachingAssignmentRoleType.REVIEWER,
    TeachingAssignmentRoleType.MODERATOR,
    TeachingAssignmentRoleType.SUBSTITUTE,
  ],
  'coursework.publish': [
    TeachingAssignmentRoleType.LEAD_TEACHER,
    TeachingAssignmentRoleType.COURSE_COORDINATOR,
    TeachingAssignmentRoleType.EXAMINER,
    TeachingAssignmentRoleType.SUBSTITUTE,
  ],
  'coursework.review': [
    TeachingAssignmentRoleType.LEAD_TEACHER,
    TeachingAssignmentRoleType.REVIEWER,
    TeachingAssignmentRoleType.MODERATOR,
    TeachingAssignmentRoleType.SUBSTITUTE,
  ],
  'coursework.extension': [
    TeachingAssignmentRoleType.LEAD_TEACHER,
    TeachingAssignmentRoleType.ASSISTANT_TEACHER,
    TeachingAssignmentRoleType.COURSE_COORDINATOR,
    TeachingAssignmentRoleType.SUBSTITUTE,
  ],
  'coursework.report': [
    TeachingAssignmentRoleType.LEAD_TEACHER,
    TeachingAssignmentRoleType.ASSISTANT_TEACHER,
    TeachingAssignmentRoleType.EXAMINER,
    TeachingAssignmentRoleType.REVIEWER,
    TeachingAssignmentRoleType.MODERATOR,
    TeachingAssignmentRoleType.COURSE_COORDINATOR,
    TeachingAssignmentRoleType.SUBSTITUTE,
  ],
}

// ─── Role Guards ─────────────────────────────────────────────────────────────

export function isSuperAdmin(ctx: PermissionContext) {
  return ctx.role === UserRole.SUPER_ADMIN
}

export function isDepartmentAdmin(ctx: PermissionContext) {
  return ctx.role === UserRole.DEPARTMENT_ADMIN
}

export function isAdmin(ctx: PermissionContext) {
  return ctx.role === UserRole.SUPER_ADMIN || ctx.role === UserRole.DEPARTMENT_ADMIN
}

export function isTeacher(ctx: PermissionContext) {
  return ctx.role === UserRole.TEACHER
}

export function isStudent(ctx: PermissionContext) {
  return ctx.role === UserRole.STUDENT
}

type StudentExamAccessProfile = Awaited<ReturnType<typeof loadStudentExamAccessProfileForExam>>
type StudentExamAccessExam = Awaited<ReturnType<typeof loadStudentExamAccessExam>>
export type StudentExamAccessContext = Awaited<ReturnType<typeof getStudentExamAccessContext>>
export type StudentExamAccessStage =
  | 'exam_lookup'
  | 'student_enrollment_lookup'
  | 'legacy_fallback_lookup'
  | 'academic_offering_validation'
  | 'language_resolution'
  | 'existing_attempt_lookup'
  | 'eligibility_decision'
export type StudentExamAccessObserver = {
  onStage?: (event: {
    stage: StudentExamAccessStage
    durationMs: number
    cache: 'hit' | 'miss' | 'none'
    dbQueryCount: number
    redisOperationCount: number
    errorCode?: string
  }) => void
}

const studentExamAccessExamCache = new Map<
  string,
  {
    expiresAtMs: number
    promise: Promise<{
      id: string
      subjectId: string
      languageId: string
      groupId: string
      academicYearId: string
      semesterId: string
      academicOfferingId: string | null
      departmentId: string
      status: string
      startTime: Date
      endTime: Date
      duration: number
      allowRetake: boolean
    } | null>
  }
>()

const studentExamAccessProfileCache = new Map<
  string,
  {
    expiresAtMs: number
    promise: Promise<{
      id: string
      userId: string
      departmentId: string
      subjectMatches: Array<{
        subjectId: string
        languageId: string
        groupId: string
        academicYearId: string
        semesterId: string
        academicOfferingId: string | null
      }>
      enrollments: Array<{
        id: string
        departmentId: string
        academicYearId: string | null
        academicSessionId: string | null
        semesterId: string | null
        groupId: string | null
        languageId: string | null
        status: string
        isActive: boolean
        enrolledAt: Date
      }>
      leaveRecords: Array<{
        id: string
        readmittedAt: Date | null
      }>
      graduationRecords: Array<{
        id: string
        graduatedAt: Date
      }>
      existingAttempt:
        | {
            id: string
            examId: string
            studentId: string
            status: AttemptStatus
            startedAt: Date | null
            submittedAt: Date | null
            warningCount: number
            tabSwitchCount: number
            reconnectCount: number
            socketId: string | null
          }
        | null
    } | null>
  }
>()
const studentExamAccessContextCache = new Map<
  string,
  {
    expiresAtMs: number
    promise: Promise<{
      allowed: boolean
      reason?: string
      profile: NonNullable<StudentExamAccessProfile> | null
      exam: NonNullable<StudentExamAccessExam> | null
      existingAttempt:
        | {
            id: string
            examId: string
            studentId: string
            status: AttemptStatus
            startedAt: Date | null
            submittedAt: Date | null
            warningCount: number
            tabSwitchCount: number
            reconnectCount: number
            socketId: string | null
          }
        | null
    }>
  }
>()

function buildStudentExamAccessContextCacheKey(studentUserId: string, examId: string) {
  return `${studentUserId}:${examId}`
}

function emitStudentExamAccessStage(
  observer: StudentExamAccessObserver | undefined,
  event: {
    stage: StudentExamAccessStage
    durationMs: number
    cache: 'hit' | 'miss' | 'none'
    dbQueryCount: number
    redisOperationCount: number
    errorCode?: string
  }
) {
  observer?.onStage?.(event)
}

async function timeStudentExamAccessStage<T>(
  observer: StudentExamAccessObserver | undefined,
  input: {
    stage: StudentExamAccessStage
    cache?: 'hit' | 'miss' | 'none'
    dbQueryCount?: number
    redisOperationCount?: number
  },
  fn: () => Promise<T>
) {
  const startedAt = Date.now()
  try {
    const result = await fn()
    emitStudentExamAccessStage(observer, {
      stage: input.stage,
      durationMs: Date.now() - startedAt,
      cache: input.cache ?? 'none',
      dbQueryCount: input.dbQueryCount ?? 0,
      redisOperationCount: input.redisOperationCount ?? 0,
    })
    return result
  } catch (error) {
    emitStudentExamAccessStage(observer, {
      stage: input.stage,
      durationMs: Date.now() - startedAt,
      cache: input.cache ?? 'none',
      dbQueryCount: input.dbQueryCount ?? 0,
      redisOperationCount: input.redisOperationCount ?? 0,
      errorCode: error instanceof Error ? error.message : String(error),
    })
    throw error
  }
}

function buildStudentExamAccessProfileCacheKey(studentUserId: string, exam: NonNullable<StudentExamAccessExam>) {
  return [
    studentUserId,
    exam.id,
    exam.subjectId,
    exam.languageId,
    exam.groupId,
    exam.academicYearId,
    exam.semesterId,
    exam.academicOfferingId ?? 'none',
  ].join(':')
}

async function loadStudentExamAccessProfileForExam(
  studentUserId: string,
  exam: NonNullable<StudentExamAccessExam>
) {
  const cacheKey = buildStudentExamAccessProfileCacheKey(studentUserId, exam)
  const cached = studentExamAccessProfileCache.get(cacheKey)
  if (cached && cached.expiresAtMs > Date.now()) {
    return cached.promise
  }

  const promise = prisma.studentProfile
    .findUnique({
      where: { userId: studentUserId },
      select: {
        id: true,
        userId: true,
        departmentId: true,
        subjects: {
          where: exam.academicOfferingId
            ? {
                OR: [
                  { academicOfferingId: exam.academicOfferingId },
                  {
                    subjectId: exam.subjectId,
                    languageId: exam.languageId,
                    groupId: exam.groupId,
                    academicYearId: exam.academicYearId,
                    semesterId: exam.semesterId,
                  },
                ],
              }
            : {
                subjectId: exam.subjectId,
                languageId: exam.languageId,
                groupId: exam.groupId,
                academicYearId: exam.academicYearId,
                semesterId: exam.semesterId,
              },
          select: {
            subjectId: true,
            languageId: true,
            groupId: true,
            academicYearId: true,
            semesterId: true,
            academicOfferingId: true,
          },
          take: exam.academicOfferingId ? 2 : 1,
        },
        enrollments: {
          where: {
            OR: [
              { status: 'ACTIVE', isActive: true },
              { status: { in: ['GRADUATED', 'DROPPED', 'ALUMNI', 'LEAVE'] } },
            ],
          },
          select: {
            id: true,
            departmentId: true,
            academicYearId: true,
            academicSessionId: true,
            semesterId: true,
            groupId: true,
            languageId: true,
            status: true,
            isActive: true,
            enrolledAt: true,
          },
          orderBy: [{ isActive: 'desc' }, { enrolledAt: 'desc' }],
          take: 2,
        },
        leaveRecords: {
          select: {
            id: true,
            readmittedAt: true,
          },
          where: {
            OR: [{ readmittedAt: null }, { readmittedAt: { isSet: false } }],
          },
          take: 1,
        },
        graduationRecords: {
          select: {
            id: true,
            graduatedAt: true,
          },
          orderBy: { graduatedAt: 'desc' },
          take: 1,
        },
        examAttempts: {
          where: {
            examId: exam.id,
          },
          select: {
            id: true,
            examId: true,
            studentId: true,
            status: true,
            startedAt: true,
            submittedAt: true,
            warningCount: true,
            tabSwitchCount: true,
            reconnectCount: true,
            socketId: true,
          },
          take: 1,
        },
      },
    })
    .then((profile) => {
      if (!profile) {
        return null
      }

      return {
        id: profile.id,
        userId: profile.userId,
        departmentId: profile.departmentId,
        subjectMatches: profile.subjects,
        enrollments: profile.enrollments,
        leaveRecords: profile.leaveRecords,
        graduationRecords: profile.graduationRecords,
        existingAttempt: profile.examAttempts[0] ?? null,
      }
    })
    .catch((error) => {
      studentExamAccessProfileCache.delete(cacheKey)
      throw error
    })

  studentExamAccessProfileCache.set(cacheKey, {
    expiresAtMs: Date.now() + STUDENT_EXAM_ACCESS_PROFILE_CACHE_TTL_MS,
    promise,
  })

  return promise
}

async function loadStudentExamAccessExam(examId: string) {
  const cached = studentExamAccessExamCache.get(examId)
  if (cached && cached.expiresAtMs > Date.now()) {
    return cached.promise
  }

  const promise = prisma.exam
    .findUnique({
      where: { id: examId },
      select: {
        id: true,
        subjectId: true,
        languageId: true,
        groupId: true,
        academicYearId: true,
        semesterId: true,
        academicOfferingId: true,
        departmentId: true,
        status: true,
        startTime: true,
        endTime: true,
        duration: true,
        allowRetake: true,
      },
    })
    .catch((error) => {
      studentExamAccessExamCache.delete(examId)
      throw error
    })

  studentExamAccessExamCache.set(examId, {
    expiresAtMs: Date.now() + STUDENT_EXAM_ACCESS_EXAM_CACHE_TTL_MS,
    promise,
  })

  return promise
}
function getStudentExamBlockReason(profile: {
  enrollments: Array<{ status: string }>
  leaveRecords: Array<{ id: string }>
  graduationRecords: Array<{ id: string }>
}) {
  const latestEnrollment = profile.enrollments[0] ?? null

  if (profile.leaveRecords.length > 0) {
    return 'Student is on active leave'
  }
  if (profile.graduationRecords.length > 0) {
    return 'Student has graduated'
  }
  if (latestEnrollment && ['GRADUATED', 'DROPPED', 'ALUMNI', 'LEAVE'].includes(latestEnrollment.status)) {
    return `Student enrollment is ${latestEnrollment.status.toLowerCase()}`
  }

  return null
}

function evaluateStudentExamAccess(input: {
  profile: NonNullable<StudentExamAccessProfile>
  exam: NonNullable<StudentExamAccessExam>
  existingAttempt: NonNullable<StudentExamAccessProfile>['existingAttempt']
}) {
  const { profile, exam, existingAttempt } = input

  if (exam.departmentId !== profile.departmentId) {
    return { allowed: false as const, reason: 'Department mismatch' }
  }

  const activeEnrollment = profile.enrollments.find((item) => item.status === 'ACTIVE' && item.isActive)
  const blockedReason = getStudentExamBlockReason(profile)
  if (blockedReason) {
    return { allowed: false as const, reason: blockedReason }
  }

  const enrollmentMatches = activeEnrollment
    ? (
        activeEnrollment.departmentId === exam.departmentId &&
        activeEnrollment.groupId === exam.groupId &&
        activeEnrollment.academicYearId === exam.academicYearId &&
        activeEnrollment.semesterId === exam.semesterId &&
        (!activeEnrollment.languageId || activeEnrollment.languageId === exam.languageId) &&
        activeEnrollment.academicSessionId
      )
    : false

  if (activeEnrollment && !enrollmentMatches) {
    return { allowed: false as const, reason: 'Active enrollment does not match this exam context' }
  }

  const enrolled = profile.subjectMatches.some(
    (s) =>
      s.subjectId === exam.subjectId &&
      s.languageId === exam.languageId &&
      s.groupId === exam.groupId &&
      s.academicYearId === exam.academicYearId &&
      s.semesterId === exam.semesterId
  )
  const enrolledByOffering = exam.academicOfferingId
    ? profile.subjectMatches.some((s) => s.academicOfferingId === exam.academicOfferingId)
    : false
  if (!activeEnrollment && !enrolled && !enrolledByOffering) {
    return { allowed: false as const, reason: 'Not enrolled in this subject/group/year/semester' }
  }
  // Legacy subject enrollment fallback keeps pre-offering enrollments valid during migration.
  if (activeEnrollment && !enrolledByOffering && !enrolled) {
    return {
      allowed: false as const,
      reason: 'No legacy subject enrollment or offering was found for this active enrollment',
    }
  }

  if (
    existingAttempt &&
    ['IN_PROGRESS', 'SUBMITTED', 'AUTO_SUBMITTED', 'TIMED_OUT'].includes(existingAttempt.status)
  ) {
    return { allowed: true as const }
  }

  if (exam.status !== 'SCHEDULED' && exam.status !== 'LIVE') {
    return { allowed: false as const, reason: `Exam is ${exam.status.toLowerCase()}` }
  }

  const now = new Date()
  if (now < exam.startTime) return { allowed: false as const, reason: 'Exam has not started yet' }
  if (now > exam.endTime) return { allowed: false as const, reason: 'Exam has ended' }

  return { allowed: true as const }
}

export function invalidateStudentExamAccessContextCache(studentUserId: string, examId: string) {
  studentExamAccessContextCache.delete(buildStudentExamAccessContextCacheKey(studentUserId, examId))
}

export function invalidateStudentExamAccessCaches(studentUserId: string) {
  for (const key of studentExamAccessProfileCache.keys()) {
    if (key.startsWith(`${studentUserId}:`)) {
      studentExamAccessProfileCache.delete(key)
    }
  }

  for (const key of studentExamAccessContextCache.keys()) {
    if (key.startsWith(`${studentUserId}:`)) {
      studentExamAccessContextCache.delete(key)
    }
  }
}

export function invalidateExamAccessCaches(examId: string) {
  studentExamAccessExamCache.delete(examId)
  for (const key of studentExamAccessProfileCache.keys()) {
    if (key.includes(`:${examId}:`)) {
      studentExamAccessProfileCache.delete(key)
    }
  }
  for (const key of studentExamAccessContextCache.keys()) {
    if (key.endsWith(`:${examId}`)) {
      studentExamAccessContextCache.delete(key)
    }
  }
}

export async function getStudentExamAccessContext(
  studentUserId: string,
  examId: string,
  observer?: StudentExamAccessObserver
) {
  const cacheKey = buildStudentExamAccessContextCacheKey(studentUserId, examId)
  const cachedContext = studentExamAccessContextCache.get(cacheKey)
  if (cachedContext && cachedContext.expiresAtMs > Date.now()) {
    return timeStudentExamAccessStage(
      observer,
      {
        stage: 'eligibility_decision',
        cache: 'hit',
      },
      () => cachedContext.promise
    )
  }

  const promise = (async () => {
    const examCacheState = studentExamAccessExamCache.get(examId)
    const exam = await timeStudentExamAccessStage(
      observer,
      {
        stage: 'exam_lookup',
        cache: examCacheState && examCacheState.expiresAtMs > Date.now() ? 'hit' : 'miss',
        dbQueryCount: examCacheState && examCacheState.expiresAtMs > Date.now() ? 0 : 1,
      },
      () => loadStudentExamAccessExam(examId)
    )

    if (!exam) {
      return { allowed: false as const, reason: 'Exam not found', profile: null, exam: null, existingAttempt: null }
    }

    const profileCacheKey = buildStudentExamAccessProfileCacheKey(studentUserId, exam)
    const profileCacheState = studentExamAccessProfileCache.get(profileCacheKey)
    const profile = await timeStudentExamAccessStage(
      observer,
      {
        stage: 'student_enrollment_lookup',
        cache:
          profileCacheState && profileCacheState.expiresAtMs > Date.now() ? 'hit' : 'miss',
        dbQueryCount:
          profileCacheState && profileCacheState.expiresAtMs > Date.now() ? 0 : 1,
      },
      () => loadStudentExamAccessProfileForExam(studentUserId, exam)
    )

    if (!profile) {
      return {
        allowed: false as const,
        reason: 'Student profile not found',
        profile: null,
        exam,
        existingAttempt: null,
      }
    }

    await timeStudentExamAccessStage(
      observer,
      {
        stage: 'language_resolution',
        cache: 'none',
      },
      async () => exam.languageId
    )

    const existingAttempt = await timeStudentExamAccessStage(
      observer,
      {
        stage: 'existing_attempt_lookup',
        cache: 'none',
      },
      async () => profile.existingAttempt ?? null
    )

    await timeStudentExamAccessStage(
      observer,
      {
        stage: 'academic_offering_validation',
        cache: 'none',
      },
      async () => exam.academicOfferingId ?? null
    )

    await timeStudentExamAccessStage(
      observer,
      {
        stage: 'legacy_fallback_lookup',
        cache: 'none',
      },
      async () =>
        profile.subjectMatches.some(
          (subject) =>
            subject.subjectId === exam.subjectId &&
            subject.languageId === exam.languageId &&
            subject.groupId === exam.groupId &&
            subject.academicYearId === exam.academicYearId &&
            subject.semesterId === exam.semesterId
        )
    )

    const access = await timeStudentExamAccessStage(
      observer,
      {
        stage: 'eligibility_decision',
        cache: 'miss',
      },
      async () =>
        evaluateStudentExamAccess({
          profile,
          exam,
          existingAttempt,
        })
    )

    return {
      ...access,
      profile,
      exam,
      existingAttempt,
    }
  })().catch((error) => {
    studentExamAccessContextCache.delete(cacheKey)
    throw error
  })

  studentExamAccessContextCache.set(cacheKey, {
    expiresAtMs: Date.now() + STUDENT_EXAM_ACCESS_CONTEXT_CACHE_TTL_MS,
    promise,
  })

  return promise
}

export async function getStudentExamCatalogScope(studentUserId: string) {
  const profile = await prisma.studentProfile.findUnique({
    where: { userId: studentUserId },
    select: {
      id: true,
      userId: true,
      departmentId: true,
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
      enrollments: {
        select: {
          id: true,
          departmentId: true,
          academicYearId: true,
          academicSessionId: true,
          semesterId: true,
          groupId: true,
          languageId: true,
          status: true,
          isActive: true,
          enrolledAt: true,
        },
        orderBy: [{ isActive: 'desc' }, { enrolledAt: 'desc' }],
        take: 5,
      },
      leaveRecords: {
        select: {
          id: true,
          readmittedAt: true,
        },
        where: {
          OR: [{ readmittedAt: null }, { readmittedAt: { isSet: false } }],
        },
        take: 1,
      },
      graduationRecords: {
        select: {
          id: true,
          graduatedAt: true,
        },
        orderBy: { graduatedAt: 'desc' },
        take: 1,
      },
    },
  })
  if (!profile) {
    return {
      profile: null,
      activeEnrollment: null,
      blockedReason: 'Student profile not found',
      subjectScopes: [],
    }
  }

  const activeEnrollment = profile.enrollments.find((item) => item.status === 'ACTIVE' && item.isActive) ?? null
  const blockedReason = getStudentExamBlockReason(profile)

  const subjectScopes = activeEnrollment
    ? profile.subjects.filter((subject) =>
        subject.groupId === activeEnrollment.groupId &&
        subject.semesterId === activeEnrollment.semesterId &&
        (!activeEnrollment.academicYearId || subject.academicYearId === activeEnrollment.academicYearId) &&
        (!activeEnrollment.languageId || subject.languageId === activeEnrollment.languageId)
      )
    : profile.subjects

  return {
    profile,
    activeEnrollment,
    blockedReason,
    subjectScopes,
  }
}

function buildStudentExamScopeConditions(
  profile: { departmentId: string },
  subjectScopes: Array<{
    subjectId: string
    languageId: string
    groupId: string
    academicYearId: string
    semesterId: string
  }>
) {
  return subjectScopes.map((subject) => ({
    subjectId: subject.subjectId,
    languageId: subject.languageId,
    groupId: subject.groupId,
    academicYearId: subject.academicYearId,
    semesterId: subject.semesterId,
    departmentId: profile.departmentId,
  }))
}

export async function getStudentExamQueryScope(studentUserId: string) {
  const scope = await getStudentExamCatalogScope(studentUserId)
  return {
    ...scope,
    examWhereClauses: scope.profile ? buildStudentExamScopeConditions(scope.profile, scope.subjectScopes) : [],
  }
}

// ─── Department Admin can only manage their assigned department ───────────────

export async function canManageDepartment(ctx: PermissionContext, departmentId: string) {
  if (ctx.role === UserRole.SUPER_ADMIN) return true
  if (ctx.role === UserRole.DEPARTMENT_ADMIN) {
    const dept = await prisma.department.findFirst({
      where: { id: departmentId, adminId: ctx.userId },
    })
    return !!dept
  }
  return false
}

export async function teacherHasCourseworkPermission(
  ctx: PermissionContext,
  permission: CourseworkPermission,
  opts: {
    academicOfferingId?: string | null
    subjectId: string
    languageId: string
    groupId: string
    academicYearId: string
    semesterId: string
  }
) {
  if (ctx.role === UserRole.SUPER_ADMIN || ctx.role === UserRole.DEPARTMENT_ADMIN) {
    return true
  }

  if (!isTeacher(ctx)) {
    return false
  }

  const profile = await getTeacherProfileByUserId(ctx.userId)
  if (!profile) {
    return false
  }

  const result = await validateTeacherOfferingAccess({
    teacherProfileId: profile.id,
    academicOfferingId: opts.academicOfferingId,
    scope: opts,
    allowedRoles: COURSEWORK_PERMISSION_ROLE_MAP[permission],
  })

  return result.allowed
}

export async function teacherHasCourseworkPermissionForPublication(
  ctx: PermissionContext,
  permission: CourseworkPermission,
  publicationId: string
) {
  if (ctx.role === UserRole.SUPER_ADMIN) {
    return true
  }

  const publication = await prisma.courseworkPublication.findUnique({
    where: { id: publicationId },
    select: {
      departmentId: true,
      academicOfferingId: true,
      subjectId: true,
      languageId: true,
      groupId: true,
      academicYearId: true,
      semesterId: true,
    },
  })

  if (!publication) {
    return false
  }

  if (ctx.role === UserRole.DEPARTMENT_ADMIN) {
    return canManageDepartment(ctx, publication.departmentId)
  }

  return teacherHasCourseworkPermission(ctx, permission, publication)
}

export async function studentCanAccessCourseworkPublication(studentUserId: string, publicationId: string) {
  const publication = await prisma.courseworkPublication.findUnique({
    where: { id: publicationId },
    select: {
      id: true,
      departmentId: true,
      subjectId: true,
      languageId: true,
      groupId: true,
      academicYearId: true,
      semesterId: true,
      academicOfferingId: true,
      status: true,
      targets: {
        select: {
          studentId: true,
        },
      },
    },
  })

  if (!publication) {
    return { allowed: false, reason: 'Coursework publication not found' }
  }

  if (
    publication.status !== CourseworkPublicationStatus.PUBLISHED &&
    publication.status !== CourseworkPublicationStatus.CLOSED
  ) {
    return { allowed: false, reason: 'Coursework publication is not available to students' }
  }

  const profile = await prisma.studentProfile.findUnique({
    where: { userId: studentUserId },
    select: {
      id: true,
      departmentId: true,
      subjects: {
        where: publication.academicOfferingId
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
        select: { id: true },
        take: 1,
      },
    },
  })

  if (!profile) {
    return { allowed: false, reason: 'Student profile not found' }
  }

  if (profile.departmentId !== publication.departmentId) {
    return { allowed: false, reason: 'Department mismatch' }
  }

  if (publication.targets.length > 0) {
    const explicitTarget = publication.targets.some((target) => target.studentId === profile.id)
    return explicitTarget
      ? { allowed: true, reason: undefined, studentProfileId: profile.id }
      : { allowed: false, reason: 'Student is not a target for this coursework publication' }
  }

  if (profile.subjects.length === 0) {
    return { allowed: false, reason: 'Student is not enrolled in the required coursework scope' }
  }

  return { allowed: true, reason: undefined, studentProfileId: profile.id }
}

// ─── Teacher Permission Checks ───────────────────────────────────────────────

/**
 * Verify teacher is assigned to a specific subject/group/year combo.
 * Used before allowing exam/question creation.
 */
export async function teacherCanAccessAssignment(
  ctx: PermissionContext,
  opts: {
    academicOfferingId?: string | null
    subjectId: string
    languageId: string
    groupId: string
    academicYearId: string
    semesterId: string
  }
) {
  if (!isTeacher(ctx)) return false
  const profile = await getTeacherProfileByUserId(ctx.userId)
  if (!profile) return false
  const result = await validateTeacherOfferingAccess({
    teacherProfileId: profile.id,
    academicOfferingId: opts.academicOfferingId,
    scope: opts,
    allowedRoles: [
      TeachingAssignmentRoleType.LEAD_TEACHER,
      TeachingAssignmentRoleType.ASSISTANT_TEACHER,
      TeachingAssignmentRoleType.LECTURER,
      TeachingAssignmentRoleType.LAB_INSTRUCTOR,
      TeachingAssignmentRoleType.COURSE_COORDINATOR,
      TeachingAssignmentRoleType.EXAMINER,
      TeachingAssignmentRoleType.MODERATOR,
      TeachingAssignmentRoleType.SUBSTITUTE,
    ],
  })
  return result.allowed
}

/**
 * Verify teacher owns an exam.
 */
export async function teacherOwnsExam(ctx: PermissionContext, examId: string) {
  if (!isTeacher(ctx)) return false
  const profile = await getTeacherProfileByUserId(ctx.userId)
  if (!profile) return false

  const exam = await prisma.exam.findUnique({
    where: { id: examId },
    select: {
      teacherId: true,
      academicOfferingId: true,
      subjectId: true,
      languageId: true,
      groupId: true,
      academicYearId: true,
      semesterId: true,
    },
  })
  if (!exam) return false
  if (exam.teacherId === profile.id) return true

  const result = await validateTeacherOfferingAccess({
    teacherProfileId: profile.id,
    academicOfferingId: exam.academicOfferingId,
    scope: exam,
    allowedRoles: [
      TeachingAssignmentRoleType.LEAD_TEACHER,
      TeachingAssignmentRoleType.ASSISTANT_TEACHER,
      TeachingAssignmentRoleType.LECTURER,
      TeachingAssignmentRoleType.EXAMINER,
      TeachingAssignmentRoleType.MODERATOR,
      TeachingAssignmentRoleType.SUBSTITUTE,
    ],
  })

  return result.allowed
}

/**
 * Verify teacher owns a question.
 */
export async function teacherOwnsQuestion(ctx: PermissionContext, questionId: string) {
  if (!isTeacher(ctx)) return false
  const profile = await getTeacherProfileByUserId(ctx.userId)
  if (!profile) return false

  const question = await prisma.question.findUnique({
    where: { id: questionId },
    select: {
      teacherId: true,
      academicOfferingId: true,
      subjectId: true,
      languageId: true,
      groupId: true,
      academicYearId: true,
      semesterId: true,
    },
  })
  if (!question) return false
  if (question.teacherId === profile.id) return true

  const result = await validateTeacherOfferingAccess({
    teacherProfileId: profile.id,
    academicOfferingId: question.academicOfferingId,
    scope: question,
    allowedRoles: [
      TeachingAssignmentRoleType.LEAD_TEACHER,
      TeachingAssignmentRoleType.ASSISTANT_TEACHER,
      TeachingAssignmentRoleType.LECTURER,
      TeachingAssignmentRoleType.REVIEWER,
      TeachingAssignmentRoleType.MODERATOR,
      TeachingAssignmentRoleType.SUBSTITUTE,
    ],
  })

  return result.allowed
}

// ─── Student Permission Checks ───────────────────────────────────────────────

/**
 * Verify student is allowed to access a specific exam.
 * Checks: department, subject, language, group, academic year, semester match.
 */
export async function studentCanAccessExam(
  studentUserId: string,
  examId: string
): Promise<{ allowed: boolean; reason?: string }> {
  const result = await getStudentExamAccessContext(studentUserId, examId)
  return result.reason
    ? {
        allowed: result.allowed,
        reason: result.reason,
      }
    : {
        allowed: result.allowed,
      }
}
