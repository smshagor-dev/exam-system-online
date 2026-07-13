import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePhase8Permission } from '@/lib/phase8-route-auth'
import { updateExamHolidaySchema } from '@/lib/phase8-validators'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const existing = await prisma.examCalendarHoliday.findUnique({
    where: { id },
    include: {
      calendar: {
        select: {
          departmentId: true,
        },
      },
    },
  })
  if (!existing) return NextResponse.json({ error: 'Holiday not found' }, { status: 404 })

  const access = await requirePhase8Permission('calendar.manage', { departmentId: existing.calendar.departmentId })
  if (!access) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const parsed = updateExamHolidaySchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const holiday = await prisma.examCalendarHoliday.update({
    where: { id },
    data: {
      ...parsed.data,
      startsAt: parsed.data.startsAt ? new Date(parsed.data.startsAt) : undefined,
      endsAt: parsed.data.endsAt ? new Date(parsed.data.endsAt) : undefined,
    },
  })

  return NextResponse.json(holiday)
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const existing = await prisma.examCalendarHoliday.findUnique({
    where: { id },
    include: {
      calendar: {
        select: {
          departmentId: true,
        },
      },
    },
  })
  if (!existing) return NextResponse.json({ error: 'Holiday not found' }, { status: 404 })

  const access = await requirePhase8Permission('calendar.manage', { departmentId: existing.calendar.departmentId })
  if (!access) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  await prisma.examCalendarHoliday.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
