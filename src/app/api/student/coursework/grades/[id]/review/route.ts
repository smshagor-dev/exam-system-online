import { auth } from '@/lib/auth'
import { createCourseworkActivityLog, createCourseworkNotification } from '@/lib/coursework-enterprise'
import { prisma } from '@/lib/prisma'
import { CourseworkGradeStatus, CourseworkReviewRequestStatus, UserRole } from '@prisma/client'
import { NextResponse } from 'next/server'

type RouteContext = {
  params: Promise<{ id: string }>
}

export async function POST(request: Request, context: RouteContext) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Only students can request coursework grade review' }, { status: 403 })
  }

  const dbUser = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { role: true, isActive: true },
  })
  if (!dbUser?.isActive || dbUser.role !== UserRole.STUDENT) {
    return NextResponse.json({ error: 'Only students can request coursework grade review' }, { status: 403 })
  }

  const { id } = await context.params
  const profile = await prisma.studentProfile.findUnique({
    where: { userId: session.user.id },
    select: { id: true },
  })
  if (!profile) {
    return NextResponse.json({ error: 'Student profile not found' }, { status: 404 })
  }

  const grade = await prisma.courseworkGrade.findFirst({
    where: {
      id,
      studentId: profile.id,
      status: CourseworkGradeStatus.PUBLISHED,
      publication: {
        reviewRequestsEnabled: true,
      },
    },
    select: {
      id: true,
      reviewRequestStatus: true,
      publicationId: true,
      publication: {
        select: {
          title: true,
          teacher: {
            select: {
              user: {
                select: {
                  id: true,
                },
              },
            },
          },
        },
      },
    },
  })
  if (!grade) {
    return NextResponse.json({ error: 'Review-enabled coursework grade not found' }, { status: 404 })
  }

  if (grade.reviewRequestStatus === CourseworkReviewRequestStatus.REQUESTED) {
    return NextResponse.json({ error: 'A review request is already pending for this grade' }, { status: 400 })
  }

  const body = await request.json()
  const updated = await prisma.courseworkGrade.update({
    where: { id: grade.id },
    data: {
      reviewRequestStatus: CourseworkReviewRequestStatus.REQUESTED,
      reviewRequestedAt: new Date(),
      reviewMessage: typeof body.message === 'string' ? body.message.trim() : null,
    },
  })

  await Promise.all([
    createCourseworkNotification({
      userId: grade.publication.teacher.user.id,
      title: 'Coursework grade review requested',
      message: `A student requested a grade review for ${grade.publication.title}.`,
      link: '/teacher/coursework/grading',
      dedupeWindowMs: 60_000,
    }),
    createCourseworkActivityLog({
      userId: session.user.id,
      action: 'coursework.grade.review_request',
      details: JSON.stringify({ gradeId: grade.id, publicationId: grade.publicationId }),
    }),
  ])

  return NextResponse.json({ grade: updated })
}
