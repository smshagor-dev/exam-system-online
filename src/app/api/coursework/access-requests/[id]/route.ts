import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { CourseworkAccessRequestStatus, UserRole } from '@prisma/client'
import { NextResponse } from 'next/server'

type Context = {
  params: Promise<{
    id: string
  }>
}

export async function PATCH(request: Request, context: Context) {
  const session = await auth()
  if (!session?.user?.id || session.user.role !== UserRole.TEACHER) {
    return NextResponse.json({ error: 'Only teachers can manage access requests' }, { status: 403 })
  }

  const profile = await prisma.teacherProfile.findUnique({
    where: { userId: session.user.id },
    select: { id: true },
  })

  if (!profile) {
    return NextResponse.json({ error: 'Teacher profile not found' }, { status: 404 })
  }

  const { id } = await context.params
  const body = await request.json()
  const action = String(body.action || '').trim().toUpperCase()
  const extensionDeadlineInput = String(body.extensionDeadline || '').trim()
  const teacherNote = String(body.teacherNote || '').trim()

  if (action !== 'APPROVE' && action !== 'REJECT') {
    return NextResponse.json({ error: 'Invalid request action' }, { status: 400 })
  }

  const accessRequest = await prisma.courseworkAccessRequest.findFirst({
    where: {
      id,
      assignment: {
        teacherId: profile.id,
      },
    },
    include: {
      assignment: {
        include: {
          rule: {
            select: {
              submissionDeadline: true,
            },
          },
        },
      },
    },
  })

  if (!accessRequest) {
    return NextResponse.json({ error: 'Access request not found' }, { status: 404 })
  }

  let extensionDeadline: Date | null = null
  if (action === 'APPROVE') {
    extensionDeadline = extensionDeadlineInput ? new Date(extensionDeadlineInput) : null
    if (!extensionDeadline || Number.isNaN(extensionDeadline.getTime())) {
      return NextResponse.json({ error: 'Extension deadline is required for approval' }, { status: 400 })
    }

    const minimumDate = accessRequest.assignment.rule?.submissionDeadline ?? new Date()
    if (extensionDeadline.getTime() <= minimumDate.getTime()) {
      return NextResponse.json({ error: 'Extension deadline must be after the original deadline' }, { status: 400 })
    }
  }

  const updatedRequest = await prisma.courseworkAccessRequest.update({
    where: { id: accessRequest.id },
    data: {
      status: action === 'APPROVE' ? CourseworkAccessRequestStatus.APPROVED : CourseworkAccessRequestStatus.REJECTED,
      extensionDeadline,
      teacherNote: teacherNote || null,
      reviewedAt: new Date(),
    },
  })

  return NextResponse.json(updatedRequest)
}
