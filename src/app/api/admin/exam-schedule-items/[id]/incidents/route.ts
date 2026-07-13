import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePhase8Permission } from '@/lib/phase8-route-auth'
import { createIncident, notifyIncidentAcknowledged, transitionIncidentStatus } from '@/lib/phase8-scheduling'
import { examIncidentSchema } from '@/lib/phase8-validators'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const item = await prisma.examScheduleItem.findUnique({
    where: { id },
    select: { departmentId: true, campusId: true },
  })
  if (!item) return NextResponse.json({ error: 'Schedule item not found' }, { status: 404 })
  const access = await requirePhase8Permission('incident.manage', { departmentId: item.departmentId, campusId: item.campusId })
  if (!access) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  return NextResponse.json(await prisma.examIncident.findMany({
    where: { scheduleItemId: id },
    include: {
      student: {
        include: {
          user: {
            select: { name: true, email: true },
          },
        },
      },
      room: true,
    },
    orderBy: [{ createdAt: 'desc' }],
  }))
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const item = await prisma.examScheduleItem.findUnique({
    where: { id },
    select: { departmentId: true, campusId: true },
  })
  if (!item) return NextResponse.json({ error: 'Schedule item not found' }, { status: 404 })
  const access = await requirePhase8Permission('incident.manage', { departmentId: item.departmentId, campusId: item.campusId })
  if (!access) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  if (body.action === 'acknowledge' && typeof body.incidentId === 'string') {
    const incident = await notifyIncidentAcknowledged(body.incidentId, access.session.user.id)
    return NextResponse.json(incident)
  }
  if ((body.action === 'resolve' || body.action === 'escalate') && typeof body.incidentId === 'string') {
    const incident = await transitionIncidentStatus({
      incidentId: body.incidentId,
      userId: access.session.user.id,
      action: body.action,
    })
    return NextResponse.json(incident)
  }

  const parsed = examIncidentSchema.safeParse({
    ...body,
    scheduleItemId: id,
    reporterUserId: access.session.user.id,
  })
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const incident = await createIncident({
    scheduleItemId: id,
    roomId: parsed.data.roomId,
    reporterUserId: access.session.user.id,
    studentId: parsed.data.studentId,
    type: parsed.data.type,
    title: parsed.data.title,
    description: parsed.data.description,
    attachmentUrls: parsed.data.attachmentUrls ?? null,
  })

  return NextResponse.json(incident, { status: 201 })
}
