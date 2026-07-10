import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { UserRole } from '@prisma/client'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user?.id || session.user.role !== UserRole.STUDENT) {
    return NextResponse.json({ error: 'Only students can request coursework access' }, { status: 403 })
  }

  const profile = await prisma.studentProfile.findUnique({
    where: { userId: session.user.id },
    select: { id: true },
  })

  if (!profile) {
    return NextResponse.json({ error: 'Student profile not found' }, { status: 404 })
  }

  const body = await request.json()
  const assignmentId = String(body.assignmentId || '').trim()
  const message = String(body.message || '').trim()

  if (!assignmentId) {
    return NextResponse.json({ error: 'Assignment is required' }, { status: 400 })
  }

  const assignment = await prisma.courseworkAssignment.findFirst({
    where: {
      id: assignmentId,
      studentId: profile.id,
    },
    include: {
      rule: {
        select: {
          submissionDeadline: true,
        },
      },
      accessRequests: {
        orderBy: {
          createdAt: 'desc',
        },
        take: 1,
      },
    },
  })

  if (!assignment) {
    return NextResponse.json({ error: 'Coursework assignment not found' }, { status: 404 })
  }

  if (!assignment.rule?.submissionDeadline || assignment.rule.submissionDeadline.getTime() >= Date.now()) {
    return NextResponse.json({ error: 'You can request access only after the original deadline is over' }, { status: 400 })
  }

  const latestRequest = assignment.accessRequests[0]
  if (latestRequest?.status === 'PENDING') {
    return NextResponse.json({ error: 'Your access request is already pending teacher review' }, { status: 400 })
  }

  if (latestRequest?.status === 'APPROVED' && latestRequest.extensionDeadline && latestRequest.extensionDeadline.getTime() > Date.now()) {
    return NextResponse.json({ error: 'You already have active access from the teacher' }, { status: 400 })
  }

  const accessRequest = await prisma.courseworkAccessRequest.create({
    data: {
      assignmentId: assignment.id,
      studentId: profile.id,
      message: message || null,
    },
  })

  return NextResponse.json({
    accessRequest,
    message: 'Access request sent to your teacher.',
  })
}
