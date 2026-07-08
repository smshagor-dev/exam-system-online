import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { createQuestionSchema } from '@/lib/validators'
import { UserRole } from '@prisma/client'
import { teacherCanAccessAssignment } from '@/lib/permissions'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const subjectId = searchParams.get('subjectId')
  const groupId = searchParams.get('groupId')
  const academicYearId = searchParams.get('academicYearId')
  const semesterId = searchParams.get('semesterId')

  const profile = await prisma.teacherProfile.findUnique({ where: { userId: session.user.id } })
  if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })

  const where: any = { teacherId: profile.id }
  if (subjectId) where.subjectId = subjectId
  if (groupId) where.groupId = groupId
  if (academicYearId) where.academicYearId = academicYearId
  if (semesterId) where.semesterId = semesterId

  const questions = await prisma.question.findMany({
    where,
    include: { options: { orderBy: { orderIndex: 'asc' } } },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json(questions)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== UserRole.TEACHER) {
    return NextResponse.json({ error: 'Only teachers can create questions' }, { status: 403 })
  }

  const body = await req.json()
  const parsed = createQuestionSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 })
  }

  const ctx = { userId: session.user.id, role: session.user.role }
  const canAccess = await teacherCanAccessAssignment(ctx, {
    subjectId: parsed.data.subjectId,
    languageId: parsed.data.languageId,
    groupId: parsed.data.groupId,
    academicYearId: parsed.data.academicYearId,
    semesterId: parsed.data.semesterId,
  })

  if (!canAccess) {
    return NextResponse.json({ error: 'You are not assigned to this subject/group/year/semester' }, { status: 403 })
  }

  const profile = await prisma.teacherProfile.findUnique({ where: { userId: session.user.id } })
  if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })

  const { options, keywords, ...questionData } = parsed.data

  const question = await prisma.question.create({
    data: {
      ...questionData,
      teacherId: profile.id,
      keywords: keywords ? JSON.stringify(keywords) : null,
      options: options?.length
        ? {
            create: options.map((opt, i) => ({
              text: opt.text,
              isCorrect: opt.isCorrect,
              orderIndex: opt.orderIndex ?? i,
            })),
          }
        : undefined,
    },
    include: { options: true },
  })

  return NextResponse.json(question, { status: 201 })
}
