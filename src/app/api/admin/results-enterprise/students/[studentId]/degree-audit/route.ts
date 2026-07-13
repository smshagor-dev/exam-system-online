import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { buildPhase9DegreeAudit } from '@/lib/phase9-results'
import { requirePhase9Permission } from '@/lib/phase9-route-auth'

type RouteContext = { params: Promise<{ studentId: string }> }

export async function POST(_req: Request, { params }: RouteContext) {
  const { studentId } = await params
  const student = await prisma.studentProfile.findUnique({
    where: { id: studentId },
    select: { departmentId: true },
  })
  if (!student) return NextResponse.json({ error: 'Student not found' }, { status: 404 })

  const access = await requirePhase9Permission('graduation.manage', { departmentId: student.departmentId })
  if (!access) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const audit = await buildPhase9DegreeAudit(studentId)
  return NextResponse.json(audit, { status: 201 })
}
