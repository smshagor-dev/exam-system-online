import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { createPhase10DiscussionThread, listStudentPhase10Courses } from '@/lib/phase10-lms'
import { phase10DiscussionThreadCreateSchema } from '@/lib/phase10-validators'
import { prisma } from '@/lib/prisma'
import { UserRole } from '@prisma/client'

export async function GET() {
  const session = await requireRole(UserRole.STUDENT)
  const payload = await listStudentPhase10Courses(session.user.id)
  const courseIds = payload.courses.map((course) => course.id)

  const threads = await prisma.phase10DiscussionThread.findMany({
    where: {
      courseId: {
        in: courseIds,
      },
    },
    include: {
      replies: true,
    },
    orderBy: [{ isPinned: 'desc' }, { createdAt: 'desc' }],
  })

  return NextResponse.json(threads)
}

export async function POST(req: NextRequest) {
  const session = await requireRole(UserRole.STUDENT)
  const parsed = phase10DiscussionThreadCreateSchema.safeParse(await req.json())
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const payload = await listStudentPhase10Courses(session.user.id)
  const allowed = payload.courses.some((course) => course.id === parsed.data.courseId)
  if (!allowed) return NextResponse.json({ error: 'Course not found for student' }, { status: 404 })

  const thread = await createPhase10DiscussionThread(session.user.id, parsed.data)
  return NextResponse.json(thread, { status: 201 })
}
