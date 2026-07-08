import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { UserRole } from '@prisma/client'
import { teacherOwnsExam, studentCanAccessExam } from '@/lib/permissions'

type RouteContext = { params: Promise<{ id: string }> }

export async function GET(req: NextRequest, { params }: RouteContext) {
  const { id } = await params
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const withQuestions = searchParams.get('withQuestions') === 'true'

  const exam = await prisma.exam.findUnique({
    where: { id },
    include: {
      subject: true,
      language: true,
      group: true,
      academicYear: true,
      semester: true,
      teacher: { include: { user: { select: { name: true } } } },
      ...(withQuestions
        ? {
            questions: {
              include: {
                question: {
                  include: {
                    // For students: do NOT include isCorrect in options
                    options: {
                      select: { id: true, text: true, orderIndex: true },
                      orderBy: { orderIndex: 'asc' },
                    },
                  },
                },
              },
              orderBy: { orderIndex: 'asc' },
            },
          }
        : {}),
    },
  })

  if (!exam) return NextResponse.json({ error: 'Exam not found' }, { status: 404 })

  // Role-based access
  if (session.user.role === UserRole.STUDENT) {
    const { allowed, reason } = await studentCanAccessExam(session.user.id, id)
    if (!allowed) return NextResponse.json({ error: reason }, { status: 403 })
  } else if (session.user.role === UserRole.TEACHER) {
    const ctx = { userId: session.user.id, role: session.user.role }
    const owns = await teacherOwnsExam(ctx, id)
    if (!owns) return NextResponse.json({ error: 'Not your exam' }, { status: 403 })
  }

  return NextResponse.json(exam)
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
