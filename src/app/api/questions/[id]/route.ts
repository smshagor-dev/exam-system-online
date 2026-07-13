import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { isPrismaKnownError } from '@/lib/api-errors'
import { resolveQuestionOptionTranslation, resolveQuestionTranslation } from '@/lib/academic-content'
import { prisma } from '@/lib/prisma'
import { UserRole } from '@prisma/client'
import { teacherOwnsQuestion } from '@/lib/permissions'
import { validateQuestionPublication } from '@/lib/phase5-translations'

type RouteContext = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: RouteContext) {
  const { id } = await params
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const question = await prisma.question.findUnique({
    where: { id },
    include: {
      translations: true,
      options: {
        include: { translations: true },
        orderBy: { orderIndex: 'asc' },
      },
    },
  })

  if (!question) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const resolvedQuestion = resolveQuestionTranslation(question, question.languageId)

  return NextResponse.json({
    ...resolvedQuestion,
    options: question.options.map((option) =>
      resolveQuestionOptionTranslation(option, question.languageId)
    ),
  })
}

export async function PATCH(req: NextRequest, { params }: RouteContext) {
  const { id } = await params
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== UserRole.TEACHER) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const ctx = { userId: session.user.id, role: session.user.role }
  const owns = await teacherOwnsQuestion(ctx, id)
  if (!owns) return NextResponse.json({ error: 'Not your question' }, { status: 403 })

  const body = await req.json()
  const action = String(body.action || '').trim()

  if (action !== 'publish' && action !== 'unpublish') {
    return NextResponse.json({ error: 'Unsupported action' }, { status: 400 })
  }

  const question = await prisma.question.findUnique({
    where: { id },
    include: {
      translations: true,
      options: {
        include: {
          translations: true,
        },
        orderBy: { orderIndex: 'asc' },
      },
    },
  })

  if (!question) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  if (action === 'publish') {
    const completeness = validateQuestionPublication(question, question.languageId)
    if (!completeness.canPublish) {
      return NextResponse.json(
        { error: 'Question publication blocked by incomplete translation', completeness },
        { status: 409 }
      )
    }
  }

  const updatedQuestion = await prisma.question.update({
    where: { id },
    data: {
      isActive: action === 'publish',
    },
    include: {
      translations: true,
      options: {
        include: { translations: true },
        orderBy: { orderIndex: 'asc' },
      },
    },
  })

  const resolvedQuestion = resolveQuestionTranslation(updatedQuestion, updatedQuestion.languageId)
  return NextResponse.json({
    ...resolvedQuestion,
    options: updatedQuestion.options.map((option) =>
      resolveQuestionOptionTranslation(option, updatedQuestion.languageId)
    ),
  })
}

export async function DELETE(_req: NextRequest, { params }: RouteContext) {
  const { id } = await params
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== UserRole.TEACHER) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const ctx = { userId: session.user.id, role: session.user.role }
  const owns = await teacherOwnsQuestion(ctx, id)
  if (!owns) return NextResponse.json({ error: 'Not your question' }, { status: 403 })

  try {
    await prisma.question.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    if (isPrismaKnownError(error) && error.code === 'P2003') {
      return NextResponse.json(
        { error: 'Question is used in an exam. Remove it from the exam first.' },
        { status: 409 }
      )
    }
    return NextResponse.json({ error: 'Delete failed' }, { status: 500 })
  }
}
