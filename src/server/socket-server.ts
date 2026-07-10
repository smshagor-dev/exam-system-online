/**
 * src/server/socket-server.ts
 * 
 * Authoritative Socket.IO server for ExamFlow Pro.
 * All timer logic runs server-side. Clients receive updates via events.
 * 
 * Security model:
 * - Every socket event validates the JWT before acting
 * - Students cannot join exams they're not authorized for
 * - Answers cannot be saved after final submission
 * - Server is the single source of truth for time
 */

import { Server as HttpServer } from 'http'
import { Server as SocketServer, Socket } from 'socket.io'
import { PrismaClient } from '@prisma/client'
import * as jose from 'jose'
import { calculateResult } from '../lib/result-engine'
import { getAuthSecret } from '../lib/auth-secret'

const prisma = new PrismaClient()
const MAX_SECURITY_WARNINGS = 3
type SecurityViolationType = 'TAB_SWITCH' | 'COPY' | 'SCREENSHOT' | 'DEVTOOLS'

// In-memory state for active exams (source of truth for timer)
type ExamTimerState = {
  examId: string
  startedAt: number       // epoch ms
  durationMs: number      // total duration
  isPaused: boolean
  pausedAt: number | null // epoch ms when paused
  pausedElapsed: number   // ms elapsed before pause
  timerInterval: ReturnType<typeof setInterval> | null
}

// Track connected students per exam: examId -> Set<socketId>
const examStudents = new Map<string, Map<string, { userId: string; studentProfileId: string; submitted: boolean }>>()
const examTimers = new Map<string, ExamTimerState>()
const attemptTimeouts = new Map<string, ReturnType<typeof setTimeout>>()

let io: SocketServer

