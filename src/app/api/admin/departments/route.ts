import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { departmentSchema } from '@/lib/validators'
import { UserRole } from '@prisma/client'

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== UserRole.SUPER_ADMIN && session.user.role !== UserRole.DEPARTMENT_ADMIN) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const departments = await prisma.department.findMany({
    where: session.user.role === UserRole.SUPER_ADMIN ? undefined : { adminId: session.user.id },
    orderBy: { name: 'asc' },
    include: { _count: { select: { subjects: true, teachers: true, students: true } } },
  })
  return NextResponse.json(departments)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== UserRole.SUPER_ADMIN) {
    return NextResponse.json({ error: 'Only Super Admin can create departments' }, { status: 403 })
  }

  const body = await req.json()
  const parsed = departmentSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  try {
    const dept = await prisma.department.create({ data: parsed.data })
    return NextResponse.json(dept, { status: 201 })
  } catch (err: any) {
    if (err.code === 'P2002') {
      return NextResponse.json({ error: 'Department name or code already exists' }, { status: 409 })
    }
    return NextResponse.json({ error: 'Failed to create department' }, { status: 500 })
  }
}
