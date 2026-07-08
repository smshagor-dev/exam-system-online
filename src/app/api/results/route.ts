import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { UserRole } from '@prisma/client'
import { recalculateAfterReview, publishResult } from '@/lib/result-engine'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const examId = searchParams.get('examId')

  let where: any = {}

  if (session.user.role === UserRole.STUDENT) {
    const profile = await prisma.studentProfile.findUnique({ where: { userId: session.user.id } })
    if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
    where = { studentId: profile.id, status: 'PUBLISHED' }
    if (examId) where.examId = examId
  } else if (session.user.role === UserRole.TEACHER) {
    const profile = await prisma.teacherProfile.findUnique({ where: { userId: session.user.id } })
    if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
    where = { exam: { teacherId: profile.id } }
    if (examId) where.examId = examId
  } else {
    // Admin: see all
    if (examId) where.examId = examId
  }

  const results = await prisma.examResult.findMany({
    where,
    include: {
      exam: { include: { subject: true } },
      attempt: {
        include: {
          student: { include: { user: { select: { name: true, email: true } } } },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json(results)
}
