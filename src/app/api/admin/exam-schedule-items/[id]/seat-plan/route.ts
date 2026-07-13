import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePhase8Permission } from '@/lib/phase8-route-auth'
import { generateSeatPlan } from '@/lib/phase8-scheduling'
import { examSeatPlanSchema } from '@/lib/phase8-validators'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json()
  const parsed = examSeatPlanSchema.safeParse({
    ...body,
    scheduleItemId: id,
    spacingPolicy: Number(body.spacingPolicy ?? 1),
  })
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const item = await prisma.examScheduleItem.findUnique({
    where: { id },
    select: { departmentId: true, campusId: true },
  })
  if (!item) return NextResponse.json({ error: 'Schedule item not found' }, { status: 404 })
  const access = await requirePhase8Permission('seat.manage', { departmentId: item.departmentId, campusId: item.campusId })
  if (!access) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const result = await generateSeatPlan({
    scheduleItemId: id,
    spacingPolicy: parsed.data.spacingPolicy,
    notes: parsed.data.notes ?? null,
    generatedByUserId: access.session.user.id,
  })
  return NextResponse.json(result)
}

