import { NextResponse } from 'next/server'
import { calculatePhase9Gradebook } from '@/lib/phase9-results'
import { prisma } from '@/lib/prisma'
import { requirePhase9Permission } from '@/lib/phase9-route-auth'

type RouteContext = { params: Promise<{ id: string }> }

export async function POST(_req: Request, { params }: RouteContext) {
  const { id } = await params
  const gradebook = await prisma.phase9Gradebook.findUnique({
    where: { id },
    include: {
      academicOffering: true,
    },
  })
  if (!gradebook) return NextResponse.json({ error: 'Gradebook not found' }, { status: 404 })

  const access = await requirePhase9Permission('results.calculate', {
    departmentId: gradebook.departmentId,
    academicOfferingId: gradebook.academicOfferingId,
    subjectId: gradebook.academicOffering.subjectId,
    languageId: gradebook.academicOffering.languageId,
    groupId: gradebook.academicOffering.groupId,
    academicYearId: gradebook.academicOffering.programYearId,
    semesterId: gradebook.academicOffering.semesterId,
  })
  if (!access) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const result = await calculatePhase9Gradebook(id, {
    userId: access.session.user.id,
    notes: 'Calculated from admin API',
  })
  return NextResponse.json(result)
}
