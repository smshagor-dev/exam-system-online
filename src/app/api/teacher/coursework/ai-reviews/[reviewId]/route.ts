import { auth } from '@/lib/auth'
import { createCourseworkActivityLog, createCourseworkNotification } from '@/lib/coursework-enterprise'
import { teacherHasCourseworkPermissionForPublication } from '@/lib/permissions'
import { prisma } from '@/lib/prisma'
import { appendCourseworkAiAudit } from '@/services/coursework-ai-review.service'
import { CourseworkAttemptStatus, UserRole } from '@prisma/client'
import { NextResponse } from 'next/server'

type RouteContext = {
  params: Promise<{ reviewId: string }>
}

async function loadAuthorizedReview(reviewId: string, session: { user: { id: string; role: UserRole } }) {
  const review = await prisma.courseworkAIReview.findUnique({
    where: { id: reviewId },
    include: {
      publication: {
        select: {
          id: true,
          title: true,
        },
      },
      attempt: {
        select: {
          id: true,
          status: true,
          attemptNumber: true,
          previousAttemptId: true,
        },
      },
      student: {
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      },
      checks: true,
      findings: true,
      sourceMatches: true,
      rubricSuggestions: true,
      citationFindings: true,
      grammarFindings: true,
      recommendations: true,
      audits: {
        orderBy: { createdAt: 'desc' },
      },
    },
  })

  if (!review) {
    return { error: NextResponse.json({ error: 'AI review not found' }, { status: 404 }) }
  }

  const allowed = await teacherHasCourseworkPermissionForPublication(
    { userId: session.user.id, role: session.user.role },
    'coursework.review',
    review.publicationId
  )
  if (!allowed) {
    return { error: NextResponse.json({ error: 'You do not have permission to manage this AI review' }, { status: 403 }) }
  }

  return { review }
}

export async function GET(_: Request, context: RouteContext) {
  const session = await auth()
  if (!session?.user?.id || session.user.role !== UserRole.TEACHER) {
    return NextResponse.json({ error: 'Only teachers can view AI coursework reviews' }, { status: 403 })
  }

  const { reviewId } = await context.params
  const authorized = await loadAuthorizedReview(reviewId, { user: { id: session.user.id, role: session.user.role } })
  if ('error' in authorized) {
    return authorized.error
  }

  return NextResponse.json({ review: authorized.review })
}

export async function PATCH(request: Request, context: RouteContext) {
  const session = await auth()
  if (!session?.user?.id || session.user.role !== UserRole.TEACHER) {
    return NextResponse.json({ error: 'Only teachers can manage AI coursework reviews' }, { status: 403 })
  }

  const { reviewId } = await context.params
  const authorized = await loadAuthorizedReview(reviewId, { user: { id: session.user.id, role: session.user.role } })
  if ('error' in authorized) {
    return authorized.error
  }
  const review = authorized.review

  const teacherProfile = await prisma.teacherProfile.findUnique({
    where: { userId: session.user.id },
    select: { id: true },
  })
  if (!teacherProfile) {
    return NextResponse.json({ error: 'Teacher profile not found' }, { status: 404 })
  }

  const body = await request.json()
  const action = String(body.action || '').trim().toUpperCase()
  const note = typeof body.note === 'string' ? body.note.trim() : ''

  if (action === 'RELEASE') {
    await appendCourseworkAiAudit({
      reviewId: review.id,
      actorTeacherId: teacherProfile.id,
      action: 'RELEASED_TO_STUDENT',
      details: note ? { note } : null,
    })

    await Promise.all([
      createCourseworkNotification({
        userId: review.student.user.id,
        title: 'Coursework AI review released',
        message: `AI review feedback is now available for ${review.publication.title}.`,
        link: `/student/coursework/${review.publicationId}/history`,
        dedupeWindowMs: 60_000,
      }),
      createCourseworkActivityLog({
        userId: session.user.id,
        action: 'coursework.ai-review.release',
        details: JSON.stringify({ reviewId: review.id, attemptId: review.attemptId }),
      }),
    ])

    return NextResponse.json({ ok: true })
  }

  if (action === 'APPROVE' || action === 'REJECT' || action === 'MANUAL_REVIEW' || action === 'RETURN') {
    const auditAction =
      action === 'APPROVE'
        ? 'TEACHER_APPROVE'
        : action === 'REJECT'
          ? 'TEACHER_REJECT'
          : action === 'MANUAL_REVIEW'
            ? 'TEACHER_MANUAL_REVIEW'
            : 'TEACHER_RETURN'

    await appendCourseworkAiAudit({
      reviewId: review.id,
      actorTeacherId: teacherProfile.id,
      action: auditAction,
      details: note ? { note } : null,
    })

    if (action === 'APPROVE' && review.attempt.status === CourseworkAttemptStatus.SUBMITTED) {
      await prisma.courseworkAttempt.update({
        where: { id: review.attemptId },
        data: {
          status: CourseworkAttemptStatus.LOCKED,
          teacherLocked: true,
          lockedAt: new Date(),
          lockedByTeacherId: teacherProfile.id,
        },
      })
    }

    if (action === 'RETURN' && review.attempt.status === CourseworkAttemptStatus.SUBMITTED) {
      await prisma.courseworkAttempt.update({
        where: { id: review.attemptId },
        data: {
          status: CourseworkAttemptStatus.RETURNED,
          teacherLocked: false,
          lockedAt: null,
          lockedByTeacherId: null,
          returnedAt: new Date(),
        },
      })

      await createCourseworkNotification({
        userId: review.student.user.id,
        title: 'Coursework returned for revision',
        message: `Your coursework for ${review.publication.title} was returned for revision.`,
        link: `/student/coursework/${review.publicationId}/history`,
        dedupeWindowMs: 60_000,
      })
    }

    await createCourseworkActivityLog({
      userId: session.user.id,
      action: `coursework.ai-review.${action.toLowerCase()}`,
      details: JSON.stringify({ reviewId: review.id, attemptId: review.attemptId, note }),
    })

    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'Unsupported AI review action' }, { status: 400 })
}
