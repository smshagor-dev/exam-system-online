import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePhase8Permission } from '@/lib/phase8-route-auth'
import { examRoomSchema } from '@/lib/phase8-validators'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const existing = await prisma.examRoom.findUnique({
    where: { id },
    include: {
      campus: {
        select: {
          departmentId: true,
        },
      },
    },
  })
  if (!existing) return NextResponse.json({ error: 'Room not found' }, { status: 404 })

  const access = await requirePhase8Permission('room.manage', {
    departmentId: existing.campus.departmentId,
    campusId: existing.campusId,
  })
  if (!access) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const parsed = examRoomSchema
    .partial()
    .safeParse({
      ...body,
      floorNumber: body.floorNumber === undefined ? undefined : Number(body.floorNumber),
      capacity: body.capacity === undefined ? undefined : Number(body.capacity),
    })
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const room = await prisma.examRoom.update({
    where: { id },
    data: parsed.data,
  })

  await prisma.activityLog.create({
    data: {
      userId: access.session.user.id,
      action: 'phase8.room.updated',
      details: JSON.stringify({
        roomId: id,
        fields: Object.keys(parsed.data),
      }),
    },
  })

  return NextResponse.json(room)
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const existing = await prisma.examRoom.findUnique({
    where: { id },
    include: {
      campus: {
        select: {
          departmentId: true,
        },
      },
    },
  })
  if (!existing) return NextResponse.json({ error: 'Room not found' }, { status: 404 })

  const access = await requirePhase8Permission('room.manage', {
    departmentId: existing.campus.departmentId,
    campusId: existing.campusId,
  })
  if (!access) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  await prisma.examRoom.delete({ where: { id } })
  await prisma.activityLog.create({
    data: {
      userId: access.session.user.id,
      action: 'phase8.room.deleted',
      details: JSON.stringify({
        roomId: id,
      }),
    },
  })
  return NextResponse.json({ ok: true })
}
