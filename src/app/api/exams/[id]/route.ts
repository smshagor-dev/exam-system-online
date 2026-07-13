import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import {
  resolveExamTranslation,
  resolveQuestionOptionTranslation,
  resolveQuestionTranslation,
} from '@/lib/academic-content'
import { prisma } from '@/lib/prisma'
import { UserRole } from '@prisma/client'
import { teacherOwnsExam, studentCanAccessExam } from '@/lib/permissions'
import { validateExamPublication } from '@/lib/phase5-translations'

type RouteContext = { params: Promise<{ id: string }> }
type ExamQuestionEntry = {
  id: string
  questionId: string
  examId: string
  marks: number
  orderIndex: number
  question: {
    id: string
    languageId: string
    text: string
    expectedAnswer: string | null
    explanation: string | null
    keywords: string | null
    options: Array<{
      id: string
      text: string
      orderIndex: number
      isCorrect?: boolean
      translations: Array<{
        languageId: string
        text: string
      }>
    }>
    translations: Array<{
      languageId: string
      text: string
      expectedAnswer: string | null
      explanation: string | null
      keywords: string | null
    }>
  }
}

export async function GET(req: NextRequest, { params }: RouteContext) {
  const { id } = await params
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const withQuestions = searchParams.get('withQuestions') === 'true'
  let studentAttemptSummary:
    | {
        status: 'NOT_STARTED' | 'IN_PROGRESS' | 'SUBMITTED' | 'AUTO_SUBMITTED' | 'TIMED_OUT'
        submittedAt: string | null
      }
    | null = null

  const exam = withQuestions
    ? await prisma.exam.findUnique({
        where: { id },
        include: {
          translations: true,
          subject: true,
          language: true,
          group: true,
          academicYear: true,
          semester: true,
          teacher: { include: { user: { select: { name: true } } } },
          questions: {
            include: {
              question: {
                include: {
                  translations: true,
                  options: {
                    include: { translations: true },
                    orderBy: { orderIndex: 'asc' },
                  },
                },
              },
            },
            orderBy: { orderIndex: 'asc' },
          },
        },
      })
    : await prisma.exam.findUnique({
        where: { id },
        include: {
          translations: true,
          subject: true,
          language: true,
          group: true,
          academicYear: true,
          semester: true,
          teacher: { include: { user: { select: { name: true } } } },
        },
      })

  if (!exam) return NextResponse.json({ error: 'Exam not found' }, { status: 404 })

  // Role-based access
  if (session.user.role === UserRole.STUDENT) {
    const { allowed, reason } = await studentCanAccessExam(session.user.id, id)
    if (!allowed) return NextResponse.json({ error: reason }, { status: 403 })
    const studentProfile = await prisma.studentProfile.findUnique({
      where: { userId: session.user.id },
      select: { id: true },
    })
    if (studentProfile) {
      const attempt = await prisma.studentExamAttempt.findUnique({
        where: {
          examId_studentId: {
            examId: id,
            studentId: studentProfile.id,
          },
        },
        select: {
          status: true,
          submittedAt: true,
        },
      })
      if (attempt) {
        studentAttemptSummary = {
          status: attempt.status,
          submittedAt: attempt.submittedAt?.toISOString() ?? null,
        }
      }
    }
  } else if (session.user.role === UserRole.TEACHER) {
    const ctx = { userId: session.user.id, role: session.user.role }
    const owns = await teacherOwnsExam(ctx, id)
    if (!owns) return NextResponse.json({ error: 'Not your exam' }, { status: 403 })
  }

  const resolvedExam = resolveExamTranslation(exam, exam.languageId)

  if (!withQuestions) {
    return NextResponse.json({
      ...resolvedExam,
      attemptSummary: studentAttemptSummary,
    })
  }

  if (!('questions' in exam)) {
    return NextResponse.json({ error: 'Exam questions could not be loaded' }, { status: 500 })
  }

  const examWithQuestions = exam as typeof exam & { questions: ExamQuestionEntry[] }

  return NextResponse.json({
    ...resolvedExam,
    attemptSummary: studentAttemptSummary,
    questions: examWithQuestions.questions.map((entry) => {
      const resolvedQuestion = resolveQuestionTranslation(entry.question, exam.languageId)

      return {
        ...entry,
        question: {
          ...resolvedQuestion,
          options: entry.question.options.map((option) => {
            const resolvedOption = resolveQuestionOptionTranslation(option, exam.languageId)

            if (session.user.role === UserRole.STUDENT) {
              return {
                id: resolvedOption.id,
                text: resolvedOption.text,
                orderIndex: resolvedOption.orderIndex,
              }
            }

            return resolvedOption
          }),
        },
      }
    }),
  })
}

export async function PATCH(req: NextRequest, { params }: RouteContext) {
  const { id } = await params
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const ctx = { userId: session.user.id, role: session.user.role as UserRole }

  if (session.user.role === UserRole.TEACHER) {
    const owns = await teacherOwnsExam(ctx, id)
    if (!owns) return NextResponse.json({ error: 'Not your exam' }, { status: 403 })
  } else if (
    session.user.role !== UserRole.SUPER_ADMIN &&
    session.user.role !== UserRole.DEPARTMENT_ADMIN
  ) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()

  if (typeof body.status === 'string' && ['SCHEDULED', 'LIVE'].includes(body.status)) {
    const examForPublication = await prisma.exam.findUnique({
      where: { id },
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
                  orderBy: { orderIndex: 'asc' },
                },
              },
            },
          },
          orderBy: { orderIndex: 'asc' },
        },
      },
    })

    if (!examForPublication) {
      return NextResponse.json({ error: 'Exam not found' }, { status: 404 })
    }

    const completeness = validateExamPublication(examForPublication, examForPublication.languageId)
    if (!completeness.canPublish) {
      return NextResponse.json(
        { error: 'Exam publication blocked by incomplete translation', completeness },
        { status: 409 }
      )
    }
  }

  try {
    const exam = await prisma.exam.update({
      where: { id },
      data: body,
    })
    return NextResponse.json(exam)
  } catch {
    return NextResponse.json({ error: 'Update failed' }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: RouteContext) {
  const { id } = await params
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (session.user.role !== UserRole.SUPER_ADMIN && session.user.role !== UserRole.TEACHER) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Only allow deletion of DRAFT exams
  const exam = await prisma.exam.findUnique({ where: { id } })
  if (!exam) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (exam.status !== 'DRAFT') {
    return NextResponse.json({ error: 'Only draft exams can be deleted' }, { status: 409 })
  }

  await prisma.exam.delete({ where: { id } })
  return NextResponse.json({ success: true })
}
