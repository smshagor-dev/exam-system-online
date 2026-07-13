import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePhase9Permission } from '@/lib/phase9-route-auth'
import { phase9GradeEntryBatchSchema } from '@/lib/phase9-validators'
import { upsertPhase9GradeEntries } from '@/lib/phase9-results'

type RouteContext = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: RouteContext) {
  const { id } = await params
  const gradebook = await prisma.phase9Gradebook.findUnique({
    where: { id },
    include: {
      academicOffering: {
        include: {
          subject: true,
          programSubject: true,
        },
      },
      components: {
        include: {
          entries: {
            orderBy: { createdAt: 'asc' },
          },
        },
        orderBy: { sortOrder: 'asc' },
      },
      resultRecords: {
        orderBy: { createdAt: 'asc' },
      },
    },
  })

  if (!gradebook) return NextResponse.json({ error: 'Gradebook not found' }, { status: 404 })
  const access = await requirePhase9Permission('gradebook.manage', {
    departmentId: gradebook.departmentId,
    academicOfferingId: gradebook.academicOfferingId,
    subjectId: gradebook.academicOffering.subjectId,
    languageId: gradebook.academicOffering.languageId,
    groupId: gradebook.academicOffering.groupId,
    academicYearId: gradebook.academicOffering.programYearId,
    semesterId: gradebook.academicOffering.semesterId,
  })
  if (!access) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  return NextResponse.json(gradebook)
}

export async function PATCH(req: NextRequest, { params }: RouteContext) {
  const { id } = await params
  const gradebook = await prisma.phase9Gradebook.findUnique({
    where: { id },
    include: {
      academicOffering: true,
    },
  })
  if (!gradebook) return NextResponse.json({ error: 'Gradebook not found' }, { status: 404 })

  const access = await requirePhase9Permission('gradebook.manage', {
    departmentId: gradebook.departmentId,
    academicOfferingId: gradebook.academicOfferingId,
    subjectId: gradebook.academicOffering.subjectId,
    languageId: gradebook.academicOffering.languageId,
    groupId: gradebook.academicOffering.groupId,
    academicYearId: gradebook.academicOffering.programYearId,
    semesterId: gradebook.academicOffering.semesterId,
  })
  if (!access) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  if (Array.isArray(body?.entries)) {
    const parsed = phase9GradeEntryBatchSchema.safeParse(body)
    if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
    const updatedEntries = await upsertPhase9GradeEntries(id, parsed.data.entries, access.session.user.id)
    return NextResponse.json(updatedEntries)
  }

  const updated = await prisma.phase9Gradebook.update({
    where: { id },
    data: {
      title: typeof body?.title === 'string' ? body.title : undefined,
      moderationNotes: typeof body?.moderationNotes === 'string' ? body.moderationNotes : undefined,
    },
  })

  return NextResponse.json(updated)
}
