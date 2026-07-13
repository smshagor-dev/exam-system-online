import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePhase10Permission } from '@/lib/phase10-route-auth'
import { schedulePhase10LiveClass } from '@/lib/phase10-lms'
import { phase10LiveClassCreateSchema } from '@/lib/phase10-validators'

type RouteContext = { params: Promise<{ id: string }> }

export async function POST(req: Request, { params }: RouteContext) {
  const { id } = await params
  const lesson = await prisma.phase10Lesson.findUnique({
    where: { id },
    include: { course: true },
  })
  if (!lesson) return NextResponse.json({ error: 'Lesson not found' }, { status: 404 })

  const access = await requirePhase10Permission('lms.liveclass.manage', {
    departmentId: lesson.course.departmentId,
    academicOfferingId: lesson.course.academicOfferingId,
    subjectId: lesson.course.subjectId,
    languageId: lesson.course.languageId,
    groupId: lesson.course.groupId,
    semesterId: lesson.course.semesterId,
  })
  if (!access) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const parsed = phase10LiveClassCreateSchema.safeParse(await req.json())
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const liveClass = await schedulePhase10LiveClass(id, {
    ...parsed.data,
    startAt: new Date(parsed.data.startAt),
    endAt: new Date(parsed.data.endAt),
  })
  return NextResponse.json(liveClass, { status: 201 })
}
