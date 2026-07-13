import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getAdminScope } from '@/lib/admin-scope'
import { prisma } from '@/lib/prisma'

const membershipSchema = z.object({
  teacherId: z.string().cuid(),
  departmentId: z.string().cuid(),
  role: z.string().trim().max(100).optional().nullable(),
  isPrimary: z.boolean().default(false),
  startsAt: z.string().datetime().optional().nullable(),
  endsAt: z.string().datetime().optional().nullable(),
  isActive: z.boolean().default(true),
})

export async function GET(req: NextRequest) {
  const scope = await getAdminScope()
  const { searchParams } = new URL(req.url)
  const teacherId = searchParams.get('teacherId')

  const items = await prisma.teacherDepartmentMembership.findMany({
    where: {
      ...(teacherId ? { teacherId } : {}),
      ...(scope.isSuperAdmin ? {} : { departmentId: { in: scope.managedDepartmentIds } }),
    },
    include: {
      teacher: { include: { user: true } },
      department: true,
    },
    orderBy: [{ isPrimary: 'desc' }, { createdAt: 'desc' }],
  })

  return NextResponse.json({ items })
}

export async function POST(req: NextRequest) {
  const scope = await getAdminScope()
  const parsed = membershipSchema.safeParse(await req.json())
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const input = parsed.data
  if (!scope.isSuperAdmin && !scope.managedDepartmentIds.includes(input.departmentId)) {
    return NextResponse.json({ error: 'Forbidden for this department' }, { status: 403 })
  }

  const existingPrimary = input.isPrimary
    ? await prisma.teacherDepartmentMembership.findFirst({
        where: {
          teacherId: input.teacherId,
          isPrimary: true,
          isActive: true,
        },
      })
    : null

  if (existingPrimary) {
    return NextResponse.json({ error: 'Teacher already has an active primary department' }, { status: 409 })
  }

  const membership = await prisma.teacherDepartmentMembership.upsert({
    where: {
      teacherId_departmentId: {
        teacherId: input.teacherId,
        departmentId: input.departmentId,
      },
    },
    create: {
      teacherId: input.teacherId,
      departmentId: input.departmentId,
      role: input.role ?? null,
      isPrimary: input.isPrimary,
      startsAt: input.startsAt ? new Date(input.startsAt) : null,
      endsAt: input.endsAt ? new Date(input.endsAt) : null,
      isActive: input.isActive,
    },
    update: {
      role: input.role ?? null,
      isPrimary: input.isPrimary,
      startsAt: input.startsAt ? new Date(input.startsAt) : null,
      endsAt: input.endsAt ? new Date(input.endsAt) : null,
      isActive: input.isActive,
    },
    include: {
      teacher: { include: { user: true } },
      department: true,
    },
  })

  return NextResponse.json(membership, { status: 201 })
}
