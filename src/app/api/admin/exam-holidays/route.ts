import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getPhase8DepartmentScopeWhere, requirePhase8Permission } from '@/lib/phase8-route-auth'
import { examHolidaySchema } from '@/lib/phase8-validators'

export async function GET(req: NextRequest) {
  const access = await requirePhase8Permission('calendar.manage')
  if (!access) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const requestedDepartmentId = new URL(req.url).searchParams.get('departmentId')
  const departmentScope = await getPhase8DepartmentScopeWhere(access, requestedDepartmentId, true)

  const holidays = await prisma.examCalendarHoliday.findMany({
    where: departmentScope,
    include: {
      calendar: true,
      department: true,
      campus: true,
    },
    orderBy: [{ startsAt: 'asc' }],
  })

  return NextResponse.json(holidays)
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const parsed = examHolidaySchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const calendar = await prisma.examAcademicCalendar.findUnique({
    where: { id: parsed.data.calendarId },
    select: { departmentId: true },
  })
  if (!calendar) return NextResponse.json({ error: 'Calendar not found' }, { status: 404 })

  const access = await requirePhase8Permission('calendar.manage', { departmentId: calendar.departmentId })
  if (!access) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const holiday = await prisma.examCalendarHoliday.create({
    data: {
      ...parsed.data,
      startsAt: new Date(parsed.data.startsAt),
      endsAt: new Date(parsed.data.endsAt),
    },
  })

  return NextResponse.json(holiday, { status: 201 })
}
