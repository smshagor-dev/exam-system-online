import { NextRequest, NextResponse } from 'next/server'
import { UserRole } from '@prisma/client'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import {
  cancelClassTest,
  getClassTest,
  getClassTestAttemptById,
  listClassTestAttempts,
} from '@/lib/class-test-store'
import {
  CLASS_TEST_MAX_WARNINGS,
  assertStudentCanAccessClassTest,
  finalizeClassTestAttempt,
  getClassTestLifecycle,
  getClassTestRemainingSeconds,
  publishClassTestResult,
  reportClassTestSecurityViolation,
  reviewClassTestAnswer,
  sanitizeClassTestAttemptForStudent,
  saveClassTestAnswer,
  startClassTestAttempt,
} from '@/lib/class-test-service'

type RouteContext = { params: Promise<{ id: string }> }

function studentAttemptPayload(attempt: NonNullable<Awaited<ReturnType<typeof getClassTestAttemptById>>>, test: NonNullable<Awaited<ReturnType<typeof getClassTest>>>) {
  const safe = sanitizeClassTestAttemptForStudent(attempt)
  return {
    ...safe,
    remainingSeconds: getClassTestRemainingSeconds(attempt, test),
    maxWarnings: CLASS_TEST_MAX_WARNINGS,
    ...(attempt.resultStatus === 'PUBLISHED'
      ? {}
      : { marksObtained: null, percentage: null, isPassed: null, publishedAt: null }),
  }
}

export async function GET(_req: NextRequest, { params }: RouteContext) {
  const { id } = await params
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const test = await getClassTest(id)
  if (!test) return NextResponse.json({ error: 'Class test not found' }, { status: 404 })

  const subject = await prisma.subject.findUnique({ where: { id: test.subjectId }, select: { name: true, code: true } })

  if (session.user.role === UserRole.TEACHER) {
    if (test.teacherUserId !== session.user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    const attempts = await listClassTestAttempts(test.id)
    const students = await prisma.studentProfile.findMany({
      where: { id: { in: attempts.map((attempt) => attempt.studentId) } },
      select: { id: true, user: { select: { name: true, email: true } } },
    })
    const studentMap = new Map(students.map((student) => [student.id, student.user]))
    return NextResponse.json({
      test: { ...test, lifecycle: getClassTestLifecycle(test), subject },
      attempts: attempts.map((attempt) => ({
        ...attempt,
        student: studentMap.get(attempt.studentId) ?? { name: 'Student', email: '' },
      })),
      maxWarnings: CLASS_TEST_MAX_WARNINGS,
    })
  }

  if (session.user.role !== UserRole.STUDENT) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  try {
    const access = await assertStudentCanAccessClassTest(test, session.user.id)
    let attempt = access.attempt
    if (attempt?.status === 'IN_PROGRESS' && getClassTestRemainingSeconds(attempt, test) <= 0) {
      attempt = await finalizeClassTestAttempt(attempt.id, true)
    }
    return NextResponse.json({
      test: {
        id: test.id,
        testNumber: test.testNumber,
        title: test.title,
        instructions: test.instructions,
        duration: test.duration,
        totalMarks: test.totalMarks,
        passingMarks: test.passingMarks,
        startTime: test.startTime,
        endTime: test.endTime,
        questionsPerStudent: test.questionsPerStudent,
        lifecycle: getClassTestLifecycle(test),
        subject,
      },
      attempt: attempt ? studentAttemptPayload(attempt, test) : null,
    })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Forbidden' }, { status: 403 })
  }
}

export async function PATCH(req: NextRequest, { params }: RouteContext) {
  const { id } = await params
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const test = await getClassTest(id)
  if (!test) return NextResponse.json({ error: 'Class test not found' }, { status: 404 })
  const body = await req.json()
  const action = String(body.action ?? '')

  try {
    if (session.user.role === UserRole.STUDENT) {
      if (action === 'start') {
        const attempt = await startClassTestAttempt(test.id, session.user.id)
        return NextResponse.json({ attempt: studentAttemptPayload(attempt, test) })
      }
      if (action === 'save_answer') {
        const attempt = await saveClassTestAnswer({
          attemptId: String(body.attemptId ?? ''),
          userId: session.user.id,
          questionId: String(body.questionId ?? ''),
          selectedOption: typeof body.selectedOption === 'string' ? body.selectedOption : null,
          answerText: typeof body.answerText === 'string' ? body.answerText : null,
        })
        if (!attempt) throw new Error('Could not save answer')
        return NextResponse.json({ attempt: studentAttemptPayload(attempt, test) })
      }
      if (action === 'warning') {
        const type = String(body.type ?? '') as 'TAB_SWITCH' | 'COPY' | 'SCREENSHOT' | 'DEVTOOLS'
        if (!['TAB_SWITCH', 'COPY', 'SCREENSHOT', 'DEVTOOLS'].includes(type)) {
          return NextResponse.json({ error: 'Invalid warning type' }, { status: 400 })
        }
        const attempt = await reportClassTestSecurityViolation({
          attemptId: String(body.attemptId ?? ''),
          userId: session.user.id,
          type,
        })
        return NextResponse.json({ attempt: studentAttemptPayload(attempt, test) })
      }
      if (action === 'submit') {
        const attempt = await getClassTestAttemptById(String(body.attemptId ?? ''))
        if (!attempt || attempt.studentUserId !== session.user.id || attempt.classTestId !== test.id) {
          return NextResponse.json({ error: 'Class test attempt not found' }, { status: 404 })
        }
        const submitted = await finalizeClassTestAttempt(attempt.id, false)
        return NextResponse.json({ attempt: studentAttemptPayload(submitted, test) })
      }
      return NextResponse.json({ error: 'Unsupported student action' }, { status: 400 })
    }

    if (session.user.role === UserRole.TEACHER) {
      if (test.teacherUserId !== session.user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      if (action === 'review_answer') {
        const attempt = await reviewClassTestAnswer({
          classTestId: test.id,
          attemptId: String(body.attemptId ?? ''),
          teacherUserId: session.user.id,
          questionId: String(body.questionId ?? ''),
          marks: Number(body.marks ?? 0),
          feedback: typeof body.feedback === 'string' ? body.feedback : null,
        })
        return NextResponse.json({ attempt })
      }
      if (action === 'publish_result') {
        const attempt = await publishClassTestResult({
          classTestId: test.id,
          attemptId: String(body.attemptId ?? ''),
          teacherUserId: session.user.id,
        })
        return NextResponse.json({ attempt })
      }
      if (action === 'cancel') {
        if (new Date(test.startTime).getTime() <= Date.now()) {
          return NextResponse.json({ error: 'A class test cannot be cancelled after its start time' }, { status: 409 })
        }
        return NextResponse.json({ test: await cancelClassTest(test.id) })
      }
      return NextResponse.json({ error: 'Unsupported teacher action' }, { status: 400 })
    }

    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Class test action failed'
    const status = /not found/i.test(message) ? 404 : /not assigned|forbidden/i.test(message) ? 403 : 409
    return NextResponse.json({ error: message }, { status })
  }
}
