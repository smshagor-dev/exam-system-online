import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePhase8Permission } from '@/lib/phase8-route-auth'
import { examBuildingSchema } from '@/lib/phase8-validators'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const existing = await prisma.examBuilding.findUnique({
    where: { id },
    include: {
      campus: {
        select: {
          departmentId: true,
        },
      },
    },
  })
  if (!existing) return NextResponse.json({ error: 'Building not found' }, { status: 404 })

  const access = await requirePhase8Permission('room.manage', {
    departmentId: existing.campus.departmentId,
    campusId: existing.campusId,
  })
  if (!access) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const parsed = examBuildingSchema
    .partial()
    .safeParse({
      ...body,
      floors: body.floors === undefined ? undefined : Number(body.floors),
    })
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const building = await prisma.examBuilding.update({
    where: { id },
    data: parsed.data,
  })

  await prisma.activityLog.create({
    data: {
      userId: access.session.user.id,
      action: 'phase8.building.updated',
      details: JSON.stringify({
        buildingId: id,
        fields: Object.keys(parsed.data),
      }),
    },
  })

  return NextResponse.json(building)
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const existing = await prisma.examBuilding.findUnique({
    where: { id },
    include: {
      campus: {
        select: {
          departmentId: true,
        },
      },
    },
  })
  if (!existing) return NextResponse.json({ error: 'Building not found' }, { status: 404 })

  const access = await requirePhase8Permission('room.manage', {
    departmentId: existing.campus.departmentId,
    campusId: existing.campusId,
  })
  if (!access) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  await prisma.examBuilding.delete({ where: { id } })
  await prisma.activityLog.create({
    data: {
      userId: access.session.user.id,
      action: 'phase8.building.deleted',
      details: JSON.stringify({
        buildingId: id,
      }),
    },
  })
  return NextResponse.json({ ok: true })
}
