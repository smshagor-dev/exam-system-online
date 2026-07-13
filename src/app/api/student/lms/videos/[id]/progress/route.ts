import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { recordPhase10VideoProgress } from '@/lib/phase10-lms'
import { phase10VideoProgressSchema } from '@/lib/phase10-validators'
import { UserRole } from '@prisma/client'

type RouteContext = { params: Promise<{ id: string }> }

export async function POST(req: NextRequest, { params }: RouteContext) {
  const session = await requireRole(UserRole.STUDENT)
  const { id } = await params
  const profile = await prisma.studentProfile.findUnique({
    where: { userId: session.user.id },
    select: { id: true },
  })
  if (!profile) return NextResponse.json({ error: 'Student profile not found' }, { status: 404 })

  const parsed = phase10VideoProgressSchema.safeParse(await req.json())
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const progress = await recordPhase10VideoProgress(id, profile.id, parsed.data)
  return NextResponse.json(progress)
}
