import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { createExamSchema } from '@/lib/validators'
import { ExamStatus, Prisma, UserRole } from '@prisma/client'
import { getStudentExamQueryScope, teacherCanAccessAssignment } from '@/lib/permissions'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status')
  const validStatus = status && Object.values(ExamStatus).includes(status as ExamStatus)
    ? (status as ExamStatus)
    : null

  let where: Prisma.ExamWhereInput = {}

  if (session.user.role === UserRole.TEACHER) {
    const profile = await prisma.teacherProfile.findUnique({ where: { userId: session.user.id } })
    if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
    where.teacherId = profile.id
  } else if (session.user.role === UserRole.STUDENT) {
    const scope = await getStudentExamQueryScope(session.user.id)
    if (!scope.profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
    if (scope.examWhereClauses.length === 0) return NextResponse.json([])

    where = {
      OR: scope.examWhereClauses,
      status: validStatus ? { in: [validStatus] } : { in: [ExamStatus.SCHEDULED, ExamStatus.LIVE] },
    }
  }

  if (validStatus && session.user.role !== UserRole.STUDENT) {
    where.status = validStatus
  }

  const exams = await prisma.exam.findMany({
    where,
    include: {
      subject: true,
      language: true,
      group: true,
      academicYear: true,
      semester: true,
      _count: { select: { questions: true, attempts: true } },
    },
    orderBy: { startTime: 'desc' },
  })

  return NextResponse.json(exams)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== UserRole.TEACHER) {
    return NextResponse.json({ error: 'Only teachers can create exams' }, { status: 403 })
  }

  const body = await req.json()
  const parsed = createExamSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 })
  }

  const ctx = { userId: session.user.id, role: session.user.role }
  const canAccess = await teacherCanAccessAssignment(ctx, {
    academicOfferingId: parsed.data.academicOfferingId,
    subjectId: parsed.data.subjectId,
    languageId: parsed.data.languageId,
    groupId: parsed.data.groupId,
    academicYearId: parsed.data.academicYearId,
    semesterId: parsed.data.semesterId,
  })
  if (!canAccess) {
    return NextResponse.json({ error: 'Not assigned to this subject/group/year/semester' }, { status: 403 })
  }

  const profile = await prisma.teacherProfile.findUnique({ where: { userId: session.user.id } })
  if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })

  const { questionIds, ...examData } = parsed.data

  const exam = await prisma.exam.create({
    data: {
      ...examData,
      startTime: new Date(examData.startTime),
      endTime: new Date(examData.endTime),
      teacherId: profile.id,
      academicOfferingId: parsed.data.academicOfferingId ?? null,
      status: 'SCHEDULED',
      questions: {
        create: questionIds.map((q) => ({
          questionId: q.questionId,
          orderIndex: q.orderIndex,
          marks: q.marks,
        })),
      },
    },
    include: {
      questions: { include: { question: true } },
      subject: true,
    },
  })

  return NextResponse.json(exam, { status: 201 })
}
