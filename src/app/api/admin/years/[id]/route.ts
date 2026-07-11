import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { isPrismaKnownError } from '@/lib/api-errors'
import { prisma } from '@/lib/prisma'
import { UserRole } from '@prisma/client'

async function requireAdmin() {
  const session = await auth()
  if (!session?.user) return null
  if (session.user.role !== UserRole.SUPER_ADMIN) return null
  return session
}

type RouteContext = { params: Promise<{ id: string }> }

export async function PATCH(req: NextRequest, { params }: RouteContext) {
  const { id } = await params
  if (!await requireAdmin()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const body = await req.json()
  try {
    return NextResponse.json(await prisma.academicYear.update({ where: { id }, data: body }))
  } catch { return NextResponse.json({ error: 'Update failed' }, { status: 500 }) }
}

export async function DELETE(_: NextRequest, { params }: RouteContext) {
  const { id } = await params
  if (!await requireAdmin()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  try {
    await prisma.academicYear.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    if (isPrismaKnownError(error) && error.code === 'P2003') return NextResponse.json({ error: 'Has related data' }, { status: 409 })
    return NextResponse.json({ error: 'Delete failed' }, { status: 500 })
  }
}
