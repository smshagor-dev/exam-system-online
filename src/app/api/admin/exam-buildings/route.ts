import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getPhase8DepartmentScopeWhere, requirePhase8Permission } from '@/lib/phase8-route-auth'
import { examBuildingSchema } from '@/lib/phase8-validators'

export async function GET(req: NextRequest) {
  const access = await requirePhase8Permission('room.manage')
  if (!access) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const requestedDepartmentId = new URL(req.url).searchParams.get('departmentId')
  const departmentScope = await getPhase8DepartmentScopeWhere(access, requestedDepartmentId, true)

  return NextResponse.json(await prisma.examBuilding.findMany({
    where: {
      campus: departmentScope,
    },
    include: {
      campus: true,
      rooms: true,
    },
    orderBy: [{ name: 'asc' }],
  }))
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const parsed = examBuildingSchema.safeParse({
    ...body,
    floors: Number(body.floors),
  })
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const campus = await prisma.examCampus.findUnique({
    where: { id: parsed.data.campusId },
    select: { departmentId: true },
  })
  if (!campus) return NextResponse.json({ error: 'Campus not found' }, { status: 404 })
  const access = await requirePhase8Permission('room.manage', { departmentId: campus.departmentId, campusId: parsed.data.campusId })
  if (!access) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const building = await prisma.examBuilding.create({ data: parsed.data })
  return NextResponse.json(building, { status: 201 })
}
