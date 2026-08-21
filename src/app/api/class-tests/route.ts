import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { UserRole } from '@prisma/client'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { teacherCanAccessAssignment } from '@/lib/permissions'
import { createClassTest, getNextClassTestNumber } from '@/lib/class-test-store'

const createClassTestSchema = z.object({
  departmentId: z.string().min(1),
  subjectId: z.string().min(1),
  languageId: z.string().min(1),
  groupId: z.string().min(1),
  academicYearId: z.string().min(1),
  semesterId: z.string().min(1),
  academicOfferingId: z.string().min(1).optional().nullable(),
  title: z.string().trim().max(120).optional().nullable(),
  instructions: z.string().trim().max(4000).optional().nullable(),
  duration: z.number().int().min(1).max(180),
  startTime: z.string().refine((value) => !Number.isNaN(new Date(value).getTime()), 'Invalid start time'),
  endTime: z.string().refine((value) => !Number.isNaN(new Date(value).getTime()), 'Invalid end time'),
  resultMode: z.enum(['AUTO', 'TEACHER_REVIEW']).default('AUTO'),
  questionsPerStudent: z.number().int().min(1).max(100),
  marksPerQuestion: z.number().int().min(1).max(100),
  passingMarks: z.number().int().min(0),
  questionIds: z.array(z.string().min(1)).min(1).max(300),
})

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== UserRole.TEACHER) {
    return NextResponse.json({ error: 'Only teachers can create class tests' }, { status: 403 })
  }

  const parsed = createClassTestSchema.safeParse(await req.json())
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }
  const data = parsed.data
  const start = new Date(data.startTime)
  const end = new Date(data.endTime)
  if (end <= start) return NextResponse.json({ error: 'End time must be after start time' }, { status: 400 })
  if (data.questionsPerStudent > data.questionIds.length) {
    return NextResponse.json({ error: 'Questions per student cannot exceed the selected question pool' }, { status: 400 })
  }
  const totalMarks = data.questionsPerStudent * data.marksPerQuestion
  if (data.passingMarks > totalMarks) {
    return NextResponse.json({ error: 'Passing marks cannot exceed total marks' }, { status: 400 })
  }

  const canAccess = await teacherCanAccessAssignment(
    { userId: session.user.id, role: session.user.role },
    {
      academicOfferingId: data.academicOfferingId,
      subjectId: data.subjectId,
      languageId: data.languageId,
      groupId: data.groupId,
      academicYearId: data.academicYearId,
      semesterId: data.semesterId,
    }
  )
  if (!canAccess) {
    return NextResponse.json({ error: 'You are not assigned to this class-test scope' }, { status: 403 })
  }

  const profile = await prisma.teacherProfile.findUnique({ where: { userId: session.user.id } })
  if (!profile) return NextResponse.json({ error: 'Teacher profile not found' }, { status: 404 })

  const uniqueQuestionIds = [...new Set(data.questionIds)]
  if (uniqueQuestionIds.length !== data.questionIds.length) {
    return NextResponse.json({ error: 'Question pool contains duplicates' }, { status: 400 })
  }
  const questions = await prisma.question.findMany({
    where: {
      id: { in: uniqueQuestionIds },
      isActive: true,
      subjectId: data.subjectId,
      languageId: data.languageId,
      groupId: data.groupId,
      academicYearId: data.academicYearId,
      semesterId: data.semesterId,
    },
    select: { id: true },
  })
  if (questions.length !== uniqueQuestionIds.length) {
    return NextResponse.json({ error: 'Every selected question must be published and match the class-test scope' }, { status: 400 })
  }

  const testNumber = await getNextClassTestNumber({
    teacherId: profile.id,
    subjectId: data.subjectId,
    groupId: data.groupId,
    academicYearId: data.academicYearId,
    semesterId: data.semesterId,
  })

  try {
    const test = await createClassTest({
      teacherId: profile.id,
      teacherUserId: session.user.id,
      departmentId: data.departmentId,
      subjectId: data.subjectId,
      languageId: data.languageId,
      groupId: data.groupId,
      academicYearId: data.academicYearId,
      semesterId: data.semesterId,
      academicOfferingId: data.academicOfferingId ?? null,
      testNumber,
      title: data.title?.trim() || `Test ${testNumber}`,
      instructions: data.instructions?.trim() || null,
      duration: data.duration,
      totalMarks,
      passingMarks: data.passingMarks,
      startTime: start.toISOString(),
      endTime: end.toISOString(),
      resultMode: data.resultMode,
      questionsPerStudent: data.questionsPerStudent,
      questionPool: uniqueQuestionIds.map((questionId) => ({ questionId, marks: data.marksPerQuestion })),
    })
    return NextResponse.json(test, { status: 201 })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create class test' },
      { status: 500 }
    )
  }
}
