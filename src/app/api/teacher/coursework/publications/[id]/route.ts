import { auth } from '@/lib/auth'
import { createCourseworkActivityLog, createCourseworkNotification } from '@/lib/coursework-enterprise'
import { teacherHasCourseworkPermissionForPublication } from '@/lib/permissions'
import { prisma } from '@/lib/prisma'
import { CourseworkPublicationStatus, UserRole } from '@prisma/client'
import { NextResponse } from 'next/server'

type RouteContext = {
  params: Promise<{ id: string }>
}

const ALLOWED_PUBLICATION_TRANSITIONS: Record<CourseworkPublicationStatus, CourseworkPublicationStatus[]> = {
  [CourseworkPublicationStatus.DRAFT]: [
    CourseworkPublicationStatus.DRAFT,
    CourseworkPublicationStatus.SCHEDULED,
    CourseworkPublicationStatus.PUBLISHED,
    CourseworkPublicationStatus.ARCHIVED,
  ],
  [CourseworkPublicationStatus.SCHEDULED]: [
    CourseworkPublicationStatus.SCHEDULED,
    CourseworkPublicationStatus.DRAFT,
    CourseworkPublicationStatus.PUBLISHED,
    CourseworkPublicationStatus.ARCHIVED,
  ],
  [CourseworkPublicationStatus.PUBLISHED]: [
    CourseworkPublicationStatus.PUBLISHED,
    CourseworkPublicationStatus.CLOSED,
    CourseworkPublicationStatus.ARCHIVED,
  ],
  [CourseworkPublicationStatus.CLOSED]: [
    CourseworkPublicationStatus.CLOSED,
    CourseworkPublicationStatus.ARCHIVED,
  ],
  [CourseworkPublicationStatus.ARCHIVED]: [
    CourseworkPublicationStatus.ARCHIVED,
  ],
}

export async function PATCH(request: Request, context: RouteContext) {
  const session = await auth()
  if (!session?.user?.id || session.user.role !== UserRole.TEACHER) {
    return NextResponse.json({ error: 'Only teachers can update coursework publications' }, { status: 403 })
  }

  const { id } = await context.params
  const allowed = await teacherHasCourseworkPermissionForPublication(
    { userId: session.user.id, role: session.user.role },
    'coursework.publish',
    id
  )
  if (!allowed) {
    return NextResponse.json({ error: 'You do not have permission to update this coursework publication' }, { status: 403 })
  }

  const publication = await prisma.courseworkPublication.findUnique({
    where: { id },
    include: {
      targets: {
        include: {
          student: {
            select: { userId: true },
          },
        },
      },
    },
  })

  if (!publication) {
    return NextResponse.json({ error: 'Coursework publication not found' }, { status: 404 })
  }

  const body = await request.json()
  const nextStatus = Object.values(CourseworkPublicationStatus).includes(body.status)
    ? body.status
    : publication.status

  if (!ALLOWED_PUBLICATION_TRANSITIONS[publication.status].includes(nextStatus)) {
    return NextResponse.json(
      {
        error: `Invalid publication transition from ${publication.status} to ${nextStatus}`,
      },
      { status: 400 }
    )
  }

  const isPublishedLocked =
    publication.status === CourseworkPublicationStatus.PUBLISHED ||
    publication.status === CourseworkPublicationStatus.CLOSED ||
    publication.status === CourseworkPublicationStatus.ARCHIVED

  if (
    isPublishedLocked &&
    (
      (typeof body.title === 'string' && body.title.trim() !== publication.title) ||
      (typeof body.description === 'string' && body.description.trim() !== (publication.description ?? '')) ||
      (typeof body.instructions === 'string' && body.instructions.trim() !== (publication.instructions ?? ''))
    )
  ) {
    return NextResponse.json(
      {
        error: 'Published coursework content is immutable. Create a new version or audited revision instead.',
      },
      { status: 400 }
    )
  }

  const updated = await prisma.courseworkPublication.update({
    where: { id },
    data: {
      title: typeof body.title === 'string' ? body.title.trim() : publication.title,
      description: typeof body.description === 'string' ? body.description.trim() : publication.description,
      instructions: typeof body.instructions === 'string' ? body.instructions.trim() : publication.instructions,
      status: nextStatus,
      scheduledFor: body.scheduledFor ? new Date(body.scheduledFor) : publication.scheduledFor,
      publishedAt:
        nextStatus === CourseworkPublicationStatus.PUBLISHED
          ? publication.publishedAt ?? new Date()
          : publication.publishedAt,
      closedAt:
        nextStatus === CourseworkPublicationStatus.CLOSED
          ? publication.closedAt ?? new Date()
          : body.closedAt
            ? new Date(body.closedAt)
            : publication.closedAt,
      archivedAt:
        nextStatus === CourseworkPublicationStatus.ARCHIVED
          ? publication.archivedAt ?? new Date()
          : body.archivedAt
            ? new Date(body.archivedAt)
            : publication.archivedAt,
      dueAt: body.dueAt ? new Date(body.dueAt) : publication.dueAt,
      hardCloseAt: body.hardCloseAt ? new Date(body.hardCloseAt) : publication.hardCloseAt,
    },
  })

  if (nextStatus === CourseworkPublicationStatus.PUBLISHED && publication.status !== CourseworkPublicationStatus.PUBLISHED) {
    await Promise.all(
      publication.targets.map((target) =>
        createCourseworkNotification({
          userId: target.student.userId,
          title: 'Coursework published',
          message: `A coursework assignment is now available: ${updated.title}`,
          link: '/student/coursework',
        })
      )
    )
  }
  if (
    publication.status === CourseworkPublicationStatus.PUBLISHED &&
    nextStatus === CourseworkPublicationStatus.PUBLISHED &&
    (
      updated.title !== publication.title ||
      (updated.description ?? '') !== (publication.description ?? '') ||
      (updated.instructions ?? '') !== (publication.instructions ?? '') ||
      updated.dueAt?.toISOString() !== publication.dueAt?.toISOString() ||
      updated.hardCloseAt?.toISOString() !== publication.hardCloseAt?.toISOString()
    )
  ) {
    await Promise.all(
      publication.targets.map((target) =>
        createCourseworkNotification({
          userId: target.student.userId,
          title: 'Coursework updated',
          message: `A coursework assignment was updated: ${updated.title}`,
          link: '/student/coursework',
          dedupeWindowMs: 60_000,
        })
      )
    )
  }

  await createCourseworkActivityLog({
    userId: session.user.id,
    action: 'coursework.publication.update',
    details: JSON.stringify({ publicationId: id, status: nextStatus }),
  })

  return NextResponse.json({ publication: updated })
}
