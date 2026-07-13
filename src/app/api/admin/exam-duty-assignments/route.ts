import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getPhase8AccessibleDepartmentIds, requirePhase8Permission } from '@/lib/phase8-route-auth'
import { examDutyAssignmentSchema } from '@/lib/phase8-validators'

export async function GET(req: NextRequest) {
  const access = await requirePhase8Permission('invigilator.manage')
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

  return NextResponse.json(await prisma.examDutyAssignment.findMany({
    where,
    include: {
      teacher: {
        include: {
          user: {
            select: {
              name: true,
              email: true,
            },
          },
        },
      },
      department: true,
      campus: true,
    },
    orderBy: [{ createdAt: 'desc' }],
  }))
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const parsed = examDutyAssignmentSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const access = await requirePhase8Permission('invigilator.manage', { departmentId: parsed.data.departmentId, campusId: parsed.data.campusId })
  if (!access) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const duty = await prisma.examDutyAssignment.create({
    data: {
      ...parsed.data,
      startsAt: parsed.data.startsAt ? new Date(parsed.data.startsAt) : null,
      endsAt: parsed.data.endsAt ? new Date(parsed.data.endsAt) : null,
    },
  })
  return NextResponse.json(duty, { status: 201 })
}
