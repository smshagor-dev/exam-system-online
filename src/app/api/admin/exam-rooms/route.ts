import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getPhase8DepartmentScopeWhere, requirePhase8Permission } from '@/lib/phase8-route-auth'
import { examRoomSchema } from '@/lib/phase8-validators'

export async function GET(req: NextRequest) {
  const access = await requirePhase8Permission('room.manage')
  if (!access) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const requestedDepartmentId = new URL(req.url).searchParams.get('departmentId')
  const departmentScope = await getPhase8DepartmentScopeWhere(access, requestedDepartmentId, true)

  return NextResponse.json(await prisma.examRoom.findMany({
    where: {
      campus: departmentScope,
    },
    include: {
      campus: true,
      building: true,
    },
    orderBy: [{ buildingId: 'asc' }, { code: 'asc' }],
  }))
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const parsed = examRoomSchema.safeParse({
    ...body,
    floorNumber: Number(body.floorNumber),
    capacity: Number(body.capacity),
  })
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const campus = await prisma.examCampus.findUnique({
    where: { id: parsed.data.campusId },
    select: { departmentId: true },
  })
  if (!campus) return NextResponse.json({ error: 'Campus not found' }, { status: 404 })
  const access = await requirePhase8Permission('room.manage', { departmentId: campus.departmentId, campusId: parsed.data.campusId })
  if (!access) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const room = await prisma.examRoom.create({ data: parsed.data })
  return NextResponse.json(room, { status: 201 })
}
