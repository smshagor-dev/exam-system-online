import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePhase10Permission } from '@/lib/phase10-route-auth'
import { publishPhase10Lesson } from '@/lib/phase10-lms'

type RouteContext = { params: Promise<{ id: string }> }

export async function POST(_req: Request, { params }: RouteContext) {
  const { id } = await params
  const lesson = await prisma.phase10Lesson.findUnique({
    where: { id },
    include: { course: true },
  })
  if (!lesson) return NextResponse.json({ error: 'Lesson not found' }, { status: 404 })

  const access = await requirePhase10Permission('lms.lesson.publish', {
    departmentId: lesson.course.departmentId,
    academicOfferingId: lesson.course.academicOfferingId,
    subjectId: lesson.course.subjectId,
    languageId: lesson.course.languageId,
    groupId: lesson.course.groupId,
    semesterId: lesson.course.semesterId,
  })
  if (!access) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const published = await publishPhase10Lesson(id)
  return NextResponse.json(published)
}
