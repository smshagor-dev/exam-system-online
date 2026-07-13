import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePhase10Permission } from '@/lib/phase10-route-auth'
import { moderatePhase10DiscussionThread } from '@/lib/phase10-lms'
import { phase10DiscussionModerationSchema } from '@/lib/phase10-validators'

type RouteContext = { params: Promise<{ id: string }> }

export async function PATCH(req: NextRequest, { params }: RouteContext) {
  const { id } = await params
  const thread = await prisma.phase10DiscussionThread.findUnique({
    where: { id },
    include: {
      course: true,
    },
  })
  if (!thread) return NextResponse.json({ error: 'Thread not found' }, { status: 404 })

  const access = await requirePhase10Permission('lms.discussion.moderate', {
    departmentId: thread.course.departmentId,
    academicOfferingId: thread.course.academicOfferingId,
    subjectId: thread.course.subjectId,
    languageId: thread.course.languageId,
    groupId: thread.course.groupId,
    semesterId: thread.course.semesterId,
  })
  if (!access) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const parsed = phase10DiscussionModerationSchema.safeParse(await req.json())
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const updated = await moderatePhase10DiscussionThread(id, parsed.data, access.session.user.id)
  return NextResponse.json(updated)
}
