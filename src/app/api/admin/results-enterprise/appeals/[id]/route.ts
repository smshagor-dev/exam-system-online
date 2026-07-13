import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePhase9Permission } from '@/lib/phase9-route-auth'
import { phase9AppealUpdateSchema } from '@/lib/phase9-validators'
import { updatePhase9Appeal } from '@/lib/phase9-results'

type RouteContext = { params: Promise<{ id: string }> }

export async function PATCH(req: NextRequest, { params }: RouteContext) {
  const { id } = await params
  const appeal = await prisma.phase9ResultAppeal.findUnique({ where: { id } })
  if (!appeal) return NextResponse.json({ error: 'Appeal not found' }, { status: 404 })

  const body = await req.json()
  const parsed = phase9AppealUpdateSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const access = await requirePhase9Permission('appeals.manage', {
    departmentId: appeal.departmentId,
  })
  if (!access) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const updated = await updatePhase9Appeal(id, {
    ...parsed.data,
    reviewedByUserId: access.session.user.id,
  })
  return NextResponse.json(updated)
}
