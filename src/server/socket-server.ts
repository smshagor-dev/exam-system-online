/**
 * src/server/socket-server.ts
 *
 * Phase 6 real-time exam runtime:
 * - DB remains the source of truth
 * - Redis (when configured) carries distributed runtime state
 * - timers are derived from persisted exam/session timestamps, never the client
 */

import { Server as HttpServer } from 'http'
import { randomUUID } from 'crypto'
import { Server as SocketServer, Socket } from 'socket.io'
import { Prisma, AttemptStatus } from '@prisma/client/index'
import * as jose from 'jose'
import { prisma } from '../lib/prisma'
import { requireTranslation } from '../lib/academic-content'
import { validateExamPublication } from '../lib/phase5-translations'
import { calculateResult } from '../lib/result-engine'
import { getAuthSecret } from '../lib/auth-secret'
import {
  getStudentExamAccessContext,
  invalidateExamAccessCaches,
  invalidateStudentExamAccessContextCache,
  type StudentExamAccessContext,
} from '../lib/permissions'
import { getTeacherProfileByUserId, validateTeacherOfferingAccess } from '../lib/teacher-assignment'
import type { ClientToServerEvents, ServerToClientEvents } from '../types/socket'
import { getExamRuntimeStore, type RuntimeStore } from './exam-runtime-store'
import { ensureAttemptSnapshot, loadAttemptSnapshot } from './exam-attempt-snapshot'

const MAX_SECURITY_WARNINGS = 3
const LEADER_LOCK_TTL_MS = 2500
const HEARTBEAT_STALE_MS = 30000
const EXAM_DELIVERY_CACHE_TTL_MS = 60_000
const EXAM_SESSION_CACHE_TTL_MS = 5_000
const JOIN_RUNTIME_TIMEOUT_MS = 20_000
const JOIN_ACCESS_QUEUE_TIMEOUT_MS = 5_000
const JOIN_ACCESS_CONCURRENCY = 48

type SecurityViolationType = 'TAB_SWITCH' | 'COPY' | 'SCREENSHOT' | 'DEVTOOLS'
type SocketErrorCode =
  | 'UNAUTHORIZED'
  | 'NOT_ELIGIBLE'
  | 'EXAM_NOT_FOUND'
  | 'EXAM_NOT_AVAILABLE'
  | 'TRANSLATION_INCOMPLETE'
  | 'LOCK_TIMEOUT'
  | 'JOIN_QUEUE_TIMEOUT'
  | 'ACCESS_CONTEXT_TIMEOUT'
  | 'DB_TIMEOUT'
  | 'REDIS_TIMEOUT'
  | 'INTERNAL_ERROR'
type JoinTimingStage =
  | 'socket_authentication'
  | 'access_context'
  | 'exam_lookup'
  | 'student_enrollment_lookup'
  | 'legacy_fallback_lookup'
  | 'academic_offering_validation'
  | 'language_resolution'
  | 'existing_attempt_lookup'
  | 'eligibility_decision'
  | 'translation_metadata'
  | 'attempt_update'
  | 'room_join'
  | 'runtime_restore'
  | 'presence_update'
  | 'attempt_state_load'
  | 'session_lookup'
  | 'join_ack'
  | 'monitor_broadcast'

let io: SocketServer<ClientToServerEvents, ServerToClientEvents, object, AuthenticatedSocketData>
let runtimeStorePromise: Promise<RuntimeStore> | null = null
let isSocketServerClosing = false

const examIntervals = new Map<string, ReturnType<typeof setInterval>>()
const examDeliveryMetadataCache = new Map<
  string,
  {
    expiresAtMs: number
    promise: Promise<{
      examId: string
      startTime: Date
      endTime: Date
      duration: number
      allowRetake: boolean
      status: string
    }>
  }
>()
const examSessionCache = new Map<
  string,
  {
    expiresAtMs: number
    promise: Promise<{
      examId: string
      startedAt: Date | null
      isPaused: boolean
      pausedAt: Date | null
      timerOffset: number
    } | null>
  }
>()
let activeJoinAccessCount = 0
const pendingJoinAccessResolvers: Array<() => void> = []

type AuthenticatedSocketData = {
  userId: string
  userRole: string
  userName: string
  examAccessCache?: Record<string, StudentExamAccessContext>
}

type AuthenticatedSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  object,
  AuthenticatedSocketData
>

function getRuntimeStore() {
  if (!runtimeStorePromise) {
    runtimeStorePromise = getExamRuntimeStore()
  }

  return runtimeStorePromise
}

function getSocketAuth(socket: AuthenticatedSocket): AuthenticatedSocketData {
  return socket.data
}

async function canTeacherAccessExam(userId: string, examId: string) {
  const profile = await getTeacherProfileByUserId(userId)
  if (!profile || !profile.user.isActive) return false

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

  const access = await validateTeacherOfferingAccess({
    teacherProfileId: profile.id,
    academicOfferingId: exam.academicOfferingId,
    scope: exam,
  })

  return access.allowed
}

async function assertStudentExamTranslations(examId: string) {
  await getExamDeliveryMetadata(examId)
}

function getSocketSafeErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error) {
    if (error.message.includes('timed out') || error.message.includes('timeout')) {
      return error.message
    }

    if (error.message.includes('Unauthorized') || error.message.includes('lock')) {
      return error.message
    }

    if (error.message.includes('Missing')) {
      return error.message
    }

    if (error.message.includes('translation')) {
      return error.message
    }

    if (error.message === 'Exam not found') {
      return error.message
    }
  }

  return fallback
}

function isJoinTimingEnabled() {
  const raw = process.env.PHASE6_JOIN_TIMING?.trim().toLowerCase()
  return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on'
}

function logJoinTiming(input: {
  requestId: string
  socketId: string
  studentId: string | null
  examId: string
  stage: JoinTimingStage
  durationMs: number
  errorCode?: string
}) {
  if (!isJoinTimingEnabled()) {
    return
  }

  console.info(
    `[Phase6][JoinTiming] ${JSON.stringify({
      requestId: input.requestId,
      socketId: input.socketId,
      studentId: input.studentId,
      examId: input.examId,
      stage: input.stage,
      durationMs: input.durationMs,
      errorCode: input.errorCode ?? null,
    })}`
  )
}

async function timeJoinStage<T>(
  context: {
    requestId: string
    socketId: string
    studentId: string | null
    examId: string
  },
  stage: JoinTimingStage,
  fn: () => Promise<T>
) {
  const startedAt = Date.now()
  try {
    const result = await fn()
    logJoinTiming({
      ...context,
      stage,
      durationMs: Date.now() - startedAt,
    })
    return result
  } catch (error) {
    logJoinTiming({
      ...context,
      stage,
      durationMs: Date.now() - startedAt,
      errorCode: error instanceof Error ? error.message : String(error),
    })
    throw error
  }
}

function emitSocketError(
  socket: AuthenticatedSocket,
  code: SocketErrorCode,
  message: string
) {
  socket.emit('error', {
    code,
    message,
  })
}

function classifyJoinError(input: { message: string }): SocketErrorCode {
  const message = input.message.toLowerCase()

  if (message.includes('unauthorized')) return 'UNAUTHORIZED'
  if (message.includes('exam not found')) return 'EXAM_NOT_FOUND'
  if (message.includes('translation')) return 'TRANSLATION_INCOMPLETE'
  if (message.includes('join queue timed out')) return 'JOIN_QUEUE_TIMEOUT'
  if (message.includes('join authorization timed out')) return 'ACCESS_CONTEXT_TIMEOUT'
  if (message.includes('redis')) return 'REDIS_TIMEOUT'
  if (
    message.includes('timed out') ||
    message.includes('timeout') ||
    message.includes('server selection timeout') ||
    message.includes('connection pool') ||
    message.includes('i/o error')
  ) {
    return 'DB_TIMEOUT'
  }
  if (
    message.includes('has not started') ||
    message.includes('has ended') ||
    message.includes('exam is ')
  ) {
    return 'EXAM_NOT_AVAILABLE'
  }
  if (
    message.includes('access denied') ||
    message.includes('not enrolled') ||
    message.includes('department mismatch') ||
    message.includes('student profile not found') ||
    message.includes('active enrollment') ||
    message.includes('leave') ||
    message.includes('graduated')
  ) {
    return 'NOT_ELIGIBLE'
  }

  return 'INTERNAL_ERROR'
}

