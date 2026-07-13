import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getPhase8AccessibleDepartmentIds, requirePhase8Permission } from '@/lib/phase8-route-auth'
import { detectHolidayConflict, detectScheduleConflicts } from '@/lib/phase8-scheduling'
import { examScheduleItemSchema } from '@/lib/phase8-validators'

export async function GET(req: NextRequest) {
  const access = await requirePhase8Permission('exam.schedule.manage')
  if (!access) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const requestedDepartmentId = new URL(req.url).searchParams.get('departmentId')
  const accessibleDepartmentIds = await getPhase8AccessibleDepartmentIds(access)
  const where =
    accessibleDepartmentIds === null
      ? requestedDepartmentId
        ? { departmentId: requestedDepartmentId }
        : undefined
      : {
          departmentId: {
            in: requestedDepartmentId
              ? accessibleDepartmentIds.filter((departmentId) => departmentId === requestedDepartmentId)
              : accessibleDepartmentIds,
          },
        }

  return NextResponse.json(await prisma.examScheduleItem.findMany({
    where,
    include: {
      schedulingSession: true,
      academicOffering: true,
      subject: true,
      language: true,
      group: true,
      room: true,
      invigilators: true,
    },
    orderBy: [{ scheduledStart: 'asc' }],
  }))
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const parsed = examScheduleItemSchema.safeParse({
    ...body,
    durationMinutes: Number(body.durationMinutes),
    studentCount: Number(body.studentCount),
  })
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  const access = await requirePhase8Permission('exam.schedule.manage', { departmentId: parsed.data.departmentId, campusId: parsed.data.campusId })
  if (!access) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const session = await prisma.examSchedulingSession.findUnique({
    where: { id: parsed.data.schedulingSessionId },
    select: { academicSessionId: true },
  })
  if (!session) return NextResponse.json({ error: 'Scheduling session not found' }, { status: 404 })

  const scheduledStart = new Date(parsed.data.scheduledStart)
  const scheduledEnd = new Date(parsed.data.scheduledEnd)
  const [scheduleConflicts, holidayConflict] = await Promise.all([
    detectScheduleConflicts({
      schedulingSessionId: parsed.data.schedulingSessionId,
      departmentId: parsed.data.departmentId,
      roomId: parsed.data.roomId,
      groupId: parsed.data.groupId,
      scheduledStart,
      scheduledEnd,
    }),
    detectHolidayConflict({
      academicSessionId: session.academicSessionId,
      departmentId: parsed.data.departmentId,
      campusId: parsed.data.campusId,
      scheduledStart,
      scheduledEnd,
    }),
  ])

  const created = await prisma.examScheduleItem.create({
    data: {
      ...parsed.data,
      scheduledStart,
      scheduledEnd,
      conflictFlagsJson: [
        ...(scheduleConflicts.studentGroupConflicts.length > 0 ? ['student_conflict'] : []),
        ...(scheduleConflicts.roomConflicts.length > 0 ? ['room_conflict'] : []),
        ...(holidayConflict.hasConflict ? ['holiday_conflict'] : []),
      ],
    },
  })

  return NextResponse.json(created, { status: 201 })
}
