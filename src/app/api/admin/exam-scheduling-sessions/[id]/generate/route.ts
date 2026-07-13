import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePhase8Permission } from '@/lib/phase8-route-auth'
import { generateScheduleForSession } from '@/lib/phase8-scheduling'
import { examSchedulingGenerateSchema } from '@/lib/phase8-validators'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json()
  const parsed = examSchedulingGenerateSchema.safeParse({
    ...body,
    schedulingSessionId: id,
    slotMinutes: Number(body.slotMinutes ?? 120),
    gapMinutes: Number(body.gapMinutes ?? 30),
  })
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const session = await prisma.examSchedulingSession.findUnique({
    where: { id },
    select: { departmentId: true, campusId: true, status: true },
  })
  if (!session) return NextResponse.json({ error: 'Scheduling session not found' }, { status: 404 })
  const access = await requirePhase8Permission('exam.schedule.manage', { departmentId: session.departmentId, campusId: session.campusId })
  if (!access) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  if (session.status !== 'DRAFT' && session.status !== 'SCHEDULED') {
    return NextResponse.json({ error: `Schedule generation is not allowed while session status is ${session.status}` }, { status: 409 })
  }

  const result = await generateScheduleForSession({
    schedulingSessionId: id,
    academicOfferingIds: parsed.data.academicOfferingIds,
    roomIds: parsed.data.roomIds,
    startsAt: new Date(parsed.data.startsAt),
    slotMinutes: parsed.data.slotMinutes,
    gapMinutes: parsed.data.gapMinutes,
    campusId: parsed.data.campusId,
  })

  await prisma.activityLog.create({
    data: {
      userId: access.session.user.id,
      action: 'phase8.scheduling_session.generated',
      details: JSON.stringify({
        schedulingSessionId: id,
        createdCount: result.createdCount,
      }),
    },
  })

  return NextResponse.json(result)
}