async function getExamDeliveryMetadata(examId: string) {
  const cached = examDeliveryMetadataCache.get(examId)
  if (cached && cached.expiresAtMs > Date.now()) {
    return cached.promise
  }

  const promise = (async () => {
    const exam = await prisma.exam.findUnique({
      where: { id: examId },
      include: {
        translations: true,
        questions: {
          include: {
            question: {
              include: {
                translations: true,
                options: {
                  include: {
                    translations: true,
                  },
                },
              },
            },
          },
        },
      },
    })

    if (!exam) {
      throw new Error('Exam not found')
    }

    requireTranslation('exam', exam.translations, exam.languageId)

    for (const entry of exam.questions) {
      requireTranslation('question', entry.question.translations, exam.languageId)
      for (const option of entry.question.options) {
        requireTranslation('question option', option.translations, exam.languageId)
      }
    }

    const completeness = validateExamPublication(exam, exam.languageId)
    if (!completeness.canPublish) {
      throw new Error('Exam translations are incomplete for student delivery')
    }

    return {
      examId: exam.id,
      startTime: exam.startTime,
      endTime: exam.endTime,
      duration: exam.duration,
      allowRetake: exam.allowRetake,
      status: exam.status,
    }
  })().catch((error) => {
    examDeliveryMetadataCache.delete(examId)
    throw error
  })

  examDeliveryMetadataCache.set(examId, {
    expiresAtMs: Date.now() + EXAM_DELIVERY_CACHE_TTL_MS,
    promise,
  })

  return promise
}

async function getExamSessionMetadata(examId: string) {
  const cached = examSessionCache.get(examId)
  if (cached && cached.expiresAtMs > Date.now()) {
    return cached.promise
  }

  const promise = prisma.examSession
    .findUnique({
      where: { examId },
      select: {
        examId: true,
        startedAt: true,
        isPaused: true,
        pausedAt: true,
        timerOffset: true,
      },
    })
    .catch((error) => {
      examSessionCache.delete(examId)
      throw error
    })

  examSessionCache.set(examId, {
    expiresAtMs: Date.now() + EXAM_SESSION_CACHE_TTL_MS,
    promise,
  })

  return promise
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string) {
  let timer: ReturnType<typeof setTimeout> | null = null

  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(message)), timeoutMs)
      }),
    ])
  } finally {
    if (timer) {
      clearTimeout(timer)
    }
  }
}

async function withJoinAccessSlot<T>(fn: () => Promise<T>) {
  if (activeJoinAccessCount >= JOIN_ACCESS_CONCURRENCY) {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        const index = pendingJoinAccessResolvers.indexOf(release)
        if (index >= 0) {
          pendingJoinAccessResolvers.splice(index, 1)
        }
        reject(new Error('Join queue timed out'))
      }, JOIN_ACCESS_QUEUE_TIMEOUT_MS)

      const release = () => {
        clearTimeout(timer)
        resolve()
      }

      pendingJoinAccessResolvers.push(release)
    })
  }

  activeJoinAccessCount += 1

  try {
    return await fn()
  } finally {
    activeJoinAccessCount = Math.max(0, activeJoinAccessCount - 1)
    pendingJoinAccessResolvers.shift()?.()
  }
}

function formatViolationLabel(type: SecurityViolationType) {
  if (type === 'TAB_SWITCH') return 'tab switch'
  if (type === 'COPY') return 'copy action'
  if (type === 'SCREENSHOT') return 'screenshot attempt'
  return 'developer tools'
}

function toStudentSnapshot(snapshot: NonNullable<Awaited<ReturnType<typeof loadAttemptSnapshot>>>) {
  return {
    exam: {
      title: snapshot.exam.title,
      instructions: snapshot.exam.instructions,
      duration: snapshot.exam.duration,
      totalMarks: snapshot.exam.totalMarks,
      subject: snapshot.exam.subject,
    },
    questions: snapshot.questions.map((entry: (typeof snapshot.questions)[number]) => ({
      id: entry.id,
      examQuestionId: entry.examQuestionId,
      orderIndex: entry.orderIndex,
      marks: entry.marks,
      question: {
        id: entry.question.id,
        type: entry.question.type,
        text: entry.question.text,
        options: entry.question.options.map((option: (typeof entry.question.options)[number]) => ({
          id: option.id,
          text: option.text,
          orderIndex: option.orderIndex,
        })),
      },
    })),
  }
}

function getAttemptRemainingSeconds(
  examStartTime: Date,
  examEndTime: Date,
  durationMinutes: number,
  attemptStartedAt: Date | null
) {
  const now = Date.now()
  const examEndMs = examEndTime.getTime()
  const durationMs = durationMinutes * 60 * 1000
  const startedAtMs = attemptStartedAt?.getTime() ?? Math.max(now, examStartTime.getTime())
  const attemptEndMs = Math.min(startedAtMs + durationMs, examEndMs)

  return Math.max(0, Math.floor((attemptEndMs - now) / 1000))
}

function resolveExamClock(input: {
  examStartTime: Date
  durationMinutes: number
  timerOffsetSeconds: number
  isPaused: boolean
  pausedAt: Date | null
}) {
  const scheduledEndMs =
    input.examStartTime.getTime() +
    input.durationMinutes * 60 * 1000 +
    input.timerOffsetSeconds * 1000

  const nowMs = Date.now()
  const referenceNowMs = input.isPaused && input.pausedAt ? input.pausedAt.getTime() : nowMs
  const remainingMs = Math.max(0, scheduledEndMs - referenceNowMs)
  const elapsedMs = Math.max(
    0,
    referenceNowMs - input.examStartTime.getTime() - input.timerOffsetSeconds * 1000
  )

  return {
    remainingSeconds: Math.floor(remainingMs / 1000),
    elapsedSeconds: Math.floor(elapsedMs / 1000),
  }
}

async function getAnswerStateForAttempt(attemptId: string) {
  const runtimeStore = await getRuntimeStore()
  const runtimeAnswers = await runtimeStore.listAnswerState(attemptId)

  if (runtimeAnswers.length > 0) {
    return runtimeAnswers.map((entry) => ({
      questionId: entry.questionId,
      selectedOption: entry.selectedOption,
      answerText: entry.answerText,
      savedAtMs: entry.serverSavedAtMs,
    }))
  }

  const dbAnswers = await prisma.studentAnswer.findMany({
    where: { attemptId },
    orderBy: { updatedAt: 'asc' },
  })

  return dbAnswers.map((entry) => ({
    questionId: entry.questionId,
    selectedOption: entry.selectedOption,
    answerText: entry.answerText,
    savedAtMs: entry.updatedAt.getTime(),
  }))
}

async function syncAttemptRuntimeState(input: {
  attemptId: string
  examId: string
  userId: string
  studentId: string
  socketId: string | null
  status: AttemptStatus
  lastHeartbeatAtMs?: number | null
  lastSavedAtMs?: number | null
  reconnectToken?: string
}) {
  const runtimeStore = await getRuntimeStore()
  const existing = await runtimeStore.getAttemptState(input.attemptId)
  const state = {
    attemptId: input.attemptId,
    examId: input.examId,
    userId: input.userId,
    studentId: input.studentId,
    status: input.status,
    socketId: input.socketId,
    joinedAtMs: existing?.joinedAtMs ?? Date.now(),
    updatedAtMs: Date.now(),
    lastHeartbeatAtMs: input.lastHeartbeatAtMs ?? existing?.lastHeartbeatAtMs ?? null,
    lastSavedAtMs: input.lastSavedAtMs ?? existing?.lastSavedAtMs ?? null,
    reconnectToken: input.reconnectToken ?? existing?.reconnectToken ?? randomUUID(),
  }

  await runtimeStore.setAttemptState(input.attemptId, state)
  return state
}

