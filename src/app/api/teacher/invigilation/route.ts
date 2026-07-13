import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getInvigilationDashboard } from '@/lib/phase8-scheduling'
import { requirePhase8Permission } from '@/lib/phase8-route-auth'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const departmentId = searchParams.get('departmentId') ?? undefined
  const access = await requirePhase8Permission('dashboard.read', { departmentId })
  if (!access) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const teacher = await prisma.teacherProfile.findUnique({
    where: { userId: access.session.user.id },
    select: { id: true },
  })

  const data = await getInvigilationDashboard({
    departmentId,
    teacherUserId: teacher ? access.session.user.id : undefined,
  })

  return NextResponse.json(data)
}

