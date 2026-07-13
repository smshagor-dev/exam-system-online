import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePhase9Permission } from '@/lib/phase9-route-auth'
import { phase9ResultTransitionSchema } from '@/lib/phase9-validators'
import { transitionPhase9ResultRecord } from '@/lib/phase9-results'

type RouteContext = { params: Promise<{ id: string }> }

export async function POST(req: NextRequest, { params }: RouteContext) {
  const { id } = await params
  const record = await prisma.phase9ResultRecord.findUnique({ where: { id } })
  if (!record) return NextResponse.json({ error: 'Result record not found' }, { status: 404 })

  const body = await req.json()
  const parsed = phase9ResultTransitionSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const permission =
    parsed.data.status === 'VERIFIED'
      ? 'results.verify'
      : parsed.data.status === 'PUBLISHED'
        ? 'results.publish'
        : 'results.calculate'
  const access = await requirePhase9Permission(permission, {
    departmentId: record.departmentId,
  })
  if (!access) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const updated = await transitionPhase9ResultRecord(id, parsed.data.status, {
    userId: access.session.user.id,
    notes: parsed.data.notes ?? null,
  })
  return NextResponse.json(updated)
}
