import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getPhase8DepartmentScopeWhere, requirePhase8Permission } from '@/lib/phase8-route-auth'
import { examCampusSchema } from '@/lib/phase8-validators'

export async function GET(req: NextRequest) {
  const access = await requirePhase8Permission('room.manage')
  if (!access) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const requestedDepartmentId = new URL(req.url).searchParams.get('departmentId')
  const departmentScope = await getPhase8DepartmentScopeWhere(access, requestedDepartmentId, true)

  const campuses = await prisma.examCampus.findMany({
    where: departmentScope,
    include: {
      department: true,
      buildings: true,
      rooms: true,
    },
    orderBy: [{ name: 'asc' }],
  })

  return NextResponse.json(campuses)
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const parsed = examCampusSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const access = await requirePhase8Permission('room.manage', { departmentId: parsed.data.departmentId })
  if (!access) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const campus = await prisma.examCampus.create({
    data: parsed.data,
  })
  return NextResponse.json(campus, { status: 201 })
}
