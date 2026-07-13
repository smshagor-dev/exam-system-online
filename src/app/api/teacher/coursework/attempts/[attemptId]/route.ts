import { auth } from '@/lib/auth'
import { createCourseworkActivityLog, createCourseworkNotification } from '@/lib/coursework-enterprise'
import { teacherHasCourseworkPermissionForPublication } from '@/lib/permissions'
import { prisma } from '@/lib/prisma'
import { CourseworkAttemptStatus, UserRole } from '@prisma/client'
import { NextResponse } from 'next/server'

type RouteContext = {
  params: Promise<{ attemptId: string }>
}

export async function PATCH(request: Request, context: RouteContext) {
  const session = await auth()
  if (!session?.user?.id || session.user.role !== UserRole.TEACHER) {
    return NextResponse.json({ error: 'Only teachers can update coursework attempts' }, { status: 403 })
  }

  const { attemptId } = await context.params
  const attempt = await prisma.courseworkAttempt.findUnique({
    where: { id: attemptId },
    include: {
      publication: {
        select: {
          id: true,
          title: true,
        },
      },
      student: {
        include: {
          user: {
            select: { id: true },
          },
        },
      },
    },
  })

  if (!attempt) {
    return NextResponse.json({ error: 'Coursework attempt not found' }, { status: 404 })
  }

  const allowed = await teacherHasCourseworkPermissionForPublication(
    { userId: session.user.id, role: session.user.role },
    'coursework.review',
    attempt.publicationId
  )
  if (!allowed) {
    return NextResponse.json({ error: 'You do not have permission to update this coursework attempt' }, { status: 403 })
  }

  const teacherProfile = await prisma.teacherProfile.findUnique({
    where: { userId: session.user.id },
    select: { id: true },
  })
  if (!teacherProfile) {
    return NextResponse.json({ error: 'Teacher profile not found' }, { status: 404 })
  }

  const body = await request.json()
  const action = String(body.action || '').trim().toUpperCase()

  if (action === 'RETURN') {
    if (attempt.status !== CourseworkAttemptStatus.SUBMITTED) {
      return NextResponse.json({ error: 'Only submitted attempts can be returned for resubmission' }, { status: 400 })
    }

    const updated = await prisma.courseworkAttempt.update({
      where: { id: attempt.id },
      data: {
        status: CourseworkAttemptStatus.RETURNED,
        returnedAt: new Date(),
        teacherLocked: false,
        lockedAt: null,
        lockedByTeacherId: null,
      },
    })

    await Promise.all([
      createCourseworkNotification({
        userId: attempt.student.user.id,
        title: 'Coursework resubmission allowed',
        message: `Your submission for ${attempt.publication.title} was returned for revision.`,
        link: '/student/coursework',
        dedupeWindowMs: 60_000,
      }),
      createCourseworkActivityLog({
        userId: session.user.id,
        action: 'coursework.attempt.return',
        details: JSON.stringify({ attemptId: attempt.id, publicationId: attempt.publicationId }),
      }),
    ])

    return NextResponse.json({ attempt: updated })
  }

  if (action === 'LOCK') {
    const updated = await prisma.courseworkAttempt.update({
      where: { id: attempt.id },
      data: {
        status: CourseworkAttemptStatus.LOCKED,
        teacherLocked: true,
        lockedAt: new Date(),
        lockedByTeacherId: teacherProfile.id,
      },
    })

    await createCourseworkActivityLog({
      userId: session.user.id,
      action: 'coursework.attempt.lock',
      details: JSON.stringify({ attemptId: attempt.id, publicationId: attempt.publicationId }),
    })

    return NextResponse.json({ attempt: updated })
  }

  return NextResponse.json({ error: 'Unsupported attempt update action' }, { status: 400 })
}
