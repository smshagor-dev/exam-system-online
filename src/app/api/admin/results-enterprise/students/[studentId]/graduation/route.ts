import { NextRequest, NextResponse } from 'next/server'
import {
  createOrRefreshPhase9GraduationCandidate,
  transitionPhase9GraduationCandidate,
} from '@/lib/phase9-results'
import { prisma } from '@/lib/prisma'
import { requirePhase9Permission } from '@/lib/phase9-route-auth'
import { phase9GraduationTransitionSchema } from '@/lib/phase9-validators'

type RouteContext = { params: Promise<{ studentId: string }> }

export async function POST(req: NextRequest, { params }: RouteContext) {
  const { studentId } = await params
  const student = await prisma.studentProfile.findUnique({
    where: { id: studentId },
    select: { departmentId: true },
  })
  if (!student) return NextResponse.json({ error: 'Student not found' }, { status: 404 })

  const access = await requirePhase9Permission('graduation.manage', { departmentId: student.departmentId })
  if (!access) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  if (!body?.status) {
    const result = await createOrRefreshPhase9GraduationCandidate(studentId)
    return NextResponse.json(result, { status: 201 })
  }

  const parsed = phase9GraduationTransitionSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const candidate = await prisma.phase9GraduationCandidate.findFirst({
    where: { studentId },
    orderBy: { createdAt: 'desc' },
  })
  if (!candidate) return NextResponse.json({ error: 'Graduation candidate not found' }, { status: 404 })

  const updated = await transitionPhase9GraduationCandidate(
    candidate.id,
    parsed.data.status,
    access.session.user.id,
    parsed.data.notes ?? null
  )
  return NextResponse.json(updated)
}
