import { auth } from '@/lib/auth'
import {
  createCourseworkActivityLog,
  createCourseworkNotification,
} from '@/lib/coursework-enterprise'
import { teacherHasCourseworkPermissionForPublication } from '@/lib/permissions'
import { prisma } from '@/lib/prisma'
import { CourseworkExtensionRequestStatus, UserRole } from '@prisma/client'
import { NextResponse } from 'next/server'

type RouteContext = {
  params: Promise<{ id: string; requestId: string }>
}

export async function PATCH(request: Request, context: RouteContext) {
  const session = await auth()
  if (!session?.user?.id || session.user.role !== UserRole.TEACHER) {
    return NextResponse.json({ error: 'Only teachers can review extension requests' }, { status: 403 })
  }

  const { id, requestId } = await context.params
  const allowed = await teacherHasCourseworkPermissionForPublication(
    { userId: session.user.id, role: session.user.role },
    'coursework.extension',
    id
  )
  if (!allowed) {
    return NextResponse.json({ error: 'You do not have permission to review this extension request' }, { status: 403 })
  }

  const teacherProfile = await prisma.teacherProfile.findUnique({
    where: { userId: session.user.id },
    select: { id: true },
  })
  if (!teacherProfile) {
    return NextResponse.json({ error: 'Teacher profile not found' }, { status: 404 })
  }

  const extensionRequest = await prisma.courseworkExtensionRequest.findFirst({
    where: {
      id: requestId,
      publicationId: id,
    },
    include: {
      student: {
        include: {
          user: {
            select: { id: true },
          },
        },
      },
      publication: {
        select: { title: true },
      },
    },
  })
  if (!extensionRequest) {
    return NextResponse.json({ error: 'Extension request not found' }, { status: 404 })
  }

  const body = await request.json()
  const status = Object.values(CourseworkExtensionRequestStatus).includes(body.status)
    ? body.status
    : CourseworkExtensionRequestStatus.REQUESTED

  const approvedUntil =
    status === CourseworkExtensionRequestStatus.APPROVED && body.approvedUntil
      ? new Date(body.approvedUntil)
      : null

  if (status === CourseworkExtensionRequestStatus.APPROVED && (!approvedUntil || Number.isNaN(approvedUntil.getTime()))) {
    return NextResponse.json({ error: 'A valid approved extension deadline is required' }, { status: 400 })
  }

  const updated = await prisma.courseworkExtensionRequest.update({
    where: { id: requestId },
    data: {
      status,
      approvedUntil,
      teacherNote: typeof body.teacherNote === 'string' ? body.teacherNote.trim() : null,
      decidedAt: new Date(),
      decidedByTeacherId: teacherProfile.id,
      cancelledAt:
        status === CourseworkExtensionRequestStatus.CANCELLED
          ? new Date()
          : null,
    },
  })

  await Promise.all([
    createCourseworkNotification({
      userId: extensionRequest.student.user.id,
      title:
        status === CourseworkExtensionRequestStatus.APPROVED
          ? 'Coursework extension approved'
          : status === CourseworkExtensionRequestStatus.REJECTED
            ? 'Coursework extension rejected'
            : 'Coursework extension updated',
      message: `Your extension request for ${extensionRequest.publication.title} is now ${status.toLowerCase().replaceAll('_', ' ')}.`,
      link: '/student/coursework',
      dedupeWindowMs: 60_000,
    }),
    createCourseworkActivityLog({
      userId: session.user.id,
      action: 'coursework.extension.decision',
      details: JSON.stringify({ publicationId: id, requestId, status }),
    }),
  ])

  return NextResponse.json({ extensionRequest: updated })
}
