import { auth } from '@/lib/auth'
import { createCourseworkActivityLog } from '@/lib/coursework-enterprise'
import { studentCanAccessCourseworkPublication } from '@/lib/permissions'
import { prisma } from '@/lib/prisma'
import { CourseworkExtensionRequestStatus, UserRole } from '@prisma/client'
import { NextResponse } from 'next/server'

type RouteContext = {
  params: Promise<{ id: string }>
}

export async function GET(_: Request, context: RouteContext) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Only students can view extension requests' }, { status: 403 })
  }

  const dbUser = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { role: true, isActive: true },
  })
  if (!dbUser?.isActive || dbUser.role !== UserRole.STUDENT) {
    return NextResponse.json({ error: 'Only students can view extension requests' }, { status: 403 })
  }

  const { id } = await context.params
  const access = await studentCanAccessCourseworkPublication(session.user.id, id)
  if (!access.allowed || !access.studentProfileId) {
    return NextResponse.json({ error: access.reason || 'Forbidden' }, { status: 403 })
  }

  const requests = await prisma.courseworkExtensionRequest.findMany({
    where: {
      publicationId: id,
      studentId: access.studentProfileId,
    },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json({ requests })
}

export async function POST(request: Request, context: RouteContext) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Only students can request coursework extensions' }, { status: 403 })
  }

  const dbUser = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { role: true, isActive: true },
  })
  if (!dbUser?.isActive || dbUser.role !== UserRole.STUDENT) {
    return NextResponse.json({ error: 'Only students can request coursework extensions' }, { status: 403 })
  }

  const { id } = await context.params
  const access = await studentCanAccessCourseworkPublication(session.user.id, id)
  if (!access.allowed || !access.studentProfileId) {
    return NextResponse.json({ error: access.reason || 'Forbidden' }, { status: 403 })
  }

  const publication = await prisma.courseworkPublication.findUnique({
    where: { id },
    select: {
      id: true,
      extensionEnabled: true,
    },
  })

  if (!publication) {
    return NextResponse.json({ error: 'Coursework publication not found' }, { status: 404 })
  }

  if (!publication.extensionEnabled) {
    return NextResponse.json({ error: 'Extensions are disabled for this coursework' }, { status: 400 })
  }

  const body = await request.json()
  const requestedUntil = body.requestedUntil ? new Date(body.requestedUntil) : null
  if (!requestedUntil || Number.isNaN(requestedUntil.getTime())) {
    return NextResponse.json({ error: 'A valid requested extension deadline is required' }, { status: 400 })
  }

  const extensionRequest = await prisma.courseworkExtensionRequest.create({
    data: {
      publicationId: id,
      studentId: access.studentProfileId,
      status: CourseworkExtensionRequestStatus.REQUESTED,
      requestedUntil,
      reason: typeof body.reason === 'string' ? body.reason.trim() : null,
    },
  })

  await createCourseworkActivityLog({
    userId: session.user.id,
    action: 'coursework.extension.request',
    details: JSON.stringify({ publicationId: id, extensionRequestId: extensionRequest.id }),
  })

  return NextResponse.json({ extensionRequest }, { status: 201 })
}

export async function PATCH(request: Request, context: RouteContext) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Only students can update extension requests' }, { status: 403 })
  }

  const dbUser = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { role: true, isActive: true },
  })
  if (!dbUser?.isActive || dbUser.role !== UserRole.STUDENT) {
    return NextResponse.json({ error: 'Only students can update extension requests' }, { status: 403 })
  }

  const { id } = await context.params
  const access = await studentCanAccessCourseworkPublication(session.user.id, id)
  if (!access.allowed || !access.studentProfileId) {
    return NextResponse.json({ error: access.reason || 'Forbidden' }, { status: 403 })
  }

  const body = await request.json()
  const requestId = String(body.requestId || '').trim()
  const action = String(body.action || '').trim().toUpperCase()

  if (!requestId || action !== 'CANCEL') {
    return NextResponse.json({ error: 'Only request cancellation is supported here' }, { status: 400 })
  }

  const extensionRequest = await prisma.courseworkExtensionRequest.findFirst({
    where: {
      id: requestId,
      publicationId: id,
      studentId: access.studentProfileId,
      status: CourseworkExtensionRequestStatus.REQUESTED,
    },
  })

  if (!extensionRequest) {
    return NextResponse.json({ error: 'Pending extension request not found' }, { status: 404 })
  }

  const updated = await prisma.courseworkExtensionRequest.update({
    where: { id: requestId },
    data: {
      status: CourseworkExtensionRequestStatus.CANCELLED,
      cancelledAt: new Date(),
    },
  })

  await createCourseworkActivityLog({
    userId: session.user.id,
    action: 'coursework.extension.cancel',
    details: JSON.stringify({ publicationId: id, requestId }),
  })

  return NextResponse.json({ extensionRequest: updated })
}
