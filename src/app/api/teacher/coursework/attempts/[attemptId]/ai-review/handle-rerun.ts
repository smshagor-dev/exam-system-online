import { auth } from '@/lib/auth'
import { createCourseworkActivityLog } from '@/lib/coursework-enterprise'
import { teacherHasCourseworkPermissionForPublication } from '@/lib/permissions'
import { prisma } from '@/lib/prisma'
import { runCourseworkAiReview } from '@/services/coursework-ai-review.service'
import { UserRole } from '@prisma/client'
import { NextResponse } from 'next/server'

export async function handleCourseworkAiReviewRerun(attemptId: string) {
  const session = await auth()
  if (!session?.user?.id || session.user.role !== UserRole.TEACHER) {
    return NextResponse.json({ error: 'Only teachers can re-run AI coursework reviews' }, { status: 403 })
  }

  const attempt = await prisma.courseworkAttempt.findUnique({
    where: { id: attemptId },
    select: {
      id: true,
      publicationId: true,
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
    return NextResponse.json({ error: 'You do not have permission to review this coursework attempt' }, { status: 403 })
  }

  const result = await runCourseworkAiReview({
    attemptId: attempt.id,
    trigger: 'RERUN',
    requestedByUserId: session.user.id,
  })

  await createCourseworkActivityLog({
    userId: session.user.id,
    action: 'coursework.ai-review.rerun',
    details: JSON.stringify({ attemptId: attempt.id, publicationId: attempt.publicationId, reviewId: result.reviewId }),
  })

  return NextResponse.json({ ok: true, ...result })
}