export function initSocketServer(httpServer: HttpServer) {
  io = new SocketServer(httpServer, {
    cors: {
      origin: process.env.NEXTAUTH_URL || 'http://localhost:3000',
      methods: ['GET', 'POST'],
      credentials: true,
    },
    transports: ['websocket', 'polling'],
  })

  // ─── Auth middleware ─────────────────────────────────────────────────────
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token
      if (!token) return next(new Error('No auth token'))

      const secret = new TextEncoder().encode(getAuthSecret())
      const { payload } = await jose.jwtVerify(token, secret)
      
      ;(socket as any).userId = payload.id
      ;(socket as any).userRole = payload.role
      ;(socket as any).userName = payload.name

      next()
    } catch {
      next(new Error('Invalid token'))
    }
  })

  io.on('connection', (socket: Socket) => {
    const userId: string = (socket as any).userId
    const userRole: string = (socket as any).userRole

    console.log(`[Socket] Connected: ${userId} (${userRole}) - ${socket.id}`)

    // ════════════════════════════════════════════════════════════════════════
    // TEACHER EVENTS
    // ════════════════════════════════════════════════════════════════════════

    /**
     * teacher:start_exam
     * Starts the exam session. Creates server-side timer.
     * Notifies all students in the exam room.
     */
    socket.on('teacher:start_exam', async (data: { examId: string }) => {
      try {
        if (userRole !== 'TEACHER') return socket.emit('error', { message: 'Unauthorized' })

        const exam = await prisma.exam.findUnique({
          where: { id: data.examId },
          include: { teacher: true },
        })
        if (!exam) return socket.emit('error', { message: 'Exam not found' })
        if (exam.teacher.userId !== userId) return socket.emit('error', { message: 'Not your exam' })

        // Update DB status
        await prisma.exam.update({
          where: { id: data.examId },
          data: { status: 'LIVE' },
        })

        // Create/update exam session
        await prisma.examSession.upsert({
          where: { examId: data.examId },
          create: { examId: data.examId, startedAt: new Date() },
          update: { startedAt: new Date(), endedAt: null, isPaused: false },
        })

        // Start server-side timer
        const durationMs = exam.duration * 60 * 1000
        const timerState: ExamTimerState = {
          examId: data.examId,
          startedAt: Date.now(),
          durationMs,
          isPaused: false,
          pausedAt: null,
          pausedElapsed: 0,
          timerInterval: null,
        }

        // Timer broadcasts every second to the exam room
        timerState.timerInterval = setInterval(() => {
          if (timerState.isPaused) return
          
          const elapsed = Date.now() - timerState.startedAt + timerState.pausedElapsed
          const remaining = Math.max(0, durationMs - elapsed)

          io.to(`exam:${data.examId}`).emit('exam:timer_update', {
            examId: data.examId,
            remaining: Math.floor(remaining / 1000), // seconds
            elapsed: Math.floor(elapsed / 1000),
          })

          // Auto-end when time is up
          if (remaining <= 0) {
            clearInterval(timerState.timerInterval!)
            autoEndExam(data.examId)
          }
        }, 1000)

        examTimers.set(data.examId, timerState)

        // Join teacher to exam room
        socket.join(`exam:${data.examId}`)
        socket.join(`teacher:${data.examId}`)

        // Notify everyone
        io.to(`exam:${data.examId}`).emit('exam:started', {
          examId: data.examId,
          startedAt: timerState.startedAt,
          durationMs,
        })
        console.log(`[Socket] Exam started: ${data.examId}`)
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
          include: { teacher: true },
        })
        if (!exam) return socket.emit('error', { message: 'Exam not found' })
        if (exam.teacher.userId !== userId) return socket.emit('error', { message: 'Not your exam' })

        socket.join(`exam:${data.examId}`)
        socket.join(`teacher:${data.examId}`)
      } catch (err) {
        console.error('[Socket] teacher:join_exam_monitor error:', err)
        socket.emit('error', { message: 'Failed to join exam monitor' })
      }
    })

    /**
     * teacher:pause_exam
     */
    socket.on('teacher:pause_exam', async (data: { examId: string }) => {
      if (userRole !== 'TEACHER') return
      
      const timer = examTimers.get(data.examId)
      if (!timer || timer.isPaused) return

      const elapsed = Date.now() - timer.startedAt + timer.pausedElapsed
      timer.isPaused = true
      timer.pausedAt = Date.now()
      timer.pausedElapsed = elapsed

      await prisma.examSession.update({
        where: { examId: data.examId },
        data: { isPaused: true, pausedAt: new Date() },
      })

      io.to(`exam:${data.examId}`).emit('exam:paused', {
        examId: data.examId,
        remainingSeconds: Math.floor((timer.durationMs - elapsed) / 1000),
      })
    })

    /**
     * teacher:end_exam
     * Teacher manually ends the exam. Auto-submits all pending students.
     */
    socket.on('teacher:end_exam', async (data: { examId: string }) => {
      try {
        if (userRole !== 'TEACHER') return
        await autoEndExam(data.examId)
      } catch (err) {
        console.error('[Socket] teacher:end_exam error:', err)
      }
    })

    /**
     * teacher:publish_result
     * Publishes results for a specific attempt.
     */
    socket.on('teacher:publish_result', async (data: { examId: string; attemptId: string }) => {
      try {
        if (userRole !== 'TEACHER') return

        const { publishResult } = await import('../lib/result-engine')
        const attempt = await prisma.studentExamAttempt.findUnique({
          where: { id: data.attemptId },
          include: { student: true },
        })
        if (!attempt) return

        await publishResult(data.attemptId, data.examId, attempt.studentId)

        // Notify student if online
        const studentRoom = `student:${attempt.student.userId}`
        io.to(studentRoom).emit('result:published', {
          examId: data.examId,
          attemptId: data.attemptId,
        })

        socket.emit('notification:new', { message: 'Result published successfully' })
      } catch (err) {
        console.error('[Socket] teacher:publish_result error:', err)
      }
    })

    /**
     * teacher:review_answer
     * Teacher submits marks for a specific answer.
     */
    socket.on(
      'teacher:review_answer',
      async (data: { answerId: string; marks: number; feedback: string }) => {
        try {
          if (userRole !== 'TEACHER') return

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

    // ════════════════════════════════════════════════════════════════════════
    // STUDENT EVENTS
    // ════════════════════════════════════════════════════════════════════════

    /**
     * student:join_exam
     * Student joins the exam room. Validates eligibility server-side.
     */
    socket.on('student:join_exam', async (data: { examId: string }) => {
      try {
        if (userRole !== 'STUDENT') return socket.emit('error', { message: 'Unauthorized' })

        // Validate access
        const { studentCanAccessExam } = await import('../lib/permissions')
        const { allowed, reason } = await studentCanAccessExam(userId, data.examId)
        if (!allowed) return socket.emit('error', { message: reason || 'Access denied' })

        const studentProfile = await prisma.studentProfile.findUnique({
          where: { userId },
        })
        if (!studentProfile) return socket.emit('error', { message: 'Student profile not found' })

        // Check for existing attempt - block duplicate unless retake allowed
        const exam = await prisma.exam.findUnique({ where: { id: data.examId } })
        if (!exam) return socket.emit('error', { message: 'Exam not found' })

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
          return socket.emit('error', { message: 'Already submitted this exam' })
        }

        // Update socket ID on attempt (reconnect support)
        if (existingAttempt) {
          const reconnectedAttempt = await prisma.studentExamAttempt.update({
            where: { id: existingAttempt.id },
            data: { socketId: socket.id, reconnectCount: { increment: 1 } },
          })
          // Log reconnect
          await prisma.activityLog.create({
            data: {
              userId,
              action: 'RECONNECT',
              examId: data.examId,
              details: JSON.stringify({ socketId: socket.id }),
            },
          })

          io.to(`teacher:${data.examId}`).emit('exam:suspicious_activity', {
            studentId: studentProfile.id,
            studentName: (socket as any).userName,
            type: 'RECONNECT',
            count: reconnectedAttempt.reconnectCount,
            warningCount: reconnectedAttempt.warningCount,
          })
        }

        // Join rooms
        socket.join(`exam:${data.examId}`)
        socket.join(`student:${userId}`)

        // Track in memory
        if (!examStudents.has(data.examId)) examStudents.set(data.examId, new Map())
        examStudents.get(data.examId)!.set(socket.id, {
          userId,
          studentProfileId: studentProfile.id,
          submitted: existingAttempt?.status === 'SUBMITTED' || false,
        })

        // Notify teacher
        io.to(`teacher:${data.examId}`).emit('exam:student_joined', {
          examId: data.examId,
          studentId: studentProfile.id,
          userId,
          socketId: socket.id,
          studentName: (socket as any).userName,
          reconnected: !!existingAttempt,
        })

        // Send current timer state to joining student
        const timer = examTimers.get(data.examId)
        if (timer) {
          const elapsed = timer.isPaused
            ? timer.pausedElapsed
            : Date.now() - timer.startedAt + timer.pausedElapsed
          const remaining = Math.max(0, timer.durationMs - elapsed)
          socket.emit('exam:timer_update', {
            examId: data.examId,
            remaining: Math.floor(remaining / 1000),
            elapsed: Math.floor(elapsed / 1000),
          })
        }

        socket.emit('exam:joined', {
          examId: data.examId,
          attemptId: existingAttempt?.id,
          message: 'Joined exam successfully',
        })
      } catch (err) {
        console.error('[Socket] student:join_exam error:', err)
        socket.emit('error', { message: 'Failed to join exam' })
      }
    })

    /**
     * student:start_attempt
     * Creates a new attempt record.
     */
    socket.on('student:start_attempt', async (data: { examId: string }) => {
      try {
        if (userRole !== 'STUDENT') return

        const studentProfile = await prisma.studentProfile.findUnique({
          where: { userId },
        })
        if (!studentProfile) return socket.emit('error', { message: 'Profile not found' })

        const exam = await prisma.exam.findUnique({
          where: { id: data.examId },
          select: { id: true, status: true, duration: true, startTime: true, endTime: true, allowRetake: true },
        })
        if (!exam) return socket.emit('error', { message: 'Exam not found' })

        const now = new Date()
        if (now < exam.startTime) return socket.emit('error', { message: 'Exam has not started yet' })
        if (now > exam.endTime) return socket.emit('error', { message: 'Exam has ended' })
        if (exam.status !== 'SCHEDULED' && exam.status !== 'LIVE') {
          return socket.emit('error', { message: `Exam is ${exam.status.toLowerCase()}` })
        }

        const existingAttempt = await prisma.studentExamAttempt.findUnique({
          where: {
            examId_studentId: { examId: data.examId, studentId: studentProfile.id },
          },
        })
        if (existingAttempt && (existingAttempt.status === 'SUBMITTED' || existingAttempt.status === 'AUTO_SUBMITTED')) {
          if (!exam.allowRetake) {
            return socket.emit('error', { message: 'Exam already submitted' })
          }
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

          io.to(`exam:${data.examId}`).emit('exam:started', {
            examId: data.examId,
            startedAt: Date.now(),
            durationMs: exam.duration * 60 * 1000,
          })
        }

        const attempt = await prisma.studentExamAttempt.upsert({
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
          },
        })

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

        scheduleAttemptTimeout(attempt.id, userId, data.examId, remainingSeconds)
        socket.emit('exam:attempt_started', { attemptId: attempt.id, remainingSeconds })
      } catch (err) {
        console.error('[Socket] student:start_attempt error:', err)
      }
    })

    /**
     * student:save_answer
     * Auto-saves a student's answer. Blocked if attempt is already submitted.
     */
    socket.on(
      'student:save_answer',
      async (data: {
        attemptId: string
        questionId: string
        selectedOption?: string
        answerText?: string
      }) => {
        try {
          if (userRole !== 'STUDENT') return

          // Verify attempt belongs to this student and is not submitted
          const attempt = await prisma.studentExamAttempt.findUnique({
            where: { id: data.attemptId },
            include: { student: true },
          })

          if (!attempt) return socket.emit('error', { message: 'Attempt not found' })
          if (attempt.student.userId !== userId) {
            return socket.emit('error', { message: 'Not your attempt' })
          }
          if (attempt.status === 'SUBMITTED' || attempt.status === 'AUTO_SUBMITTED') {
            return socket.emit('error', { message: 'Exam already submitted' })
          }

          // Upsert the answer
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

    /**
     * student:submit_exam
     * Manual submission by student.
     */
    socket.on('student:submit_exam', async (data: { attemptId: string }) => {
      try {
        if (userRole !== 'STUDENT') return
        await submitStudentAttempt(data.attemptId, userId, 'SUBMITTED')
        socket.emit('exam:submitted', { attemptId: data.attemptId, success: true })
      } catch (err) {
        console.error('[Socket] student:submit_exam error:', err)
        socket.emit('error', { message: 'Submission failed' })
      }
    })

    /**
     * student:disconnect_exam
     * Student explicitly leaves/disconnects.
     */
    socket.on('student:disconnect_exam', async (data: { examId: string }) => {
      handleStudentDisconnect(socket, userId, data.examId)
    })

    // ─── Tab switch detection ─────────────────────────────────────────────
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

    // ─── Disconnect handler ──────────────────────────────────────────────
    socket.on('disconnect', () => {
      console.log(`[Socket] Disconnected: ${userId} - ${socket.id}`)
      // Remove from all exam student maps
      for (const [examId, students] of examStudents.entries()) {
        if (students.has(socket.id)) {
          const student = students.get(socket.id)!
          students.delete(socket.id)
          io.to(`teacher:${examId}`).emit('exam:student_offline', {
            examId,
            userId: student.userId,
            socketId: socket.id,
          })
        }
      }
    })
  })

  return io
}

// ─── Shared helpers ────────────────────────────────────────────────────────────

/**
 * Submit a student attempt and calculate result.
 */
async function submitStudentAttempt(
  attemptId: string,
  userId: string,
  status: 'SUBMITTED' | 'AUTO_SUBMITTED'
) {
  const attempt = await prisma.studentExamAttempt.findUnique({
    where: { id: attemptId },
    include: { student: true },
  })
  if (!attempt) return
  if (attempt.status === 'SUBMITTED' || attempt.status === 'AUTO_SUBMITTED') return // idempotent

  clearAttemptTimeout(attemptId)

  const timeSpent = attempt.startedAt
    ? Math.floor((Date.now() - attempt.startedAt.getTime()) / 1000)
    : 0

  await prisma.studentExamAttempt.update({
    where: { id: attemptId },
    data: {
      status,
      submittedAt: new Date(),
      timeSpent,
    },
  })

  // Run result engine (non-blocking, errors logged)
  calculateResult(attemptId).catch((err) =>
    console.error('[ResultEngine] Error calculating result:', err)
  )

  // Log
  await prisma.activityLog.create({
    data: {
      userId,
      action: status === 'AUTO_SUBMITTED' ? 'AUTO_SUBMIT' : 'MANUAL_SUBMIT',
      examId: attempt.examId,
    },
  })

  io.to(`teacher:${attempt.examId}`).emit('exam:student_submitted', {
    examId: attempt.examId,
    attemptId,
    studentId: attempt.studentId,
    userId,
    status,
  })
}

/**
 * Auto-end exam: marks exam as COMPLETED, auto-submits all pending attempts.
 */
async function autoEndExam(examId: string) {
  // Clear timer
  const timer = examTimers.get(examId)
  if (timer?.timerInterval) clearInterval(timer.timerInterval)
  examTimers.delete(examId)

  // Update DB
  await prisma.exam.update({ where: { id: examId }, data: { status: 'COMPLETED' } })
  await prisma.examSession.update({
    where: { examId },
    data: { endedAt: new Date() },
  })

  // Notify all connected clients
  io.to(`exam:${examId}`).emit('exam:ended', { examId })

  // Auto-submit all in-progress attempts
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

  console.log(`[Socket] Exam ended: ${examId}, auto-submitted ${pendingAttempts.length} attempts`)
}

async function handleStudentDisconnect(socket: Socket, userId: string, examId: string) {
  await prisma.activityLog.create({
    data: {
      userId,
      action: 'DISCONNECT',
      examId,
      details: JSON.stringify({ socketId: socket.id }),
    },
  })
}

function clearAttemptTimeout(attemptId: string) {
  const timeout = attemptTimeouts.get(attemptId)
  if (timeout) {
    clearTimeout(timeout)
    attemptTimeouts.delete(attemptId)
  }
}

function scheduleAttemptTimeout(
  attemptId: string,
  userId: string,
  examId: string,
  remainingSeconds: number
) {
  clearAttemptTimeout(attemptId)

  const timeout = setTimeout(async () => {
    try {
      await submitStudentAttempt(attemptId, userId, 'AUTO_SUBMITTED')
      io.to(`student:${userId}`).emit('exam:auto_submitted', {
        examId,
        attemptId,
      })
    } catch (err) {
      console.error('[Socket] attempt timeout auto-submit error:', err)
    }
  }, remainingSeconds * 1000)

  attemptTimeouts.set(attemptId, timeout)
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

  const updateData: Record<string, any> = {
    warningCount: { increment: 1 },
  }

  if (type === 'TAB_SWITCH') {
    updateData.tabSwitchCount = { increment: 1 }
  }

  const updatedAttempt = await prisma.studentExamAttempt.update({
    where: { id: attemptId },
    data: updateData,
  })

  const countForType = type === 'TAB_SWITCH' ? updatedAttempt.tabSwitchCount : updatedAttempt.warningCount
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

function formatViolationLabel(type: SecurityViolationType) {
  if (type === 'TAB_SWITCH') return 'tab switch'
  if (type === 'COPY') return 'copy action'
  if (type === 'SCREENSHOT') return 'screenshot attempt'
  return 'developer tools'
}

export { io }
