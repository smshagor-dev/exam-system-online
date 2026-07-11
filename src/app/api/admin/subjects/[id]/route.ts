import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { isPrismaKnownError } from '@/lib/api-errors'
import { canManageDepartment } from '@/lib/permissions'
import { prisma } from '@/lib/prisma'
import { UserRole } from '@prisma/client'

async function requireAdmin() {
  const session = await auth()
  if (!session?.user) return null
  if (session.user.role !== UserRole.SUPER_ADMIN && session.user.role !== UserRole.DEPARTMENT_ADMIN) return null
  return session
}

type RouteContext = { params: Promise<{ id: string }> }

export async function PATCH(req: NextRequest, { params }: RouteContext) {
  const { id } = await params
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const body = await req.json()
  try {
    const subject = await prisma.subject.findUnique({ where: { id }, select: { departmentId: true } })
    if (!subject) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const allowed = await canManageDepartment({ userId: session.user.id, role: session.user.role }, subject.departmentId)
    if (!allowed) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    const item = await prisma.subject.update({ where: { id }, data: body })
    return NextResponse.json(item)
  } catch { return NextResponse.json({ error: 'Update failed' }, { status: 500 }) }
}

export async function DELETE(_req: NextRequest, { params }: RouteContext) {
  const { id } = await params
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  try {
    const subject = await prisma.subject.findUnique({ where: { id }, select: { departmentId: true } })
    if (!subject) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const allowed = await canManageDepartment({ userId: session.user.id, role: session.user.role }, subject.departmentId)
    if (!allowed) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    await prisma.subject.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    if (isPrismaKnownError(error) && error.code === 'P2003') return NextResponse.json({ error: 'Has related data' }, { status: 409 })
    return NextResponse.json({ error: 'Delete failed' }, { status: 500 })
  }
}