async function syncPresenceState(input: {
  examId: string
  userId: string
  studentId: string
  studentName: string
  socketId: string | null
  online: boolean
  submitted: boolean
  submittedAtMs?: number | null
  attemptStatus?: AttemptStatus | null
  warnings: number
  tabSwitches: number
  reconnects: number
  lastViolation?: string | null
  lastHeartbeatAtMs?: number | null
}) {
  const runtimeStore = await getRuntimeStore()
  await runtimeStore.setPresence(input.examId, input.userId, {
    examId: input.examId,
    userId: input.userId,
    studentId: input.studentId,
    studentName: input.studentName,
    socketId: input.socketId,
    online: input.online,
    submitted: input.submitted,
    submittedAtMs: input.submittedAtMs ?? null,
    attemptStatus: input.attemptStatus ?? null,
    warnings: input.warnings,
    tabSwitches: input.tabSwitches,
    reconnects: input.reconnects,
    lastViolation: input.lastViolation ?? null,
    lastHeartbeatAtMs: input.lastHeartbeatAtMs ?? null,
    updatedAtMs: Date.now(),
  })
}

async function emitMonitorSnapshot(examId: string, teacherSocket?: AuthenticatedSocket) {
  if (!io && !teacherSocket) {
    return
  }

  const runtimeStore = await getRuntimeStore()
  const [presence, exam, session, examState] = await Promise.all([
    runtimeStore.listPresence(examId),
    prisma.exam.findUnique({
      where: { id: examId },
      select: { id: true, startTime: true, duration: true, status: true },
    }),
    getExamSessionMetadata(examId),
    runtimeStore.getExamState(examId),
  ])

  const students = presence.map((entry) => ({
    userId: entry.userId,
    studentId: entry.studentId,
    socketId: entry.socketId,
    studentName: entry.studentName,
    online:
      entry.online &&
      !!entry.lastHeartbeatAtMs &&
      Date.now() - entry.lastHeartbeatAtMs < HEARTBEAT_STALE_MS,
    submitted: entry.submitted,
    submittedAtMs: entry.submittedAtMs,
    attemptStatus: entry.attemptStatus,
    warnings: entry.warnings,
    tabSwitches: entry.tabSwitches,
    reconnects: entry.reconnects,
    lastViolation: entry.lastViolation,
    lastHeartbeatAtMs: entry.lastHeartbeatAtMs,
  }))

  const remainingSeconds =
    exam && session
      ? resolveExamClock({
          examStartTime: exam.startTime,
          durationMinutes: exam.duration,
          timerOffsetSeconds: session.timerOffset,
          isPaused: session.isPaused,
          pausedAt: session.pausedAt,
        }).remainingSeconds
      : null

  const payload = {
    examId,
    students,
    runtime: {
      mode: runtimeStore.mode,
      leader: (await runtimeStore.acquireLock(`timer:${examId}`, LEADER_LOCK_TTL_MS)) || false,
      status: examState?.status ?? 'idle',
      remainingSeconds,
    },
  } as const

  if (teacherSocket) {
    teacherSocket.emit('exam:monitor_snapshot', payload)
    return
  }

  io.to(`teacher:${examId}`).emit('exam:monitor_snapshot', payload)
}

async function ensureLeaderTimer(examId: string) {
  if (examIntervals.has(examId)) {
    return
  }

  examIntervals.set(
    examId,
    setInterval(async () => {
      try {
        if (isSocketServerClosing) {
          return
        }

        const runtimeStore = await getRuntimeStore()
        const isLeader = await runtimeStore.acquireLock(`timer:${examId}`, LEADER_LOCK_TTL_MS)
        if (!isLeader) {
          return
        }

        const [exam, session] = await Promise.all([
          prisma.exam.findUnique({
            where: { id: examId },
            select: { id: true, startTime: true, endTime: true, duration: true, status: true },
          }),
          getExamSessionMetadata(examId),
        ])

        if (!exam || !session || exam.status === 'COMPLETED' || exam.status === 'RESULT_PUBLISHED') {
          clearExamInterval(examId)
          return
        }

        const clock = resolveExamClock({
          examStartTime: exam.startTime,
          durationMinutes: exam.duration,
          timerOffsetSeconds: session.timerOffset,
          isPaused: session.isPaused,
          pausedAt: session.pausedAt,
        })

        io.to(`teacher:${examId}`).emit('exam:timer_update', {
          examId,
          remaining: clock.remainingSeconds,
          elapsed: clock.elapsedSeconds,
        })

        const inProgressAttempts = await prisma.studentExamAttempt.findMany({
          where: { examId, status: 'IN_PROGRESS' },
          select: {
            id: true,
            startedAt: true,
            student: {
              select: {
                userId: true,
              },
            },
          },
        })

        for (const attempt of inProgressAttempts) {
          const attemptRemaining = getAttemptRemainingSeconds(
            exam.startTime,
            exam.endTime,
            exam.duration,
            attempt.startedAt
          )

          io.to(`student:${attempt.student.userId}`).emit('exam:timer_update', {
            examId,
            remaining: attemptRemaining,
            elapsed: Math.max(0, exam.duration * 60 - attemptRemaining),
          })
        }

        if (clock.remainingSeconds <= 0 && !session.isPaused) {
          await autoEndExam(examId)
        }
      } catch (error) {
        console.error('[Socket] leader timer tick error:', error)
      }
    }, 1000)
  )
}

function clearExamInterval(examId: string) {
  const interval = examIntervals.get(examId)
  if (interval) {
    clearInterval(interval)
    examIntervals.delete(examId)
  }
}

async function submitStudentAttempt(
  attemptId: string,
  userId: string,
  status: 'SUBMITTED' | 'AUTO_SUBMITTED'
) {
  const runtimeStore = await getRuntimeStore()
  const locked = await runtimeStore.acquireLock(`submit:${attemptId}`, 5000)
  if (!locked) {
    const startedAt = Date.now()
    while (Date.now() - startedAt < 2000) {
      const existing = await prisma.studentExamAttempt.findUnique({
        where: { id: attemptId },
        include: { student: { include: { user: true } } },
      })

      if (!existing) {
        return null
      }

      if (existing.student.userId !== userId) {
        throw new Error('Unauthorized')
      }

      if (existing.status === 'SUBMITTED' || existing.status === 'AUTO_SUBMITTED') {
        return existing
      }

      await new Promise((resolve) => setTimeout(resolve, 50))
    }

    throw new Error('Submit lock timed out')
  }

  try {
    const existing = await prisma.studentExamAttempt.findUnique({
      where: { id: attemptId },
      select: {
        id: true,
        examId: true,
        studentId: true,
        socketId: true,
        status: true,
        startedAt: true,
        submittedAt: true,
        warningCount: true,
        tabSwitchCount: true,
        reconnectCount: true,
        student: {
          select: {
            userId: true,
            user: {
              select: {
                name: true,
              },
            },
          },
        },
      },
    })

    if (!existing) {
      return null
    }

    if (existing.student.userId !== userId) {
      throw new Error('Unauthorized')
    }

    if (existing.status === 'SUBMITTED' || existing.status === 'AUTO_SUBMITTED') {
      invalidateStudentExamAccessContextCache(userId, existing.examId)
      await syncAttemptRuntimeState({
        attemptId,
        examId: existing.examId,
        userId,
        studentId: existing.studentId,
        socketId: existing.socketId,
        status: existing.status,
      })

      await syncPresenceState({
        examId: existing.examId,
        userId,
        studentId: existing.studentId,
        studentName: existing.student.user.name,
        socketId: existing.socketId,
        online: existing.status !== 'AUTO_SUBMITTED',
        submitted: true,
        submittedAtMs: existing.submittedAt?.getTime() ?? Date.now(),
        attemptStatus: existing.status,
        warnings: existing.warningCount,
        tabSwitches: existing.tabSwitchCount,
        reconnects: existing.reconnectCount,
      })

      return existing
    }

    const submittedAt = new Date()
    const timeSpent = existing.startedAt
      ? Math.floor((submittedAt.getTime() - existing.startedAt.getTime()) / 1000)
      : 0

    const updated = await prisma.studentExamAttempt.updateMany({
      where: {
        id: attemptId,
        studentId: existing.studentId,
        status: {
          notIn: ['SUBMITTED', 'AUTO_SUBMITTED'],
        },
      },
      data: {
        status,
        submittedAt,
        timeSpent,
      },
    })

    const attempt = await prisma.studentExamAttempt.findUnique({
      where: { id: attemptId },
      include: { student: { include: { user: true } } },
    })

    if (!attempt) {
      return null
    }

    await syncAttemptRuntimeState({
      attemptId,
      examId: attempt.examId,
      userId,
      studentId: attempt.studentId,
      socketId: attempt.socketId,
      status: attempt.status,
    })

    await syncPresenceState({
      examId: attempt.examId,
      userId,
      studentId: attempt.studentId,
      studentName: attempt.student.user.name,
      socketId: attempt.socketId,
      online: status !== 'AUTO_SUBMITTED',
      submitted: true,
      submittedAtMs: attempt.submittedAt?.getTime() ?? Date.now(),
      attemptStatus: attempt.status,
      warnings: attempt.warningCount,
      tabSwitches: attempt.tabSwitchCount,
      reconnects: attempt.reconnectCount,
    })
    invalidateStudentExamAccessContextCache(userId, attempt.examId)

    if (updated.count > 0) {
      calculateResult(attemptId).catch((err) =>
        console.error('[ResultEngine] Error calculating result:', err)
      )

      void prisma.activityLog
        .create({
          data: {
            userId,
            action: status === 'AUTO_SUBMITTED' ? 'AUTO_SUBMIT' : 'MANUAL_SUBMIT',
            examId: attempt.examId,
          },
        })
        .catch((error) => {
          console.error('[Socket] submit activity log error:', error)
        })

      setImmediate(() => {
        if (!io) {
          return
        }

        io.to(`teacher:${attempt.examId}`).emit('exam:student_submitted', {
          examId: attempt.examId,
          attemptId,
          studentId: attempt.studentId,
          userId,
          status,
        })
      })
    }

    void emitMonitorSnapshot(attempt.examId).catch((error) => {
      console.error('[Socket] submit monitor broadcast error:', error)
    })

    return attempt
  } finally {
    await runtimeStore.releaseLock(`submit:${attemptId}`)
  }
}

