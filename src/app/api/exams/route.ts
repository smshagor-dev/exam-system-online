import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { dedupeTranslations, resolveExamTranslation } from '@/lib/academic-content'
import { prisma } from '@/lib/prisma'
import { createExamSchema } from '@/lib/validators'
import { ExamStatus, Prisma, UserRole } from '@prisma/client'
import { getStudentExamQueryScope, teacherCanAccessAssignment } from '@/lib/permissions'
import {
  buildAccessibleTeachingScopeFilters,
  getTeacherOfferingAssignments,
} from '@/lib/teacher-assignment'

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
    const assignments = await getTeacherOfferingAssignments({ teacherProfileId: profile.id })
    const scopeFilters = buildAccessibleTeachingScopeFilters(assignments) as Prisma.ExamWhereInput[]
    where = scopeFilters.length > 0
      ? { OR: [...scopeFilters, { teacherId: profile.id }] }
      : { teacherId: profile.id }
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
      translations: true,
      subject: true,
      language: true,
      group: true,
      semester: true,
      _count: { select: { questions: true, attempts: true } },
    },
    orderBy: { startTime: 'desc' },
  })

  return NextResponse.json(exams.map((exam) => resolveExamTranslation(exam, exam.languageId)))
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

  const { questionIds, translations, ...examData } = parsed.data

  const exam = await prisma.$transaction(async (tx) => {
    const createdExam = await tx.exam.create({
      data: {
        ...examData,
        startTime: new Date(examData.startTime),
        endTime: new Date(examData.endTime),
        teacherId: profile.id,
        academicOfferingId: parsed.data.academicOfferingId ?? null,
        status: 'DRAFT',
        questions: {
          create: questionIds.map((q) => ({
            questionId: q.questionId,
            orderIndex: q.orderIndex,
            marks: q.marks,
          })),
        },
      },
    })

    const mergedTranslations = dedupeTranslations([
      {
        languageId: parsed.data.languageId,
        title: parsed.data.title,
        description: parsed.data.description ?? null,
        instructions: parsed.data.instructions ?? null,
      },
      ...(translations ?? []).map((translation) => ({
        languageId: translation.languageId,
        title: translation.title,
        description: translation.description ?? null,
        instructions: translation.instructions ?? null,
      })),
    ])

    if (mergedTranslations.length > 0) {
      await tx.examTranslation.createMany({
        data: mergedTranslations.map((translation) => ({
          examId: createdExam.id,
          languageId: translation.languageId,
          title: translation.title,
          description: translation.description ?? null,
          instructions: translation.instructions ?? null,
        })),
      })
    }

    return tx.exam.findUniqueOrThrow({
      where: { id: createdExam.id },
      include: {
        translations: true,
        questions: { include: { question: true } },
        subject: true,
      },
    })
  })

  return NextResponse.json(resolveExamTranslation(exam, exam.languageId), { status: 201 })
}
