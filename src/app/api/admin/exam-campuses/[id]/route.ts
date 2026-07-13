import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePhase8Permission } from '@/lib/phase8-route-auth'
import { examCampusSchema } from '@/lib/phase8-validators'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const existing = await prisma.examCampus.findUnique({
    where: { id },
    select: { departmentId: true },
  })
  if (!existing) return NextResponse.json({ error: 'Campus not found' }, { status: 404 })
  const access = await requirePhase8Permission('room.manage', { departmentId: existing.departmentId })
  if (!access) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const body = await req.json()
  const parsed = examCampusSchema.partial().safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  const campus = await prisma.examCampus.update({ where: { id }, data: parsed.data })
  return NextResponse.json(campus)
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const existing = await prisma.examCampus.findUnique({
    where: { id },
    select: { departmentId: true },
  })
  if (!existing) return NextResponse.json({ error: 'Campus not found' }, { status: 404 })
  const access = await requirePhase8Permission('room.manage', { departmentId: existing.departmentId })
  if (!access) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  await prisma.examCampus.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}

