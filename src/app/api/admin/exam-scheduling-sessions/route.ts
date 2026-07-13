import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getPhase8AccessibleDepartmentIds, requirePhase8Permission } from '@/lib/phase8-route-auth'
import { examSchedulingSessionSchema } from '@/lib/phase8-validators'

export async function GET(req: NextRequest) {
  const access = await requirePhase8Permission('exam.schedule.manage')
  if (!access) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const requestedDepartmentId = new URL(req.url).searchParams.get('departmentId')
  const accessibleDepartmentIds = await getPhase8AccessibleDepartmentIds(access)
  const where =
    accessibleDepartmentIds === null
      ? requestedDepartmentId
        ? { departmentId: requestedDepartmentId }
        : undefined
      : {
          departmentId: {
            in: requestedDepartmentId
              ? accessibleDepartmentIds.filter((departmentId) => departmentId === requestedDepartmentId)
              : accessibleDepartmentIds,
          },
        }

  return NextResponse.json(await prisma.examSchedulingSession.findMany({
    where,
    include: {
      academicSession: true,
      department: true,
      program: true,
      semester: true,
      campus: true,
      items: {
        include: {
          room: true,
          subject: true,
          group: true,
        },
      },
    },
    orderBy: [{ createdAt: 'desc' }],
  }))
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const parsed = examSchedulingSessionSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  const access = await requirePhase8Permission('exam.schedule.manage', { departmentId: parsed.data.departmentId, campusId: parsed.data.campusId })
  if (!access) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const session = await prisma.examSchedulingSession.create({
    data: {
      ...parsed.data,
      publishedAt: parsed.data.publishedAt ? new Date(parsed.data.publishedAt) : null,
      lockedAt: parsed.data.lockedAt ? new Date(parsed.data.lockedAt) : null,
    },
  })
  return NextResponse.json(session, { status: 201 })
}
