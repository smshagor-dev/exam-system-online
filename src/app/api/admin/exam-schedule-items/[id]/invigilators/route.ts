import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePhase8Permission } from '@/lib/phase8-route-auth'
import { examInvigilatorAssignmentSchema } from '@/lib/phase8-validators'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const item = await prisma.examScheduleItem.findUnique({
    where: { id },
    select: { departmentId: true, campusId: true },
  })
  if (!item) return NextResponse.json({ error: 'Schedule item not found' }, { status: 404 })
  const access = await requirePhase8Permission('invigilator.manage', { departmentId: item.departmentId, campusId: item.campusId })
  if (!access) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const assignments = await prisma.examInvigilatorAssignment.findMany({
    where: { scheduleItemId: id },
    include: {
      teacher: {
        include: {
          user: {
            select: {
              name: true,
              email: true,
            },
          },
        },
      },
      replacementTeacher: {
        include: {
          user: {
            select: {
              name: true,
              email: true,
            },
          },
        },
      },
    },
  })
  return NextResponse.json(assignments)
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const item = await prisma.examScheduleItem.findUnique({
    where: { id },
    select: { departmentId: true, campusId: true, scheduledStart: true, scheduledEnd: true },
  })
  if (!item) return NextResponse.json({ error: 'Schedule item not found' }, { status: 404 })
  const access = await requirePhase8Permission('invigilator.manage', { departmentId: item.departmentId, campusId: item.campusId })
  if (!access) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const parsed = examInvigilatorAssignmentSchema.safeParse({
    ...body,
    scheduleItemId: id,
  })
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const startsAt = new Date(parsed.data.startsAt)
  const endsAt = new Date(parsed.data.endsAt)

  const overlapping = await prisma.examInvigilatorAssignment.findMany({
    where: {
      teacherId: parsed.data.teacherId,
      scheduleItemId: { not: id },
      OR: [
        {
          startsAt: { lt: endsAt },
          endsAt: { gt: startsAt },
        },
      ],
    },
    select: { id: true },
  })
  if (overlapping.length > 0) {
    return NextResponse.json({ error: 'Teacher has an invigilation scheduling conflict' }, { status: 409 })
  }

  const assignment = await prisma.examInvigilatorAssignment.create({
    data: {
      scheduleItemId: id,
      teacherId: parsed.data.teacherId,
      replacementTeacherId: parsed.data.replacementTeacherId,
      roleType: parsed.data.roleType,
      startsAt,
      endsAt,
      notes: parsed.data.notes ?? null,
    },
  })
  return NextResponse.json(assignment, { status: 201 })
}

