import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { getErrorMessage } from '@/lib/api-errors'
import { prisma } from '@/lib/prisma'
import { UserRole } from '@prisma/client'
import { recalculateAfterReview, publishResult } from '@/lib/result-engine'
import { reviewAnswerSchema } from '@/lib/validators'

type RouteContext = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: RouteContext) {
  const { id } = await params
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const result = await prisma.examResult.findUnique({
    where: { id },
    include: {
      exam: {
        include: {
          subject: true,
          questions: {
            include: {
              question: {
                include: { options: { orderBy: { orderIndex: 'asc' } } },
              },
            },
            orderBy: { orderIndex: 'asc' },
          },
        },
      },
      attempt: {
        include: {
          student: { include: { user: { select: { name: true, email: true } } } },
          answers: {
            include: { question: { include: { options: true } } },
          },
        },
      },
    },
  })

  if (!result) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Permission check
  if (session.user.role === UserRole.STUDENT) {
    if (result.status !== 'PUBLISHED') return NextResponse.json({ error: 'Result not published yet' }, { status: 403 })
    const profile = await prisma.studentProfile.findUnique({ where: { userId: session.user.id } })
    if (result.studentId !== profile?.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Strip correct answers if showAnswers is false
  if (session.user.role === UserRole.STUDENT && !result.exam.showAnswers) {
    return NextResponse.json({
      ...result,
      attempt: {
        ...result.attempt,
        answers: result.attempt.answers.map((answer) => ({
          ...answer,
          question: {
            ...answer.question,
            options: answer.question.options.map((option) => ({ ...option, isCorrect: undefined })),
            expectedAnswer: undefined,
          },
        })),
      },
    })
  }

  return NextResponse.json(result)
}

// Teacher reviews/publishes result
export async function PATCH(req: NextRequest, { params }: RouteContext) {
  const { id } = await params
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== UserRole.TEACHER && session.user.role !== UserRole.SUPER_ADMIN) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const { action, answerId, marks, feedback } = body

  const result = await prisma.examResult.findUnique({
    where: { id },
    include: { attempt: true },
  })
  if (!result) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  try {
    if (action === 'review_answer' && answerId) {
      const parsed = reviewAnswerSchema.safeParse({ teacherMarks: marks, teacherFeedback: feedback })
      if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

      await prisma.studentAnswer.update({
        where: { id: answerId },
        data: {
          teacherMarks: parsed.data.teacherMarks,
          teacherFeedback: parsed.data.teacherFeedback ?? null,
          checkStatus: 'TEACHER_CHECKED',
        },
      })

      // Recalculate totals
      await recalculateAfterReview(result.attemptId)
    } else if (action === 'publish') {
      await publishResult(result.attemptId, result.examId, result.studentId)
    }

    const updated = await prisma.examResult.findUnique({ where: { id } })
    return NextResponse.json(updated)
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error, 'Failed to update result') }, { status: 500 })
  }
}
