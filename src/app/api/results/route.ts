import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { resolveExamTranslation } from '@/lib/academic-content'
import { prisma } from '@/lib/prisma'
import { Prisma, UserRole } from '@prisma/client'
import {
  buildAccessibleTeachingScopeFilters,
  getTeacherOfferingAssignments,
} from '@/lib/teacher-assignment'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const examId = searchParams.get('examId')

  let where: Prisma.ExamResultWhereInput = {}

  if (session.user.role === UserRole.STUDENT) {
    const profile = await prisma.studentProfile.findUnique({ where: { userId: session.user.id } })
    if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
    where = { studentId: profile.id, status: 'PUBLISHED' }
    if (examId) where.examId = examId
  } else if (session.user.role === UserRole.TEACHER) {
    const profile = await prisma.teacherProfile.findUnique({ where: { userId: session.user.id } })
    if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
    const assignments = await getTeacherOfferingAssignments({ teacherProfileId: profile.id })
    const scopeFilters = buildAccessibleTeachingScopeFilters(assignments) as Prisma.ExamWhereInput[]
    where = scopeFilters.length > 0
      ? {
          OR: [
            { exam: { teacherId: profile.id } },
            ...scopeFilters.map((filter) => ({ exam: filter })),
          ],
        }
      : { exam: { teacherId: profile.id } }
    if (examId) where.examId = examId
  } else {
    // Admin: see all
    if (examId) where.examId = examId
  }

  const results = await prisma.examResult.findMany({
    where,
    include: {
      exam: { include: { translations: true, subject: true } },
      attempt: {
        include: {
          student: { include: { user: { select: { name: true, email: true } } } },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json(
    results.map((result) => ({
      ...result,
      exam: resolveExamTranslation(result.exam, result.exam.languageId),
    }))
  )
}
