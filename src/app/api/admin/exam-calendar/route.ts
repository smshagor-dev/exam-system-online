import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getPhase8DepartmentScopeWhere, requirePhase8Permission } from '@/lib/phase8-route-auth'
import { examCalendarSchema } from '@/lib/phase8-validators'

export async function GET(req: NextRequest) {
  const access = await requirePhase8Permission('calendar.manage')
  if (!access) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const requestedDepartmentId = new URL(req.url).searchParams.get('departmentId')
  const departmentScope = await getPhase8DepartmentScopeWhere(access, requestedDepartmentId, true)

  const calendars = await prisma.examAcademicCalendar.findMany({
    where: departmentScope,
    include: {
      academicSession: true,
      department: true,
      semester: true,
      campus: true,
      holidays: true,
    },
    orderBy: [{ createdAt: 'desc' }],
  })

  return NextResponse.json(calendars)
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const parsed = examCalendarSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const access = await requirePhase8Permission('calendar.manage', { departmentId: parsed.data.departmentId })
  if (!access) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const calendar = await prisma.examAcademicCalendar.create({
    data: {
      ...parsed.data,
      teachingStartsAt: new Date(parsed.data.teachingStartsAt),
      teachingEndsAt: new Date(parsed.data.teachingEndsAt),
      registrationStartsAt: new Date(parsed.data.registrationStartsAt),
      registrationEndsAt: new Date(parsed.data.registrationEndsAt),
      courseworkStartsAt: new Date(parsed.data.courseworkStartsAt),
      courseworkEndsAt: new Date(parsed.data.courseworkEndsAt),
      examinationStartsAt: new Date(parsed.data.examinationStartsAt),
      examinationEndsAt: new Date(parsed.data.examinationEndsAt),
      makeupStartsAt: parsed.data.makeupStartsAt ? new Date(parsed.data.makeupStartsAt) : null,
      makeupEndsAt: parsed.data.makeupEndsAt ? new Date(parsed.data.makeupEndsAt) : null,
      publishedAt: parsed.data.publishedAt ? new Date(parsed.data.publishedAt) : null,
    },
  })

  return NextResponse.json(calendar, { status: 201 })
}
