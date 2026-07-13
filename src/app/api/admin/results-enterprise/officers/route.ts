import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { phase9OfficerAssignmentSchema } from '@/lib/phase9-validators'
import { requirePhase9Permission } from '@/lib/phase9-route-auth'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const departmentId = searchParams.get('departmentId')?.trim() ?? undefined
  const access = await requirePhase9Permission('results.publish', { departmentId })
  if (!access) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const officers = await prisma.phase9OfficerAssignment.findMany({
    where: departmentId ? { departmentId } : undefined,
    include: {
      teacher: {
        include: {
          user: {
            select: { name: true, email: true },
          },
        },
      },
      department: true,
    },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json(officers)
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const parsed = phase9OfficerAssignmentSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const access = await requirePhase9Permission('results.publish', { departmentId: parsed.data.departmentId })
  if (!access) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const officer = await prisma.phase9OfficerAssignment.create({
    data: {
      teacherId: parsed.data.teacherId,
      departmentId: parsed.data.departmentId,
      roleType: parsed.data.roleType,
      startsAt: parsed.data.startsAt ? new Date(parsed.data.startsAt) : null,
      endsAt: parsed.data.endsAt ? new Date(parsed.data.endsAt) : null,
      isActive: parsed.data.isActive ?? true,
    },
  })

  return NextResponse.json(officer, { status: 201 })
}