async function autoEndExam(examId: string) {
  const runtimeStore = await getRuntimeStore()
  const locked = await runtimeStore.acquireLock(`auto-end:${examId}`, 5000)
  if (!locked) {
    return
  }

  try {
    clearExamInterval(examId)
    invalidateExamAccessCaches(examId)

    await prisma.exam.update({ where: { id: examId }, data: { status: 'COMPLETED' } })
    await prisma.examSession.upsert({
      where: { examId },
      create: { examId, endedAt: new Date() },
      update: { endedAt: new Date(), isPaused: false, pausedAt: null },
    })
    examSessionCache.delete(examId)

    await runtimeStore.setExamState(examId, {
      examId,
      status: 'ended',
      startedAtMs: null,
      pausedAtMs: null,
      timerOffsetMs: 0,
      durationMs: 0,
      updatedAtMs: Date.now(),
    })

    io.to(`exam:${examId}`).emit('exam:ended', { examId })

    const pendingAttempts = await prisma.studentExamAttempt.findMany({
      where: { examId, status: 'IN_PROGRESS' },
      include: { student: { include: { user: true } } },
    })

    for (const attempt of pendingAttempts) {
      await submitStudentAttempt(attempt.id, attempt.student.userId, 'AUTO_SUBMITTED')
      io.to(`student:${attempt.student.userId}`).emit('exam:auto_submitted', {
        examId,
        attemptId: attempt.id,
      })
    }

    await emitMonitorSnapshot(examId)
  } finally {
    await runtimeStore.releaseLock(`auto-end:${examId}`)
  }
}

async function handleStudentDisconnect(socket: AuthenticatedSocket, userId: string, examId: string) {
  await prisma.activityLog.create({
    data: {
      userId,
      action: 'DISCONNECT',
      examId,
      details: JSON.stringify({ socketId: socket.id }),
    },
  })

  const runtimeStore = await getRuntimeStore()
  const presence = await runtimeStore.getPresence(examId, userId)
  if (presence) {
    await syncPresenceState({
      examId,
      userId,
      studentId: presence.studentId,
      studentName: presence.studentName,
      socketId: null,
      online: false,
      submitted: presence.submitted,
      warnings: presence.warnings,
      tabSwitches: presence.tabSwitches,
      reconnects: presence.reconnects,
      lastViolation: 'DISCONNECT',
      lastHeartbeatAtMs: presence.lastHeartbeatAtMs,
      submittedAtMs: presence.submittedAtMs,
      attemptStatus: presence.attemptStatus as AttemptStatus | null,
    })

    io.to(`teacher:${examId}`).emit('exam:student_offline', {
      examId,
      userId,
      socketId: socket.id,
    })
    await emitMonitorSnapshot(examId)
  }
}

async function registerSecurityViolation(
  attemptId: string,
  userId: string,
  type: SecurityViolationType
) {
  const attempt = await prisma.studentExamAttempt.findUnique({
    where: { id: attemptId },
    include: { student: { include: { user: { select: { name: true } } } } },
  })

  if (!attempt) return
  if (attempt.student.userId !== userId) return
  if (attempt.status === 'SUBMITTED' || attempt.status === 'AUTO_SUBMITTED') return

  const updateData: Prisma.StudentExamAttemptUpdateInput = {
    warningCount: { increment: 1 },
  }

  if (type === 'TAB_SWITCH') {
    updateData.tabSwitchCount = { increment: 1 }
  }

  const updatedAttempt = await prisma.studentExamAttempt.update({
    where: { id: attemptId },
    data: updateData,
  })

  const countForType =
    type === 'TAB_SWITCH' ? updatedAttempt.tabSwitchCount : updatedAttempt.warningCount
  const warningCount = updatedAttempt.warningCount
  const remainingWarnings = Math.max(0, MAX_SECURITY_WARNINGS - warningCount)

  await prisma.activityLog.create({
    data: {
      userId,
      action: type,
      examId: attempt.examId,
      details: JSON.stringify({
        attemptId,
        warningCount,
        remainingWarnings,
        typeCount: countForType,
      }),
    },
  })

  await syncPresenceState({
    examId: attempt.examId,
    userId,
    studentId: attempt.studentId,
    studentName: attempt.student.user.name,
    socketId: updatedAttempt.socketId,
    online: true,
    submitted: false,
    submittedAtMs: null,
    attemptStatus: updatedAttempt.status,
    warnings: warningCount,
    tabSwitches: updatedAttempt.tabSwitchCount,
    reconnects: updatedAttempt.reconnectCount,
    lastViolation: type,
    lastHeartbeatAtMs: Date.now(),
  })

  io.to(`student:${userId}`).emit('exam:warning_issued', {
    examId: attempt.examId,
    attemptId,
    type,
    warningCount,
    maxWarnings: MAX_SECURITY_WARNINGS,
    message:
      warningCount >= MAX_SECURITY_WARNINGS
        ? 'Warning limit reached. Your exam is being auto-submitted.'
        : `Warning ${warningCount}/${MAX_SECURITY_WARNINGS}: ${formatViolationLabel(type)} detected.`,
  })

  io.to(`teacher:${attempt.examId}`).emit('exam:suspicious_activity', {
    studentId: attempt.studentId,
    studentName: attempt.student.user.name,
    type,
    count: countForType,
    warningCount,
  })

  await emitMonitorSnapshot(attempt.examId)

  if (warningCount >= MAX_SECURITY_WARNINGS) {
    await prisma.activityLog.create({
      data: {
        userId,
        action: 'AUTO_TERMINATE_WARNINGS',
        examId: attempt.examId,
        details: JSON.stringify({
          attemptId,
          warningCount,
          reason: type,
        }),
      },
    })

    await submitStudentAttempt(attemptId, userId, 'AUTO_SUBMITTED')
    io.to(`student:${userId}`).emit('exam:auto_submitted', {
      examId: attempt.examId,
      attemptId,
    })
  }
}

