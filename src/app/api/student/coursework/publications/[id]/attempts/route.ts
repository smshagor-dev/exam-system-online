import { auth } from '@/lib/auth'
import { submitCourseworkAttemptForStudent } from '@/lib/coursework-enterprise-submission'
import { studentCanAccessCourseworkPublication } from '@/lib/permissions'
import { prisma } from '@/lib/prisma'
import {
  CourseworkGradeStatus,
  UserRole,
} from '@prisma/client'
import { NextResponse } from 'next/server'

type RouteContext = {
  params: Promise<{ id: string }>
}

export async function GET(_: Request, context: RouteContext) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Only students can view coursework attempts' }, { status: 403 })
  }

  const dbUser = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { role: true, isActive: true },
  })
  if (!dbUser?.isActive || dbUser.role !== UserRole.STUDENT) {
    return NextResponse.json({ error: 'Only students can view coursework attempts' }, { status: 403 })
  }

  const { id } = await context.params
  const access = await studentCanAccessCourseworkPublication(session.user.id, id)
  if (!access.allowed || !access.studentProfileId) {
    return NextResponse.json({ error: access.reason || 'Forbidden' }, { status: 403 })
  }

  const attempts = await prisma.courseworkAttempt.findMany({
    where: {
      publicationId: id,
      studentId: access.studentProfileId,
    },
    include: {
      attachments: true,
      grades: {
        where: {
          status: CourseworkGradeStatus.PUBLISHED,
        },
        include: {
          criterionScores: true,
          feedbackAttachments: true,
        },
        orderBy: { updatedAt: 'desc' },
      },
    },
    orderBy: { attemptNumber: 'desc' },
  })

  return NextResponse.json({ attempts })
}

export async function POST(request: Request, context: RouteContext) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Only students can submit coursework attempts' }, { status: 403 })
  }

  const dbUser = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { role: true, isActive: true },
  })
  if (!dbUser?.isActive || dbUser.role !== UserRole.STUDENT) {
    return NextResponse.json({ error: 'Only students can submit coursework attempts' }, { status: 403 })
  }

  const { id } = await context.params
  const formData = await request.formData()
  const files = formData.getAll('files').filter((value): value is File => value instanceof File && value.size > 0)
  const result = await submitCourseworkAttemptForStudent({
    publicationId: id,
    studentUserId: session.user.id,
    plainTextSubmission: String(formData.get('plainTextSubmission') || ''),
    richTextSubmission: String(formData.get('richTextSubmission') || ''),
    externalLink: String(formData.get('externalLink') || ''),
    repositoryUrl: String(formData.get('repositoryUrl') || ''),
    idempotencyKey: String(formData.get('idempotencyKey') || '').trim() || null,
    attachments: await Promise.all(
      files.map(async (file) => ({
        name: file.name,
        mimeType: file.type || 'application/octet-stream',
        size: file.size,
        bytes: Buffer.from(await file.arrayBuffer()),
      }))
    ),
  })

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }

  return NextResponse.json(
    {
      attempt: result.attempt,
      remainingAttempts: result.remainingAttempts,
      late: result.late,
      latePenaltyApplied: result.latePenaltyApplied,
      idempotent: result.idempotent,
    },
    { status: result.status }
  )
}
