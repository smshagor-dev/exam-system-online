import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { createPhase10DiscussionReply, listStudentPhase10Courses } from '@/lib/phase10-lms'
import { phase10DiscussionReplyCreateSchema } from '@/lib/phase10-validators'
import { prisma } from '@/lib/prisma'
import { UserRole } from '@prisma/client'

type RouteContext = { params: Promise<{ id: string }> }

export async function POST(req: NextRequest, { params }: RouteContext) {
  const session = await requireRole(UserRole.STUDENT)
  const { id } = await params
  const parsed = phase10DiscussionReplyCreateSchema.safeParse(await req.json())
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const thread = await prisma.phase10DiscussionThread.findUnique({
    where: { id },
    select: {
      courseId: true,
    },
  })
  if (!thread) return NextResponse.json({ error: 'Thread not found' }, { status: 404 })

  const payload = await listStudentPhase10Courses(session.user.id)
  const allowed = payload.courses.some((course) => course.id === thread.courseId)
  if (!allowed) return NextResponse.json({ error: 'Course not found for student' }, { status: 404 })

  const reply = await createPhase10DiscussionReply(id, session.user.id, parsed.data.body, false)
  return NextResponse.json(reply, { status: 201 })
}
