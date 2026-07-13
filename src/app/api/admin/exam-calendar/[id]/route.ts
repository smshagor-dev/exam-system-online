import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePhase8Permission } from '@/lib/phase8-route-auth'
import { updateExamCalendarSchema } from '@/lib/phase8-validators'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const existing = await prisma.examAcademicCalendar.findUnique({
    where: { id },
    select: { id: true, departmentId: true },
  })
  if (!existing) return NextResponse.json({ error: 'Calendar not found' }, { status: 404 })

  const access = await requirePhase8Permission('calendar.manage', { departmentId: existing.departmentId })
  if (!access) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const parsed = updateExamCalendarSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const updated = await prisma.examAcademicCalendar.update({
    where: { id },
    data: {
      ...parsed.data,
      teachingStartsAt: parsed.data.teachingStartsAt ? new Date(parsed.data.teachingStartsAt) : undefined,
      teachingEndsAt: parsed.data.teachingEndsAt ? new Date(parsed.data.teachingEndsAt) : undefined,
      registrationStartsAt: parsed.data.registrationStartsAt ? new Date(parsed.data.registrationStartsAt) : undefined,
      registrationEndsAt: parsed.data.registrationEndsAt ? new Date(parsed.data.registrationEndsAt) : undefined,
      courseworkStartsAt: parsed.data.courseworkStartsAt ? new Date(parsed.data.courseworkStartsAt) : undefined,
      courseworkEndsAt: parsed.data.courseworkEndsAt ? new Date(parsed.data.courseworkEndsAt) : undefined,
      examinationStartsAt: parsed.data.examinationStartsAt ? new Date(parsed.data.examinationStartsAt) : undefined,
      examinationEndsAt: parsed.data.examinationEndsAt ? new Date(parsed.data.examinationEndsAt) : undefined,
      makeupStartsAt: parsed.data.makeupStartsAt ? new Date(parsed.data.makeupStartsAt) : parsed.data.makeupStartsAt,
      makeupEndsAt: parsed.data.makeupEndsAt ? new Date(parsed.data.makeupEndsAt) : parsed.data.makeupEndsAt,
      publishedAt: parsed.data.publishedAt ? new Date(parsed.data.publishedAt) : parsed.data.publishedAt,
    },
  })

  return NextResponse.json(updated)
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const existing = await prisma.examAcademicCalendar.findUnique({
    where: { id },
    select: { id: true, departmentId: true },
  })
  if (!existing) return NextResponse.json({ error: 'Calendar not found' }, { status: 404 })

  const access = await requirePhase8Permission('calendar.manage', { departmentId: existing.departmentId })
  if (!access) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  await prisma.examAcademicCalendar.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
