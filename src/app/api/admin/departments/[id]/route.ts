import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { canManageDepartment } from '@/lib/permissions'
import { prisma } from '@/lib/prisma'
import { departmentSchema } from '@/lib/validators'
import { UserRole } from '@prisma/client'

type RouteContext = { params: Promise<{ id: string }> }

export async function PATCH(req: NextRequest, { params }: RouteContext) {
  const { id } = await params
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== UserRole.SUPER_ADMIN && session.user.role !== UserRole.DEPARTMENT_ADMIN) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const allowed = await canManageDepartment({ userId: session.user.id, role: session.user.role }, id)
  if (!allowed) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const parsed = departmentSchema.partial().safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  try {
    const dept = await prisma.department.update({
      where: { id },
      data: parsed.data,
    })
    return NextResponse.json(dept)
  } catch {
    return NextResponse.json({ error: 'Failed to update' }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: RouteContext) {
  const { id } = await params
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== UserRole.SUPER_ADMIN) {
    return NextResponse.json({ error: 'Only Super Admin can delete departments' }, { status: 403 })
  }

  try {
    await prisma.department.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (err: any) {
    if (err.code === 'P2003') {
      return NextResponse.json(
        { error: 'Cannot delete: department has related data. Remove subjects and users first.' },
        { status: 409 }
      )
    }
    return NextResponse.json({ error: 'Failed to delete' }, { status: 500 })
  }
}
