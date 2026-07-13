import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { joinPhase10LiveClass } from '@/lib/phase10-lms'
import { phase10LiveJoinSchema } from '@/lib/phase10-validators'
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

  const parsed = phase10LiveJoinSchema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const attendance = await joinPhase10LiveClass(id, profile.id, {
    status: parsed.data.status,
    joinedAt: parsed.data.joinedAt ? new Date(parsed.data.joinedAt) : undefined,
    leftAt: parsed.data.leftAt ? new Date(parsed.data.leftAt) : undefined,
  })
  return NextResponse.json(attendance)
}