export async function initSocketServer(httpServer: HttpServer) {
  if (io) {
    return io
  }

  isSocketServerClosing = false

  io = new SocketServer(httpServer, {
    cors: {
      origin: process.env.NEXTAUTH_URL || 'http://localhost:3000',
      methods: ['GET', 'POST'],
      credentials: true,
    },
    transports: ['websocket', 'polling'],
  })

  const runtimeStore = await getRuntimeStore()
  await runtimeStore.configureSocketAdapter(io)
  console.info(
    `[Phase6] Socket runtime initialized in ${runtimeStore.mode} mode (instance=${runtimeStore.instanceId})`
  )

  io.use(async (socket: AuthenticatedSocket, next) => {
    const startedAt = Date.now()
    try {
      const token = socket.handshake.auth.token
      if (!token) return next(new Error('No auth token'))

      const secret = new TextEncoder().encode(getAuthSecret())
      const { payload } = await jose.jwtVerify(token, secret)

      socket.data.userId = typeof payload.id === 'string' ? payload.id : ''
      socket.data.userRole = typeof payload.role === 'string' ? payload.role : ''
      socket.data.userName = typeof payload.name === 'string' ? payload.name : 'Unknown User'

      logJoinTiming({
        requestId: randomUUID(),
        socketId: socket.id,
        studentId: typeof payload.id === 'string' ? payload.id : null,
        examId: 'socket-auth',
        stage: 'socket_authentication',
        durationMs: Date.now() - startedAt,
      })

      next()
    } catch (error) {
      logJoinTiming({
        requestId: randomUUID(),
        socketId: socket.id,
        studentId: null,
        examId: 'socket-auth',
        stage: 'socket_authentication',
        durationMs: Date.now() - startedAt,
        errorCode: error instanceof Error ? error.message : String(error),
      })
      next(new Error('Invalid token'))
    }
  })

  io.on('connection', (socket: AuthenticatedSocket) => {
    const { userId, userRole, userName } = getSocketAuth(socket)

    console.log(`[Socket] Connected: ${userId} (${userRole}) - ${socket.id}`)

    socket.on('teacher:start_exam', async (data: { examId: string }) => {
      try {
        if (userRole !== 'TEACHER') return socket.emit('error', { message: 'Unauthorized' })

        const exam = await prisma.exam.findUnique({
          where: { id: data.examId },
          select: { id: true, duration: true, startTime: true, status: true },
        })
        if (!exam) return socket.emit('error', { message: 'Exam not found' })
        if (!(await canTeacherAccessExam(userId, data.examId))) {
          return socket.emit('error', { message: 'Not allowed for this exam' })
        }
        await assertStudentExamTranslations(data.examId)

        const existingSession = await getExamSessionMetadata(data.examId)

        let timerOffset = existingSession?.timerOffset ?? 0
        const now = new Date()
        if (existingSession?.isPaused && existingSession.pausedAt) {
          timerOffset += Math.floor((now.getTime() - existingSession.pausedAt.getTime()) / 1000)
        }

        await prisma.exam.update({
          where: { id: data.examId },
          data: { status: 'LIVE' },
        })
        invalidateExamAccessCaches(data.examId)

        await prisma.examSession.upsert({
          where: { examId: data.examId },
          create: {
            examId: data.examId,
            startedAt: exam.startTime,
            endedAt: null,
            timerOffset,
            isPaused: false,
            pausedAt: null,
          },
          update: {
            startedAt: existingSession?.startedAt ?? exam.startTime,
            endedAt: null,
            timerOffset,
            isPaused: false,
            pausedAt: null,
          },
        })
        examSessionCache.set(data.examId, {
          expiresAtMs: Date.now() + EXAM_SESSION_CACHE_TTL_MS,
          promise: Promise.resolve({
            examId: data.examId,
            startedAt: existingSession?.startedAt ?? exam.startTime,
            isPaused: false,
            pausedAt: null,
            timerOffset,
          }),
        })

        const runtimeStore = await getRuntimeStore()
        await runtimeStore.setExamState(data.examId, {
          examId: data.examId,
          status: 'live',
          startedAtMs: exam.startTime.getTime(),
          pausedAtMs: null,
          timerOffsetMs: timerOffset * 1000,
          durationMs: exam.duration * 60 * 1000,
          updatedAtMs: Date.now(),
        })

        socket.join(`exam:${data.examId}`)
        socket.join(`teacher:${data.examId}`)

        io.to(`exam:${data.examId}`).emit('exam:started', {
          examId: data.examId,
          startedAt: exam.startTime.getTime(),
          durationMs: exam.duration * 60 * 1000,
        })
        void Promise.all([ensureLeaderTimer(data.examId), emitMonitorSnapshot(data.examId)]).catch(
          (error) => {
            console.error('[Socket] teacher:start_exam post-ack sync error:', error)
          }
        )
      } catch (err) {
        console.error('[Socket] teacher:start_exam error:', err)
        socket.emit('error', { message: 'Failed to start exam' })
      }
    })

    socket.on('teacher:join_exam_monitor', async (data: { examId: string }) => {
      try {
        if (userRole !== 'TEACHER') return socket.emit('error', { message: 'Unauthorized' })

        const exam = await prisma.exam.findUnique({
          where: { id: data.examId },
        })
        if (!exam) return socket.emit('error', { message: 'Exam not found' })
        if (!(await canTeacherAccessExam(userId, data.examId))) {
          return socket.emit('error', { message: 'Not allowed for this exam' })
        }

        socket.join(`exam:${data.examId}`)
        socket.join(`teacher:${data.examId}`)
        await ensureLeaderTimer(data.examId)
        await emitMonitorSnapshot(data.examId, socket)
      } catch (err) {
        console.error('[Socket] teacher:join_exam_monitor error:', err)
        socket.emit('error', { message: 'Failed to join exam monitor' })
      }
    })

    socket.on('teacher:pause_exam', async (data: { examId: string }) => {
      try {
        if (userRole !== 'TEACHER') return
        if (!(await canTeacherAccessExam(userId, data.examId))) {
          return socket.emit('error', { message: 'Not allowed for this exam' })
        }

        const session = await getExamSessionMetadata(data.examId)
        const exam = await prisma.exam.findUnique({
          where: { id: data.examId },
          select: { startTime: true, duration: true },
        })

        if (!session || !exam || session.isPaused) {
          return
        }

        const pausedAt = new Date()
        const remainingSeconds = resolveExamClock({
          examStartTime: exam.startTime,
          durationMinutes: exam.duration,
          timerOffsetSeconds: session.timerOffset,
          isPaused: true,
          pausedAt,
        }).remainingSeconds

        await prisma.examSession.update({
          where: { examId: data.examId },
          data: { isPaused: true, pausedAt },
        })
        invalidateExamAccessCaches(data.examId)
        examSessionCache.set(data.examId, {
          expiresAtMs: Date.now() + EXAM_SESSION_CACHE_TTL_MS,
          promise: Promise.resolve({
            examId: data.examId,
            startedAt: session.startedAt,
            isPaused: true,
            pausedAt,
            timerOffset: session.timerOffset,
          }),
        })

        const runtimeStore = await getRuntimeStore()
        await runtimeStore.setExamState(data.examId, {
          examId: data.examId,
          status: 'paused',
          startedAtMs: exam.startTime.getTime(),
          pausedAtMs: pausedAt.getTime(),
          timerOffsetMs: session.timerOffset * 1000,
          durationMs: exam.duration * 60 * 1000,
          updatedAtMs: Date.now(),
        })

        io.to(`exam:${data.examId}`).emit('exam:paused', {
          examId: data.examId,
          remainingSeconds,
        })
        await emitMonitorSnapshot(data.examId)
      } catch (error) {
        console.error('[Socket] teacher:pause_exam error:', error)
      }
    })

    socket.on('teacher:end_exam', async (data: { examId: string }) => {
      try {
        if (userRole !== 'TEACHER') return
        if (!(await canTeacherAccessExam(userId, data.examId))) {
          return socket.emit('error', { message: 'Not allowed for this exam' })
        }
        await autoEndExam(data.examId)
      } catch (err) {
        console.error('[Socket] teacher:end_exam error:', err)
      }
    })

    socket.on('teacher:publish_result', async (data: { examId: string; attemptId: string }) => {
      try {
        if (userRole !== 'TEACHER') return
        if (!(await canTeacherAccessExam(userId, data.examId))) {
          return socket.emit('error', { message: 'Not allowed for this exam' })
        }

        const { publishResult } = await import('../lib/result-engine')
        const attempt = await prisma.studentExamAttempt.findUnique({
          where: { id: data.attemptId },
          include: { student: true },
        })
        if (!attempt) return

        await publishResult(data.attemptId, data.examId, attempt.studentId)
        io.to(`student:${attempt.student.userId}`).emit('result:published', {
          examId: data.examId,
          attemptId: data.attemptId,
        })

        socket.emit('notification:new', { message: 'Result published successfully' })
      } catch (err) {
        console.error('[Socket] teacher:publish_result error:', err)
      }
    })

    socket.on(
      'teacher:review_answer',
      async (data: { answerId: string; marks: number; feedback: string }) => {
        try {
          if (userRole !== 'TEACHER') return

          const answer = await prisma.studentAnswer.findUnique({
            where: { id: data.answerId },
            select: {
              attempt: {
                select: {
                  examId: true,
                },
              },
            },
          })
          if (!answer) {
            return socket.emit('error', { message: 'Answer not found' })
          }
          if (!(await canTeacherAccessExam(userId, answer.attempt.examId))) {
            return socket.emit('error', { message: 'Not allowed for this exam' })
          }

          await prisma.studentAnswer.update({
            where: { id: data.answerId },
            data: {
              teacherMarks: data.marks,
              teacherFeedback: data.feedback,
              checkStatus: 'TEACHER_CHECKED',
            },
          })

          socket.emit('exam:answer_saved', { answerId: data.answerId, saved: true })
        } catch (err) {
          console.error('[Socket] teacher:review_answer error:', err)
        }
      }
    )

    socket.on('student:join_exam', async (data: { examId: string }) => {
      const requestId = randomUUID()
      const joinTimingContext = {
        requestId,
        socketId: socket.id,
        studentId: null as string | null,
        examId: data.examId,
      }

      try {
        if (userRole !== 'STUDENT') {
          emitSocketError(socket, 'UNAUTHORIZED', 'Unauthorized')
          return
        }

        // Shared access-context evaluation remains the server-side studentCanAccessExam gate.
        const accessContext = await timeJoinStage(
          joinTimingContext,
          'access_context',
          async () =>
            withJoinAccessSlot(() =>
              withTimeout(
                getStudentExamAccessContext(userId, data.examId, {
                  onStage: ({ stage, durationMs, errorCode }) => {
                    logJoinTiming({
                      ...joinTimingContext,
                      stage,
                      durationMs,
                      errorCode,
                    })
                  },
                }),
                JOIN_RUNTIME_TIMEOUT_MS,
                'Join authorization timed out'
              )
            )
        )
        if (!accessContext.allowed || !accessContext.profile || !accessContext.exam) {
          emitSocketError(
            socket,
            classifyJoinError({ message: accessContext.reason || 'Access denied' }),
            accessContext.reason || 'Access denied'
          )
          return
        }

        socket.data.examAccessCache = {
          ...(socket.data.examAccessCache ?? {}),
          [data.examId]: accessContext,
        }

        joinTimingContext.studentId = accessContext.profile.id

        const exam = await timeJoinStage(
          joinTimingContext,
          'translation_metadata',
          async () => getExamDeliveryMetadata(data.examId)
        )

        let activeAttempt = accessContext.existingAttempt
        if (accessContext.existingAttempt) {
          activeAttempt = await timeJoinStage(
            joinTimingContext,
            'attempt_update',
            async () =>
              prisma.studentExamAttempt.update({
                where: { id: accessContext.existingAttempt!.id },
                data: { socketId: socket.id, reconnectCount: { increment: 1 } },
              })
          )

          socket.data.examAccessCache = {
            ...(socket.data.examAccessCache ?? {}),
            [data.examId]: {
              ...accessContext,
              existingAttempt: {
                id: activeAttempt.id,
                examId: activeAttempt.examId,
                studentId: activeAttempt.studentId,
                status: activeAttempt.status,
                startedAt: activeAttempt.startedAt,
                submittedAt: activeAttempt.submittedAt,
                warningCount: activeAttempt.warningCount,
                tabSwitchCount: activeAttempt.tabSwitchCount,
                reconnectCount: activeAttempt.reconnectCount,
                socketId: activeAttempt.socketId,
              },
            },
          }
        }

        await timeJoinStage(joinTimingContext, 'room_join', async () => {
          socket.join(`exam:${data.examId}`)
          socket.join(`student:${userId}`)
        })

        if (activeAttempt) {
          const attemptState = await timeJoinStage(joinTimingContext, 'runtime_restore', async () =>
            syncAttemptRuntimeState({
              attemptId: activeAttempt.id,
              examId: data.examId,
              userId,
              studentId: accessContext.profile!.id,
              socketId: socket.id,
              status: activeAttempt.status,
            })
          )

          await timeJoinStage(joinTimingContext, 'presence_update', async () =>
            syncPresenceState({
              examId: data.examId,
              userId,
              studentId: accessContext.profile!.id,
              studentName: userName,
              socketId: socket.id,
              online: true,
              submitted:
                activeAttempt.status === 'SUBMITTED' || activeAttempt.status === 'AUTO_SUBMITTED',
              submittedAtMs: activeAttempt.submittedAt?.getTime() ?? null,
              attemptStatus: activeAttempt.status,
              warnings: activeAttempt.warningCount,
              tabSwitches: activeAttempt.tabSwitchCount,
              reconnects: activeAttempt.reconnectCount,
              lastHeartbeatAtMs: Date.now(),
            })
          )

          const [snapshot, answers] = await timeJoinStage(
            joinTimingContext,
            'attempt_state_load',
            async () =>
              Promise.all([
                loadAttemptSnapshot(activeAttempt.id),
                getAnswerStateForAttempt(activeAttempt.id),
              ])
          )

          const remainingSeconds =
            activeAttempt.status === 'IN_PROGRESS'
              ? getAttemptRemainingSeconds(
                  exam.startTime,
                  exam.endTime,
                  exam.duration,
                  activeAttempt.startedAt
                )
              : null

          socket.emit('exam:attempt_state', {
            examId: data.examId,
            attemptId: activeAttempt.id,
            status: activeAttempt.status,
            remainingSeconds,
            reconnectToken: attemptState.reconnectToken,
            snapshot: snapshot ? toStudentSnapshot(snapshot) : undefined,
            answers,
            warningCount: activeAttempt.warningCount,
          })
        } else {
          await timeJoinStage(joinTimingContext, 'presence_update', async () =>
            syncPresenceState({
              examId: data.examId,
              userId,
              studentId: accessContext.profile!.id,
              studentName: userName,
              socketId: socket.id,
              online: true,
              submitted: false,
              submittedAtMs: null,
              attemptStatus: 'NOT_STARTED',
              warnings: 0,
              tabSwitches: 0,
              reconnects: 0,
              lastHeartbeatAtMs: Date.now(),
            })
          )
        }

        const session = await timeJoinStage(joinTimingContext, 'session_lookup', async () =>
          getExamSessionMetadata(data.examId)
        )
        if (session && (exam.status === 'LIVE' || session.isPaused)) {
          const remaining = activeAttempt?.status === 'IN_PROGRESS'
            ? getAttemptRemainingSeconds(
                exam.startTime,
                exam.endTime,
                exam.duration,
                activeAttempt.startedAt
              )
            : resolveExamClock({
                examStartTime: exam.startTime,
                durationMinutes: exam.duration,
                timerOffsetSeconds: session.timerOffset,
                isPaused: session.isPaused,
                pausedAt: session.pausedAt,
              }).remainingSeconds
          socket.emit('exam:timer_update', {
            examId: data.examId,
            remaining,
            elapsed: Math.max(0, exam.duration * 60 - remaining),
          })
        }

        logJoinTiming({
          ...joinTimingContext,
          stage: 'join_ack',
          durationMs: 0,
        })
        socket.emit('exam:joined', {
          examId: data.examId,
          attemptId: activeAttempt?.id,
          message: 'Joined exam successfully',
        })

        const reconnected = !!activeAttempt
        setImmediate(() => {
          io.to(`teacher:${data.examId}`).emit('exam:student_joined', {
            examId: data.examId,
            studentId: accessContext.profile!.id,
            userId,
            socketId: socket.id,
            studentName: userName,
            reconnected,
          })
        })

        if (reconnected && activeAttempt) {
          void prisma.activityLog
            .create({
              data: {
                userId,
                action: 'RECONNECT',
                examId: data.examId,
                details: JSON.stringify({ socketId: socket.id }),
              },
            })
            .catch((error) => {
              console.error('[Socket] student:join_exam reconnect activity log error:', error)
            })

          setImmediate(() => {
            io.to(`teacher:${data.examId}`).emit('exam:suspicious_activity', {
              studentId: accessContext.profile!.id,
              studentName: userName,
              type: 'RECONNECT',
              count: activeAttempt.reconnectCount,
              warningCount: activeAttempt.warningCount,
            })
          })
        }

        void timeJoinStage(joinTimingContext, 'monitor_broadcast', async () =>
          emitMonitorSnapshot(data.examId)
        ).catch((error) => {
          console.error('[Socket] student:join_exam monitor broadcast error:', error)
        })
      } catch (err) {
        console.error('[Socket] student:join_exam error:', err)
        const message = getSocketSafeErrorMessage(err, 'Failed to join exam')
        emitSocketError(socket, classifyJoinError({ message }), message)
      }
    })

    socket.on('student:start_attempt', async (data: { examId: string }) => {
      try {
        if (userRole !== 'STUDENT') return

        const cachedAccessContext = socket.data.examAccessCache?.[data.examId]
        const accessContext =
          cachedAccessContext && cachedAccessContext.allowed
            ? cachedAccessContext
            : await getStudentExamAccessContext(userId, data.examId)

        if (!accessContext.allowed || !accessContext.profile || !accessContext.exam) {
          const message = accessContext.reason ?? 'Access denied'
          return emitSocketError(socket, classifyJoinError({ message }), message)
        }

        socket.data.examAccessCache = {
          ...(socket.data.examAccessCache ?? {}),
          [data.examId]: accessContext,
        }

        const studentProfile = accessContext.profile
        const exam = accessContext.exam
        await assertStudentExamTranslations(data.examId)

        const now = new Date()
        if (now < exam.startTime) return socket.emit('error', { message: 'Exam has not started yet' })
        if (now > exam.endTime) return socket.emit('error', { message: 'Exam has ended' })
        if (exam.status !== 'SCHEDULED' && exam.status !== 'LIVE') {
          return socket.emit('error', { message: `Exam is ${exam.status.toLowerCase()}` })
        }

        const runtimeStore = await getRuntimeStore()
        const locked = await runtimeStore.acquireLock(`start:${data.examId}:${studentProfile.id}`, 5000)
        if (!locked) {
          return
        }

        try {
          const existingAttempt = await prisma.studentExamAttempt.findUnique({
            where: {
              examId_studentId: { examId: data.examId, studentId: studentProfile.id },
            },
          })

          if (
            existingAttempt &&
            (existingAttempt.status === 'SUBMITTED' || existingAttempt.status === 'AUTO_SUBMITTED') &&
            !exam.allowRetake
          ) {
            return socket.emit('error', { message: 'Exam already submitted' })
          }

          const remainingSecondsBeforeStart = getAttemptRemainingSeconds(
            exam.startTime,
            exam.endTime,
            exam.duration,
            existingAttempt?.startedAt ?? null
          )

          if (remainingSecondsBeforeStart <= 0) {
            if (existingAttempt) {
              await submitStudentAttempt(existingAttempt.id, userId, 'AUTO_SUBMITTED')
              socket.emit('exam:auto_submitted', { examId: data.examId, attemptId: existingAttempt.id })
            } else {
              socket.emit('error', { message: 'Exam time is over' })
            }
            return
          }

          if (exam.status === 'SCHEDULED') {
            await prisma.exam.update({
              where: { id: data.examId },
              data: { status: 'LIVE' },
            })
            invalidateExamAccessCaches(data.examId)
          }

          const attempt =
            existingAttempt?.status === 'IN_PROGRESS'
              ? await prisma.studentExamAttempt.update({
                  where: { id: existingAttempt.id },
                  data: { socketId: socket.id, status: 'IN_PROGRESS' },
                })
              : await prisma.studentExamAttempt.upsert({
                  where: {
                    examId_studentId: { examId: data.examId, studentId: studentProfile.id },
                  },
                  create: {
                    examId: data.examId,
                    studentId: studentProfile.id,
                    socketId: socket.id,
                    status: 'IN_PROGRESS',
                    startedAt: new Date(),
                    ipAddress: socket.handshake.address,
                    userAgent: socket.handshake.headers['user-agent'],
                  },
                  update: {
                    socketId: socket.id,
                    status: 'IN_PROGRESS',
                    startedAt: existingAttempt?.startedAt ?? new Date(),
                  },
                })

          socket.data.examAccessCache = {
            ...(socket.data.examAccessCache ?? {}),
            [data.examId]: {
              ...accessContext,
              existingAttempt: {
                id: attempt.id,
                examId: attempt.examId,
                studentId: attempt.studentId,
                status: attempt.status,
                startedAt: attempt.startedAt,
                submittedAt: attempt.submittedAt,
                warningCount: attempt.warningCount,
                tabSwitchCount: attempt.tabSwitchCount,
                reconnectCount: attempt.reconnectCount,
                socketId: attempt.socketId,
              },
            },
          }
          invalidateStudentExamAccessContextCache(userId, data.examId)

          const remainingSeconds = getAttemptRemainingSeconds(
            exam.startTime,
            exam.endTime,
            exam.duration,
            attempt.startedAt
          )

          if (remainingSeconds <= 0) {
            await submitStudentAttempt(attempt.id, userId, 'AUTO_SUBMITTED')
            socket.emit('exam:auto_submitted', { examId: data.examId, attemptId: attempt.id })
            return
          }

          const [snapshot, answers, attemptState] = await Promise.all([
            ensureAttemptSnapshot({
              attemptId: attempt.id,
              examId: data.examId,
              studentUserId: userId,
              studentId: studentProfile.id,
            }),
            getAnswerStateForAttempt(attempt.id),
            syncAttemptRuntimeState({
              attemptId: attempt.id,
              examId: data.examId,
              userId,
              studentId: studentProfile.id,
              socketId: socket.id,
              status: attempt.status,
            }),
          ])

          socket.emit('exam:attempt_started', {
            attemptId: attempt.id,
            remainingSeconds,
            snapshot: toStudentSnapshot(snapshot),
            answers,
            reconnectToken: attemptState.reconnectToken,
            resumed: !!existingAttempt,
          })

          void Promise.all([
            syncPresenceState({
              examId: data.examId,
              userId,
              studentId: studentProfile.id,
              studentName: userName,
              socketId: socket.id,
              online: true,
              submitted: false,
              submittedAtMs: null,
              attemptStatus: attempt.status,
              warnings: attempt.warningCount,
              tabSwitches: attempt.tabSwitchCount,
              reconnects: attempt.reconnectCount,
              lastHeartbeatAtMs: Date.now(),
            }),
            ensureLeaderTimer(data.examId),
          ])
            .then(() => emitMonitorSnapshot(data.examId))
            .catch((error) => {
              console.error('[Socket] student:start_attempt post-ack sync error:', error)
            })
        } finally {
          await runtimeStore.releaseLock(`start:${data.examId}:${studentProfile.id}`)
        }
      } catch (err) {
        console.error('[Socket] student:start_attempt error:', err)
        socket.emit('error', { message: getSocketSafeErrorMessage(err, 'Failed to start attempt') })
      }
    })

    socket.on(
      'student:save_answer',
      async (data: {
        attemptId: string
        questionId: string
        selectedOption?: string
        answerText?: string
        requestId?: string
        clientSavedAtMs?: number
      }) => {
        try {
          if (userRole !== 'STUDENT') return

          const attempt = await prisma.studentExamAttempt.findUnique({
            where: { id: data.attemptId },
            include: { student: true, exam: true },
          })

          if (!attempt) return socket.emit('error', { message: 'Attempt not found' })
          if (attempt.student.userId !== userId) {
            return socket.emit('error', { message: 'Not your attempt' })
          }
          if (attempt.status === 'SUBMITTED' || attempt.status === 'AUTO_SUBMITTED') {
            return socket.emit('error', { message: 'Exam already submitted' })
          }

          const snapshot = await loadAttemptSnapshot(data.attemptId)
          if (
            !snapshot ||
            !snapshot.questions.some(
              (entry: (typeof snapshot.questions)[number]) => entry.id === data.questionId
            )
          ) {
            return socket.emit('error', { message: 'Question does not belong to this attempt snapshot' })
          }

          const runtimeStore = await getRuntimeStore()
          const currentRuntimeAnswer = await runtimeStore.getAnswerState(data.attemptId, data.questionId)
          const incomingSavedAtMs = data.clientSavedAtMs ?? Date.now()

          if (currentRuntimeAnswer && incomingSavedAtMs < currentRuntimeAnswer.clientSavedAtMs) {
            return socket.emit('exam:answer_saved', {
              questionId: data.questionId,
              saved: true,
            })
          }

          await prisma.studentAnswer.upsert({
            where: {
              attemptId_questionId: {
                attemptId: data.attemptId,
                questionId: data.questionId,
              },
            },
            create: {
              attemptId: data.attemptId,
              questionId: data.questionId,
              selectedOption: data.selectedOption ?? null,
              answerText: data.answerText ?? null,
            },
            update: {
              selectedOption: data.selectedOption ?? null,
              answerText: data.answerText ?? null,
              savedAt: new Date(),
            },
          })

          const requestId = data.requestId ?? randomUUID()
          const serverSavedAtMs = Date.now()
          await runtimeStore.setAnswerState(data.attemptId, data.questionId, {
            attemptId: data.attemptId,
            questionId: data.questionId,
            selectedOption: data.selectedOption ?? null,
            answerText: data.answerText ?? null,
            clientSavedAtMs: incomingSavedAtMs,
            serverSavedAtMs,
            requestId,
          })

          await syncAttemptRuntimeState({
            attemptId: data.attemptId,
            examId: attempt.examId,
            userId,
            studentId: attempt.studentId,
            socketId: attempt.socketId,
            status: attempt.status,
            lastHeartbeatAtMs: Date.now(),
            lastSavedAtMs: serverSavedAtMs,
          })

          socket.emit('exam:answer_saved', {
            questionId: data.questionId,
            saved: true,
          })
        } catch (err) {
          console.error('[Socket] student:save_answer error:', err)
          socket.emit('exam:answer_saved', { questionId: data.questionId, saved: false })
        }
      }
    )

    socket.on('student:submit_exam', async (data: { attemptId: string }) => {
      try {
        if (userRole !== 'STUDENT') return
        const attempt = await submitStudentAttempt(data.attemptId, userId, 'SUBMITTED')
        socket.emit('exam:submitted', { attemptId: data.attemptId, success: !!attempt })
      } catch (err) {
        console.error('[Socket] student:submit_exam error:', err)
        const message = getSocketSafeErrorMessage(err, 'Submission failed')
        emitSocketError(
          socket,
          message.toLowerCase().includes('lock') ? 'LOCK_TIMEOUT' : classifyJoinError({ message }),
          message
        )
      }
    })

    socket.on(
      'student:heartbeat',
      async (data: {
        examId: string
        attemptId: string
        pendingQueueSize: number
        reconnectToken?: string
      }) => {
        try {
          if (userRole !== 'STUDENT') return

          const attempt = await prisma.studentExamAttempt.findUnique({
            where: { id: data.attemptId },
            include: { student: { include: { user: { select: { name: true } } } } },
          })

          if (!attempt || attempt.student.userId !== userId) {
            return
          }

          const runtimeStore = await getRuntimeStore()
          const existingRuntime = await runtimeStore.getAttemptState(data.attemptId)
          if (
            data.reconnectToken &&
            existingRuntime?.reconnectToken &&
            data.reconnectToken !== existingRuntime.reconnectToken
          ) {
            return socket.emit('error', { message: 'Reconnect token mismatch' })
          }

          const heartbeatAtMs = Date.now()
          await syncAttemptRuntimeState({
            attemptId: data.attemptId,
            examId: data.examId,
            userId,
            studentId: attempt.studentId,
            socketId: socket.id,
            status: attempt.status,
            lastHeartbeatAtMs: heartbeatAtMs,
          })

          await syncPresenceState({
            examId: data.examId,
            userId,
            studentId: attempt.studentId,
            studentName: attempt.student.user.name,
            socketId: socket.id,
            online: true,
            submitted:
              attempt.status === 'SUBMITTED' || attempt.status === 'AUTO_SUBMITTED',
            submittedAtMs: attempt.submittedAt?.getTime() ?? null,
            attemptStatus: attempt.status,
            warnings: attempt.warningCount,
            tabSwitches: attempt.tabSwitchCount,
            reconnects: attempt.reconnectCount,
            lastHeartbeatAtMs: heartbeatAtMs,
          })

          socket.emit('exam:heartbeat_ack', {
            examId: data.examId,
            attemptId: data.attemptId,
            serverTimeMs: heartbeatAtMs,
            pendingQueueSize: data.pendingQueueSize,
          })

          await emitMonitorSnapshot(data.examId)
        } catch (error) {
          console.error('[Socket] student:heartbeat error:', error)
        }
      }
    )

    socket.on('student:disconnect_exam', async (data: { examId: string }) => {
      await handleStudentDisconnect(socket, userId, data.examId)
    })

    socket.on('student:tab_switch', async (data: { attemptId: string }) => {
      try {
        await registerSecurityViolation(data.attemptId, userId, 'TAB_SWITCH')
      } catch (err) {
        console.error('[Socket] tab_switch error:', err)
      }
    })

    socket.on(
      'student:security_violation',
      async (data: { attemptId: string; type: SecurityViolationType }) => {
        try {
          if (userRole !== 'STUDENT') return
          await registerSecurityViolation(data.attemptId, userId, data.type)
        } catch (err) {
          console.error('[Socket] security_violation error:', err)
        }
      }
    )

    socket.on('disconnect', async () => {
      console.log(`[Socket] Disconnected: ${userId} - ${socket.id}`)

      if (userRole !== 'STUDENT') {
        return
      }

      const runtimeStore = await getRuntimeStore()
      const attempts = await prisma.studentExamAttempt.findMany({
        where: { student: { userId }, status: 'IN_PROGRESS' },
        select: { examId: true },
      })

      for (const attempt of attempts) {
        const presence = await runtimeStore.getPresence(attempt.examId, userId)
        if (presence?.socketId === socket.id) {
          await handleStudentDisconnect(socket, userId, attempt.examId)
        }
      }
    })
  })

  return io
}

export async function closeSocketServer() {
  isSocketServerClosing = true

  for (const examId of examIntervals.keys()) {
    clearExamInterval(examId)
  }

  if (io) {
    await new Promise<void>((resolve, reject) => {
      io.close((error) => {
        if (error) {
          reject(error)
          return
        }

        resolve()
      })
    })
  }

  if (runtimeStorePromise) {
    const runtimeStore = await runtimeStorePromise
    await runtimeStore.disconnect().catch(() => {})
  }

  await prisma.$disconnect().catch(() => {})
}

export async function getSocketServerHealth() {
  const runtimeStore = runtimeStorePromise ? await runtimeStorePromise.catch(() => null) : null
  return {
    socketReady: !!io && !isSocketServerClosing,
    runtimeMode: runtimeStore?.mode ?? null,
    runtimeAvailable: runtimeStore?.isAvailable() ?? false,
  }
}

export { submitStudentAttempt }
export { io }
